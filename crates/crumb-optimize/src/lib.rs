//! Optional, deterministic token optimization for agent-bound output.
//!
//! Native terminal output never passes through this crate. Inputs are redacted
//! before an external optimizer can observe them, and every failure falls back
//! to bounded, locally filtered bytes.

use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use crumb_agent::{OptimizerConfig, OutputKind, StructuredEncoding, TokenOptimizer};
use crumb_core::redact_sensitive_text;

const POLL_INTERVAL: Duration = Duration::from_millis(10);

/// Result of optimizing one already-captured agent payload.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OptimizationResult {
    pub bytes: Vec<u8>,
    pub input_bytes: usize,
    pub output_bytes: usize,
    pub saved_bytes: usize,
    pub redacted_lines: usize,
    pub optimizer: Option<String>,
}

/// Measured choice between JSON and an externally produced TOON candidate.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EncodingDecision {
    pub encoding: StructuredEncoding,
    pub input_bytes: usize,
    pub output_bytes: usize,
    pub saved_bytes: usize,
}

/// Applies redaction, local filtering, optional external optimization, and a
/// hard byte ceiling in that order.
pub struct OptimizationPipeline {
    optimizers: Vec<Box<dyn TokenOptimizer>>,
}

impl OptimizationPipeline {
    #[must_use]
    pub const fn new(optimizers: Vec<Box<dyn TokenOptimizer>>) -> Self {
        Self { optimizers }
    }

    /// Optimizes output intended for an agent, never the user's native terminal.
    #[must_use]
    pub fn optimize(&self, kind: OutputKind, input: &[u8], budget: usize) -> OptimizationResult {
        let input_bytes = input.len();
        if budget == 0 {
            return OptimizationResult {
                bytes: Vec::new(),
                input_bytes,
                output_bytes: 0,
                saved_bytes: input_bytes,
                redacted_lines: 0,
                optimizer: None,
            };
        }
        let Ok(text) = std::str::from_utf8(input) else {
            let bytes = clip_bytes(input, budget, kind);
            return report(bytes, input_bytes, 0, None);
        };
        let (redacted, redacted_lines) = redact(text);
        let filtered = native_filter(kind, &redacted);
        let mut selected = filtered.as_bytes().to_vec();
        let mut optimizer = None;
        for candidate in &self.optimizers {
            if !candidate.available() {
                continue;
            }
            let Ok(output) = candidate.optimize(kind, &selected, budget) else {
                continue;
            };
            if !output.is_empty()
                && output.len() < selected.len()
                && preserves_diagnostics(&selected, &output)
            {
                selected = output;
                optimizer = Some(candidate.name().to_owned());
                break;
            }
        }
        let bytes = clip_bytes(&selected, budget, kind);
        report(bytes, input_bytes, redacted_lines, optimizer)
    }
}

fn preserves_diagnostics(input: &[u8], output: &[u8]) -> bool {
    let (Ok(input), Ok(output)) = (std::str::from_utf8(input), std::str::from_utf8(output)) else {
        return false;
    };
    input
        .lines()
        .filter(|line| is_diagnostic(line))
        .all(|line| output.contains(line))
}

/// Optional `rtk pipe` adapter. Availability checks do not spawn a process.
pub struct RtkOptimizer {
    command: PathBuf,
    arguments: Vec<OsString>,
    timeout: Duration,
}

impl RtkOptimizer {
    /// Creates a bounded RTK adapter.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty command or zero timeout.
    pub fn new(command: PathBuf, arguments: Vec<OsString>, timeout: Duration) -> Result<Self> {
        if command.as_os_str().is_empty() {
            bail!("RTK optimizer command cannot be empty");
        }
        if timeout.is_zero() {
            bail!("RTK optimizer timeout must be positive");
        }
        Ok(Self {
            command,
            arguments,
            timeout,
        })
    }

    /// Builds an enabled RTK adapter from live configuration.
    #[must_use]
    pub fn from_config(config: &OptimizerConfig, timeout: Duration) -> Option<Self> {
        if !config.enabled || !config.id.eq_ignore_ascii_case("rtk") {
            return None;
        }
        Self::new(
            config.command.clone(),
            config.arguments.iter().map(OsString::from).collect(),
            timeout,
        )
        .ok()
    }
}

