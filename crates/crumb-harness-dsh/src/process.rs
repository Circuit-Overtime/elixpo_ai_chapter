//! Lazy, cancellable ownership of one Harness SDK subprocess.

use std::collections::{BTreeMap, VecDeque};
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use crumb_agent::CancellationToken;
use serde::Deserialize;

use crate::protocol::{
    IncomingFrame, InitializeParams, Notification, Response, SessionPromptParams,
    encode_initialize, encode_session_prompt, encode_shutdown,
};

const POLL_INTERVAL: Duration = Duration::from_millis(50);
const STDERR_TAIL_BYTES: usize = 32 * 1024;
const MAX_PROTOCOL_LINE_BYTES: usize = 1024 * 1024;
const SERVER_NAME: &str = "deepseek-harness-sdk-runtime";

/// Explicit child environment. It intentionally has no `Debug` implementation
/// because values may contain credentials supplied by the runtime boundary.
#[derive(Default)]
pub struct HarnessEnvironment {
    values: BTreeMap<OsString, OsString>,
}

impl HarnessEnvironment {
    #[must_use]
    pub fn runtime_basics() -> Self {
        let mut environment = Self::default();
        for name in ["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR"] {
            if let Some(value) = std::env::var_os(name) {
                environment.insert(name, value);
            }
        }
        environment
    }

