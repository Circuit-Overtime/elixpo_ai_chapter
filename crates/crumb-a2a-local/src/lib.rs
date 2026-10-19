//! Bounded same-machine transport for Crumb's A2A protocol models.
//!
//! A caller supplies the trusted bus root. This crate never searches home
//! directories or workspaces, performs network requests, starts threads, or
//! writes diagnostic logs. Registry records contain only public instance and
//! process metadata. Message bodies live transiently in inbox queue files and
//! are removed when acknowledged.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use crumb_a2a::{
    MAX_PARTS, MAX_WIRE_BYTES, PROTOCOL_VERSION, SendMessageRequest, SendMessageResponse, Task,
    TaskState, TaskStatus, Validate as _, to_json,
};
use crumb_instance::{InstanceMetadata, validate_instance_name};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::{Digest as _, Sha256};

/// Version of registry and queue documents owned by this crate.
pub const LOCAL_BUS_SCHEMA_VERSION: u32 = 1;
/// Maximum active registry entries under one caller-supplied bus root.
pub const MAX_PEERS: usize = 128;
/// Maximum unacknowledged messages in one instance inbox.
pub const MAX_INBOX_MESSAGES: usize = 256;
/// Maximum retained payload-free acknowledgement records per inbox.
pub const MAX_ACKNOWLEDGEMENTS: usize = 1024;
/// Minimum age of acknowledgement tombstones reclaimed automatically at capacity.
pub const AUTOMATIC_ACKNOWLEDGEMENT_RETENTION_MS: u64 = 7 * 24 * 60 * 60 * 1_000;
/// Newest acknowledgement tombstones protected during automatic compaction.
pub const AUTOMATIC_ACKNOWLEDGEMENT_RETAIN_LATEST: usize = 256;
/// Maximum immutable staged artifact files per sender instance.
pub const MAX_STAGED_ARTIFACTS: usize = 64;
/// Maximum verified peer artifact files retained in one workspace quarantine.
pub const MAX_QUARANTINED_ARTIFACTS: usize = 64;
/// Maximum encoded registry entry size.
pub const MAX_REGISTRY_BYTES: usize = 16 * 1024;
/// Maximum encoded delivery envelope size.
pub const MAX_ENVELOPE_BYTES: usize = MAX_WIRE_BYTES + 16 * 1024;
/// Maximum size of a file staged for later approval-gated import.
pub const MAX_ARTIFACT_BYTES: u64 = 8 * 1024 * 1024;
/// Maximum encoded receiver-owned quarantine receipt size.
pub const MAX_QUARANTINE_RECEIPT_BYTES: usize = 4 * 1024;

const REGISTRY_DIRECTORY: &str = "registry";
const LOCK_DIRECTORY: &str = ".locks";
const LOCK_GATE_FILE: &str = ".gate";
const INBOX_DIRECTORY: &str = "inboxes";
const ARTIFACT_DIRECTORY: &str = "artifacts";
const QUARANTINE_RECEIPT_DIRECTORY: &str = "quarantine-receipts";
const PENDING_DIRECTORY: &str = "pending";
const PROCESSING_DIRECTORY: &str = "processing";
const ACKNOWLEDGED_DIRECTORY: &str = "acknowledged";
const INSTANCE_ID_PREFIX: &str = "crumb_";
const INSTANCE_ID_HEX_BYTES: usize = 32;
const RUNTIME_ID_PREFIX: &str = "run_";
const RUNTIME_ID_HEX_BYTES: usize = 32;
const DELIVERY_ID_PREFIX: &str = "delivery_";
const DELIVERY_ID_HEX_BYTES: usize = 64;
const MAX_CLOCK_SKEW_MS: u64 = 60_000;

/// Explicit, time-safe acknowledgement retention policy.
///
/// Only tombstones acknowledged strictly before `compact_before_ms` may be
/// removed. The newest `retain_latest` tombstones are protected regardless of
/// age, preserving a deterministic retry generation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AcknowledgementRetentionPolicy {
    compact_before_ms: u64,
    retain_latest: usize,
}

impl AcknowledgementRetentionPolicy {
    /// Creates a validated acknowledgement retention policy.
    ///
    /// # Errors
    ///
    /// Returns an error for a zero cutoff or a retained generation larger
    /// than the acknowledgement bound.
    pub fn new(compact_before_ms: u64, retain_latest: usize) -> Result<Self> {
        if compact_before_ms == 0 {
            bail!("local A2A acknowledgement compaction cutoff must be nonzero");
        }
        if retain_latest > MAX_ACKNOWLEDGEMENTS {
            bail!("local A2A retained acknowledgement generation exceeds the limit");
        }
        Ok(Self {
            compact_before_ms,
            retain_latest,
        })
    }
}

/// Content-free result of one acknowledgement compaction pass.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AcknowledgementCompaction {
    pub examined: usize,
    pub removed: usize,
    pub retained: usize,
}

/// Bounds and lease policy for a local bus.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalBusOptions {
    pub lease_ttl: Duration,
}

impl Default for LocalBusOptions {
    fn default() -> Self {
        Self {
            lease_ttl: Duration::from_secs(30),
        }
    }
}

impl LocalBusOptions {
    fn validate(self) -> Result<Self> {
        if self.lease_ttl.is_zero() || self.lease_ttl > Duration::from_secs(300) {
            bail!("local A2A lease TTL must be between 1 millisecond and 5 minutes");
        }
        Ok(self)
    }

    fn lease_ttl_ms(self) -> Result<u64> {
        u64::try_from(self.lease_ttl.as_millis())
            .context("local A2A lease TTL exceeds the supported range")
    }
}

/// Non-secret process identity used to prevent one process from heartbeating
/// or unregistering another process's lease.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessMetadata {
    pub process_id: u32,
    pub started_at_ms: u64,
    pub runtime_id: String,
}

impl ProcessMetadata {
    /// Creates metadata for the calling process.
    ///
    /// # Errors
    ///
    /// Returns an error if secure randomness or the system clock is unavailable.
    pub fn current() -> Result<Self> {
        let process = Self {
            process_id: std::process::id(),
            started_at_ms: now_ms()?,
            runtime_id: random_identifier(RUNTIME_ID_PREFIX)?,
        };
        process.validate()?;
        Ok(process)
    }

    fn validate(&self) -> Result<()> {
        if self.process_id == 0 || self.started_at_ms == 0 {
            bail!("local A2A process metadata is invalid");
        }
        validate_prefixed_hex(
            &self.runtime_id,
            RUNTIME_ID_PREFIX,
            RUNTIME_ID_HEX_BYTES,
            "runtime identifier",
        )
    }
}

/// Public, non-secret lease record for one running Crumb instance.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PeerEntry {
    pub schema_version: u32,
    pub instance_id: String,
    pub name: String,
    pub inbox_endpoint: PathBuf,
    pub protocol_version: String,
    pub lease_updated_at_ms: u64,
    pub process: ProcessMetadata,
}

impl PeerEntry {
    /// Returns whether the lease has exceeded the bus TTL at `now_ms`.
    #[must_use]
    pub fn is_stale(&self, now_ms: u64, lease_ttl_ms: u64) -> bool {
        now_ms.saturating_sub(self.lease_updated_at_ms) > lease_ttl_ms
    }

    fn validate(&self, observed_at_ms: u64) -> Result<()> {
        if self.schema_version != LOCAL_BUS_SCHEMA_VERSION {
            bail!("unsupported local A2A registry schema");
        }
        validate_instance_id(&self.instance_id)?;
        validate_instance_name(&self.name)?;
        validate_inbox_endpoint(&self.instance_id, &self.inbox_endpoint)?;
        if self.protocol_version != PROTOCOL_VERSION {
            bail!("unsupported local A2A protocol version");
        }
        self.process.validate()?;
        if self.lease_updated_at_ms < self.process.started_at_ms {
            bail!("local A2A lease predates its process");
        }
        if self.lease_updated_at_ms > observed_at_ms.saturating_add(MAX_CLOCK_SKEW_MS) {
            bail!("local A2A lease is implausibly far in the future");
        }
        Ok(())
    }
}

/// Ownership handle returned by [`LocalBus::register`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Registration {
    entry: PeerEntry,
}

impl Registration {
    /// Current public peer record.
    #[must_use]
    pub fn entry(&self) -> &PeerEntry {
        &self.entry
    }

    /// Stable workspace instance identifier.
    #[must_use]
    pub fn instance_id(&self) -> &str {
        &self.entry.instance_id
    }
}

/// Receipt for an idempotently enqueued delivery.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnqueueReceipt {
    pub delivery_id: String,
    pub recipient_instance_id: String,
}

/// Content-free proof that a correlated response is durably queued or was
/// acknowledged by its recipient.
///
/// The digest covers the transport envelope's stable content fields, but this
/// projection never exposes the response body or queue paths.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompletedResponseReceipt {
    pub delivery_id: String,
    pub recipient_instance_id: String,
    pub digest: String,
}

/// Content-free receiver view of one pending inbox delivery.
///
/// This intentionally omits message text, structured data, filenames, URLs,
/// media types, metadata, and workspace paths.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingDeliverySummary {
    pub delivery_id: String,
    pub sender_instance_id: String,
    pub recipient_instance_id: String,
    pub enqueued_at_ms: u64,
    pub part_count: usize,
    pub artifact_count: usize,
}

/// Payload kind for a durable local delivery.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeliveryKind {
    Request,
    Response,
}

/// Content-free receiver view of any pending inbox delivery.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeliverySummary {
    pub delivery_id: String,
    pub sender_instance_id: String,
    pub recipient_instance_id: String,
    pub enqueued_at_ms: u64,
    pub kind: DeliveryKind,
    pub in_reply_to_delivery_id: Option<String>,
    pub part_count: usize,
    pub artifact_count: usize,
}

/// A delivery atomically claimed from an inbox.
#[derive(Clone, Debug, PartialEq)]
pub struct ReceivedMessage {
    pub delivery_id: String,
    pub sender_instance_id: String,
    pub recipient_instance_id: String,
    pub enqueued_at_ms: u64,
    pub request: SendMessageRequest,
}

/// A correlated response atomically claimed from an inbox.
#[derive(Clone, Debug, PartialEq)]
pub struct ReceivedResponse {
    pub delivery_id: String,
    pub sender_instance_id: String,
    pub recipient_instance_id: String,
    pub enqueued_at_ms: u64,
    pub in_reply_to_delivery_id: String,
    pub response: SendMessageResponse,
}

/// Any delivery atomically claimed from an inbox.
#[derive(Clone, Debug, PartialEq)]
pub enum ReceivedDelivery {
    Request(Box<ReceivedMessage>),
    Response(Box<ReceivedResponse>),
}

impl ReceivedDelivery {
    #[must_use]
    pub fn kind(&self) -> DeliveryKind {
        match self {
            Self::Request(_) => DeliveryKind::Request,
            Self::Response(_) => DeliveryKind::Response,
        }
    }

    #[must_use]
    pub fn delivery_id(&self) -> &str {
        match self {
            Self::Request(delivery) => &delivery.delivery_id,
            Self::Response(delivery) => &delivery.delivery_id,
        }
    }
}

/// Immutable content-addressed file staged in the local bus.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StagedArtifact {
    /// A2A-safe URL relative to the bus root.
    pub relative_url: String,
    /// Lowercase SHA-256 digest of the staged bytes.
    pub sha256: String,
    pub size_bytes: u64,
    pub filename: String,
}

/// Verified receiver-owned copy of one peer artifact.
///
/// The path is always relative to the receiving workspace and remains under
/// `.crumb/a2a/quarantine`. Quarantine does not make the file available to an
/// agent turn or promote it into the normal workspace.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuarantinedArtifact {
    pub relative_path: PathBuf,
    pub sha256: String,
    pub size_bytes: u64,
}

/// Receiver-approved import of a verified quarantine artifact.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImportedArtifact {
    pub relative_destination: PathBuf,
    pub sha256: String,
    pub size_bytes: u64,
}

/// Content-free result of discarding one exact quarantine artifact receipt.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DiscardedArtifact {
    pub delivery_id: String,
    pub part_index: usize,
    pub sha256: String,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuarantineReceipt {
    schema_version: u32,
    delivery_id: String,
    part_index: usize,
    sender_instance_id: String,
    created_at_ms: u64,
    sha256: String,
    size_bytes: u64,
    filename: String,
}

impl QuarantineReceipt {
    fn validate(&self) -> Result<()> {
        if self.schema_version != LOCAL_BUS_SCHEMA_VERSION {
            bail!("unsupported peer quarantine receipt schema");
        }
        validate_delivery_id(&self.delivery_id)?;
        if self.part_index == 0 || self.part_index > MAX_PARTS {
            bail!("peer quarantine receipt part index is invalid");
        }
        validate_instance_id(&self.sender_instance_id)?;
        if self.created_at_ms == 0 {
            bail!("peer quarantine receipt timestamp is invalid");
        }
        validate_lower_hex(&self.sha256, 64, "peer quarantine receipt digest")?;
        if self.size_bytes > MAX_ARTIFACT_BYTES {
            bail!("peer quarantine receipt exceeds the artifact size limit");
        }
        validate_artifact_filename(&self.filename)
    }

    fn matches_verified_claim(&self, other: &Self) -> bool {
        self.schema_version == other.schema_version
            && self.delivery_id == other.delivery_id
            && self.part_index == other.part_index
            && self.sender_instance_id == other.sender_instance_id
            && self.sha256 == other.sha256
            && self.size_bytes == other.size_bytes
            && self.filename == other.filename
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeliveryEnvelope {
    schema_version: u32,
    delivery_id: String,
    sender_instance_id: String,
    recipient_instance_id: String,
    enqueued_at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    request: Option<SendMessageRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    response: Option<SendMessageResponse>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    in_reply_to_delivery_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Acknowledgement {
    schema_version: u32,
    delivery_id: String,
    sender_instance_id: String,
    recipient_instance_id: String,
    acknowledged_at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    delivery_digest: Option<String>,
}

impl Acknowledgement {
    fn validate(&self) -> Result<()> {
        if self.schema_version != LOCAL_BUS_SCHEMA_VERSION || self.acknowledged_at_ms == 0 {
            bail!("local A2A acknowledgement is invalid");
        }
        validate_delivery_id(&self.delivery_id)?;
        validate_instance_id(&self.sender_instance_id)?;
        validate_instance_id(&self.recipient_instance_id)?;
        if let Some(digest) = &self.delivery_digest {
            validate_lower_hex(digest, 64, "delivery digest")?;
        }
        Ok(())
    }
}

impl DeliveryEnvelope {
    fn validate(&self) -> Result<()> {
        if self.schema_version != LOCAL_BUS_SCHEMA_VERSION {
            bail!("unsupported local A2A delivery schema");
        }
        validate_delivery_id(&self.delivery_id)?;
        validate_instance_id(&self.sender_instance_id)?;
        validate_instance_id(&self.recipient_instance_id)?;
        if self.enqueued_at_ms == 0 {
            bail!("local A2A delivery timestamp is invalid");
        }
        match (&self.request, &self.response, &self.in_reply_to_delivery_id) {
            (Some(request), None, None) => {
                request.validate().context("local A2A request is invalid")?;
            }
            (None, Some(response), Some(in_reply_to)) => {
                response
                    .validate()
                    .context("local A2A response is invalid")?;
                validate_delivery_id(in_reply_to)?;
            }
            _ => {
                bail!("local A2A delivery must contain exactly one request or correlated response")
            }
        }
        Ok(())
    }

    fn kind(&self) -> DeliveryKind {
        if self.request.is_some() {
            DeliveryKind::Request
        } else {
            DeliveryKind::Response
        }
    }

    fn received(self) -> ReceivedDelivery {
        let Self {
            delivery_id,
            sender_instance_id,
            recipient_instance_id,
            enqueued_at_ms,
            request,
            response,
            in_reply_to_delivery_id,
            ..
        } = self;
        match (request, response, in_reply_to_delivery_id) {
            (Some(request), None, None) => ReceivedDelivery::Request(Box::new(ReceivedMessage {
                delivery_id,
                sender_instance_id,
                recipient_instance_id,
                enqueued_at_ms,
                request,
            })),
            (None, Some(response), Some(in_reply_to_delivery_id)) => {
                ReceivedDelivery::Response(Box::new(ReceivedResponse {
                    delivery_id,
                    sender_instance_id,
                    recipient_instance_id,
                    enqueued_at_ms,
                    in_reply_to_delivery_id,
                    response,
                }))
            }
            _ => unreachable!("validated local A2A envelope has exactly one payload"),
        }
    }

    fn summary(&self) -> DeliverySummary {
        let (part_count, artifact_count) = if let Some(request) = &self.request {
            (
                request.message.parts.len(),
                request
                    .message
                    .parts
                    .iter()
                    .filter(|part| part.url.is_some())
                    .count(),
            )
        } else if let Some(response) = &self.response {
            response_counts(response)
        } else {
            (0, 0)
        };
        DeliverySummary {
            delivery_id: self.delivery_id.clone(),
            sender_instance_id: self.sender_instance_id.clone(),
            recipient_instance_id: self.recipient_instance_id.clone(),
            enqueued_at_ms: self.enqueued_at_ms,
            kind: self.kind(),
            in_reply_to_delivery_id: self.in_reply_to_delivery_id.clone(),
            part_count,
            artifact_count,
        }
    }

    fn request_summary(&self) -> Option<PendingDeliverySummary> {
        let summary = self.summary();
        (summary.kind == DeliveryKind::Request).then_some(PendingDeliverySummary {
            delivery_id: summary.delivery_id,
            sender_instance_id: summary.sender_instance_id,
            recipient_instance_id: summary.recipient_instance_id,
            enqueued_at_ms: summary.enqueued_at_ms,
            part_count: summary.part_count,
            artifact_count: summary.artifact_count,
        })
    }

    fn matches_delivery(&self, other: &Self) -> bool {
        self.schema_version == other.schema_version
            && self.delivery_id == other.delivery_id
            && self.sender_instance_id == other.sender_instance_id
            && self.recipient_instance_id == other.recipient_instance_id
            && self.request == other.request
            && self.response == other.response
            && self.in_reply_to_delivery_id == other.in_reply_to_delivery_id
    }

    fn content_digest(&self) -> Result<String> {
        let mut digest = Sha256::new();
        digest.update(b"crumb-a2a-delivery-content-v1");
        digest.update([0]);
        digest.update(self.sender_instance_id.as_bytes());
        digest.update([0]);
        digest.update(self.recipient_instance_id.as_bytes());
        digest.update([0]);
        if let Some(request) = &self.request {
            digest.update(b"request");
            digest.update([0]);
            digest.update(serde_json::to_vec(request).context("request digest encoding failed")?);
        } else if let Some(response) = &self.response {
            digest.update(b"response");
            digest.update([0]);
            digest.update(
                self.in_reply_to_delivery_id
                    .as_deref()
                    .unwrap_or_default()
                    .as_bytes(),
            );
            digest.update([0]);
            digest.update(serde_json::to_vec(response).context("response digest encoding failed")?);
        }
        Ok(format!("{:x}", digest.finalize()))
    }
}

fn response_counts(response: &SendMessageResponse) -> (usize, usize) {
    if let Some(message) = &response.message {
        let artifacts = message
            .parts
            .iter()
            .filter(|part| part.url.is_some())
            .count();
        return (message.parts.len(), artifacts);
    }
    let Some(task) = &response.task else {
        return (0, 0);
    };
    let message_parts = task
        .status
        .message
        .iter()
        .chain(task.history.iter())
        .map(|message| message.parts.len())
        .sum::<usize>();
    let artifact_parts = task
        .artifacts
        .iter()
        .map(|artifact| artifact.parts.len())
        .sum::<usize>();
    (message_parts + artifact_parts, task.artifacts.len())
}

fn envelope_part(envelope: &DeliveryEnvelope, part_index: usize) -> Option<&crumb_a2a::Part> {
    let index = part_index.checked_sub(1)?;
    if let Some(request) = &envelope.request {
        return request.message.parts.get(index);
    }
    let response = envelope.response.as_ref()?;
    if let Some(message) = &response.message {
        return message.parts.get(index);
    }
    let task = response.task.as_ref()?;
    task.status
        .message
        .iter()
        .flat_map(|message| message.parts.iter())
        .chain(
            task.artifacts
                .iter()
                .flat_map(|artifact| artifact.parts.iter()),
        )
        .nth(index)
}

fn verified_artifact_claim<'a>(
    sender_instance_id: &str,
    part: &'a crumb_a2a::Part,
) -> Result<(String, u64, &'a str)> {
    let url = part
        .url
        .as_deref()
        .context("selected peer part is not a file")?;
    if url.contains("://") {
        bail!("remote peer file references cannot enter local quarantine");
    }
    let segments = url.split('/').collect::<Vec<_>>();
    if segments.len() != 4 || segments[0] != ARTIFACT_DIRECTORY || segments[1] != sender_instance_id
    {
        bail!("peer artifact reference is not owned by the envelope sender");
    }
    let digest = segments[2]
        .strip_prefix("sha256-")
        .context("peer artifact reference is not content addressed")?;
    validate_lower_hex(digest, 64, "peer artifact digest")?;
    let filename = part
        .filename
        .as_deref()
        .context("peer artifact filename is unavailable")?;
    validate_artifact_filename(filename)?;
    if filename != segments[3]
        || url != format!("{ARTIFACT_DIRECTORY}/{sender_instance_id}/sha256-{digest}/{filename}")
    {
        bail!("peer artifact filename does not match its canonical reference");
    }
    let metadata = part
        .metadata
        .as_ref()
        .and_then(serde_json::Value::as_object)
        .context("peer artifact verification metadata is unavailable")?;
    let metadata_digest = metadata
        .get("sha256")
        .and_then(serde_json::Value::as_str)
        .context("peer artifact SHA-256 claim is unavailable")?;
    validate_lower_hex(metadata_digest, 64, "peer artifact SHA-256 claim")?;
    if metadata_digest != digest {
        bail!("peer artifact digest claims do not match");
    }
    let size_bytes = metadata
        .get("sizeBytes")
        .and_then(serde_json::Value::as_u64)
        .context("peer artifact size claim is unavailable")?;
    if size_bytes > MAX_ARTIFACT_BYTES {
        bail!("peer artifact size claim exceeds the 8 MiB limit");
    }
    Ok((digest.to_owned(), size_bytes, filename))
}

fn quarantined_artifact_projection(
    delivery_id: &str,
    sha256: String,
    size_bytes: u64,
    filename: &str,
) -> QuarantinedArtifact {
    QuarantinedArtifact {
        relative_path: PathBuf::from(".crumb")
            .join("a2a")
            .join("quarantine")
            .join(delivery_id)
            .join(&sha256)
            .join(filename),
        sha256,
        size_bytes,
    }
}

fn quarantine_receipt(
    delivery_id: &str,
    part_index: usize,
    sender_instance_id: &str,
    created_at_ms: u64,
    sha256: &str,
    size_bytes: u64,
    filename: &str,
) -> QuarantineReceipt {
    QuarantineReceipt {
        schema_version: LOCAL_BUS_SCHEMA_VERSION,
        delivery_id: delivery_id.to_owned(),
        part_index,
        sender_instance_id: sender_instance_id.to_owned(),
        created_at_ms,
        sha256: sha256.to_owned(),
        size_bytes,
        filename: filename.to_owned(),
    }
}

/// Filesystem-backed local A2A bus rooted only at a caller-approved path.
#[derive(Clone, Debug)]
pub struct LocalBus {
    root: PathBuf,
    registry: PathBuf,
    locks: PathBuf,
    inboxes: PathBuf,
    artifacts: PathBuf,
    options: LocalBusOptions,
}

impl LocalBus {
    /// Opens or creates a bounded local bus at a caller-trusted root.
    ///
    /// The parent of `root` must already exist. Existing bus directories may
    /// not be symlinks.
    ///
    /// # Errors
    ///
    /// Returns an error when the root or policy is unsafe or cannot be created.
    pub fn open(root: &Path, options: LocalBusOptions) -> Result<Self> {
        if root.as_os_str().is_empty() {
            bail!("local A2A bus root must not be empty");
        }
        let options = options.validate()?;
        ensure_private_directory(root)?;
        let registry = root.join(REGISTRY_DIRECTORY);
        let locks = registry.join(LOCK_DIRECTORY);
        let inboxes = root.join(INBOX_DIRECTORY);
        let artifacts = root.join(ARTIFACT_DIRECTORY);
        ensure_private_directory(&registry)?;
        ensure_private_directory(&locks)?;
        ensure_private_directory(&inboxes)?;
        ensure_private_directory(&artifacts)?;
        Ok(Self {
            root: root.to_path_buf(),
            registry,
            locks,
            inboxes,
            artifacts,
            options,
        })
    }

    /// Returns the exact trusted root supplied by the caller.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Registers a running process for a stable Crumb instance.
    ///
    /// A live lease owned by another runtime is never overwritten. A stale
    /// lease or a lease owned by the same runtime may be atomically replaced.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid identity/process metadata, unsafe storage,
    /// a full registry, or an already-active different runtime.
    pub fn register(
        &self,
        instance: &InstanceMetadata,
        process: ProcessMetadata,
    ) -> Result<Registration> {
        instance
            .validate()
            .context("Crumb instance metadata is invalid")?;
        process.validate()?;
        self.inspect_base_directories()?;
        let endpoint = inbox_endpoint(&instance.instance_id)?;
        self.ensure_inbox(&instance.instance_id)?;
        let _locks = self.acquire_instance_locks(&[&instance.instance_id])?;
        let now = now_ms()?;
        if process.started_at_ms > now.saturating_add(MAX_CLOCK_SKEW_MS) {
            bail!("local A2A process start is implausibly far in the future");
        }

        let path = self.registry_path(&instance.instance_id)?;
        let mut recover_processing = false;
        if let Some(existing) =
            read_optional_json::<PeerEntry>(&path, MAX_REGISTRY_BYTES, "local A2A registry entry")?
        {
            existing.validate(now)?;
            if existing.instance_id != instance.instance_id {
                bail!("local A2A registry entry does not match its filename");
            }
            let ttl = self.options.lease_ttl_ms()?;
            let same_runtime = existing.process == process;
            let stale = existing.is_stale(now, ttl);
            if !same_runtime && !stale {
                bail!("Crumb instance already has an active local A2A runtime");
            }
            recover_processing = stale;
        } else if count_visible_entries(&self.registry)? >= MAX_PEERS {
            bail!("local A2A registry is full");
        }

        if recover_processing {
            self.recover_processing(&instance.instance_id)?;
        }

        let entry = PeerEntry {
            schema_version: LOCAL_BUS_SCHEMA_VERSION,
            instance_id: instance.instance_id.clone(),
            name: instance.name.clone(),
            inbox_endpoint: endpoint,
            protocol_version: PROTOCOL_VERSION.to_owned(),
            lease_updated_at_ms: now.max(process.started_at_ms),
            process,
        };
        entry.validate(entry.lease_updated_at_ms)?;
        atomic_replace_json(&self.registry, &path, &entry, MAX_REGISTRY_BYTES)?;
        Ok(Registration { entry })
    }

    /// Atomically renews a registration owned by this runtime.
    ///
    /// # Errors
    ///
    /// Returns an error if the lease disappeared, changed owners, or storage is
    /// malformed or unsafe.
    pub fn heartbeat(&self, registration: &mut Registration) -> Result<()> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[registration.instance_id()])?;
        let path = self.registry_path(registration.instance_id())?;
        let mut current: PeerEntry =
            read_required_json(&path, MAX_REGISTRY_BYTES, "local A2A registry entry")?;
        current.validate(now_ms()?)?;
        ensure_owner(&current, registration)?;
        current.lease_updated_at_ms = now_ms()?.max(current.process.started_at_ms);
        current.validate(current.lease_updated_at_ms)?;
        atomic_replace_json(&self.registry, &path, &current, MAX_REGISTRY_BYTES)?;
        registration.entry = current;
        Ok(())
    }

