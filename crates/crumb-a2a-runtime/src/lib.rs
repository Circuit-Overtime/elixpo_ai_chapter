//! Long-lived process lifecycle for Crumb's bounded local A2A transport.
//!
//! One runtime owns one process registration and one joined heartbeat worker.
//! Cloneable clients share that ownership. This crate performs no discovery
//! outside the caller-supplied bus root and workspace, makes no network calls,
//! and emits no logs. The trusted workspace path stays in process memory only.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow, bail};
use crumb_a2a::{Part, SendMessageRequest, SendMessageResponse, Validate, to_json};
use crumb_a2a_exchanges::{
    ExchangeDirection, ExchangeRecord, ExchangeStore, NewExchange, ResponseMetadata,
};
use crumb_a2a_local::{
    CompletedResponseReceipt, DeliverySummary, EnqueueReceipt, LocalBus, LocalBusOptions,
    PeerEntry, PendingDeliverySummary, ProcessMetadata, ReceivedMessage, Registration,
    StagedArtifact,
};
pub use crumb_a2a_local::{
    DeliveryKind, DiscardedArtifact, ImportedArtifact, QuarantinedArtifact, ReceivedDelivery,
};
use crumb_instance::{InstanceMetadata, InstanceStore};
use sha2::{Digest as _, Sha256};

/// Minimum lease duration that leaves useful scheduling room for a heartbeat.
pub const MIN_RUNTIME_LEASE_TTL: Duration = Duration::from_millis(30);

/// Runtime configuration shared with the bounded local transport.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RuntimeOptions {
    pub local_bus: LocalBusOptions,
}

impl RuntimeOptions {
    fn heartbeat_interval(self) -> Result<Duration> {
        let ttl = self.local_bus.lease_ttl;
        if ttl < MIN_RUNTIME_LEASE_TTL {
            bail!("A2A runtime lease TTL must be at least 30 milliseconds");
        }
        let interval = ttl / 3;
        if interval.is_zero() || interval >= ttl {
            bail!("A2A runtime heartbeat interval is unsafe");
        }
        Ok(interval)
    }
}

/// Observable lifecycle state. It never contains message or path data.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeState {
    Healthy,
    Degraded,
    Stopping,
    Stopped,
}

/// Bounded failure categories for runtime health reporting.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeIssue {
    HeartbeatFailed,
    WorkerSynchronizationFailed,
    WorkerPanicked,
    UnregisterFailed,
}

/// Snapshot of heartbeat and shutdown health without raw error strings.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeHealth {
    pub state: RuntimeState,
    pub last_success_at_ms: Option<u64>,
    pub consecutive_heartbeat_failures: u32,
    pub last_issue: Option<RuntimeIssue>,
}

impl RuntimeHealth {
    fn healthy(now_ms: u64) -> Self {
        Self {
            state: RuntimeState::Healthy,
            last_success_at_ms: Some(now_ms),
            consecutive_heartbeat_failures: 0,
            last_issue: None,
        }
    }
}

#[derive(Debug, Default)]
struct StopControl {
    requested: Mutex<bool>,
    changed: Condvar,
}

#[derive(Debug)]
struct RuntimeInner {
    bus: LocalBus,
    workspace: PathBuf,
    exchanges: ExchangeStore,
    registration: Arc<Mutex<Registration>>,
    health: Arc<Mutex<RuntimeHealth>>,
    stop: Arc<StopControl>,
    worker: Mutex<Option<JoinHandle<()>>>,
    shutdown_gate: Mutex<()>,
    shutdown_started: AtomicBool,
}

impl RuntimeInner {
    fn ensure_running(&self) -> Result<()> {
        if self.shutdown_started.load(Ordering::Acquire) {
            bail!("local A2A runtime is shutting down");
        }
        Ok(())
    }

    fn shutdown(&self) -> Result<()> {
        let _gate = lock_recover(&self.shutdown_gate);
        if self.shutdown_started.swap(true, Ordering::AcqRel) {
            return Ok(());
        }
        update_health(&self.health, |health| {
            health.state = RuntimeState::Stopping;
        });
        request_stop(&self.stop);

        let mut first_error = None;
        let worker = lock_recover(&self.worker).take();
        if worker.is_some_and(|worker| worker.join().is_err()) {
            update_health(&self.health, |health| {
                health.state = RuntimeState::Degraded;
                health.last_issue = Some(RuntimeIssue::WorkerPanicked);
            });
            first_error = Some(anyhow!("local A2A heartbeat worker panicked"));
        }

        let registration = lock_recover(&self.registration);
        let unregister_result = self.bus.unregister(&registration);
        if let Err(error) = unregister_result {
            update_health(&self.health, |health| {
                health.state = RuntimeState::Degraded;
                health.last_issue = Some(RuntimeIssue::UnregisterFailed);
            });
            if first_error.is_none() {
                first_error = Some(error.context("local A2A runtime could not unregister"));
            }
        }

        update_health(&self.health, |health| {
            health.state = RuntimeState::Stopped;
        });
        first_error.map_or(Ok(()), Err)
    }
}

