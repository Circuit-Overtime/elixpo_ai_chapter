//! Cancellable, append-only agent session primitives.

use std::fs::{self, File, OpenOptions};
use std::future::Future;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::task::{Context as TaskContext, Poll, Waker};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::config::AgentMode;

/// Validated directory-safe session identifier.
#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(transparent)]
pub struct SessionId(String);

impl SessionId {
    /// Creates a validated session identifier.
    ///
    /// # Errors
    ///
    /// Returns an error when the value is empty, too long, or not directory-safe.
    pub fn new(value: impl Into<String>) -> Result<Self> {
        let value = value.into();
        if value.is_empty()
            || value.len() > 64
            || !value.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            bail!("session id must contain 1-64 ASCII letters, numbers, dashes, or underscores");
        }
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Cloneable cancellation signal shared by Ctrl+C, the agent loop, and tools.
#[derive(Debug, Default)]
struct CancellationState {
    cancelled: AtomicBool,
    waiters: Mutex<Vec<Waker>>,
}

#[derive(Clone, Debug, Default)]
pub struct CancellationToken(Arc<CancellationState>);

impl CancellationToken {
    pub fn cancel(&self) {
        if !self.0.cancelled.swap(true, Ordering::AcqRel)
            && let Ok(mut waiters) = self.0.waiters.lock()
        {
            for waiter in waiters.drain(..) {
                waiter.wake();
            }
        }
    }

    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        self.0.cancelled.load(Ordering::Acquire)
    }

    /// Returns whether two handles signal the same cancellation boundary.
    #[must_use]
    pub fn shares_signal_with(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }

    /// Resolves as soon as this token is cancelled without polling a timer.
    #[must_use]
    pub fn cancelled(&self) -> CancellationFuture<'_> {
        CancellationFuture { token: self }
    }
}

/// Borrowed future returned by [`CancellationToken::cancelled`].
pub struct CancellationFuture<'a> {
    token: &'a CancellationToken,
}

impl Future for CancellationFuture<'_> {
    type Output = ();

    fn poll(self: Pin<&mut Self>, context: &mut TaskContext<'_>) -> Poll<Self::Output> {
        if self.token.is_cancelled() {
            return Poll::Ready(());
        }
        let Ok(mut waiters) = self.token.0.waiters.lock() else {
            return Poll::Ready(());
        };
        if self.token.is_cancelled() {
            return Poll::Ready(());
        }
        if !waiters
            .iter()
            .any(|waiter| waiter.will_wake(context.waker()))
        {
            waiters.push(context.waker().clone());
        }
        Poll::Pending
    }
}

/// Persisted event vocabulary. Raw prompts, tool arguments, credentials, and
/// unfiltered command output are intentionally absent.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SessionEvent {
    SessionStarted {
        at_ms: u64,
        session_id: SessionId,
        workspace: PathBuf,
        mode: AgentMode,
    },
    TurnStarted {
        at_ms: u64,
        request_bytes: usize,
        request_digest: String,
    },
    MemoryRetrieved {
        at_ms: u64,
        record_ids: Vec<String>,
        conflict_topics: Vec<String>,
        omitted: usize,
    },
    ToolRequested {
        at_ms: u64,
        name: String,
        risk: crate::tools::RiskClass,
        arguments_digest: String,
    },
    ToolFinished {
        at_ms: u64,
        name: String,
        success: bool,
        output_bytes: usize,
    },
    TurnFinished {
        at_ms: u64,
        status: TurnStatus,
        steps: u32,
        tool_calls: u32,
    },
    ModeChanged {
        at_ms: u64,
        mode: AgentMode,
    },
    ModelSelected {
        at_ms: u64,
        provider: String,
        model: String,
        reasoning_effort: Option<String>,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnStatus {
    Complete,
    Cancelled,
    Failed,
    LimitReached,
}

/// Redacted metadata reconstructed from one append-only session journal.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SessionSummary {
    pub id: SessionId,
    pub label: Option<String>,
    pub archived: bool,
    pub workspace: PathBuf,
    pub mode: AgentMode,
    pub started_at_ms: u64,
    pub last_event_at_ms: u64,
    pub turns: u32,
    pub last_status: Option<TurnStatus>,
}

/// Portable session data containing only Crumb's redacted event vocabulary.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SessionExport {
    pub summary: SessionSummary,
    pub events: Vec<SessionEvent>,
}

