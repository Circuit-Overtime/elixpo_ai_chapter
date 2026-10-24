use std::ffi::OsString;
use std::fmt::Write as _;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime};

use anyhow::{Context, Result, bail};
use crumb_agent::{
    CancellationToken, OutputKind, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput,
    ToolTransport,
};
use crumb_core::{UndoLedger, redact_sensitive_text};
use crumb_optimize::{OptimizationPipeline, OptimizationResult};
use serde_json::{Value, json};

use crate::bounded_text;

const RUN_SHELL: &str = "run_shell";
const POLL_INTERVAL: Duration = Duration::from_millis(10);

/// Launch and runtime limits for the isolated agent shell.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentShellConfig {
    pub program: PathBuf,
    pub arguments: Vec<OsString>,
    pub path: Option<OsString>,
    /// Optional local command proxy used to rewrite supported commands before
    /// approval and execution (for example, `rtk rewrite`).
    pub command_rewriter: Option<PathBuf>,
    /// Preserve the launching terminal's environment for explicitly selected
    /// full-access sessions. Safer permission modes keep the isolated
    /// PATH-only environment.
    pub inherit_environment: bool,
    pub max_output_bytes: usize,
    pub timeout: Duration,
}
/// Snapshot of the most recent failed `run_shell` invocation, for read-only
/// diagnosis by `diagnose_last_failure`.
#[derive(Clone, Debug)]
struct LastFailure {
    command: String,
    exit_status: String,
    stdout_tail: String,
    stderr_tail: String,
    modified_files: Vec<PathBuf>,
    modified_files_truncated: bool,
}
/// Registers an approval-gated shell tool rooted at one canonical workspace.
///
/// The program receives the model-proposed command as its final argument. Its
/// inherited environment is cleared; only the configured `PATH` is restored.
///
/// # Errors
///
/// Returns an error when the workspace, executable, or runtime limits are
/// invalid, or when the tool name is already registered.
pub fn register_shell_tool(
    host: &mut ToolHost,
    workspace: &Path,
    config: AgentShellConfig,
) -> Result<()> {
    register_shell_tool_inner(host, workspace, config, None)
}

/// Registers the isolated shell with an agent-output optimization pipeline.
///
/// Native interactive output never reaches this pipeline.
///
/// # Errors
///
/// Returns the same validation and registration errors as
/// [`register_shell_tool`].
pub fn register_shell_tool_with_optimizer(
    host: &mut ToolHost,
    workspace: &Path,
    config: AgentShellConfig,
    optimizer: Arc<OptimizationPipeline>,
) -> Result<()> {
    register_shell_tool_inner(host, workspace, config, Some(optimizer))
}

fn register_shell_tool_inner(
    host: &mut ToolHost,
    workspace: &Path,
    config: AgentShellConfig,
    optimizer: Option<Arc<OptimizationPipeline>>,
) -> Result<()> {
    if !config.program.is_absolute() {
        bail!("agent shell program must be an absolute path");
    }
    if config.max_output_bytes == 0 {
        bail!("agent shell output limit must be positive");
    }
    if config.timeout.is_zero() {
        bail!("agent shell timeout must be positive");
    }
    let workspace = std::fs::canonicalize(workspace)
        .with_context(|| format!("failed to resolve workspace `{}`", workspace.display()))?;
    if !workspace.is_dir() {
        bail!("agent shell workspace must be a directory");
    }
    let capacity = std::num::NonZeroUsize::new(UNDO_LEDGER_CAPACITY)
        .expect("UNDO_LEDGER_CAPACITY is a nonzero constant");
    let shell_tool = Arc::new(ShellTool {
        workspace,
        config,
        optimizer,
        ledger: Mutex::new(UndoLedger::new(capacity)),
        last_failure: Mutex::new(None),
    });
    host.register(descriptor(), shell_tool.clone())?;
    host.register(
        diagnose_descriptor(),
        Arc::new(DiagnoseLastFailureTool { shell: shell_tool }),
    )?;
    Ok(())
}
const UNDO_LEDGER_CAPACITY: usize = 50;

struct ShellTool {
    workspace: PathBuf,
    config: AgentShellConfig,
    optimizer: Option<Arc<OptimizationPipeline>>,
    ledger: Mutex<UndoLedger>,
    last_failure: Mutex<Option<LastFailure>>,
}