impl Drop for RuntimeInner {
    fn drop(&mut self) {
        drop(self.shutdown());
    }
}

/// Cloneable handle to one registered local A2A process runtime.
#[derive(Clone, Debug)]
pub struct A2aRuntime {
    inner: Arc<RuntimeInner>,
}

impl A2aRuntime {
    /// Registers one process and starts its joined heartbeat worker.
    ///
    /// Both paths are supplied by the caller. The workspace must contain the
    /// exact persisted `InstanceMetadata` passed here; its absolute path is
    /// retained only in memory for explicit artifact staging.
    ///
    /// # Errors
    ///
    /// Returns an error when options, workspace identity, local bus storage,
    /// registration, or heartbeat thread creation fails.
    pub fn start(
        bus_root: &Path,
        workspace: &Path,
        instance: &InstanceMetadata,
        options: RuntimeOptions,
    ) -> Result<Self> {
        let heartbeat_interval = options.heartbeat_interval()?;
        validate_workspace_identity(workspace, instance)?;
        let bus = LocalBus::open(bus_root, options.local_bus)?;
        let process = ProcessMetadata::current()?;
        let registration = bus.register(instance, process)?;
        let registered_at = registration.entry().lease_updated_at_ms;
        let registration = Arc::new(Mutex::new(registration));
        let health = Arc::new(Mutex::new(RuntimeHealth::healthy(registered_at)));
        let stop = Arc::new(StopControl::default());

        let worker = spawn_heartbeat(
            bus.clone(),
            Arc::clone(&registration),
            Arc::clone(&health),
            Arc::clone(&stop),
            heartbeat_interval,
        );
        let worker = match worker {
            Ok(worker) => worker,
            Err(error) => {
                if let Ok(registration) = registration.lock() {
                    drop(bus.unregister(&registration));
                }
                return Err(error).context("local A2A heartbeat worker could not start");
            }
        };

        Ok(Self {
            inner: Arc::new(RuntimeInner {
                bus,
                exchanges: ExchangeStore::for_workspace(workspace),
                workspace: workspace.to_path_buf(),
                registration,
                health,
                stop,
                worker: Mutex::new(Some(worker)),
                shutdown_gate: Mutex::new(()),
                shutdown_started: AtomicBool::new(false),
            }),
        })
    }

    /// Returns this runtime's current public peer entry.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or if runtime synchronization is
    /// unavailable.
    pub fn own_peer(&self) -> Result<PeerEntry> {
        self.inner.ensure_running()?;
        Ok(lock(&self.inner.registration, "A2A runtime registration")?
            .entry()
            .clone())
    }

    /// Lists active peers excluding this runtime itself.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when bus discovery fails.
    pub fn list_peers(&self) -> Result<Vec<PeerEntry>> {
        self.inner.ensure_running()?;
        let own_id = self.own_peer()?.instance_id;
        Ok(self
            .inner
            .bus
            .list_peers()?
            .into_iter()
            .filter(|peer| peer.instance_id != own_id)
            .collect())
    }