    /// Atomically removes a registration owned by this runtime.
    ///
    /// Queued messages remain for a future registration of the stable instance.
    ///
    /// # Errors
    ///
    /// Returns an error if the lease changed owners or storage is unsafe.
    pub fn unregister(&self, registration: &Registration) -> Result<()> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[registration.instance_id()])?;
        let path = self.registry_path(registration.instance_id())?;
        let current: PeerEntry =
            read_required_json(&path, MAX_REGISTRY_BYTES, "local A2A registry entry")?;
        current.validate(now_ms()?)?;
        ensure_owner(&current, registration)?;
        remove_regular_file(&path, "local A2A registry entry")?;
        sync_directory(&self.registry).context("local A2A registry could not sync")
    }

    /// Lists non-stale peer leases in deterministic name/identifier order.
    ///
    /// # Errors
    ///
    /// Returns an error for an unsafe, malformed, oversized, or overfull
    /// registry instead of silently trusting partial discovery data.
    pub fn list_peers(&self) -> Result<Vec<PeerEntry>> {
        self.inspect_base_directories()?;
        let paths = visible_regular_entries(&self.registry, MAX_PEERS, "registry")?;
        let now = now_ms()?;
        let ttl = self.options.lease_ttl_ms()?;
        let mut peers = Vec::with_capacity(paths.len());
        for path in paths {
            let entry: PeerEntry =
                read_required_json(&path, MAX_REGISTRY_BYTES, "local A2A registry entry")?;
            entry.validate(now)?;
            if path != self.registry_path(&entry.instance_id)? {
                bail!("local A2A registry filename does not match its instance");
            }
            if !entry.is_stale(now, ttl) {
                peers.push(entry);
            }
        }
        peers.sort_by(|left, right| {
            left.name
                .to_lowercase()
                .cmp(&right.name.to_lowercase())
                .then_with(|| left.instance_id.cmp(&right.instance_id))
        });
        Ok(peers)
    }

    /// Atomically and idempotently enqueues an A2A request for a live peer.
    ///
    /// The deterministic delivery identifier makes retrying the same request
    /// safe. Message content is not copied to logs or registry metadata.
    ///
    /// # Errors
    ///
    /// Returns an error if either lease is unavailable/stale, the request is
    /// invalid or oversized, the inbox is full, or storage is unsafe.
    pub fn enqueue(
        &self,
        sender: &Registration,
        recipient_instance_id: &str,
        request: &SendMessageRequest,
    ) -> Result<EnqueueReceipt> {
        self.inspect_base_directories()?;
        validate_instance_id(recipient_instance_id)?;
        request.validate().context("local A2A request is invalid")?;
        let _locks = self.acquire_instance_locks(&[sender.instance_id(), recipient_instance_id])?;
        let now = now_ms()?;
        self.require_live_owner(sender, now)?;
        self.require_live_peer(recipient_instance_id, now)?;
        let request_json = to_json(request).context("local A2A request could not be encoded")?;
        let delivery_id = delivery_id(sender.instance_id(), recipient_instance_id, &request_json);
        let envelope = DeliveryEnvelope {
            schema_version: LOCAL_BUS_SCHEMA_VERSION,
            delivery_id: delivery_id.clone(),
            sender_instance_id: sender.instance_id().to_owned(),
            recipient_instance_id: recipient_instance_id.to_owned(),
            enqueued_at_ms: now,
            request: Some(request.clone()),
            response: None,
            in_reply_to_delivery_id: None,
        };
        envelope.validate()?;

        self.enqueue_envelope_locked(&envelope)
    }

    /// Atomically claims the oldest pending message for this runtime.
    ///
    /// The message remains in `processing` until [`Self::acknowledge`] or
    /// [`Self::release`] is called.
    ///
    /// # Errors
    ///
    /// Returns an error if ownership, queue storage, or a delivery is invalid.
    pub fn dequeue(&self, recipient: &Registration) -> Result<Option<ReceivedMessage>> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        let (pending, processing, _acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let paths = visible_regular_entries(&pending, MAX_INBOX_MESSAGES, "pending inbox")?;
        for source in paths {
            let envelope: DeliveryEnvelope =
                read_required_json(&source, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
            envelope.validate()?;
            validate_queued_envelope(&source, &envelope, recipient.instance_id())?;
            if envelope.kind() != DeliveryKind::Request {
                continue;
            }
            let Some(filename) = source.file_name() else {
                continue;
            };
            let target = processing.join(filename);
            if let Some(received) = claim_delivery_file(
                &source,
                &target,
                &pending,
                &processing,
                recipient.instance_id(),
            )? {
                let ReceivedDelivery::Request(received) = received else {
                    bail!("local A2A request claim changed delivery kind");
                };
                return Ok(Some(*received));
            }
        }
        Ok(None)
    }

    /// Lists all pending requests and responses without returning payloads.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid ownership, unsafe storage, or malformed deliveries.
    pub fn list_deliveries(&self, recipient: &Registration) -> Result<Vec<DeliverySummary>> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        let (pending, _processing, _acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let paths = visible_regular_entries(&pending, MAX_INBOX_MESSAGES, "pending inbox")?;
        let mut summaries = Vec::with_capacity(paths.len());
        for path in paths {
            let envelope: DeliveryEnvelope =
                read_required_json(&path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
            envelope.validate()?;
            validate_queued_envelope(&path, &envelope, recipient.instance_id())?;
            summaries.push(envelope.summary());
        }
        summaries.sort_by(|left, right| {
            left.enqueued_at_ms
                .cmp(&right.enqueued_at_ms)
                .then_with(|| left.delivery_id.cmp(&right.delivery_id))
        });
        Ok(summaries)
    }

    /// Lists pending deliveries for this receiver without returning payloads.
    ///
    /// Results are ordered by enqueue timestamp and then delivery identifier.
    ///
    /// # Errors
    ///
    /// Returns an error if ownership, queue bounds, files, identifiers, or any
    /// queued envelope are invalid.
    pub fn list_pending(&self, recipient: &Registration) -> Result<Vec<PendingDeliverySummary>> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        let (pending, _processing, _acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let paths = visible_regular_entries(&pending, MAX_INBOX_MESSAGES, "pending inbox")?;
        let mut summaries = Vec::with_capacity(paths.len());
        for path in paths {
            let envelope: DeliveryEnvelope =
                read_required_json(&path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
            envelope.validate()?;
            validate_queued_envelope(&path, &envelope, recipient.instance_id())?;
            if let Some(summary) = envelope.request_summary() {
                summaries.push(summary);
            }
        }
        summaries.sort_by(|left, right| {
            left.enqueued_at_ms
                .cmp(&right.enqueued_at_ms)
                .then_with(|| left.delivery_id.cmp(&right.delivery_id))
        });
        Ok(summaries)
    }

    /// Reads one exact pending delivery without changing queue state.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid or unknown delivery identifier, wrong
    /// ownership, unsafe storage, or a malformed/misdirected envelope.
    pub fn inspect_pending(
        &self,
        recipient: &Registration,
        delivery_id: &str,
    ) -> Result<ReceivedMessage> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        validate_delivery_id(delivery_id)?;
        let (pending, _processing, _acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let path = pending.join(delivery_filename(delivery_id)?);
        let envelope: DeliveryEnvelope =
            read_required_json(&path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
        envelope.validate()?;
        validate_queued_envelope(&path, &envelope, recipient.instance_id())?;
        match envelope.received() {
            ReceivedDelivery::Request(request) => Ok(*request),
            ReceivedDelivery::Response(_) => {
                bail!("local A2A delivery is a response, not a request")
            }
        }
    }

    /// Reads one exact pending request or response without changing queue state.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid ownership, an unknown identifier, or unsafe storage.
    pub fn inspect_delivery(
        &self,
        recipient: &Registration,
        delivery_id: &str,
    ) -> Result<ReceivedDelivery> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        validate_delivery_id(delivery_id)?;
        let (pending, _processing, _acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let path = pending.join(delivery_filename(delivery_id)?);
        let envelope: DeliveryEnvelope =
            read_required_json(&path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
        envelope.validate()?;
        validate_queued_envelope(&path, &envelope, recipient.instance_id())?;
        Ok(envelope.received())
    }

    /// Reads one exact pending or already-claimed response without changing queue state.
    ///
    /// This supports content-free lifecycle recording around an independently
    /// claimed response. Requests are rejected by this response-only view.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid ownership, an unknown identifier, a request,
    /// or unsafe pending/processing storage.
    pub fn inspect_response_delivery(
        &self,
        recipient: &Registration,
        delivery_id: &str,
    ) -> Result<ReceivedDelivery> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        validate_delivery_id(delivery_id)?;
        let (pending, processing, _acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let filename = delivery_filename(delivery_id)?;
        let pending_path = pending.join(&filename);
        let processing_path = processing.join(&filename);
        let path = if path_exists_without_following(&pending_path)? {
            pending_path
        } else {
            processing_path
        };
        let envelope: DeliveryEnvelope =
            read_required_json(&path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
        envelope.validate()?;
        validate_queued_envelope(&path, &envelope, recipient.instance_id())?;
        if envelope.kind() != DeliveryKind::Response {
            bail!("local A2A delivery is a request, not a response");
        }
        Ok(envelope.received())
    }

    /// Verifies and copies one exact file part from a pending delivery into a
    /// receiver-owned quarantine without claiming or acknowledging delivery.
    ///
    /// `part_index` is one-based and follows the order shown by delivery
    /// inspection. Only canonical local artifacts staged by the envelope
    /// sender are accepted. HTTPS references, foreign sender roots, unsafe
    /// paths, symlinks, non-regular files, and content mismatches are rejected.
    ///
    /// # Errors
    ///
    /// Returns an error when the delivery is not pending, the selected part is
    /// not a verified staged file, or quarantine storage is unsafe.
    pub fn quarantine_artifact(
        &self,
        recipient: &Registration,
        workspace_root: &Path,
        delivery_id: &str,
        part_index: usize,
    ) -> Result<QuarantinedArtifact> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        validate_delivery_id(delivery_id)?;
        if part_index == 0 || part_index > MAX_PARTS {
            bail!("peer file part index is outside the supported message range");
        }
        let (pending, _processing, _acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let delivery_path = pending.join(delivery_filename(delivery_id)?);
        let envelope: DeliveryEnvelope =
            read_required_json(&delivery_path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
        envelope.validate()?;
        validate_queued_envelope(&delivery_path, &envelope, recipient.instance_id())?;
        let part = envelope_part(&envelope, part_index)
            .context("peer delivery does not contain that part index")?;
        let (claimed_digest, claimed_size, filename) =
            verified_artifact_claim(&envelope.sender_instance_id, part)?;
        let receipt = quarantine_receipt(
            delivery_id,
            part_index,
            &envelope.sender_instance_id,
            now_ms()?,
            &claimed_digest,
            claimed_size,
            filename,
        );
        receipt.validate()?;
        let source =
            self.verified_artifact_source(&envelope.sender_instance_id, &claimed_digest, filename)?;

        inspect_directory(workspace_root, "receiver workspace root")?;
        let crumb = workspace_root.join(".crumb");
        ensure_private_directory(&crumb)?;
        let a2a = crumb.join("a2a");
        ensure_private_directory(&a2a)?;
        let _quarantine_lock = acquire_quarantine_lock(&a2a)?;
        let quarantine = a2a.join("quarantine");
        ensure_private_directory(&quarantine)?;
        let delivery_directory = quarantine.join(delivery_id);
        let digest_directory = delivery_directory.join(&claimed_digest);
        let destination = digest_directory.join(filename);

        let quarantined_count = count_quarantined_artifacts(&quarantine)?;
        if path_exists_without_following(&destination)? {
            verify_existing_artifact(&destination, &claimed_digest, claimed_size)?;
            persist_quarantine_receipt(&a2a, &receipt)?;
            return Ok(quarantined_artifact_projection(
                delivery_id,
                claimed_digest,
                claimed_size,
                filename,
            ));
        }
        if quarantined_count >= MAX_QUARANTINED_ARTIFACTS {
            bail!("local A2A quarantined artifact limit has been reached");
        }

        let mut source_file =
            open_regular_file_without_replacement(&source, "staged peer artifact")?;
        let source_metadata = source_file
            .metadata()
            .context("staged peer artifact could not be inspected after opening")?;
        if !source_metadata.is_file()
            || source_metadata.len() != claimed_size
            || claimed_size > MAX_ARTIFACT_BYTES
        {
            bail!("staged peer artifact does not match its claimed size");
        }
        ensure_private_directory(&delivery_directory)?;
        ensure_private_directory(&digest_directory)?;
        let quarantine_result = copy_verified_artifact_into_quarantine(
            &mut source_file,
            &digest_directory,
            &destination,
            &claimed_digest,
            claimed_size,
        );
        if quarantine_result.is_err() {
            remove_empty_quarantine_directories(&digest_directory, &delivery_directory);
        }
        let artifact_was_created = quarantine_result?;
        if let Err(error) = persist_quarantine_receipt(&a2a, &receipt) {
            if artifact_was_created {
                remove_exact_unreferenced_quarantine_artifact(
                    &destination,
                    &digest_directory,
                    &delivery_directory,
                    &claimed_digest,
                    claimed_size,
                )?;
            }
            return Err(error);
        }

        Ok(quarantined_artifact_projection(
            delivery_id,
            claimed_digest,
            claimed_size,
            filename,
        ))
    }

    fn verified_artifact_source(
        &self,
        sender_instance_id: &str,
        digest: &str,
        filename: &str,
    ) -> Result<PathBuf> {
        let sender_root = self.artifacts.join(sender_instance_id);
        inspect_directory(&sender_root, "staged artifact sender root")?;
        let digest_root = sender_root.join(format!("sha256-{digest}"));
        inspect_directory(&digest_root, "staged artifact digest root")?;
        let source = digest_root.join(filename);
        let metadata =
            fs::symlink_metadata(&source).context("staged peer artifact could not be inspected")?;
        if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
            bail!("staged peer artifact must be a regular file, not a symlink");
        }
        Ok(source)
    }

    /// Atomically claims one exact pending delivery for this receiver.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid or unknown delivery identifier, wrong
    /// ownership, unsafe/corrupt queue state, or an already-claimed delivery.
    pub fn claim_pending(
        &self,
        recipient: &Registration,
        delivery_id: &str,
    ) -> Result<ReceivedMessage> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        validate_delivery_id(delivery_id)?;
        let (pending, processing, _acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let filename = delivery_filename(delivery_id)?;
        let source = pending.join(&filename);
        let target = processing.join(filename);
        let envelope: DeliveryEnvelope =
            read_required_json(&source, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
        envelope.validate()?;
        validate_queued_envelope(&source, &envelope, recipient.instance_id())?;
        if envelope.kind() != DeliveryKind::Request {
            bail!("local A2A delivery is a response, not a request");
        }
        let claimed = claim_delivery_file(
            &source,
            &target,
            &pending,
            &processing,
            recipient.instance_id(),
        )?
        .context("local A2A pending delivery was not found")?;
        match claimed {
            ReceivedDelivery::Request(request) => Ok(*request),
            ReceivedDelivery::Response(_) => bail!("local A2A request claim changed delivery kind"),
        }
    }

    /// Atomically claims one exact pending request or response.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid ownership, an unknown identifier, or unsafe storage.
    pub fn claim_delivery(
        &self,
        recipient: &Registration,
        delivery_id: &str,
    ) -> Result<ReceivedDelivery> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        validate_delivery_id(delivery_id)?;
        let (pending, processing, _acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let filename = delivery_filename(delivery_id)?;
        claim_delivery_file(
            &pending.join(&filename),
            &processing.join(filename),
            &pending,
            &processing,
            recipient.instance_id(),
        )?
        .context("local A2A pending delivery was not found")
    }

    /// Completes a claimed request by durably queueing its correlated response
    /// before acknowledging and removing the inbound request.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid ownership, response, queue state, or storage.
    pub fn complete_claimed_request(
        &self,
        recipient: &Registration,
        delivery_id: &str,
        response: &SendMessageResponse,
    ) -> Result<EnqueueReceipt> {
        self.inspect_base_directories()?;
        validate_delivery_id(delivery_id)?;
        response
            .validate()
            .context("local A2A response is invalid")?;

        let sender_instance_id = self.claimed_request_sender(recipient, delivery_id)?;
        let _locks =
            self.acquire_instance_locks(&[recipient.instance_id(), sender_instance_id.as_str()])?;
        self.require_live_owner(recipient, now_ms()?)?;

        self.validate_claimed_or_acknowledged_request(
            recipient.instance_id(),
            delivery_id,
            &sender_instance_id,
        )?;
        let response_id =
            response_delivery_id(recipient.instance_id(), &sender_instance_id, delivery_id);
        let envelope = DeliveryEnvelope {
            schema_version: LOCAL_BUS_SCHEMA_VERSION,
            delivery_id: response_id,
            sender_instance_id: recipient.instance_id().to_owned(),
            recipient_instance_id: sender_instance_id,
            enqueued_at_ms: now_ms()?,
            request: None,
            response: Some(response.clone()),
            in_reply_to_delivery_id: Some(delivery_id.to_owned()),
        };
        envelope.validate()?;
        let receipt = self.enqueue_envelope_locked(&envelope)?;
        self.acknowledge_locked(
            recipient.instance_id(),
            delivery_id,
            Some(envelope.recipient_instance_id.as_str()),
        )?;
        Ok(receipt)
    }

    /// Rejects a claimed request with a minimal protocol task response.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid ownership, queue state, or storage.
    pub fn reject_claimed_request(
        &self,
        recipient: &Registration,
        delivery_id: &str,
    ) -> Result<EnqueueReceipt> {
        let claimed = self.read_claimed_request(recipient, delivery_id)?;
        let response = SendMessageResponse {
            task: Some(Task {
                id: rejected_task_id(delivery_id),
                context_id: claimed.request.message.context_id,
                status: TaskStatus {
                    state: TaskState::Rejected,
                    message: None,
                    timestamp: None,
                },
                artifacts: Vec::new(),
                history: Vec::new(),
                metadata: None,
            }),
            message: None,
        };
        self.complete_claimed_request(recipient, delivery_id, &response)
    }

    /// Returns content-free proof for an already completed inbound request.
    ///
    /// This supports crash reconciliation when the response and inbound
    /// acknowledgement were persisted before a separate task ledger was
    /// updated. A request that has not been acknowledged returns `None`.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid ownership, malformed acknowledgement or
    /// response storage, or an acknowledged request whose correlated response
    /// is no longer durably represented.
    pub fn completed_response_receipt(
        &self,
        recipient: &Registration,
        delivery_id: &str,
    ) -> Result<Option<CompletedResponseReceipt>> {
        self.inspect_base_directories()?;
        validate_delivery_id(delivery_id)?;

        let sender_instance_id = {
            let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
            self.require_live_owner(recipient, now_ms()?)?;
            let (_pending, _processing, acknowledged) =
                self.queue_directories(recipient.instance_id())?;
            let path = acknowledged.join(delivery_filename(delivery_id)?);
            if !path_exists_without_following(&path)? {
                return Ok(None);
            }
            let record: Acknowledgement =
                read_required_json(&path, MAX_REGISTRY_BYTES, "local A2A acknowledgement")?;
            record.validate()?;
            if record.delivery_id != delivery_id
                || record.recipient_instance_id != recipient.instance_id()
            {
                bail!("local A2A acknowledgement does not match completed request");
            }
            record.sender_instance_id
        };

        let _locks =
            self.acquire_instance_locks(&[recipient.instance_id(), &sender_instance_id])?;
        self.require_live_owner(recipient, now_ms()?)?;
        self.validate_completed_request_acknowledgement(
            recipient.instance_id(),
            delivery_id,
            &sender_instance_id,
        )?;
        let response_id =
            response_delivery_id(recipient.instance_id(), &sender_instance_id, delivery_id);
        let digest = self
            .durable_response_digest(
                recipient.instance_id(),
                &sender_instance_id,
                delivery_id,
                &response_id,
            )?
            .context("completed A2A request has no durable correlated response")?;
        Ok(Some(CompletedResponseReceipt {
            delivery_id: response_id,
            recipient_instance_id: sender_instance_id,
            digest,
        }))
    }

    /// Acknowledges a claimed response. Requests are rejected by this API.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid ownership, a request delivery, or unsafe storage.
    pub fn acknowledge_response(&self, recipient: &Registration, delivery_id: &str) -> Result<()> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        let envelope = self.read_processing_delivery(recipient.instance_id(), delivery_id)?;
        if envelope.kind() != DeliveryKind::Response {
            bail!("local A2A delivery is a request, not a response");
        }
        self.acknowledge_locked(recipient.instance_id(), delivery_id, None)
    }

    /// Claims a pending response, or resumes an already claimed response, and
    /// acknowledges it while holding the receiver queue lock.
    ///
    /// This is the user-facing response-consumption operation. Retrying after
    /// a failure between the claim and acknowledgement steps is safe because
    /// an exact response already present in `processing` is resumed. Requests
    /// are rejected before any queue mutation.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid ownership, an unknown identifier, a
    /// request delivery, unsafe storage, or an acknowledgement failure.
    pub fn consume_response(&self, recipient: &Registration, delivery_id: &str) -> Result<String> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        validate_delivery_id(delivery_id)?;
        let (pending, processing, _acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let filename = delivery_filename(delivery_id)?;
        let pending_path = pending.join(&filename);
        let processing_path = processing.join(&filename);

        let envelope = if path_exists_without_following(&pending_path)? {
            let pending_envelope: DeliveryEnvelope =
                read_required_json(&pending_path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
            pending_envelope.validate()?;
            validate_queued_envelope(&pending_path, &pending_envelope, recipient.instance_id())?;
            if pending_envelope.kind() != DeliveryKind::Response {
                bail!("local A2A delivery is a request, not a response");
            }
            claim_delivery_file(
                &pending_path,
                &processing_path,
                &pending,
                &processing,
                recipient.instance_id(),
            )?
            .context("local A2A pending response was not found")?;
            pending_envelope
        } else {
            let processing_envelope =
                self.read_processing_delivery(recipient.instance_id(), delivery_id)?;
            if processing_envelope.kind() != DeliveryKind::Response {
                bail!("local A2A delivery is a request, not a response");
            }
            processing_envelope
        };
        let sender_instance_id = envelope.sender_instance_id.clone();
        self.acknowledge_locked(
            recipient.instance_id(),
            delivery_id,
            Some(&sender_instance_id),
        )?;
        Ok(sender_instance_id)
    }

    /// Acknowledges and removes a previously claimed delivery.
    ///
    /// # Errors
    ///
    /// Returns an error if ownership, the delivery identifier, or queue storage
    /// is invalid.
    pub fn acknowledge(&self, recipient: &Registration, delivery_id: &str) -> Result<()> {
        self.finish_delivery(recipient, delivery_id, true)
    }

    /// Removes old payload-free acknowledgement tombstones under an explicit
    /// retention horizon.
    ///
    /// Compaction is serialized with queue operations. Every tombstone is
    /// validated before deletion begins, and records at or after the cutoff
    /// plus the newest retained generation are never removed. Callers should
    /// choose a cutoff older than their maximum retry and crash-recovery
    /// window. Retrying a compaction is safe.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid policy, stale ownership, unsafe or
    /// malformed storage, or a filesystem failure.
    pub fn compact_acknowledgements(
        &self,
        recipient: &Registration,
        policy: AcknowledgementRetentionPolicy,
    ) -> Result<AcknowledgementCompaction> {
        let policy =
            AcknowledgementRetentionPolicy::new(policy.compact_before_ms, policy.retain_latest)?;
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        let (_pending, _processing, acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        compact_acknowledgements_locked(&acknowledged, recipient.instance_id(), policy)
    }

    /// Returns a claimed delivery to the pending queue for retry.
    ///
    /// # Errors
    ///
    /// Returns an error if ownership, the delivery identifier, or queue storage
    /// is invalid.
    pub fn release(&self, recipient: &Registration, delivery_id: &str) -> Result<()> {
        self.finish_delivery(recipient, delivery_id, false)
    }

    /// Stages one caller-selected workspace file as an immutable bus artifact.
    ///
    /// `workspace_root` is trusted by the caller while `relative_source` must
    /// be a traversal-free relative path. No path from the source workspace is
    /// persisted. The returned URL can be placed in an A2A [`crumb_a2a::Part`].
    /// This operation does not import or overwrite files in another workspace.
    ///
    /// # Errors
    ///
    /// Returns an error if the sender lease is invalid; the workspace path or
    /// any source component is a symlink; the source is not a regular file; the
    /// file exceeds 8 MiB; or staging cannot complete atomically.
    pub fn stage_artifact(
        &self,
        sender: &Registration,
        workspace_root: &Path,
        relative_source: &Path,
    ) -> Result<StagedArtifact> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[sender.instance_id()])?;
        self.require_live_owner(sender, now_ms()?)?;
        inspect_directory(workspace_root, "artifact workspace root")?;
        validate_relative_path(relative_source)?;
        let source = inspect_workspace_source(workspace_root, relative_source)?;
        let filename = source
            .file_name()
            .and_then(|value| value.to_str())
            .context("artifact filename must be UTF-8")?;
        validate_artifact_filename(filename)?;

        let sender_root = self.artifacts.join(sender.instance_id());
        ensure_private_directory(&sender_root)?;
        let mut source_file = File::open(&source).context("artifact source could not be opened")?;
        let source_metadata = source_file
            .metadata()
            .context("artifact source could not be inspected after opening")?;
        if !source_metadata.is_file() || source_metadata.len() > MAX_ARTIFACT_BYTES {
            bail!("artifact source must be a regular file no larger than 8 MiB");
        }

        let mut temporary = tempfile::NamedTempFile::new_in(&sender_root)
            .context("temporary artifact could not be created")?;
        set_private_permissions(temporary.as_file())?;
        let (digest, size_bytes) = copy_and_hash(&mut source_file, &mut temporary)?;
        temporary
            .as_file_mut()
            .sync_all()
            .context("temporary artifact could not sync")?;
        let digest_directory_name = format!("sha256-{digest}");
        let digest_directory = sender_root.join(&digest_directory_name);
        let destination = digest_directory.join(filename);
        let exists = path_exists_without_following(&destination)?;
        if !exists && count_staged_artifacts(&sender_root)? >= MAX_STAGED_ARTIFACTS {
            bail!("local A2A staged artifact limit has been reached");
        }
        ensure_private_directory(&digest_directory)?;
        match temporary.persist_noclobber(&destination) {
            Ok(_) => {
                sync_directory(&digest_directory)
                    .context("artifact digest directory could not sync")?;
            }
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                verify_existing_artifact(&destination, &digest, size_bytes)?;
            }
            Err(error) => {
                return Err(error.error).context("artifact could not be atomically staged");
            }
        }
        let relative_url = format!(
            "{ARTIFACT_DIRECTORY}/{}/{digest_directory_name}/{filename}",
            sender.instance_id()
        );
        Ok(StagedArtifact {
            relative_url,
            sha256: digest,
            size_bytes,
            filename: filename.to_owned(),
        })
    }

    fn enqueue_envelope_locked(&self, envelope: &DeliveryEnvelope) -> Result<EnqueueReceipt> {
        envelope.validate()?;
        let (pending, processing, acknowledged) =
            self.queue_directories(&envelope.recipient_instance_id)?;
        let queued = count_visible_entries(&pending)? + count_visible_entries(&processing)?;
        let filename = delivery_filename(&envelope.delivery_id)?;
        let path = pending.join(&filename);
        let processing_path = processing.join(&filename);
        let acknowledged_path = acknowledged.join(&filename);
        let receipt = EnqueueReceipt {
            delivery_id: envelope.delivery_id.clone(),
            recipient_instance_id: envelope.recipient_instance_id.clone(),
        };
        if path_exists_without_following(&acknowledged_path)? {
            let existing: Acknowledgement = read_required_json(
                &acknowledged_path,
                MAX_REGISTRY_BYTES,
                "local A2A acknowledgement",
            )?;
            existing.validate()?;
            let candidate_digest = envelope.content_digest()?;
            if existing.delivery_id != envelope.delivery_id
                || existing.sender_instance_id != envelope.sender_instance_id
                || existing.recipient_instance_id != envelope.recipient_instance_id
                || existing
                    .delivery_digest
                    .as_deref()
                    .is_some_and(|digest| digest != candidate_digest)
            {
                bail!("local A2A acknowledgement does not match delivery");
            }
            return Ok(receipt);
        }
        for queued_path in [&path, &processing_path] {
            if path_exists_without_following(queued_path)? {
                let existing: DeliveryEnvelope =
                    read_required_json(queued_path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
                existing.validate()?;
                if !existing.matches_delivery(envelope) {
                    bail!("local A2A delivery identifier collision");
                }
                return Ok(receipt);
            }
        }
        if queued >= MAX_INBOX_MESSAGES {
            bail!("local A2A inbox is full");
        }
        match atomic_write_new_json(&pending, &path, envelope, MAX_ENVELOPE_BYTES) {
            Ok(()) => {}
            Err(error)
                if error
                    .downcast_ref::<std::io::Error>()
                    .is_some_and(|io| io.kind() == std::io::ErrorKind::AlreadyExists) =>
            {
                let existing: DeliveryEnvelope =
                    read_required_json(&path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
                existing.validate()?;
                if !existing.matches_delivery(envelope) {
                    bail!("local A2A delivery identifier collision");
                }
            }
            Err(error) => return Err(error),
        }
        Ok(receipt)
    }

    fn claimed_request_sender(
        &self,
        recipient: &Registration,
        delivery_id: &str,
    ) -> Result<String> {
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        let (_pending, processing, acknowledged) =
            self.queue_directories(recipient.instance_id())?;
        let filename = delivery_filename(delivery_id)?;
        let source = processing.join(&filename);
        if path_exists_without_following(&source)? {
            let envelope: DeliveryEnvelope =
                read_required_json(&source, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
            envelope.validate()?;
            validate_queued_envelope(&source, &envelope, recipient.instance_id())?;
            if envelope.kind() != DeliveryKind::Request {
                bail!("local A2A claimed delivery is not a request");
            }
            return Ok(envelope.sender_instance_id);
        }
        let acknowledgement_path = acknowledged.join(filename);
        let record: Acknowledgement = read_required_json(
            &acknowledgement_path,
            MAX_REGISTRY_BYTES,
            "local A2A acknowledgement",
        )?;
        record.validate()?;
        if record.delivery_id != delivery_id
            || record.recipient_instance_id != recipient.instance_id()
        {
            bail!("local A2A acknowledgement does not match delivery");
        }
        Ok(record.sender_instance_id)
    }

    fn validate_claimed_or_acknowledged_request(
        &self,
        recipient_instance_id: &str,
        delivery_id: &str,
        sender_instance_id: &str,
    ) -> Result<()> {
        let (_pending, processing, acknowledged) = self.queue_directories(recipient_instance_id)?;
        let filename = delivery_filename(delivery_id)?;
        let source = processing.join(&filename);
        if path_exists_without_following(&source)? {
            let envelope: DeliveryEnvelope =
                read_required_json(&source, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
            envelope.validate()?;
            validate_queued_envelope(&source, &envelope, recipient_instance_id)?;
            if envelope.kind() != DeliveryKind::Request
                || envelope.sender_instance_id != sender_instance_id
            {
                bail!("local A2A claimed request does not match response recipient");
            }
            return Ok(());
        }
        let acknowledgement_path = acknowledged.join(filename);
        let record: Acknowledgement = read_required_json(
            &acknowledgement_path,
            MAX_REGISTRY_BYTES,
            "local A2A acknowledgement",
        )?;
        record.validate()?;
        if record.delivery_id != delivery_id
            || record.sender_instance_id != sender_instance_id
            || record.recipient_instance_id != recipient_instance_id
        {
            bail!("local A2A acknowledgement does not match completed request");
        }
        Ok(())
    }

    fn validate_completed_request_acknowledgement(
        &self,
        recipient_instance_id: &str,
        delivery_id: &str,
        sender_instance_id: &str,
    ) -> Result<()> {
        let (_pending, _processing, acknowledged) =
            self.queue_directories(recipient_instance_id)?;
        let path = acknowledged.join(delivery_filename(delivery_id)?);
        let record: Acknowledgement =
            read_required_json(&path, MAX_REGISTRY_BYTES, "local A2A acknowledgement")?;
        record.validate()?;
        if record.delivery_id != delivery_id
            || record.sender_instance_id != sender_instance_id
            || record.recipient_instance_id != recipient_instance_id
        {
            bail!("local A2A acknowledgement does not match completed request");
        }
        Ok(())
    }

    fn durable_response_digest(
        &self,
        responder_instance_id: &str,
        original_sender_instance_id: &str,
        inbound_delivery_id: &str,
        response_delivery_id: &str,
    ) -> Result<Option<String>> {
        let (pending, processing, acknowledged) =
            self.queue_directories(original_sender_instance_id)?;
        let filename = delivery_filename(response_delivery_id)?;
        let acknowledgement_path = acknowledged.join(&filename);
        if path_exists_without_following(&acknowledgement_path)? {
            let record: Acknowledgement = read_required_json(
                &acknowledgement_path,
                MAX_REGISTRY_BYTES,
                "local A2A acknowledgement",
            )?;
            record.validate()?;
            if record.delivery_id != response_delivery_id
                || record.sender_instance_id != responder_instance_id
                || record.recipient_instance_id != original_sender_instance_id
            {
                bail!("local A2A correlated response acknowledgement is invalid");
            }
            return record
                .delivery_digest
                .map(Some)
                .context("local A2A correlated response acknowledgement lacks a digest");
        }
        for path in [pending.join(&filename), processing.join(filename)] {
            if !path_exists_without_following(&path)? {
                continue;
            }
            let envelope: DeliveryEnvelope =
                read_required_json(&path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
            envelope.validate()?;
            if envelope.delivery_id != response_delivery_id
                || envelope.sender_instance_id != responder_instance_id
                || envelope.recipient_instance_id != original_sender_instance_id
                || envelope.in_reply_to_delivery_id.as_deref() != Some(inbound_delivery_id)
                || envelope.kind() != DeliveryKind::Response
            {
                bail!("local A2A correlated response is invalid");
            }
            return Ok(Some(envelope.content_digest()?));
        }
        Ok(None)
    }

    fn read_claimed_request(
        &self,
        recipient: &Registration,
        delivery_id: &str,
    ) -> Result<ReceivedMessage> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        let envelope = self.read_processing_delivery(recipient.instance_id(), delivery_id)?;
        match envelope.received() {
            ReceivedDelivery::Request(request) => Ok(*request),
            ReceivedDelivery::Response(_) => bail!("local A2A claimed delivery is not a request"),
        }
    }

    fn read_processing_delivery(
        &self,
        recipient_instance_id: &str,
        delivery_id: &str,
    ) -> Result<DeliveryEnvelope> {
        validate_delivery_id(delivery_id)?;
        let (_pending, processing, _acknowledged) =
            self.queue_directories(recipient_instance_id)?;
        let path = processing.join(delivery_filename(delivery_id)?);
        let envelope: DeliveryEnvelope =
            read_required_json(&path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
        envelope.validate()?;
        validate_queued_envelope(&path, &envelope, recipient_instance_id)?;
        Ok(envelope)
    }

    fn acknowledge_locked(
        &self,
        recipient_instance_id: &str,
        delivery_id: &str,
        expected_sender: Option<&str>,
    ) -> Result<()> {
        let (_pending, processing, acknowledged) = self.queue_directories(recipient_instance_id)?;
        let filename = delivery_filename(delivery_id)?;
        let source = processing.join(&filename);
        let acknowledgement_path = acknowledged.join(&filename);
        if path_exists_without_following(&acknowledgement_path)? {
            let record: Acknowledgement = read_required_json(
                &acknowledgement_path,
                MAX_REGISTRY_BYTES,
                "local A2A acknowledgement",
            )?;
            record.validate()?;
            if record.delivery_id != delivery_id
                || record.recipient_instance_id != recipient_instance_id
                || expected_sender.is_some_and(|sender| record.sender_instance_id != sender)
            {
                bail!("local A2A acknowledgement does not match delivery");
            }
            if path_exists_without_following(&source)? {
                remove_regular_file(&source, "local A2A delivery")?;
                sync_directory(&processing).context("local A2A processing inbox could not sync")?;
            }
            return Ok(());
        }
        let envelope = self.read_processing_delivery(recipient_instance_id, delivery_id)?;
        if expected_sender.is_some_and(|sender| envelope.sender_instance_id != sender) {
            bail!("local A2A delivery sender does not match acknowledgement");
        }
        let mut acknowledgement_count = count_visible_entries(&acknowledged)?;
        if acknowledgement_count >= MAX_ACKNOWLEDGEMENTS {
            compact_acknowledgements_locked(
                &acknowledged,
                recipient_instance_id,
                automatic_acknowledgement_policy()?,
            )?;
            acknowledgement_count = count_visible_entries(&acknowledged)?;
        }
        if acknowledgement_count >= MAX_ACKNOWLEDGEMENTS {
            bail!("local A2A acknowledgement limit has been reached");
        }
        let delivery_digest = envelope.content_digest()?;
        let record = Acknowledgement {
            schema_version: LOCAL_BUS_SCHEMA_VERSION,
            delivery_id: delivery_id.to_owned(),
            sender_instance_id: envelope.sender_instance_id,
            recipient_instance_id: envelope.recipient_instance_id,
            acknowledged_at_ms: now_ms()?,
            delivery_digest: Some(delivery_digest),
        };
        record.validate()?;
        atomic_write_new_json(
            &acknowledged,
            &acknowledgement_path,
            &record,
            MAX_REGISTRY_BYTES,
        )?;
        remove_regular_file(&source, "local A2A delivery")?;
        sync_directory(&processing).context("local A2A processing inbox could not sync")
    }

    fn release_locked(&self, recipient_instance_id: &str, delivery_id: &str) -> Result<()> {
        let (pending, processing, _acknowledged) = self.queue_directories(recipient_instance_id)?;
        let filename = delivery_filename(delivery_id)?;
        let source = processing.join(&filename);
        let target = pending.join(filename);
        if path_exists_without_following(&target)? {
            bail!("local A2A pending delivery already exists");
        }
        fs::rename(&source, &target).context("local A2A delivery could not be released")?;
        sync_directory(&processing).context("local A2A processing inbox could not sync")?;
        sync_directory(&pending).context("local A2A pending inbox could not sync")
    }

    fn finish_delivery(
        &self,
        recipient: &Registration,
        delivery_id: &str,
        acknowledge: bool,
    ) -> Result<()> {
        self.inspect_base_directories()?;
        let _locks = self.acquire_instance_locks(&[recipient.instance_id()])?;
        self.require_live_owner(recipient, now_ms()?)?;
        validate_delivery_id(delivery_id)?;
        if acknowledge {
            self.acknowledge_locked(recipient.instance_id(), delivery_id, None)
        } else {
            self.release_locked(recipient.instance_id(), delivery_id)
        }
    }

    fn inspect_base_directories(&self) -> Result<()> {
        inspect_directory(&self.root, "local A2A bus root")?;
        inspect_directory(&self.registry, "local A2A registry")?;
        inspect_directory(&self.locks, "local A2A lease lock root")?;
        inspect_directory(&self.inboxes, "local A2A inbox root")
            .and_then(|()| inspect_directory(&self.artifacts, "local A2A artifact root"))
    }

    fn acquire_instance_locks(&self, instance_ids: &[&str]) -> Result<InstanceLocks> {
        let mut instance_ids = instance_ids.to_vec();
        instance_ids.sort_unstable();
        instance_ids.dedup();

        let gate = open_lock_file(&self.locks.join(LOCK_GATE_FILE))?;
        gate.lock()
            .context("local A2A lease lock gate could not be acquired")?;
        let mut files = Vec::with_capacity(instance_ids.len());
        for instance_id in instance_ids {
            validate_instance_id(instance_id)?;
            inspect_directory(&self.locks, "local A2A lease lock root")?;
            let path = self.locks.join(format!("{instance_id}.lock"));
            let existed = path_exists_without_following(&path)?;
            if !existed
                && visible_regular_entries(&self.locks, MAX_PEERS, "lease lock root")?.len()
                    >= MAX_PEERS
            {
                bail!("local A2A lease lock limit has been reached");
            }
            let file = open_lock_file(&path)?;
            file.lock()
                .context("local A2A lease lock could not be acquired")?;
            files.push(file);
        }
        drop(gate);
        Ok(InstanceLocks { _files: files })
    }

    fn recover_processing(&self, instance_id: &str) -> Result<()> {
        let (pending, processing, acknowledged) = self.queue_directories(instance_id)?;
        let pending_paths = visible_regular_entries(&pending, MAX_INBOX_MESSAGES, "pending inbox")?;
        let processing_paths =
            visible_regular_entries(&processing, MAX_INBOX_MESSAGES, "processing inbox")?;
        let mut acknowledgement_count =
            visible_regular_entries(&acknowledged, MAX_ACKNOWLEDGEMENTS, "acknowledgement inbox")?
                .len();
        let queued = pending_paths
            .len()
            .checked_add(processing_paths.len())
            .context("local A2A inbox count overflowed")?;
        if queued > MAX_INBOX_MESSAGES {
            bail!("local A2A inbox exceeds its entry limit");
        }

        let mut actions = Vec::with_capacity(processing_paths.len());
        for source in processing_paths {
            let envelope: DeliveryEnvelope =
                read_required_json(&source, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
            envelope.validate()?;
            validate_queued_envelope(&source, &envelope, instance_id)?;
            let filename = delivery_filename(&envelope.delivery_id)?;
            let target = pending.join(&filename);
            let acknowledgement_path = acknowledged.join(&filename);
            if path_exists_without_following(&acknowledgement_path)? {
                let record: Acknowledgement = read_required_json(
                    &acknowledgement_path,
                    MAX_REGISTRY_BYTES,
                    "local A2A acknowledgement",
                )?;
                record.validate()?;
                if record.delivery_id != envelope.delivery_id
                    || record.sender_instance_id != envelope.sender_instance_id
                    || record.recipient_instance_id != envelope.recipient_instance_id
                {
                    bail!("local A2A acknowledgement does not match delivery");
                }
                actions.push(RecoveryAction::Remove(source));
            } else if envelope.kind() == DeliveryKind::Request
                && self.correlated_response_is_durable(&envelope)?
            {
                if acknowledgement_count >= MAX_ACKNOWLEDGEMENTS {
                    compact_acknowledgements_locked(
                        &acknowledged,
                        instance_id,
                        automatic_acknowledgement_policy()?,
                    )?;
                    acknowledgement_count = count_visible_entries(&acknowledged)?;
                }
                if acknowledgement_count >= MAX_ACKNOWLEDGEMENTS {
                    bail!("local A2A acknowledgement limit has been reached");
                }
                let record = Acknowledgement {
                    schema_version: LOCAL_BUS_SCHEMA_VERSION,
                    delivery_id: envelope.delivery_id.clone(),
                    sender_instance_id: envelope.sender_instance_id.clone(),
                    recipient_instance_id: envelope.recipient_instance_id.clone(),
                    acknowledged_at_ms: now_ms()?,
                    delivery_digest: Some(envelope.content_digest()?),
                };
                record.validate()?;
                actions.push(RecoveryAction::Acknowledge {
                    source,
                    path: acknowledgement_path,
                    record,
                });
                acknowledgement_count += 1;
            } else if path_exists_without_following(&target)? {
                let existing: DeliveryEnvelope =
                    read_required_json(&target, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
                existing.validate()?;
                validate_queued_envelope(&target, &existing, instance_id)?;
                if !existing.matches_delivery(&envelope) {
                    bail!("local A2A delivery identifier collision");
                }
                actions.push(RecoveryAction::Remove(source));
            } else {
                actions.push(RecoveryAction::Move { source, target });
            }
        }

        Self::apply_recovery_actions(&pending, &processing, &acknowledged, actions)
    }

    fn apply_recovery_actions(
        pending: &Path,
        processing: &Path,
        acknowledged: &Path,
        actions: Vec<RecoveryAction>,
    ) -> Result<()> {
        let mut changed_processing = false;
        let mut changed_pending = false;
        let mut changed_acknowledged = false;
        for action in actions {
            match action {
                RecoveryAction::Remove(source) => {
                    remove_regular_file(&source, "local A2A delivery")?;
                    changed_processing = true;
                }
                RecoveryAction::Move { source, target } => {
                    fs::rename(&source, &target)
                        .context("local A2A processing delivery could not be recovered")?;
                    changed_processing = true;
                    changed_pending = true;
                }
                RecoveryAction::Acknowledge {
                    source,
                    path,
                    record,
                } => {
                    atomic_write_new_json(acknowledged, &path, &record, MAX_REGISTRY_BYTES)?;
                    remove_regular_file(&source, "local A2A delivery")?;
                    changed_processing = true;
                    changed_acknowledged = true;
                }
            }
        }
        if changed_processing {
            sync_directory(processing).context("local A2A processing inbox could not sync")?;
        }
        if changed_pending {
            sync_directory(pending).context("local A2A pending inbox could not sync")?;
        }
        if changed_acknowledged {
            sync_directory(acknowledged)
                .context("local A2A acknowledgement inbox could not sync")?;
        }
        Ok(())
    }

    fn correlated_response_is_durable(&self, request: &DeliveryEnvelope) -> Result<bool> {
        if request.kind() != DeliveryKind::Request {
            return Ok(false);
        }
        let response_id = response_delivery_id(
            &request.recipient_instance_id,
            &request.sender_instance_id,
            &request.delivery_id,
        );
        let (pending, processing, acknowledged) =
            self.queue_directories(&request.sender_instance_id)?;
        let filename = delivery_filename(&response_id)?;
        let acknowledgement_path = acknowledged.join(&filename);
        if path_exists_without_following(&acknowledgement_path)? {
            let record: Acknowledgement = read_required_json(
                &acknowledgement_path,
                MAX_REGISTRY_BYTES,
                "local A2A acknowledgement",
            )?;
            record.validate()?;
            if record.delivery_id != response_id
                || record.sender_instance_id != request.recipient_instance_id
                || record.recipient_instance_id != request.sender_instance_id
            {
                bail!("local A2A correlated response acknowledgement is invalid");
            }
            return Ok(true);
        }
        for path in [pending.join(&filename), processing.join(filename)] {
            if !path_exists_without_following(&path)? {
                continue;
            }
            let response: DeliveryEnvelope =
                read_required_json(&path, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
            response.validate()?;
            if response.delivery_id != response_id
                || response.sender_instance_id != request.recipient_instance_id
                || response.recipient_instance_id != request.sender_instance_id
                || response.in_reply_to_delivery_id.as_deref() != Some(&request.delivery_id)
                || response.kind() != DeliveryKind::Response
            {
                bail!("local A2A correlated response is invalid");
            }
            return Ok(true);
        }
        Ok(false)
    }

    fn registry_path(&self, instance_id: &str) -> Result<PathBuf> {
        validate_instance_id(instance_id)?;
        Ok(self.registry.join(format!("{instance_id}.json")))
    }

    fn ensure_inbox(&self, instance_id: &str) -> Result<()> {
        validate_instance_id(instance_id)?;
        let inbox = self.inboxes.join(instance_id);
        ensure_private_directory(&inbox)?;
        ensure_private_directory(&inbox.join(PENDING_DIRECTORY))?;
        ensure_private_directory(&inbox.join(PROCESSING_DIRECTORY))?;
        ensure_private_directory(&inbox.join(ACKNOWLEDGED_DIRECTORY))
    }

    fn queue_directories(&self, instance_id: &str) -> Result<(PathBuf, PathBuf, PathBuf)> {
        validate_instance_id(instance_id)?;
        let inbox = self.inboxes.join(instance_id);
        inspect_directory(&inbox, "local A2A instance inbox")?;
        let pending = inbox.join(PENDING_DIRECTORY);
        let processing = inbox.join(PROCESSING_DIRECTORY);
        let acknowledged = inbox.join(ACKNOWLEDGED_DIRECTORY);
        inspect_directory(&pending, "local A2A pending inbox")?;
        inspect_directory(&processing, "local A2A processing inbox")?;
        inspect_directory(&acknowledged, "local A2A acknowledgement inbox")?;
        Ok((pending, processing, acknowledged))
    }

    fn require_live_peer(&self, instance_id: &str, now: u64) -> Result<PeerEntry> {
        let path = self.registry_path(instance_id)?;
        let entry: PeerEntry =
            read_required_json(&path, MAX_REGISTRY_BYTES, "local A2A registry entry")?;
        entry.validate(now)?;
        if entry.instance_id != instance_id {
            bail!("local A2A registry entry does not match its filename");
        }
        if entry.is_stale(now, self.options.lease_ttl_ms()?) {
            bail!("local A2A peer lease is stale");
        }
        Ok(entry)
    }

    fn require_live_owner(&self, registration: &Registration, now: u64) -> Result<PeerEntry> {
        let entry = self.require_live_peer(registration.instance_id(), now)?;
        ensure_owner(&entry, registration)?;
        Ok(entry)
    }
}

struct InstanceLocks {
    _files: Vec<File>,
}

enum RecoveryAction {
    Remove(PathBuf),
    Move {
        source: PathBuf,
        target: PathBuf,
    },
    Acknowledge {
        source: PathBuf,
        path: PathBuf,
        record: Acknowledgement,
    },
}

fn claim_delivery_file(
    source: &Path,
    target: &Path,
    pending: &Path,
    processing: &Path,
    recipient_instance_id: &str,
) -> Result<Option<ReceivedDelivery>> {
    if path_exists_without_following(target)? {
        bail!("local A2A delivery is already being processed");
    }
    let expected: DeliveryEnvelope =
        match read_optional_json(source, MAX_ENVELOPE_BYTES, "local A2A delivery")? {
            Some(envelope) => envelope,
            None => return Ok(None),
        };
    expected.validate()?;
    validate_queued_envelope(source, &expected, recipient_instance_id)?;

    match fs::rename(source, target) {
        Ok(()) => {
            sync_directory(pending).context("local A2A pending inbox could not sync")?;
            sync_directory(processing).context("local A2A processing inbox could not sync")?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error).context("local A2A delivery could not be claimed"),
    }
    let claimed: DeliveryEnvelope =
        read_required_json(target, MAX_ENVELOPE_BYTES, "local A2A delivery")?;
    claimed.validate()?;
    validate_queued_envelope(target, &claimed, recipient_instance_id)?;
    if claimed != expected {
        bail!("local A2A delivery changed while being claimed");
    }
    Ok(Some(claimed.received()))
}

fn validate_queued_envelope(
    path: &Path,
    envelope: &DeliveryEnvelope,
    recipient_instance_id: &str,
) -> Result<()> {
    let filename = delivery_filename(&envelope.delivery_id)?;
    if path.file_name() != Some(filename.as_ref()) {
        bail!("local A2A delivery filename does not match its identifier");
    }
    if envelope.recipient_instance_id != recipient_instance_id {
        bail!("local A2A delivery recipient does not match inbox owner");
    }
    Ok(())
}

fn ensure_owner(entry: &PeerEntry, registration: &Registration) -> Result<()> {
    if entry.instance_id != registration.entry.instance_id
        || entry.process != registration.entry.process
    {
        bail!("local A2A registration is owned by another runtime");
    }
    Ok(())
}

fn inbox_endpoint(instance_id: &str) -> Result<PathBuf> {
    validate_instance_id(instance_id)?;
    Ok(PathBuf::from(INBOX_DIRECTORY).join(instance_id))
}

fn validate_inbox_endpoint(instance_id: &str, endpoint: &Path) -> Result<()> {
    let expected = inbox_endpoint(instance_id)?;
    validate_relative_path(endpoint)?;
    if endpoint != expected {
        bail!("local A2A inbox endpoint is not canonical");
    }
    Ok(())
}

fn validate_relative_path(path: &Path) -> Result<()> {
    if path.as_os_str().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!("local A2A path must be non-empty, relative, and traversal-free");
    }
    Ok(())
}

/// Imports one previously verified quarantine artifact into a new workspace
/// destination without consulting or mutating the transport inbox.
///
/// The durable receiver receipt remains until an explicit discard, allowing
/// the operation to work after restart or delivery acknowledgement.
///
/// # Errors
///
/// Returns an error for an invalid receipt, tampered quarantine bytes, unsafe
/// destination, symlinked or missing parent, or an existing destination.
pub fn import_quarantined_artifact(
    workspace_root: &Path,
    delivery_id: &str,
    part_index: usize,
    relative_destination: &Path,
) -> Result<ImportedArtifact> {
    inspect_directory(workspace_root, "receiver workspace root")?;
    validate_import_destination(relative_destination)?;
    let a2a = inspect_quarantine_layout(workspace_root)?;
    let _lock = acquire_quarantine_lock(&a2a)?;
    let (receipt, _receipt_path) = read_quarantine_receipt(&a2a, delivery_id, part_index)?;
    let artifact_path = quarantine_artifact_path(&a2a, &receipt)?;
    let mut source =
        open_regular_file_without_replacement(&artifact_path, "receiver quarantine artifact")?;
    if source
        .metadata()
        .context("receiver quarantine artifact metadata is unavailable")?
        .len()
        != receipt.size_bytes
    {
        bail!("receiver quarantine artifact size no longer matches its receipt");
    }

    let destination = workspace_root.join(relative_destination);
    let parent = destination.parent().unwrap_or(workspace_root);
    inspect_workspace_destination_parent(workspace_root, parent)?;
    if path_exists_without_following(&destination)? {
        bail!("peer file import destination already exists");
    }
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .context("temporary peer file import could not be created")?;
    set_private_permissions(temporary.as_file())?;
    let (actual_digest, actual_size) = copy_and_hash(&mut source, &mut temporary)?;
    if actual_digest != receipt.sha256 || actual_size != receipt.size_bytes {
        bail!("receiver quarantine artifact bytes no longer match its receipt");
    }
    temporary
        .as_file_mut()
        .sync_all()
        .context("temporary peer file import could not sync")?;
    temporary
        .persist_noclobber(&destination)
        .map_err(|error| error.error)
        .context("peer file import destination must not already exist")?;
    sync_directory(parent).context("peer file import parent could not sync")?;

    Ok(ImportedArtifact {
        relative_destination: relative_destination.to_path_buf(),
        sha256: receipt.sha256,
        size_bytes: receipt.size_bytes,
    })
}

/// Discards one exact verified quarantine artifact and its durable receipt.
///
/// Other part receipts that reference the same content keep their shared
/// quarantine artifact. This operation never touches delivery queue state.
///
/// # Errors
///
/// Returns an error for an invalid receipt, unsafe storage, or tampered bytes.
pub fn discard_quarantined_artifact(
    workspace_root: &Path,
    delivery_id: &str,
    part_index: usize,
) -> Result<DiscardedArtifact> {
    inspect_directory(workspace_root, "receiver workspace root")?;
    let a2a = inspect_quarantine_layout(workspace_root)?;
    let _lock = acquire_quarantine_lock(&a2a)?;
    let (receipt, receipt_path) = read_quarantine_receipt(&a2a, delivery_id, part_index)?;
    let artifact_path = quarantine_artifact_path(&a2a, &receipt)?;
    if !path_exists_without_following(&artifact_path)? {
        bail!("receiver quarantine artifact is unavailable");
    }
    verify_quarantine_artifact(&artifact_path, &receipt)?;
    let receipt_directory = receipt_path
        .parent()
        .context("peer quarantine receipt parent is unavailable")?;
    let shared = receipt_directory_has_reference(receipt_directory, &receipt_path, &receipt)?;
    if !shared {
        remove_regular_file(&artifact_path, "receiver quarantine artifact")?;
        if let Some(digest_directory) = artifact_path.parent() {
            sync_directory(digest_directory)
                .context("peer quarantine digest directory could not sync")?;
        }
    }
    remove_regular_file(&receipt_path, "peer quarantine receipt")?;
    sync_directory(receipt_directory)
        .context("peer quarantine receipt directory could not sync")?;
    cleanup_quarantine_receipt(&a2a, &receipt);

    Ok(DiscardedArtifact {
        delivery_id: receipt.delivery_id,
        part_index: receipt.part_index,
        sha256: receipt.sha256,
        size_bytes: receipt.size_bytes,
    })
}

fn validate_import_destination(path: &Path) -> Result<()> {
    validate_relative_path(path)?;
    if path.as_os_str().len() > 4_096 {
        bail!("peer file import destination is too long");
    }
    for component in path.components() {
        let Component::Normal(value) = component else {
            bail!("peer file import destination contains an unsafe component");
        };
        let value = value
            .to_str()
            .context("peer file import destination must be UTF-8")?;
        if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
            bail!("peer file import destination component is unsafe");
        }
        if value.eq_ignore_ascii_case(".crumb") || value.eq_ignore_ascii_case(".git") {
            bail!("peer files cannot be imported into protected metadata directories");
        }
    }
    Ok(())
}

fn inspect_workspace_destination_parent(workspace_root: &Path, parent: &Path) -> Result<()> {
    let relative = parent
        .strip_prefix(workspace_root)
        .context("peer file import parent escaped the workspace")?;
    let mut current = workspace_root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(component) = component else {
            bail!("peer file import parent contains an unsafe component");
        };
        current.push(component);
        inspect_directory(&current, "peer file import parent")?;
    }
    Ok(())
}

fn inspect_quarantine_layout(workspace_root: &Path) -> Result<PathBuf> {
    let crumb = workspace_root.join(".crumb");
    inspect_directory(&crumb, "receiver metadata root")?;
    let a2a = crumb.join("a2a");
    inspect_directory(&a2a, "receiver A2A metadata root")?;
    inspect_directory(&a2a.join("quarantine"), "receiver quarantine root")?;
    inspect_directory(
        &a2a.join(QUARANTINE_RECEIPT_DIRECTORY),
        "peer quarantine receipt root",
    )?;
    Ok(a2a)
}

fn acquire_quarantine_lock(a2a_root: &Path) -> Result<File> {
    let file = open_lock_file(&a2a_root.join(".quarantine.lock"))?;
    file.lock()
        .context("receiver quarantine lock could not be acquired")?;
    Ok(file)
}

fn quarantine_receipt_filename(part_index: usize) -> Result<String> {
    if part_index == 0 || part_index > MAX_PARTS {
        bail!("peer quarantine part index is outside the supported message range");
    }
    Ok(format!("part-{part_index}.json"))
}

fn persist_quarantine_receipt(a2a_root: &Path, receipt: &QuarantineReceipt) -> Result<()> {
    receipt.validate()?;
    let root = a2a_root.join(QUARANTINE_RECEIPT_DIRECTORY);
    ensure_private_directory(&root)?;
    let delivery_root = root.join(&receipt.delivery_id);
    let path = delivery_root.join(quarantine_receipt_filename(receipt.part_index)?);
    let delivery_exists = path_exists_without_following(&delivery_root)?;
    if delivery_exists {
        inspect_directory(&delivery_root, "peer quarantine receipt delivery root")?;
    }
    if delivery_exists && path_exists_without_following(&path)? {
        let existing: QuarantineReceipt = read_required_json(
            &path,
            MAX_QUARANTINE_RECEIPT_BYTES,
            "peer quarantine receipt",
        )?;
        existing.validate()?;
        if !existing.matches_verified_claim(receipt) {
            bail!("peer quarantine receipt conflicts with existing verified content");
        }
        return Ok(());
    }
    if count_quarantine_receipts(&root)? >= MAX_QUARANTINED_ARTIFACTS {
        bail!("local A2A quarantine receipt limit has been reached");
    }
    if !delivery_exists {
        ensure_private_directory(&delivery_root)?;
    }
    atomic_write_new_json(&delivery_root, &path, receipt, MAX_QUARANTINE_RECEIPT_BYTES)
}

fn read_quarantine_receipt(
    a2a_root: &Path,
    delivery_id: &str,
    part_index: usize,
) -> Result<(QuarantineReceipt, PathBuf)> {
    validate_delivery_id(delivery_id)?;
    let root = a2a_root.join(QUARANTINE_RECEIPT_DIRECTORY);
    inspect_directory(&root, "peer quarantine receipt root")?;
    let delivery_root = root.join(delivery_id);
    inspect_directory(&delivery_root, "peer quarantine receipt delivery root")?;
    let path = delivery_root.join(quarantine_receipt_filename(part_index)?);
    let receipt: QuarantineReceipt = read_required_json(
        &path,
        MAX_QUARANTINE_RECEIPT_BYTES,
        "peer quarantine receipt",
    )?;
    receipt.validate()?;
    if receipt.delivery_id != delivery_id || receipt.part_index != part_index {
        bail!("peer quarantine receipt does not match its requested identity");
    }
    Ok((receipt, path))
}

fn quarantine_artifact_path(a2a_root: &Path, receipt: &QuarantineReceipt) -> Result<PathBuf> {
    receipt.validate()?;
    let delivery_root = a2a_root.join("quarantine").join(&receipt.delivery_id);
    inspect_directory(&delivery_root, "receiver quarantine delivery root")?;
    let digest_root = delivery_root.join(&receipt.sha256);
    inspect_directory(&digest_root, "receiver quarantine digest root")?;
    Ok(digest_root.join(&receipt.filename))
}

fn verify_quarantine_artifact(path: &Path, receipt: &QuarantineReceipt) -> Result<()> {
    let mut file = open_regular_file_without_replacement(path, "receiver quarantine artifact")?;
    let (digest, size) = hash_file(&mut file)?;
    if digest != receipt.sha256 || size != receipt.size_bytes {
        bail!("receiver quarantine artifact bytes no longer match its receipt");
    }
    Ok(())
}

fn hash_file(source: &mut File) -> Result<(String, u64)> {
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 32 * 1024].into_boxed_slice();
    let mut size = 0_u64;
    loop {
        let read = source
            .read(&mut buffer)
            .context("quarantine artifact could not be read")?;
        if read == 0 {
            break;
        }
        size = size
            .checked_add(u64::try_from(read).context("artifact chunk size is unsupported")?)
            .context("quarantine artifact size overflowed")?;
        if size > MAX_ARTIFACT_BYTES {
            bail!("quarantine artifact exceeds the 8 MiB limit");
        }
        digest.update(&buffer[..read]);
    }
    Ok((format!("{:x}", digest.finalize()), size))
}

fn count_quarantine_receipts(root: &Path) -> Result<usize> {
    let mut count = 0_usize;
    let mut delivery_count = 0_usize;
    for delivery in fs::read_dir(root).context("peer quarantine receipt root could not be read")? {
        let delivery =
            delivery.context("peer quarantine receipt delivery entry could not be read")?;
        let delivery_id = delivery
            .file_name()
            .into_string()
            .map_err(|_| anyhow::anyhow!("peer quarantine receipt delivery ID is not UTF-8"))?;
        validate_delivery_id(&delivery_id)?;
        inspect_directory(&delivery.path(), "peer quarantine receipt delivery root")?;
        delivery_count = delivery_count.saturating_add(1);
        if delivery_count > MAX_QUARANTINED_ARTIFACTS {
            bail!("local A2A quarantine receipt directory limit has been exceeded");
        }
        for path in visible_regular_entries(
            &delivery.path(),
            MAX_QUARANTINED_ARTIFACTS,
            "quarantine receipt delivery root",
        )? {
            let receipt: QuarantineReceipt = read_required_json(
                &path,
                MAX_QUARANTINE_RECEIPT_BYTES,
                "peer quarantine receipt",
            )?;
            receipt.validate()?;
            if receipt.delivery_id != delivery_id
                || path.file_name()
                    != Some(quarantine_receipt_filename(receipt.part_index)?.as_ref())
            {
                bail!("peer quarantine receipt does not match its storage path");
            }
            count = count.saturating_add(1);
            if count > MAX_QUARANTINED_ARTIFACTS {
                bail!("local A2A quarantine receipt limit has been exceeded");
            }
        }
    }
    Ok(count.max(delivery_count))
}

fn receipt_directory_has_reference(
    directory: &Path,
    excluded: &Path,
    target: &QuarantineReceipt,
) -> Result<bool> {
    for path in visible_regular_entries(
        directory,
        MAX_QUARANTINED_ARTIFACTS,
        "quarantine receipt delivery root",
    )? {
        if path == excluded {
            continue;
        }
        let receipt: QuarantineReceipt = read_required_json(
            &path,
            MAX_QUARANTINE_RECEIPT_BYTES,
            "peer quarantine receipt",
        )?;
        receipt.validate()?;
        if receipt.delivery_id != target.delivery_id {
            bail!("peer quarantine receipt is stored under the wrong delivery");
        }
        if path.file_name() != Some(quarantine_receipt_filename(receipt.part_index)?.as_ref()) {
            bail!("peer quarantine receipt does not match its storage path");
        }
        if receipt.sha256 == target.sha256 && receipt.filename == target.filename {
            return Ok(true);
        }
    }
    Ok(false)
}

fn cleanup_quarantine_receipt(a2a_root: &Path, receipt: &QuarantineReceipt) {
    let artifact_digest = a2a_root
        .join("quarantine")
        .join(&receipt.delivery_id)
        .join(&receipt.sha256);
    let artifact_delivery = a2a_root.join("quarantine").join(&receipt.delivery_id);
    remove_empty_quarantine_directories(&artifact_digest, &artifact_delivery);
    let receipt_delivery = a2a_root
        .join(QUARANTINE_RECEIPT_DIRECTORY)
        .join(&receipt.delivery_id);
    let _ = fs::remove_dir(receipt_delivery);
}

fn validate_instance_id(value: &str) -> Result<()> {
    validate_prefixed_hex(
        value,
        INSTANCE_ID_PREFIX,
        INSTANCE_ID_HEX_BYTES,
        "instance identifier",
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

fn validate_prefixed_hex(value: &str, prefix: &str, hex_bytes: usize, label: &str) -> Result<()> {
    let Some(encoded) = value.strip_prefix(prefix) else {
        bail!("local A2A {label} has an invalid prefix");
    };
    if encoded.len() != hex_bytes
        || !encoded
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        bail!("local A2A {label} is malformed");
    }
    Ok(())
}

fn validate_lower_hex(value: &str, bytes: usize, label: &str) -> Result<()> {
    if value.len() != bytes
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        bail!("local A2A {label} is malformed");
    }
    Ok(())
}

fn delivery_id(sender: &str, recipient: &str, request_json: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(sender.as_bytes());
    digest.update([0]);
    digest.update(recipient.as_bytes());
    digest.update([0]);
    digest.update(request_json);
    format!("{DELIVERY_ID_PREFIX}{:x}", digest.finalize())
}

fn response_delivery_id(responder: &str, original_sender: &str, inbound_delivery: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(b"crumb-a2a-response-v1");
    digest.update([0]);
    digest.update(responder.as_bytes());
    digest.update([0]);
    digest.update(original_sender.as_bytes());
    digest.update([0]);
    digest.update(inbound_delivery.as_bytes());
    format!("{DELIVERY_ID_PREFIX}{:x}", digest.finalize())
}

fn rejected_task_id(delivery_id: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(b"crumb-a2a-rejected-task-v1");
    digest.update([0]);
    digest.update(delivery_id.as_bytes());
    format!("task_{:x}", digest.finalize())
}

fn delivery_filename(delivery_id: &str) -> Result<String> {
    validate_delivery_id(delivery_id)?;
    Ok(format!("{delivery_id}.json"))
}

fn validate_artifact_filename(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 256
        || matches!(value, "." | "..")
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        bail!("artifact filename must be a safe ASCII filename of at most 256 bytes");
    }
    Ok(())
}

fn inspect_workspace_source(workspace_root: &Path, relative: &Path) -> Result<PathBuf> {
    validate_relative_path(relative)?;
    let mut current = workspace_root.to_path_buf();
    let component_count = relative.components().count();
    for (index, component) in relative.components().enumerate() {
        let Component::Normal(component) = component else {
            bail!("artifact source contains an unsafe path component");
        };
        current.push(component);
        let metadata = fs::symlink_metadata(&current)
            .context("artifact source component could not be inspected")?;
        if metadata.file_type().is_symlink() {
            bail!("artifact source components must not be symlinks");
        }
        let is_final = index + 1 == component_count;
        if (!is_final && !metadata.file_type().is_dir())
            || (is_final && !metadata.file_type().is_file())
        {
            bail!("artifact source must resolve to a regular file inside the workspace");
        }
    }
    Ok(current)
}

fn copy_and_hash(
    source: &mut File,
    destination: &mut tempfile::NamedTempFile,
) -> Result<(String, u64)> {
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 32 * 1024].into_boxed_slice();
    let mut size = 0_u64;
    loop {
        let read = source
            .read(&mut buffer)
            .context("artifact source could not be read")?;
        if read == 0 {
            break;
        }
        let read_u64 = u64::try_from(read).context("artifact chunk size is unsupported")?;
        size = size
            .checked_add(read_u64)
            .context("artifact size overflowed")?;
        if size > MAX_ARTIFACT_BYTES {
            bail!("artifact source exceeds the 8 MiB limit");
        }
        digest.update(&buffer[..read]);
        destination
            .write_all(&buffer[..read])
            .context("temporary artifact could not be written")?;
    }
    Ok((format!("{:x}", digest.finalize()), size))
}

fn copy_verified_artifact_into_quarantine(
    source: &mut File,
    digest_directory: &Path,
    destination: &Path,
    expected_digest: &str,
    expected_size: u64,
) -> Result<bool> {
    let mut temporary = tempfile::NamedTempFile::new_in(digest_directory)
        .context("temporary quarantine artifact could not be created")?;
    set_private_permissions(temporary.as_file())?;
    let (actual_digest, actual_size) = copy_and_hash(source, &mut temporary)?;
    if actual_digest != expected_digest || actual_size != expected_size {
        bail!("staged peer artifact bytes do not match the delivery claim");
    }
    temporary
        .as_file_mut()
        .sync_all()
        .context("temporary quarantine artifact could not sync")?;
    let created = match temporary.persist_noclobber(destination) {
        Ok(_) => {
            sync_directory(digest_directory)
                .context("quarantine digest directory could not sync")?;
            true
        }
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
            verify_existing_artifact(destination, expected_digest, expected_size)?;
            false
        }
        Err(error) => {
            return Err(error.error).context("artifact could not be atomically quarantined");
        }
    };
    Ok(created)
}

fn remove_exact_unreferenced_quarantine_artifact(
    artifact: &Path,
    digest_directory: &Path,
    delivery_directory: &Path,
    expected_digest: &str,
    expected_size: u64,
) -> Result<()> {
    verify_existing_artifact(artifact, expected_digest, expected_size)
        .context("new quarantine artifact changed before receipt rollback")?;
    remove_regular_file(artifact, "unreferenced receiver quarantine artifact")?;
    sync_directory(digest_directory)
        .context("quarantine digest directory could not sync after receipt rollback")?;
    remove_empty_quarantine_directories(digest_directory, delivery_directory);
    Ok(())
}

fn verify_existing_artifact(path: &Path, expected_digest: &str, expected_size: u64) -> Result<()> {
    let metadata =
        fs::symlink_metadata(path).context("existing artifact could not be inspected")?;
    if metadata.file_type().is_symlink()
        || !metadata.file_type().is_file()
        || metadata.len() != expected_size
    {
        bail!("existing artifact is unsafe or does not match staged content");
    }
    let mut file = File::open(path).context("existing artifact could not be opened")?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 32 * 1024].into_boxed_slice();
    loop {
        let read = file
            .read(&mut buffer)
            .context("existing artifact could not be read")?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    if format!("{:x}", digest.finalize()) != expected_digest {
        bail!("existing artifact digest does not match staged content");
    }
    Ok(())
}

fn open_regular_file_without_replacement(path: &Path, label: &str) -> Result<File> {
    let before = fs::symlink_metadata(path).with_context(|| format!("{label} is unavailable"))?;
    if before.file_type().is_symlink() || !before.file_type().is_file() {
        bail!("{label} must be a regular file, not a symlink");
    }
    let file = File::open(path).with_context(|| format!("{label} could not be opened"))?;
    let opened = file
        .metadata()
        .with_context(|| format!("{label} could not be inspected after opening"))?;
    let after = fs::symlink_metadata(path)
        .with_context(|| format!("{label} could not be re-inspected after opening"))?;
    if after.file_type().is_symlink() || !after.file_type().is_file() || !opened.is_file() {
        bail!("{label} changed while it was being opened");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;

        if before.dev() != opened.dev()
            || before.ino() != opened.ino()
            || after.dev() != opened.dev()
            || after.ino() != opened.ino()
        {
            bail!("{label} changed while it was being opened");
        }
    }
    Ok(file)
}

fn count_staged_artifacts(sender_root: &Path) -> Result<usize> {
    let mut count = 0_usize;
    for directory in fs::read_dir(sender_root).context("staged artifact root could not be read")? {
        let directory = directory.context("staged artifact entry could not be read")?;
        if directory.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let metadata = fs::symlink_metadata(directory.path())
            .context("staged artifact digest directory could not be inspected")?;
        if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
            bail!("staged artifact digest entries must be directories, not symlinks");
        }
        for file in fs::read_dir(directory.path())
            .context("staged artifact digest directory could not be read")?
        {
            let file = file.context("staged artifact file could not be read")?;
            if file.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let metadata = fs::symlink_metadata(file.path())
                .context("staged artifact file could not be inspected")?;
            if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
                bail!("staged artifacts must be regular files, not symlinks");
            }
            count = count.saturating_add(1);
            if count > MAX_STAGED_ARTIFACTS {
                bail!("local A2A staged artifact limit has been exceeded");
            }
        }
    }
    Ok(count)
}

fn count_quarantined_artifacts(quarantine_root: &Path) -> Result<usize> {
    let mut delivery_directories = 0_usize;
    let mut digest_directories = 0_usize;
    let mut artifacts = 0_usize;
    for delivery in
        fs::read_dir(quarantine_root).context("peer quarantine root could not be read")?
    {
        let delivery = delivery.context("peer quarantine delivery entry could not be read")?;
        let delivery_name = delivery
            .file_name()
            .into_string()
            .map_err(|_| anyhow::anyhow!("peer quarantine delivery name is not valid UTF-8"))?;
        validate_delivery_id(&delivery_name)?;
        let metadata = fs::symlink_metadata(delivery.path())
            .context("peer quarantine delivery entry could not be inspected")?;
        if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
            bail!("peer quarantine delivery entries must be directories, not symlinks");
        }
        delivery_directories = delivery_directories.saturating_add(1);
        if delivery_directories > MAX_QUARANTINED_ARTIFACTS {
            bail!("local A2A quarantine directory limit has been exceeded");
        }

        for digest in fs::read_dir(delivery.path())
            .context("peer quarantine delivery directory could not be read")?
        {
            let digest = digest.context("peer quarantine digest entry could not be read")?;
            let digest_name = digest
                .file_name()
                .into_string()
                .map_err(|_| anyhow::anyhow!("peer quarantine digest name is not valid UTF-8"))?;
            validate_lower_hex(&digest_name, 64, "peer quarantine artifact digest")?;
            let metadata = fs::symlink_metadata(digest.path())
                .context("peer quarantine digest entry could not be inspected")?;
            if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
                bail!("peer quarantine digest entries must be directories, not symlinks");
            }
            digest_directories = digest_directories.saturating_add(1);
            if digest_directories > MAX_QUARANTINED_ARTIFACTS {
                bail!("local A2A quarantine directory limit has been exceeded");
            }

            for artifact in fs::read_dir(digest.path())
                .context("peer quarantine digest directory could not be read")?
            {
                let artifact =
                    artifact.context("peer quarantine artifact entry could not be read")?;
                let filename = artifact
                    .file_name()
                    .into_string()
                    .map_err(|_| anyhow::anyhow!("peer quarantine filename is not valid UTF-8"))?;
                validate_artifact_filename(&filename)?;
                let metadata = fs::symlink_metadata(artifact.path())
                    .context("peer quarantine artifact entry could not be inspected")?;
                if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
                    bail!("peer quarantine artifacts must be regular files, not symlinks");
                }
                artifacts = artifacts.saturating_add(1);
                if artifacts > MAX_QUARANTINED_ARTIFACTS {
                    bail!("local A2A quarantined artifact limit has been exceeded");
                }
            }
        }
    }
    Ok(artifacts)
}

