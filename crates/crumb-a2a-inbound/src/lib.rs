//! Explicit, harness-agnostic lifecycle coordination for inbound A2A requests.
//!
//! This crate deliberately does not poll an inbox, execute a model, import a
//! file, open a URL, or render peer content. Callers must select an exact
//! delivery identifier and separately authorize any future execution. The only
//! model-facing projection is bounded text and is marked untrusted by type.

use std::fmt;
use std::path::Path;

use anyhow::{Context, Result, bail};
use crumb_a2a::{
    MAX_TEXT_BYTES, Message, Part, Role, SendMessageRequest, SendMessageResponse, Validate as _,
    to_json,
};
use crumb_a2a_exchanges::{
    ExchangeDirection, ExchangeStore, NewExchange, ResponseMetadata as ExchangeResponse,
};
use crumb_a2a_runtime::A2aRuntime;
use crumb_a2a_tasks::{NewTask, ResponseRecord, TaskRecord, TaskState, TaskStore};
use sha2::{Digest as _, Sha256};

/// Maximum text bytes handed to a future isolated peer executor.
pub const MAX_UNTRUSTED_TEXT_BYTES: usize = 32 * 1024;
/// Maximum text parts included in the executor projection.
pub const MAX_UNTRUSTED_TEXT_PARTS: usize = 32;

/// Bounded peer-authored text for a future isolated executor.
///
/// This value never includes structured data, file URLs, filenames, media
/// types, metadata, or local paths. It is still untrusted prompt input.
#[derive(Clone, Eq, PartialEq)]
pub struct UntrustedTextProjection {
    text: String,
    text_part_count: u32,
    artifact_count: u32,
    omitted_part_count: u32,
    truncated: bool,
}

impl UntrustedTextProjection {
    /// Peer-authored, untrusted text. It must not be treated as instructions
    /// with authority beyond the isolated peer turn.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.text
    }

    #[must_use]
    pub const fn text_part_count(&self) -> u32 {
        self.text_part_count
    }

    #[must_use]
    pub const fn artifact_count(&self) -> u32 {
        self.artifact_count
    }

    #[must_use]
    pub const fn omitted_part_count(&self) -> u32 {
        self.omitted_part_count
    }

    #[must_use]
    pub const fn is_truncated(&self) -> bool {
        self.truncated
    }
}

impl fmt::Debug for UntrustedTextProjection {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("UntrustedTextProjection")
            .field("text_bytes", &self.text.len())
            .field("text_part_count", &self.text_part_count)
            .field("artifact_count", &self.artifact_count)
            .field("omitted_part_count", &self.omitted_part_count)
            .field("truncated", &self.truncated)
            .finish_non_exhaustive()
    }
}

/// One exact inbound request held in the transport processing queue.
///
/// Its debug form is intentionally redacted so peer content cannot leak into
/// diagnostics accidentally.
#[derive(Clone, Eq, PartialEq)]
pub struct ClaimedInbound {
    delivery_id: String,
    sender_instance_id: String,
    request_digest: String,
    context_id: Option<String>,
    projection: UntrustedTextProjection,
}

impl ClaimedInbound {
    #[must_use]
    pub fn delivery_id(&self) -> &str {
        &self.delivery_id
    }

    #[must_use]
    pub fn sender_instance_id(&self) -> &str {
        &self.sender_instance_id
    }

    #[must_use]
    pub fn request_digest(&self) -> &str {
        &self.request_digest
    }

    #[must_use]
    pub const fn projection(&self) -> &UntrustedTextProjection {
        &self.projection
    }
}

impl fmt::Debug for ClaimedInbound {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ClaimedInbound")
            .field("delivery_id", &self.delivery_id)
            .field("sender_instance_id", &self.sender_instance_id)
            .field("request_digest", &self.request_digest)
            .field("has_context_id", &self.context_id.is_some())
            .field("projection", &self.projection)
            .finish()
    }
}

/// Coordinates transport claims with the redacted workspace task ledger.
#[derive(Clone, Debug)]
pub struct InboundCoordinator {
    runtime: A2aRuntime,
    tasks: TaskStore,
    exchanges: ExchangeStore,
}

impl InboundCoordinator {
    /// Creates a coordinator without polling or touching the inbox.
    #[must_use]
    pub fn new(runtime: A2aRuntime, workspace: &Path) -> Self {
        Self {
            runtime,
            tasks: TaskStore::for_workspace(workspace),
            exchanges: ExchangeStore::for_workspace(workspace),
        }
    }

