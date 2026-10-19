//! Optional `DeepSeek` Harness subprocess integration.
//!
//! This crate is outside Crumb's startup-critical and native-shell paths.

pub mod process;
pub mod protocol;
pub mod supervisor;

pub use process::{HarnessEnvironment, ProcessHarness, PromptReceipt, RunResult, ServerInfo};
pub use protocol::{
    HarnessActivity, IncomingFrame, InitializeParams, JsonRpcError, Notification, Response,
    SessionPromptParams, encode_initialize, encode_session_prompt, encode_shutdown,
};
pub use supervisor::{HarnessIdentity, HarnessLaunch, HarnessSupervisor, SupervisorLimits};
