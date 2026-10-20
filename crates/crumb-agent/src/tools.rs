//! Provider-neutral tools, MCP transports, and output optimization contracts.

use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::error::Error;
use std::fmt;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

use crate::{AgentMode, ApprovalMode, CancellationToken, CredentialReference};

/// Deterministic risk assigned by Rust-owned tool metadata.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskClass {
    ReadOnly,
    WriteWorkspace,
    ProcessExecution,
    NetworkAccess,
    PeerCommunication,
    SystemMutation,
    CredentialSensitive,
    Destructive,
}

/// Transport used to reach an external MCP server.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum McpTransport {
    #[default]
    Stdio,
    StreamableHttp,
}

/// External MCP server configuration. Credentials are non-secret references;
/// their values are resolved only while the transport is being registered.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct McpServer {
    pub id: String,
    #[serde(default)]
    pub transport: McpTransport,
    #[serde(default)]
    pub command: PathBuf,
    #[serde(default)]
    pub arguments: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential: Option<CredentialReference>,
    #[serde(default)]
    pub enabled: bool,
}

/// Transport that owns execution for a tool.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ToolTransport {
    Native,
    Mcp { server_id: String },
}

/// Model-visible tool metadata with Rust-owned execution policy.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ToolDescriptor {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    pub risk: RiskClass,
    pub transport: ToolTransport,
}

/// Deterministic tool registry; registration order cannot affect lookup.
#[derive(Clone, Debug, Default)]
pub struct ToolRegistry {
    tools: BTreeMap<String, ToolDescriptor>,
}

/// Content returned to the model after policy-approved execution.
#[derive(Clone, Debug, PartialEq)]
pub struct ToolOutput {
    pub text: String,
    pub structured: Option<serde_json::Value>,
    pub is_error: bool,
}

impl ToolOutput {
    #[must_use]
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            structured: None,
            is_error: false,
        }
    }

    #[must_use]
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            text: message.into(),
            structured: None,
            is_error: true,
        }
    }
}

/// Converts a tool identifier into a stable, non-secret terminal activity label.
#[must_use]
pub fn tool_activity_label(name: &str) -> String {
    let normalized = name.to_ascii_lowercase();
    let action = if normalized.contains("write")
        || normalized.contains("edit")
        || normalized.contains("patch")
    {
        "Editing"
    } else if normalized.contains("search")
        || normalized.contains("find")
        || normalized.contains("query")
    {
        "Searching"
    } else if normalized.contains("read") || normalized.contains("list") {
        "Reading"
    } else if normalized.contains("run")
        || normalized.contains("shell")
        || normalized.contains("process")
        || normalized.contains("test")
    {
        "Running"
    } else if normalized.contains("web") || normalized.contains("fetch") {
        "Fetching"
    } else {
        "Inspecting"
    };
    format!("{action} · {name}")
}

/// Metadata shown to a trusted approval UI. Raw arguments are deliberately
/// replaced with a digest.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApprovalRequest {
    pub tool: String,
    pub risk: RiskClass,
    pub arguments_digest: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApprovalDecision {
    AllowOnce,
    Deny,
}

/// User-owned approval boundary. Model output cannot implement this trait.
pub trait ApprovalBroker: Send + Sync {
    fn decide(
        &self,
        request: &ApprovalRequest,
        arguments: &serde_json::Value,
        cancellation: &CancellationToken,
    ) -> ApprovalDecision;
}

/// Safe default used when no interactive approval channel exists.
#[derive(Clone, Copy, Debug, Default)]
pub struct DenyAllApprovals;

impl ApprovalBroker for DenyAllApprovals {
    fn decide(
        &self,
        _request: &ApprovalRequest,
        _arguments: &serde_json::Value,
        _cancellation: &CancellationToken,
    ) -> ApprovalDecision {
        ApprovalDecision::Deny
    }
}