    /// Claims only the exact request selected by the caller and creates its
    /// compatible redacted ledger record.
    ///
    /// If ledger creation fails, the transport claim is released for retry.
    /// Responses are rejected by the request-only transport API and are never
    /// converted into agent work.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid/non-pending identifier, a response
    /// delivery, invalid request metadata, or unsafe transport/ledger state.
    pub fn claim(&self, delivery_id: &str) -> Result<(ClaimedInbound, TaskRecord)> {
        let received = self.runtime.claim_pending(delivery_id)?;
        let claimed = claimed_projection(
            &received.request,
            &received.delivery_id,
            &received.sender_instance_id,
        )?;
        let new_task = NewTask {
            delivery_id: claimed.delivery_id.clone(),
            request_digest: claimed.request_digest.clone(),
            sender_instance_id: claimed.sender_instance_id.clone(),
            text_part_count: claimed.projection.text_part_count,
            artifact_count: claimed.projection.artifact_count,
        };
        let record = match self.tasks.create_claimed(&new_task) {
            Ok(record) => record,
            Err(error) => {
                return match self.runtime.release(&received.delivery_id) {
                    Ok(()) => Err(error.context("inbound A2A task ledger rejected the claim")),
                    Err(release_error) => Err(error.context(format!(
                        "inbound A2A task ledger rejected the claim and transport release failed: {release_error:#}"
                    ))),
                };
            }
        };
        if matches!(
            record.state,
            TaskState::Completed | TaskState::Rejected | TaskState::Failed
        ) {
            self.runtime
                .release(&received.delivery_id)
                .context("terminal inbound A2A task could not be released")?;
            bail!("inbound A2A task is already terminal");
        }
        let _ = self.exchanges.record(&NewExchange {
            delivery_id: claimed.delivery_id.clone(),
            direction: ExchangeDirection::Inbound,
            peer_instance_id: claimed.sender_instance_id.clone(),
            request_digest: claimed.request_digest.clone(),
            request_part_count: u32::try_from(received.request.message.parts.len())
                .unwrap_or(u32::MAX),
            request_artifact_count: claimed.projection.artifact_count,
        });
        Ok((claimed, record))
    }

    /// Marks an exact claimed request as running. Repeated calls are safe.
    ///
    /// # Errors
    ///
    /// Returns an error if the redacted record is absent or incompatible.
    pub fn mark_running(&self, claimed: &ClaimedInbound) -> Result<TaskRecord> {
        self.ensure_claim_matches_ledger(claimed)?;
        let record = self.tasks.mark_running(&claimed.delivery_id)?;
        let _ = self.exchanges.mark_running(&claimed.delivery_id);
        Ok(record)
    }

    /// Queues a valid `ROLE_AGENT` response before recording completion.
    ///
    /// The transport acknowledges the inbound request only after its response
    /// is durable. The ledger is then updated from a content-free durable
    /// receipt. Retrying the same completion is idempotent.
    ///
    /// # Errors
    ///
    /// Returns an error unless the task is running, output is non-empty and
    /// bounded, or durable transport/ledger updates succeed.
    pub fn complete(&self, claimed: &ClaimedInbound, output: &str) -> Result<TaskRecord> {
        self.ensure_completable(claimed)?;
        let response = response_for(claimed, output)?;
        let enqueue = self
            .runtime
            .complete_claimed_request(&claimed.delivery_id, &response)?;
        let proof = self
            .runtime
            .completed_response_receipt(&claimed.delivery_id)?
            .context("completed A2A request has no durable response proof")?;
        if proof.delivery_id != enqueue.delivery_id
            || proof.recipient_instance_id != enqueue.recipient_instance_id
            || proof.recipient_instance_id != claimed.sender_instance_id
        {
            bail!("completed A2A response receipt does not match the inbound request");
        }
        let record = self.tasks.mark_completed(
            &claimed.delivery_id,
            ResponseRecord::new(proof.delivery_id, proof.digest)?,
        )?;
        if let Ok(response) = exchange_response_from(&response, &record) {
            let _ = self
                .exchanges
                .mark_completed(&claimed.delivery_id, response);
        }
        Ok(record)
    }