impl TokenOptimizer for RtkOptimizer {
    fn name(&self) -> &'static str {
        "rtk"
    }

    fn available(&self) -> bool {
        resolve_executable(&self.command).is_some()
    }

    fn optimize(&self, kind: OutputKind, input: &[u8], budget: usize) -> Result<Vec<u8>> {
        if kind == OutputKind::Generic {
            bail!("RTK has no lossless filter for generic command output");
        }
        let executable = resolve_executable(&self.command).context("RTK is unavailable")?;
        let mut process = Command::new(executable);
        process
            .args(&self.arguments)
            .args(["pipe", "--filter", rtk_filter(kind)])
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        copy_runtime_path(&mut process);
        let mut child = process.spawn().context("failed to start RTK optimizer")?;
        let mut stdin = child.stdin.take().context("RTK stdin is unavailable")?;
        let payload = input.to_vec();
        let input_writer = thread::spawn(move || stdin.write_all(&payload));
        let stdout = child.stdout.take().context("RTK stdout is unavailable")?;
        let output_limit = u64::try_from(budget).unwrap_or(u64::MAX).saturating_add(1);
        let output_reader = thread::spawn(move || {
            let mut output = Vec::new();
            stdout
                .take(output_limit)
                .read_to_end(&mut output)
                .map(|_| output)
        });
        let started = Instant::now();
        let status = loop {
            if started.elapsed() >= self.timeout {
                let _ = child.kill();
                child.wait().context("failed to reap timed-out RTK")?;
                bail!("RTK optimizer timed out");
            }
            if let Some(status) = child
                .try_wait()
                .context("failed to inspect RTK optimizer")?
            {
                break status;
            }
            thread::sleep(POLL_INTERVAL);
        };
        input_writer
            .join()
            .map_err(|_| anyhow::anyhow!("RTK input writer panicked"))?
            .context("failed to send redacted output to RTK")?;
        let output = output_reader
            .join()
            .map_err(|_| anyhow::anyhow!("RTK output reader panicked"))?
            .context("failed to read RTK output")?;
        if !status.success() {
            bail!("RTK optimizer exited unsuccessfully");
        }
        Ok(clip_bytes(&output, budget, kind))
    }
}

/// Selects TOON only when its decoded value was verified equivalent and its
/// encoded byte size is strictly smaller than JSON.
#[must_use]
pub fn choose_structured_encoding(
    configured: StructuredEncoding,
    json: &[u8],
    toon: Option<&[u8]>,
    round_trip_equal: bool,
) -> EncodingDecision {
    let toon = toon.filter(|candidate| round_trip_equal && candidate.len() < json.len());
    let use_toon = !matches!(configured, StructuredEncoding::Json) && toon.is_some();
    let output_bytes = if use_toon {
        toon.map_or(json.len(), <[u8]>::len)
    } else {
        json.len()
    };
    EncodingDecision {
        encoding: if use_toon {
            StructuredEncoding::Toon
        } else {
            StructuredEncoding::Json
        },
        input_bytes: json.len(),
        output_bytes,
        saved_bytes: json.len().saturating_sub(output_bytes),
    }
}

fn native_filter(kind: OutputKind, input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut previous = "";
    for line in input.lines() {
        let diagnostic = is_diagnostic(line);
        let progress = matches!(
            kind,
            OutputKind::Cargo | OutputKind::PackageInstall | OutputKind::Test
        ) && is_progress(line);
        if line == previous && (!diagnostic || progress) {
            continue;
        }
        output.push_str(line);
        output.push('\n');
        previous = line;
    }
    output
}

fn redact(input: &str) -> (String, usize) {
    redact_sensitive_text(input)
}

fn is_diagnostic(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    ["error", "failed", "failure", "panic", "warning"]
        .iter()
        .any(|marker| lower.contains(marker))
}

fn is_progress(line: &str) -> bool {
    let trimmed = line.trim_start();
    trimmed.starts_with("Compiling ")
        || trimmed.starts_with("Checking ")
        || trimmed.starts_with("Downloading ")
}

fn report(
    bytes: Vec<u8>,
    input_bytes: usize,
    redacted_lines: usize,
    optimizer: Option<String>,
) -> OptimizationResult {
    let output_bytes = bytes.len();
    OptimizationResult {
        bytes,
        input_bytes,
        output_bytes,
        saved_bytes: input_bytes.saturating_sub(output_bytes),
        redacted_lines,
        optimizer,
    }
}

fn clip_bytes(input: &[u8], budget: usize, kind: OutputKind) -> Vec<u8> {
    const MARKER: &[u8] = b"\n[output clipped]\n";

    if input.len() <= budget {
        return input.to_vec();
    }
    let Ok(text) = std::str::from_utf8(input) else {
        return input[..budget].to_vec();
    };
    if budget <= MARKER.len() {
        return input[..budget].to_vec();
    }
    let content_budget = budget - MARKER.len();
    let tail_bytes = if matches!(
        kind,
        OutputKind::Cargo | OutputKind::PackageInstall | OutputKind::Test
    ) {
        content_budget.saturating_mul(2) / 3
    } else {
        content_budget / 3
    };
    let mut head_end = content_budget - tail_bytes;
    while !text.is_char_boundary(head_end) {
        head_end -= 1;
    }
    let mut tail_start = input.len() - tail_bytes;
    while !text.is_char_boundary(tail_start) {
        tail_start += 1;
    }
    let mut output = Vec::with_capacity(budget);
    output.extend_from_slice(&input[..head_end]);
    output.extend_from_slice(MARKER);
    output.extend_from_slice(&input[tail_start..]);
    output
}