/// Approval policy derived only from explicit user configuration.
#[derive(Clone, Debug, Default)]
pub struct ConfiguredApprovals {
    mode: ApprovalMode,
    network: BTreeSet<String>,
    workspace: BTreeSet<String>,
    processes: BTreeSet<String>,
    peers: BTreeSet<String>,
    mcp: BTreeSet<String>,
}

impl ConfiguredApprovals {
    #[must_use]
    pub fn new(network_tools: BTreeSet<String>) -> Self {
        Self {
            mode: ApprovalMode::AlwaysAsk,
            network: network_tools,
            workspace: BTreeSet::new(),
            processes: BTreeSet::new(),
            peers: BTreeSet::new(),
            mcp: BTreeSet::new(),
        }
    }

    #[must_use]
    pub const fn with_mode(mut self, mode: ApprovalMode) -> Self {
        self.mode = mode;
        self
    }

    #[must_use]
    pub fn with_workspace_tools(mut self, workspace_tools: BTreeSet<String>) -> Self {
        self.workspace = workspace_tools;
        self
    }

    #[must_use]
    pub fn with_process_tools(mut self, process_tools: BTreeSet<String>) -> Self {
        self.processes = process_tools;
        self
    }

    /// Adds exact peer-communication tool grants.
    ///
    /// Peer grants are intentionally independent from the global approval
    /// mode. In particular, full access alone never grants them.
    #[must_use]
    pub fn with_peer_tools(mut self, peer_tools: BTreeSet<String>) -> Self {
        self.peers = peer_tools;
        self
    }

    #[must_use]
    pub fn with_mcp_tools(mut self, mcp_tools: BTreeSet<String>) -> Self {
        self.mcp = mcp_tools;
        self
    }
}

impl ApprovalBroker for ConfiguredApprovals {
    fn decide(
        &self,
        request: &ApprovalRequest,
        arguments: &serde_json::Value,
        _cancellation: &CancellationToken,
    ) -> ApprovalDecision {
        if request.risk == RiskClass::PeerCommunication {
            return if self.peers.contains(&request.tool) {
                ApprovalDecision::AllowOnce
            } else {
                ApprovalDecision::Deny
            };
        }
        let explicitly_allowed = (request.tool.starts_with("mcp__")
            && self.mcp.contains(&request.tool))
            || (request.risk == RiskClass::NetworkAccess && self.network.contains(&request.tool))
            || (request.risk == RiskClass::WriteWorkspace
                && self.workspace.contains(&request.tool))
            || (request.risk == RiskClass::ProcessExecution
                && self.processes.contains(&request.tool));
        if explicitly_allowed {
            return ApprovalDecision::AllowOnce;
        }
        match self.mode {
            ApprovalMode::AlwaysAsk => ApprovalDecision::Deny,
            ApprovalMode::FullAccess => ApprovalDecision::AllowOnce,
            ApprovalMode::SensitiveOnly => {
                if sensitive_request(request, arguments) {
                    ApprovalDecision::Deny
                } else {
                    ApprovalDecision::AllowOnce
                }
            }
        }
    }
}

fn sensitive_request(request: &ApprovalRequest, arguments: &serde_json::Value) -> bool {
    match request.risk {
        RiskClass::ReadOnly | RiskClass::NetworkAccess | RiskClass::WriteWorkspace => false,
        RiskClass::ProcessExecution => match request.tool.as_str() {
            "run_shell" => arguments
                .get("command")
                .and_then(serde_json::Value::as_str)
                .is_none_or(sensitive_shell_command),
            "run_disposable" => arguments
                .get("script")
                .and_then(serde_json::Value::as_str)
                .is_none_or(sensitive_shell_command),
            _ => true,
        },
        RiskClass::PeerCommunication
        | RiskClass::SystemMutation
        | RiskClass::CredentialSensitive
        | RiskClass::Destructive => true,
    }
}

