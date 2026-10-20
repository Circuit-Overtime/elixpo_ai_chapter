//! Approval-gated, one-shot script execution in a disposable directory.

use std::ffi::OsString;
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use serde_json::{Value, json};

use crate::bounded_text;

const RUN_DISPOSABLE: &str = "run_disposable";
const POLL_INTERVAL: Duration = Duration::from_millis(10);

/// Limits and interpreter for an ephemeral script tool.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisposableToolConfig {
    pub program: PathBuf,
    pub arguments: Vec<OsString>,
    pub path: Option<OsString>,
    pub timeout: Duration,
    pub max_script_bytes: usize,
    pub max_input_bytes: usize,
    pub max_output_bytes: usize,
}

/// Registers `run_disposable`, whose temporary directory is removed after every call.
///
/// The tool never applies files back to the workspace. It is still process execution,
/// so Crumb's trusted approval broker must authorize every unconfigured call.
///
/// # Errors
///
/// Returns an error when the workspace, interpreter, or limits are invalid.
pub fn register_disposable_tool(
    host: &mut ToolHost,
    workspace: &Path,
    config: DisposableToolConfig,
) -> Result<()> {
    if !config.program.is_absolute() {
        bail!("disposable tool program must be absolute");
    }
    if config.timeout.is_zero()
        || config.max_script_bytes == 0
        || config.max_input_bytes == 0
        || config.max_output_bytes == 0
    {
        bail!("disposable tool limits must be positive");
    }
    let workspace = std::fs::canonicalize(workspace)
        .with_context(|| format!("failed to resolve workspace `{}`", workspace.display()))?;
    if !workspace.is_dir() {
        bail!("disposable tool workspace must be a directory");
    }
    host.register(descriptor(), Arc::new(DisposableTool { workspace, config }))
}

struct DisposableTool {
    workspace: PathBuf,
    config: DisposableToolConfig,
}

impl ToolHandler for DisposableTool {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        match run_disposable(&self.workspace, &self.config, arguments, cancellation) {
            Ok(output) => Ok(output),
            Err(error) if cancellation.is_cancelled() => Err(error),
            Err(error) => Ok(ToolOutput::error(error.to_string())),
        }
    }
}

fn run_disposable(
    workspace: &Path,
    config: &DisposableToolConfig,
    arguments: &Value,
    cancellation: &CancellationToken,
) -> Result<ToolOutput> {
    ensure_active(cancellation)?;
    let script = arguments
        .get("script")
        .and_then(Value::as_str)
        .context("script must be a string")?;
    if script.trim().is_empty() {
        bail!("script cannot be empty");
    }
    if script.len() > config.max_script_bytes {
        bail!("script exceeds the configured byte limit");
    }
    let timeout = requested_timeout(arguments, config.timeout)?;
    let directory = tempfile::Builder::new()
        .prefix("crumb-tool-")
        .tempdir()
        .context("failed to create disposable directory")?;
    stage_inputs(
        workspace,
        directory.path(),
        arguments.get("inputs"),
        config.max_input_bytes,
    )?;
    ensure_active(cancellation)?;

    let mut command = Command::new(&config.program);
    command
        .args(&config.arguments)
        .arg(script)
        .current_dir(directory.path())
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(path) = &config.path {
        command.env("PATH", path);
    }
    configure_process_group(&mut command);
    let mut child = command.spawn().context("failed to start disposable tool")?;
    let stdout = capture(
        child
            .stdout
            .take()
            .context("disposable stdout unavailable")?,
        config.max_output_bytes,
    );
    let stderr = capture(
        child
            .stderr
            .take()
            .context("disposable stderr unavailable")?,
        config.max_output_bytes,
    );
    let outcome = wait_for_process(&mut child, timeout, cancellation)?;
    let stdout = join_capture(stdout)?;
    let stderr = join_capture(stderr)?;
    render_result(&outcome, &stdout, &stderr, config.max_output_bytes)
}