impl ToolHandler for ShellTool {
    fn prepare(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<Value> {
        Ok(rewrite_arguments(
            &self.workspace,
            &self.config,
            arguments,
            cancellation,
        ))
    }

    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        let command_text = arguments
            .get("command")
            .and_then(Value::as_str)
            .map(str::to_owned);
        match run_shell(
            &self.workspace,
            &self.config,
            self.optimizer.as_deref(),
            arguments,
            cancellation,
        ) {
            Ok(result) => {
                if let Some(command) = &command_text {
                    if result.output.is_error {
                        self.record_failure(command, &result);
                    } else if let Ok(mut ledger) = self.ledger.lock() {
                        ledger.record(command);
                    }
                }
                Ok(result.output)
            }
            Err(error) if cancellation.is_cancelled() => Err(error),
            Err(error) => Ok(ToolOutput::error(error.to_string())),
        }
    }
}

fn rewrite_arguments(
    workspace: &Path,
    config: &AgentShellConfig,
    arguments: &Value,
    cancellation: &CancellationToken,
) -> Value {
    let Some(command) = arguments.get("command").and_then(Value::as_str) else {
        return arguments.clone();
    };
    let normalized = normalize_shell_command(command);
    let mut prepared = arguments.clone();
    if normalized != command {
        prepared["command"] = Value::String(normalized.clone());
    }
    let Some(rewriter) = config.command_rewriter.as_ref() else {
        return prepared;
    };
    if cancellation.is_cancelled() {
        return prepared;
    }
    let mut process = Command::new(rewriter);
    process
        .args(["rewrite", &normalized])
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if !config.inherit_environment {
        process.env_clear();
    }
    if let Some(path) = &config.path {
        process.env("PATH", path);
    }
    let Ok(output) = process.output() else {
        return prepared;
    };
    let Some(rewritten) = accepted_rewrite(&normalized, &output.stdout) else {
        return prepared;
    };
    prepared["command"] = Value::String(rewritten);
    prepared
}

fn normalize_shell_command(command: &str) -> String {
    let trimmed = command.trim();
    if let Some(expression) = trimmed.strip_prefix("find -") {
        return format!("find . -{expression}");
    }
    command.to_owned()
}

fn accepted_rewrite(original: &str, output: &[u8]) -> Option<String> {
    const MAX_REWRITE_BYTES: usize = 4 * 1024;
    if output.len() > MAX_REWRITE_BYTES {
        return None;
    }
    let rewritten = std::str::from_utf8(output).ok()?.trim();
    if rewritten.is_empty()
        || rewritten == original.trim()
        || rewritten.contains(['\n', '\r', '\0'])
    {
        return None;
    }
    Some(rewritten.to_owned())
}

impl ShellTool {
    fn record_failure(&self, command: &str, result: &ShellRunResult) {
        const MAX_MODIFIED_FILES: usize = 50;
        let (modified_files, modified_files_truncated) =
            match modified_since(&self.workspace, result.started_at) {
                Ok(mut paths) => {
                    let truncated = paths.len() > MAX_MODIFIED_FILES;
                    paths.truncate(MAX_MODIFIED_FILES);
                    (paths, truncated)
                }
                Err(_) => (Vec::new(), false),
            };
        if let Ok(mut last_failure) = self.last_failure.lock() {
            *last_failure = Some(LastFailure {
                command: redact_sensitive_text(command).0.trim_end().to_owned(),
                exit_status: result.exit_status.clone(),
                stdout_tail: redact_sensitive_text(&result.stdout_text).0,
                stderr_tail: redact_sensitive_text(&result.stderr_text).0,
                modified_files,
                modified_files_truncated,
            });
        }
    }
}

struct ShellRunResult {
    output: ToolOutput,
    exit_status: String,
    stdout_text: String,
    stderr_text: String,
    started_at: SystemTime,
}