fn remove_empty_quarantine_directories(digest_directory: &Path, delivery_directory: &Path) {
    for directory in [digest_directory, delivery_directory] {
        // Removing a non-empty directory fails, so received artifacts are never deleted.
        let _ = fs::remove_dir(directory);
    }
}

fn random_identifier(prefix: &str) -> Result<String> {
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random)
        .context("secure local A2A runtime identifier generation failed")?;
    let mut encoded = String::with_capacity(prefix.len() + random.len() * 2);
    encoded.push_str(prefix);
    for byte in random {
        use std::fmt::Write as _;
        write!(&mut encoded, "{byte:02x}").expect("writing to a String cannot fail");
    }
    Ok(encoded)
}

fn now_ms() -> Result<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system clock is before the Unix epoch")?
        .as_millis();
    u64::try_from(millis).context("system timestamp exceeds the supported range")
}

fn path_exists_without_following(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() {
                bail!("local A2A path must not be a symlink");
            }
            Ok(true)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error).context("local A2A path could not be inspected"),
    }
}

fn inspect_directory(path: &Path, label: &str) -> Result<()> {
    let metadata = fs::symlink_metadata(path).with_context(|| format!("{label} is unavailable"))?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
        bail!("{label} must be a directory, not a symlink");
    }
    Ok(())
}

