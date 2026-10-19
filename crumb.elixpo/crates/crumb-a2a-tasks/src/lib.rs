//! Redacted, workspace-local lifecycle records for accepted A2A deliveries.
//!
//! Records intentionally contain no message body, tool arguments or output,
//! filenames, paths, credentials, or provider error text. The caller owns the
//! trusted workspace boundary; this crate stores only strict identifiers,
//! digests, counts, timestamps, and a finite redacted state vocabulary under
//! `<workspace>/.crumb/a2a/tasks`.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

/// Current on-disk A2A task ledger schema.
pub const TASK_SCHEMA_VERSION: u32 = 1;
/// Maximum retained task records in one workspace.
pub const MAX_TASK_RECORDS: usize = 1_024;
/// Minimum age of terminal records reclaimed automatically when the ledger is full.
pub const AUTOMATIC_TASK_RETENTION_MS: u64 = 7 * 24 * 60 * 60 * 1_000;
/// Newest terminal records protected during automatic compaction.
pub const AUTOMATIC_TASK_RETAIN_LATEST: usize = 256;
/// Maximum accepted encoded size of one task record.
pub const MAX_TASK_RECORD_BYTES: usize = 16 * 1024;
/// A2A 1.0 bounds a message to at most 32 parts.
pub const MAX_RECORDED_PARTS: u32 = 32;

const INSTANCE_ID_PREFIX: &str = "crumb_";
const INSTANCE_ID_HEX_BYTES: usize = 32;
const DELIVERY_ID_PREFIX: &str = "delivery_";
const DELIVERY_ID_HEX_BYTES: usize = 64;
const SHA256_HEX_BYTES: usize = 64;
const TASK_LOCK_FILE: &str = ".ledger.lock";

/// Explicit, time-safe task retention policy.
///
/// Only terminal records updated strictly before `compact_before_ms` may be
/// removed. In addition, the newest `retain_latest` terminal records are
/// always retained, regardless of age. Active records are never eligible.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TaskRetentionPolicy {
    compact_before_ms: u64,
    retain_latest: usize,
}

impl TaskRetentionPolicy {
    /// Creates a validated retention policy.
    ///
    /// # Errors
    ///
    /// Returns an error for a zero cutoff or a retained generation larger
    /// than the bounded ledger itself.
    pub fn new(compact_before_ms: u64, retain_latest: usize) -> Result<Self> {
        if compact_before_ms == 0 {
            bail!("A2A task compaction cutoff must be nonzero");
        }
        if retain_latest > MAX_TASK_RECORDS {
            bail!("A2A task retained generation exceeds the record limit");
        }
        Ok(Self {
            compact_before_ms,
            retain_latest,
        })
    }
}

/// Content-free result of one task-ledger compaction pass.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TaskCompaction {
    pub examined: usize,
    pub removed: usize,
    pub retained: usize,
}

/// Persisted lifecycle state. Transitions are monotonic and terminal states
/// cannot be reopened.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskState {
    Claimed,
    Running,
    Completed,
    Rejected,
    Failed,
}

impl TaskState {
    const fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Rejected | Self::Failed)
    }
}

/// Finite, content-free failure categories suitable for persistence.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureCategory {
    Cancelled,
    InvalidResponse,
    LimitReached,
    PermissionDenied,
    ProviderRejected,
    ProviderUnavailable,
    Transport,
    Internal,
}

/// Optional durable response identity. Both fields are validated identifiers,
/// never response content.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResponseRecord {
    pub delivery_id: String,
    pub digest: String,
}

impl ResponseRecord {
    /// Constructs validated response metadata.
    ///
    /// # Errors
    ///
    /// Returns an error unless the delivery identifier and SHA-256 digest use
    /// their canonical lowercase encodings.
    pub fn new(delivery_id: impl Into<String>, digest: impl Into<String>) -> Result<Self> {
        let value = Self {
            delivery_id: delivery_id.into(),
            digest: digest.into(),
        };
        value.validate()?;
        Ok(value)
    }

    fn validate(&self) -> Result<()> {
        validate_delivery_id(&self.delivery_id)?;
        validate_digest(&self.digest, "response digest")
    }
}

/// Caller-supplied, already-redacted identity for a newly claimed delivery.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NewTask {
    pub delivery_id: String,
    pub request_digest: String,
    pub sender_instance_id: String,
    pub text_part_count: u32,
    pub artifact_count: u32,
}

impl NewTask {
    fn validate(&self) -> Result<()> {
        validate_delivery_id(&self.delivery_id)?;
        validate_digest(&self.request_digest, "request digest")?;
        validate_instance_id(&self.sender_instance_id)?;
        validate_part_counts(self.text_part_count, self.artifact_count)
    }
}

/// Strict persisted record. Its vocabulary cannot contain raw peer content.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskRecord {
    pub schema_version: u32,
    pub delivery_id: String,
    pub request_digest: String,
    pub sender_instance_id: String,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub text_part_count: u32,
    pub artifact_count: u32,
    pub state: TaskState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure_category: Option<FailureCategory>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response: Option<ResponseRecord>,
}