    /// Reconciles the crash window after a running request's response became
    /// durable but before its task record was marked completed.
    ///
    /// # Errors
    ///
    /// Returns an error unless the task is running and the transport has a
    /// matching durable response proof.
    pub fn reconcile_completed(&self, delivery_id: &str) -> Result<TaskRecord> {
        let record = self.tasks.load(delivery_id)?;
        if record.state == TaskState::Completed {
            return Ok(record);
        }
        if record.state != TaskState::Running {
            bail!("only a running inbound A2A task can be reconciled as completed");
        }
        let proof = self
            .runtime
            .completed_response_receipt(delivery_id)?
            .context("inbound A2A task has no durable response to reconcile")?;
        if proof.recipient_instance_id != record.sender_instance_id {
            bail!("durable A2A response recipient does not match the task sender");
        }
        let record = self.tasks.mark_completed(
            delivery_id,
            ResponseRecord::new(proof.delivery_id.clone(), proof.digest.clone())?,
        )?;
        let _ = self.exchanges.mark_completed(
            delivery_id,
            ExchangeResponse {
                delivery_id: proof.delivery_id,
                digest: proof.digest,
                part_count: None,
                artifact_count: None,
            },
        );
        Ok(record)
    }

    /// Sends the protocol's minimal rejected task response before marking the
    /// redacted ledger record rejected.
    ///
    /// # Errors
    ///
    /// Returns an error unless the claim is compatible and transport/ledger
    /// updates succeed.
    pub fn reject(&self, claimed: &ClaimedInbound) -> Result<TaskRecord> {
        let record = self.ensure_claim_matches_ledger(claimed)?;
        if record.state == TaskState::Running {
            bail!("a running inbound A2A task cannot be rejected");
        }
        if record.state == TaskState::Rejected {
            return Ok(record);
        }
        if record.state != TaskState::Claimed {
            bail!("only a claimed inbound A2A task can be rejected");
        }
        let enqueue = self.runtime.reject_claimed_request(&claimed.delivery_id)?;
        let proof = self
            .runtime
            .completed_response_receipt(&claimed.delivery_id)?
            .context("rejected A2A request has no durable response proof")?;
        if proof.delivery_id != enqueue.delivery_id
            || proof.recipient_instance_id != enqueue.recipient_instance_id
            || proof.recipient_instance_id != claimed.sender_instance_id
        {
            bail!("rejected A2A response receipt does not match the inbound request");
        }
        let record = self.tasks.mark_rejected(
            &claimed.delivery_id,
            Some(ResponseRecord::new(
                proof.delivery_id.clone(),
                proof.digest.clone(),
            )?),
        )?;
        let _ = self.exchanges.mark_rejected(
            &claimed.delivery_id,
            ExchangeResponse {
                delivery_id: proof.delivery_id,
                digest: proof.digest,
                part_count: Some(0),
                artifact_count: Some(0),
            },
        );
        Ok(record)
    }

    /// Reconciles an explicitly rejected request after a response-before-ledger
    /// crash window. The caller must retain the original rejection intent.
    ///
    /// # Errors
    ///
    /// Returns an error unless the task is still claimed and has a matching
    /// durable response proof.
    pub fn reconcile_rejected(&self, delivery_id: &str) -> Result<TaskRecord> {
        let record = self.tasks.load(delivery_id)?;
        if record.state == TaskState::Rejected {
            return Ok(record);
        }
        if record.state != TaskState::Claimed {
            bail!("only a claimed inbound A2A task can be reconciled as rejected");
        }
        let proof = self
            .runtime
            .completed_response_receipt(delivery_id)?
            .context("inbound A2A task has no durable rejection to reconcile")?;
        if proof.recipient_instance_id != record.sender_instance_id {
            bail!("durable A2A rejection recipient does not match the task sender");
        }
        let record = self.tasks.mark_rejected(
            delivery_id,
            Some(ResponseRecord::new(
                proof.delivery_id.clone(),
                proof.digest.clone(),
            )?),
        )?;
        let _ = self.exchanges.mark_rejected(
            delivery_id,
            ExchangeResponse {
                delivery_id: proof.delivery_id,
                digest: proof.digest,
                part_count: None,
                artifact_count: None,
            },
        );
        Ok(record)
    }