    /// Enqueues one bounded request for an active peer.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when registration, request,
    /// recipient, or inbox storage validation fails.
    pub fn enqueue(
        &self,
        recipient_instance_id: &str,
        request: &SendMessageRequest,
    ) -> Result<EnqueueReceipt> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        let metadata = part_counts(&request.message.parts)
            .and_then(|counts| digest_json(request).map(|digest| (counts, digest)))
            .ok();
        let receipt = self
            .inner
            .bus
            .enqueue(&registration, recipient_instance_id, request)?;
        // The transport is authoritative. The redacted view is deliberately
        // best-effort so damaged optional metadata cannot disable A2A.
        if let Some(((part_count, artifact_count), request_digest)) = metadata {
            let _ = self.inner.exchanges.record(&NewExchange {
                delivery_id: receipt.delivery_id.clone(),
                direction: ExchangeDirection::Outbound,
                peer_instance_id: receipt.recipient_instance_id.clone(),
                request_digest,
                request_part_count: part_count,
                request_artifact_count: artifact_count,
            });
        }
        Ok(receipt)
    }

    /// Atomically claims this runtime's oldest pending message.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when registration or inbox
    /// storage validation fails.
    pub fn dequeue(&self) -> Result<Option<ReceivedMessage>> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner.bus.dequeue(&registration)
    }

    /// Lists this runtime's pending deliveries without exposing payload data.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when registration, queue
    /// bounds, or a pending envelope is invalid.
    pub fn list_pending(&self) -> Result<Vec<PendingDeliverySummary>> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner.bus.list_pending(&registration)
    }

    /// Lists all pending requests and responses without exposing payload data.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when inbox validation fails.
    pub fn list_deliveries(&self) -> Result<Vec<DeliverySummary>> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        let deliveries = self.inner.bus.list_deliveries(&registration)?;
        for delivery in &deliveries {
            let Some(original) = delivery.in_reply_to_delivery_id.as_deref() else {
                continue;
            };
            let Ok(received) = self
                .inner
                .bus
                .inspect_response_delivery(&registration, &delivery.delivery_id)
            else {
                continue;
            };
            let Ok(response) = response_metadata(&received) else {
                continue;
            };
            let _ = self
                .inner
                .exchanges
                .mark_response_available(original, response);
        }
        Ok(deliveries)
    }

    /// Reads one exact pending delivery without changing queue state.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or for invalid/unknown delivery
    /// identifiers, wrong ownership, or unsafe queue storage.
    pub fn inspect_pending(&self, delivery_id: &str) -> Result<ReceivedMessage> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner.bus.inspect_pending(&registration, delivery_id)
    }

    /// Reads one exact pending request or response without changing queue state.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when delivery validation fails.
    pub fn inspect_delivery(&self, delivery_id: &str) -> Result<ReceivedDelivery> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner.bus.inspect_delivery(&registration, delivery_id)
    }

    /// Verifies one exact pending file part into this workspace's quarantine.
    ///
    /// This read-only inbox operation neither claims nor acknowledges the
    /// delivery. The verified file remains unavailable to agent tools.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when delivery, artifact, or
    /// quarantine validation fails.
    pub fn quarantine_artifact(
        &self,
        delivery_id: &str,
        part_index: usize,
    ) -> Result<QuarantinedArtifact> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner.bus.quarantine_artifact(
            &registration,
            &self.inner.workspace,
            delivery_id,
            part_index,
        )
    }

    /// Imports one exact durable quarantine receipt into a new relative
    /// workspace destination. This never consults or changes inbox state.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when the receipt, quarantined
    /// bytes, or destination fails validation.
    pub fn import_quarantined_artifact(
        &self,
        delivery_id: &str,
        part_index: usize,
        relative_destination: &Path,
    ) -> Result<ImportedArtifact> {
        self.inner.ensure_running()?;
        crumb_a2a_local::import_quarantined_artifact(
            &self.inner.workspace,
            delivery_id,
            part_index,
            relative_destination,
        )
    }

    /// Discards one exact durable quarantine receipt and its verified bytes.
    /// This never consults or changes inbox state.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when the receipt or exact
    /// quarantined artifact fails validation or cannot be removed safely.
    pub fn discard_quarantined_artifact(
        &self,
        delivery_id: &str,
        part_index: usize,
    ) -> Result<DiscardedArtifact> {
        self.inner.ensure_running()?;
        crumb_a2a_local::discard_quarantined_artifact(
            &self.inner.workspace,
            delivery_id,
            part_index,
        )
    }

    /// Atomically claims one exact pending delivery by identifier.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or for invalid/unknown/already
    /// claimed identifiers, wrong ownership, or unsafe queue storage.
    pub fn claim_pending(&self, delivery_id: &str) -> Result<ReceivedMessage> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner.bus.claim_pending(&registration, delivery_id)
    }

    /// Atomically claims one exact pending request or response by identifier.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when the claim cannot be completed safely.
    pub fn claim_delivery(&self, delivery_id: &str) -> Result<ReceivedDelivery> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner.bus.claim_delivery(&registration, delivery_id)
    }

    /// Durably queues a correlated response before acknowledging a claimed request.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when completion cannot be committed safely.
    pub fn complete_claimed_request(
        &self,
        delivery_id: &str,
        response: &SendMessageResponse,
    ) -> Result<EnqueueReceipt> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner
            .bus
            .complete_claimed_request(&registration, delivery_id, response)
    }

    /// Rejects a claimed request with a protocol-level rejected task response.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when rejection cannot be committed safely.
    pub fn reject_claimed_request(&self, delivery_id: &str) -> Result<EnqueueReceipt> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner
            .bus
            .reject_claimed_request(&registration, delivery_id)
    }

    /// Returns content-free proof for a durably completed inbound request.
    ///
    /// This is intended for reconciling a response-before-ledger crash window;
    /// it does not expose response content or transport paths.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when acknowledgement/response
    /// storage is unsafe or inconsistent.
    pub fn completed_response_receipt(
        &self,
        delivery_id: &str,
    ) -> Result<Option<CompletedResponseReceipt>> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner
            .bus
            .completed_response_receipt(&registration, delivery_id)
    }

    /// Acknowledges a claimed response without routing it through the agent loop.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or for invalid response queue state.
    pub fn acknowledge_response(&self, delivery_id: &str) -> Result<()> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        let observation = self
            .inner
            .bus
            .inspect_response_delivery(&registration, delivery_id)
            .ok()
            .and_then(|response| {
                let original = response_correlation(&response).ok()?.to_owned();
                let metadata = response_metadata(&response).ok()?;
                Some((original, metadata))
            });
        self.inner
            .bus
            .acknowledge_response(&registration, delivery_id)?;
        if let Some((original, metadata)) = observation {
            let _ = self
                .inner
                .exchanges
                .mark_response_available(&original, metadata);
            let _ = self.inner.exchanges.mark_acknowledged(&original);
        }
        Ok(())
    }

    /// Claims or resumes one exact response and acknowledges it atomically
    /// with respect to other local queue operations.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or for invalid response queue state.
    pub fn consume_response(&self, delivery_id: &str) -> Result<String> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        let observation = self
            .inner
            .bus
            .inspect_response_delivery(&registration, delivery_id)
            .ok()
            .and_then(|response| {
                let original = response_correlation(&response).ok()?.to_owned();
                let metadata = response_metadata(&response).ok()?;
                Some((original, metadata))
            });
        let sender = self
            .inner
            .bus
            .consume_response(&registration, delivery_id)?;
        if let Some((original, metadata)) = observation {
            let _ = self
                .inner
                .exchanges
                .mark_response_available(&original, metadata);
            let _ = self.inner.exchanges.mark_acknowledged(&original);
        }
        Ok(sender)
    }

    /// Lists durable content-free exchanges for terminal inspection.
    ///
    /// # Errors
    ///
    /// Returns an error only when existing exchange metadata is unsafe or malformed.
    pub fn list_exchanges(&self) -> Result<Vec<ExchangeRecord>> {
        self.inner.ensure_running()?;
        self.inner.exchanges.list()
    }

    /// Loads one exact durable content-free exchange.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid/unknown identifier or unsafe metadata.
    pub fn exchange(&self, delivery_id: &str) -> Result<ExchangeRecord> {
        self.inner.ensure_running()?;
        self.inner.exchanges.load(delivery_id)
    }

    /// Acknowledges one claimed delivery.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when ownership or delivery
    /// validation fails.
    pub fn acknowledge(&self, delivery_id: &str) -> Result<()> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner.bus.acknowledge(&registration, delivery_id)
    }

    /// Releases one claimed delivery for retry.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when ownership or delivery
    /// validation fails.
    pub fn release(&self, delivery_id: &str) -> Result<()> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner.bus.release(&registration, delivery_id)
    }

    /// Stages a safe relative file from this runtime's trusted workspace.
    ///
    /// # Errors
    ///
    /// Returns an error after shutdown begins or when the relative source,
    /// registration, source file, or artifact storage is invalid.
    pub fn stage_artifact(&self, relative_source: &Path) -> Result<StagedArtifact> {
        self.inner.ensure_running()?;
        let registration = lock(&self.inner.registration, "A2A runtime registration")?.clone();
        self.inner
            .bus
            .stage_artifact(&registration, &self.inner.workspace, relative_source)
    }

    /// Returns a bounded, content-free runtime health snapshot.
    #[must_use]
    pub fn health(&self) -> RuntimeHealth {
        lock_recover(&self.inner.health).clone()
    }

    /// Stops and joins the heartbeat worker, then unregisters only this lease.
    ///
    /// This method is idempotent across cloned handles.
    ///
    /// # Errors
    ///
    /// Returns an error if the worker panicked or the owned lease could not be
    /// unregistered.
    pub fn shutdown(&self) -> Result<()> {
        self.inner.shutdown()
    }
}