#[cfg(unix)]
fn ensure_private_directory(path: &Path) -> Result<()> {
    use std::os::unix::fs::DirBuilderExt as _;

    let mut builder = fs::DirBuilder::new();
    builder.mode(0o700);
    match builder.create(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            inspect_directory(path, "local A2A directory")
        }
        Err(error) => Err(error).context("local A2A directory could not be created"),
    }
}

#[cfg(not(unix))]
fn ensure_private_directory(path: &Path) -> Result<()> {
    match fs::create_dir(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            inspect_directory(path, "local A2A directory")
        }
        Err(error) => Err(error).context("local A2A directory could not be created"),
    }
}

fn count_visible_entries(directory: &Path) -> Result<usize> {
    let mut count = 0_usize;
    for entry in fs::read_dir(directory).context("local A2A directory could not be read")? {
        let entry = entry.context("local A2A directory entry could not be read")?;
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        count = count.saturating_add(1);
    }
    Ok(count)
}

fn automatic_acknowledgement_policy() -> Result<AcknowledgementRetentionPolicy> {
    AcknowledgementRetentionPolicy::new(
        now_ms()?
            .saturating_sub(AUTOMATIC_ACKNOWLEDGEMENT_RETENTION_MS)
            .max(1),
        AUTOMATIC_ACKNOWLEDGEMENT_RETAIN_LATEST,
    )
}