fn run_shell(
    workspace: &Path,
    config: &AgentShellConfig,
    optimizer: Option<&OptimizationPipeline>,
    arguments: &Value,
    cancellation: &CancellationToken,
) -> Result<ShellRunResult> {
    ensure_active(cancellation)?;
    let command = arguments
        .get("command")
        .and_then(Value::as_str)
        .context("command must be a string")?;
    if command.trim().is_empty() {
        bail!("command cannot be empty");
    }
    let timeout = requested_timeout(arguments, config.timeout)?;
    let started_at = SystemTime::now();
    let mut process = Command::new(&config.program);
    process
        .args(&config.arguments)
        .arg(command)
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if !config.inherit_environment {
        process.env_clear();
    }
    if let Some(path) = &config.path {
        process.env("PATH", path);
    }
    configure_process_group(&mut process);
    let mut child = process
        .spawn()
        .context("failed to start isolated agent shell")?;
    let stdout = child
        .stdout
        .take()
        .context("agent shell stdout unavailable")?;
    let stderr = child
        .stderr
        .take()
        .context("agent shell stderr unavailable")?;
    let stdout_reader = capture(stdout, config.max_output_bytes, CapturePosition::Head);
    let stderr_reader = capture(stderr, config.max_output_bytes, CapturePosition::Tail);
    let started = Instant::now();

    let outcome = loop {
        if cancellation.is_cancelled() {
            terminate(&mut child);
            child
                .wait()
                .context("failed to reap cancelled agent shell")?;
            break ProcessOutcome::Cancelled;
        }
        if started.elapsed() >= timeout {
            terminate(&mut child);
            child
                .wait()
                .context("failed to reap timed-out agent shell")?;
            break ProcessOutcome::TimedOut;
        }
        if let Some(status) = child
            .try_wait()
            .context("failed to inspect agent shell status")?
        {
            break ProcessOutcome::Exited(status);
        }
        thread::sleep(POLL_INTERVAL);
    };

    let stdout = join_capture(stdout_reader)?;
    let stderr = join_capture(stderr_reader)?;
    let stdout_text = String::from_utf8_lossy(&stdout.bytes).into_owned();
    let stderr_text = String::from_utf8_lossy(&stderr.bytes).into_owned();

    let (exit_status, output) = finish_shell_output(
        &outcome,
        command,
        &stdout,
        &stderr,
        optimizer,
        config.max_output_bytes,
    )?;

    Ok(ShellRunResult {
        output,
        exit_status,
        stdout_text,
        stderr_text,
        started_at,
    })
}

fn finish_shell_output(
    outcome: &ProcessOutcome,
    command: &str,
    stdout: &CapturedStream,
    stderr: &CapturedStream,
    optimizer: Option<&OptimizationPipeline>,
    max_output_bytes: usize,
) -> Result<(String, ToolOutput)> {
    Ok(match outcome {
        ProcessOutcome::Cancelled => bail!("tool call cancelled"),
        ProcessOutcome::TimedOut => {
            let exit_status = "timed_out".to_owned();
            let text = render_output(&exit_status, stdout, stderr, true, max_output_bytes);
            let output = render_tool_output(
                text,
                true,
                optimizer,
                classify_output(command),
                max_output_bytes,
            );
            (exit_status, output)
        }
        ProcessOutcome::Exited(status) => {
            let failed = !status.success();
            let exit_status = status
                .code()
                .map_or_else(|| "signal".to_owned(), |code| code.to_string());
            let text = render_output(&exit_status, stdout, stderr, failed, max_output_bytes);
            let output = render_tool_output(
                text,
                failed,
                optimizer,
                classify_output(command),
                max_output_bytes,
            );
            (exit_status, output)
        }
    })
}

fn render_tool_output(
    text: String,
    is_error: bool,
    optimizer: Option<&OptimizationPipeline>,
    kind: OutputKind,
    budget: usize,
) -> ToolOutput {
    let Some(optimizer) = optimizer else {
        return if is_error {
            ToolOutput::error(text)
        } else {
            ToolOutput::text(text)
        };
    };
    let result = optimizer.optimize(kind, text.as_bytes(), budget);
    let text = String::from_utf8_lossy(&result.bytes).into_owned();
    ToolOutput {
        text,
        structured: Some(optimization_metadata(&result)),
        is_error,
    }
}