fn stage_inputs(
    workspace: &Path,
    destination: &Path,
    inputs: Option<&Value>,
    byte_limit: usize,
) -> Result<()> {
    let Some(inputs) = inputs else {
        return Ok(());
    };
    let inputs = inputs.as_array().context("inputs must be an array")?;
    let mut total = 0_u64;
    for input in inputs {
        let relative = input.as_str().context("each input must be a string")?;
        let relative = validate_relative_path(relative)?;
        let source = std::fs::canonicalize(workspace.join(&relative))
            .with_context(|| format!("failed to resolve input `{}`", relative.display()))?;
        if !source.starts_with(workspace) || !source.is_file() {
            bail!("input `{}` is not a workspace file", relative.display());
        }
        total = total.saturating_add(std::fs::metadata(&source)?.len());
        if total > u64::try_from(byte_limit).unwrap_or(u64::MAX) {
            bail!("disposable inputs exceed the configured byte limit");
        }
        let target = destination.join(&relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&source, &target)
            .with_context(|| format!("failed to stage input `{}`", relative.display()))?;
    }
    Ok(())
}

fn validate_relative_path(value: &str) -> Result<PathBuf> {
    let path = Path::new(value);
    if value.is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!("input paths must be normalized workspace-relative files");
    }
    Ok(path.to_path_buf())
}

fn requested_timeout(arguments: &Value, ceiling: Duration) -> Result<Duration> {
    let Some(seconds) = arguments.get("timeout_seconds") else {
        return Ok(ceiling);
    };
    let seconds = seconds
        .as_u64()
        .context("timeout_seconds must be a positive integer")?;
    if seconds == 0 {
        bail!("timeout_seconds must be positive");
    }
    Ok(Duration::from_secs(seconds).min(ceiling))
}

enum ProcessOutcome {
    Cancelled,
    TimedOut,
    Exited(ExitStatus),
}

fn wait_for_process(
    child: &mut Child,
    timeout: Duration,
    cancellation: &CancellationToken,
) -> Result<ProcessOutcome> {
    let started = Instant::now();
    loop {
        if cancellation.is_cancelled() {
            terminate(child);
            child.wait().context("failed to reap disposable tool")?;
            return Ok(ProcessOutcome::Cancelled);
        }
        if started.elapsed() >= timeout {
            terminate(child);
            child.wait().context("failed to reap disposable tool")?;
            return Ok(ProcessOutcome::TimedOut);
        }
        if let Some(status) = child
            .try_wait()
            .context("failed to inspect disposable tool")?
        {
            return Ok(ProcessOutcome::Exited(status));
        }
        thread::sleep(POLL_INTERVAL);
    }
}

struct CapturedStream {
    bytes: Vec<u8>,
    truncated: bool,
}

fn capture(
    mut reader: impl Read + Send + 'static,
    limit: usize,
) -> JoinHandle<io::Result<CapturedStream>> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut truncated = false;
        let mut buffer = [0_u8; 8192];
        loop {
            let read = reader.read(&mut buffer)?;
            if read == 0 {
                return Ok(CapturedStream { bytes, truncated });
            }
            let remaining = limit.saturating_sub(bytes.len());
            bytes.extend_from_slice(&buffer[..read.min(remaining)]);
            truncated |= read > remaining;
        }
    })
}

fn join_capture(reader: JoinHandle<io::Result<CapturedStream>>) -> Result<CapturedStream> {
    reader
        .join()
        .map_err(|_| anyhow::anyhow!("disposable output reader panicked"))?
        .context("failed to read disposable output")
}

fn render_result(
    outcome: &ProcessOutcome,
    stdout: &CapturedStream,
    stderr: &CapturedStream,
    limit: usize,
) -> Result<ToolOutput> {
    if matches!(outcome, ProcessOutcome::Cancelled) {
        bail!("tool call cancelled");
    }
    let (status, failed) = match outcome {
        ProcessOutcome::Cancelled => unreachable!(),
        ProcessOutcome::TimedOut => ("timed_out".to_owned(), true),
        ProcessOutcome::Exited(status) => (
            status
                .code()
                .map_or_else(|| "signal".to_owned(), |code| code.to_string()),
            !status.success(),
        ),
    };
    let marker = |stream: &CapturedStream| if stream.truncated { " (truncated)" } else { "" };
    let text = bounded_text(
        format!(
            "exit: {status}\nstdout{}:\n{}\nstderr{}:\n{}",
            marker(stdout),
            String::from_utf8_lossy(&stdout.bytes),
            marker(stderr),
            String::from_utf8_lossy(&stderr.bytes)
        ),
        limit,
    );
    Ok(ToolOutput {
        text,
        structured: Some(json!({"exit": status, "ephemeral": true})),
        is_error: failed,
    })
}