fn sensitive_shell_command(command: &str) -> bool {
    let command = format!(" {} ", command.to_ascii_lowercase());
    [
        " sudo ",
        " su ",
        " rm ",
        " rmdir ",
        " shred ",
        " chmod ",
        " chown ",
        " kill ",
        " pkill ",
        " killall ",
        " dd ",
        " mkfs",
        " mount ",
        " umount ",
        " passwd ",
        " useradd ",
        " userdel ",
        " systemctl ",
        " service ",
        " shutdown ",
        " reboot ",
        " poweroff ",
        " apt install",
        " apt remove",
        " apt purge",
        " dnf install",
        " yum install",
        " pacman -s",
        " brew install",
        " npm publish",
        " cargo publish",
        " git push",
        " git reset --hard",
        " git clean ",
        " curl ",
        " wget ",
        " .ssh/",
        " .aws/",
        " .config/gcloud",
        " /etc/",
        " /usr/",
        " /bin/",
        " /sbin/",
    ]
    .iter()
    .any(|marker| command.contains(marker))
}

/// Native implementation of one registered tool.
pub trait ToolHandler: Send + Sync {
    /// Normalizes arguments before approval, activity reporting, and execution.
    /// The default preserves the provider request exactly. Implementations may
    /// apply deterministic, non-mutating optimizations such as command proxy
    /// rewriting, but must safely fall back to the original arguments.
    ///
    /// # Errors
    ///
    /// Returns an error only when arguments cannot be prepared safely.
    fn prepare(
        &self,
        arguments: &serde_json::Value,
        _cancellation: &CancellationToken,
    ) -> Result<serde_json::Value> {
        Ok(arguments.clone())
    }

    /// Executes with already-authorized arguments.
    ///
    /// # Errors
    ///
    /// Returns only redacted internal failures. Expected command failures
    /// should use `ToolOutput::error` so the model can self-correct.
    fn call(
        &self,
        arguments: &serde_json::Value,
        cancellation: &CancellationToken,
    ) -> Result<ToolOutput>;