impl TaskRecord {
    /// Validates the complete on-disk record and its cross-field invariants.
    ///
    /// # Errors
    ///
    /// Returns an error for an unsupported schema, malformed identifier,
    /// invalid count or timestamp, or state-incompatible optional metadata.
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != TASK_SCHEMA_VERSION {
            bail!("unsupported A2A task schema {}", self.schema_version);
        }
        validate_delivery_id(&self.delivery_id)?;
        validate_digest(&self.request_digest, "request digest")?;
        validate_instance_id(&self.sender_instance_id)?;
        if self.created_at_ms == 0 || self.updated_at_ms < self.created_at_ms {
            bail!("A2A task timestamps are invalid");
        }
        validate_part_counts(self.text_part_count, self.artifact_count)?;
        if let Some(response) = &self.response {
            response.validate()?;
        }
        match self.state {
            TaskState::Claimed | TaskState::Running => {
                if self.failure_category.is_some() || self.response.is_some() {
                    bail!("active A2A task contains terminal metadata");
                }
            }
            TaskState::Completed => {
                if self.failure_category.is_some() || self.response.is_none() {
                    bail!("completed A2A task requires only response metadata");
                }
            }
            TaskState::Rejected => {
                if self.failure_category.is_some() {
                    bail!("rejected A2A task cannot contain a failure category");
                }
            }
            TaskState::Failed => {
                if self.failure_category.is_none() || self.response.is_some() {
                    bail!("failed A2A task requires only a redacted failure category");
                }
            }
        }
        Ok(())
    }

    fn is_compatible_with(&self, new_task: &NewTask) -> bool {
        self.delivery_id == new_task.delivery_id
            && self.request_digest == new_task.request_digest
            && self.sender_instance_id == new_task.sender_instance_id
            && self.text_part_count == new_task.text_part_count
            && self.artifact_count == new_task.artifact_count
    }
}

/// Lazy ledger rooted beneath one caller-approved workspace.
#[derive(Clone, Debug)]
pub struct TaskStore {
    workspace: PathBuf,
    root: PathBuf,
}

impl TaskStore {
    /// Selects a workspace without touching the filesystem.
    #[must_use]
    pub fn for_workspace(workspace: &Path) -> Self {
        Self {
            workspace: workspace.to_path_buf(),
            root: workspace.join(".crumb").join("a2a").join("tasks"),
        }
    }

    /// Creates a claimed task, or returns the compatible record created by a
    /// concurrent or retried call.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid redacted metadata, an unsafe workspace or
    /// ledger, a full ledger, an incompatible existing delivery, or a write
    /// failure.
    pub fn create_claimed(&self, new_task: &NewTask) -> Result<TaskRecord> {
        new_task.validate()?;
        let root = self.ensure_root()?;
        let _lock = acquire_ledger_lock(&root)?;
        let path = record_path(&root, &new_task.delivery_id)?;
        if path_exists_without_following(&path)? {
            return load_compatible(&root, new_task);
        }
        let mut record_count = inspect_record_paths(&root)?.len();
        if record_count >= MAX_TASK_RECORDS {
            let now = now_ms()?;
            let policy = TaskRetentionPolicy::new(
                now.saturating_sub(AUTOMATIC_TASK_RETENTION_MS).max(1),
                AUTOMATIC_TASK_RETAIN_LATEST,
            )?;
            compact_locked(&root, policy)?;
            record_count = inspect_record_paths(&root)?.len();
        }
        if record_count >= MAX_TASK_RECORDS {
            bail!("A2A task ledger reached the {MAX_TASK_RECORDS} record limit");
        }
        let now = now_ms()?;
        let record = TaskRecord {
            schema_version: TASK_SCHEMA_VERSION,
            delivery_id: new_task.delivery_id.clone(),
            request_digest: new_task.request_digest.clone(),
            sender_instance_id: new_task.sender_instance_id.clone(),
            created_at_ms: now,
            updated_at_ms: now,
            text_part_count: new_task.text_part_count,
            artifact_count: new_task.artifact_count,
            state: TaskState::Claimed,
            failure_category: None,
            response: None,
        };
        record.validate()?;
        match atomic_write_new(&root, &path, &record) {
            Ok(()) => Ok(record),
            Err(error)
                if error
                    .downcast_ref::<std::io::Error>()
                    .is_some_and(|io| io.kind() == std::io::ErrorKind::AlreadyExists) =>
            {
                load_compatible(&root, new_task)
            }
            Err(error) => Err(error),
        }
    }

    /// Loads one strict task record by delivery identifier.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid identifier, unsafe ledger entry, absent
    /// record, oversized or malformed JSON, or invalid record invariants.
    pub fn load(&self, delivery_id: &str) -> Result<TaskRecord> {
        validate_delivery_id(delivery_id)?;
        let root = self.inspect_root()?;
        let _lock = acquire_ledger_lock(&root)?;
        let path = record_path(&root, delivery_id)?;
        let record: TaskRecord = read_record(&path)?;
        if record.delivery_id != delivery_id {
            bail!("A2A task record does not match its filename");
        }
        Ok(record)
    }