fn ensure_active(cancellation: &CancellationToken) -> Result<()> {
    if cancellation.is_cancelled() {
        bail!("tool call cancelled");
    }
    Ok(())
}

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(not(unix))]
fn configure_process_group(_command: &mut Command) {}

#[cfg(unix)]
fn terminate(child: &mut Child) {
    use rustix::process::{Pid, Signal, kill_process_group};
    let pid = i32::try_from(child.id()).ok().and_then(Pid::from_raw);
    if pid.is_none_or(|pid| kill_process_group(pid, Signal::KILL).is_err()) {
        let _ = child.kill();
    }
}

#[cfg(not(unix))]
fn terminate(child: &mut Child) {
    let _ = child.kill();
}

fn descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: RUN_DISPOSABLE.to_owned(),
        description: "Run a one-shot script in a fresh temporary directory. Selected workspace files may be copied in; changes are discarded and never applied back.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "script": {"type": "string", "minLength": 1},
                "inputs": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Normalized workspace-relative files copied into the disposable directory."
                },
                "timeout_seconds": {"type": "integer", "minimum": 1}
            },
            "required": ["script"],
            "additionalProperties": false
        }),
        risk: RiskClass::ProcessExecution,
        transport: ToolTransport::Native,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::ffi::OsString;
    use std::fs;
    use std::path::Path;
    use std::time::Duration;

    use crumb_agent::{
        AgentMode, CancellationToken, ConfiguredApprovals, DenyAllApprovals, ToolCallErrorKind,
        ToolHost,
    };
    use serde_json::json;
    use tempfile::TempDir;

    use super::{DisposableToolConfig, register_disposable_tool};

    fn host(workspace: &Path) -> ToolHost {
        let mut host = ToolHost::default();
        register_disposable_tool(
            &mut host,
            workspace,
            DisposableToolConfig {
                program: "/bin/sh".into(),
                arguments: vec![OsString::from("-c")],
                path: Some(OsString::from("/usr/bin:/bin")),
                timeout: Duration::from_secs(2),
                max_script_bytes: 4096,
                max_input_bytes: 4096,
                max_output_bytes: 4096,
            },
        )
        .expect("tool registers");
        host
    }

    fn approvals() -> ConfiguredApprovals {
        ConfiguredApprovals::default()
            .with_process_tools(BTreeSet::from(["run_disposable".to_owned()]))
    }

    #[cfg(unix)]
    #[test]
    fn stages_inputs_and_discards_changes() {
        let workspace = TempDir::new().expect("workspace");
        fs::write(workspace.path().join("input.txt"), "hello").expect("fixture");
        let output = host(workspace.path())
            .call(
                "run_disposable",
                &json!({"script":"cat input.txt; printf changed > input.txt", "inputs":["input.txt"]}),
                AgentMode::Auto,
                &approvals(),
                &CancellationToken::default(),
            )
            .expect("tool succeeds");
        assert!(output.text.contains("hello"));
        assert_eq!(
            fs::read_to_string(workspace.path().join("input.txt")).unwrap(),
            "hello"
        );
    }

    #[cfg(unix)]
    #[test]
    fn requires_process_approval() {
        let workspace = TempDir::new().expect("workspace");
        let error = host(workspace.path())
            .call(
                "run_disposable",
                &json!({"script":"true"}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
            )
            .expect_err("approval is required");
        assert_eq!(error.kind, ToolCallErrorKind::Denied);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_paths_outside_the_workspace() {
        let workspace = TempDir::new().expect("workspace");
        let output = host(workspace.path())
            .call(
                "run_disposable",
                &json!({"script":"true", "inputs":["../secret"]}),
                AgentMode::Auto,
                &approvals(),
                &CancellationToken::default(),
            )
            .expect("handler errors are returned safely");
        assert!(output.is_error);
        assert!(output.text.contains("normalized workspace-relative"));
    }
}