fn compact_acknowledgements_locked(
    acknowledged: &Path,
    recipient_instance_id: &str,
    policy: AcknowledgementRetentionPolicy,
) -> Result<AcknowledgementCompaction> {
    let paths =
        visible_regular_entries(acknowledged, MAX_ACKNOWLEDGEMENTS, "acknowledgement inbox")?;
    let examined = paths.len();
    let mut records = Vec::with_capacity(examined);
    for path in paths {
        let record: Acknowledgement =
            read_required_json(&path, MAX_REGISTRY_BYTES, "local A2A acknowledgement")?;
        record.validate()?;
        if record.recipient_instance_id != recipient_instance_id
            || path != acknowledged.join(delivery_filename(&record.delivery_id)?)
        {
            bail!("local A2A acknowledgement does not match its inbox entry");
        }
        records.push((record.acknowledged_at_ms, record.delivery_id, path));
    }
    records.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    let removable_generation = records.len().saturating_sub(policy.retain_latest);
    let mut removed = 0;
    for (acknowledged_at_ms, _delivery_id, path) in records.into_iter().take(removable_generation) {
        if acknowledged_at_ms >= policy.compact_before_ms {
            continue;
        }
        remove_regular_file(&path, "local A2A acknowledgement")?;
        removed += 1;
    }
    if removed > 0 {
        sync_directory(acknowledged)
            .context("local A2A acknowledgement inbox could not sync after compaction")?;
    }
    Ok(AcknowledgementCompaction {
        examined,
        removed,
        retained: examined.saturating_sub(removed),
    })
}