    /// Executes while optionally publishing bounded, non-secret activity labels.
    /// Implementations that do not expose intermediate work use the regular call.
    ///
    /// # Errors
    ///
    /// Returns only redacted internal failures, matching [`Self::call`].
    fn call_with_progress(
        &self,
        arguments: &serde_json::Value,
        cancellation: &CancellationToken,
        _progress: &mut dyn FnMut(&str),
    ) -> Result<ToolOutput> {
        self.call(arguments, cancellation)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ToolCallErrorKind {
    UnknownTool,
    Denied,
    Cancelled,
    Internal,
}

/// Redacted error safe to translate to an MCP response.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ToolCallError {
    pub kind: ToolCallErrorKind,
    message: String,
}

impl ToolCallError {
    fn new(kind: ToolCallErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl fmt::Display for ToolCallError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for ToolCallError {}

/// Registry plus Rust-owned policy and native implementations.
#[derive(Clone, Default)]
pub struct ToolHost {
    registry: ToolRegistry,
    handlers: BTreeMap<String, Arc<dyn ToolHandler>>,
}

impl ToolHost {
    /// Clones only passive read-only tools for isolated analysis workers.
    #[must_use]
    pub fn read_only(&self) -> Self {
        let mut host = Self::default();
        for descriptor in self
            .registry
            .iter()
            .filter(|descriptor| descriptor.risk == RiskClass::ReadOnly)
        {
            if let Some(handler) = self.handlers.get(&descriptor.name) {
                host.registry
                    .tools
                    .insert(descriptor.name.clone(), descriptor.clone());
                host.handlers
                    .insert(descriptor.name.clone(), Arc::clone(handler));
            }
        }
        host
    }

    /// Clones the minimal native read-only surface available to an isolated
    /// inbound peer turn.
    ///
    /// This is deliberately an allowlist instead of a risk-class filter:
    /// peer discovery, subagent coordination, and third-party transports can
    /// themselves be read-only while still crossing an isolation boundary.
    #[must_use]
    pub fn isolated_peer_read_only(&self) -> Self {
        // Accepting peer-authored text is not permission to inspect the local
        // workspace. File and directory reads need a separate receiver-owned
        // approval boundary, so the default peer surface is intentionally
        // limited to a context-free clock lookup.
        const ALLOWED: [&str; 1] = ["current_time"];

        let mut host = Self::default();
        for descriptor in self.registry.iter().filter(|descriptor| {
            descriptor.risk == RiskClass::ReadOnly
                && descriptor.transport == ToolTransport::Native
                && ALLOWED.contains(&descriptor.name.as_str())
        }) {
            if let Some(handler) = self.handlers.get(&descriptor.name) {
                host.registry
                    .tools
                    .insert(descriptor.name.clone(), descriptor.clone());
                host.handlers
                    .insert(descriptor.name.clone(), Arc::clone(handler));
            }
        }
        host
    }

    /// Registers metadata and its implementation atomically.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid or duplicate descriptor.
    pub fn register(
        &mut self,
        descriptor: ToolDescriptor,
        handler: Arc<dyn ToolHandler>,
    ) -> Result<()> {
        self.registry.register(descriptor.clone())?;
        self.handlers.insert(descriptor.name, handler);
        Ok(())
    }

    pub fn tools(&self) -> impl Iterator<Item = &ToolDescriptor> {
        self.registry.iter()
    }

    #[must_use]
    pub fn descriptor(&self, name: &str) -> Option<&ToolDescriptor> {
        self.registry.get(name)
    }

    /// Prepares one tool request using its registered implementation.
    ///
    /// # Errors
    ///
    /// Returns a typed error when the tool is unknown, cancelled, or argument
    /// preparation fails internally.
    pub fn prepare_arguments(
        &self,
        name: &str,
        arguments: &serde_json::Value,
        cancellation: &CancellationToken,
    ) -> std::result::Result<serde_json::Value, ToolCallError> {
        if cancellation.is_cancelled() {
            return Err(ToolCallError::new(
                ToolCallErrorKind::Cancelled,
                "tool call cancelled",
            ));
        }
        let handler = self
            .handlers
            .get(name)
            .ok_or_else(|| ToolCallError::new(ToolCallErrorKind::UnknownTool, "unknown tool"))?;
        handler
            .prepare(arguments, cancellation)
            .map_err(|_| ToolCallError::new(ToolCallErrorKind::Internal, "tool preparation failed"))
    }

    /// Authorizes and executes one tool call.
    ///
    /// # Errors
    ///
    /// Returns a typed, redacted error when the tool is unknown, denied,
    /// cancelled, or fails internally.
    pub fn call(
        &self,
        name: &str,
        arguments: &serde_json::Value,
        mode: AgentMode,
        approvals: &dyn ApprovalBroker,
        cancellation: &CancellationToken,
    ) -> std::result::Result<ToolOutput, ToolCallError> {
        self.call_with_progress(name, arguments, mode, approvals, cancellation, &mut |_| {})
    }

    /// Authorizes and executes one tool call while forwarding safe progress labels.
    ///
    /// # Errors
    ///
    /// Returns a typed, redacted error when the tool is unknown, denied,
    /// cancelled, or fails internally.
    pub fn call_with_progress(
        &self,
        name: &str,
        arguments: &serde_json::Value,
        mode: AgentMode,
        approvals: &dyn ApprovalBroker,
        cancellation: &CancellationToken,
        progress: &mut dyn FnMut(&str),
    ) -> std::result::Result<ToolOutput, ToolCallError> {
        let descriptor = self
            .registry
            .get(name)
            .ok_or_else(|| ToolCallError::new(ToolCallErrorKind::UnknownTool, "unknown tool"))?;
        if cancellation.is_cancelled() {
            return Err(ToolCallError::new(
                ToolCallErrorKind::Cancelled,
                "tool call cancelled",
            ));
        }
        authorize(descriptor, arguments, mode, approvals, cancellation)?;
        let handler = self.handlers.get(name).ok_or_else(|| {
            ToolCallError::new(
                ToolCallErrorKind::Internal,
                "tool implementation unavailable",
            )
        })?;
        let output = match handler.call_with_progress(arguments, cancellation, progress) {
            Ok(output) => output,
            Err(_) if cancellation.is_cancelled() => {
                return Err(ToolCallError::new(
                    ToolCallErrorKind::Cancelled,
                    "tool call cancelled",
                ));
            }
            Err(_) => {
                return Err(ToolCallError::new(
                    ToolCallErrorKind::Internal,
                    "tool execution failed",
                ));
            }
        };
        if cancellation.is_cancelled() {
            return Err(ToolCallError::new(
                ToolCallErrorKind::Cancelled,
                "tool call cancelled",
            ));
        }
        Ok(output)
    }
}

fn authorize(
    descriptor: &ToolDescriptor,
    arguments: &serde_json::Value,
    mode: AgentMode,
    approvals: &dyn ApprovalBroker,
    cancellation: &CancellationToken,
) -> std::result::Result<(), ToolCallError> {
    if matches!(mode, AgentMode::Plan) {
        return Err(ToolCallError::new(
            ToolCallErrorKind::Denied,
            "plan mode does not execute tools",
        ));
    }
    if matches!(mode, AgentMode::Auto) && matches!(descriptor.risk, RiskClass::ReadOnly) {
        return Ok(());
    }
    let encoded = serde_json::to_vec(arguments).map_err(|_| {
        ToolCallError::new(
            ToolCallErrorKind::Internal,
            "tool arguments could not be validated",
        )
    })?;
    let request = ApprovalRequest {
        tool: descriptor.name.clone(),
        risk: descriptor.risk,
        arguments_digest: crate::session::digest(&encoded),
    };
    let decision = approvals.decide(&request, arguments, cancellation);
    if cancellation.is_cancelled() {
        return Err(ToolCallError::new(
            ToolCallErrorKind::Cancelled,
            "tool call cancelled",
        ));
    }
    match decision {
        ApprovalDecision::AllowOnce => Ok(()),
        ApprovalDecision::Deny => Err(ToolCallError::new(
            ToolCallErrorKind::Denied,
            "tool call denied by policy",
        )),
    }
}

impl ToolRegistry {
    /// Registers one uniquely named tool.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty or duplicate name.
    pub fn register(&mut self, tool: ToolDescriptor) -> Result<()> {
        if tool.name.trim().is_empty() {
            bail!("tool names cannot be empty");
        }
        if self.tools.contains_key(&tool.name) {
            bail!("tool `{}` is already registered", tool.name);
        }
        self.tools.insert(tool.name.clone(), tool);
        Ok(())
    }

    #[must_use]
    pub fn get(&self, name: &str) -> Option<&ToolDescriptor> {
        self.tools.get(name)
    }

    pub fn iter(&self) -> impl Iterator<Item = &ToolDescriptor> {
        self.tools.values()
    }
}

/// Output category used by command-aware optimizers.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OutputKind {
    Generic,
    Cargo,
    GitDiff,
    PackageInstall,
    Test,
}

/// Token optimizer contract. Implementations must preserve critical errors and
/// return the original bytes when unavailable.
pub trait TokenOptimizer: Send + Sync {
    fn name(&self) -> &str;
    fn available(&self) -> bool;

