//! Bounded, outbound-only tools for Crumb's local A2A runtime.

use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result, bail};
use crumb_a2a::{MAX_TEXT_BYTES, Message, Part, Role, SendMessageRequest, Validate};
use crumb_a2a_runtime::A2aRuntime;
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use serde::Deserialize;
use serde_json::{Value, json};

pub const LIST_PEER_AGENTS_TOOL: &str = "list_peer_agents";
pub const SEND_PEER_MESSAGE_TOOL: &str = "send_peer_message";
pub const SHARE_PEER_FILE_TOOL: &str = "share_peer_file";

const MAX_PEER_SELECTOR_BYTES: usize = 256;
const MAX_CONTEXT_ID_BYTES: usize = 256;
const MAX_MEDIA_TYPE_BYTES: usize = 128;

/// Registers the outbound local A2A tools backed by one long-lived runtime.
///
/// No inbound receive or artifact-import tool is registered. Receiving and
/// importing remain harness-owned operations with separate policy boundaries.
///
/// # Errors
///
/// Returns an error if any tool name is already registered.
pub fn register_a2a_tools(host: &mut ToolHost, runtime: A2aRuntime) -> Result<()> {
    host.register(
        list_descriptor(),
        Arc::new(ListPeerAgentsTool::new(runtime.clone())),
    )?;
    host.register(
        send_descriptor(),
        Arc::new(SendPeerMessageTool::new(runtime.clone())),
    )?;
    host.register(
        share_descriptor(),
        Arc::new(SharePeerFileTool::new(runtime)),
    )
}

/// Read-only active-peer discovery with process and endpoint metadata removed.
pub struct ListPeerAgentsTool {
    runtime: A2aRuntime,
}

impl ListPeerAgentsTool {
    #[must_use]
    pub const fn new(runtime: A2aRuntime) -> Self {
        Self { runtime }
    }
}

impl ToolHandler for ListPeerAgentsTool {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        Ok(
            match list_peer_agents(&self.runtime, arguments, cancellation) {
                Ok(output) => output,
                Err(error) => ToolOutput::error(error.to_string()),
            },
        )
    }
}

/// Permission-gated, outbound-only peer message sender.
pub struct SendPeerMessageTool {
    runtime: A2aRuntime,
}

impl SendPeerMessageTool {
    #[must_use]
    pub const fn new(runtime: A2aRuntime) -> Self {
        Self { runtime }
    }
}

impl ToolHandler for SendPeerMessageTool {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        Ok(
            match send_peer_message(&self.runtime, arguments, cancellation) {
                Ok(output) => output,
                Err(error) => ToolOutput::error(error.to_string()),
            },
        )
    }
}

/// Permission-gated sender that stages one file and sends only its A2A URL.
pub struct SharePeerFileTool {
    runtime: A2aRuntime,
}

impl SharePeerFileTool {
    #[must_use]
    pub const fn new(runtime: A2aRuntime) -> Self {
        Self { runtime }
    }
}