fn open_lock_file(path: &Path) -> Result<File> {
    let file = match OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(path)
                .context("local A2A lease lock could not be inspected")?;
            if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
                bail!("local A2A lease lock must be a regular file, not a symlink");
            }
            OpenOptions::new()
                .read(true)
                .write(true)
                .open(path)
                .context("local A2A lease lock could not be opened")?
        }
        Err(error) => return Err(error).context("local A2A lease lock could not be created"),
    };
    let path_metadata =
        fs::symlink_metadata(path).context("local A2A lease lock could not be inspected")?;
    let file_metadata = file
        .metadata()
        .context("local A2A lease lock could not be inspected after opening")?;
    if path_metadata.file_type().is_symlink()
        || !path_metadata.file_type().is_file()
        || !file_metadata.is_file()
    {
        bail!("local A2A lease lock must be a regular file, not a symlink");
    }
    set_private_permissions(&file)?;
    Ok(file)
}

fn visible_regular_entries(directory: &Path, max: usize, label: &str) -> Result<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for entry in
        fs::read_dir(directory).with_context(|| format!("local A2A {label} could not be read"))?
    {
        let entry = entry.with_context(|| format!("local A2A {label} entry could not be read"))?;
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let metadata = fs::symlink_metadata(entry.path())
            .with_context(|| format!("local A2A {label} entry could not be inspected"))?;
        if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
            bail!("local A2A {label} entries must be regular files, not symlinks");
        }
        paths.push(entry.path());
        if paths.len() > max {
            bail!("local A2A {label} exceeds its entry limit");
        }
    }
    paths.sort();
    Ok(paths)
}

fn read_optional_json<T>(path: &Path, max_bytes: usize, label: &str) -> Result<Option<T>>
where
    T: DeserializeOwned,
{
    match fs::symlink_metadata(path) {
        Ok(_) => read_required_json(path, max_bytes, label).map(Some),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error).with_context(|| format!("{label} could not be inspected")),
    }
}

fn read_required_json<T>(path: &Path, max_bytes: usize, label: &str) -> Result<T>
where
    T: DeserializeOwned,
{
    let metadata = fs::symlink_metadata(path).with_context(|| format!("{label} is unavailable"))?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        bail!("{label} must be a regular file, not a symlink");
    }
    let max_u64 = u64::try_from(max_bytes).context("local A2A size limit is unsupported")?;
    if metadata.len() > max_u64 {
        bail!("{label} exceeds its byte limit");
    }
    let read_limit = max_u64
        .checked_add(1)
        .context("local A2A read limit overflowed")?;
    let capacity = usize::try_from(metadata.len()).context("local A2A file size is unsupported")?;
    let mut encoded = Vec::with_capacity(capacity);
    File::open(path)
        .with_context(|| format!("{label} could not be opened"))?
        .take(read_limit)
        .read_to_end(&mut encoded)
        .with_context(|| format!("{label} could not be read"))?;
    if encoded.len() > max_bytes {
        bail!("{label} exceeds its byte limit");
    }
    serde_json::from_slice(&encoded).with_context(|| format!("{label} is malformed"))
}

fn atomic_replace_json<T>(directory: &Path, path: &Path, value: &T, max_bytes: usize) -> Result<()>
where
    T: Serialize,
{
    if let Ok(metadata) = fs::symlink_metadata(path)
        && (metadata.file_type().is_symlink() || !metadata.file_type().is_file())
    {
        bail!("local A2A destination must be a regular file, not a symlink");
    }
    let mut temporary = tempfile::NamedTempFile::new_in(directory)
        .context("temporary local A2A file could not be created")?;
    write_json(&mut temporary, value, max_bytes)?;
    temporary
        .persist(path)
        .map_err(|error| error.error)
        .context("local A2A file could not be atomically replaced")?;
    sync_directory(directory).context("local A2A directory could not sync")
}

fn atomic_write_new_json<T>(
    directory: &Path,
    path: &Path,
    value: &T,
    max_bytes: usize,
) -> Result<()>
where
    T: Serialize,
{
    let mut temporary = tempfile::NamedTempFile::new_in(directory)
        .context("temporary local A2A file could not be created")?;
    write_json(&mut temporary, value, max_bytes)?;
    temporary
        .persist_noclobber(path)
        .map_err(|error| error.error)
        .context("local A2A file could not be atomically created")?;
    sync_directory(directory).context("local A2A directory could not sync")
}

fn write_json<T>(file: &mut tempfile::NamedTempFile, value: &T, max_bytes: usize) -> Result<()>
where
    T: Serialize,
{
    let mut encoded = serde_json::to_vec(value).context("local A2A value could not be encoded")?;
    encoded.push(b'\n');
    if encoded.len() > max_bytes {
        bail!("local A2A value exceeds its byte limit");
    }
    set_private_permissions(file.as_file())?;
    file.write_all(&encoded)
        .context("local A2A file could not be written")?;
    file.as_file_mut()
        .sync_all()
        .context("local A2A file could not sync")
}

fn remove_regular_file(path: &Path, label: &str) -> Result<()> {
    let metadata = fs::symlink_metadata(path).with_context(|| format!("{label} is unavailable"))?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        bail!("{label} must be a regular file, not a symlink");
    }
    fs::remove_file(path).with_context(|| format!("{label} could not be removed"))
}

#[cfg(unix)]
fn set_private_permissions(file: &File) -> Result<()> {
    use std::os::unix::fs::PermissionsExt as _;

    file.set_permissions(fs::Permissions::from_mode(0o600))
        .context("local A2A file permissions could not be restricted")
}

#[cfg(not(unix))]
fn set_private_permissions(_file: &File) -> Result<()> {
    Ok(())
}

#[cfg(unix)]
fn sync_directory(directory: &Path) -> std::io::Result<()> {
    File::open(directory)?.sync_all()
}