/// A user-selected context reference persisted with one agent session.
///
/// Only the typed reference is stored. File contents are resolved, bounded,
/// and redacted again immediately before each turn.
#[derive(Clone, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(tag = "kind", content = "path", rename_all = "snake_case")]
pub enum SessionAttachment {
    File(PathBuf),
    Folder(PathBuf),
}

impl SessionAttachment {
    #[must_use]
    pub fn display_reference(&self) -> String {
        match self {
            Self::File(path) => format!("@file:{}", path.display()),
            Self::Folder(path) => format!("@folder:{}", path.display()),
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(default, deny_unknown_fields)]
struct SessionMetadata {
    label: Option<String>,
    archived: bool,
    attachments: Vec<SessionAttachment>,
}

/// Lists valid session journals newest-first without loading prompt content.
///
/// # Errors
///
/// Returns an error when the session root cannot be read. Invalid individual
/// entries are skipped so one damaged journal does not hide healthy sessions.
pub fn list_sessions(root: &Path) -> Result<Vec<SessionSummary>> {
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut summaries = fs::read_dir(root)
        .with_context(|| format!("failed to read session root {}", root.display()))?
        .filter_map(std::result::Result::ok)
        .filter_map(|entry| session_summary(root, &entry.file_name().to_string_lossy()).ok())
        .collect::<Vec<_>>();
    summaries.sort_by_key(|summary| std::cmp::Reverse(summary.last_event_at_ms));
    Ok(summaries)
}

/// Reads one redacted session summary by validated identifier.
///
/// # Errors
///
/// Returns an error when the identifier or journal is invalid, missing, or
/// exceeds the bounded event count.
pub fn session_summary(root: &Path, id: &str) -> Result<SessionSummary> {
    let (mut summary, _) = load_session(root, id, false)?;
    let metadata = read_metadata(root, &summary.id)?;
    summary.label = metadata.label;
    summary.archived = metadata.archived;
    Ok(summary)
}

/// Searches redacted session identifiers, labels, modes, and statuses.
///
/// # Errors
///
/// Returns an error when the query is empty or the session root cannot be read.
pub fn search_sessions(root: &Path, query: &str) -> Result<Vec<SessionSummary>> {
    let query = query.trim().to_ascii_lowercase();
    if query.is_empty() {
        bail!("session search query cannot be empty");
    }
    Ok(list_sessions(root)?
        .into_iter()
        .filter(|summary| searchable_summary(summary).contains(&query))
        .collect())
}

/// Sets or replaces a human-readable label without changing the stable ID.
///
/// # Errors
///
/// Returns an error for invalid labels or missing sessions.
pub fn set_session_label(root: &Path, id: &str, label: &str) -> Result<()> {
    let id = SessionId::new(id)?;
    validate_label(label)?;
    let mut metadata = read_metadata(root, &id)?;
    metadata.label = Some(label.trim().to_owned());
    write_metadata(root, &id, &metadata)
}

/// Changes whether a session is archived.
///
/// # Errors
///
/// Returns an error when the session is missing or metadata cannot be written.
pub fn set_session_archived(root: &Path, id: &str, archived: bool) -> Result<()> {
    let id = SessionId::new(id)?;
    let mut metadata = read_metadata(root, &id)?;
    metadata.archived = archived;
    write_metadata(root, &id, &metadata)
}

/// Returns the persistent context references selected for a session.
///
/// # Errors
///
/// Returns an error when the session is missing or its metadata is invalid.
pub fn session_attachments(root: &Path, id: &str) -> Result<Vec<SessionAttachment>> {
    let id = SessionId::new(id)?;
    Ok(read_metadata(root, &id)?.attachments)
}

/// Atomically appends a persistent context reference when it is not present.
///
/// # Errors
///
/// Returns an error when the session is missing or metadata cannot be written.
pub fn attach_session_context(
    root: &Path,
    id: &str,
    attachment: SessionAttachment,
) -> Result<bool> {
    let id = SessionId::new(id)?;
    let mut metadata = read_metadata(root, &id)?;
    if metadata.attachments.contains(&attachment) {
        return Ok(false);
    }
    metadata.attachments.push(attachment);
    metadata.attachments.sort();
    write_metadata(root, &id, &metadata)?;
    Ok(true)
}

/// Removes one persistent context reference from a session.
///
/// # Errors
///
/// Returns an error when the session is missing or metadata cannot be written.
pub fn detach_session_context(
    root: &Path,
    id: &str,
    attachment: &SessionAttachment,
) -> Result<bool> {
    let id = SessionId::new(id)?;
    let mut metadata = read_metadata(root, &id)?;
    let previous = metadata.attachments.len();
    metadata.attachments.retain(|item| item != attachment);
    if previous == metadata.attachments.len() {
        return Ok(false);
    }
    write_metadata(root, &id, &metadata)?;
    Ok(true)
}

/// Loads a portable export containing only redacted session events.
///
/// # Errors
///
/// Returns an error when the journal is missing, invalid, or oversized.
pub fn export_session(root: &Path, id: &str) -> Result<SessionExport> {
    let (mut summary, events) = load_session(root, id, true)?;
    let metadata = read_metadata(root, &summary.id)?;
    summary.label = metadata.label;
    summary.archived = metadata.archived;
    Ok(SessionExport { summary, events })
}

/// Moves a session to the root's recoverable `.trash` directory.
///
/// # Errors
///
/// Returns an error when the session is missing or cannot be moved safely.
pub fn trash_session(root: &Path, id: &str) -> Result<PathBuf> {
    let id = SessionId::new(id)?;
    let source = existing_session_directory(root, &id)?;
    let canonical_root = source
        .parent()
        .context("session directory has no configured root")?;
    let trash = root.join(".trash");
    fs::create_dir_all(&trash)
        .with_context(|| format!("failed to create session trash {}", trash.display()))?;
    let trash = fs::canonicalize(&trash)
        .with_context(|| format!("failed to resolve session trash {}", trash.display()))?;
    if !trash.starts_with(canonical_root) {
        bail!("session trash escapes its configured root");
    }
    let destination = trash.join(format!("{}-{}", id.as_str(), timestamp_ms()));
    fs::rename(&source, &destination).with_context(|| {
        format!(
            "failed to move session {} to recoverable trash",
            id.as_str()
        )
    })?;
    Ok(destination)
}

fn load_session(
    root: &Path,
    id: &str,
    include_events: bool,
) -> Result<(SessionSummary, Vec<SessionEvent>)> {
    const MAX_EVENTS: usize = 100_000;
    let id = SessionId::new(id)?;
    let path = existing_session_directory(root, &id)?.join("events.jsonl");
    let file = File::open(&path)
        .with_context(|| format!("failed to open session journal {}", path.display()))?;
    let mut summary = None;
    let mut events = Vec::new();
    for (index, line) in BufReader::new(file).lines().enumerate() {
        if index >= MAX_EVENTS {
            bail!("session journal exceeds the event limit");
        }
        let event: SessionEvent = serde_json::from_str(
            &line.with_context(|| format!("failed to read session journal {}", path.display()))?,
        )
        .with_context(|| format!("invalid session event in {}", path.display()))?;
        apply_summary_event(&mut summary, &event)?;
        if include_events {
            events.push(event);
        }
    }
    Ok((
        summary.context("session journal has no start event")?,
        events,
    ))
}

fn searchable_summary(summary: &SessionSummary) -> String {
    format!(
        "{} {} {:?} {:?}",
        summary.id.as_str(),
        summary.label.as_deref().unwrap_or_default(),
        summary.mode,
        summary.last_status
    )
    .to_ascii_lowercase()
}

fn validate_label(label: &str) -> Result<()> {
    let label = label.trim();
    if label.is_empty() || label.len() > 80 || label.chars().any(char::is_control) {
        bail!("session label must contain 1-80 printable characters");
    }
    Ok(())
}

fn existing_session_directory(root: &Path, id: &SessionId) -> Result<PathBuf> {
    let root = fs::canonicalize(root)
        .with_context(|| format!("failed to resolve session root {}", root.display()))?;
    let directory = fs::canonicalize(root.join(id.as_str()))
        .with_context(|| format!("session {} does not exist", id.as_str()))?;
    if !directory.starts_with(&root) || !directory.is_dir() {
        bail!("session directory escapes its configured root");
    }
    Ok(directory)
}

fn read_metadata(root: &Path, id: &SessionId) -> Result<SessionMetadata> {
    const MAX_METADATA_EVENTS: usize = 10_000;
    let path = existing_session_directory(root, id)?.join("metadata.jsonl");
    if !path.exists() {
        return Ok(SessionMetadata::default());
    }
    let file = File::open(&path)
        .with_context(|| format!("failed to read session metadata {}", path.display()))?;
    let mut latest = SessionMetadata::default();
    for (index, line) in BufReader::new(file).lines().enumerate() {
        if index >= MAX_METADATA_EVENTS {
            bail!("session metadata exceeds the event limit");
        }
        latest = serde_json::from_str(
            &line.with_context(|| format!("failed to read session metadata {}", path.display()))?,
        )
        .with_context(|| format!("invalid session metadata in {}", path.display()))?;
    }
    Ok(latest)
}

fn write_metadata(root: &Path, id: &SessionId, metadata: &SessionMetadata) -> Result<()> {
    let directory = existing_session_directory(root, id)?;
    let path = directory.join("metadata.jsonl");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .with_context(|| format!("failed to open session metadata {}", path.display()))?;
    serde_json::to_writer(&mut file, metadata).context("failed to serialize session metadata")?;
    file.write_all(b"\n")
        .context("failed to terminate session metadata event")?;
    file.flush().context("failed to flush session metadata")
}

fn apply_summary_event(summary: &mut Option<SessionSummary>, event: &SessionEvent) -> Result<()> {
    let at_ms = event_timestamp(event);
    if let SessionEvent::SessionStarted {
        session_id,
        workspace,
        mode,
        ..
    } = event
    {
        if summary.is_some() {
            bail!("session journal contains multiple start events");
        }
        *summary = Some(SessionSummary {
            id: session_id.clone(),
            label: None,
            archived: false,
            workspace: workspace.clone(),
            mode: *mode,
            started_at_ms: at_ms,
            last_event_at_ms: at_ms,
            turns: 0,
            last_status: None,
        });
        return Ok(());
    }
    let summary = summary
        .as_mut()
        .context("session journal event precedes its start event")?;
    summary.last_event_at_ms = at_ms;
    match event {
        SessionEvent::ModeChanged { mode, .. } => summary.mode = *mode,
        SessionEvent::TurnFinished { status, .. } => {
            summary.turns = summary.turns.saturating_add(1);
            summary.last_status = Some(*status);
        }
        _ => {}
    }
    Ok(())
}

const fn event_timestamp(event: &SessionEvent) -> u64 {
    match event {
        SessionEvent::SessionStarted { at_ms, .. }
        | SessionEvent::TurnStarted { at_ms, .. }
        | SessionEvent::MemoryRetrieved { at_ms, .. }
        | SessionEvent::ToolRequested { at_ms, .. }
        | SessionEvent::ToolFinished { at_ms, .. }
        | SessionEvent::TurnFinished { at_ms, .. }
        | SessionEvent::ModeChanged { at_ms, .. }
        | SessionEvent::ModelSelected { at_ms, .. } => *at_ms,
    }
}

/// Append-only JSONL writer for one session.
#[derive(Debug)]
pub struct SessionJournal {
    path: PathBuf,
    writer: BufWriter<File>,
}

impl SessionJournal {
    /// Opens `<root>/<session-id>/events.jsonl` for append-only writes.
    ///
    /// # Errors
    ///
    /// Returns an error when the session directory or journal cannot be opened.
    pub fn open(root: &Path, session_id: &SessionId) -> Result<Self> {
        let directory = root.join(session_id.as_str());
        fs::create_dir_all(&directory).with_context(|| {
            format!("failed to create session directory {}", directory.display())
        })?;
        let path = directory.join("events.jsonl");
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .with_context(|| format!("failed to open session journal {}", path.display()))?;
        Ok(Self {
            path,
            writer: BufWriter::new(file),
        })
    }

    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Appends and flushes one complete JSON event.
    ///
    /// # Errors
    ///
    /// Returns an error when serialization or durable writing fails.
    pub fn append(&mut self, event: &SessionEvent) -> Result<()> {
        serde_json::to_writer(&mut self.writer, event)
            .context("failed to serialize session event")?;
        self.writer
            .write_all(b"\n")
            .context("failed to terminate session event")?;
        self.writer
            .flush()
            .context("failed to flush session event")?;
        Ok(())
    }
}

/// Active session state owned by the native Crumb runtime.
#[derive(Debug)]
pub struct AgentSession {
    id: SessionId,
    mode: AgentMode,
    workspace: PathBuf,
    cancellation: CancellationToken,
    journal: SessionJournal,
}

impl AgentSession {
    /// Starts and records a session.
    ///
    /// # Errors
    ///
    /// Returns an error when its start event cannot be persisted.
    pub fn start(
        id: SessionId,
        mode: AgentMode,
        workspace: PathBuf,
        mut journal: SessionJournal,
    ) -> Result<Self> {
        journal.append(&SessionEvent::SessionStarted {
            at_ms: timestamp_ms(),
            session_id: id.clone(),
            workspace: workspace.clone(),
            mode,
        })?;
        Ok(Self {
            id,
            mode,
            workspace,
            cancellation: CancellationToken::default(),
            journal,
        })
    }

    /// Reopens a previously validated session without writing a second start
    /// event.
    #[must_use]
    pub fn resume(
        id: SessionId,
        mode: AgentMode,
        workspace: PathBuf,
        journal: SessionJournal,
    ) -> Self {
        Self {
            id,
            mode,
            workspace,
            cancellation: CancellationToken::default(),
            journal,
        }
    }

    #[must_use]
    pub fn id(&self) -> &SessionId {
        &self.id
    }

    #[must_use]
    pub fn mode(&self) -> AgentMode {
        self.mode
    }

    #[must_use]
    pub fn workspace(&self) -> &Path {
        &self.workspace
    }

    #[must_use]
    pub fn cancellation_token(&self) -> CancellationToken {
        self.cancellation.clone()
    }

    /// Changes the operating mode and appends the transition.
    ///
    /// # Errors
    ///
    /// Returns an error when the transition cannot be persisted.
    pub fn set_mode(&mut self, mode: AgentMode) -> Result<()> {
        self.mode = mode;
        self.journal.append(&SessionEvent::ModeChanged {
            at_ms: timestamp_ms(),
            mode,
        })
    }

    /// Records the effective exact-model selection and reasoning effort.
    ///
    /// # Errors
    ///
    /// Returns an error when the selection cannot be persisted.
    pub fn record_model_selection(
        &mut self,
        provider: String,
        model: String,
        reasoning_effort: Option<String>,
    ) -> Result<()> {
        self.journal.append(&SessionEvent::ModelSelected {
            at_ms: timestamp_ms(),
            provider,
            model,
            reasoning_effort,
        })
    }

    /// Records only request size and digest, never the raw prompt.
    ///
    /// # Errors
    ///
    /// Returns an error when the event cannot be persisted.
    pub fn record_turn_start(&mut self, request: &str) -> Result<()> {
        self.cancellation = CancellationToken::default();
        self.journal.append(&SessionEvent::TurnStarted {
            at_ms: timestamp_ms(),
            request_bytes: request.len(),
            request_digest: digest(request.as_bytes()),
        })
    }

    /// Records selected memory IDs and conflict topics, never memory contents.
    ///
    /// # Errors
    ///
    /// Returns an error when the event cannot be persisted.
    pub fn record_memory_retrieval(
        &mut self,
        record_ids: Vec<String>,
        conflict_topics: Vec<String>,
        omitted: usize,
    ) -> Result<()> {
        self.journal.append(&SessionEvent::MemoryRetrieved {
            at_ms: timestamp_ms(),
            record_ids,
            conflict_topics,
            omitted,
        })
    }

    /// Records only the tool name, policy risk, and argument digest.
    ///
    /// # Errors
    ///
    /// Returns an error when the event cannot be persisted.
    pub fn record_tool_request(
        &mut self,
        name: String,
        risk: crate::tools::RiskClass,
        arguments: &[u8],
    ) -> Result<()> {
        self.journal.append(&SessionEvent::ToolRequested {
            at_ms: timestamp_ms(),
            name,
            risk,
            arguments_digest: digest(arguments),
        })
    }

    /// Records bounded tool completion metadata without output content.
    ///
    /// # Errors
    ///
    /// Returns an error when the event cannot be persisted.
    pub fn record_tool_finish(
        &mut self,
        name: String,
        success: bool,
        output_bytes: usize,
    ) -> Result<()> {
        self.journal.append(&SessionEvent::ToolFinished {
            at_ms: timestamp_ms(),
            name,
            success,
            output_bytes,
        })
    }

    /// Records a terminal turn state.
    ///
    /// # Errors
    ///
    /// Returns an error when the event cannot be persisted.
    pub fn record_turn_end(
        &mut self,
        status: TurnStatus,
        steps: u32,
        tool_calls: u32,
    ) -> Result<()> {
        self.journal.append(&SessionEvent::TurnFinished {
            at_ms: timestamp_ms(),
            status,
            steps,
            tool_calls,
        })
    }
}

#[must_use]
pub fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::{AgentMode, TurnStatus};

    use super::{
        AgentSession, CancellationToken, SessionAttachment, SessionEvent, SessionId,
        SessionJournal, attach_session_context, detach_session_context, export_session,
        search_sessions, session_attachments, session_summary, set_session_archived,
        set_session_label, trash_session,
    };

    #[test]
    fn cancellation_is_shared_without_waiting() {
        let token = CancellationToken::default();
        let observer = token.clone();
        token.cancel();
        assert!(observer.is_cancelled());
    }

    #[test]
    fn session_ids_are_directory_safe() {
        assert!(SessionId::new("work_2026-08-29").is_ok());
        assert!(SessionId::new("../escape").is_err());
    }

    #[test]
    fn turn_events_do_not_contain_raw_prompts() {
        let event = SessionEvent::TurnStarted {
            at_ms: 1,
            request_bytes: 12,
            request_digest: "digest".to_owned(),
        };
        let encoded = serde_json::to_string(&event).expect("event should serialize");
        assert!(!encoded.contains("prompt"));
        assert!(encoded.contains("request_digest"));
    }

    #[test]
    fn session_lifecycle_uses_only_redacted_journal_data() {
        let root = temporary_root();
        let id = SessionId::new("fixture-session").expect("valid session id");
        let journal = SessionJournal::open(&root, &id).expect("journal opens");
        let mut session = AgentSession::start(id.clone(), AgentMode::Auto, root.clone(), journal)
            .expect("session starts");
        session
            .record_turn_start("private raw request")
            .expect("turn starts");
        session
            .record_memory_retrieval(
                vec!["mem_0123456789abcdef01234567".to_owned()],
                vec!["formatter".to_owned()],
                2,
            )
            .expect("memory retrieval is recorded");
        session
            .record_turn_end(TurnStatus::Complete, 1, 0)
            .expect("turn ends");
        drop(session);

        set_session_label(&root, id.as_str(), "release checks").expect("label is stored");
        set_session_archived(&root, id.as_str(), true).expect("session is archived");
        let summary = session_summary(&root, id.as_str()).expect("summary loads");
        assert_eq!(summary.label.as_deref(), Some("release checks"));
        assert!(summary.archived);
        assert_eq!(
            search_sessions(&root, "release")
                .expect("search succeeds")
                .len(),
            1
        );

        let encoded =
            serde_json::to_string(&export_session(&root, id.as_str()).expect("session exports"))
                .expect("export serializes");
        assert!(!encoded.contains("private raw request"));
        assert!(encoded.contains("mem_0123456789abcdef01234567"));
        assert!(encoded.contains("formatter"));
        let trashed = trash_session(&root, id.as_str()).expect("session moves to trash");
        assert!(trashed.is_dir());
        assert!(session_summary(&root, id.as_str()).is_err());
        fs::remove_dir_all(root).expect("fixture is removed");
    }

    #[test]
    fn session_context_persists_typed_references_without_contents() {
        let root = temporary_root();
        let id = SessionId::new("attachment-session").expect("valid session id");
        let journal = SessionJournal::open(&root, &id).expect("journal opens");
        drop(
            AgentSession::start(id.clone(), AgentMode::Auto, root.clone(), journal)
                .expect("session starts"),
        );
        let attachment = SessionAttachment::File("README.md".into());
        assert!(
            attach_session_context(&root, id.as_str(), attachment.clone()).expect("attachment")
        );
        assert!(!attach_session_context(&root, id.as_str(), attachment.clone()).expect("dedupe"));
        assert_eq!(
            session_attachments(&root, id.as_str()).expect("attachments"),
            vec![attachment.clone()]
        );
        assert!(detach_session_context(&root, id.as_str(), &attachment).expect("detach"));
        assert_eq!(
            session_attachments(&root, id.as_str()).expect("attachments"),
            Vec::new()
        );
        let metadata =
            fs::read_to_string(root.join(id.as_str()).join("metadata.jsonl")).expect("metadata");
        assert!(!metadata.contains("file contents"));
        fs::remove_dir_all(root).expect("fixture is removed");
    }

    fn temporary_root() -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock is valid")
            .as_nanos();
        std::env::temp_dir().join(format!("crumb-session-lifecycle-{nonce}"))
    }
}