fn digest_json(value: &(impl serde::Serialize + Validate)) -> Result<String> {
    let encoded = to_json(value).context("A2A exchange digest encoding failed")?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

fn part_counts(parts: &[Part]) -> Result<(u32, u32)> {
    let total = u32::try_from(parts.len()).context("A2A part count exceeds supported bounds")?;
    let artifacts = u32::try_from(parts.iter().filter(|part| part.url.is_some()).count())
        .context("A2A artifact count exceeds supported bounds")?;
    Ok((total, artifacts))
}

fn add_part_counts(total: &mut (u32, u32), parts: &[Part]) -> Result<()> {
    let current = part_counts(parts)?;
    total.0 = total
        .0
        .checked_add(current.0)
        .context("A2A response part count overflowed")?;
    total.1 = total
        .1
        .checked_add(current.1)
        .context("A2A response artifact count overflowed")?;
    Ok(())
}

fn response_correlation(delivery: &ReceivedDelivery) -> Result<&str> {
    match delivery {
        ReceivedDelivery::Response(response) => Ok(&response.in_reply_to_delivery_id),
        ReceivedDelivery::Request(_) => bail!("A2A delivery is not a correlated response"),
    }
}

fn response_metadata(delivery: &ReceivedDelivery) -> Result<ResponseMetadata> {
    let ReceivedDelivery::Response(received) = delivery else {
        bail!("A2A delivery is not a correlated response");
    };
    let mut counts = (0, 0);
    if let Some(message) = &received.response.message {
        add_part_counts(&mut counts, &message.parts)?;
    }
    if let Some(task) = &received.response.task {
        if let Some(message) = &task.status.message {
            add_part_counts(&mut counts, &message.parts)?;
        }
        for artifact in &task.artifacts {
            add_part_counts(&mut counts, &artifact.parts)?;
        }
        for message in &task.history {
            add_part_counts(&mut counts, &message.parts)?;
        }
    }
    Ok(ResponseMetadata {
        delivery_id: received.delivery_id.clone(),
        digest: digest_json(&received.response)?,
        part_count: Some(counts.0),
        artifact_count: Some(counts.1),
    })
}

fn validate_workspace_identity(workspace: &Path, expected: &InstanceMetadata) -> Result<()> {
    let metadata =
        std::fs::symlink_metadata(workspace).context("A2A runtime workspace is unavailable")?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
        bail!("A2A runtime workspace must be a directory, not a symlink");
    }
    let persisted = InstanceStore::for_workspace(workspace)
        .load()
        .context("A2A runtime workspace identity could not be loaded")?;
    if &persisted != expected {
        bail!("A2A runtime workspace identity does not match supplied metadata");
    }
    Ok(())
}

