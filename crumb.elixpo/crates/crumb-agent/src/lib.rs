//! Native, provider-neutral foundations for Crumb agent execution.
//!
//! This crate owns deterministic routing, live configuration, session events,
//! tool metadata, and token-optimization contracts. It performs no network
//! requests and is not part of native-shell startup.

pub mod approvals;
pub mod backend;
pub mod config;
pub mod harness;
pub mod jobs;
pub mod questions;
pub mod routing;
pub mod session;
pub mod steering;
pub mod tools;

pub use approvals::{ApprovalInbox, InteractiveApprovalBroker, PendingApproval, approval_channel};
pub use backend::{BackendDiscovery, CodingBackend};
pub use config::{
    AgentConfig, AgentLimits, AgentMode, ApprovalMode, CacheRetention, CompatibilityFlag,
    CredentialReference, HarnessConfig, LiveConfig, MistakePolicy, Modality, ModelPack, ModelRoute,
    OptimizerConfig, ProviderCompatibility, ProviderConfig, ProviderHeader, ProviderModel,
    ProviderProtocol, ProviderRetryPolicy, ProviderTransport, SkillConfig, StructuredEncoding,
    ToolPermissions,
};
pub use harness::{HarnessTurnRequest, ModelCapabilities};
pub use jobs::{
    JobDefinition, JobId, JobSchedule, JobState, JobStore, JobSummary, NewJob, ScheduledRun,
};
pub use questions::{
    PendingQuestion, QuestionAnswer, QuestionAsker, QuestionInbox, QuestionKind, QuestionOption,
    UserQuestion, question_channel, register_ask_user_tool,
};
pub use routing::{
    CommandCatalog, InputRoute, RouteDecision, RoutePolicy, RouteReason, UnknownInputPolicy,
};
pub use session::{
    AgentSession, CancellationToken, SessionAttachment, SessionEvent, SessionExport, SessionId,
    SessionJournal, SessionSummary, TurnStatus, attach_session_context, detach_session_context,
    export_session, list_sessions, search_sessions, session_attachments, session_summary,
    set_session_archived, set_session_label, trash_session,
};
pub use steering::{SteeringAction, SteeringQueue};
pub use tools::{
    ApprovalBroker, ApprovalDecision, ApprovalRequest, ConfiguredApprovals, DenyAllApprovals,
    McpServer, McpTransport, OutputKind, RiskClass, TokenOptimizer, ToolCallError,
    ToolCallErrorKind, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolRegistry,
    ToolTransport, tool_activity_label,
};
