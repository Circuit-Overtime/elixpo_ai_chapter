//! Transient user-owned approval handoff for interactive frontends.

use std::num::NonZeroUsize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender, TrySendError, sync_channel};
use std::thread;
use std::time::Duration;

use serde_json::Value;

use crate::CancellationToken;
use crate::tools::{ApprovalBroker, ApprovalDecision, ApprovalRequest};

const CANCELLATION_POLL: Duration = Duration::from_millis(10);

/// Creates a bounded approval bridge between an execution thread and trusted UI.
#[must_use]
pub fn approval_channel(capacity: NonZeroUsize) -> (InteractiveApprovalBroker, ApprovalInbox) {
    let (sender, receiver) = sync_channel(capacity.get());
    (
        InteractiveApprovalBroker {
            sender,
            next_id: AtomicU64::new(1),
        },
        ApprovalInbox { receiver },
    )
}

/// Execution-side broker. It never creates an allow decision itself.
pub struct InteractiveApprovalBroker {
    sender: SyncSender<ApprovalEnvelope>,
    next_id: AtomicU64,
}

impl ApprovalBroker for InteractiveApprovalBroker {
    fn decide(
        &self,
        request: &ApprovalRequest,
        arguments: &Value,
        cancellation: &CancellationToken,
    ) -> ApprovalDecision {
        let (decision_sender, decision_receiver) = sync_channel(1);
        let mut envelope = ApprovalEnvelope {
            id: self.next_id.fetch_add(1, Ordering::Relaxed),
            request: request.clone(),
            arguments: arguments.clone(),
            responder: decision_sender,
        };
        loop {
            if cancellation.is_cancelled() {
                return ApprovalDecision::Deny;
            }
            match self.sender.try_send(envelope) {
                Ok(()) => break,
                Err(TrySendError::Full(returned)) => {
                    envelope = returned;
                    thread::sleep(CANCELLATION_POLL);
                }
                Err(TrySendError::Disconnected(_)) => return ApprovalDecision::Deny,
            }
        }
        loop {
            if cancellation.is_cancelled() {
                return ApprovalDecision::Deny;
            }
            match decision_receiver.recv_timeout(CANCELLATION_POLL) {
                Ok(decision) => return decision,
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return ApprovalDecision::Deny,
            }
        }
    }
}

struct ApprovalEnvelope {
    id: u64,
    request: ApprovalRequest,
    arguments: Value,
    responder: SyncSender<ApprovalDecision>,
}

/// Trusted UI side of the approval channel.
pub struct ApprovalInbox {
    receiver: Receiver<ApprovalEnvelope>,
}

impl ApprovalInbox {
    /// Waits for a pending approval without blocking indefinitely.
    ///
    /// # Errors
    ///
    /// Returns the standard timeout or disconnection state when no request is
    /// available.
    pub fn recv_timeout(&self, timeout: Duration) -> Result<PendingApproval, RecvTimeoutError> {
        self.receiver
            .recv_timeout(timeout)
            .map(PendingApproval::new)
    }
}

/// One transient approval request. Dropping it safely denies the operation.
pub struct PendingApproval {
    id: u64,
    request: ApprovalRequest,
    arguments: Value,
    responder: Option<SyncSender<ApprovalDecision>>,
}

impl PendingApproval {
    fn new(envelope: ApprovalEnvelope) -> Self {
        Self {
            id: envelope.id,
            request: envelope.request,
            arguments: envelope.arguments,
            responder: Some(envelope.responder),
        }
    }

    #[must_use]
    pub fn id(&self) -> u64 {
        self.id
    }

    #[must_use]
    pub fn request(&self) -> &ApprovalRequest {
        &self.request
    }

    /// Returns raw arguments only to the trusted UI holding this request.
    #[must_use]
    pub fn arguments(&self) -> &Value {
        &self.arguments
    }

