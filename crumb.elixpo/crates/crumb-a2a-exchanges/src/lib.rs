//! Durable, content-free lifecycle views for local A2A exchanges.
//!
//! The store deliberately cannot represent peer text, filenames, paths,
//! credentials, provider/model errors, or tool output. Records contain only
//! strict transport identities, digests, counts, timestamps, and a finite
//! monotonic state under `<workspace>/.crumb/a2a/exchanges`.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

pub const EXCHANGE_SCHEMA_VERSION: u32 = 1;
pub const MAX_EXCHANGE_RECORDS: usize = 2_048;
pub const MAX_EXCHANGE_RECORD_BYTES: usize = 16 * 1_024;
/// Covers one response message, status message, 32 artifacts, and 64 history
/// messages at the protocol's 32-parts-per-container bound.
pub const MAX_RECORDED_PARTS: u32 = 4_096;
pub const AUTOMATIC_EXCHANGE_RETENTION_MS: u64 = 7 * 24 * 60 * 60 * 1_000;
pub const AUTOMATIC_EXCHANGE_RETAIN_LATEST: usize = 512;

const LOCK_FILE: &str = ".ledger.lock";
const INSTANCE_ID_PREFIX: &str = "crumb_";
const INSTANCE_ID_HEX_BYTES: usize = 32;
const DELIVERY_ID_PREFIX: &str = "delivery_";
const DELIVERY_ID_HEX_BYTES: usize = 64;
const DIGEST_HEX_BYTES: usize = 64;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ExchangeRetentionPolicy {
    compact_before_ms: u64,
    retain_latest: usize,
}