fn spawn_heartbeat(
    bus: LocalBus,
    registration: Arc<Mutex<Registration>>,
    health: Arc<Mutex<RuntimeHealth>>,
    stop: Arc<StopControl>,
    interval: Duration,
) -> std::io::Result<JoinHandle<()>> {
    thread::Builder::new()
        .name("crumb-a2a-heartbeat".to_owned())
        .spawn(move || heartbeat_loop(&bus, &registration, &health, &stop, interval))
}

fn heartbeat_loop(
    bus: &LocalBus,
    registration: &Mutex<Registration>,
    health: &Mutex<RuntimeHealth>,
    stop: &StopControl,
    interval: Duration,
) {
    loop {
        let requested = lock_recover(&stop.requested);
        let wait = stop.changed.wait_timeout(requested, interval);
        let (requested, _timeout) = match wait {
            Ok(result) => result,
            Err(poisoned) => {
                let (requested, timeout) = poisoned.into_inner();
                update_health_direct(health, |snapshot| {
                    snapshot.state = RuntimeState::Degraded;
                    snapshot.last_issue = Some(RuntimeIssue::WorkerSynchronizationFailed);
                });
                (requested, timeout)
            }
        };
        if *requested {
            break;
        }
        drop(requested);

        let result = {
            let mut registration = lock_recover(registration);
            bus.heartbeat(&mut registration)
        };
        match result {
            Ok(()) => {
                let observed_at = now_ms().ok();
                update_health_direct(health, |snapshot| {
                    snapshot.state = RuntimeState::Healthy;
                    if observed_at.is_some() {
                        snapshot.last_success_at_ms = observed_at;
                    }
                    snapshot.consecutive_heartbeat_failures = 0;
                    snapshot.last_issue = None;
                });
            }
            Err(_) => {
                update_health_direct(health, |snapshot| {
                    snapshot.state = RuntimeState::Degraded;
                    snapshot.consecutive_heartbeat_failures =
                        snapshot.consecutive_heartbeat_failures.saturating_add(1);
                    snapshot.last_issue = Some(RuntimeIssue::HeartbeatFailed);
                });
            }
        }
    }
}

fn request_stop(stop: &StopControl) {
    *lock_recover(&stop.requested) = true;
    stop.changed.notify_all();
}

fn update_health(health: &Arc<Mutex<RuntimeHealth>>, update: impl FnOnce(&mut RuntimeHealth)) {
    update_health_direct(health, update);
}

fn update_health_direct(health: &Mutex<RuntimeHealth>, update: impl FnOnce(&mut RuntimeHealth)) {
    update(&mut lock_recover(health));
}

fn lock<'a, T>(mutex: &'a Mutex<T>, label: &str) -> Result<MutexGuard<'a, T>> {
    mutex
        .lock()
        .map_err(|_| anyhow!("{label} synchronization failed"))
}

fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn now_ms() -> Result<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system clock is before the Unix epoch")?
        .as_millis();
    u64::try_from(millis).context("system timestamp exceeds the supported range")
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::thread;
    use std::time::{Duration, Instant};

    use crumb_a2a::{Message, Part, Role};
    use crumb_instance::InstanceStore;
    use tempfile::TempDir;

    use super::*;

    fn request(id: &str, text: &str) -> SendMessageRequest {
        SendMessageRequest {
            tenant: None,
            message: Message {
                message_id: id.to_owned(),
                context_id: Some("ctx-runtime".to_owned()),
                task_id: None,
                role: Role::User,
                parts: vec![Part::text(text)],
                metadata: None,
                extensions: Vec::new(),
                reference_task_ids: Vec::new(),
            },
            configuration: None,
            metadata: None,
        }
    }

    fn options() -> RuntimeOptions {
        RuntimeOptions {
            local_bus: LocalBusOptions {
                // Filesystem-backed peer operations can take noticeably longer
                // on loaded Windows runners. Keep ordinary lifecycle tests well
                // clear of the stale-lease boundary.
                lease_ttl: Duration::from_secs(5),
            },
        }
    }

    fn heartbeat_options() -> RuntimeOptions {
        RuntimeOptions {
            local_bus: LocalBusOptions {
                lease_ttl: Duration::from_millis(300),
            },
        }
    }

    fn workspace(root: &Path, name: &str) -> (PathBuf, InstanceMetadata) {
        let workspace = root.join(name);
        fs::create_dir(&workspace).expect("workspace");
        let instance = InstanceStore::for_workspace(&workspace)
            .load_or_create_named(name)
            .expect("instance metadata");
        (workspace, instance)
    }

    fn wait_until(timeout: Duration, predicate: impl Fn() -> bool) {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if predicate() {
                return;
            }
            thread::sleep(Duration::from_millis(5));
        }
        assert!(predicate(), "condition was not met before timeout");
    }

    #[test]
    fn distinct_runtimes_discover_exchange_and_use_clones() {
        let temporary = TempDir::new().expect("temporary root");
        let bus = temporary.path().join("bus");
        let (first_workspace, first_instance) = workspace(temporary.path(), "Builder One");
        let (second_workspace, second_instance) = workspace(temporary.path(), "Builder Two");
        let first = A2aRuntime::start(&bus, &first_workspace, &first_instance, options())
            .expect("first runtime");
        let second = A2aRuntime::start(&bus, &second_workspace, &second_instance, options())
            .expect("second runtime");

        assert_eq!(first.list_peers().expect("first peers").len(), 1);
        assert_eq!(second.list_peers().expect("second peers").len(), 1);
        let first_clone = first.clone();
        let receipt = first_clone
            .enqueue(
                &second_instance.instance_id,
                &request("msg-1", "hello peer"),
            )
            .expect("enqueue from clone");
        let exchange = first.exchange(&receipt.delivery_id).expect("exchange view");
        assert_eq!(
            exchange.state,
            crumb_a2a_exchanges::ExchangeState::OutboundSent
        );
        assert_eq!(exchange.peer_instance_id, second_instance.instance_id);
        assert_eq!(exchange.request_part_count, 1);
        let pending = second.list_pending().expect("pending summaries");
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].delivery_id, receipt.delivery_id);
        assert_eq!(pending[0].part_count, 1);
        let received = second
            .claim_pending(&receipt.delivery_id)
            .expect("claim exact message");
        assert_eq!(received.sender_instance_id, first_instance.instance_id);
        second
            .acknowledge(&received.delivery_id)
            .expect("acknowledge");
        assert_eq!(first.own_peer().expect("own peer").name, "Builder One");

        first.shutdown().expect("first shutdown");
        second.shutdown().expect("second shutdown");
    }

    #[test]
    fn correlated_response_lifecycle_is_visible_and_acknowledged() {
        let temporary = TempDir::new().expect("temporary root");
        let bus = temporary.path().join("bus");
        let (first_workspace, first_instance) = workspace(temporary.path(), "Sender");
        let (second_workspace, second_instance) = workspace(temporary.path(), "Receiver");
        let first = A2aRuntime::start(&bus, &first_workspace, &first_instance, options())
            .expect("first runtime");
        let second = A2aRuntime::start(&bus, &second_workspace, &second_instance, options())
            .expect("second runtime");
        let sent = first
            .enqueue(&second_instance.instance_id, &request("message-1", "work"))
            .expect("request");
        second
            .claim_pending(&sent.delivery_id)
            .expect("claim request");
        let response = SendMessageResponse {
            task: None,
            message: Some(Message {
                message_id: "message-response".to_owned(),
                context_id: Some("ctx-runtime".to_owned()),
                task_id: None,
                role: Role::Agent,
                parts: vec![Part::text("done")],
                metadata: None,
                extensions: Vec::new(),
                reference_task_ids: Vec::new(),
            }),
        };
        let response_receipt = second
            .complete_claimed_request(&sent.delivery_id, &response)
            .expect("complete request");

        first.list_deliveries().expect("observe response");
        assert_eq!(
            first.exchange(&sent.delivery_id).expect("available").state,
            crumb_a2a_exchanges::ExchangeState::OutboundResponseAvailable
        );
        first
            .consume_response(&response_receipt.delivery_id)
            .expect("acknowledge response");
        assert_eq!(
            first
                .exchange(&sent.delivery_id)
                .expect("acknowledged")
                .state,
            crumb_a2a_exchanges::ExchangeState::OutboundAcknowledged
        );
        first.shutdown().expect("first shutdown");
        second.shutdown().expect("second shutdown");
    }

    #[cfg(unix)]
    #[test]
    fn unsafe_optional_exchange_metadata_does_not_block_transport() {
        let temporary = TempDir::new().expect("temporary root");
        let bus = temporary.path().join("bus");
        let (first_workspace, first_instance) = workspace(temporary.path(), "Sender");
        let (second_workspace, second_instance) = workspace(temporary.path(), "Receiver");
        let first = A2aRuntime::start(&bus, &first_workspace, &first_instance, options())
            .expect("first runtime");
        let second = A2aRuntime::start(&bus, &second_workspace, &second_instance, options())
            .expect("second runtime");
        fs::create_dir(first_workspace.join(".crumb/a2a")).expect("a2a metadata");
        std::os::unix::fs::symlink(
            temporary.path(),
            first_workspace.join(".crumb/a2a/exchanges"),
        )
        .expect("unsafe exchange root");

        let receipt = first
            .enqueue(&second_instance.instance_id, &request("message-1", "work"))
            .expect("transport remains usable");
        assert_eq!(
            second
                .list_pending()
                .expect("pending")
                .first()
                .map(|delivery| delivery.delivery_id.as_str()),
            Some(receipt.delivery_id.as_str())
        );
        assert!(first.exchange(&receipt.delivery_id).is_err());
        first.shutdown().expect("first shutdown");
        second.shutdown().expect("second shutdown");
    }

    #[test]
    fn heartbeat_keeps_runtime_live_past_multiple_leases() {
        let temporary = TempDir::new().expect("temporary root");
        let bus = temporary.path().join("bus");
        let (first_workspace, first_instance) = workspace(temporary.path(), "Heartbeat One");
        let (second_workspace, second_instance) = workspace(temporary.path(), "Heartbeat Two");
        let first = A2aRuntime::start(&bus, &first_workspace, &first_instance, heartbeat_options())
            .expect("first runtime");
        let second = A2aRuntime::start(
            &bus,
            &second_workspace,
            &second_instance,
            heartbeat_options(),
        )
        .expect("second runtime");

        thread::sleep(Duration::from_millis(800));
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            if second.list_peers().expect("live peers").len() == 1 {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "heartbeat did not refresh the peer lease before the deadline"
            );
            thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(first.health().state, RuntimeState::Healthy);
        first.shutdown().expect("first shutdown");
        second.shutdown().expect("second shutdown");
    }

    #[test]
    fn shutdown_joins_worker_and_removes_only_owned_lease() {
        let temporary = TempDir::new().expect("temporary root");
        let bus = temporary.path().join("bus");
        let (first_workspace, first_instance) = workspace(temporary.path(), "Shutdown One");
        let (second_workspace, second_instance) = workspace(temporary.path(), "Shutdown Two");
        let first = A2aRuntime::start(&bus, &first_workspace, &first_instance, options())
            .expect("first runtime");
        let second = A2aRuntime::start(&bus, &second_workspace, &second_instance, options())
            .expect("second runtime");

        first.shutdown().expect("first shutdown");
        assert_eq!(first.health().state, RuntimeState::Stopped);
        assert!(first.list_peers().is_err());
        assert_eq!(second.list_peers().expect("remaining peers"), Vec::new());
        second.shutdown().expect("second shutdown");
    }

    #[test]
    fn final_clone_drop_joins_and_unregisters() {
        let temporary = TempDir::new().expect("temporary root");
        let bus = temporary.path().join("bus");
        let (first_workspace, first_instance) = workspace(temporary.path(), "Drop One");
        let (second_workspace, second_instance) = workspace(temporary.path(), "Drop Two");
        let first = A2aRuntime::start(&bus, &first_workspace, &first_instance, options())
            .expect("first runtime");
        let final_clone = first.clone();
        let second = A2aRuntime::start(&bus, &second_workspace, &second_instance, options())
            .expect("second runtime");

        drop(first);
        assert_eq!(second.list_peers().expect("peer retained").len(), 1);
        drop(final_clone);
        assert_eq!(second.list_peers().expect("peer removed"), Vec::new());
        second.shutdown().expect("second shutdown");
    }

    #[test]
    fn health_reports_forced_bus_failure_without_error_text() {
        let temporary = TempDir::new().expect("temporary root");
        let bus = temporary.path().join("bus");
        let (workspace, instance) = workspace(temporary.path(), "Health Runtime");
        let runtime =
            A2aRuntime::start(&bus, &workspace, &instance, heartbeat_options()).expect("runtime");
        let registry = bus.join("registry");
        let unavailable = bus.join("registry-unavailable");
        fs::rename(&registry, &unavailable).expect("force registry failure");

        wait_until(Duration::from_secs(1), || {
            runtime.health().last_issue == Some(RuntimeIssue::HeartbeatFailed)
        });
        let health = runtime.health();
        assert_eq!(health.state, RuntimeState::Degraded);
        assert!(health.consecutive_heartbeat_failures > 0);

        fs::rename(&unavailable, &registry).expect("restore registry");
        runtime.shutdown().expect("shutdown");
    }

    #[test]
    fn artifact_staging_delegates_with_memory_only_workspace() {
        let temporary = TempDir::new().expect("temporary root");
        let bus = temporary.path().join("bus");
        let (workspace, instance) = workspace(temporary.path(), "Artifact Runtime");
        fs::write(workspace.join("result.txt"), b"runtime artifact\n").expect("artifact source");
        let runtime = A2aRuntime::start(&bus, &workspace, &instance, options()).expect("runtime");

        let artifact = runtime
            .stage_artifact(Path::new("result.txt"))
            .expect("stage artifact");
        assert!(artifact.relative_url.starts_with("artifacts/crumb_"));
        assert_eq!(artifact.size_bytes, 17);
        let registry = fs::read_to_string(
            bus.join("registry")
                .join(format!("{}.json", instance.instance_id)),
        )
        .expect("registry entry");
        assert!(!registry.contains(workspace.to_string_lossy().as_ref()));
        assert!(runtime.stage_artifact(Path::new("../result.txt")).is_err());
        runtime.shutdown().expect("shutdown");
    }

    #[test]
    fn quarantine_receipt_imports_after_runtime_restart_and_delivery_ack() {
        let temporary = TempDir::new().expect("temporary root");
        let bus = temporary.path().join("bus");
        let (sender_workspace, sender_instance) = workspace(temporary.path(), "Receipt Sender");
        let (receiver_workspace, receiver_instance) =
            workspace(temporary.path(), "Receipt Receiver");
        fs::create_dir(receiver_workspace.join("imports")).expect("import parent");
        fs::write(
            sender_workspace.join("result.txt"),
            b"restart-safe artifact\n",
        )
        .expect("artifact source");
        let sender = A2aRuntime::start(&bus, &sender_workspace, &sender_instance, options())
            .expect("sender runtime");
        let receiver = A2aRuntime::start(&bus, &receiver_workspace, &receiver_instance, options())
            .expect("receiver runtime");
        let staged = sender
            .stage_artifact(Path::new("result.txt"))
            .expect("stage artifact");
        let mut file = Part::file(staged.relative_url, staged.filename, "text/plain");
        file.metadata = Some(serde_json::json!({
            "sha256": staged.sha256,
            "sizeBytes": staged.size_bytes,
        }));
        let mut outbound = request("message-restart-receipt", "artifact follows");
        outbound.message.parts.push(file);
        let delivery = sender
            .enqueue(&receiver_instance.instance_id, &outbound)
            .expect("enqueue artifact");
        receiver
            .quarantine_artifact(&delivery.delivery_id, 2)
            .expect("fetch artifact");
        let claimed = receiver
            .claim_pending(&delivery.delivery_id)
            .expect("claim delivery");
        receiver
            .acknowledge(&claimed.delivery_id)
            .expect("ack delivery");
        receiver.shutdown().expect("receiver shutdown");

        let restarted = A2aRuntime::start(&bus, &receiver_workspace, &receiver_instance, options())
            .expect("receiver restart");
        let imported = restarted
            .import_quarantined_artifact(&delivery.delivery_id, 2, Path::new("imports/result.txt"))
            .expect("import after restart");
        assert_eq!(imported.size_bytes, 22);
        assert_eq!(
            fs::read(receiver_workspace.join(imported.relative_destination))
                .expect("imported bytes"),
            b"restart-safe artifact\n"
        );
        assert_eq!(restarted.list_pending().expect("pending"), vec![]);
        restarted.shutdown().expect("restarted shutdown");
        sender.shutdown().expect("sender shutdown");
    }
}
