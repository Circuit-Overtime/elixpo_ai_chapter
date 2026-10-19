use std::collections::BTreeSet;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use crumb_agent::{
    CancellationToken, McpServer, McpTransport, RiskClass, ToolDescriptor, ToolHandler, ToolHost,
    ToolOutput, ToolTransport,
};
use serde_json::{Value, json};

const PROTOCOL_VERSION: &str = "2025-11-25";

#[derive(Clone, Copy, Debug)]
pub struct StdioMcpLimits {
    pub startup_timeout: Duration,
    pub request_timeout: Duration,
    pub shutdown_timeout: Duration,
    pub max_frame_bytes: usize,
    pub max_tools: usize,
}

impl Default for StdioMcpLimits {
    fn default() -> Self {
        Self {
            startup_timeout: Duration::from_secs(10),
            request_timeout: Duration::from_secs(30),
            shutdown_timeout: Duration::from_secs(2),
            max_frame_bytes: 1024 * 1024,
            max_tools: 128,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct McpDiagnostic {
    pub server_id: String,
    pub message: String,
}

/// Starts enabled local MCP servers and registers their discovered tools.
/// Individual server failures are isolated and returned as redacted diagnostics.
pub fn register_stdio_servers(
    host: &mut ToolHost,
    servers: &[McpServer],
    workspace: &std::path::Path,
    limits: StdioMcpLimits,
) -> Vec<McpDiagnostic> {
    let mut diagnostics = Vec::new();
    for server in servers
        .iter()
        .filter(|server| server.enabled && server.transport == McpTransport::Stdio)
    {
        if let Err(error) = register_server(host, server, workspace, limits) {
            diagnostics.push(McpDiagnostic {
                server_id: server.id.clone(),
                message: redacted_error(&error),
            });
        }
    }
    diagnostics
}

fn register_server(
    host: &mut ToolHost,
    server: &McpServer,
    workspace: &std::path::Path,
    limits: StdioMcpLimits,
) -> Result<()> {
    validate_component(&server.id, "server ID")?;
    if server.arguments.as_slice() == ["mcp", "serve"]
        && std::env::current_exe()
            .ok()
            .and_then(|path| path.canonicalize().ok())
            == server.command.canonicalize().ok()
    {
        bail!("external MCP recursive launch is invalid");
    }
    let client = Arc::new(StdioMcpClient::start(server, workspace, limits)?);
    let tools = client.discover()?;
    let mut names = BTreeSet::new();
    for tool in &tools {
        let namespaced = format!("mcp__{}__{}", server.id, tool.name);
        if !names.insert(namespaced.clone()) || host.descriptor(&namespaced).is_some() {
            bail!("external MCP tool namespace collision");
        }
    }
    for tool in tools {
        let namespaced = format!("mcp__{}__{}", server.id, tool.name);
        let descriptor = ToolDescriptor {
            name: namespaced,
            description: tool.description,
            input_schema: tool.input_schema,
            risk: RiskClass::ProcessExecution,
            transport: ToolTransport::Mcp {
                server_id: server.id.clone(),
            },
        };
        host.register(
            descriptor,
            Arc::new(StdioToolHandler {
                client: Arc::clone(&client),
                remote_name: tool.name,
            }),
        )?;
    }
    Ok(())
}

pub(crate) struct DiscoveredTool {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) input_schema: Value,
}

struct StdioMcpClient {
    stdin: Mutex<ChildStdin>,
    responses: Mutex<Receiver<Result<Value>>>,
    child: Mutex<Child>,
    request_lock: Mutex<()>,
    next_id: AtomicU64,
    limits: StdioMcpLimits,
}

impl StdioMcpClient {
    fn start(
        server: &McpServer,
        workspace: &std::path::Path,
        limits: StdioMcpLimits,
    ) -> Result<Self> {
        if limits.max_frame_bytes == 0 || limits.max_tools == 0 {
            bail!("MCP limits must be positive");
        }
        let mut command = Command::new(&server.command);
        command
            .args(&server.arguments)
            .current_dir(workspace)
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        for name in ["PATH", "SYSTEMROOT", "WINDIR"] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        let mut child = command
            .spawn()
            .context("external MCP server is unavailable")?;
        let stdin = child
            .stdin
            .take()
            .context("external MCP stdin unavailable")?;
        let stdout = child
            .stdout
            .take()
            .context("external MCP stdout unavailable")?;
        let (sender, responses) = mpsc::sync_channel(8);
        let reader = thread::Builder::new()
            .name(format!("crumb-mcp-reader-{}", server.id))
            .spawn(move || {
                let mut reader = BufReader::new(stdout);
                loop {
                    match read_frame(&mut reader, limits.max_frame_bytes) {
                        Ok(Some(frame)) => {
                            let response = serde_json::from_slice(&frame)
                                .context("external MCP returned malformed JSON");
                            if sender.send(response).is_err() {
                                break;
                            }
                        }
                        Ok(None) => break,
                        Err(error) => {
                            let _ = sender.send(Err(error));
                            break;
                        }
                    }
                }
            });
        if let Err(error) = reader {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error).context("failed to start external MCP response reader");
        }
        let client = Self {
            stdin: Mutex::new(stdin),
            responses: Mutex::new(responses),
            child: Mutex::new(child),
            request_lock: Mutex::new(()),
            next_id: AtomicU64::new(1),
            limits,
        };
        client.initialize()?;
        Ok(client)
    }

    fn initialize(&self) -> Result<()> {
        let result = self.request_with_timeout(
            "initialize",
            &json!({
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "crumb", "version": env!("CARGO_PKG_VERSION")}
            }),
            self.limits.startup_timeout,
            &CancellationToken::default(),
        )?;
        if result.get("protocolVersion").and_then(Value::as_str) != Some(PROTOCOL_VERSION) {
            bail!("external MCP protocol version is invalid");
        }
        self.notify("notifications/initialized", &json!({}))
    }