    /// Grants this exact request once. Returns false if execution already ended.
    #[must_use]
    pub fn allow_once(mut self) -> bool {
        self.respond(ApprovalDecision::AllowOnce)
    }

    /// Denies this exact request. Returns false if execution already ended.
    #[must_use]
    pub fn deny(mut self) -> bool {
        self.respond(ApprovalDecision::Deny)
    }

    fn respond(&mut self, decision: ApprovalDecision) -> bool {
        self.responder
            .take()
            .is_some_and(|sender| sender.send(decision).is_ok())
    }
}

impl Drop for PendingApproval {
    fn drop(&mut self) {
        let _ = self.respond(ApprovalDecision::Deny);
    }
}

#[cfg(test)]
mod tests {
    use std::num::NonZeroUsize;
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    use anyhow::Result;
    use serde_json::json;

    use crate::{
        AgentMode, CancellationToken, RiskClass, ToolCallErrorKind, ToolDescriptor, ToolHandler,
        ToolHost, ToolOutput, ToolTransport,
    };

    use super::{InteractiveApprovalBroker, approval_channel};

    #[test]
    fn trusted_ui_can_allow_one_exact_request() {
        let (broker, inbox) = approval_channel(NonZeroUsize::MIN);
        let call = spawn_call(broker, CancellationToken::default());
        let pending = inbox
            .recv_timeout(Duration::from_secs(1))
            .expect("approval reaches the UI");
        assert_eq!(pending.id(), 1);
        assert_eq!(pending.request().tool, "fixture");
        assert_eq!(pending.arguments(), &json!({"path":"notes.txt"}));
        assert!(pending.allow_once());
        assert_eq!(
            call.join()
                .expect("call thread does not panic")
                .unwrap()
                .text,
            "called"
        );
    }

    #[test]
    fn dropping_a_pending_request_denies_it() {
        let (broker, inbox) = approval_channel(NonZeroUsize::MIN);
        let call = spawn_call(broker, CancellationToken::default());
        drop(
            inbox
                .recv_timeout(Duration::from_secs(1))
                .expect("approval reaches the UI"),
        );
        let error = call
            .join()
            .expect("call thread does not panic")
            .expect_err("dropped approval is denied");
        assert_eq!(error.kind, ToolCallErrorKind::Denied);
    }

    #[test]
    fn cancellation_resolves_a_waiting_approval() {
        let (broker, inbox) = approval_channel(NonZeroUsize::MIN);
        let cancellation = CancellationToken::default();
        let call = spawn_call(broker, cancellation.clone());
        let pending = inbox
            .recv_timeout(Duration::from_secs(1))
            .expect("approval reaches the UI");
        cancellation.cancel();
        let error = call
            .join()
            .expect("call thread does not panic")
            .expect_err("cancelled approval is rejected");
        assert_eq!(error.kind, ToolCallErrorKind::Cancelled);
        assert!(!pending.allow_once());
    }

    fn spawn_call(
        broker: InteractiveApprovalBroker,
        cancellation: CancellationToken,
    ) -> thread::JoinHandle<std::result::Result<ToolOutput, crate::ToolCallError>> {
        thread::spawn(move || {
            host().call(
                "fixture",
                &json!({"path":"notes.txt"}),
                AgentMode::Negotiate,
                &broker,
                &cancellation,
            )
        })
    }

    fn host() -> ToolHost {
        let mut host = ToolHost::default();
        host.register(
            ToolDescriptor {
                name: "fixture".to_owned(),
                description: "Fixture".to_owned(),
                input_schema: json!({"type":"object"}),
                risk: RiskClass::WriteWorkspace,
                transport: ToolTransport::Native,
            },
            Arc::new(Fixture),
        )
        .expect("fixture is registered");
        host
    }

    struct Fixture;

    impl ToolHandler for Fixture {
        fn call(
            &self,
            _arguments: &serde_json::Value,
            _cancellation: &CancellationToken,
        ) -> Result<ToolOutput> {
            Ok(ToolOutput::text("called"))
        }
    }
}