    /// Lists every strict record in deterministic creation/identifier order.
    ///
    /// # Errors
    ///
    /// Returns an error when the ledger is absent, unsafe, overfull, or
    /// contains any malformed entry.
    pub fn list(&self) -> Result<Vec<TaskRecord>> {
        let root = self.inspect_root()?;
        let _lock = acquire_ledger_lock(&root)?;
        let paths = inspect_record_paths(&root)?;
        let mut records = Vec::with_capacity(paths.len());
        for path in paths {
            let record: TaskRecord = read_record(&path)?;
            if path != record_path(&root, &record.delivery_id)? {
                bail!("A2A task record does not match its filename");
            }
            records.push(record);
        }
        records.sort_by(|left, right| {
            left.created_at_ms
                .cmp(&right.created_at_ms)
                .then_with(|| left.delivery_id.cmp(&right.delivery_id))
        });
        Ok(records)
    }

    /// Removes old terminal records under an explicit retention horizon.
    ///
    /// Compaction is serialized with creates and transitions. Every record is
    /// validated before deletion begins. Claimed/running records, records at
    /// or after the cutoff, and the newest retained generation are never
    /// removed. Retrying a compaction is safe.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid policy, unsafe ledger, malformed
    /// record, or filesystem failure.
    pub fn compact(&self, policy: TaskRetentionPolicy) -> Result<TaskCompaction> {
        let policy = TaskRetentionPolicy::new(policy.compact_before_ms, policy.retain_latest)?;
        let root = self.inspect_root()?;
        let _lock = acquire_ledger_lock(&root)?;
        compact_locked(&root, policy)
    }

    /// Advances a claimed task to running.
    ///
    /// # Errors
    ///
    /// Returns an error for an unknown or unsafe record, or unless the task is
    /// currently claimed (or already running).
    pub fn mark_running(&self, delivery_id: &str) -> Result<TaskRecord> {
        self.transition(delivery_id, TaskState::Running, None, None)
    }

    /// Completes a running task with validated response identity.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid response metadata, an unknown or unsafe
    /// record, or a conflicting/non-running transition.
    pub fn mark_completed(
        &self,
        delivery_id: &str,
        response: ResponseRecord,
    ) -> Result<TaskRecord> {
        self.transition(delivery_id, TaskState::Completed, None, Some(response))
    }

    /// Rejects a claimed task. A durable rejection response may be recorded.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid response metadata, an unknown or unsafe
    /// record, or a conflicting/non-claimed transition.
    pub fn mark_rejected(
        &self,
        delivery_id: &str,
        response: Option<ResponseRecord>,
    ) -> Result<TaskRecord> {
        self.transition(delivery_id, TaskState::Rejected, None, response)
    }

    /// Terminates a claimed or running task with one finite failure category.
    ///
    /// # Errors
    ///
    /// Returns an error for an unknown or unsafe record, or a conflicting or
    /// already-terminal transition.
    pub fn mark_failed(&self, delivery_id: &str, category: FailureCategory) -> Result<TaskRecord> {
        self.transition(delivery_id, TaskState::Failed, Some(category), None)
    }

    fn transition(
        &self,
        delivery_id: &str,
        target: TaskState,
        failure_category: Option<FailureCategory>,
        response: Option<ResponseRecord>,
    ) -> Result<TaskRecord> {
        validate_delivery_id(delivery_id)?;
        if let Some(response) = &response {
            response.validate()?;
        }
        let root = self.inspect_root()?;
        let _lock = acquire_ledger_lock(&root)?;
        let path = record_path(&root, delivery_id)?;
        let mut record: TaskRecord = read_record(&path)?;
        if record.delivery_id != delivery_id {
            bail!("A2A task record does not match its filename");
        }
        if record.state == target {
            if record.failure_category == failure_category && record.response == response {
                return Ok(record);
            }
            bail!("A2A task transition conflicts with existing terminal metadata");
        }
        if !valid_transition(record.state, target) {
            bail!(
                "invalid A2A task transition from {:?} to {:?}",
                record.state,
                target
            );
        }
        record.state = target;
        record.failure_category = failure_category;
        record.response = response;
        record.updated_at_ms = next_timestamp(record.updated_at_ms)?;
        record.validate()?;
        atomic_replace(&root, &path, &record)?;
        Ok(record)
    }

    fn ensure_root(&self) -> Result<PathBuf> {
        inspect_workspace(&self.workspace)?;
        let crumb = self.workspace.join(".crumb");
        ensure_private_directory(&crumb, "Crumb metadata directory")?;
        let a2a = crumb.join("a2a");
        ensure_private_directory(&a2a, "A2A metadata directory")?;
        ensure_private_directory(&self.root, "A2A task ledger")?;
        Ok(self.root.clone())
    }

