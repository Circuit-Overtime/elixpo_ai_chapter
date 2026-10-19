//! Lazy process reuse and route-change isolation.

use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context, Result};
use crumb_agent::{AgentMode, CancellationToken};

use crate::{HarnessEnvironment, InitializeParams, ProcessHarness, RunResult, ServerInfo};

/// Non-secret identity of one initialized Harness process.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HarnessIdentity {
    pub program: PathBuf,
    pub arguments: Vec<String>,
    pub cwd: PathBuf,
    pub composition: PathBuf,
    pub mode: AgentMode,
    pub provider: String,
    pub model: String,
    pub reasoning_effort: Option<String>,
    pub max_tokens: Option<u64>,
    /// Caller-owned revision for credential or environment changes. It must not
    /// be derived from secret bytes.
    pub environment_revision: u64,
}

/// One launch request. Its environment is deliberately non-cloneable and
/// non-debuggable so credential values cannot enter diagnostics.
pub struct HarnessLaunch {
    pub identity: HarnessIdentity,
    pub environment: HarnessEnvironment,
}

/// Runtime bounds supplied by Crumb's live configuration.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SupervisorLimits {
    pub initialize_timeout: Duration,
    pub run_timeout: Duration,
    pub shutdown_timeout: Duration,
    pub event_budget_bytes: usize,
}

struct ActiveHarness {
    identity: HarnessIdentity,
    process: ProcessHarness,
    server: ServerInfo,
}

/// Reuses one compatible Harness process and replaces it when any route or
/// environment revision changes.
pub struct HarnessSupervisor {
    active: Option<ActiveHarness>,
    limits: SupervisorLimits,
}

impl HarnessSupervisor {
    #[must_use]
    pub const fn new(limits: SupervisorLimits) -> Self {
        Self {
            active: None,
            limits,
        }
    }

    /// Runs one complete session activity interval.
    ///
    /// The process starts only here, never during shell startup. Any failure
    /// evicts and reaps the process so callers can safely use a native fallback.
    ///
    /// # Errors
    ///
    /// Returns an error when launch, initialization, protocol exchange, model
    /// execution, or cancellation fails.
    pub fn run_text(
        &mut self,
        launch: HarnessLaunch,
        session_id: &str,
        text: &str,
        cancellation: &CancellationToken,
    ) -> Result<RunResult> {
        self.run_text_with_events(launch, session_id, text, cancellation, |_| Ok(()))
    }

    /// Runs one activity and forwards bounded protocol notifications to a
    /// caller-owned renderer or observer.
    ///
    /// # Errors
    ///
    /// Returns an error under the same conditions as [`Self::run_text`], or
    /// when the observer rejects a notification.
    pub fn run_text_with_events(
        &mut self,
        launch: HarnessLaunch,
        session_id: &str,
        text: &str,
        cancellation: &CancellationToken,
        on_notification: impl FnMut(&crate::Notification) -> Result<()>,
    ) -> Result<RunResult> {
        self.ensure_active(launch, cancellation)?;
        let result = self
            .active
            .as_mut()
            .context("Harness supervisor lost its active process")?
            .process
            .run_text_with_events(
                session_id,
                text,
                cancellation,
                self.limits.run_timeout,
                self.limits.event_budget_bytes,
                on_notification,
            );
        if result.is_err() {
            self.active.take();
        }
        result
    }

    #[must_use]
    pub fn server_info(&self) -> Option<&ServerInfo> {
        self.active.as_ref().map(|active| &active.server)
    }

    /// Gracefully stops the active process when one exists.
    ///
    /// # Errors
    ///
    /// Returns an error after the child has still been forcefully reaped.
    pub fn shutdown(&mut self) -> Result<()> {
        let Some(active) = self.active.take() else {
            return Ok(());
        };
        active.process.shutdown(self.limits.shutdown_timeout)
    }

    fn ensure_active(
        &mut self,
        launch: HarnessLaunch,
        cancellation: &CancellationToken,
    ) -> Result<()> {
        if self
            .active
            .as_ref()
            .is_some_and(|active| active.identity == launch.identity)
        {
            return Ok(());
        }
        if let Some(active) = self.active.take() {
            let _ = active.process.shutdown(self.limits.shutdown_timeout);
        }
        let identity = launch.identity;
        let mut process = ProcessHarness::spawn(
            &identity.program,
            &identity.arguments,
            &identity.cwd,
            &launch.environment,
        )?;
        let server = process.initialize(
            InitializeParams {
                cwd: &identity.cwd,
                provider: &identity.provider,
                model: &identity.model,
                reasoning_effort: identity.reasoning_effort.as_deref(),
                max_tokens: identity.max_tokens,
            },
            cancellation,
            self.limits.initialize_timeout,
        )?;
        self.active = Some(ActiveHarness {
            identity,
            process,
            server,
        });
        Ok(())
    }
}