fn optimization_metadata(result: &OptimizationResult) -> Value {
    json!({
        "optimization": {
            "optimizer": result.optimizer.as_deref(),
            "input_bytes": result.input_bytes,
            "output_bytes": result.output_bytes,
            "saved_bytes": result.saved_bytes,
            "redacted_lines": result.redacted_lines
        }
    })
}

fn classify_output(command: &str) -> OutputKind {
    let command = command.trim_start();
    let command = command.strip_prefix("rtk ").unwrap_or(command);
    if command.starts_with("cargo ") {
        OutputKind::Cargo
    } else if command.starts_with("git diff") {
        OutputKind::GitDiff
    } else if ["npm install", "npm i ", "pnpm install", "yarn install"]
        .iter()
        .any(|prefix| command.starts_with(prefix))
    {
        OutputKind::PackageInstall
    } else if command.contains(" test") || command.starts_with("test ") {
        OutputKind::Test
    } else {
        OutputKind::Generic
    }
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

#[derive(Clone, Copy)]
enum CapturePosition {
    Head,
    Tail,
}

struct CapturedStream {
    bytes: Vec<u8>,
    truncated: bool,
}

fn capture(
    mut reader: impl Read + Send + 'static,
    limit: usize,
    position: CapturePosition,
) -> JoinHandle<io::Result<CapturedStream>> {
    thread::spawn(move || {
        let mut captured = Vec::new();
        let mut truncated = false;
        let mut buffer = [0_u8; 8192];
        loop {
            let read = reader.read(&mut buffer)?;
            if read == 0 {
                return Ok(CapturedStream {
                    bytes: captured,
                    truncated,
                });
            }
            match position {
                CapturePosition::Head => {
                    let remaining = limit.saturating_sub(captured.len());
                    captured.extend_from_slice(&buffer[..read.min(remaining)]);
                    truncated |= read > remaining;
                }
                CapturePosition::Tail => {
                    captured.extend_from_slice(&buffer[..read]);
                    if captured.len() > limit {
                        truncated = true;
                        captured.drain(..captured.len() - limit);
                    }
                }
            }
        }
    })
}

fn join_capture(reader: JoinHandle<io::Result<CapturedStream>>) -> Result<CapturedStream> {
    reader
        .join()
        .map_err(|_| anyhow::anyhow!("agent shell output reader panicked"))?
        .context("failed to read agent shell output")
}

fn render_output(
    status: &str,
    stdout: &CapturedStream,
    stderr: &CapturedStream,
    diagnostics_first: bool,
    limit: usize,
) -> String {
    let stdout_text = String::from_utf8_lossy(&stdout.bytes);
    let stderr_text = String::from_utf8_lossy(&stderr.bytes);
    let stdout_label = if stdout.truncated {
        "stdout (head, truncated)"
    } else {
        "stdout"
    };
    let stderr_label = if stderr.truncated {
        "stderr (tail, truncated)"
    } else {
        "stderr"
    };
    let streams = if diagnostics_first {
        format!("{stderr_label}:\n{stderr_text}\n{stdout_label}:\n{stdout_text}")
    } else {
        format!("{stdout_label}:\n{stdout_text}\n{stderr_label}:\n{stderr_text}")
    };
    bounded_text(format!("exit: {status}\n{streams}"), limit)
}

fn ensure_active(cancellation: &CancellationToken) -> Result<()> {
    if cancellation.is_cancelled() {
        bail!("tool call cancelled");
    }
    Ok(())
}

fn modified_since(workspace: &Path, since: std::time::SystemTime) -> Result<Vec<PathBuf>> {
    let since = since.checked_sub(Duration::from_secs(1)).unwrap_or(since);

    let mut modified = Vec::new();
    let mut stack = vec![workspace.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = std::fs::read_dir(&dir)
            .with_context(|| format!("failed to read directory `{}`", dir.display()))?;
        for entry in entries {
            let entry = entry.context("failed to read directory entry")?;
            let path = entry.path();
            let file_type = entry
                .file_type()
                .with_context(|| format!("failed to inspect `{}`", path.display()))?;

            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                if matches!(
                    path.file_name().and_then(|name| name.to_str()),
                    Some(".git" | "target" | "node_modules")
                ) {
                    continue;
                }
                stack.push(path);
                continue;
            }
            if !file_type.is_file() {
                continue;
            }

            let metadata = entry
                .metadata()
                .with_context(|| format!("failed to read metadata for `{}`", path.display()))?;
            let mtime = metadata.modified().with_context(|| {
                format!("filesystem lacks mtime support for `{}`", path.display())
            })?;

            if mtime >= since {
                modified.push(path);
            }
        }
    }

    Ok(modified)
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
    if let Some(pid) = pid {
        if kill_process_group(pid, Signal::KILL).is_err() {
            let _ = child.kill();
        }
    } else {
        let _ = child.kill();
    }
}