impl ExchangeRetentionPolicy {
    /// Creates a bounded terminal-record retention policy.
    ///
    /// # Errors
    ///
    /// Returns an error for a zero cutoff or an oversized retained generation.
    pub fn new(compact_before_ms: u64, retain_latest: usize) -> Result<Self> {
        if compact_before_ms == 0 {
            bail!("A2A exchange compaction cutoff must be nonzero");
        }
        if retain_latest > MAX_EXCHANGE_RECORDS {
            bail!("A2A exchange retained generation exceeds the record limit");
        }
        Ok(Self {
            compact_before_ms,
            retain_latest,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ExchangeCompaction {
    pub examined: usize,
    pub removed: usize,
    pub retained: usize,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExchangeDirection {
    Outbound,
    Inbound,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExchangeState {
    OutboundSent,
    OutboundResponseAvailable,
    OutboundAcknowledged,
    InboundClaimed,
    InboundRunning,
    InboundCompleted,
    InboundRejected,
}

impl ExchangeState {
    #[must_use]
    pub const fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::OutboundAcknowledged | Self::InboundCompleted | Self::InboundRejected
        )
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NewExchange {
    pub delivery_id: String,
    pub direction: ExchangeDirection,
    pub peer_instance_id: String,
    pub request_digest: String,
    pub request_part_count: u32,
    pub request_artifact_count: u32,
}

impl NewExchange {
    fn state(&self) -> ExchangeState {
        match self.direction {
            ExchangeDirection::Outbound => ExchangeState::OutboundSent,
            ExchangeDirection::Inbound => ExchangeState::InboundClaimed,
        }
    }

    fn validate(&self) -> Result<()> {
        validate_delivery_id(&self.delivery_id)?;
        validate_instance_id(&self.peer_instance_id)?;
        validate_digest(&self.request_digest, "request digest")?;
        validate_counts(self.request_part_count, self.request_artifact_count)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExchangeRecord {
    pub schema_version: u32,
    pub delivery_id: String,
    pub direction: ExchangeDirection,
    pub peer_instance_id: String,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub request_digest: String,
    pub request_part_count: u32,
    pub request_artifact_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub correlated_delivery_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response_digest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response_part_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response_artifact_count: Option<u32>,
    pub state: ExchangeState,
}

impl ExchangeRecord {
    /// Validates all persisted identifiers and cross-field invariants.
    ///
    /// # Errors
    ///
    /// Returns an error for malformed, unsupported, or inconsistent metadata.
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != EXCHANGE_SCHEMA_VERSION {
            bail!("unsupported A2A exchange schema");
        }
        validate_delivery_id(&self.delivery_id)?;
        validate_instance_id(&self.peer_instance_id)?;
        validate_digest(&self.request_digest, "request digest")?;
        validate_counts(self.request_part_count, self.request_artifact_count)?;
        if self.created_at_ms == 0 || self.updated_at_ms < self.created_at_ms {
            bail!("A2A exchange timestamps are invalid");
        }
        match (
            &self.correlated_delivery_id,
            &self.response_digest,
            self.response_part_count,
            self.response_artifact_count,
        ) {
            (None, None, None, None) => {}
            (Some(delivery), Some(digest), Some(parts), Some(artifacts)) => {
                validate_delivery_id(delivery)?;
                validate_digest(digest, "response digest")?;
                validate_counts(parts, artifacts)?;
            }
            (Some(delivery), Some(digest), None, None) => {
                validate_delivery_id(delivery)?;
                validate_digest(digest, "response digest")?;
            }
            _ => bail!("A2A exchange response metadata is incomplete"),
        }
        let has_response = self.response_digest.is_some();
        match (self.direction, self.state, has_response) {
            (ExchangeDirection::Outbound, ExchangeState::OutboundSent, false)
            | (
                ExchangeDirection::Outbound,
                ExchangeState::OutboundResponseAvailable | ExchangeState::OutboundAcknowledged,
                true,
            )
            | (
                ExchangeDirection::Inbound,
                ExchangeState::InboundClaimed | ExchangeState::InboundRunning,
                false,
            )
            | (
                ExchangeDirection::Inbound,
                ExchangeState::InboundCompleted | ExchangeState::InboundRejected,
                true,
            ) => Ok(()),
            _ => bail!("A2A exchange direction, state, and response metadata disagree"),
        }
    }

    fn compatible(&self, new: &NewExchange) -> bool {
        self.delivery_id == new.delivery_id
            && self.direction == new.direction
            && self.peer_instance_id == new.peer_instance_id
            && self.request_digest == new.request_digest
            && self.request_part_count == new.request_part_count
            && self.request_artifact_count == new.request_artifact_count
    }
}

#[derive(Clone, Debug)]
pub struct ExchangeStore {
    workspace: PathBuf,
    root: PathBuf,
}

impl ExchangeStore {
    #[must_use]
    pub fn for_workspace(workspace: &Path) -> Self {
        Self {
            workspace: workspace.to_path_buf(),
            root: workspace.join(".crumb").join("a2a").join("exchanges"),
        }
    }

    /// Creates or idempotently loads one compatible exchange record.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid metadata, unsafe storage, or a full ledger.
    pub fn record(&self, new: &NewExchange) -> Result<ExchangeRecord> {
        new.validate()?;
        let root = self.ensure_root()?;
        let _lock = acquire_lock(&root)?;
        let path = record_path(&root, &new.delivery_id)?;
        if path_exists(&path)? {
            let record = read_record(&path)?;
            if record.compatible(new) {
                return Ok(record);
            }
            bail!("A2A exchange exists with incompatible metadata");
        }
        let mut record_count = record_paths(&root)?.len();
        if record_count >= MAX_EXCHANGE_RECORDS {
            let cutoff = now_ms()?
                .saturating_sub(AUTOMATIC_EXCHANGE_RETENTION_MS)
                .max(1);
            compact_locked(
                &root,
                ExchangeRetentionPolicy::new(cutoff, AUTOMATIC_EXCHANGE_RETAIN_LATEST)?,
            )?;
            record_count = record_paths(&root)?.len();
        }
        if record_count >= MAX_EXCHANGE_RECORDS {
            bail!("A2A exchange ledger reached the record limit");
        }
        let now = now_ms()?;
        let record = ExchangeRecord {
            schema_version: EXCHANGE_SCHEMA_VERSION,
            delivery_id: new.delivery_id.clone(),
            direction: new.direction,
            peer_instance_id: new.peer_instance_id.clone(),
            created_at_ms: now,
            updated_at_ms: now,
            request_digest: new.request_digest.clone(),
            request_part_count: new.request_part_count,
            request_artifact_count: new.request_artifact_count,
            correlated_delivery_id: None,
            response_digest: None,
            response_part_count: None,
            response_artifact_count: None,
            state: new.state(),
        };
        atomic_new(&root, &path, &record)?;
        Ok(record)
    }

    /// Loads one exact content-free exchange record.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid/unknown identifier or unsafe metadata.
    pub fn load(&self, delivery_id: &str) -> Result<ExchangeRecord> {
        validate_delivery_id(delivery_id)?;
        let root = self.inspect_root()?;
        let _lock = acquire_lock(&root)?;
        let record = read_record(&record_path(&root, delivery_id)?)?;
        if record.delivery_id != delivery_id {
            bail!("A2A exchange does not match its filename");
        }
        Ok(record)
    }

    /// Lists strict exchange records in deterministic creation order.
    ///
    /// # Errors
    ///
    /// Returns an error when existing ledger storage is unsafe or malformed.
    pub fn list(&self) -> Result<Vec<ExchangeRecord>> {
        let root = match self.inspect_root() {
            Ok(root) => root,
            Err(error) if is_missing(&error) => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        let _lock = acquire_lock(&root)?;
        let mut records = Vec::new();
        for path in record_paths(&root)? {
            let record = read_record(&path)?;
            if path != record_path(&root, &record.delivery_id)? {
                bail!("A2A exchange does not match its filename");
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

    /// Removes only terminal records allowed by the supplied retention policy.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid policy or unsafe ledger storage.
    pub fn compact(&self, policy: ExchangeRetentionPolicy) -> Result<ExchangeCompaction> {
        let policy = ExchangeRetentionPolicy::new(policy.compact_before_ms, policy.retain_latest)?;
        let root = self.inspect_root()?;
        let _lock = acquire_lock(&root)?;
        compact_locked(&root, policy)
    }

    /// Marks a claimed or retry-pending inbound exchange as running.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid identifier, storage, or transition.
    pub fn mark_running(&self, delivery_id: &str) -> Result<ExchangeRecord> {
        self.transition(delivery_id, ExchangeState::InboundRunning, None)
    }

    /// Touches an active inbound exchange after transport release.
    ///
    /// The monotonic persisted state remains active; callers derive the
    /// retry-pending presentation from the authoritative transport queue.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid identifier, storage, or transition.
    pub fn touch_retryable(&self, delivery_id: &str) -> Result<ExchangeRecord> {
        self.update(delivery_id, |record| {
            if !matches!(
                record.state,
                ExchangeState::InboundClaimed | ExchangeState::InboundRunning
            ) {
                bail!("only an active inbound exchange can be retried");
            }
            Ok(())
        })
    }

    /// Completes an inbound exchange with content-free response identity.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid response metadata, storage, or transition.
    pub fn mark_completed(
        &self,
        delivery_id: &str,
        response: ResponseMetadata,
    ) -> Result<ExchangeRecord> {
        self.transition(delivery_id, ExchangeState::InboundCompleted, Some(response))
    }

    /// Rejects an inbound exchange with content-free response identity.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid response metadata, storage, or transition.
    pub fn mark_rejected(
        &self,
        delivery_id: &str,
        response: ResponseMetadata,
    ) -> Result<ExchangeRecord> {
        self.transition(delivery_id, ExchangeState::InboundRejected, Some(response))
    }

    /// Records a correlated response becoming available to an outbound exchange.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid response metadata, storage, or transition.
    pub fn mark_response_available(
        &self,
        delivery_id: &str,
        response: ResponseMetadata,
    ) -> Result<ExchangeRecord> {
        self.transition(
            delivery_id,
            ExchangeState::OutboundResponseAvailable,
            Some(response),
        )
    }

    /// Marks an outbound response as acknowledged by this instance.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid identifier, storage, or transition.
    pub fn mark_acknowledged(&self, delivery_id: &str) -> Result<ExchangeRecord> {
        self.transition(delivery_id, ExchangeState::OutboundAcknowledged, None)
    }

    fn transition(
        &self,
        delivery_id: &str,
        target: ExchangeState,
        response: Option<ResponseMetadata>,
    ) -> Result<ExchangeRecord> {
        self.update(delivery_id, |record| {
            if record.state == target {
                if response.as_ref().is_none_or(|value| value.matches(record)) {
                    return Ok(());
                }
                bail!("A2A exchange transition conflicts with response metadata");
            }
            if !valid_transition(record.state, target) {
                bail!("invalid A2A exchange state transition");
            }
            if let Some(response) = response {
                response.validate()?;
                record.correlated_delivery_id = Some(response.delivery_id);
                record.response_digest = Some(response.digest);
                record.response_part_count = response.part_count;
                record.response_artifact_count = response.artifact_count;
            }
            record.state = target;
            Ok(())
        })
    }

    fn update(
        &self,
        delivery_id: &str,
        mutation: impl FnOnce(&mut ExchangeRecord) -> Result<()>,
    ) -> Result<ExchangeRecord> {
        validate_delivery_id(delivery_id)?;
        let root = self.inspect_root()?;
        let _lock = acquire_lock(&root)?;
        let path = record_path(&root, delivery_id)?;
        let mut record = read_record(&path)?;
        if record.delivery_id != delivery_id {
            bail!("A2A exchange does not match its filename");
        }
        mutation(&mut record)?;
        record.updated_at_ms = next_timestamp(record.updated_at_ms)?;
        record.validate()?;
        atomic_replace(&root, &path, &record)?;
        Ok(record)
    }

    fn ensure_root(&self) -> Result<PathBuf> {
        inspect_workspace(&self.workspace)?;
        let crumb = self.workspace.join(".crumb");
        ensure_directory(&crumb, "Crumb metadata directory")?;
        let a2a = crumb.join("a2a");
        ensure_directory(&a2a, "A2A metadata directory")?;
        ensure_directory(&self.root, "A2A exchange ledger")?;
        Ok(self.root.clone())
    }

    fn inspect_root(&self) -> Result<PathBuf> {
        inspect_workspace(&self.workspace)?;
        inspect_directory(&self.workspace.join(".crumb"), "Crumb metadata directory")?;
        inspect_directory(
            &self.workspace.join(".crumb").join("a2a"),
            "A2A metadata directory",
        )?;
        inspect_directory(&self.root, "A2A exchange ledger")?;
        Ok(self.root.clone())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResponseMetadata {
    pub delivery_id: String,
    pub digest: String,
    pub part_count: Option<u32>,
    pub artifact_count: Option<u32>,
}

impl ResponseMetadata {
    /// Validates response correlation, digest, and optional counts.
    ///
    /// # Errors
    ///
    /// Returns an error for malformed identifiers, digests, or counts.
    pub fn validate(&self) -> Result<()> {
        validate_delivery_id(&self.delivery_id)?;
        validate_digest(&self.digest, "response digest")?;
        match (self.part_count, self.artifact_count) {
            (Some(parts), Some(artifacts)) => validate_counts(parts, artifacts),
            (None, None) => Ok(()),
            _ => bail!("A2A response counts are incomplete"),
        }
    }

    fn matches(&self, record: &ExchangeRecord) -> bool {
        record.correlated_delivery_id.as_deref() == Some(&self.delivery_id)
            && record.response_digest.as_deref() == Some(&self.digest)
            && record.response_part_count == self.part_count
            && record.response_artifact_count == self.artifact_count
    }
}

fn valid_transition(current: ExchangeState, target: ExchangeState) -> bool {
    matches!(
        (current, target),
        (
            ExchangeState::OutboundSent,
            ExchangeState::OutboundResponseAvailable
        ) | (
            ExchangeState::OutboundResponseAvailable,
            ExchangeState::OutboundAcknowledged
        ) | (
            ExchangeState::InboundClaimed,
            ExchangeState::InboundRunning
                | ExchangeState::InboundCompleted
                | ExchangeState::InboundRejected
        ) | (
            ExchangeState::InboundRunning,
            ExchangeState::InboundCompleted | ExchangeState::InboundRejected
        )
    )
}

fn compact_locked(root: &Path, policy: ExchangeRetentionPolicy) -> Result<ExchangeCompaction> {
    let paths = record_paths(root)?;
    let examined = paths.len();
    let mut terminal = Vec::new();
    for path in paths {
        let record = read_record(&path)?;
        if path != record_path(root, &record.delivery_id)? {
            bail!("A2A exchange does not match its filename");
        }
        if record.state.is_terminal() {
            terminal.push((record.updated_at_ms, record.delivery_id, path));
        }
    }
    terminal.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    let removable = terminal.len().saturating_sub(policy.retain_latest);
    let mut removed = 0;
    for (updated_at_ms, _delivery_id, path) in terminal.into_iter().take(removable) {
        if updated_at_ms >= policy.compact_before_ms {
            continue;
        }
        remove_record(&path)?;
        removed += 1;
    }
    if removed > 0 {
        sync_directory(root)?;
    }
    Ok(ExchangeCompaction {
        examined,
        removed,
        retained: examined.saturating_sub(removed),
    })
}

fn validate_counts(parts: u32, artifacts: u32) -> Result<()> {
    if parts > MAX_RECORDED_PARTS || artifacts > parts {
        bail!("A2A exchange part counts exceed protocol bounds");
    }
    Ok(())
}

fn validate_delivery_id(value: &str) -> Result<()> {
    validate_prefixed_hex(
        value,
        DELIVERY_ID_PREFIX,
        DELIVERY_ID_HEX_BYTES,
        "delivery identifier",
    )
}

fn validate_instance_id(value: &str) -> Result<()> {
    validate_prefixed_hex(
        value,
        INSTANCE_ID_PREFIX,
        INSTANCE_ID_HEX_BYTES,
        "peer instance identifier",
    )
}

fn validate_prefixed_hex(value: &str, prefix: &str, bytes: usize, label: &str) -> Result<()> {
    let Some(hex) = value.strip_prefix(prefix) else {
        bail!("A2A exchange {label} has an invalid prefix");
    };
    validate_lower_hex(hex, bytes, label)
}

fn validate_digest(value: &str, label: &str) -> Result<()> {
    validate_lower_hex(value, DIGEST_HEX_BYTES, label)
}

fn validate_lower_hex(value: &str, bytes: usize, label: &str) -> Result<()> {
    if value.len() != bytes
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        bail!("A2A exchange {label} is malformed");
    }
    Ok(())
}

fn record_path(root: &Path, delivery_id: &str) -> Result<PathBuf> {
    validate_delivery_id(delivery_id)?;
    Ok(root.join(format!("{delivery_id}.json")))
}

fn inspect_workspace(workspace: &Path) -> Result<()> {
    let metadata =
        fs::symlink_metadata(workspace).context("A2A exchange workspace is unavailable")?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
        bail!("A2A exchange workspace must be a directory, not a symlink");
    }
    Ok(())
}

fn ensure_directory(path: &Path, label: &str) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(_) => inspect_directory(path, label)?,
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

fn record_paths(root: &Path) -> Result<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for entry in fs::read_dir(root).context("A2A exchange ledger could not be read")? {
        let path = entry
            .context("A2A exchange entry could not be read")?
            .path();
        let metadata = fs::symlink_metadata(&path).context("A2A exchange entry is unsafe")?;
        if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
            bail!("A2A exchange ledger may contain only regular files");
        }
        let filename = path
            .file_name()
            .and_then(|value| value.to_str())
            .context("A2A exchange filename must be UTF-8")?;
        if filename == LOCK_FILE {
            continue;
        }
        let delivery_id = filename
            .strip_suffix(".json")
            .context("A2A exchange ledger contains an unsupported file")?;
        validate_delivery_id(delivery_id)?;
        if metadata.len() > MAX_EXCHANGE_RECORD_BYTES as u64 {
            bail!("A2A exchange record exceeds its byte limit");
        }
        paths.push(path);
        if paths.len() > MAX_EXCHANGE_RECORDS {
            bail!("A2A exchange ledger exceeds its record limit");
        }
    }
    Ok(paths)
}

struct LedgerLock {
    _file: File,
}

fn acquire_lock(root: &Path) -> Result<LedgerLock> {
    let path = root.join(LOCK_FILE);
    let file = match OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(&path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let metadata =
                fs::symlink_metadata(&path).context("A2A exchange lock is unavailable")?;
            if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
                bail!("A2A exchange lock must be a regular file");
            }
            OpenOptions::new().read(true).write(true).open(&path)?
        }
        Err(error) => return Err(error).context("A2A exchange lock could not be created"),
    };
    set_private_file_permissions(&file)?;
    file.lock()
        .context("A2A exchange lock could not be acquired")?;
    Ok(LedgerLock { _file: file })
}

fn read_record(path: &Path) -> Result<ExchangeRecord> {
    let metadata = fs::symlink_metadata(path).context("A2A exchange record is unavailable")?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        bail!("A2A exchange record must be a regular file");
    }
    if metadata.len() > MAX_EXCHANGE_RECORD_BYTES as u64 {
        bail!("A2A exchange record exceeds its byte limit");
    }
    let mut encoded = Vec::with_capacity(usize::try_from(metadata.len())?);
    File::open(path)?
        .take(u64::try_from(MAX_EXCHANGE_RECORD_BYTES + 1)?)
        .read_to_end(&mut encoded)?;
    if encoded.len() > MAX_EXCHANGE_RECORD_BYTES {
        bail!("A2A exchange record exceeds its byte limit");
    }
    let record: ExchangeRecord = serde_json::from_slice(&encoded)?;
    record.validate()?;
    Ok(record)
}

fn atomic_new(root: &Path, path: &Path, record: &ExchangeRecord) -> Result<()> {
    let mut temporary = tempfile::NamedTempFile::new_in(root)?;
    write_record(&mut temporary, record)?;
    temporary
        .persist_noclobber(path)
        .map_err(|error| error.error)?;
    sync_directory(root)
}

fn atomic_replace(root: &Path, path: &Path, record: &ExchangeRecord) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        bail!("A2A exchange record must be a regular file");
    }
    let mut temporary = tempfile::NamedTempFile::new_in(root)?;
    write_record(&mut temporary, record)?;
    temporary.persist(path).map_err(|error| error.error)?;
    sync_directory(root)
}

fn write_record(file: &mut tempfile::NamedTempFile, record: &ExchangeRecord) -> Result<()> {
    record.validate()?;
    let encoded = serde_json::to_vec(record)?;
    if encoded.len() > MAX_EXCHANGE_RECORD_BYTES {
        bail!("A2A exchange record exceeds its byte limit");
    }
    set_private_file_permissions(file.as_file())?;
    file.write_all(&encoded)?;
    file.as_file_mut().sync_all()?;
    Ok(())
}

fn path_exists(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn remove_record(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path).context("A2A exchange record is unavailable")?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        bail!("A2A exchange record must be a regular file");
    }
    fs::remove_file(path).context("A2A exchange record could not be compacted")
}

fn next_timestamp(previous: u64) -> Result<u64> {
    Ok(now_ms()?.max(previous.saturating_add(1)))
}

fn now_ms() -> Result<u64> {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    u64::try_from(millis).context("system timestamp exceeds the supported range")
}

fn is_missing(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause
            .downcast_ref::<std::io::Error>()
            .is_some_and(|error| error.kind() == std::io::ErrorKind::NotFound)
    })
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
    File::open(path)?.sync_all()?;
    Ok(())
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use sha2::{Digest as _, Sha256};
    use tempfile::TempDir;

    use super::*;

    fn delivery(byte: char) -> String {
        format!("delivery_{}", byte.to_string().repeat(64))
    }

    fn instance(byte: char) -> String {
        format!("crumb_{}", byte.to_string().repeat(32))
    }

    fn digest(value: &str) -> String {
        format!("{:x}", Sha256::digest(value.as_bytes()))
    }

    fn new(direction: ExchangeDirection) -> NewExchange {
        NewExchange {
            delivery_id: delivery('a'),
            direction,
            peer_instance_id: instance('b'),
            request_digest: digest("request"),
            request_part_count: 2,
            request_artifact_count: 1,
        }
    }

    fn response() -> ResponseMetadata {
        ResponseMetadata {
            delivery_id: delivery('c'),
            digest: digest("response"),
            part_count: Some(1),
            artifact_count: Some(0),
        }
    }

    #[test]
    fn outbound_lifecycle_is_durable_and_content_free() {
        let workspace = TempDir::new().expect("workspace");
        let store = ExchangeStore::for_workspace(workspace.path());
        store
            .record(&new(ExchangeDirection::Outbound))
            .expect("sent");
        store
            .mark_response_available(&delivery('a'), response())
            .expect("response");
        store.mark_acknowledged(&delivery('a')).expect("ack");
        let record = store.load(&delivery('a')).expect("load");
        assert_eq!(record.state, ExchangeState::OutboundAcknowledged);
        assert_eq!(record.correlated_delivery_id, Some(delivery('c')));
        let encoded = std::fs::read_to_string(
            workspace
                .path()
                .join(".crumb/a2a/exchanges")
                .join(format!("{}.json", delivery('a'))),
        )
        .expect("encoded");
        for forbidden in ["secret", "filename", "path", "provider", "tool"] {
            assert!(!encoded.contains(forbidden));
        }
    }

    #[test]
    fn inbound_retry_does_not_regress_state() {
        let workspace = TempDir::new().expect("workspace");
        let store = ExchangeStore::for_workspace(workspace.path());
        store
            .record(&new(ExchangeDirection::Inbound))
            .expect("claim");
        store.mark_running(&delivery('a')).expect("running");
        store.touch_retryable(&delivery('a')).expect("retry");
        let record = store.load(&delivery('a')).expect("load");
        assert_eq!(record.state, ExchangeState::InboundRunning);
        store.mark_running(&delivery('a')).expect("resume");
    }

    #[test]
    fn list_before_first_exchange_is_empty() {
        let workspace = TempDir::new().expect("workspace");
        assert_eq!(
            ExchangeStore::for_workspace(workspace.path())
                .list()
                .expect("list"),
            Vec::new()
        );
    }

    #[test]
    fn compaction_removes_only_old_terminal_records() {
        let workspace = TempDir::new().expect("workspace");
        let store = ExchangeStore::for_workspace(workspace.path());
        let mut terminal = new(ExchangeDirection::Inbound);
        terminal.delivery_id = delivery('a');
        let mut active = new(ExchangeDirection::Inbound);
        active.delivery_id = delivery('b');
        store.record(&terminal).expect("terminal create");
        store
            .mark_completed(&terminal.delivery_id, response())
            .expect("terminal completion");
        store.record(&active).expect("active create");

        let result = store
            .compact(ExchangeRetentionPolicy::new(u64::MAX, 0).expect("policy"))
            .expect("compact");
        assert_eq!(result.removed, 1);
        assert!(store.load(&terminal.delivery_id).is_err());
        assert_eq!(
            store
                .load(&active.delivery_id)
                .expect("active retained")
                .state,
            ExchangeState::InboundClaimed
        );
    }

    #[test]
    fn rejects_symlinked_exchange_root() {
        let workspace = TempDir::new().expect("workspace");
        std::fs::create_dir(workspace.path().join(".crumb")).expect("crumb");
        std::fs::create_dir(workspace.path().join(".crumb/a2a")).expect("a2a");
        #[cfg(unix)]
        {
            let outside = TempDir::new().expect("outside");
            std::os::unix::fs::symlink(
                outside.path(),
                workspace.path().join(".crumb/a2a/exchanges"),
            )
            .expect("symlink");
        }
        #[cfg(unix)]
        assert!(
            ExchangeStore::for_workspace(workspace.path())
                .record(&new(ExchangeDirection::Outbound))
                .is_err()
        );
    }
}
