//! Isolated, one-shot Codex and Claude CLI Harness adapters.
//!
//! Adapter processes start only for an explicitly selected agent turn. Native
//! shell startup and execution do not depend on this crate.

use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use crumb_agent::{AgentMode, CancellationToken, CodingBackend};
use crumb_harness_dsh::{Notification, RunResult};
use serde_json::Value;

const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Fully validated, non-secret invocation of one coding-agent CLI.
pub struct CodingCliLaunch<'a> {
    pub backend: CodingBackend,
    pub executable: &'a Path,
    pub workspace: &'a Path,
    pub mcp_command: &'a Path,
    pub session_id: &'a str,
    pub model: &'a str,
    pub reasoning_effort: Option<&'a str>,
    pub mode: AgentMode,
    pub workspace_write: bool,
    pub max_turns: u32,
    pub timeout: Duration,
    pub output_limit: usize,
}

impl CodingCliLaunch<'_> {
    /// Projects Crumb policy into backend flags without provider fallback or
    /// permission bypass switches.
    ///
    /// # Errors
    ///
    /// Returns an error for empty identities, zero bounds, or unsupported
    /// effort syntax.
    pub fn validate(&self) -> Result<()> {
        if self.executable.as_os_str().is_empty()
            || self.mcp_command.as_os_str().is_empty()
            || self.model.trim().is_empty()
            || self.session_id.trim().is_empty()
        {
            bail!("coding CLI launch requires backend, MCP, model, and session identifiers");
        }
        if self.max_turns == 0 || self.timeout.is_zero() || self.output_limit == 0 {
            bail!("coding CLI launch limits must be positive");
        }
        if self.reasoning_effort.is_some_and(str::is_empty) {
            bail!("coding CLI effort cannot be empty");
        }
        Ok(())
    }

    #[must_use]
    pub fn arguments(&self) -> Vec<String> {
        match self.backend {
            CodingBackend::Codex => codex_arguments(self),
            CodingBackend::Claude => claude_arguments(self),
        }
    }
}

/// Runs an explicitly selected coding CLI and returns only its final text.
/// Provider event payloads and stderr are never retained in Crumb sessions.
///
/// # Errors
///
/// Returns an error for invalid selection, launch failure, cancellation,
/// timeout, non-zero exit, oversized output, or incompatible JSON output.
pub fn run_text(
    launch: &CodingCliLaunch<'_>,
    prompt: &str,
    cancellation: &CancellationToken,
) -> Result<RunResult> {
    launch.validate()?;
    let mut command = Command::new(launch.executable);
    command
        .args(launch.arguments())
        .current_dir(launch.workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    configure_process_group(&mut command);
    let mut child = command.spawn().with_context(|| {
        format!(
            "selected {:?} CLI is unavailable at `{}`",
            launch.backend,
            launch.executable.display()
        )
    })?;
    let result = run_child(&mut child, launch, prompt, cancellation);
    if result.is_err() {
        terminate(&mut child);
        let _ = child.wait();
    }
    result
}

fn run_child(
    child: &mut Child,
    launch: &CodingCliLaunch<'_>,
    prompt: &str,
    cancellation: &CancellationToken,
) -> Result<RunResult> {
    let mut stdin = child
        .stdin
        .take()
        .context("coding CLI stdin was not piped")?;
    stdin
        .write_all(prompt.as_bytes())
        .context("failed to submit coding CLI request")?;
    drop(stdin);
    let stdout = child
        .stdout
        .take()
        .context("coding CLI stdout was not piped")?;
    let output_limit = launch.output_limit;
    let reader = thread::Builder::new()
        .name("crumb-coding-cli-output".to_owned())
        .spawn(move || read_bounded(stdout, output_limit))
        .context("failed to start coding CLI output reader")?;
    wait_for_child(child, launch.timeout, cancellation)?;
    let status = child.wait().context("failed to reap coding CLI")?;
    let bytes = reader
        .join()
        .map_err(|_| anyhow::anyhow!("coding CLI output reader panicked"))??;
    if !status.success() {
        bail!(
            "selected {:?} CLI failed; verify its authentication, model, and permissions",
            launch.backend
        );
    }
    let final_response = parse_final_response(launch.backend, &bytes)?;
    Ok(RunResult {
        session_id: launch.session_id.to_owned(),
        final_response,
        finish_reason: Some("completed".to_owned()),
        input_tokens: 0,
        cached_input_tokens: 0,
        output_tokens: 0,
        context_tokens: 0,
        events: Vec::new(),
        notifications: vec![Notification {
            method: "session.status".to_owned(),
            params: serde_json::json!({
                "sessionId": launch.session_id,
                "status": "idle"
            }),
        }],
    })
}

fn wait_for_child(
    child: &mut Child,
    timeout: Duration,
    cancellation: &CancellationToken,
) -> Result<()> {
    let deadline = Instant::now() + timeout;
    loop {
        if cancellation.is_cancelled() {
            terminate(child);
            bail!("coding CLI turn cancelled");
        }
        if child
            .try_wait()
            .context("failed to inspect coding CLI process")?
            .is_some()
        {
            return Ok(());
        }
        if Instant::now() >= deadline {
            terminate(child);
            bail!("coding CLI turn timed out");
        }
        thread::sleep(POLL_INTERVAL.min(deadline.saturating_duration_since(Instant::now())));
    }
}

fn read_bounded(mut reader: impl Read, limit: usize) -> Result<Vec<u8>> {
    let take_limit = u64::try_from(limit)
        .context("coding CLI output limit exceeds u64")?
        .saturating_add(1);
    let mut bytes = Vec::new();
    reader
        .by_ref()
        .take(take_limit)
        .read_to_end(&mut bytes)
        .context("failed to read coding CLI output")?;
    if bytes.len() > limit {
        bail!("coding CLI output exceeded its byte limit");
    }
    Ok(bytes)
}

fn parse_final_response(backend: CodingBackend, bytes: &[u8]) -> Result<String> {
    match backend {
        CodingBackend::Codex => parse_codex_response(bytes),
        CodingBackend::Claude => parse_claude_response(bytes),
    }
}

fn parse_codex_response(bytes: &[u8]) -> Result<String> {
    let text = std::str::from_utf8(bytes).context("Codex returned non-UTF-8 output")?;
    let response = text
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|event| event.get("type").and_then(Value::as_str) == Some("item.completed"))
        .filter_map(|event| event.get("item").cloned())
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("agent_message"))
        .filter_map(|item| item.get("text").and_then(Value::as_str).map(str::to_owned))
        .next_back()
        .context("Codex JSON output contained no final agent message")?;
    Ok(response)
}