    fn inspect_root(&self) -> Result<PathBuf> {
        inspect_workspace(&self.workspace)?;
        inspect_directory(&self.workspace.join(".crumb"), "Crumb metadata directory")?;
        inspect_directory(
            &self.workspace.join(".crumb").join("a2a"),
            "A2A metadata directory",
        )?;
        inspect_directory(&self.root, "A2A task ledger")?;
        Ok(self.root.clone())
    }
}

fn load_compatible(root: &Path, new_task: &NewTask) -> Result<TaskRecord> {
    let path = record_path(root, &new_task.delivery_id)?;
    let record = read_record(&path)?;
    if record.delivery_id != new_task.delivery_id {
        bail!("A2A task record does not match its filename");
    }
    if !record.is_compatible_with(new_task) {
        bail!("A2A task delivery already exists with different metadata");
    }
    Ok(record)
}

fn compact_locked(root: &Path, policy: TaskRetentionPolicy) -> Result<TaskCompaction> {
    let paths = inspect_record_paths(root)?;
    let examined = paths.len();
    let mut terminal = Vec::new();
    for path in paths {
        let record = read_record(&path)?;
        if path != record_path(root, &record.delivery_id)? {
            bail!("A2A task record does not match its filename");
        }
        if record.state.is_terminal() {
            terminal.push((record.updated_at_ms, record.delivery_id, path));
        }
    }
    terminal.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    let removable_generation = terminal.len().saturating_sub(policy.retain_latest);
    let mut removed = 0;
    for (updated_at_ms, _delivery_id, path) in terminal.into_iter().take(removable_generation) {
        if updated_at_ms >= policy.compact_before_ms {
            continue;
        }
        remove_record(&path)?;
        removed += 1;
    }
    if removed > 0 {
        sync_directory(root).context("A2A task ledger could not sync after compaction")?;
    }
    Ok(TaskCompaction {
        examined,
        removed,
        retained: examined.saturating_sub(removed),
    })
}

fn valid_transition(current: TaskState, target: TaskState) -> bool {
    if current.is_terminal() {
        return false;
    }
    matches!(
        (current, target),
        (
            TaskState::Claimed,
            TaskState::Running | TaskState::Rejected | TaskState::Failed
        ) | (TaskState::Running, TaskState::Completed | TaskState::Failed)
    )
}

fn validate_part_counts(text: u32, artifacts: u32) -> Result<()> {
    if text > MAX_RECORDED_PARTS
        || artifacts > MAX_RECORDED_PARTS
        || text.saturating_add(artifacts) > MAX_RECORDED_PARTS
    {
        bail!("A2A task part counts exceed the protocol limit");
    }
    Ok(())
}

fn validate_instance_id(value: &str) -> Result<()> {
    validate_prefixed_hex(
        value,
        INSTANCE_ID_PREFIX,
        INSTANCE_ID_HEX_BYTES,
        "sender instance identifier",
    )
}

fn validate_delivery_id(value: &str) -> Result<()> {
    validate_prefixed_hex(
        value,
        DELIVERY_ID_PREFIX,
        DELIVERY_ID_HEX_BYTES,
        "delivery identifier",
    )
}

fn validate_digest(value: &str, label: &str) -> Result<()> {
    validate_lower_hex(value, SHA256_HEX_BYTES, label)
}

fn validate_prefixed_hex(value: &str, prefix: &str, hex_bytes: usize, label: &str) -> Result<()> {
    let Some(hex) = value.strip_prefix(prefix) else {
        bail!("A2A task {label} has an invalid prefix");
    };
    validate_lower_hex(hex, hex_bytes, label)
}

fn validate_lower_hex(value: &str, bytes: usize, label: &str) -> Result<()> {
    if value.len() != bytes
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        bail!("A2A task {label} is malformed");
    }
    Ok(())
}

fn record_path(root: &Path, delivery_id: &str) -> Result<PathBuf> {
    validate_delivery_id(delivery_id)?;
    Ok(root.join(format!("{delivery_id}.json")))
}

fn inspect_workspace(workspace: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(workspace).context("A2A task workspace is unavailable")?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
        bail!("A2A task workspace must be a directory, not a symlink");
    }
    Ok(())
}

fn ensure_private_directory(path: &Path, label: &str) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
                bail!("{label} must be a directory, not a symlink");
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => match fs::create_dir(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                inspect_directory(path, label)?;
            }
            Err(error) => {
                return Err(error).with_context(|| format!("{label} could not be created"));
            }
        },
        Err(error) => return Err(error).with_context(|| format!("{label} could not be inspected")),
    }
    set_private_directory_permissions(path).with_context(|| format!("{label} is not private"))
}

fn inspect_directory(path: &Path, label: &str) -> Result<()> {
    let metadata = fs::symlink_metadata(path).with_context(|| format!("{label} is unavailable"))?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
        bail!("{label} must be a directory, not a symlink");
    }
    Ok(())
}