    /// Releases a claimed/running request to pending for a retryable failure.
    ///
    /// No failure/provider text is persisted and the compatible ledger record
    /// intentionally remains active for the next exact claim.
    ///
    /// # Errors
    ///
    /// Returns an error for an incompatible claim or transport release failure.
    pub fn release_retryable(&self, claimed: &ClaimedInbound) -> Result<TaskRecord> {
        let record = self.ensure_claim_matches_ledger(claimed)?;
        if !matches!(record.state, TaskState::Claimed | TaskState::Running) {
            bail!("only an active inbound A2A task can be released for retry");
        }
        self.runtime.release(&claimed.delivery_id)?;
        let _ = self.exchanges.touch_retryable(&claimed.delivery_id);
        Ok(record)
    }

    fn ensure_completable(&self, claimed: &ClaimedInbound) -> Result<TaskRecord> {
        let record = self.ensure_claim_matches_ledger(claimed)?;
        if !matches!(record.state, TaskState::Running | TaskState::Completed) {
            bail!("inbound A2A task must be running before completion");
        }
        Ok(record)
    }

    fn ensure_claim_matches_ledger(&self, claimed: &ClaimedInbound) -> Result<TaskRecord> {
        let record = self.tasks.load(&claimed.delivery_id)?;
        if record.request_digest != claimed.request_digest
            || record.sender_instance_id != claimed.sender_instance_id
            || record.text_part_count != claimed.projection.text_part_count
            || record.artifact_count != claimed.projection.artifact_count
        {
            bail!("inbound A2A claim does not match its redacted task record");
        }
        Ok(record)
    }
}

fn claimed_projection(
    request: &SendMessageRequest,
    delivery_id: &str,
    sender_instance_id: &str,
) -> Result<ClaimedInbound> {
    request
        .validate()
        .context("claimed inbound A2A request is invalid")?;
    let encoded = to_json(request).context("inbound A2A request digest encoding failed")?;
    let request_digest = format!("{:x}", Sha256::digest(&encoded));
    let projection = project_text(request)?;
    Ok(ClaimedInbound {
        delivery_id: delivery_id.to_owned(),
        sender_instance_id: sender_instance_id.to_owned(),
        request_digest,
        context_id: request.message.context_id.clone(),
        projection,
    })
}

fn project_text(request: &SendMessageRequest) -> Result<UntrustedTextProjection> {
    let mut output = String::new();
    let mut text_part_count = 0_u32;
    let mut artifact_count = 0_u32;
    let mut omitted_part_count = 0_u32;
    let mut truncated = false;

    for part in &request.message.parts {
        if let Some(text) = &part.text {
            text_part_count = text_part_count
                .checked_add(1)
                .context("inbound A2A text part count overflowed")?;
            if usize::try_from(text_part_count).unwrap_or(usize::MAX) > MAX_UNTRUSTED_TEXT_PARTS {
                truncated = true;
                continue;
            }
            if !output.is_empty() && !append_bounded(&mut output, "\n\n") {
                truncated = true;
                continue;
            }
            if !append_bounded(&mut output, text) {
                truncated = true;
            }
        } else if part.url.is_some() {
            artifact_count = artifact_count
                .checked_add(1)
                .context("inbound A2A artifact count overflowed")?;
        } else {
            omitted_part_count = omitted_part_count
                .checked_add(1)
                .context("inbound A2A omitted part count overflowed")?;
        }
    }

    Ok(UntrustedTextProjection {
        text: output,
        text_part_count,
        artifact_count,
        omitted_part_count,
        truncated,
    })
}

fn append_bounded(output: &mut String, value: &str) -> bool {
    let remaining = MAX_UNTRUSTED_TEXT_BYTES.saturating_sub(output.len());
    if value.len() <= remaining {
        output.push_str(value);
        return true;
    }
    let mut boundary = remaining.min(value.len());
    while boundary > 0 && !value.is_char_boundary(boundary) {
        boundary -= 1;
    }
    output.push_str(&value[..boundary]);
    false
}