fn parse_claude_response(bytes: &[u8]) -> Result<String> {
    let output: Value = serde_json::from_slice(bytes).context("invalid Claude JSON output")?;
    output
        .get("result")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .context("Claude JSON output contained no final result")
}

fn codex_arguments(launch: &CodingCliLaunch<'_>) -> Vec<String> {
    let mut arguments = vec![
        "exec".to_owned(),
        "--model".to_owned(),
        launch.model.to_owned(),
        "--sandbox".to_owned(),
        if launch.workspace_write && launch.mode == AgentMode::Auto {
            "workspace-write"
        } else {
            "read-only"
        }
        .to_owned(),
        "--ephemeral".to_owned(),
        "--ignore-user-config".to_owned(),
        "--ignore-rules".to_owned(),
        "--color".to_owned(),
        "never".to_owned(),
        "--json".to_owned(),
        "--cd".to_owned(),
        launch.workspace.display().to_string(),
    ];
    if let Some(effort) = launch.reasoning_effort {
        arguments.extend([
            "--config".to_owned(),
            format!("model_reasoning_effort=\"{effort}\""),
        ]);
    }
    let command = serde_json::to_string(&launch.mcp_command.display().to_string())
        .expect("serializing a path display string cannot fail");
    arguments.extend([
        "--config".to_owned(),
        format!("mcp_servers.crumb.command={command}"),
        "--config".to_owned(),
        "mcp_servers.crumb.args=[\"mcp\",\"serve\"]".to_owned(),
    ]);
    arguments.push("-".to_owned());
    arguments
}

fn claude_arguments(launch: &CodingCliLaunch<'_>) -> Vec<String> {
    let permission_mode = match (launch.mode, launch.workspace_write) {
        (AgentMode::Plan, _) => "plan",
        (AgentMode::Auto, true) => "acceptEdits",
        (AgentMode::Auto | AgentMode::Negotiate, false) | (AgentMode::Negotiate, true) => "default",
    };
    let mut arguments = vec![
        "--print".to_owned(),
        "--model".to_owned(),
        launch.model.to_owned(),
        "--output-format".to_owned(),
        "json".to_owned(),
        "--input-format".to_owned(),
        "text".to_owned(),
        "--max-turns".to_owned(),
        launch.max_turns.to_string(),
        "--no-session-persistence".to_owned(),
        "--safe-mode".to_owned(),
        "--strict-mcp-config".to_owned(),
        "--mcp-config".to_owned(),
        claude_mcp_config(launch.mcp_command),
        "--tools".to_owned(),
        String::new(),
        "--allowedTools".to_owned(),
        "mcp__crumb__*".to_owned(),
        "--permission-mode".to_owned(),
        permission_mode.to_owned(),
    ];
    if let Some(effort) = launch.reasoning_effort {
        arguments.extend(["--effort".to_owned(), effort.to_owned()]);
    }
    arguments
}