    fn discover(&self) -> Result<Vec<DiscoveredTool>> {
        let result = self.request_with_timeout(
            "tools/list",
            &json!({}),
            self.limits.startup_timeout,
            &CancellationToken::default(),
        )?;
        let tools = result
            .get("tools")
            .and_then(Value::as_array)
            .context("external MCP tool list is malformed")?;
        if tools.len() > self.limits.max_tools {
            bail!("external MCP advertised too many tools");
        }
        tools.iter().map(parse_tool).collect()
    }

    fn call(
        &self,
        name: &str,
        arguments: &Value,
        cancellation: &CancellationToken,
    ) -> Result<ToolOutput> {
        let result = self.request_with_timeout(
            "tools/call",
            &json!({"name": name, "arguments": arguments}),
            self.limits.request_timeout,
            cancellation,
        )?;
        parse_tool_output(&result, self.limits.max_frame_bytes)
    }

    fn request_with_timeout(
        &self,
        method: &str,
        params: &Value,
        timeout: Duration,
        cancellation: &CancellationToken,
    ) -> Result<Value> {
        let _request = self
            .request_lock
            .lock()
            .map_err(|_| anyhow!("external MCP request state is unavailable"))?;
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        self.write_message(&json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))?;
        let deadline = Instant::now() + timeout;
        loop {
            if cancellation.is_cancelled() {
                self.terminate();
                bail!("external MCP request cancelled");
            }
            let now = Instant::now();
            if now >= deadline {
                self.terminate();
                bail!("external MCP request timed out");
            }
            let wait = deadline
                .saturating_duration_since(now)
                .min(Duration::from_millis(25));
            let received = self
                .responses
                .lock()
                .map_err(|_| anyhow!("external MCP response state is unavailable"))?
                .recv_timeout(wait);
            match received {
                Ok(Ok(response)) if response.get("id").and_then(Value::as_u64) == Some(id) => {
                    if response.get("error").is_some() {
                        bail!("external MCP request failed");
                    }
                    return response
                        .get("result")
                        .cloned()
                        .context("external MCP response has no result");
                }
                Ok(Ok(_)) | Err(RecvTimeoutError::Timeout) => {}
                Ok(Err(error)) => return Err(error),
                Err(RecvTimeoutError::Disconnected) => {
                    bail!("external MCP server stopped unexpectedly");
                }
            }
        }
    }

    fn notify(&self, method: &str, params: &Value) -> Result<()> {
        self.write_message(&json!({"jsonrpc":"2.0","method":method,"params":params}))
    }

    fn write_message(&self, value: &Value) -> Result<()> {
        let mut encoded = serde_json::to_vec(value)?;
        if encoded.len() > self.limits.max_frame_bytes {
            bail!("external MCP request exceeded the byte limit");
        }
        encoded.push(b'\n');
        let mut stdin = self
            .stdin
            .lock()
            .map_err(|_| anyhow!("external MCP input state is unavailable"))?;
        stdin
            .write_all(&encoded)
            .context("external MCP input failed")?;
        stdin.flush().context("external MCP input failed")
    }

    fn terminate(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let started = Instant::now();
            while started.elapsed() < self.limits.shutdown_timeout {
                match child.try_wait() {
                    Ok(Some(_)) | Err(_) => return,
                    Ok(None) => thread::sleep(Duration::from_millis(10)),
                }
            }
            let _ = child.wait();
        }
    }
}