fn exchange_response_from(
    response: &SendMessageResponse,
    record: &TaskRecord,
) -> Result<ExchangeResponse> {
    let identity = record
        .response
        .as_ref()
        .context("completed inbound A2A task lacks response identity")?;
    let mut part_count = 0_u32;
    let mut artifact_count = 0_u32;
    let mut include = |parts: &[Part]| -> Result<()> {
        let parts_len = u32::try_from(parts.len())
            .context("inbound A2A response part count exceeds supported bounds")?;
        let artifacts = u32::try_from(parts.iter().filter(|part| part.url.is_some()).count())
            .context("inbound A2A response artifact count exceeds supported bounds")?;
        part_count = part_count
            .checked_add(parts_len)
            .context("inbound A2A response part count overflowed")?;
        artifact_count = artifact_count
            .checked_add(artifacts)
            .context("inbound A2A response artifact count overflowed")?;
        Ok(())
    };
    if let Some(message) = &response.message {
        include(&message.parts)?;
    }
    if let Some(task) = &response.task {
        if let Some(message) = &task.status.message {
            include(&message.parts)?;
        }
        for artifact in &task.artifacts {
            include(&artifact.parts)?;
        }
        for message in &task.history {
            include(&message.parts)?;
        }
    }
    Ok(ExchangeResponse {
        delivery_id: identity.delivery_id.clone(),
        digest: identity.digest.clone(),
        part_count: Some(part_count),
        artifact_count: Some(artifact_count),
    })
}

fn response_for(claimed: &ClaimedInbound, output: &str) -> Result<SendMessageResponse> {
    if output.is_empty() {
        bail!("inbound A2A response text cannot be empty");
    }
    if output.len() > MAX_TEXT_BYTES {
        bail!("inbound A2A response text exceeds the protocol limit");
    }
    let identity = deterministic_identity(&claimed.delivery_id, b"response");
    let task_identity = deterministic_identity(&claimed.delivery_id, b"task");
    let response = SendMessageResponse {
        task: None,
        message: Some(Message {
            message_id: format!("message_{identity}"),
            context_id: claimed.context_id.clone(),
            task_id: Some(format!("task_{task_identity}")),
            role: Role::Agent,
            parts: vec![Part::text(output)],
            metadata: None,
            extensions: Vec::new(),
            reference_task_ids: Vec::new(),
        }),
    };
    response
        .validate()
        .context("constructed inbound A2A response is invalid")?;
    Ok(response)
}