#[cfg(not(unix))]
fn terminate(child: &mut Child) {
    let _ = child.kill();
}

fn descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: RUN_SHELL.to_owned(),
        description: "Run bounded Bash from the workspace. Parent/absolute paths, pipelines, installed programs, authenticated CLIs, builds, tests, Git, system inspection, and bounded wait/watch polling are supported; user policy gates approval."
            .to_owned(),
        input_schema: json!({
            "type":"object",
            "properties":{
                "command":{"type":"string","minLength":1},
                "timeout_seconds":{"type":"integer","minimum":1}
            },
            "required":["command"],
            "additionalProperties":false
        }),
        risk: RiskClass::ProcessExecution,
        transport: ToolTransport::Native,
    }
}
struct DiagnoseLastFailureTool {
    shell: Arc<ShellTool>,
}

impl ToolHandler for DiagnoseLastFailureTool {
    fn call(&self, _arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        ensure_active(cancellation)?;
        let last_failure = self
            .shell
            .last_failure
            .lock()
            .map_err(|_| anyhow::anyhow!("last-failure state poisoned"))?;
        match &*last_failure {
            None => Ok(ToolOutput::text(
                "No failed command has been recorded in this session.".to_owned(),
            )),
            Some(failure) => Ok(ToolOutput::text(render_last_failure(failure))),
        }
    }
}

fn render_last_failure(failure: &LastFailure) -> String {
    let mut sections = vec![
        format!("command: {}", failure.command),
        format!("exit: {}", failure.exit_status),
        format!("stderr:\n{}", failure.stderr_tail),
        format!("stdout:\n{}", failure.stdout_tail),
    ];
    if failure.modified_files.is_empty() {
        sections.push("modified files: none detected".to_owned());
    } else {
        let mut listing = String::from("modified files:\n");
        for path in &failure.modified_files {
            let _ = writeln!(listing, "  {}", path.display());
        }
        if failure.modified_files_truncated {
            listing.push_str("  ... (truncated)\n");
        }
        sections.push(listing);
    }
    sections.join("\n")
}