fn claude_mcp_config(command: &Path) -> String {
    serde_json::json!({
        "mcpServers": {
            "crumb": {
                "type": "stdio",
                "command": command.display().to_string(),
                "args": ["mcp", "serve"],
                "env": {}
            }
        }
    })
    .to_string()
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
    if let Some(pid) = pid
        && kill_process_group(pid, Signal::KILL).is_ok()
    {
        return;
    }
    let _ = child.kill();
}

#[cfg(windows)]
fn terminate(child: &mut Child) {
    let status = Command::new("taskkill")
        .args(["/PID", &child.id().to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if status.as_ref().map_or(true, |status| !status.success()) {
        let _ = child.kill();
    }
}

#[cfg(not(any(unix, windows)))]
fn terminate(child: &mut Child) {
    let _ = child.kill();
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::process::{Command, Stdio};
    use std::time::Duration;

    use crumb_agent::{AgentMode, CancellationToken, CodingBackend};

    use super::{
        CodingCliLaunch, configure_process_group, parse_claude_response, parse_codex_response,
        wait_for_child,
    };

    fn launch(backend: CodingBackend) -> CodingCliLaunch<'static> {
        CodingCliLaunch {
            backend,
            executable: Path::new("fixture"),
            workspace: Path::new("/workspace"),
            mcp_command: Path::new("/usr/bin/crumb"),
            session_id: "fixture-session",
            model: "fixture-model",
            reasoning_effort: Some("high"),
            mode: AgentMode::Plan,
            workspace_write: false,
            max_turns: 4,
            timeout: Duration::from_secs(1),
            output_limit: 4096,
        }
    }

    #[test]
    fn codex_projection_is_explicit_and_read_only_in_plan_mode() {
        let arguments = launch(CodingBackend::Codex).arguments();
        assert!(
            arguments
                .windows(2)
                .any(|pair| pair == ["--model", "fixture-model"])
        );
        assert!(
            arguments
                .windows(2)
                .any(|pair| pair == ["--sandbox", "read-only"])
        );
        assert!(
            !arguments
                .iter()
                .any(|argument| argument.contains("dangerously"))
        );
        assert!(arguments.contains(&"--ignore-user-config".to_owned()));
        assert!(
            arguments
                .iter()
                .any(|argument| argument == "mcp_servers.crumb.args=[\"mcp\",\"serve\"]")
        );
    }

    #[test]
    fn claude_projection_disables_persistence_and_selects_effort() {
        let arguments = launch(CodingBackend::Claude).arguments();
        assert!(arguments.contains(&"--no-session-persistence".to_owned()));
        assert!(
            arguments
                .windows(2)
                .any(|pair| pair == ["--effort", "high"])
        );
        assert!(
            arguments
                .windows(2)
                .any(|pair| pair == ["--permission-mode", "plan"])
        );
        assert!(arguments.contains(&"--strict-mcp-config".to_owned()));
        assert!(arguments.windows(2).any(|pair| pair == ["--tools", ""]));
    }

    #[test]
    fn provider_outputs_project_only_final_text() {
        let codex = br#"{"type":"item.completed","item":{"type":"agent_message","text":"done"}}
"#;
        assert_eq!(parse_codex_response(codex).expect("Codex fixture"), "done");
        assert_eq!(
            parse_claude_response(br#"{"result":"ready","secret":"ignored"}"#)
                .expect("Claude fixture"),
            "ready"
        );
    }

    #[test]
    fn incompatible_provider_output_fails_without_echoing_payloads() {
        let codex = parse_codex_response(
            br#"{"type":"turn.failed","error":{"message":"credential sk-secret"}}
"#,
        )
        .expect_err("Codex output without a final message is rejected");
        assert!(!codex.to_string().contains("sk-secret"));

        let claude = parse_claude_response(br#"{"error":"credential sk-secret"}"#)
            .expect_err("Claude output without a final result is rejected");
        assert!(!claude.to_string().contains("sk-secret"));
    }

    #[test]
    fn invalid_launch_fails_before_starting_a_backend() {
        let mut invalid = launch(CodingBackend::Codex);
        invalid.model = "";
        assert!(invalid.validate().is_err());
    }

    #[cfg(unix)]
    #[test]
    fn cancellation_terminates_the_backend_process_group() {
        let mut command = Command::new("sh");
        command
            .args(["-c", "sleep 30 & wait"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        configure_process_group(&mut command);
        let mut child = command.spawn().expect("fixture process starts");
        let cancellation = CancellationToken::default();
        cancellation.cancel();
        assert!(wait_for_child(&mut child, Duration::from_secs(1), &cancellation).is_err());
        let _ = child.wait();
    }
}