fn deterministic_identity(delivery_id: &str, label: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(b"crumb-a2a-inbound-v1");
    digest.update([0]);
    digest.update(label);
    digest.update([0]);
    digest.update(delivery_id.as_bytes());
    format!("{:x}", digest.finalize())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};

    use crumb_a2a::{Message, Part, Role, SendMessageRequest};
    use crumb_a2a_local::{DeliveryKind, LocalBusOptions};
    use crumb_a2a_runtime::RuntimeOptions;
    use crumb_instance::{InstanceMetadata, InstanceStore};
    use serde_json::json;
    use tempfile::TempDir;

    use super::*;

    struct Fixture {
        _temporary: TempDir,
        sender_workspace: PathBuf,
        receiver_workspace: PathBuf,
        sender_instance: InstanceMetadata,
        receiver_instance: InstanceMetadata,
        sender: A2aRuntime,
        receiver: A2aRuntime,
    }

    impl Fixture {
        fn new() -> Self {
            let temporary = TempDir::new().expect("temporary root");
            let bus = temporary.path().join("bus");
            let (sender_workspace, sender_instance) = workspace(temporary.path(), "Inbound Sender");
            let (receiver_workspace, receiver_instance) =
                workspace(temporary.path(), "Inbound Receiver");
            let options = RuntimeOptions {
                local_bus: LocalBusOptions::default(),
            };
            let sender = A2aRuntime::start(&bus, &sender_workspace, &sender_instance, options)
                .expect("sender runtime");
            let receiver =
                A2aRuntime::start(&bus, &receiver_workspace, &receiver_instance, options)
                    .expect("receiver runtime");
            Self {
                _temporary: temporary,
                sender_workspace,
                receiver_workspace,
                sender_instance,
                receiver_instance,
                sender,
                receiver,
            }
        }

        fn coordinator(&self) -> InboundCoordinator {
            InboundCoordinator::new(self.receiver.clone(), &self.receiver_workspace)
        }

        fn send(&self, request: &SendMessageRequest) -> String {
            self.sender
                .enqueue(&self.receiver_instance.instance_id, request)
                .expect("enqueue request")
                .delivery_id
        }
    }

    fn workspace(root: &Path, name: &str) -> (PathBuf, InstanceMetadata) {
        let workspace = root.join(name.replace(' ', "-"));
        fs::create_dir(&workspace).expect("create workspace");
        let instance = InstanceStore::for_workspace(&workspace)
            .load_or_create_named(name)
            .expect("instance metadata");
        (workspace, instance)
    }

    fn request(message_id: &str, parts: Vec<Part>) -> SendMessageRequest {
        SendMessageRequest {
            tenant: None,
            message: Message {
                message_id: message_id.to_owned(),
                context_id: Some("peer-context".to_owned()),
                task_id: None,
                role: Role::User,
                parts,
                metadata: None,
                extensions: Vec::new(),
                reference_task_ids: Vec::new(),
            },
            configuration: None,
            metadata: None,
        }
    }

    #[test]
    fn exact_claim_projects_only_bounded_text_and_leaves_other_request_pending() {
        let fixture = Fixture::new();
        let first_id = fixture.send(&request("first", vec![Part::text("leave pending")]));
        let secret_url = "artifacts/sha256-deadbeef/private-plan.txt";
        let second_id = fixture.send(&request(
            "second",
            vec![
                Part::text("perform the peer task"),
                Part::file(secret_url, "private-plan.txt", "text/plain"),
                Part::data(json!({"private": "structured value"})),
            ],
        ));

        let coordinator = fixture.coordinator();
        let (claimed, record) = coordinator.claim(&second_id).expect("exact claim");
        assert_eq!(claimed.delivery_id(), second_id);
        assert_eq!(
            claimed.sender_instance_id(),
            fixture.sender_instance.instance_id
        );
        assert_eq!(claimed.projection().as_str(), "perform the peer task");
        assert_eq!(claimed.projection().text_part_count(), 1);
        assert_eq!(claimed.projection().artifact_count(), 1);
        assert_eq!(claimed.projection().omitted_part_count(), 1);
        assert!(!format!("{claimed:?}").contains("perform the peer task"));
        assert!(!claimed.projection().as_str().contains(secret_url));
        assert!(!claimed.projection().as_str().contains("structured value"));
        assert_eq!(record.state, TaskState::Claimed);

        let pending = fixture.receiver.list_pending().expect("pending requests");
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].delivery_id, first_id);
    }

    #[test]
    fn complete_is_role_agent_deterministic_and_idempotent() {
        let fixture = Fixture::new();
        let delivery_id = fixture.send(&request("complete", vec![Part::text("do work")]));
        let coordinator = fixture.coordinator();
        let (claimed, _) = coordinator.claim(&delivery_id).expect("claim");
        let running = coordinator.mark_running(&claimed).expect("mark running");
        assert_eq!(
            coordinator
                .mark_running(&claimed)
                .expect("idempotent running"),
            running
        );

        let first = coordinator
            .complete(&claimed, "work finished")
            .expect("complete");
        let repeated = coordinator
            .complete(&claimed, "work finished")
            .expect("idempotent completion");
        assert_eq!(first, repeated);
        assert!(coordinator.complete(&claimed, "different output").is_err());
        assert_eq!(first.state, TaskState::Completed);
        let exchange = ExchangeStore::for_workspace(&fixture.receiver_workspace)
            .load(&delivery_id)
            .expect("completed exchange");
        assert_eq!(
            exchange.state,
            crumb_a2a_exchanges::ExchangeState::InboundCompleted
        );
        let response_record = first.response.expect("response record");

        let delivery = fixture
            .sender
            .claim_delivery(&response_record.delivery_id)
            .expect("claim response");
        let crumb_a2a_local::ReceivedDelivery::Response(response) = delivery else {
            panic!("completion must produce a response delivery");
        };
        let message = response.response.message.expect("response message");
        assert_eq!(message.role, Role::Agent);
        assert_eq!(message.parts[0].text.as_deref(), Some("work finished"));
        assert_eq!(message.context_id.as_deref(), Some("peer-context"));
        assert!(message.message_id.starts_with("message_"));
        assert!(
            message
                .task_id
                .as_deref()
                .is_some_and(|id| id.starts_with("task_"))
        );
    }

    #[test]
    fn retry_release_keeps_only_redacted_active_record() {
        let fixture = Fixture::new();
        let delivery_id = fixture.send(&request(
            "retry",
            vec![Part::text("provider must never persist this text")],
        ));
        let coordinator = fixture.coordinator();
        let (claimed, _) = coordinator.claim(&delivery_id).expect("claim");
        coordinator.mark_running(&claimed).expect("mark running");
        let released = coordinator
            .release_retryable(&claimed)
            .expect("release retryable");
        assert_eq!(released.state, TaskState::Running);
        assert_eq!(
            ExchangeStore::for_workspace(&fixture.receiver_workspace)
                .load(&delivery_id)
                .expect("retry exchange")
                .state,
            crumb_a2a_exchanges::ExchangeState::InboundRunning
        );

        let (retried, retried_record) = coordinator.claim(&delivery_id).expect("retry claim");
        assert_eq!(retried.request_digest(), claimed.request_digest());
        assert_eq!(retried_record.state, TaskState::Running);
        let persisted = fs::read_to_string(
            fixture
                .receiver_workspace
                .join(".crumb/a2a/tasks")
                .join(format!("{delivery_id}.json")),
        )
        .expect("task record");
        assert!(!persisted.contains("provider must never persist"));
        assert!(!persisted.contains("provider"));
    }

    #[test]
    fn response_before_ledger_crash_can_be_reconciled_without_content() {
        let fixture = Fixture::new();
        let delivery_id = fixture.send(&request("crash", vec![Part::text("crash window")]));
        let coordinator = fixture.coordinator();
        let (claimed, _) = coordinator.claim(&delivery_id).expect("claim");
        coordinator.mark_running(&claimed).expect("mark running");

        let response = response_for(&claimed, "durable before ledger").expect("response");
        fixture
            .receiver
            .complete_claimed_request(&delivery_id, &response)
            .expect("transport completion");
        let response_summary = fixture
            .sender
            .list_deliveries()
            .expect("response summary")
            .pop()
            .expect("response delivery");
        fixture
            .sender
            .claim_delivery(&response_summary.delivery_id)
            .expect("claim response before reconciliation");
        fixture
            .sender
            .acknowledge_response(&response_summary.delivery_id)
            .expect("ack response before reconciliation");
        let still_running = TaskStore::for_workspace(&fixture.receiver_workspace)
            .load(&delivery_id)
            .expect("running task");
        assert_eq!(still_running.state, TaskState::Running);

        let reconciled =
            InboundCoordinator::new(fixture.receiver.clone(), &fixture.receiver_workspace)
                .reconcile_completed(&delivery_id)
                .expect("reconcile completion");
        assert_eq!(reconciled.state, TaskState::Completed);
        assert!(reconciled.response.is_some());
    }

    #[test]
    fn rejection_is_durable_and_responses_never_become_requests() {
        let fixture = Fixture::new();
        let delivery_id = fixture.send(&request("reject", vec![Part::text("reject this")]));
        let receiver_coordinator = fixture.coordinator();
        let (claimed, _) = receiver_coordinator.claim(&delivery_id).expect("claim");
        let rejected = receiver_coordinator.reject(&claimed).expect("reject");
        assert_eq!(rejected.state, TaskState::Rejected);
        let response_id = rejected.response.expect("rejection response").delivery_id;

        let summaries = fixture.sender.list_deliveries().expect("sender deliveries");
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].kind, DeliveryKind::Response);
        let sender_coordinator =
            InboundCoordinator::new(fixture.sender.clone(), &fixture.sender_workspace);
        assert!(sender_coordinator.claim(&response_id).is_err());
        let after = fixture
            .sender
            .list_deliveries()
            .expect("response remains pending");
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].delivery_id, response_id);
        assert_eq!(after[0].kind, DeliveryKind::Response);
    }

    #[test]
    fn projection_and_response_enforce_byte_bounds_at_utf8_boundaries() {
        let oversized = "🙂".repeat((MAX_UNTRUSTED_TEXT_BYTES / 4) + 4);
        let projection = project_text(&request("bounded", vec![Part::text(oversized)]))
            .expect("bounded projection");
        assert!(projection.is_truncated());
        assert!(projection.as_str().len() <= MAX_UNTRUSTED_TEXT_BYTES);
        assert!(
            projection
                .as_str()
                .is_char_boundary(projection.as_str().len())
        );

        let fixture = Fixture::new();
        let delivery_id = fixture.send(&request("response-bound", vec![Part::text("run")]));
        let coordinator = fixture.coordinator();
        let (claimed, _) = coordinator.claim(&delivery_id).expect("claim");
        coordinator.mark_running(&claimed).expect("running");
        assert!(
            coordinator
                .complete(&claimed, &"x".repeat(MAX_TEXT_BYTES + 1))
                .is_err()
        );
        coordinator
            .release_retryable(&claimed)
            .expect("release after rejected output");
    }
}