fn inspect_record_paths(root: &Path) -> Result<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for entry in fs::read_dir(root).context("A2A task ledger could not be read")? {
        let entry = entry.context("A2A task ledger entry could not be read")?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path).context("A2A task ledger entry is unsafe")?;
        if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
            bail!("A2A task ledger may contain only regular record files");
        }
        if metadata.len() > MAX_TASK_RECORD_BYTES as u64 {
            bail!("A2A task record exceeds the byte limit");
        }
        let filename = path
            .file_name()
            .and_then(|name| name.to_str())
            .context("A2A task record filename must be UTF-8")?;
        if filename == TASK_LOCK_FILE {
            continue;
        }
        let delivery_id = filename
            .strip_suffix(".json")
            .context("A2A task ledger contains an unsupported file")?;
        validate_delivery_id(delivery_id)?;
        paths.push(path);
        if paths.len() > MAX_TASK_RECORDS {
            bail!("A2A task ledger exceeds the record limit");
        }
    }
    Ok(paths)
}

struct LedgerLock {
    _file: File,
}

fn acquire_ledger_lock(root: &Path) -> Result<LedgerLock> {
    let path = root.join(TASK_LOCK_FILE);
    let file = match OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(&path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(&path)
                .context("A2A task ledger lock could not be inspected")?;
            if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
                bail!("A2A task ledger lock must be a regular file, not a symlink");
            }
            OpenOptions::new()
                .read(true)
                .write(true)
                .open(&path)
                .context("A2A task ledger lock could not be opened")?
        }
        Err(error) => return Err(error).context("A2A task ledger lock could not be created"),
    };
    let path_metadata =
        fs::symlink_metadata(&path).context("A2A task ledger lock could not be inspected")?;
    let file_metadata = file
        .metadata()
        .context("A2A task ledger lock could not be inspected after opening")?;
    if path_metadata.file_type().is_symlink()
        || !path_metadata.file_type().is_file()
        || !file_metadata.is_file()
    {
        bail!("A2A task ledger lock must be a regular file, not a symlink");
    }
    set_private_file_permissions(&file).context("A2A task ledger lock is not private")?;
    file.lock()
        .context("A2A task ledger lock could not be acquired")?;
    Ok(LedgerLock { _file: file })
}

fn read_record(path: &Path) -> Result<TaskRecord> {
    let metadata = fs::symlink_metadata(path).context("A2A task record is unavailable")?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        bail!("A2A task record must be a regular file, not a symlink");
    }
    if metadata.len() > MAX_TASK_RECORD_BYTES as u64 {
        bail!("A2A task record exceeds the byte limit");
    }
    let capacity =
        usize::try_from(metadata.len()).context("A2A task record size is unsupported")?;
    let read_limit =
        u64::try_from(MAX_TASK_RECORD_BYTES + 1).context("A2A task record limit is unsupported")?;
    let mut encoded = Vec::with_capacity(capacity);
    File::open(path)
        .context("A2A task record could not be opened")?
        .take(read_limit)
        .read_to_end(&mut encoded)
        .context("A2A task record could not be read")?;
    if encoded.len() > MAX_TASK_RECORD_BYTES {
        bail!("A2A task record exceeds the byte limit");
    }
    let record: TaskRecord =
        serde_json::from_slice(&encoded).context("A2A task record is malformed")?;
    record.validate()?;
    Ok(record)
}

fn atomic_write_new(root: &Path, path: &Path, record: &TaskRecord) -> Result<()> {
    let mut temporary = tempfile::NamedTempFile::new_in(root)
        .context("temporary A2A task record could not be created")?;
    write_record(&mut temporary, record)?;
    temporary
        .persist_noclobber(path)
        .map_err(|error| error.error)
        .context("A2A task record could not be created")?;
    sync_directory(root).context("A2A task ledger could not sync")
}

fn atomic_replace(root: &Path, path: &Path, record: &TaskRecord) -> Result<()> {
    let metadata = fs::symlink_metadata(path).context("A2A task record is unavailable")?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        bail!("A2A task record must be a regular file, not a symlink");
    }
    let mut temporary = tempfile::NamedTempFile::new_in(root)
        .context("temporary A2A task record could not be created")?;
    write_record(&mut temporary, record)?;
    temporary
        .persist(path)
        .map_err(|error| error.error)
        .context("A2A task record could not be replaced")?;
    sync_directory(root).context("A2A task ledger could not sync")
}

fn write_record(file: &mut tempfile::NamedTempFile, record: &TaskRecord) -> Result<()> {
    record.validate()?;
    let encoded = serde_json::to_vec(record).context("A2A task record could not be encoded")?;
    if encoded.len() > MAX_TASK_RECORD_BYTES {
        bail!("A2A task record exceeds the byte limit");
    }
    set_private_file_permissions(file.as_file())
        .context("temporary A2A task record is not private")?;
    file.write_all(&encoded)
        .context("temporary A2A task record could not be written")?;
    file.as_file_mut()
        .sync_all()
        .context("temporary A2A task record could not sync")
}