impl ToolHandler for SharePeerFileTool {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        Ok(
            match share_peer_file(&self.runtime, arguments, cancellation) {
                Ok(output) => output,
                Err(error) => ToolOutput::error(error.to_string()),
            },
        )
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArguments {}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SendArguments {
    peer: String,
    message: String,
    #[serde(default)]
    context_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ShareArguments {
    peer: String,
    path: String,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    context_id: Option<String>,
    #[serde(default)]
    media_type: Option<String>,
}

fn list_peer_agents(
    runtime: &A2aRuntime,
    arguments: &Value,
    cancellation: &CancellationToken,
) -> Result<ToolOutput> {
    ensure_active(cancellation)?;
    let _: NoArguments = parse_arguments(arguments)?;
    let peers = runtime.list_peers()?;
    ensure_active(cancellation)?;
    let public_peers: Vec<_> = peers
        .into_iter()
        .map(|peer| {
            json!({
                "instance_id": peer.instance_id,
                "name": peer.name,
                "protocol_version": peer.protocol_version,
            })
        })
        .collect();
    let count = public_peers.len();
    Ok(ToolOutput {
        text: if count == 0 {
            "No other active Crumb agents were found.".to_owned()
        } else {
            format!("Found {count} active Crumb peer agent(s).")
        },
        structured: Some(json!({"peers": public_peers})),
        is_error: false,
    })
}

fn send_peer_message(
    runtime: &A2aRuntime,
    arguments: &Value,
    cancellation: &CancellationToken,
) -> Result<ToolOutput> {
    ensure_active(cancellation)?;
    let arguments: SendArguments = parse_arguments(arguments)?;
    validate_selector(&arguments.peer)?;
    validate_message(&arguments.message)?;
    validate_context_id(arguments.context_id.as_deref())?;
    let peer = resolve_peer(runtime, &arguments.peer)?;
    let request = message_request(arguments.context_id, vec![Part::text(arguments.message)])?;
    ensure_active(cancellation)?;
    let receipt = runtime.enqueue(&peer.instance_id, &request)?;
    Ok(ToolOutput {
        text: format!("Message queued for peer agent {}.", peer.name),
        structured: Some(json!({
            "delivery_id": receipt.delivery_id,
            "recipient_instance_id": receipt.recipient_instance_id,
            "recipient_name": peer.name,
        })),
        is_error: false,
    })
}

fn share_peer_file(
    runtime: &A2aRuntime,
    arguments: &Value,
    cancellation: &CancellationToken,
) -> Result<ToolOutput> {
    ensure_active(cancellation)?;
    let arguments: ShareArguments = parse_arguments(arguments)?;
    validate_selector(&arguments.peer)?;
    validate_context_id(arguments.context_id.as_deref())?;
    if let Some(message) = arguments.message.as_deref() {
        validate_message(message)?;
    }
    let media_type = arguments
        .media_type
        .as_deref()
        .unwrap_or("application/octet-stream");
    validate_media_type(media_type)?;
    let peer = resolve_peer(runtime, &arguments.peer)?;
    validate_relative_tool_path(&arguments.path)?;
    ensure_active(cancellation)?;
    let artifact = runtime.stage_artifact(Path::new(&arguments.path))?;
    ensure_active(cancellation)?;

    let mut file = Part::file(
        artifact.relative_url.clone(),
        artifact.filename.clone(),
        media_type,
    );
    file.metadata = Some(json!({
        "sha256": artifact.sha256.clone(),
        "sizeBytes": artifact.size_bytes,
    }));
    let mut parts = Vec::with_capacity(2);
    if let Some(message) = arguments.message {
        parts.push(Part::text(message));
    }
    parts.push(file);
    let request = message_request(arguments.context_id, parts)?;
    let receipt = runtime.enqueue(&peer.instance_id, &request)?;
    Ok(ToolOutput {
        text: format!(
            "File {} staged and queued for peer agent {}. The receiver must explicitly accept and import it.",
            artifact.filename, peer.name
        ),
        structured: Some(json!({
            "delivery_id": receipt.delivery_id,
            "recipient_instance_id": receipt.recipient_instance_id,
            "recipient_name": peer.name,
            "artifact": {
                "url": artifact.relative_url,
                "filename": artifact.filename,
                "sha256": artifact.sha256,
                "size_bytes": artifact.size_bytes,
            },
            "imported": false,
        })),
        is_error: false,
    })
}

fn message_request(context_id: Option<String>, parts: Vec<Part>) -> Result<SendMessageRequest> {
    let request = SendMessageRequest {
        tenant: None,
        message: Message {
            message_id: random_message_id()?,
            context_id,
            task_id: None,
            role: Role::User,
            parts,
            metadata: None,
            extensions: Vec::new(),
            reference_task_ids: Vec::new(),
        },
        configuration: None,
        metadata: None,
    };
    request
        .validate()
        .context("outbound A2A message is invalid")?;
    Ok(request)
}

fn random_message_id() -> Result<String> {
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random).context("secure A2A message identifier generation failed")?;
    let mut id = String::with_capacity(36);
    id.push_str("msg_");
    for byte in random {
        use std::fmt::Write as _;
        write!(id, "{byte:02x}").expect("writing to String cannot fail");
    }
    Ok(id)
}

struct PeerTarget {
    instance_id: String,
    name: String,
}

fn resolve_peer(runtime: &A2aRuntime, selector: &str) -> Result<PeerTarget> {
    let own = runtime.own_peer()?;
    if selector == own.instance_id || selector == own.name {
        bail!("cannot send an A2A message to this Crumb instance");
    }
    let peers = runtime.list_peers()?;
    if let Some(peer) = peers.iter().find(|peer| peer.instance_id == selector) {
        return Ok(PeerTarget {
            instance_id: peer.instance_id.clone(),
            name: peer.name.clone(),
        });
    }
    let mut named = peers.into_iter().filter(|peer| peer.name == selector);
    let peer = named
        .next()
        .with_context(|| format!("no active peer matches `{selector}`"))?;
    if named.next().is_some() {
        bail!("peer name `{selector}` is ambiguous; use an exact instance ID");
    }
    Ok(PeerTarget {
        instance_id: peer.instance_id,
        name: peer.name,
    })
}

fn parse_arguments<T: for<'de> Deserialize<'de>>(arguments: &Value) -> Result<T> {
    serde_json::from_value(arguments.clone()).context("invalid A2A tool arguments")
}

fn validate_selector(selector: &str) -> Result<()> {
    validate_nonempty_bounded("peer", selector, MAX_PEER_SELECTOR_BYTES)
}

fn validate_message(message: &str) -> Result<()> {
    validate_nonempty_bounded("message", message, MAX_TEXT_BYTES)
}

fn validate_context_id(context_id: Option<&str>) -> Result<()> {
    if let Some(context_id) = context_id {
        validate_nonempty_bounded("context_id", context_id, MAX_CONTEXT_ID_BYTES)?;
        if !context_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
        {
            bail!("context_id contains unsupported characters");
        }
    }
    Ok(())
}

fn validate_media_type(media_type: &str) -> Result<()> {
    validate_nonempty_bounded("media_type", media_type, MAX_MEDIA_TYPE_BYTES)?;
    if media_type.bytes().any(|byte| byte.is_ascii_control())
        || !media_type.contains('/')
        || media_type.contains(char::is_whitespace)
    {
        bail!("media_type must be a valid non-whitespace type/subtype");
    }
    Ok(())
}

fn validate_relative_tool_path(path: &str) -> Result<()> {
    validate_nonempty_bounded("path", path, 4 * 1024)?;
    let path = Path::new(path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        bail!("path must be a traversal-free relative workspace file");
    }
    Ok(())
}

fn validate_nonempty_bounded(label: &str, value: &str, max_bytes: usize) -> Result<()> {
    if value.trim().is_empty() {
        bail!("{label} must not be empty");
    }
    if value.len() > max_bytes {
        bail!("{label} exceeds the {max_bytes}-byte limit");
    }
    Ok(())
}

fn ensure_active(cancellation: &CancellationToken) -> Result<()> {
    if cancellation.is_cancelled() {
        bail!("tool call cancelled");
    }
    Ok(())
}

fn list_descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: LIST_PEER_AGENTS_TOOL.to_owned(),
        description: "List active local Crumb peer agents by stable instance ID and display name. Does not expose process, endpoint, message, or file data.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }),
        risk: RiskClass::ReadOnly,
        transport: ToolTransport::Native,
    }
}