    /// Compresses already-redacted output to a byte budget.
    ///
    /// # Errors
    ///
    /// Returns an error when an available optimizer fails. Callers must fall
    /// back to the original input instead of blocking agent execution.
    fn optimize(&self, kind: OutputKind, input: &[u8], budget: usize) -> Result<Vec<u8>>;
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::sync::Arc;

    use anyhow::Result;

    use crate::{AgentMode, ApprovalMode, CancellationToken};

    use super::{
        ApprovalBroker, ApprovalDecision, ApprovalRequest, ConfiguredApprovals, DenyAllApprovals,
        RiskClass, ToolCallErrorKind, ToolDescriptor, ToolHandler, ToolHost, ToolOutput,
        ToolRegistry, ToolTransport, tool_activity_label,
    };

    #[test]
    fn tool_activity_terms_are_stable_and_human_readable() {
        assert_eq!(tool_activity_label("read_file"), "Reading · read_file");
        assert_eq!(tool_activity_label("web_search"), "Searching · web_search");
        assert_eq!(tool_activity_label("write_file"), "Editing · write_file");
        assert_eq!(
            tool_activity_label("detect_stack"),
            "Inspecting · detect_stack"
        );
    }

    #[test]
    fn duplicate_tools_are_rejected_deterministically() {
        let mut registry = ToolRegistry::default();
        let tool = ToolDescriptor {
            name: "read_file".to_owned(),
            description: "Read a workspace file".to_owned(),
            input_schema: serde_json::json!({"type": "object"}),
            risk: RiskClass::ReadOnly,
            transport: ToolTransport::Native,
        };
        registry
            .register(tool.clone())
            .expect("first registration should pass");
        assert!(registry.register(tool).is_err());
    }