fn path_exists_without_following(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error).context("A2A task path could not be inspected"),
    }
}

fn remove_record(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path).context("A2A task record is unavailable")?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        bail!("A2A task record must be a regular file, not a symlink");
    }
    fs::remove_file(path).context("A2A task record could not be compacted")
}

fn next_timestamp(previous: u64) -> Result<u64> {
    Ok(now_ms()?.max(previous.saturating_add(1)))
}

fn now_ms() -> Result<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system clock is before the Unix epoch")?
        .as_millis();
    u64::try_from(millis).context("system timestamp exceeds the supported range")
}

#[cfg(unix)]
fn set_private_file_permissions(file: &File) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt as _;
    file.set_permissions(fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn set_private_file_permissions(_file: &File) -> std::io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt as _;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<()> {
    File::open(path)
        .context("A2A task directory could not be opened")?
        .sync_all()
        .context("A2A task directory could not sync")
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::{Arc, Barrier};
    use std::thread;

    use sha2::{Digest as _, Sha256};
    use tempfile::TempDir;

    use super::*;

    fn delivery(byte: char) -> String {
        format!("delivery_{}", byte.to_string().repeat(64))
    }

    fn numbered_delivery(number: usize) -> String {
        format!("delivery_{number:064x}")
    }

    fn instance(byte: char) -> String {
        format!("crumb_{}", byte.to_string().repeat(32))
    }

    fn digest(value: &str) -> String {
        format!("{:x}", Sha256::digest(value.as_bytes()))
    }

    fn fixture() -> (TempDir, TaskStore) {
        let workspace = TempDir::new().expect("workspace");
        let store = TaskStore::for_workspace(workspace.path());
        (workspace, store)
    }

    fn task(byte: char) -> NewTask {
        NewTask {
            delivery_id: delivery(byte),
            request_digest: digest(&format!("request-{byte}")),
            sender_instance_id: instance(byte),
            text_part_count: 1,
            artifact_count: 1,
        }
    }

    fn response(byte: char) -> ResponseRecord {
        ResponseRecord::new(delivery(byte), digest(&format!("response-{byte}"))).expect("response")
    }

    fn numbered_task(number: usize) -> NewTask {
        NewTask {
            delivery_id: numbered_delivery(number),
            request_digest: digest(&format!("request-{number}")),
            sender_instance_id: instance('a'),
            text_part_count: 1,
            artifact_count: 0,
        }
    }

    fn write_record_for_task(root: &Path, task: &NewTask, state: TaskState, updated_at_ms: u64) {
        let record = TaskRecord {
            schema_version: TASK_SCHEMA_VERSION,
            delivery_id: task.delivery_id.clone(),
            request_digest: task.request_digest.clone(),
            sender_instance_id: task.sender_instance_id.clone(),
            created_at_ms: 1,
            updated_at_ms,
            text_part_count: task.text_part_count,
            artifact_count: task.artifact_count,
            state,
            failure_category: (state == TaskState::Failed).then_some(FailureCategory::Internal),
            response: None,
        };
        record.validate().expect("valid fixture record");
        let path = record_path(root, &record.delivery_id).expect("record path");
        fs::write(path, serde_json::to_vec(&record).expect("encode")).expect("write record");
    }

    #[test]
    fn lifecycle_is_strict_monotonic_and_idempotent() {
        let (_workspace, store) = fixture();
        let claimed = store.create_claimed(&task('a')).expect("claimed");
        let claimed_again = store.create_claimed(&task('a')).expect("idempotent create");
        assert_eq!(claimed, claimed_again);

        let running = store.mark_running(&delivery('a')).expect("running");
        assert_eq!(running.state, TaskState::Running);
        assert!(running.updated_at_ms > claimed.updated_at_ms);
        assert_eq!(
            running,
            store
                .mark_running(&delivery('a'))
                .expect("idempotent running")
        );

        let completed = store
            .mark_completed(&delivery('a'), response('b'))
            .expect("completed");
        assert_eq!(completed.state, TaskState::Completed);
        assert_eq!(completed.response, Some(response('b')));
        assert_eq!(
            completed,
            store
                .mark_completed(&delivery('a'), response('b'))
                .expect("idempotent completed")
        );
        assert!(store.mark_completed(&delivery('a'), response('c')).is_err());
        assert!(
            store
                .mark_failed(&delivery('a'), FailureCategory::Internal)
                .is_err()
        );
    }

    #[test]
    fn rejected_and_failed_states_enforce_metadata_invariants() {
        let (_workspace, store) = fixture();
        store.create_claimed(&task('a')).expect("first");
        let rejected = store
            .mark_rejected(&delivery('a'), Some(response('b')))
            .expect("rejected");
        assert_eq!(rejected.state, TaskState::Rejected);
        assert!(rejected.failure_category.is_none());

        store.create_claimed(&task('c')).expect("second");
        store.mark_running(&delivery('c')).expect("running");
        let failed = store
            .mark_failed(&delivery('c'), FailureCategory::ProviderUnavailable)
            .expect("failed");
        assert_eq!(failed.state, TaskState::Failed);
        assert_eq!(
            failed.failure_category,
            Some(FailureCategory::ProviderUnavailable)
        );
        assert_eq!(
            failed,
            store
                .mark_failed(&delivery('c'), FailureCategory::ProviderUnavailable)
                .expect("idempotent failure")
        );
        assert!(
            store
                .mark_failed(&delivery('c'), FailureCategory::Transport)
                .is_err()
        );
    }

    #[test]
    fn incompatible_create_and_invalid_transitions_are_rejected() {
        let (_workspace, store) = fixture();
        store.create_claimed(&task('a')).expect("claimed");
        let mut changed = task('a');
        changed.request_digest = digest("different");
        assert!(store.create_claimed(&changed).is_err());
        assert!(store.mark_completed(&delivery('a'), response('b')).is_err());

        store.mark_running(&delivery('a')).expect("running");
        assert!(store.mark_rejected(&delivery('a'), None).is_err());
    }

    #[test]
    fn persisted_record_contains_only_the_redacted_schema() {
        let (workspace, store) = fixture();
        let secret = "TOP-SECRET peer body and /absolute/workspace/file.txt";
        let mut new_task = task('a');
        new_task.request_digest = digest(secret);
        store.create_claimed(&new_task).expect("claimed");
        let path = workspace
            .path()
            .join(".crumb/a2a/tasks")
            .join(format!("{}.json", delivery('a')));
        let encoded = fs::read_to_string(path).expect("record");
        assert!(!encoded.contains(secret));
        assert!(!encoded.contains("absolute"));
        let value: serde_json::Value = serde_json::from_str(&encoded).expect("json");
        let object = value.as_object().expect("object");
        assert_eq!(
            object
                .keys()
                .cloned()
                .collect::<std::collections::BTreeSet<_>>(),
            [
                "artifactCount",
                "createdAtMs",
                "deliveryId",
                "requestDigest",
                "schemaVersion",
                "senderInstanceId",
                "state",
                "textPartCount",
                "updatedAtMs",
            ]
            .into_iter()
            .map(str::to_owned)
            .collect()
        );
    }

    #[test]
    fn list_is_bounded_validated_and_deterministic() {
        let (_workspace, store) = fixture();
        store.create_claimed(&task('b')).expect("b");
        store.create_claimed(&task('a')).expect("a");
        let records = store.list().expect("list");
        assert_eq!(records.len(), 2);
        assert!(records.windows(2).all(|window| {
            (window[0].created_at_ms, &window[0].delivery_id)
                <= (window[1].created_at_ms, &window[1].delivery_id)
        }));
    }

    #[test]
    fn record_limit_is_enforced_before_an_additional_create() {
        let (workspace, store) = fixture();
        let root = store.ensure_root().expect("ledger root");
        for index in 0..MAX_TASK_RECORDS {
            let record = TaskRecord {
                schema_version: TASK_SCHEMA_VERSION,
                delivery_id: numbered_delivery(index),
                request_digest: digest(&format!("request-{index}")),
                sender_instance_id: instance('a'),
                created_at_ms: u64::try_from(index).expect("index") + 1,
                updated_at_ms: u64::try_from(index).expect("index") + 1,
                text_part_count: 1,
                artifact_count: 0,
                state: TaskState::Claimed,
                failure_category: None,
                response: None,
            };
            let path = record_path(&root, &record.delivery_id).expect("record path");
            fs::write(path, serde_json::to_vec(&record).expect("encode")).expect("write record");
        }
        assert_eq!(store.list().expect("bounded list").len(), MAX_TASK_RECORDS);
        let extra = NewTask {
            delivery_id: numbered_delivery(MAX_TASK_RECORDS),
            request_digest: digest("extra"),
            sender_instance_id: instance('b'),
            text_part_count: 1,
            artifact_count: 0,
        };
        assert!(store.create_claimed(&extra).is_err());
        drop(workspace);
    }

    #[test]
    fn compaction_removes_only_old_terminal_records_and_preserves_recent_idempotency() {
        let (_workspace, store) = fixture();
        let root = store.ensure_root().expect("ledger root");
        let old = numbered_task(1);
        let recent = numbered_task(2);
        let active = numbered_task(3);
        write_record_for_task(&root, &old, TaskState::Failed, 10);
        write_record_for_task(&root, &recent, TaskState::Failed, 100);
        write_record_for_task(&root, &active, TaskState::Running, 5);

        let report = store
            .compact(TaskRetentionPolicy::new(50, 0).expect("policy"))
            .expect("compact");
        assert_eq!(
            report,
            TaskCompaction {
                examined: 3,
                removed: 1,
                retained: 2,
            }
        );
        assert!(store.load(&old.delivery_id).is_err());
        assert_eq!(
            store.load(&active.delivery_id).expect("active").state,
            TaskState::Running
        );
        let duplicate = store.create_claimed(&recent).expect("recent duplicate");
        assert_eq!(duplicate.state, TaskState::Failed);
        assert_eq!(
            store
                .compact(TaskRetentionPolicy::new(50, 0).expect("policy"))
                .expect("repeat")
                .removed,
            0
        );
    }

    #[test]
    fn full_ledger_reclaims_only_old_terminal_generation() {
        let (_workspace, store) = fixture();
        let root = store.ensure_root().expect("ledger root");
        for index in 0..MAX_TASK_RECORDS {
            write_record_for_task(&root, &numbered_task(index), TaskState::Failed, 1);
        }
        let extra = numbered_task(MAX_TASK_RECORDS);
        store
            .create_claimed(&extra)
            .expect("create after automatic compaction");
        let records = store.list().expect("compacted ledger");
        assert_eq!(records.len(), AUTOMATIC_TASK_RETAIN_LATEST + 1);
        assert!(
            records
                .iter()
                .any(|record| record.delivery_id == extra.delivery_id)
        );
    }

    #[test]
    fn strict_decoder_rejects_unknown_fields_and_oversized_records() {
        let (workspace, store) = fixture();
        store.create_claimed(&task('a')).expect("claimed");
        let root = workspace.path().join(".crumb/a2a/tasks");
        let path = root.join(format!("{}.json", delivery('a')));
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).expect("read")).expect("json");
        value["rawBody"] = serde_json::Value::String("forbidden".to_owned());
        fs::write(&path, serde_json::to_vec(&value).expect("encode")).expect("write");
        assert!(store.load(&delivery('a')).is_err());

        let oversized = root.join(format!("{}.json", delivery('b')));
        fs::write(oversized, vec![b'x'; MAX_TASK_RECORD_BYTES + 1]).expect("oversized");
        assert!(store.list().is_err());
    }

    #[test]
    fn malformed_identifiers_and_part_counts_are_rejected() {
        let (_workspace, store) = fixture();
        let mut invalid = task('a');
        invalid.sender_instance_id = "crumb_NOT_HEX".to_owned();
        assert!(store.create_claimed(&invalid).is_err());
        let mut too_many = task('b');
        too_many.text_part_count = 20;
        too_many.artifact_count = 20;
        assert!(store.create_claimed(&too_many).is_err());
        assert!(ResponseRecord::new(delivery('a'), "A".repeat(64)).is_err());
    }

    #[test]
    fn concurrent_compatible_create_converges_on_one_record() {
        let (workspace, store) = fixture();
        let store = Arc::new(store);
        let barrier = Arc::new(Barrier::new(3));
        let mut workers = Vec::new();
        for _ in 0..2 {
            let worker_store = Arc::clone(&store);
            let worker_barrier = Arc::clone(&barrier);
            workers.push(thread::spawn(move || {
                worker_barrier.wait();
                worker_store.create_claimed(&task('a'))
            }));
        }
        barrier.wait();
        for worker in workers {
            worker.join().expect("worker").expect("create");
        }
        assert_eq!(store.list().expect("list").len(), 1);
        drop(workspace);
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_roots_and_records_are_rejected() {
        use std::os::unix::fs::symlink;

        let workspace = TempDir::new().expect("workspace");
        let outside = TempDir::new().expect("outside");
        fs::create_dir(workspace.path().join(".crumb")).expect("crumb");
        symlink(outside.path(), workspace.path().join(".crumb/a2a")).expect("root symlink");
        let store = TaskStore::for_workspace(workspace.path());
        assert!(store.create_claimed(&task('a')).is_err());

        let (workspace, store) = fixture();
        store.create_claimed(&task('b')).expect("record");
        let path = workspace
            .path()
            .join(".crumb/a2a/tasks")
            .join(format!("{}.json", delivery('b')));
        fs::remove_file(&path).expect("remove");
        let target = workspace.path().join("target.json");
        fs::write(&target, "{}").expect("target");
        symlink(target, path).expect("record symlink");
        assert!(store.load(&delivery('b')).is_err());

        let (lock_workspace, lock_store) = fixture();
        lock_store
            .create_claimed(&task('c'))
            .expect("lock fixture record");
        let lock = lock_workspace.path().join(".crumb/a2a/tasks/.ledger.lock");
        fs::remove_file(&lock).expect("remove ledger lock");
        symlink("missing", &lock).expect("ledger lock symlink");
        assert!(lock_store.list().is_err());
    }

    #[cfg(unix)]
    #[test]
    fn files_and_directories_are_private() {
        use std::os::unix::fs::PermissionsExt as _;

        let (workspace, store) = fixture();
        store.create_claimed(&task('a')).expect("record");
        let root = workspace.path().join(".crumb/a2a/tasks");
        let path = root.join(format!("{}.json", delivery('a')));
        assert_eq!(
            fs::metadata(root).expect("root").permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(path).expect("record").permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(workspace.path().join(".crumb/a2a/tasks/.ledger.lock"))
                .expect("ledger lock")
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}