fn send_descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: SEND_PEER_MESSAGE_TOOL.to_owned(),
        description: "Send one bounded message to an active local Crumb peer. Select by exact instance ID or an unambiguous exact display name. Requires peer-communication approval.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "peer": {"type": "string", "minLength": 1, "maxLength": MAX_PEER_SELECTOR_BYTES},
                "message": {"type": "string", "minLength": 1, "maxLength": MAX_TEXT_BYTES},
                "context_id": {"type": "string", "minLength": 1, "maxLength": MAX_CONTEXT_ID_BYTES}
            },
            "required": ["peer", "message"],
            "additionalProperties": false
        }),
        risk: RiskClass::PeerCommunication,
        transport: ToolTransport::Native,
    }
}

fn share_descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: SHARE_PEER_FILE_TOOL.to_owned(),
        description: "Stage one safe relative workspace file and send its immutable content-addressed A2A reference to a peer. Sends no inline bytes and never imports into the receiver workspace. Requires peer-communication approval.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "peer": {"type": "string", "minLength": 1, "maxLength": MAX_PEER_SELECTOR_BYTES},
                "path": {"type": "string", "minLength": 1, "maxLength": 4096},
                "message": {"type": "string", "minLength": 1, "maxLength": MAX_TEXT_BYTES},
                "context_id": {"type": "string", "minLength": 1, "maxLength": MAX_CONTEXT_ID_BYTES},
                "media_type": {"type": "string", "minLength": 3, "maxLength": MAX_MEDIA_TYPE_BYTES}
            },
            "required": ["peer", "path"],
            "additionalProperties": false
        }),
        risk: RiskClass::PeerCommunication,
        transport: ToolTransport::Native,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::fs;
    use std::path::{Path, PathBuf};

    use crumb_a2a_runtime::{A2aRuntime, RuntimeOptions};
    use crumb_agent::{
        AgentMode, CancellationToken, ConfiguredApprovals, DenyAllApprovals, RiskClass,
        ToolCallErrorKind, ToolHost,
    };
    use crumb_instance::{InstanceMetadata, InstanceStore};
    use serde_json::json;
    use tempfile::TempDir;

    use super::{
        LIST_PEER_AGENTS_TOOL, SEND_PEER_MESSAGE_TOOL, SHARE_PEER_FILE_TOOL, register_a2a_tools,
    };

    struct Fixture {
        first_workspace: PathBuf,
        first: A2aRuntime,
        second: A2aRuntime,
        second_instance: InstanceMetadata,
        root: TempDir,
    }

    impl Fixture {
        fn new(second_name: &str) -> Self {
            let root = TempDir::new().expect("temporary root");
            let bus = root.path().join("bus");
            let (first_workspace, first_instance) = workspace(root.path(), "Builder One");
            let (second_workspace, second_instance) = workspace(root.path(), second_name);
            let first = A2aRuntime::start(
                &bus,
                &first_workspace,
                &first_instance,
                RuntimeOptions::default(),
            )
            .expect("first runtime");
            let second = A2aRuntime::start(
                &bus,
                &second_workspace,
                &second_instance,
                RuntimeOptions::default(),
            )
            .expect("second runtime");
            Self {
                first_workspace,
                first,
                second,
                second_instance,
                root,
            }
        }

        fn host(&self) -> ToolHost {
            let mut host = ToolHost::default();
            register_a2a_tools(&mut host, self.first.clone()).expect("A2A tools register");
            host
        }
    }

    fn workspace(root: &Path, name: &str) -> (PathBuf, InstanceMetadata) {
        workspace_in(root, &name.replace(' ', "-"), name)
    }

    fn workspace_in(root: &Path, directory: &str, name: &str) -> (PathBuf, InstanceMetadata) {
        let workspace = root.join(directory);
        fs::create_dir(&workspace).expect("workspace directory");
        let instance = InstanceStore::for_workspace(&workspace)
            .load_or_create_named(name)
            .expect("instance metadata");
        (workspace, instance)
    }

    fn peer_approvals(tools: &[&str]) -> ConfiguredApprovals {
        ConfiguredApprovals::default().with_peer_tools(
            tools
                .iter()
                .map(|tool| (*tool).to_owned())
                .collect::<BTreeSet<_>>(),
        )
    }

    #[test]
    fn descriptors_have_the_expected_risks_and_no_receive_tool() {
        let fixture = Fixture::new("Builder Two");
        let host = fixture.host();
        assert_eq!(
            host.descriptor(LIST_PEER_AGENTS_TOOL).map(|tool| tool.risk),
            Some(RiskClass::ReadOnly)
        );
        assert_eq!(
            host.descriptor(SEND_PEER_MESSAGE_TOOL)
                .map(|tool| tool.risk),
            Some(RiskClass::PeerCommunication)
        );
        assert_eq!(
            host.descriptor(SHARE_PEER_FILE_TOOL).map(|tool| tool.risk),
            Some(RiskClass::PeerCommunication)
        );
        assert!(host.descriptor("receive_peer_message").is_none());
        assert!(host.descriptor("import_peer_file").is_none());
    }

    #[test]
    fn list_exposes_only_public_peer_identity() {
        let fixture = Fixture::new("Builder Two");
        let output = fixture
            .host()
            .call(
                LIST_PEER_AGENTS_TOOL,
                &json!({}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
            )
            .expect("read-only listing succeeds");
        let encoded = output.structured.expect("structured peers").to_string();
        assert!(encoded.contains(&fixture.second_instance.instance_id));
        assert!(encoded.contains("Builder Two"));
        assert!(!encoded.contains("runtimeId"));
        assert!(!encoded.contains("processId"));
        assert!(!encoded.contains("inbox"));
    }

    #[test]
    fn send_requires_permission_and_delivers_by_name() {
        let fixture = Fixture::new("Builder Two");
        let host = fixture.host();
        let arguments = json!({"peer": "Builder Two", "message": "Please review the API."});
        let denied = host
            .call(
                SEND_PEER_MESSAGE_TOOL,
                &arguments,
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
            )
            .expect_err("peer messaging is approval gated");
        assert_eq!(denied.kind, ToolCallErrorKind::Denied);
        assert!(fixture.second.dequeue().expect("empty inbox").is_none());

        let output = host
            .call(
                SEND_PEER_MESSAGE_TOOL,
                &arguments,
                AgentMode::Auto,
                &peer_approvals(&[SEND_PEER_MESSAGE_TOOL]),
                &CancellationToken::default(),
            )
            .expect("approved send executes");
        assert!(!output.is_error);
        let received = fixture
            .second
            .dequeue()
            .expect("dequeue")
            .expect("message delivered");
        assert_eq!(
            received.request.message.parts[0].text.as_deref(),
            Some("Please review the API.")
        );
        assert_eq!(received.request.message.role, crumb_a2a::Role::User);
    }

    #[test]
    fn send_rejects_self_unknown_fields_and_ambiguous_names() {
        let fixture = Fixture::new("Builder Two");
        let host = fixture.host();
        let approvals = peer_approvals(&[SEND_PEER_MESSAGE_TOOL]);
        let self_send = host
            .call(
                SEND_PEER_MESSAGE_TOOL,
                &json!({"peer":"Builder One", "message":"loop"}),
                AgentMode::Auto,
                &approvals,
                &CancellationToken::default(),
            )
            .expect("expected tool-level error");
        assert!(self_send.is_error);
        assert!(self_send.text.contains("cannot send"));

        let unknown = host
            .call(
                SEND_PEER_MESSAGE_TOOL,
                &json!({"peer":"Builder Two", "message":"hello", "extra":true}),
                AgentMode::Auto,
                &approvals,
                &CancellationToken::default(),
            )
            .expect("expected tool-level error");
        assert!(unknown.is_error);

        let (third_workspace, third_instance) =
            workspace_in(fixture.root.path(), "builder-two-copy", "Builder Two");
        let third = A2aRuntime::start(
            &fixture.root.path().join("bus"),
            &third_workspace,
            &third_instance,
            RuntimeOptions::default(),
        )
        .expect("third runtime");
        let ambiguous = host
            .call(
                SEND_PEER_MESSAGE_TOOL,
                &json!({"peer":"Builder Two", "message":"hello"}),
                AgentMode::Auto,
                &approvals,
                &CancellationToken::default(),
            )
            .expect("expected tool-level error");
        assert!(ambiguous.is_error);
        assert!(ambiguous.text.contains("ambiguous"));
        drop(third);
    }

    #[test]
    fn share_stages_url_only_and_never_imports() {
        let fixture = Fixture::new("Builder Two");
        fs::write(
            fixture.first_workspace.join("handoff.txt"),
            "bounded handoff",
        )
        .expect("source file");
        let output = fixture
            .host()
            .call(
                SHARE_PEER_FILE_TOOL,
                &json!({
                    "peer": fixture.second_instance.instance_id,
                    "path": "handoff.txt",
                    "message": "Use this input.",
                    "media_type": "text/plain"
                }),
                AgentMode::Auto,
                &peer_approvals(&[SHARE_PEER_FILE_TOOL]),
                &CancellationToken::default(),
            )
            .expect("approved share executes");
        assert!(!output.is_error);
        assert_eq!(
            output
                .structured
                .as_ref()
                .and_then(|value| value["imported"].as_bool()),
            Some(false)
        );
        let received = fixture
            .second
            .dequeue()
            .expect("dequeue")
            .expect("file message delivered");
        let file = &received.request.message.parts[1];
        assert!(
            file.url
                .as_deref()
                .is_some_and(|url| url.starts_with("artifacts/"))
        );
        assert_eq!(file.filename.as_deref(), Some("handoff.txt"));
        assert!(file.data.is_none());
        assert!(file.text.is_none());
    }

    #[test]
    fn share_rejects_traversal_before_staging() {
        let fixture = Fixture::new("Builder Two");
        let output = fixture
            .host()
            .call(
                SHARE_PEER_FILE_TOOL,
                &json!({"peer":"Builder Two", "path":"../secret"}),
                AgentMode::Auto,
                &peer_approvals(&[SHARE_PEER_FILE_TOOL]),
                &CancellationToken::default(),
            )
            .expect("expected tool-level error");
        assert!(output.is_error);
        assert!(output.text.contains("traversal-free"));
        assert!(fixture.second.dequeue().expect("empty inbox").is_none());
    }
}