fn rtk_filter(kind: OutputKind) -> &'static str {
    match kind {
        OutputKind::Cargo | OutputKind::Test => "cargo-test",
        OutputKind::GitDiff => "git-diff",
        OutputKind::PackageInstall => "npm",
        OutputKind::Generic => "log",
    }
}

fn resolve_executable(command: &Path) -> Option<PathBuf> {
    if command.is_absolute() || command.components().count() > 1 {
        return command.is_file().then(|| command.to_path_buf());
    }
    std::env::var_os("PATH").and_then(|path| {
        std::env::split_paths(&path)
            .map(|directory| directory.join(command))
            .find(|candidate| candidate.is_file())
    })
}

fn copy_runtime_path(command: &mut Command) {
    if let Some(path) = std::env::var_os("PATH") {
        command.env("PATH", path);
    }
    #[cfg(windows)]
    if let Some(system_root) = std::env::var_os("SystemRoot") {
        command.env("SystemRoot", system_root);
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use anyhow::Result;

    use super::*;

    struct FixtureOptimizer {
        observed: Arc<Mutex<Vec<u8>>>,
    }

    impl TokenOptimizer for FixtureOptimizer {
        fn name(&self) -> &'static str {
            "fixture"
        }

        fn available(&self) -> bool {
            true
        }

        fn optimize(&self, _kind: OutputKind, input: &[u8], _budget: usize) -> Result<Vec<u8>> {
            *self.observed.lock().expect("observation lock") = input.to_vec();
            Ok(b"short".to_vec())
        }
    }

    #[test]
    fn external_optimizer_receives_only_redacted_output() {
        let observed = Arc::new(Mutex::new(Vec::new()));
        let optimizer = FixtureOptimizer {
            observed: Arc::clone(&observed),
        };
        let pipeline = OptimizationPipeline::new(vec![Box::new(optimizer)]);
        let result = pipeline.optimize(
            OutputKind::Generic,
            b"hello\nAuthorization: Bearer secret\nworld\n",
            128,
        );
        assert_eq!(result.bytes, b"short");
        assert_eq!(result.redacted_lines, 1);
        assert_eq!(result.optimizer.as_deref(), Some("fixture"));
        let observed = String::from_utf8(observed.lock().expect("observation lock").clone())
            .expect("optimizer input is UTF-8");
        assert!(!observed.contains("Bearer secret"));
        assert!(observed.contains("[sensitive output redacted]"));
    }

    #[test]
    fn external_optimizer_cannot_drop_critical_diagnostics() {
        let optimizer = FixtureOptimizer {
            observed: Arc::new(Mutex::new(Vec::new())),
        };
        let pipeline = OptimizationPipeline::new(vec![Box::new(optimizer)]);
        let input = b"progress progress progress\nerror: compilation failed\n";
        let result = pipeline.optimize(OutputKind::Cargo, input, 1024);

        assert!(String::from_utf8_lossy(&result.bytes).contains("error: compilation failed"));
        assert_eq!(result.optimizer, None);
    }

    #[test]
    fn rtk_does_not_treat_generic_command_output_as_logs() {
        let optimizer = RtkOptimizer::new(PathBuf::from("rtk"), Vec::new(), Duration::from_secs(1))
            .expect("optimizer config is valid");

        assert!(
            optimizer
                .optimize(OutputKind::Generic, b"folder-a\nfolder-b\n", 128)
                .is_err()
        );
    }

    #[test]
    fn native_filter_preserves_repeated_diagnostics() {
        let result = OptimizationPipeline::new(Vec::new()).optimize(
            OutputKind::Test,
            b"Checking crate\nChecking crate\nerror: broken\nerror: broken\n",
            128,
        );
        assert_eq!(
            String::from_utf8(result.bytes).expect("UTF-8 output"),
            "Checking crate\nerror: broken\nerror: broken\n"
        );
    }

    #[test]
    fn binary_output_skips_external_processing() {
        let result = OptimizationPipeline::new(Vec::new()).optimize(
            OutputKind::Generic,
            &[0xff, 0x00, 0x01],
            2,
        );
        assert_eq!(result.bytes, [0xff, 0x00]);
    }

    #[test]
    fn toon_requires_round_trip_and_measured_savings() {
        let json = br#"{"items":[{"id":1},{"id":2}]}"#;
        let shorter = b"items[2]{id}:\n1\n2";
        assert_eq!(
            choose_structured_encoding(StructuredEncoding::Auto, json, Some(shorter), true)
                .encoding,
            StructuredEncoding::Toon
        );
        assert_eq!(
            choose_structured_encoding(StructuredEncoding::Auto, json, Some(shorter), false)
                .encoding,
            StructuredEncoding::Json
        );
    }
}