#[cfg(not(unix))]
fn sync_directory(_directory: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::{Arc, Barrier};
    use std::thread;
    use std::time::Duration;

    use crumb_a2a::{Message, Part, Role, SendMessageConfiguration};
    use crumb_instance::InstanceStore;
    use tempfile::TempDir;

    use super::*;

    fn request(id: &str, text: &str) -> SendMessageRequest {
        SendMessageRequest {
            tenant: None,
            message: Message {
                message_id: id.to_owned(),
                context_id: Some("ctx-local".to_owned()),
                task_id: None,
                role: Role::User,
                parts: vec![Part::text(text)],
                metadata: None,
                extensions: Vec::new(),
                reference_task_ids: Vec::new(),
            },
            configuration: Some(SendMessageConfiguration {
                accepted_output_modes: vec!["text/plain".to_owned()],
                history_length: Some(2),
                return_immediately: false,
            }),
            metadata: None,
        }
    }

    fn file_request(id: &str, artifact: &StagedArtifact) -> SendMessageRequest {
        let mut file = Part::file(
            artifact.relative_url.clone(),
            artifact.filename.clone(),
            "application/octet-stream",
        );
        file.metadata = Some(serde_json::json!({
            "sha256": artifact.sha256,
            "sizeBytes": artifact.size_bytes,
        }));
        let mut request = request(id, "shared file");
        request.message.parts.push(file);
        request
    }

    fn add_quarantined_artifact(workspace: &Path, index: usize) {
        let delivery_id = format!("delivery_{:064x}", index + 1);
        let digest = format!("{:064x}", index + 1_000);
        let directory = workspace
            .join(".crumb")
            .join("a2a")
            .join("quarantine")
            .join(delivery_id)
            .join(digest);
        fs::create_dir_all(&directory).expect("quarantine fixture directory");
        fs::write(directory.join(format!("artifact-{index}.bin")), b"fixture")
            .expect("quarantine fixture artifact");
    }

    fn response(id: &str, text: &str) -> SendMessageResponse {
        SendMessageResponse {
            task: None,
            message: Some(Message {
                message_id: id.to_owned(),
                context_id: Some("ctx-local".to_owned()),
                task_id: None,
                role: Role::Agent,
                parts: vec![Part::text(text)],
                metadata: None,
                extensions: Vec::new(),
                reference_task_ids: Vec::new(),
            }),
        }
    }

    fn process(number: u8) -> ProcessMetadata {
        ProcessMetadata {
            process_id: u32::from(number) + 100,
            started_at_ms: now_ms().expect("time"),
            runtime_id: format!("run_{number:032x}"),
        }
    }

    fn setup() -> (
        TempDir,
        LocalBus,
        InstanceMetadata,
        InstanceMetadata,
        Registration,
        Registration,
    ) {
        let temporary = TempDir::new().expect("temporary root");
        let first_workspace = temporary.path().join("workspace-one");
        let second_workspace = temporary.path().join("workspace-two");
        fs::create_dir(&first_workspace).expect("first workspace");
        fs::create_dir(&second_workspace).expect("second workspace");
        let first = InstanceStore::for_workspace(&first_workspace)
            .load_or_create_named("Builder One")
            .expect("first identity");
        let second = InstanceStore::for_workspace(&second_workspace)
            .load_or_create_named("Builder Two")
            .expect("second identity");
        let bus =
            LocalBus::open(&temporary.path().join("bus"), LocalBusOptions::default()).expect("bus");
        let first_registration = bus
            .register(&first, process(1))
            .expect("first registration");
        let second_registration = bus
            .register(&second, process(2))
            .expect("second registration");
        (
            temporary,
            bus,
            first,
            second,
            first_registration,
            second_registration,
        )
    }

    #[test]
    fn distinct_workspaces_exchange_and_acknowledge_one_message() {
        let (_temporary, bus, first, second, first_registration, second_registration) = setup();
        let message = request("msg-1", "Please inspect the shared artifact.");
        let receipt = bus
            .enqueue(&first_registration, &second.instance_id, &message)
            .expect("enqueue");
        let duplicate = bus
            .enqueue(&first_registration, &second.instance_id, &message)
            .expect("idempotent enqueue");
        assert_eq!(receipt, duplicate);

        let received = bus
            .dequeue(&second_registration)
            .expect("dequeue")
            .expect("message");
        assert_eq!(received.sender_instance_id, first.instance_id);
        assert_eq!(received.recipient_instance_id, second.instance_id);
        assert_eq!(received.request, message);
        assert!(bus.dequeue(&second_registration).expect("empty").is_none());

        bus.acknowledge(&second_registration, &received.delivery_id)
            .expect("acknowledge");
        let after_ack = bus
            .enqueue(&first_registration, &second.instance_id, &message)
            .expect("idempotent enqueue after acknowledgement");
        assert_eq!(receipt, after_ack);
        assert!(bus.dequeue(&second_registration).expect("empty").is_none());
    }

    #[test]
    fn acknowledgement_compaction_removes_old_tombstones_but_keeps_recent_retries_idempotent() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        let old = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-old", "old"),
            )
            .expect("old enqueue");
        bus.claim_pending(&second_registration, &old.delivery_id)
            .expect("old claim");
        bus.acknowledge(&second_registration, &old.delivery_id)
            .expect("old acknowledgement");
        let recent_request = request("msg-recent", "recent");
        let recent = bus
            .enqueue(&first_registration, &second.instance_id, &recent_request)
            .expect("recent enqueue");
        bus.claim_pending(&second_registration, &recent.delivery_id)
            .expect("recent claim");
        bus.acknowledge(&second_registration, &recent.delivery_id)
            .expect("recent acknowledgement");

        let (_pending, _processing, acknowledged) = bus
            .queue_directories(second_registration.instance_id())
            .expect("queue directories");
        let old_path = acknowledged.join(delivery_filename(&old.delivery_id).expect("filename"));
        let mut old_record: Acknowledgement =
            read_required_json(&old_path, MAX_REGISTRY_BYTES, "acknowledgement").expect("old");
        old_record.acknowledged_at_ms = 1;
        atomic_replace_json(&acknowledged, &old_path, &old_record, MAX_REGISTRY_BYTES)
            .expect("age old acknowledgement");
        let recent_path =
            acknowledged.join(delivery_filename(&recent.delivery_id).expect("filename"));
        let recent_record: Acknowledgement =
            read_required_json(&recent_path, MAX_REGISTRY_BYTES, "acknowledgement")
                .expect("recent");

        let report = bus
            .compact_acknowledgements(
                &second_registration,
                AcknowledgementRetentionPolicy::new(recent_record.acknowledged_at_ms, 0)
                    .expect("policy"),
            )
            .expect("compact");
        assert_eq!(report.removed, 1);
        assert!(!path_exists_without_following(&old_path).expect("old path"));
        assert_eq!(
            bus.enqueue(&first_registration, &second.instance_id, &recent_request)
                .expect("recent duplicate"),
            recent
        );
        assert_eq!(
            bus.compact_acknowledgements(
                &second_registration,
                AcknowledgementRetentionPolicy::new(recent_record.acknowledged_at_ms, 0)
                    .expect("policy"),
            )
            .expect("repeat")
            .removed,
            0
        );
    }

    #[test]
    fn full_acknowledgement_store_reclaims_only_old_generation() {
        let (_temporary, bus, first, second, first_registration, second_registration) = setup();
        let incoming = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-at-capacity", "new delivery"),
            )
            .expect("enqueue");
        bus.claim_pending(&second_registration, &incoming.delivery_id)
            .expect("claim");
        let (_pending, _processing, acknowledged) = bus
            .queue_directories(second_registration.instance_id())
            .expect("queue directories");
        for index in 0..MAX_ACKNOWLEDGEMENTS {
            let delivery_id = format!("delivery_{index:064x}");
            let record = Acknowledgement {
                schema_version: LOCAL_BUS_SCHEMA_VERSION,
                delivery_id: delivery_id.clone(),
                sender_instance_id: first.instance_id.clone(),
                recipient_instance_id: second.instance_id.clone(),
                acknowledged_at_ms: 1,
                delivery_digest: None,
            };
            let path = acknowledged.join(delivery_filename(&delivery_id).expect("filename"));
            fs::write(path, serde_json::to_vec(&record).expect("encode")).expect("write");
        }

        bus.acknowledge(&second_registration, &incoming.delivery_id)
            .expect("acknowledge after automatic compaction");
        assert_eq!(
            count_visible_entries(&acknowledged).expect("acknowledgement count"),
            AUTOMATIC_ACKNOWLEDGEMENT_RETAIN_LATEST + 1
        );
    }

    #[test]
    fn release_returns_claimed_message_to_pending() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        bus.enqueue(
            &first_registration,
            &second.instance_id,
            &request("msg-2", "retry"),
        )
        .expect("enqueue");
        let first = bus
            .dequeue(&second_registration)
            .expect("dequeue")
            .expect("message");
        bus.release(&second_registration, &first.delivery_id)
            .expect("release");
        let second_delivery = bus
            .dequeue(&second_registration)
            .expect("dequeue again")
            .expect("message again");
        assert_eq!(first.delivery_id, second_delivery.delivery_id);
    }

    #[test]
    fn stale_restart_recovers_claimed_delivery_before_publishing_new_lease() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        let sent = request("msg-restart", "recover after crash");
        let receipt = bus
            .enqueue(&first_registration, &second.instance_id, &sent)
            .expect("enqueue");
        let claimed = bus
            .claim_pending(&second_registration, &receipt.delivery_id)
            .expect("claim");
        assert_eq!(claimed.request, sent);

        let registry_path = bus
            .registry_path(&second.instance_id)
            .expect("registry path");
        let mut stale: PeerEntry =
            read_required_json(&registry_path, MAX_REGISTRY_BYTES, "registry entry")
                .expect("registry entry");
        stale.process.started_at_ms = 1;
        stale.lease_updated_at_ms = 1;
        atomic_replace_json(&bus.registry, &registry_path, &stale, MAX_REGISTRY_BYTES)
            .expect("stale lease");

        let replacement = bus
            .register(&second, process(9))
            .expect("replacement registration");
        let pending = bus.list_pending(&replacement).expect("recovered pending");
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].delivery_id, receipt.delivery_id);
        let inspected = bus
            .inspect_pending(&replacement, &receipt.delivery_id)
            .expect("inspect recovered delivery");
        assert_eq!(inspected.request, sent);
        assert_eq!(
            bus.list_pending(&replacement).expect("still pending").len(),
            1
        );
        let reclaimed = bus
            .claim_pending(&replacement, &receipt.delivery_id)
            .expect("reclaim recovered delivery");
        assert_eq!(reclaimed.delivery_id, receipt.delivery_id);
        assert!(bus.list_pending(&second_registration).is_err());
    }

    #[test]
    fn live_second_runtime_is_rejected_without_stealing_claimed_delivery() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-live-owner", "do not steal"),
            )
            .expect("enqueue");
        bus.claim_pending(&second_registration, &receipt.delivery_id)
            .expect("claim");

        assert!(bus.register(&second, process(9)).is_err());
        bus.release(&second_registration, &receipt.delivery_id)
            .expect("original owner still controls delivery");
        let pending = bus
            .list_pending(&second_registration)
            .expect("original owner pending queue");
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].delivery_id, receipt.delivery_id);
    }

    #[test]
    fn pending_summaries_are_redacted_and_exact_claim_selects_one_delivery() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        let first_request = request("msg-summary-1", "private body alpha");
        let mut second_request = request("msg-summary-2", "private body beta");
        second_request.message.parts.push(Part::file(
            "artifacts/sha256-deadbeef/secret-plan.txt",
            "secret-plan.txt",
            "text/plain",
        ));
        let first_receipt = bus
            .enqueue(&first_registration, &second.instance_id, &first_request)
            .expect("first enqueue");
        let second_receipt = bus
            .enqueue(&first_registration, &second.instance_id, &second_request)
            .expect("second enqueue");

        let summaries = bus
            .list_pending(&second_registration)
            .expect("pending summaries");
        assert_eq!(summaries.len(), 2);
        let artifact_summary = summaries
            .iter()
            .find(|summary| summary.delivery_id == second_receipt.delivery_id)
            .expect("artifact summary");
        assert_eq!(artifact_summary.part_count, 2);
        assert_eq!(artifact_summary.artifact_count, 1);
        let rendered = format!("{summaries:?}");
        assert!(!rendered.contains("private body"));
        assert!(!rendered.contains("secret-plan"));
        assert!(!rendered.contains("artifacts/"));

        let claimed = bus
            .claim_pending(&second_registration, &second_receipt.delivery_id)
            .expect("claim exact delivery");
        assert_eq!(claimed.delivery_id, second_receipt.delivery_id);
        assert_eq!(claimed.request, second_request);
        assert!(
            bus.claim_pending(&second_registration, &second_receipt.delivery_id)
                .is_err()
        );
        let unknown = format!("delivery_{}", "0".repeat(64));
        assert!(bus.claim_pending(&second_registration, &unknown).is_err());
        let remaining = bus
            .list_pending(&second_registration)
            .expect("remaining summary");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].delivery_id, first_receipt.delivery_id);
    }

    #[test]
    fn concurrent_claim_allows_exactly_one_receiver() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-concurrent", "claim once"),
            )
            .expect("enqueue");
        let barrier = Arc::new(Barrier::new(3));
        let mut workers = Vec::new();
        for _ in 0..2 {
            let worker_bus = bus.clone();
            let worker_registration = second_registration.clone();
            let worker_delivery = receipt.delivery_id.clone();
            let worker_barrier = Arc::clone(&barrier);
            workers.push(thread::spawn(move || {
                worker_barrier.wait();
                worker_bus.claim_pending(&worker_registration, &worker_delivery)
            }));
        }
        barrier.wait();
        let results: Vec<_> = workers
            .into_iter()
            .map(|worker| worker.join().expect("claim worker"))
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(results.iter().filter(|result| result.is_err()).count(), 1);
        assert!(
            bus.claim_pending(&second_registration, &receipt.delivery_id)
                .is_err()
        );
    }

    #[test]
    fn legacy_request_envelope_decodes_without_response_fields() {
        let encoded = serde_json::json!({
            "schemaVersion": LOCAL_BUS_SCHEMA_VERSION,
            "deliveryId": format!("delivery_{}", "a".repeat(64)),
            "senderInstanceId": format!("crumb_{}", "b".repeat(32)),
            "recipientInstanceId": format!("crumb_{}", "c".repeat(32)),
            "enqueuedAtMs": 1,
            "request": request("legacy-message", "legacy body")
        });
        let envelope: DeliveryEnvelope =
            serde_json::from_value(encoded).expect("legacy envelope decode");
        envelope.validate().expect("legacy envelope validation");
        assert_eq!(envelope.kind(), DeliveryKind::Request);
        assert!(envelope.response.is_none());
        assert!(envelope.in_reply_to_delivery_id.is_none());
    }

    #[test]
    fn envelope_requires_exactly_one_payload_and_response_correlation() {
        let base = DeliveryEnvelope {
            schema_version: LOCAL_BUS_SCHEMA_VERSION,
            delivery_id: format!("delivery_{}", "a".repeat(64)),
            sender_instance_id: format!("crumb_{}", "b".repeat(32)),
            recipient_instance_id: format!("crumb_{}", "c".repeat(32)),
            enqueued_at_ms: 1,
            request: None,
            response: None,
            in_reply_to_delivery_id: None,
        };
        assert!(base.validate().is_err());

        let mut uncorrelated = base.clone();
        uncorrelated.response = Some(response("msg-uncorrelated", "answer"));
        assert!(uncorrelated.validate().is_err());

        let mut both = uncorrelated;
        both.request = Some(request("msg-both", "request"));
        both.in_reply_to_delivery_id = Some(format!("delivery_{}", "d".repeat(64)));
        assert!(both.validate().is_err());
    }

    #[test]
    fn completion_queues_correlated_response_before_acknowledging_request() {
        let (_temporary, bus, first, second, first_registration, second_registration) = setup();
        let request_receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-response", "please answer"),
            )
            .expect("request enqueue");
        bus.claim_pending(&second_registration, &request_receipt.delivery_id)
            .expect("request claim");

        let answer = response("msg-answer", "done");
        let response_receipt = bus
            .complete_claimed_request(&second_registration, &request_receipt.delivery_id, &answer)
            .expect("complete request");
        assert_eq!(response_receipt.recipient_instance_id, first.instance_id);
        assert!(
            bus.dequeue(&second_registration)
                .expect("receiver empty")
                .is_none()
        );
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("requests")
                .len(),
            0
        );

        let summaries = bus
            .list_deliveries(&first_registration)
            .expect("sender deliveries");
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].kind, DeliveryKind::Response);
        assert_eq!(
            summaries[0].in_reply_to_delivery_id.as_deref(),
            Some(request_receipt.delivery_id.as_str())
        );
        assert_eq!(
            bus.list_pending(&first_registration)
                .expect("request view")
                .len(),
            0
        );
        assert!(
            bus.inspect_pending(&first_registration, &response_receipt.delivery_id)
                .is_err()
        );
        assert!(
            bus.dequeue(&first_registration)
                .expect("no response loop")
                .is_none()
        );

        let claimed = bus
            .claim_delivery(&first_registration, &response_receipt.delivery_id)
            .expect("claim response");
        let ReceivedDelivery::Response(claimed) = claimed else {
            panic!("expected response delivery");
        };
        assert_eq!(claimed.response, answer);
        assert_eq!(claimed.in_reply_to_delivery_id, request_receipt.delivery_id);
        bus.acknowledge_response(&first_registration, &response_receipt.delivery_id)
            .expect("ack response");
        assert!(
            bus.complete_claimed_request(
                &second_registration,
                &request_receipt.delivery_id,
                &response("msg-answer-changed", "different answer")
            )
            .is_err()
        );
    }

    #[test]
    fn response_consumption_claims_or_resumes_without_moving_requests() {
        let (_temporary, bus, first, second, first_registration, second_registration) = setup();
        let request_receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-consume", "please answer"),
            )
            .expect("request enqueue");
        bus.claim_pending(&second_registration, &request_receipt.delivery_id)
            .expect("request claim");
        let response_receipt = bus
            .complete_claimed_request(
                &second_registration,
                &request_receipt.delivery_id,
                &response("msg-consume-answer", "done"),
            )
            .expect("complete request");

        assert_eq!(
            bus.consume_response(&first_registration, &response_receipt.delivery_id)
                .expect("consume pending response"),
            second.instance_id
        );
        assert_eq!(
            bus.list_deliveries(&first_registration)
                .expect("response removed"),
            Vec::new()
        );

        let second_request = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-consume-resume", "please answer again"),
            )
            .expect("second request enqueue");
        bus.claim_pending(&second_registration, &second_request.delivery_id)
            .expect("second request claim");
        let second_response = bus
            .complete_claimed_request(
                &second_registration,
                &second_request.delivery_id,
                &response("msg-consume-resume-answer", "done again"),
            )
            .expect("second completion");
        bus.claim_delivery(&first_registration, &second_response.delivery_id)
            .expect("simulate interrupted response consumption");
        assert_eq!(
            bus.consume_response(&first_registration, &second_response.delivery_id)
                .expect("resume claimed response"),
            second.instance_id
        );

        let inbound_request = bus
            .enqueue(
                &second_registration,
                &first.instance_id,
                &request("msg-not-response", "keep me pending"),
            )
            .expect("inbound request");
        assert!(
            bus.consume_response(&first_registration, &inbound_request.delivery_id)
                .is_err()
        );
        assert_eq!(
            bus.list_pending(&first_registration)
                .expect("request remains pending")
                .len(),
            1
        );
    }

    #[test]
    fn retained_request_tombstone_preserves_response_before_ledger_reconciliation() {
        let (_temporary, bus, first, second, first_registration, second_registration) = setup();
        let request_receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-reconcile", "please answer"),
            )
            .expect("request enqueue");
        bus.claim_pending(&second_registration, &request_receipt.delivery_id)
            .expect("request claim");
        let response_receipt = bus
            .complete_claimed_request(
                &second_registration,
                &request_receipt.delivery_id,
                &response("msg-reconcile-answer", "durable answer"),
            )
            .expect("complete request");

        let (_pending, _processing, acknowledged) = bus
            .queue_directories(second_registration.instance_id())
            .expect("queue directories");
        let old_delivery_id = format!("delivery_{}", "f".repeat(64));
        let old_path = acknowledged.join(delivery_filename(&old_delivery_id).expect("filename"));
        let old = Acknowledgement {
            schema_version: LOCAL_BUS_SCHEMA_VERSION,
            delivery_id: old_delivery_id,
            sender_instance_id: first.instance_id.clone(),
            recipient_instance_id: second.instance_id.clone(),
            acknowledged_at_ms: 1,
            delivery_digest: None,
        };
        atomic_write_new_json(&acknowledged, &old_path, &old, MAX_REGISTRY_BYTES)
            .expect("old tombstone");

        let report = bus
            .compact_acknowledgements(
                &second_registration,
                AcknowledgementRetentionPolicy::new(u64::MAX, 1).expect("policy"),
            )
            .expect("compact");
        assert_eq!(report.removed, 1);
        let proof = bus
            .completed_response_receipt(&second_registration, &request_receipt.delivery_id)
            .expect("reconciliation lookup")
            .expect("durable response proof");
        assert_eq!(proof.delivery_id, response_receipt.delivery_id);
        assert_eq!(proof.recipient_instance_id, first.instance_id);
    }

    #[test]
    fn completion_is_idempotent_for_stale_sender_and_rejects_response_collision() {
        let (_temporary, bus, first, second, first_registration, second_registration) = setup();
        let inbound = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-stale-sender", "answer after I leave"),
            )
            .expect("enqueue");
        bus.claim_pending(&second_registration, &inbound.delivery_id)
            .expect("claim");
        bus.unregister(&first_registration)
            .expect("sender unregister");

        let answer = response("msg-stale-answer", "still delivered");
        let first_receipt = bus
            .complete_claimed_request(&second_registration, &inbound.delivery_id, &answer)
            .expect("complete for stale sender");
        let retry = bus
            .complete_claimed_request(&second_registration, &inbound.delivery_id, &answer)
            .expect("idempotent retry");
        assert_eq!(first_receipt, retry);
        assert!(
            bus.complete_claimed_request(
                &second_registration,
                &inbound.delivery_id,
                &response("msg-other-answer", "different")
            )
            .is_err()
        );

        let replacement = bus.register(&first, process(8)).expect("sender restart");
        let deliveries = bus
            .list_deliveries(&replacement)
            .expect("stale sender inbox");
        assert_eq!(deliveries.len(), 1);
        assert_eq!(deliveries[0].delivery_id, first_receipt.delivery_id);
    }

    #[test]
    fn concurrent_completion_converges_on_one_response() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        let inbound = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-complete-race", "complete once"),
            )
            .expect("enqueue");
        bus.claim_pending(&second_registration, &inbound.delivery_id)
            .expect("claim");
        let barrier = Arc::new(Barrier::new(3));
        let mut workers = Vec::new();
        for _ in 0..2 {
            let worker_bus = bus.clone();
            let worker_registration = second_registration.clone();
            let worker_delivery = inbound.delivery_id.clone();
            let worker_barrier = Arc::clone(&barrier);
            workers.push(thread::spawn(move || {
                worker_barrier.wait();
                worker_bus.complete_claimed_request(
                    &worker_registration,
                    &worker_delivery,
                    &response("msg-race-answer", "one answer"),
                )
            }));
        }
        barrier.wait();
        let receipts: Vec<_> = workers
            .into_iter()
            .map(|worker| {
                worker
                    .join()
                    .expect("completion worker")
                    .expect("completion")
            })
            .collect();
        assert_eq!(receipts[0], receipts[1]);
        let deliveries = bus
            .list_deliveries(&first_registration)
            .expect("response inbox");
        assert_eq!(deliveries.len(), 1);
        assert_eq!(deliveries[0].delivery_id, receipts[0].delivery_id);
    }

    #[test]
    fn rejected_request_uses_rejected_task_state() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        let inbound = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-reject", "unsafe request"),
            )
            .expect("enqueue");
        bus.claim_pending(&second_registration, &inbound.delivery_id)
            .expect("claim");
        let response_receipt = bus
            .reject_claimed_request(&second_registration, &inbound.delivery_id)
            .expect("reject");
        let ReceivedDelivery::Response(rejected) = bus
            .inspect_delivery(&first_registration, &response_receipt.delivery_id)
            .expect("inspect rejected response")
        else {
            panic!("expected response");
        };
        assert_eq!(
            rejected.response.task.expect("task").status.state,
            TaskState::Rejected
        );
    }

    #[test]
    fn stale_recovery_acknowledges_request_when_response_is_already_durable() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        let inbound = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-fault", "simulate response-before-ack crash"),
            )
            .expect("enqueue");
        bus.claim_pending(&second_registration, &inbound.delivery_id)
            .expect("claim");
        let response_envelope = DeliveryEnvelope {
            schema_version: LOCAL_BUS_SCHEMA_VERSION,
            delivery_id: response_delivery_id(
                &second.instance_id,
                first_registration.instance_id(),
                &inbound.delivery_id,
            ),
            sender_instance_id: second.instance_id.clone(),
            recipient_instance_id: first_registration.instance_id().to_owned(),
            enqueued_at_ms: now_ms().expect("time"),
            request: None,
            response: Some(response("msg-fault-answer", "durable answer")),
            in_reply_to_delivery_id: Some(inbound.delivery_id.clone()),
        };
        bus.enqueue_envelope_locked(&response_envelope)
            .expect("inject durable response");

        let registry_path = bus.registry_path(&second.instance_id).expect("registry");
        let mut stale: PeerEntry =
            read_required_json(&registry_path, MAX_REGISTRY_BYTES, "registry").expect("entry");
        stale.process.started_at_ms = 1;
        stale.lease_updated_at_ms = 1;
        atomic_replace_json(&bus.registry, &registry_path, &stale, MAX_REGISTRY_BYTES)
            .expect("stale lease");
        let replacement = bus.register(&second, process(9)).expect("recover");
        assert_eq!(bus.list_pending(&replacement).expect("no replay").len(), 0);
        assert!(
            bus.dequeue(&replacement)
                .expect("no agent replay")
                .is_none()
        );
        assert_eq!(
            bus.list_deliveries(&first_registration)
                .expect("durable response")
                .len(),
            1
        );
    }

    #[test]
    fn stale_peers_are_filtered_and_cannot_receive_new_messages() {
        let (_temporary, bus, _first, second, first_registration, _second_registration) = setup();
        let path = bus
            .registry_path(&second.instance_id)
            .expect("registry path");
        let mut entry: PeerEntry =
            read_required_json(&path, MAX_REGISTRY_BYTES, "registry entry").expect("entry");
        entry.process.started_at_ms = 1;
        entry.lease_updated_at_ms = 1;
        atomic_replace_json(&bus.registry, &path, &entry, MAX_REGISTRY_BYTES).expect("stale entry");

        let peers = bus.list_peers().expect("list peers");
        assert_eq!(peers.len(), 1);
        assert_ne!(peers[0].instance_id, second.instance_id);
        assert!(
            bus.enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-3", "stale")
            )
            .is_err()
        );
    }

    #[test]
    fn corrupt_registry_and_queue_files_are_rejected() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        let registry_path = bus
            .registry_path(&second.instance_id)
            .expect("registry path");
        fs::write(&registry_path, b"{not-json").expect("corrupt registry");
        assert!(bus.list_peers().is_err());

        let second_entry = PeerEntry {
            schema_version: LOCAL_BUS_SCHEMA_VERSION,
            instance_id: second.instance_id.clone(),
            name: second.name.clone(),
            inbox_endpoint: inbox_endpoint(&second.instance_id).expect("endpoint"),
            protocol_version: PROTOCOL_VERSION.to_owned(),
            lease_updated_at_ms: now_ms().expect("time"),
            process: second_registration.entry.process.clone(),
        };
        atomic_replace_json(
            &bus.registry,
            &registry_path,
            &second_entry,
            MAX_REGISTRY_BYTES,
        )
        .expect("restore registry");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-4", "corrupt"),
            )
            .expect("enqueue");
        let (pending, _processing, _acknowledged) =
            bus.queue_directories(&second.instance_id).expect("queue");
        fs::write(
            pending.join(delivery_filename(&receipt.delivery_id).expect("filename")),
            b"[]",
        )
        .expect("corrupt queue");
        assert!(bus.list_pending(&second_registration).is_err());
        assert!(bus.dequeue(&second_registration).is_err());
    }

    #[test]
    fn traversal_and_oversized_files_are_rejected() {
        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        assert!(
            bus.enqueue(&first_registration, "../peer", &request("msg-5", "bad"))
                .is_err()
        );

        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-6", "large"),
            )
            .expect("enqueue");
        let (pending, _processing, _acknowledged) =
            bus.queue_directories(&second.instance_id).expect("queue");
        fs::write(
            pending.join(delivery_filename(&receipt.delivery_id).expect("filename")),
            vec![b'x'; MAX_ENVELOPE_BYTES + 1],
        )
        .expect("oversized delivery");
        assert!(bus.dequeue(&second_registration).is_err());
    }

    #[test]
    fn artifact_staging_is_bounded_content_addressed_and_idempotent() {
        let (temporary, bus, _first, _second, first_registration, _second_registration) = setup();
        let workspace = temporary.path().join("artifact-workspace");
        let nested = workspace.join("output");
        fs::create_dir(&workspace).expect("artifact workspace");
        fs::create_dir(&nested).expect("artifact directory");
        fs::write(nested.join("report.txt"), b"bounded artifact\n").expect("artifact source");

        let first = bus
            .stage_artifact(
                &first_registration,
                &workspace,
                Path::new("output/report.txt"),
            )
            .expect("stage artifact");
        let second = bus
            .stage_artifact(
                &first_registration,
                &workspace,
                Path::new("output/report.txt"),
            )
            .expect("stage artifact again");
        assert_eq!(first, second);
        assert_eq!(first.size_bytes, 17);
        assert!(first.relative_url.starts_with(&format!(
            "artifacts/{}/sha256-",
            first_registration.instance_id()
        )));
        assert!(first.relative_url.ends_with("/report.txt"));
        let staged = bus.root().join(&first.relative_url);
        assert_eq!(
            fs::read(staged).expect("staged bytes"),
            b"bounded artifact\n"
        );
    }

    #[test]
    fn pending_artifact_is_verified_into_quarantine_idempotently_without_claim_or_ack() {
        let (temporary, bus, _first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("sender-artifact-source");
        let receiver_workspace = temporary.path().join("receiver-artifact-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::write(
            sender_workspace.join("report.txt"),
            b"verified peer artifact\n",
        )
        .expect("artifact bytes");
        let staged = bus
            .stage_artifact(
                &first_registration,
                &sender_workspace,
                Path::new("report.txt"),
            )
            .expect("stage artifact");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-quarantine", &staged),
            )
            .expect("enqueue artifact");

        assert!(
            bus.quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                1,
            )
            .is_err(),
            "a text request part must not be moved or quarantined as a file"
        );

        let first = bus
            .quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                2,
            )
            .expect("quarantine artifact");
        let second_copy = bus
            .quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                2,
            )
            .expect("quarantine artifact again");
        assert_eq!(first, second_copy);
        assert_eq!(first.sha256, staged.sha256);
        assert_eq!(first.size_bytes, staged.size_bytes);
        assert_eq!(
            fs::read(receiver_workspace.join(&first.relative_path)).expect("quarantined bytes"),
            b"verified peer artifact\n"
        );
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );
        let (pending, processing, acknowledged) = bus
            .queue_directories(second_registration.instance_id())
            .expect("inbox");
        assert_eq!(count_visible_entries(&pending).expect("pending count"), 1);
        assert_eq!(
            count_visible_entries(&processing).expect("processing count"),
            0
        );
        assert_eq!(count_visible_entries(&acknowledged).expect("ack count"), 0);
        discard_quarantined_artifact(&receiver_workspace, &receipt.delivery_id, 2)
            .expect("discard while delivery remains pending");
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );
        assert_eq!(count_visible_entries(&acknowledged).expect("ack count"), 0);
    }

    #[test]
    fn durable_quarantine_receipt_imports_after_ack_without_overwrite_or_queue_changes() {
        let (temporary, bus, _first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("receipt-source");
        let receiver_workspace = temporary.path().join("receipt-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::create_dir(receiver_workspace.join("imports")).expect("import directory");
        fs::write(sender_workspace.join("report.txt"), b"durable receipt\n").expect("source");
        let staged = bus
            .stage_artifact(
                &first_registration,
                &sender_workspace,
                Path::new("report.txt"),
            )
            .expect("stage");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-durable-receipt", &staged),
            )
            .expect("enqueue");
        bus.quarantine_artifact(
            &second_registration,
            &receiver_workspace,
            &receipt.delivery_id,
            2,
        )
        .expect("fetch into quarantine");
        let claimed = bus
            .claim_pending(&second_registration, &receipt.delivery_id)
            .expect("claim original delivery");
        bus.acknowledge(&second_registration, &claimed.delivery_id)
            .expect("ack original delivery");

        let imported = import_quarantined_artifact(
            &receiver_workspace,
            &receipt.delivery_id,
            2,
            Path::new("imports/report.txt"),
        )
        .expect("import from durable receipt");
        assert_eq!(imported.sha256, staged.sha256);
        assert_eq!(imported.size_bytes, staged.size_bytes);
        assert_eq!(
            fs::read(receiver_workspace.join(&imported.relative_destination))
                .expect("imported bytes"),
            b"durable receipt\n"
        );
        assert!(
            import_quarantined_artifact(
                &receiver_workspace,
                &receipt.delivery_id,
                2,
                Path::new("imports/report.txt"),
            )
            .is_err(),
            "import must never overwrite an existing destination"
        );
        assert_eq!(
            bus.list_pending(&second_registration).expect("pending"),
            Vec::<PendingDeliverySummary>::new()
        );
        let (_pending, processing, acknowledged) = bus
            .queue_directories(second_registration.instance_id())
            .expect("inbox");
        assert_eq!(
            count_visible_entries(&processing).expect("processing count"),
            0
        );
        assert_eq!(count_visible_entries(&acknowledged).expect("ack count"), 1);

        let discarded = discard_quarantined_artifact(&receiver_workspace, &receipt.delivery_id, 2)
            .expect("discard fetched artifact");
        assert_eq!(discarded.sha256, staged.sha256);
        assert!(receiver_workspace.join("imports/report.txt").is_file());
        assert_eq!(
            bus.list_pending(&second_registration).expect("pending"),
            Vec::<PendingDeliverySummary>::new()
        );
        assert_eq!(count_visible_entries(&acknowledged).expect("ack count"), 1);
        assert!(
            discard_quarantined_artifact(&receiver_workspace, &receipt.delivery_id, 2).is_err()
        );
    }

    #[test]
    fn quarantine_refetch_rejects_a_receipt_swapped_to_another_sender_identity() {
        let (temporary, bus, first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("sender-bound-source");
        let receiver_workspace = temporary.path().join("sender-bound-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::write(sender_workspace.join("bound.bin"), b"sender-bound bytes").expect("source");
        let staged = bus
            .stage_artifact(
                &first_registration,
                &sender_workspace,
                Path::new("bound.bin"),
            )
            .expect("stage");
        let delivery = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-sender-bound", &staged),
            )
            .expect("enqueue");
        bus.quarantine_artifact(
            &second_registration,
            &receiver_workspace,
            &delivery.delivery_id,
            2,
        )
        .expect("initial fetch");

        let a2a = receiver_workspace.join(".crumb").join("a2a");
        let (mut stored, receipt_path) =
            read_quarantine_receipt(&a2a, &delivery.delivery_id, 2).expect("stored receipt");
        assert_eq!(stored.sender_instance_id, first.instance_id);
        stored.sender_instance_id.clone_from(&second.instance_id);
        stored
            .validate()
            .expect("alternate sender is structurally valid");
        atomic_replace_json(
            receipt_path.parent().expect("receipt directory"),
            &receipt_path,
            &stored,
            MAX_QUARANTINE_RECEIPT_BYTES,
        )
        .expect("swap receipt sender");

        let error = bus
            .quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &delivery.delivery_id,
                2,
            )
            .expect_err("sender-swapped receipt must be rejected");
        assert!(error.to_string().contains("conflicts"));
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );
    }

    #[test]
    fn quarantine_import_rejects_unsafe_paths_and_tampered_bytes() {
        let (temporary, bus, _first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("import-safety-source");
        let receiver_workspace = temporary.path().join("import-safety-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::create_dir(receiver_workspace.join("existing-parent")).expect("existing parent");
        fs::write(sender_workspace.join("safe.bin"), b"safe bytes").expect("source");
        fs::write(receiver_workspace.join("existing.bin"), b"keep me").expect("existing target");
        let staged = bus
            .stage_artifact(
                &first_registration,
                &sender_workspace,
                Path::new("safe.bin"),
            )
            .expect("stage");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-import-safety", &staged),
            )
            .expect("enqueue");
        let fetched = bus
            .quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                2,
            )
            .expect("fetch");

        for destination in [
            Path::new("../escape.bin"),
            Path::new("/absolute.bin"),
            Path::new(".crumb/escape.bin"),
            Path::new(".git/escape.bin"),
            Path::new("nested/.git/escape.bin"),
            Path::new("missing-parent/file.bin"),
            Path::new("existing.bin"),
        ] {
            assert!(
                import_quarantined_artifact(
                    &receiver_workspace,
                    &receipt.delivery_id,
                    2,
                    destination,
                )
                .is_err(),
                "accepted unsafe destination {destination:?}"
            );
        }
        assert_eq!(
            fs::read(receiver_workspace.join("existing.bin")).expect("existing target"),
            b"keep me"
        );

        let imported = import_quarantined_artifact(
            &receiver_workspace,
            &receipt.delivery_id,
            2,
            Path::new("existing-parent/valid.bin"),
        )
        .expect("safe import");
        assert_eq!(imported.sha256, staged.sha256);
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );

        fs::write(receiver_workspace.join(&fetched.relative_path), b"tampered")
            .expect("tamper quarantine");
        assert!(
            import_quarantined_artifact(
                &receiver_workspace,
                &receipt.delivery_id,
                2,
                Path::new("existing-parent/import.bin"),
            )
            .is_err()
        );
        assert!(
            discard_quarantined_artifact(&receiver_workspace, &receipt.delivery_id, 2).is_err()
        );
        fs::remove_file(receiver_workspace.join(&fetched.relative_path))
            .expect("remove quarantine artifact");
        assert!(
            discard_quarantined_artifact(&receiver_workspace, &receipt.delivery_id, 2).is_err(),
            "discard must not remove a receipt when its verified artifact is missing"
        );
        assert!(
            !receiver_workspace
                .join("existing-parent/import.bin")
                .exists()
        );
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );
    }

    #[test]
    fn quarantine_rejects_a_new_artifact_at_capacity_without_changing_pending_delivery() {
        let (temporary, bus, _first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("capacity-source");
        let receiver_workspace = temporary.path().join("capacity-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::write(sender_workspace.join("new.bin"), b"new artifact").expect("source");
        let staged = bus
            .stage_artifact(&first_registration, &sender_workspace, Path::new("new.bin"))
            .expect("stage");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-quarantine-capacity", &staged),
            )
            .expect("enqueue");
        for index in 0..MAX_QUARANTINED_ARTIFACTS {
            add_quarantined_artifact(&receiver_workspace, index);
        }

        let error = bus
            .quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                2,
            )
            .expect_err("capacity must reject a new artifact");
        assert!(error.to_string().contains("limit has been reached"));
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );
        assert!(
            !receiver_workspace
                .join(".crumb")
                .join("a2a")
                .join("quarantine")
                .join(&receipt.delivery_id)
                .exists()
        );
    }

    #[test]
    fn quarantine_rolls_back_a_new_artifact_when_receipt_persistence_fails() {
        let (temporary, bus, first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("receipt-capacity-source");
        let receiver_workspace = temporary.path().join("receipt-capacity-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::write(sender_workspace.join("new.bin"), b"new verified artifact").expect("source");
        let staged = bus
            .stage_artifact(&first_registration, &sender_workspace, Path::new("new.bin"))
            .expect("stage");
        let delivery = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-receipt-capacity", &staged),
            )
            .expect("enqueue");
        let a2a = receiver_workspace.join(".crumb").join("a2a");
        fs::create_dir_all(&a2a).expect("receiver A2A metadata root");
        for index in 0..MAX_QUARANTINED_ARTIFACTS {
            let fixture = quarantine_receipt(
                &format!("delivery_{:064x}", index + 1),
                1,
                &first.instance_id,
                u64::try_from(index).expect("fixture timestamp") + 1,
                &format!("{:064x}", index + 1_000),
                7,
                &format!("artifact-{index}.bin"),
            );
            persist_quarantine_receipt(&a2a, &fixture).expect("fixture receipt");
        }

        let error = bus
            .quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &delivery.delivery_id,
                2,
            )
            .expect_err("receipt capacity must fail the fetch");
        assert!(error.to_string().contains("receipt limit"));
        assert!(
            !receiver_workspace
                .join(".crumb")
                .join("a2a")
                .join("quarantine")
                .join(&delivery.delivery_id)
                .exists(),
            "new artifact must be rolled back when its receipt cannot persist"
        );
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );
    }

    #[test]
    fn quarantine_refetches_an_existing_verified_artifact_at_capacity() {
        let (temporary, bus, _first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("refetch-source");
        let receiver_workspace = temporary.path().join("refetch-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::write(sender_workspace.join("existing.bin"), b"existing artifact").expect("source");
        let staged = bus
            .stage_artifact(
                &first_registration,
                &sender_workspace,
                Path::new("existing.bin"),
            )
            .expect("stage");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-quarantine-refetch", &staged),
            )
            .expect("enqueue");
        let first = bus
            .quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                2,
            )
            .expect("initial quarantine");
        for index in 0..MAX_QUARANTINED_ARTIFACTS - 1 {
            add_quarantined_artifact(&receiver_workspace, index);
        }

        let refetched = bus
            .quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                2,
            )
            .expect("idempotent refetch at capacity");
        assert_eq!(refetched, first);
        assert_eq!(
            fs::read(receiver_workspace.join(refetched.relative_path)).expect("artifact bytes"),
            b"existing artifact"
        );
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );
    }

    #[test]
    fn quarantine_rejects_unsafe_storage_entries_without_changing_pending_delivery() {
        let (temporary, bus, _first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("unsafe-storage-source");
        let receiver_workspace = temporary.path().join("unsafe-storage-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::write(sender_workspace.join("file.bin"), b"safe source").expect("source");
        let staged = bus
            .stage_artifact(
                &first_registration,
                &sender_workspace,
                Path::new("file.bin"),
            )
            .expect("stage");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-unsafe-storage", &staged),
            )
            .expect("enqueue");
        let quarantine = receiver_workspace.join(".crumb/a2a/quarantine");
        fs::create_dir_all(&quarantine).expect("quarantine root");
        fs::write(
            quarantine.join(format!("delivery_{:064x}", 1)),
            b"not a directory",
        )
        .expect("unsafe delivery entry");

        assert!(
            bus.quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                2,
            )
            .is_err()
        );
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;

            let unsafe_entry = quarantine.join(format!("delivery_{:064x}", 1));
            fs::remove_file(&unsafe_entry).expect("remove unsafe regular entry");
            let outside = receiver_workspace.join("outside-quarantine");
            fs::create_dir(&outside).expect("outside directory");
            symlink(&outside, &unsafe_entry).expect("unsafe delivery symlink");
            assert!(
                bus.quarantine_artifact(
                    &second_registration,
                    &receiver_workspace,
                    &receipt.delivery_id,
                    2,
                )
                .is_err()
            );
            assert_eq!(
                bus.list_pending(&second_registration)
                    .expect("pending")
                    .len(),
                1
            );
        }
    }

    #[test]
    fn artifact_claim_rejects_https_foreign_sender_and_unsafe_references() {
        let sender = "crumb_0123456789abcdef0123456789abcdef";
        let digest = "ab".repeat(32);
        let metadata = Some(serde_json::json!({
            "sha256": digest,
            "sizeBytes": 4,
        }));
        for url in [
            "https://peer.example/file.txt".to_owned(),
            format!("artifacts/crumb_ffffffffffffffffffffffffffffffff/sha256-{digest}/file.txt"),
            format!("artifacts/{sender}/sha256-{digest}/../file.txt"),
            format!("artifacts/{sender}/sha256-{digest}/nested/file.txt"),
        ] {
            let part = Part {
                text: None,
                data: None,
                url: Some(url),
                metadata: metadata.clone(),
                filename: Some("file.txt".to_owned()),
                media_type: Some("application/octet-stream".to_owned()),
            };
            assert!(verified_artifact_claim(sender, &part).is_err());
        }
    }

    #[test]
    fn quarantine_rejects_https_and_foreign_sender_deliveries() {
        let (temporary, bus, first, _second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("ownership-source");
        let receiver_workspace = temporary.path().join("ownership-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::write(sender_workspace.join("file.bin"), b"owned").expect("source");
        let staged = bus
            .stage_artifact(
                &first_registration,
                &sender_workspace,
                Path::new("file.bin"),
            )
            .expect("stage");

        let foreign = bus
            .enqueue(
                &second_registration,
                &first.instance_id,
                &file_request("msg-foreign-owner", &staged),
            )
            .expect("foreign delivery");
        assert!(
            bus.quarantine_artifact(
                &first_registration,
                &receiver_workspace,
                &foreign.delivery_id,
                2,
            )
            .is_err()
        );

        let mut https = Part::file(
            "https://peer.example/file.bin",
            "file.bin",
            "application/octet-stream",
        );
        https.metadata = Some(serde_json::json!({
            "sha256": "ab".repeat(32),
            "sizeBytes": 5,
        }));
        let mut request = request("msg-https-file", "remote file");
        request.message.parts.push(https);
        let https_receipt = bus
            .enqueue(&second_registration, &first.instance_id, &request)
            .expect("HTTPS delivery");
        assert!(
            bus.quarantine_artifact(
                &first_registration,
                &receiver_workspace,
                &https_receipt.delivery_id,
                2,
            )
            .is_err()
        );
        assert_eq!(
            bus.list_pending(&first_registration)
                .expect("pending")
                .len(),
            2
        );
    }

    #[test]
    fn quarantine_rejects_tampered_staged_bytes() {
        let (temporary, bus, _first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("tamper-source");
        let receiver_workspace = temporary.path().join("tamper-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::write(sender_workspace.join("file.bin"), b"good").expect("source");
        let staged = bus
            .stage_artifact(
                &first_registration,
                &sender_workspace,
                Path::new("file.bin"),
            )
            .expect("stage");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-tampered", &staged),
            )
            .expect("enqueue");
        fs::write(bus.root().join(&staged.relative_url), b"evil").expect("tamper");

        assert!(
            bus.quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                2,
            )
            .is_err()
        );
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );
        assert!(
            !receiver_workspace
                .join(".crumb")
                .join("a2a")
                .join("quarantine")
                .join(receipt.delivery_id)
                .exists(),
            "a rejected fetch must not leave delivery directories behind"
        );
    }

    #[test]
    fn artifact_staging_rejects_escape_absolute_non_regular_and_oversized_sources() {
        let (temporary, bus, _first, _second, first_registration, _second_registration) = setup();
        let workspace = temporary.path().join("artifact-workspace-invalid");
        fs::create_dir(&workspace).expect("artifact workspace");
        fs::create_dir(workspace.join("directory.txt")).expect("source directory");
        let oversized = usize::try_from(MAX_ARTIFACT_BYTES)
            .expect("artifact limit fits usize")
            .saturating_add(1);
        fs::write(workspace.join("large.bin"), vec![0_u8; oversized]).expect("large source");

        for source in [
            Path::new("../outside"),
            Path::new("/etc/passwd"),
            Path::new("directory.txt"),
            Path::new("large.bin"),
        ] {
            assert!(
                bus.stage_artifact(&first_registration, &workspace, source)
                    .is_err(),
                "accepted {source:?}"
            );
        }
    }

    #[test]
    fn different_live_runtime_cannot_replace_or_unregister_owner() {
        let (_temporary, bus, first, _second, first_registration, _second_registration) = setup();
        assert!(bus.register(&first, process(9)).is_err());
        let forged = Registration {
            entry: PeerEntry {
                process: process(9),
                ..first_registration.entry.clone()
            },
        };
        assert!(bus.unregister(&forged).is_err());
    }

    #[test]
    fn tiny_ttl_filters_old_lease_without_sleeping() {
        let temporary = TempDir::new().expect("temporary root");
        let workspace = temporary.path().join("workspace");
        fs::create_dir(&workspace).expect("workspace");
        let instance = InstanceStore::for_workspace(&workspace)
            .load_or_create_named("Short Lease")
            .expect("identity");
        let bus = LocalBus::open(
            &temporary.path().join("bus"),
            LocalBusOptions {
                lease_ttl: Duration::from_millis(1),
            },
        )
        .expect("bus");
        let registration = bus.register(&instance, process(1)).expect("register");
        let path = bus.registry_path(registration.instance_id()).expect("path");
        let mut entry: PeerEntry =
            read_required_json(&path, MAX_REGISTRY_BYTES, "entry").expect("entry");
        entry.process.started_at_ms = 1;
        entry.lease_updated_at_ms = 1;
        atomic_replace_json(&bus.registry, &path, &entry, MAX_REGISTRY_BYTES).expect("replace");
        assert_eq!(bus.list_peers().expect("peers"), Vec::<PeerEntry>::new());
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_root_registry_and_queue_entries_are_rejected() {
        use std::os::unix::fs::symlink;

        let temporary = TempDir::new().expect("temporary root");
        let target = temporary.path().join("target");
        fs::create_dir(&target).expect("target");
        let linked_root = temporary.path().join("linked-bus");
        symlink(&target, &linked_root).expect("root symlink");
        assert!(LocalBus::open(&linked_root, LocalBusOptions::default()).is_err());

        let (_temporary, bus, _first, second, first_registration, second_registration) = setup();
        let registry_path = bus
            .registry_path(&second.instance_id)
            .expect("registry path");
        fs::remove_file(&registry_path).expect("remove registry");
        symlink("missing", &registry_path).expect("registry symlink");
        assert!(bus.list_peers().is_err());

        fs::remove_file(&registry_path).expect("remove symlink");
        atomic_replace_json(
            &bus.registry,
            &registry_path,
            second_registration.entry(),
            MAX_REGISTRY_BYTES,
        )
        .expect("restore registry");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &request("msg-7", "symlink"),
            )
            .expect("enqueue");
        let (pending, _processing, _acknowledged) =
            bus.queue_directories(&second.instance_id).expect("queue");
        let delivery_path =
            pending.join(delivery_filename(&receipt.delivery_id).expect("filename"));
        fs::remove_file(&delivery_path).expect("remove delivery");
        symlink("missing", &delivery_path).expect("delivery symlink");
        assert!(bus.dequeue(&second_registration).is_err());

        let workspace = temporary.path().join("artifact-symlink-workspace");
        fs::create_dir(&workspace).expect("artifact workspace");
        fs::write(workspace.join("real.txt"), b"real").expect("real artifact");
        symlink("real.txt", workspace.join("linked.txt")).expect("artifact symlink");
        assert!(
            bus.stage_artifact(&first_registration, &workspace, Path::new("linked.txt"))
                .is_err()
        );

        let lock_path = bus
            .locks
            .join(format!("{}.lock", second_registration.instance_id()));
        fs::remove_file(&lock_path).expect("remove lease lock");
        symlink("missing", &lock_path).expect("lease lock symlink");
        let mut registration = second_registration;
        assert!(bus.heartbeat(&mut registration).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn quarantine_rejects_symlinked_and_non_regular_staged_artifacts() {
        use std::os::unix::fs::symlink;

        let (temporary, bus, _first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("unsafe-quarantine-source");
        let receiver_workspace = temporary.path().join("unsafe-quarantine-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::write(sender_workspace.join("file.bin"), b"good").expect("source");
        let staged = bus
            .stage_artifact(
                &first_registration,
                &sender_workspace,
                Path::new("file.bin"),
            )
            .expect("stage");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-unsafe-quarantine", &staged),
            )
            .expect("enqueue");
        let staged_path = bus.root().join(&staged.relative_url);
        fs::remove_file(&staged_path).expect("remove staged file");
        symlink(&sender_workspace, &staged_path).expect("staged symlink");
        assert!(
            bus.quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                2,
            )
            .is_err()
        );
        fs::remove_file(&staged_path).expect("remove staged symlink");
        fs::create_dir(&staged_path).expect("staged directory");
        assert!(
            bus.quarantine_artifact(
                &second_registration,
                &receiver_workspace,
                &receipt.delivery_id,
                2,
            )
            .is_err()
        );
        assert_eq!(
            bus.list_pending(&second_registration)
                .expect("pending")
                .len(),
            1
        );
    }

    #[cfg(unix)]
    #[test]
    fn quarantine_import_rejects_symlinked_destination_parent() {
        use std::os::unix::fs::symlink;

        let (temporary, bus, _first, second, first_registration, second_registration) = setup();
        let sender_workspace = temporary.path().join("symlink-import-source");
        let receiver_workspace = temporary.path().join("symlink-import-target");
        let outside = temporary.path().join("outside-import-target");
        fs::create_dir(&sender_workspace).expect("sender workspace");
        fs::create_dir(&receiver_workspace).expect("receiver workspace");
        fs::create_dir(&outside).expect("outside directory");
        symlink(&outside, receiver_workspace.join("linked-parent")).expect("parent symlink");
        fs::write(sender_workspace.join("file.bin"), b"verified").expect("source");
        let staged = bus
            .stage_artifact(
                &first_registration,
                &sender_workspace,
                Path::new("file.bin"),
            )
            .expect("stage");
        let receipt = bus
            .enqueue(
                &first_registration,
                &second.instance_id,
                &file_request("msg-symlink-import", &staged),
            )
            .expect("enqueue");
        bus.quarantine_artifact(
            &second_registration,
            &receiver_workspace,
            &receipt.delivery_id,
            2,
        )
        .expect("fetch");

        assert!(
            import_quarantined_artifact(
                &receiver_workspace,
                &receipt.delivery_id,
                2,
                Path::new("linked-parent/file.bin"),
            )
            .is_err()
        );
        assert!(!outside.join("file.bin").exists());
    }
}