    #[test]
    fn auto_allows_read_only_tools_without_an_approval() {
        let mut host = ToolHost::default();
        host.register(descriptor(RiskClass::ReadOnly), Arc::new(FixtureHandler))
            .expect("registration succeeds");
        let output = host
            .call(
                "fixture",
                &serde_json::json!({}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
            )
            .expect("read-only auto call is allowed");
        assert_eq!(output.text, "called");
    }

    #[test]
    fn mutating_tools_require_user_owned_approval() {
        let mut host = ToolHost::default();
        host.register(
            descriptor(RiskClass::WriteWorkspace),
            Arc::new(FixtureHandler),
        )
        .expect("registration succeeds");
        let denied = host
            .call(
                "fixture",
                &serde_json::json!({"path":"file"}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
            )
            .expect_err("missing approval denies the call");
        assert_eq!(denied.kind, ToolCallErrorKind::Denied);

        let allowed = host.call(
            "fixture",
            &serde_json::json!({"path":"file"}),
            AgentMode::Auto,
            &AllowOnce,
            &CancellationToken::default(),
        );
        assert!(allowed.is_ok());
    }

    #[test]
    fn plan_mode_never_calls_tools() {
        let mut host = ToolHost::default();
        host.register(descriptor(RiskClass::ReadOnly), Arc::new(FixtureHandler))
            .expect("registration succeeds");
        let error = host
            .call(
                "fixture",
                &serde_json::json!({}),
                AgentMode::Plan,
                &AllowOnce,
                &CancellationToken::default(),
            )
            .expect_err("plan mode denies tools");
        assert_eq!(error.kind, ToolCallErrorKind::Denied);
    }

    #[test]
    fn configured_network_grant_is_exact_and_risk_scoped() {
        let approvals = ConfiguredApprovals::new(BTreeSet::from(["web_search".to_owned()]));
        let request = ApprovalRequest {
            tool: "web_search".to_owned(),
            risk: RiskClass::NetworkAccess,
            arguments_digest: "digest".to_owned(),
        };
        assert_eq!(
            approvals.decide(
                &request,
                &serde_json::json!({}),
                &CancellationToken::default()
            ),
            ApprovalDecision::AllowOnce
        );
        let write_request = ApprovalRequest {
            risk: RiskClass::WriteWorkspace,
            ..request
        };
        assert_eq!(
            approvals.decide(
                &write_request,
                &serde_json::json!({}),
                &CancellationToken::default()
            ),
            ApprovalDecision::Deny
        );
    }

    #[test]
    fn configured_workspace_grant_is_exact_and_risk_scoped() {
        let approvals = ConfiguredApprovals::new(BTreeSet::new())
            .with_workspace_tools(BTreeSet::from(["write_file".to_owned()]));
        let cancellation = CancellationToken::default();
        assert_eq!(
            approvals.decide(
                &ApprovalRequest {
                    tool: "write_file".to_owned(),
                    risk: RiskClass::WriteWorkspace,
                    arguments_digest: "digest".to_owned(),
                },
                &serde_json::json!({}),
                &cancellation,
            ),
            ApprovalDecision::AllowOnce
        );
        assert_eq!(
            approvals.decide(
                &ApprovalRequest {
                    tool: "write_file".to_owned(),
                    risk: RiskClass::NetworkAccess,
                    arguments_digest: "digest".to_owned(),
                },
                &serde_json::json!({}),
                &cancellation,
            ),
            ApprovalDecision::Deny
        );
    }

    #[test]
    fn supervised_process_grant_is_exact_and_risk_scoped() {
        let approvals = ConfiguredApprovals::new(BTreeSet::new())
            .with_process_tools(BTreeSet::from(["mcp__graphify__query".to_owned()]));
        let cancellation = CancellationToken::default();
        let request = ApprovalRequest {
            tool: "mcp__graphify__query".to_owned(),
            risk: RiskClass::ProcessExecution,
            arguments_digest: "digest".to_owned(),
        };
        assert_eq!(
            approvals.decide(&request, &serde_json::json!({}), &cancellation),
            ApprovalDecision::AllowOnce
        );
        assert_eq!(
            ConfiguredApprovals::default().decide(&request, &serde_json::json!({}), &cancellation),
            ApprovalDecision::Deny
        );
    }

    #[test]
    fn approval_modes_distinguish_safe_and_sensitive_shell_commands() {
        let request = ApprovalRequest {
            tool: "run_shell".to_owned(),
            risk: RiskClass::ProcessExecution,
            arguments_digest: "digest".to_owned(),
        };
        let cancellation = CancellationToken::default();
        let sensitive = ConfiguredApprovals::default().with_mode(ApprovalMode::SensitiveOnly);
        assert_eq!(
            sensitive.decide(
                &request,
                &serde_json::json!({"command":"cargo test --workspace"}),
                &cancellation,
            ),
            ApprovalDecision::AllowOnce
        );
        assert_eq!(
            sensitive.decide(
                &request,
                &serde_json::json!({"command":"sudo rm -rf /tmp/example"}),
                &cancellation,
            ),
            ApprovalDecision::Deny
        );
        assert_eq!(
            ConfiguredApprovals::default()
                .with_mode(ApprovalMode::FullAccess)
                .decide(
                    &request,
                    &serde_json::json!({"command":"sudo rm -rf /tmp/example"}),
                    &cancellation,
                ),
            ApprovalDecision::AllowOnce
        );
        assert_eq!(
            ConfiguredApprovals::default()
                .with_mode(ApprovalMode::AlwaysAsk)
                .decide(
                    &request,
                    &serde_json::json!({"command":"pwd"}),
                    &cancellation,
                ),
            ApprovalDecision::Deny
        );
    }

    #[test]
    fn peer_communication_requires_an_exact_peer_tool_grant() {
        let cancellation = CancellationToken::default();
        let request = ApprovalRequest {
            tool: "send_peer_message".to_owned(),
            risk: RiskClass::PeerCommunication,
            arguments_digest: "digest".to_owned(),
        };

        for mode in [
            ApprovalMode::AlwaysAsk,
            ApprovalMode::SensitiveOnly,
            ApprovalMode::FullAccess,
        ] {
            assert_eq!(
                ConfiguredApprovals::default().with_mode(mode).decide(
                    &request,
                    &serde_json::json!({"peer":"fixture"}),
                    &cancellation,
                ),
                ApprovalDecision::Deny,
                "{mode:?} must not implicitly grant peer communication"
            );
        }

        let granted = ConfiguredApprovals::default()
            .with_peer_tools(BTreeSet::from(["send_peer_message".to_owned()]));
        assert_eq!(
            granted.decide(
                &request,
                &serde_json::json!({"peer":"fixture"}),
                &cancellation,
            ),
            ApprovalDecision::AllowOnce
        );
        assert_eq!(
            granted.decide(
                &ApprovalRequest {
                    tool: "share_peer_file".to_owned(),
                    ..request.clone()
                },
                &serde_json::json!({"peer":"fixture"}),
                &cancellation,
            ),
            ApprovalDecision::Deny
        );
        assert_eq!(
            granted.decide(
                &ApprovalRequest {
                    risk: RiskClass::NetworkAccess,
                    ..request
                },
                &serde_json::json!({}),
                &cancellation,
            ),
            ApprovalDecision::Deny
        );
    }

    #[test]
    fn peer_tool_grant_executes_in_auto_and_negotiate_but_not_plan() {
        let mut host = ToolHost::default();
        host.register(
            descriptor(RiskClass::PeerCommunication),
            Arc::new(FixtureHandler),
        )
        .expect("registration succeeds");
        let approvals =
            ConfiguredApprovals::default().with_peer_tools(BTreeSet::from(["fixture".to_owned()]));
        let cancellation = CancellationToken::default();

        for mode in [AgentMode::Auto, AgentMode::Negotiate] {
            let output = host
                .call(
                    "fixture",
                    &serde_json::json!({"peer":"fixture"}),
                    mode,
                    &approvals,
                    &cancellation,
                )
                .expect("exact peer tool grant executes");
            assert_eq!(output.text, "called");
        }

        let denied = host
            .call(
                "fixture",
                &serde_json::json!({"peer":"fixture"}),
                AgentMode::Plan,
                &approvals,
                &cancellation,
            )
            .expect_err("plan mode remains non-executing");
        assert_eq!(denied.kind, ToolCallErrorKind::Denied);
    }

    #[test]
    fn peer_communication_never_auto_executes_without_a_grant() {
        let mut host = ToolHost::default();
        host.register(
            descriptor(RiskClass::PeerCommunication),
            Arc::new(FixtureHandler),
        )
        .expect("registration succeeds");

        let denied = host
            .call(
                "fixture",
                &serde_json::json!({"peer":"fixture"}),
                AgentMode::Auto,
                &ConfiguredApprovals::default().with_mode(ApprovalMode::FullAccess),
                &CancellationToken::default(),
            )
            .expect_err("full access alone cannot grant peer communication");
        assert_eq!(denied.kind, ToolCallErrorKind::Denied);
    }

    #[test]
    fn read_only_host_excludes_every_escalating_capability() {
        let mut host = ToolHost::default();
        for (name, risk) in [
            ("read", RiskClass::ReadOnly),
            ("write", RiskClass::WriteWorkspace),
            ("network", RiskClass::NetworkAccess),
            ("process", RiskClass::ProcessExecution),
            ("peer", RiskClass::PeerCommunication),
        ] {
            host.register(
                ToolDescriptor {
                    name: name.to_owned(),
                    description: "fixture".to_owned(),
                    input_schema: serde_json::json!({"type":"object"}),
                    risk,
                    transport: ToolTransport::Native,
                },
                Arc::new(FixtureHandler),
            )
            .expect("fixture registers");
        }

        let restricted = host.read_only();

        assert_eq!(
            restricted
                .tools()
                .map(|tool| tool.name.as_str())
                .collect::<Vec<_>>(),
            vec!["read"]
        );
    }

    fn descriptor(risk: RiskClass) -> ToolDescriptor {
        ToolDescriptor {
            name: "fixture".to_owned(),
            description: "Fixture tool".to_owned(),
            input_schema: serde_json::json!({"type":"object"}),
            risk,
            transport: ToolTransport::Native,
        }
    }

    struct FixtureHandler;

    impl ToolHandler for FixtureHandler {
        fn call(
            &self,
            _arguments: &serde_json::Value,
            _cancellation: &CancellationToken,
        ) -> Result<ToolOutput> {
            Ok(ToolOutput::text("called"))
        }
    }

    struct AllowOnce;

    impl ApprovalBroker for AllowOnce {
        fn decide(
            &self,
            _request: &ApprovalRequest,
            _arguments: &serde_json::Value,
            _cancellation: &CancellationToken,
        ) -> ApprovalDecision {
            ApprovalDecision::AllowOnce
        }
    }
}