fn diagnose_descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: "diagnose_last_failure".to_owned(),
        description:
            "Read-only diagnosis of the most recent failed run_shell command: exit status, \
             stderr/stdout tails, and files modified since it started."
                .to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }),
        risk: RiskClass::ReadOnly,
        transport: ToolTransport::Native,
    }
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    use crumb_agent::{
        AgentMode, ApprovalBroker, ApprovalDecision, ApprovalRequest, CancellationToken,
        DenyAllApprovals, OutputKind, RiskClass, TokenOptimizer, ToolCallErrorKind, ToolHost,
    };
    use crumb_optimize::OptimizationPipeline;
    use serde_json::json;

    use super::{
        AgentShellConfig, accepted_rewrite, normalize_shell_command, register_shell_tool,
        register_shell_tool_with_optimizer,
    };

    struct AllowOnce;

    struct Shortener;

    impl TokenOptimizer for Shortener {
        fn name(&self) -> &'static str {
            "fixture"
        }

        fn available(&self) -> bool {
            true
        }

        fn optimize(
            &self,
            _kind: OutputKind,
            _input: &[u8],
            _budget: usize,
        ) -> anyhow::Result<Vec<u8>> {
            Ok(b"optimized\n".to_vec())
        }
    }

    impl ApprovalBroker for AllowOnce {
        fn decide(
            &self,
            _request: &ApprovalRequest,
            _arguments: &serde_json::Value,
            _cancellation: &CancellationToken,
        ) -> ApprovalDecision {
            ApprovalDecision::AllowOnce
        }
    }

    fn config(timeout: Duration) -> AgentShellConfig {
        #[cfg(unix)]
        let (program, arguments, path) = (
            PathBuf::from("/bin/sh"),
            vec![OsString::from("-c")],
            Some(OsString::from("/usr/bin:/bin")),
        );
        #[cfg(windows)]
        let (program, arguments, path) = (
            PathBuf::from(r"C:\Windows\System32\cmd.exe"),
            vec![OsString::from("/C")],
            None,
        );

        AgentShellConfig {
            program,
            arguments,
            path,
            command_rewriter: None,
            inherit_environment: false,
            max_output_bytes: 256,
            timeout,
        }
    }

    fn host(timeout: Duration) -> ToolHost {
        let mut host = ToolHost::default();
        register_shell_tool(
            &mut host,
            &std::env::current_dir().expect("current directory is available"),
            config(timeout),
        )
        .expect("shell tool is registered");
        host
    }

    fn optimized_host(timeout: Duration) -> ToolHost {
        let mut host = ToolHost::default();
        register_shell_tool_with_optimizer(
            &mut host,
            &std::env::current_dir().expect("current directory is available"),
            config(timeout),
            Arc::new(OptimizationPipeline::new(vec![Box::new(Shortener)])),
        )
        .expect("optimized shell tool is registered");
        host
    }

    #[test]
    fn shell_execution_requires_approval() {
        let host = host(Duration::from_secs(1));
        let descriptor = host
            .tools()
            .find(|descriptor| descriptor.name == "run_shell")
            .expect("shell descriptor exists");
        assert_eq!(descriptor.risk, RiskClass::ProcessExecution);
        let error = host
            .call(
                "run_shell",
                &json!({"command":"printf should-not-run"}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
            )
            .expect_err("process execution is approval gated");
        assert_eq!(error.kind, ToolCallErrorKind::Denied);
    }

    #[test]
    fn rtk_rewrites_are_bounded_and_never_nested() {
        assert_eq!(
            accepted_rewrite("find . -name Cargo.toml", b"rtk find . -name Cargo.toml\n"),
            Some("rtk find . -name Cargo.toml".to_owned())
        );
        assert_eq!(accepted_rewrite("pwd", b""), None);
        assert_eq!(accepted_rewrite("pwd", b"rtk read x\nsecond line"), None);
        assert_eq!(
            accepted_rewrite("rtk git status", b"rtk git status\n"),
            None
        );
    }

    #[test]
    fn rootless_find_gets_an_explicit_search_root() {
        assert_eq!(
            normalize_shell_command("find -path 'elixpo_projects' -type d"),
            "find . -path 'elixpo_projects' -type d"
        );
        assert_eq!(
            normalize_shell_command("find /home/user -type d -name projects"),
            "find /home/user -type d -name projects"
        );
    }

    #[cfg(unix)]
    #[test]
    fn approved_shell_is_isolated_and_returns_bounded_output() {
        let output = host(Duration::from_secs(1))
            .call(
                "run_shell",
                &json!({"command":"printf hello; /usr/bin/env"}),
                AgentMode::Auto,
                &AllowOnce,
                &CancellationToken::default(),
            )
            .expect("approved shell call succeeds");
        assert!(!output.is_error);
        assert!(output.text.contains("hello"));
        assert!(output.text.contains("PATH=/usr/bin:/bin"));
        assert!(!output.text.contains("HOME="));
        assert!(output.text.len() <= 256);
    }

    #[cfg(unix)]
    #[test]
    fn full_access_shell_can_inherit_the_terminal_environment() {
        let mut config = config(Duration::from_secs(1));
        config.inherit_environment = true;
        let mut host = ToolHost::default();
        register_shell_tool(
            &mut host,
            &std::env::current_dir().expect("current directory is available"),
            config,
        )
        .expect("shell tool is registered");
        let output = host
            .call(
                "run_shell",
                &json!({"command":"printf %s \"${HOME:+available}\""}),
                AgentMode::Auto,
                &AllowOnce,
                &CancellationToken::default(),
            )
            .expect("approved shell call succeeds");
        assert!(output.text.contains("stdout:\navailable\n"));
    }

    #[cfg(unix)]
    #[test]
    fn optimized_shell_reports_measured_savings() {
        let output = optimized_host(Duration::from_secs(1))
            .call(
                "run_shell",
                &json!({"command":"printf 'repeated output repeated output'"}),
                AgentMode::Auto,
                &AllowOnce,
                &CancellationToken::default(),
            )
            .expect("optimized shell call succeeds");
        assert_eq!(output.text, "optimized\n");
        let optimization = output
            .structured
            .as_ref()
            .and_then(|value| value.get("optimization"))
            .expect("optimization metadata is present");
        assert_eq!(optimization["optimizer"], "fixture");
        assert!(
            optimization["saved_bytes"]
                .as_u64()
                .is_some_and(|bytes| bytes > 0)
        );
    }

    #[cfg(unix)]
    #[test]
    fn nonzero_exit_prioritizes_stderr() {
        let output = host(Duration::from_secs(1))
            .call(
                "run_shell",
                &json!({"command":"printf diagnostic >&2; exit 7"}),
                AgentMode::Auto,
                &AllowOnce,
                &CancellationToken::default(),
            )
            .expect("command failure is returned as tool output");
        assert!(output.is_error);
        assert!(output.text.starts_with("exit: 7\nstderr:\ndiagnostic"));
    }

    #[cfg(unix)]
    #[test]
    fn timeout_terminates_the_command() {
        let output = host(Duration::from_millis(30))
            .call(
                "run_shell",
                &json!({"command":"sleep 2"}),
                AgentMode::Auto,
                &AllowOnce,
                &CancellationToken::default(),
            )
            .expect("timeout is an expected tool result");
        assert!(output.is_error);
        assert!(output.text.starts_with("exit: timed_out"));
    }

    #[cfg(unix)]
    #[test]
    fn cancellation_terminates_the_command() {
        let host = Arc::new(host(Duration::from_secs(2)));
        let cancellation = CancellationToken::default();
        let call_token = cancellation.clone();
        let call_host = Arc::clone(&host);
        let call = thread::spawn(move || {
            call_host.call(
                "run_shell",
                &json!({"command":"sleep 2"}),
                AgentMode::Auto,
                &AllowOnce,
                &call_token,
            )
        });
        thread::sleep(Duration::from_millis(30));
        cancellation.cancel();
        let error = call
            .join()
            .expect("tool thread does not panic")
            .expect_err("cancelled command returns a typed error");
        assert_eq!(error.kind, ToolCallErrorKind::Cancelled);
    }
    #[cfg(unix)]
    #[test]
    fn diagnose_last_failure_reports_nothing_before_any_failure() {
        let host = host(Duration::from_secs(1));
        let output = host
            .call(
                "diagnose_last_failure",
                &json!({}),
                AgentMode::Auto,
                &AllowOnce,
                &CancellationToken::default(),
            )
            .expect("diagnose call succeeds even with no prior failure");
        assert!(!output.is_error);
        assert!(output.text.contains("No failed command"));
    }

    #[cfg(unix)]
    #[test]
    fn diagnose_last_failure_reports_the_most_recent_failure() {
        let host = host(Duration::from_secs(1));
        let run = host
            .call(
                "run_shell",
                &json!({"command":"printf diagnostic >&2; exit 7"}),
                AgentMode::Auto,
                &AllowOnce,
                &CancellationToken::default(),
            )
            .expect("failing command is returned as tool output, not a call error");
        assert!(run.is_error);

        let diagnosis = host
            .call(
                "diagnose_last_failure",
                &json!({}),
                AgentMode::Auto,
                &AllowOnce,
                &CancellationToken::default(),
            )
            .expect("diagnose call succeeds after a recorded failure");
        assert!(!diagnosis.is_error);
        assert!(diagnosis.text.contains("printf diagnostic >&2; exit 7"));
        assert!(diagnosis.text.contains("exit: 7"));
        assert!(diagnosis.text.contains("diagnostic"));
    }

    #[cfg(unix)]
    #[test]
    fn diagnose_last_failure_is_read_only_and_needs_no_approval_beyond_run_shell() {
        let host = host(Duration::from_secs(1));
        let descriptor = host
            .tools()
            .find(|descriptor| descriptor.name == "diagnose_last_failure")
            .expect("diagnose descriptor exists");
        assert_eq!(descriptor.risk, RiskClass::ReadOnly);
    }
}