    pub fn insert(&mut self, name: impl Into<OsString>, value: impl Into<OsString>) {
        self.values.insert(name.into(), value.into());
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitializeResult {
    server_info: ServerInfo,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PromptReceipt {
    pub message_id: String,
}

/// Committed result of one root-session activity interval.
#[derive(Clone, Debug, PartialEq)]
pub struct RunResult {
    pub session_id: String,
    pub final_response: String,
    pub finish_reason: Option<String>,
    pub input_tokens: u64,
    pub cached_input_tokens: u64,
    pub output_tokens: u64,
    /// Tokens in the latest model context, distinct from cumulative turn usage.
    pub context_tokens: u64,
    pub events: Vec<serde_json::Value>,
    pub notifications: Vec<Notification>,
}

enum ReaderEvent {
    Frame(IncomingFrame),
    Failed(String),
    Closed,
}

/// One lazily launched, exclusively owned Harness SDK process.
pub struct ProcessHarness {
    child: Child,
    stdin: Option<ChildStdin>,
    incoming: Receiver<ReaderEvent>,
    stderr_tail: Arc<Mutex<BoundedTail>>,
    stdout_thread: Option<JoinHandle<()>>,
    stderr_thread: Option<JoinHandle<()>>,
    next_id: u64,
}

impl ProcessHarness {
    /// Launches the configured process with piped protocol streams and an
    /// explicit credential-bearing environment.
    ///
    /// # Errors
    ///
    /// Returns an error if the process or its reader threads cannot start.
    pub fn spawn(
        program: &Path,
        arguments: &[String],
        cwd: &Path,
        environment: &HarnessEnvironment,
    ) -> Result<Self> {
        let mut command = Command::new(program);
        command
            .args(arguments)
            .current_dir(cwd)
            .env_clear()
            .envs(&environment.values)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        configure_process_group(&mut command);
        let mut child = command
            .spawn()
            .with_context(|| format!("failed to launch Harness process `{}`", program.display()))?;
        let result = Self::attach(&mut child);
        if result.is_err() {
            terminate(&mut child);
            let _ = child.wait();
        }
        result.map(|parts| Self {
            child,
            stdin: Some(parts.stdin),
            incoming: parts.incoming,
            stderr_tail: parts.stderr_tail,
            stdout_thread: Some(parts.stdout_thread),
            stderr_thread: Some(parts.stderr_thread),
            next_id: 1,
        })
    }

    fn attach(child: &mut Child) -> Result<ProcessParts> {
        let stdin = child.stdin.take().context("Harness stdin was not piped")?;
        let stdout = child
            .stdout
            .take()
            .context("Harness stdout was not piped")?;
        let stderr = child
            .stderr
            .take()
            .context("Harness stderr was not piped")?;
        let (sender, incoming) = mpsc::channel();
        let stdout_thread = thread::Builder::new()
            .name("crumb-dsh-stdout".to_owned())
            .spawn(move || read_stdout(stdout, &sender))
            .context("failed to start Harness stdout reader")?;
        let stderr_tail = Arc::new(Mutex::new(BoundedTail::new(STDERR_TAIL_BYTES)));
        let stderr_writer = Arc::clone(&stderr_tail);
        let stderr_thread = thread::Builder::new()
            .name("crumb-dsh-stderr".to_owned())
            .spawn(move || read_stderr(stderr, &stderr_writer))
            .context("failed to start Harness stderr reader")?;
        Ok(ProcessParts {
            stdin,
            incoming,
            stderr_tail,
            stdout_thread,
            stderr_thread,
        })
    }

    /// Initializes the exact provider/model/effort tuple and validates the
    /// runtime identity.
    ///
    /// # Errors
    ///
    /// Returns an error for cancellation, timeout, transport failure, an SDK
    /// error response, or an incompatible server identity.
    pub fn initialize(
        &mut self,
        params: InitializeParams<'_>,
        cancellation: &CancellationToken,
        timeout: Duration,
    ) -> Result<ServerInfo> {
        let id = self.take_id()?;
        let response = self.exchange(
            id,
            &encode_initialize(id, params)?,
            cancellation,
            timeout,
            "initialize",
        )?;
        let result = successful_result(response)?;
        let initialized: InitializeResult =
            serde_json::from_value(result).context("invalid Harness initialize response")?;
        if initialized.server_info.name != SERVER_NAME {
            bail!(
                "incompatible Harness server `{}`",
                initialized.server_info.name
            );
        }
        Ok(initialized.server_info)
    }

    /// Queues one text prompt and returns its durable admission receipt.
    ///
    /// # Errors
    ///
    /// Returns an error for cancellation, timeout, transport failure, or an
    /// invalid SDK response.
    pub fn prompt(
        &mut self,
        params: SessionPromptParams<'_>,
        cancellation: &CancellationToken,
        timeout: Duration,
    ) -> Result<(PromptReceipt, Vec<Notification>)> {
        let id = self.take_id()?;
        let (response, notifications) = self.exchange_with_notifications(
            id,
            &encode_session_prompt(id, params)?,
            cancellation,
            timeout,
            "session/prompt",
        )?;
        let receipt = serde_json::from_value(successful_result(response)?)
            .context("invalid Harness prompt receipt")?;
        Ok((receipt, notifications))
    }

    /// Queues a text request and waits from its durable inbox receipt through
    /// the root agent's next idle transition.
    ///
    /// Only committed `assistant/message` content becomes the final response;
    /// transient chunks remain notifications for a future streaming renderer.
    ///
    /// # Errors
    ///
    /// Returns an error for cancellation, timeout, malformed lifecycle events,
    /// transport failure, or exhaustion of the supplied event-byte budget.
    pub fn run_text(
        &mut self,
        session_id: &str,
        text: &str,
        cancellation: &CancellationToken,
        timeout: Duration,
        event_budget_bytes: usize,
    ) -> Result<RunResult> {
        self.run_text_with_events(
            session_id,
            text,
            cancellation,
            timeout,
            event_budget_bytes,
            |_| Ok(()),
        )
    }

    /// Runs one text request while forwarding each bounded Harness
    /// notification before it is committed to the final projection.
    ///
    /// # Errors
    ///
    /// Returns an error for the same conditions as [`Self::run_text`], or when
    /// the event consumer rejects a notification.
    pub fn run_text_with_events(
        &mut self,
        session_id: &str,
        text: &str,
        cancellation: &CancellationToken,
        timeout: Duration,
        event_budget_bytes: usize,
        mut on_notification: impl FnMut(&Notification) -> Result<()>,
    ) -> Result<RunResult> {
        let deadline = Instant::now() + timeout;
        let (receipt, initial) = self.prompt(
            SessionPromptParams::text(session_id, text),
            cancellation,
            remaining(deadline)?,
        )?;
        let mut projection =
            RunProjection::new(session_id, &receipt.message_id, event_budget_bytes);
        for notification in initial {
            let completed = self.project_notification(&mut projection, &notification)?;
            on_notification(&notification)?;
            if completed {
                return projection.finish();
            }
        }
        loop {
            match self.receive_frame(cancellation, deadline, "session activity")? {
                IncomingFrame::Notification(notification) => {
                    let completed = self.project_notification(&mut projection, &notification)?;
                    on_notification(&notification)?;
                    if completed {
                        return projection.finish();
                    }
                }
                IncomingFrame::Response(_) => {
                    self.hard_stop();
                    bail!("Harness returned an unexpected response during session activity");
                }
            }
        }
    }

    fn project_notification(
        &mut self,
        projection: &mut RunProjection<'_>,
        notification: &Notification,
    ) -> Result<bool> {
        match projection.observe(notification) {
            Ok(completed) => Ok(completed),
            Err(error) => {
                self.hard_stop();
                Err(error)
            }
        }
    }

    /// Requests graceful shutdown, then forcefully reaps a process that does
    /// not exit within the supplied bound.
    ///
    /// # Errors
    ///
    /// Returns the shutdown protocol or process-wait error after ensuring the
    /// child is no longer running.
    pub fn shutdown(mut self, timeout: Duration) -> Result<()> {
        let cancellation = CancellationToken::default();
        let id = self.take_id()?;
        let exchange = self
            .exchange(
                id,
                &encode_shutdown(id)?,
                &cancellation,
                timeout,
                "shutdown",
            )
            .and_then(successful_result);
        self.stdin.take();
        let wait = self.wait_or_kill(timeout);
        self.join_readers();
        exchange.map(|_| ()).and(wait)
    }

    #[must_use]
    pub fn diagnostics(&self) -> String {
        self.stderr_tail
            .lock()
            .map_or_else(|_| String::new(), |tail| tail.render())
    }

    fn take_id(&mut self) -> Result<u64> {
        let id = self.next_id;
        self.next_id = self
            .next_id
            .checked_add(1)
            .context("Harness request id exhausted")?;
        Ok(id)
    }

    fn exchange(
        &mut self,
        id: u64,
        encoded: &[u8],
        cancellation: &CancellationToken,
        timeout: Duration,
        operation: &str,
    ) -> Result<Response> {
        self.exchange_with_notifications(id, encoded, cancellation, timeout, operation)
            .map(|(response, _)| response)
    }

    fn exchange_with_notifications(
        &mut self,
        id: u64,
        encoded: &[u8],
        cancellation: &CancellationToken,
        timeout: Duration,
        operation: &str,
    ) -> Result<(Response, Vec<Notification>)> {
        let stdin = self.stdin.as_mut().context("Harness stdin is closed")?;
        stdin
            .write_all(encoded)
            .context("failed to write Harness request")?;
        stdin.flush().context("failed to flush Harness request")?;
        let deadline = Instant::now() + timeout;
        let mut notifications = Vec::new();
        loop {
            match self.receive_frame(cancellation, deadline, operation)? {
                IncomingFrame::Notification(notification) => {
                    notifications.push(notification);
                }
                IncomingFrame::Response(response) => {
                    if response.id.as_u64() != Some(id) {
                        self.hard_stop();
                        bail!("Harness returned an unexpected response id");
                    }
                    return Ok((response, notifications));
                }
            }
        }
    }

    fn receive_frame(
        &mut self,
        cancellation: &CancellationToken,
        deadline: Instant,
        operation: &str,
    ) -> Result<IncomingFrame> {
        loop {
            if cancellation.is_cancelled() {
                self.hard_stop();
                bail!("Harness {operation} cancelled");
            }
            let now = Instant::now();
            if now >= deadline {
                self.hard_stop();
                bail!("Harness {operation} timed out");
            }
            let wait = POLL_INTERVAL.min(deadline.saturating_duration_since(now));
            match self.incoming.recv_timeout(wait) {
                Ok(ReaderEvent::Frame(frame)) => return Ok(frame),
                Ok(ReaderEvent::Failed(error)) => {
                    self.hard_stop();
                    return Err(anyhow!(error).context("invalid Harness protocol output"));
                }
                Ok(ReaderEvent::Closed) | Err(RecvTimeoutError::Disconnected) => {
                    let diagnostics = self.diagnostics();
                    self.hard_stop();
                    bail!("Harness process closed its protocol stream{diagnostics}");
                }
                Err(RecvTimeoutError::Timeout) => {}
            }
        }
    }

    fn wait_or_kill(&mut self, timeout: Duration) -> Result<()> {
        let deadline = Instant::now() + timeout;
        loop {
            if self
                .child
                .try_wait()
                .context("failed to inspect Harness process")?
                .is_some()
            {
                return Ok(());
            }
            if Instant::now() >= deadline {
                self.hard_stop();
                return Ok(());
            }
            thread::sleep(POLL_INTERVAL.min(deadline.saturating_duration_since(Instant::now())));
        }
    }

    fn hard_stop(&mut self) {
        self.stdin.take();
        if self.child.try_wait().ok().flatten().is_none() {
            terminate(&mut self.child);
        }
        let _ = self.child.wait();
    }

    fn join_readers(&mut self) {
        if let Some(thread) = self.stdout_thread.take() {
            let _ = thread.join();
        }
        if let Some(thread) = self.stderr_thread.take() {
            let _ = thread.join();
        }
    }
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

impl Drop for ProcessHarness {
    fn drop(&mut self) {
        self.hard_stop();
        self.join_readers();
    }
}

struct ProcessParts {
    stdin: ChildStdin,
    incoming: Receiver<ReaderEvent>,
    stderr_tail: Arc<Mutex<BoundedTail>>,
    stdout_thread: JoinHandle<()>,
    stderr_thread: JoinHandle<()>,
}

struct RunProjection<'a> {
    session_id: &'a str,
    message_id: &'a str,
    receipt_seen: bool,
    byte_budget: usize,
    bytes_seen: usize,
    events: Vec<serde_json::Value>,
    notifications: Vec<Notification>,
}

impl<'a> RunProjection<'a> {
    fn new(session_id: &'a str, message_id: &'a str, byte_budget: usize) -> Self {
        Self {
            session_id,
            message_id,
            receipt_seen: false,
            byte_budget,
            bytes_seen: 0,
            events: Vec::new(),
            notifications: Vec::new(),
        }
    }

    fn observe(&mut self, notification: &Notification) -> Result<bool> {
        if !self.receipt_seen {
            if !is_inbox_receipt(notification, self.session_id, self.message_id) {
                return Ok(false);
            }
            self.receipt_seen = true;
        }
        let encoded_bytes = serde_json::to_vec(&notification.params)
            .context("failed to measure Harness notification")?
            .len();
        self.bytes_seen = self
            .bytes_seen
            .checked_add(encoded_bytes)
            .context("Harness event byte count overflowed")?;
        if self.bytes_seen > self.byte_budget {
            bail!("Harness session activity exceeded its event-byte budget");
        }
        if notification.method == "session.event"
            && notification
                .params
                .get("sessionId")
                .and_then(serde_json::Value::as_str)
                == Some(self.session_id)
            && let Some(event) = notification
                .params
                .get("event")
                .and_then(serde_json::Value::as_object)
        {
            self.events.push(serde_json::Value::Object(event.clone()));
        }
        let completed = notification.method == "session.status"
            && notification
                .params
                .get("sessionId")
                .and_then(serde_json::Value::as_str)
                == Some(self.session_id)
            && notification
                .params
                .get("status")
                .and_then(serde_json::Value::as_str)
                == Some("idle");
        self.notifications.push(notification.clone());
        Ok(completed)
    }

    fn finish(self) -> Result<RunResult> {
        Ok(RunResult {
            session_id: self.session_id.to_owned(),
            final_response: final_response(&self.events),
            finish_reason: finish_reason(&self.events)?,
            input_tokens: 0,
            cached_input_tokens: 0,
            output_tokens: 0,
            context_tokens: 0,
            events: self.events,
            notifications: self.notifications,
        })
    }
}

fn is_inbox_receipt(notification: &Notification, session_id: &str, message_id: &str) -> bool {
    if notification.method != "session.event"
        || notification
            .params
            .get("sessionId")
            .and_then(serde_json::Value::as_str)
            != Some(session_id)
    {
        return false;
    }
    let Some(inserted) = notification
        .params
        .get("event")
        .filter(|event| {
            event.get("type").and_then(serde_json::Value::as_str) == Some("agent/inbox/spliced")
        })
        .and_then(|event| event.get("data"))
        .and_then(|data| data.get("inserted"))
        .and_then(serde_json::Value::as_array)
    else {
        return false;
    };
    inserted
        .iter()
        .any(|message| message.get("id").and_then(serde_json::Value::as_str) == Some(message_id))
}

fn final_response(events: &[serde_json::Value]) -> String {
    events
        .iter()
        .rev()
        .find(|event| {
            event.get("type").and_then(serde_json::Value::as_str) == Some("assistant/message")
        })
        .and_then(|event| event.get("data"))
        .map(|data| {
            data.get("message")
                .filter(|message| message.is_object())
                .unwrap_or(data)
        })
        .and_then(|owner| owner.get("content"))
        .and_then(serde_json::Value::as_array)
        .map(|content| {
            content
                .iter()
                .filter(|block| {
                    block.get("type").and_then(serde_json::Value::as_str) == Some("text")
                })
                .filter_map(|block| block.get("text").and_then(serde_json::Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default()
}

fn finish_reason(events: &[serde_json::Value]) -> Result<Option<String>> {
    let Some(event) = events
        .iter()
        .rev()
        .find(|event| event.get("type").and_then(serde_json::Value::as_str) == Some("turn/end"))
    else {
        return Ok(None);
    };
    let kind = event
        .get("data")
        .and_then(|data| data.get("reason"))
        .and_then(|reason| reason.get("kind"))
        .and_then(serde_json::Value::as_str)
        .context("Harness turn/end event requires data.reason.kind")?;
    Ok(Some(kind.to_owned()))
}

fn remaining(deadline: Instant) -> Result<Duration> {
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        bail!("Harness session activity timed out");
    }
    Ok(remaining)
}

fn successful_result(response: Response) -> Result<serde_json::Value> {
    if let Some(error) = response.error {
        bail!("Harness SDK error {}: {}", error.code, error.message);
    }
    response
        .result
        .context("Harness response omitted its result")
}

fn read_stdout(stdout: impl Read, sender: &mpsc::Sender<ReaderEvent>) {
    let mut reader = BufReader::new(stdout);
    loop {
        match read_protocol_line(&mut reader) {
            Ok(Some(line)) => {
                if line.iter().all(u8::is_ascii_whitespace) {
                    continue;
                }
                let parsed = std::str::from_utf8(&line)
                    .context("Harness protocol line is not UTF-8")
                    .and_then(IncomingFrame::parse);
                let event = parsed.map_or_else(
                    |error| ReaderEvent::Failed(error.to_string()),
                    ReaderEvent::Frame,
                );
                if sender.send(event).is_err() {
                    return;
                }
            }
            Ok(None) => {
                let _ = sender.send(ReaderEvent::Closed);
                return;
            }
            Err(error) => {
                let _ = sender.send(ReaderEvent::Failed(error.to_string()));
                return;
            }
        }
    }
}

fn read_protocol_line(reader: &mut impl BufRead) -> std::io::Result<Option<Vec<u8>>> {
    let mut line = Vec::new();
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            return Ok((!line.is_empty()).then_some(line));
        }
        let length = available
            .iter()
            .position(|byte| *byte == b'\n')
            .map_or(available.len(), |index| index + 1);
        if line.len().saturating_add(length) > MAX_PROTOCOL_LINE_BYTES {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Harness protocol line exceeded the byte limit",
            ));
        }
        line.extend_from_slice(&available[..length]);
        let complete = available[length - 1] == b'\n';
        reader.consume(length);
        if complete {
            return Ok(Some(line));
        }
    }
}

fn read_stderr(mut stderr: impl Read, destination: &Mutex<BoundedTail>) {
    let mut buffer = [0_u8; 4096];
    while let Ok(count) = stderr.read(&mut buffer) {
        if count == 0 {
            return;
        }
        if let Ok(mut tail) = destination.lock() {
            tail.push(&buffer[..count]);
        }
    }
}

struct BoundedTail {
    bytes: VecDeque<u8>,
    capacity: usize,
}

impl BoundedTail {
    fn new(capacity: usize) -> Self {
        Self {
            bytes: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    fn push(&mut self, bytes: &[u8]) {
        if bytes.len() >= self.capacity {
            self.bytes.clear();
            self.bytes
                .extend(bytes[bytes.len() - self.capacity..].iter().copied());
            return;
        }
        while self.bytes.len() + bytes.len() > self.capacity {
            self.bytes.pop_front();
        }
        self.bytes.extend(bytes.iter().copied());
    }

    fn render(&self) -> String {
        if self.bytes.is_empty() {
            String::new()
        } else {
            let bytes = self.bytes.iter().copied().collect::<Vec<_>>();
            format!(
                "\nHarness stderr tail:\n{}",
                String::from_utf8_lossy(&bytes)
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use serde_json::json;

    use crate::protocol::Notification;

    use super::{BoundedTail, MAX_PROTOCOL_LINE_BYTES, RunProjection, read_protocol_line};

    #[test]
    fn stderr_tail_keeps_only_the_latest_bytes() {
        let mut tail = BoundedTail::new(5);
        tail.push(b"abc");
        tail.push(b"defg");
        assert!(tail.render().ends_with("cdefg"));
    }

    #[test]
    fn protocol_lines_are_bounded() {
        let input = vec![b'x'; MAX_PROTOCOL_LINE_BYTES + 1];
        assert!(read_protocol_line(&mut Cursor::new(input)).is_err());
    }

    #[test]
    fn projection_waits_for_receipt_and_returns_committed_text() {
        let mut projection = RunProjection::new("root", "message-1", 4096);
        assert!(
            !projection
                .observe(&notification(
                    "session.status",
                    json!({"sessionId":"root","status":"idle"}),
                ))
                .expect("pre-receipt idle is ignored")
        );
        projection
            .observe(&notification(
                "session.event",
                json!({
                    "sessionId":"root",
                    "event":{"type":"agent/inbox/spliced","data":{"inserted":[{"id":"message-1"}]}}
                }),
            ))
            .expect("receipt is accepted");
        projection
            .observe(&notification(
                "session.event",
                json!({
                    "sessionId":"root",
                    "event":{"type":"assistant/message","data":{"message":{"content":[{"type":"text","text":"done"}]}}}
                }),
            ))
            .expect("assistant message is accepted");
        projection
            .observe(&notification(
                "session.event",
                json!({
                    "sessionId":"root",
                    "event":{"type":"turn/end","data":{"reason":{"kind":"completed"}}}
                }),
            ))
            .expect("turn end is accepted");
        assert!(
            projection
                .observe(&notification(
                    "session.status",
                    json!({"sessionId":"root","status":"idle"}),
                ))
                .expect("idle completes the interval")
        );
        let result = projection.finish().expect("projection is valid");
        assert_eq!(result.final_response, "done");
        assert_eq!(result.finish_reason.as_deref(), Some("completed"));
        assert_eq!(result.notifications.len(), 4);
    }

    #[test]
    fn projection_enforces_the_event_byte_budget() {
        let mut projection = RunProjection::new("root", "message-1", 1);
        assert!(
            projection
                .observe(&notification(
                    "session.event",
                    json!({
                        "sessionId":"root",
                        "event":{"type":"agent/inbox/spliced","data":{"inserted":[{"id":"message-1"}]}}
                    }),
                ))
                .is_err()
        );
    }

    fn notification(method: &str, params: serde_json::Value) -> Notification {
        Notification {
            method: method.to_owned(),
            params,
        }
    }
}