impl Drop for StdioMcpClient {
    fn drop(&mut self) {
        self.terminate();
    }
}

struct StdioToolHandler {
    client: Arc<StdioMcpClient>,
    remote_name: String,
}

impl ToolHandler for StdioToolHandler {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        self.client.call(&self.remote_name, arguments, cancellation)
    }
}

pub(crate) fn parse_tool(value: &Value) -> Result<DiscoveredTool> {
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .context("external MCP tool name is missing")?;
    validate_component(name, "tool name")?;
    let description = value
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("External MCP tool");
    if description.len() > 2048 || description.chars().any(char::is_control) {
        bail!("external MCP tool description is invalid");
    }
    let input_schema = value
        .get("inputSchema")
        .cloned()
        .unwrap_or_else(|| json!({"type":"object"}));
    if !input_schema.is_object() || serde_json::to_vec(&input_schema)?.len() > 16 * 1024 {
        bail!("external MCP tool schema is invalid");
    }
    Ok(DiscoveredTool {
        name: name.to_owned(),
        description: description.to_owned(),
        input_schema,
    })
}

pub(crate) fn parse_tool_output(result: &Value, maximum: usize) -> Result<ToolOutput> {
    let mut text = String::new();
    if let Some(content) = result.get("content").and_then(Value::as_array) {
        for block in content {
            if block.get("type").and_then(Value::as_str) == Some("text")
                && let Some(value) = block.get("text").and_then(Value::as_str)
            {
                if text.len().saturating_add(value.len()).saturating_add(1) > maximum {
                    bail!("external MCP tool output exceeded the byte limit");
                }
                if !text.is_empty() {
                    text.push('\n');
                }
                text.push_str(value);
            }
        }
    }
    let structured = result.get("structuredContent").cloned();
    if structured
        .as_ref()
        .is_some_and(|value| serde_json::to_vec(value).is_ok_and(|encoded| encoded.len() > maximum))
    {
        bail!("external MCP structured output exceeded the byte limit");
    }
    Ok(ToolOutput {
        text,
        structured,
        is_error: result
            .get("isError")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

pub(crate) fn validate_component(value: &str, label: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
    {
        bail!("external MCP {label} is invalid");
    }
    Ok(())
}

fn read_frame(reader: &mut dyn BufRead, maximum: usize) -> Result<Option<Vec<u8>>> {
    let mut frame = Vec::new();
    let bytes = reader.read_until(b'\n', &mut frame)?;
    if bytes == 0 {
        return Ok(None);
    }
    if frame.len() > maximum {
        bail!("external MCP response exceeded the byte limit");
    }
    Ok(Some(frame))
}

pub(crate) fn redacted_error(error: &anyhow::Error) -> String {
    let text = error.to_string();
    for allowed in [
        "unavailable",
        "timed out",
        "cancelled",
        "too many tools",
        "malformed",
        "byte limit",
        "invalid",
        "stopped unexpectedly",
        "failed",
    ] {
        if text.contains(allowed) {
            return format!("external MCP {allowed}");
        }
    }
    "external MCP unavailable".to_owned()
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;
    #[cfg(unix)]
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    #[cfg(unix)]
    use crumb_agent::{
        AgentMode, CancellationToken, ConfiguredApprovals, DenyAllApprovals, McpServer, RiskClass,
        ToolHost,
    };
    use serde_json::json;

    #[cfg(unix)]
    use super::{StdioMcpClient, StdioMcpLimits, register_stdio_servers};
    use super::{parse_tool, parse_tool_output, read_frame, redacted_error};

    #[test]
    fn discovery_rejects_unsafe_names_and_large_schemas() {
        assert!(parse_tool(&json!({"name":"../../escape"})).is_err());
        assert!(
            parse_tool(&json!({
                "name":"safe",
                "inputSchema":{"description":"x".repeat(20_000)}
            }))
            .is_err()
        );
    }

    #[test]
    fn output_and_frames_are_bounded() {
        assert!(
            parse_tool_output(&json!({"content":[{"type":"text","text":"too large"}]}), 4).is_err()
        );
        assert!(read_frame(&mut Cursor::new(b"12345\n"), 4).is_err());
    }

    #[test]
    fn diagnostics_never_echo_child_details() {
        let error = anyhow::anyhow!("external MCP returned malformed JSON: secret payload");
        assert_eq!(redacted_error(&error), "external MCP malformed");
    }

    #[cfg(unix)]
    #[test]
    fn denied_calls_never_reach_the_supervised_child() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is valid")
            .as_nanos();
        let workspace = std::env::temp_dir().join(format!("crumb-mcp-client-{suffix}"));
        std::fs::create_dir_all(&workspace).expect("workspace");
        let marker = workspace.join("called");
        let script = workspace.join("fixture.sh");
        let contents = concat!(
            "while IFS= read -r line; do\n",
            "case \"$line\" in\n",
            "  *'\"method\":\"initialize\"'*) printf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":\"2025-11-25\",\"capabilities\":{\"tools\":{}},\"serverInfo\":{\"name\":\"fixture\",\"version\":\"1\"}}}' ;;\n",
            "  *'\"method\":\"tools/list\"'*) printf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"tools\":[{\"name\":\"echo\",\"description\":\"fixture\",\"inputSchema\":{\"type\":\"object\"}}]}}' ;;\n",
            "  *'\"method\":\"tools/call\"'*) : > \"MARKER\"; printf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":3,\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"called\"}],\"isError\":false}}' ;;\n",
            "esac\n",
            "done\n"
        )
        .replace("MARKER", &marker.to_string_lossy());
        std::fs::write(&script, contents).expect("fixture script");
        let server = McpServer {
            id: "fixture".to_owned(),
            transport: crumb_agent::McpTransport::Stdio,
            command: "/bin/sh".into(),
            arguments: vec![script.to_string_lossy().into_owned()],
            url: None,
            credential: None,
            enabled: true,
        };
        let mut host = ToolHost::default();
        let diagnostics =
            register_stdio_servers(&mut host, &[server], &workspace, StdioMcpLimits::default());
        assert_eq!(diagnostics, []);
        assert_eq!(
            host.descriptor("mcp__fixture__echo")
                .expect("namespaced tool")
                .risk,
            RiskClass::ProcessExecution
        );

        assert!(
            host.call(
                "mcp__fixture__echo",
                &json!({}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
            )
            .is_err()
        );
        assert!(!marker.exists());

        let approvals = ConfiguredApprovals::default()
            .with_mcp_tools(["mcp__fixture__echo".to_owned()].into_iter().collect());
        let output = host
            .call(
                "mcp__fixture__echo",
                &json!({}),
                AgentMode::Auto,
                &approvals,
                &CancellationToken::default(),
            )
            .expect("approved supervised call");
        assert_eq!(output.text, "called");
        assert!(marker.exists());

        drop(host);
        std::fs::remove_dir_all(workspace).expect("temporary workspace removed");
    }

    #[cfg(unix)]
    #[test]
    fn stdio_failures_are_isolated_and_child_environment_is_cleared() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is valid")
            .as_nanos();
        let workspace = std::env::temp_dir().join(format!("crumb-mcp-adversarial-{suffix}"));
        std::fs::create_dir_all(&workspace).expect("workspace");

        let environment_script = workspace.join("environment.sh");
        std::fs::write(
            &environment_script,
            concat!(
                "while IFS= read -r line; do\n",
                "case \"$line\" in\n",
                "  *'\"method\":\"initialize\"'*) printf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":\"2025-11-25\"}}' ;;\n",
                "  *'\"method\":\"tools/list\"'*) printf '{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"tools\":[{\"name\":\"environment\",\"description\":\"%s\",\"inputSchema\":{\"type\":\"object\"}}]}}\\n' \"${HOME:-cleared}\" ;;\n",
                "esac\n",
                "done\n"
            ),
        )
        .expect("environment fixture");
        let server = McpServer {
            id: "environment".to_owned(),
            transport: crumb_agent::McpTransport::Stdio,
            command: "/bin/sh".into(),
            arguments: vec![environment_script.to_string_lossy().into_owned()],
            url: None,
            credential: None,
            enabled: true,
        };
        let mut host = ToolHost::default();
        assert_eq!(
            register_stdio_servers(
                &mut host,
                std::slice::from_ref(&server),
                &workspace,
                StdioMcpLimits::default(),
            ),
            []
        );
        assert_eq!(
            host.descriptor("mcp__environment__environment")
                .expect("environment tool")
                .description,
            "cleared"
        );
        drop(host);

        let malformed_script = workspace.join("malformed.sh");
        std::fs::write(
            &malformed_script,
            "IFS= read -r line\nprintf '%s\\n' 'secret-child-payload'\n",
        )
        .expect("malformed fixture");
        let malformed = McpServer {
            id: "malformed".to_owned(),
            arguments: vec![malformed_script.to_string_lossy().into_owned()],
            ..server.clone()
        };
        let diagnostics = register_stdio_servers(
            &mut ToolHost::default(),
            &[malformed],
            &workspace,
            StdioMcpLimits::default(),
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].message, "external MCP malformed");
        assert!(!diagnostics[0].message.contains("secret-child-payload"));

        let hanging_script = workspace.join("hanging.sh");
        std::fs::write(&hanging_script, "IFS= read -r line\nsleep 5\n").expect("hanging fixture");
        let hanging = McpServer {
            id: "hanging".to_owned(),
            arguments: vec![hanging_script.to_string_lossy().into_owned()],
            ..server
        };
        let diagnostics = register_stdio_servers(
            &mut ToolHost::default(),
            &[hanging],
            &workspace,
            StdioMcpLimits {
                startup_timeout: Duration::from_millis(20),
                ..StdioMcpLimits::default()
            },
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].message, "external MCP timed out");
        std::fs::remove_dir_all(workspace).expect("temporary workspace removed");
    }

    #[cfg(unix)]
    #[test]
    fn cancelling_an_active_stdio_call_terminates_the_child() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is valid")
            .as_nanos();
        let workspace = std::env::temp_dir().join(format!("crumb-mcp-cancel-{suffix}"));
        std::fs::create_dir_all(&workspace).expect("workspace");
        let script = workspace.join("fixture.sh");
        std::fs::write(
            &script,
            concat!(
                "while IFS= read -r line; do\n",
                "case \"$line\" in\n",
                "  *'\"method\":\"initialize\"'*) printf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":\"2025-11-25\"}}' ;;\n",
                "  *'\"method\":\"tools/list\"'*) printf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"tools\":[{\"name\":\"hang\",\"inputSchema\":{\"type\":\"object\"}}]}}' ;;\n",
                "  *'\"method\":\"tools/call\"'*) sleep 5 ;;\n",
                "esac\n",
                "done\n"
            ),
        )
        .expect("fixture script");
        let server = McpServer {
            id: "fixture".to_owned(),
            transport: crumb_agent::McpTransport::Stdio,
            command: "/bin/sh".into(),
            arguments: vec![script.to_string_lossy().into_owned()],
            url: None,
            credential: None,
            enabled: true,
        };
        let client = StdioMcpClient::start(&server, &workspace, StdioMcpLimits::default())
            .expect("client starts");
        client.discover().expect("tools discovered");
        let cancellation = CancellationToken::default();
        let trigger = cancellation.clone();
        let worker = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            trigger.cancel();
        });
        let error = client
            .call("hang", &json!({}), &cancellation)
            .expect_err("call is cancelled");
        worker.join().expect("cancellation worker");
        assert!(error.to_string().contains("cancelled"));
        assert!(
            client
                .child
                .lock()
                .expect("child lock")
                .try_wait()
                .expect("child status")
                .is_some()
        );
        drop(client);
        std::fs::remove_dir_all(workspace).expect("temporary workspace removed");
    }
}
