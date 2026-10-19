//! Policy-enforcing MCP server owned by Crumb.

mod client;
mod http_client;

pub use client::{McpDiagnostic, StdioMcpLimits, register_stdio_servers};
pub use http_client::{StreamableHttpLimits, register_streamable_http_servers};

use std::io::{BufRead, Write};
use std::sync::Arc;

use anyhow::{Context, Result, bail};
use crumb_agent::{
    AgentMode, ApprovalBroker, CancellationToken, RiskClass, ToolCallErrorKind, ToolHost,
};
use serde_json::{Map, Value, json};

const JSON_RPC_VERSION: &str = "2.0";
const MODERN_PROTOCOL: &str = "2026-07-28";
const LEGACY_PROTOCOL: &str = "2025-11-25";
const MAX_LINE_BYTES: usize = 1024 * 1024;

/// JSON-RPC dispatcher supporting the modern stateless protocol and the
/// immediately preceding initialize-based protocol.
pub struct McpDispatcher {
    host: ToolHost,
    approvals: Arc<dyn ApprovalBroker>,
    mode: AgentMode,
    server_version: String,
}

impl McpDispatcher {
    #[must_use]
    pub fn new(
        host: ToolHost,
        approvals: Arc<dyn ApprovalBroker>,
        mode: AgentMode,
        server_version: impl Into<String>,
    ) -> Self {
        Self {
            host,
            approvals,
            mode,
            server_version: server_version.into(),
        }
    }

    pub fn set_mode(&mut self, mode: AgentMode) {
        self.mode = mode;
    }

    /// Handles one complete newline-delimited JSON-RPC frame.
    ///
    /// Notifications return `None`; requests always return a response, including
    /// parse and protocol errors.
    #[must_use]
    pub fn handle_line(&self, line: &str, cancellation: &CancellationToken) -> Option<Vec<u8>> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return Some(response_error(&Value::Null, -32700, "parse error"));
        };
        let Some(object) = value.as_object() else {
            return Some(response_error(&Value::Null, -32600, "invalid request"));
        };
        let id = object.get("id").cloned();
        if object.get("jsonrpc").and_then(Value::as_str) != Some(JSON_RPC_VERSION) {
            return id.map(|id| response_error(&id, -32600, "invalid request"));
        }
        let Some(method) = object.get("method").and_then(Value::as_str) else {
            return id.map(|id| response_error(&id, -32600, "invalid request"));
        };
        let params = object.get("params").unwrap_or(&Value::Null);
        let Some(id) = id else {
            if method == "notifications/cancelled" {
                cancellation.cancel();
            }
            return None;
        };
        Some(match method {
            "server/discover" => response_result(&id, &self.discovery()),
            "initialize" => self.initialize(&id, params),
            "ping" => response_result(&id, &json!({})),
            "tools/list" => response_result(&id, &self.list_tools()),
            "tools/call" => self.call_tool(&id, params, cancellation),
            _ => response_error(&id, -32601, "method not found"),
        })
    }

    fn discovery(&self) -> Value {
        json!({
            "protocolVersion": MODERN_PROTOCOL,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "crumb", "version": self.server_version}
        })
    }

    fn initialize(&self, id: &Value, params: &Value) -> Vec<u8> {
        let requested = params.get("protocolVersion").and_then(Value::as_str);
        if requested != Some(LEGACY_PROTOCOL) {
            return response_error(id, -32602, "unsupported protocol version");
        }
        response_result(
            id,
            &json!({
                "protocolVersion": LEGACY_PROTOCOL,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "crumb", "version": self.server_version}
            }),
        )
    }

    fn list_tools(&self) -> Value {
        let tools = self
            .host
            .tools()
            .map(|tool| {
                json!({
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.input_schema,
                    "annotations": annotations(tool.risk),
                    "execution": {"taskSupport": "forbidden"}
                })
            })
            .collect::<Vec<_>>();
        json!({"tools": tools})
    }

    fn call_tool(&self, id: &Value, params: &Value, cancellation: &CancellationToken) -> Vec<u8> {
        let Some(name) = params.get("name").and_then(Value::as_str) else {
            return response_error(id, -32602, "tool name is required");
        };
        let arguments = params
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| Value::Object(Map::new()));
        if !arguments.is_object() {
            return response_error(id, -32602, "tool arguments must be an object");
        }
        match self.host.call(
            name,
            &arguments,
            self.mode,
            self.approvals.as_ref(),
            cancellation,
        ) {
            Ok(output) => response_result(id, &tool_result(output)),
            Err(error) if error.kind == ToolCallErrorKind::UnknownTool => {
                response_error(id, -32602, "unknown tool")
            }
            Err(error) => response_result(
                id,
                &json!({
                    "content": [{"type":"text", "text":error.to_string()}],
                    "isError": true
                }),
            ),
        }
    }
}

/// Serves newline-delimited MCP until EOF.
///
/// # Errors
///
/// Returns an error for I/O failures or oversized protocol frames.
pub fn serve_stdio(
    dispatcher: &McpDispatcher,
    reader: &mut dyn BufRead,
    writer: &mut dyn Write,
    cancellation: &CancellationToken,
) -> Result<()> {
    loop {
        let Some(line) = read_line(reader)? else {
            return Ok(());
        };
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        let text = std::str::from_utf8(&line).context("MCP input is not UTF-8")?;
        if let Some(response) = dispatcher.handle_line(text, cancellation) {
            writer
                .write_all(&response)
                .context("failed to write MCP response")?;
            writer.flush().context("failed to flush MCP response")?;
        }
    }
}

fn annotations(risk: RiskClass) -> Value {
    json!({
        "readOnlyHint": matches!(risk, RiskClass::ReadOnly),
        "destructiveHint": matches!(risk, RiskClass::Destructive),
        "idempotentHint": matches!(risk, RiskClass::ReadOnly),
        "openWorldHint": matches!(risk, RiskClass::NetworkAccess | RiskClass::CredentialSensitive)
    })
}

fn tool_result(output: crumb_agent::ToolOutput) -> Value {
    let mut result = Map::new();
    result.insert(
        "content".to_owned(),
        json!([{"type":"text", "text":output.text}]),
    );
    result.insert("isError".to_owned(), Value::Bool(output.is_error));
    if let Some(structured) = output.structured {
        result.insert("structuredContent".to_owned(), structured);
    }
    Value::Object(result)
}

fn response_result(id: &Value, result: &Value) -> Vec<u8> {
    encode(&json!({"jsonrpc":JSON_RPC_VERSION,"id":id,"result":result}))
}

fn response_error(id: &Value, code: i64, message: &str) -> Vec<u8> {
    encode(&json!({
        "jsonrpc":JSON_RPC_VERSION,
        "id":id,
        "error":{"code":code,"message":message}
    }))
}

fn encode(value: &Value) -> Vec<u8> {
    let mut encoded = serde_json::to_vec(value).unwrap_or_else(|_| {
        b"{\"jsonrpc\":\"2.0\",\"id\":null,\"error\":{\"code\":-32603,\"message\":\"internal error\"}}".to_vec()
    });
    encoded.push(b'\n');
    encoded
}

fn read_line(reader: &mut dyn BufRead) -> Result<Option<Vec<u8>>> {
    let mut line = Vec::new();
    loop {
        let available = reader.fill_buf().context("failed to read MCP input")?;
        if available.is_empty() {
            return Ok((!line.is_empty()).then_some(line));
        }
        let length = available
            .iter()
            .position(|byte| *byte == b'\n')
            .map_or(available.len(), |index| index + 1);
        if line.len().saturating_add(length) > MAX_LINE_BYTES {
            bail!("MCP frame exceeded the byte limit");
        }
        line.extend_from_slice(&available[..length]);
        let complete = available[length - 1] == b'\n';
        reader.consume(length);
        if complete {
            return Ok(Some(line));
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use anyhow::Result;
    use crumb_agent::{
        AgentMode, CancellationToken, DenyAllApprovals, RiskClass, ToolDescriptor, ToolHandler,
        ToolHost, ToolOutput, ToolTransport,
    };

    use super::McpDispatcher;

    #[test]
    fn legacy_initialize_and_modern_discovery_are_supported() {
        let dispatcher = dispatcher(AgentMode::Auto, RiskClass::ReadOnly);
        let cancellation = CancellationToken::default();
        let initialize = response(
            &dispatcher
                .handle_line(
                    r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"fixture","version":"1"}}}"#,
                    &cancellation,
                )
                .expect("request receives a response"),
        );
        assert_eq!(initialize["result"]["protocolVersion"], "2025-11-25");

        let discovery = response(
            &dispatcher
                .handle_line(
                    r#"{"jsonrpc":"2.0","id":2,"method":"server/discover","params":{}}"#,
                    &cancellation,
                )
                .expect("request receives a response"),
        );
        assert_eq!(discovery["result"]["protocolVersion"], "2026-07-28");
    }

    #[test]
    fn read_only_tool_runs_in_auto_mode() {
        let dispatcher = dispatcher(AgentMode::Auto, RiskClass::ReadOnly);
        let result = response(
            &dispatcher
                .handle_line(
                    r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"fixture","arguments":{}}}"#,
                    &CancellationToken::default(),
                )
                .expect("request receives a response"),
        );
        assert_eq!(result["result"]["content"][0]["text"], "called");
        assert_eq!(result["result"]["isError"], false);
    }

    #[test]
    fn plan_mode_returns_a_tool_error_without_execution() {
        let dispatcher = dispatcher(AgentMode::Plan, RiskClass::ReadOnly);
        let result = response(
            &dispatcher
                .handle_line(
                    r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"fixture","arguments":{}}}"#,
                    &CancellationToken::default(),
                )
                .expect("request receives a response"),
        );
        assert_eq!(result["result"]["isError"], true);
        assert_eq!(
            result["result"]["content"][0]["text"],
            "plan mode does not execute tools"
        );
    }

    #[test]
    fn cancellation_notification_sets_the_shared_token() {
        let dispatcher = dispatcher(AgentMode::Auto, RiskClass::ReadOnly);
        let cancellation = CancellationToken::default();
        assert!(
            dispatcher
                .handle_line(
                    r#"{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1}}"#,
                    &cancellation,
                )
                .is_none()
        );
        assert!(cancellation.is_cancelled());
    }

    fn dispatcher(mode: AgentMode, risk: RiskClass) -> McpDispatcher {
        let mut host = ToolHost::default();
        host.register(
            ToolDescriptor {
                name: "fixture".to_owned(),
                description: "Fixture tool".to_owned(),
                input_schema: serde_json::json!({"type":"object"}),
                risk,
                transport: ToolTransport::Native,
            },
            Arc::new(FixtureHandler),
        )
        .expect("fixture registration succeeds");
        McpDispatcher::new(host, Arc::new(DenyAllApprovals), mode, "test")
    }

    fn response(encoded: &[u8]) -> serde_json::Value {
        serde_json::from_slice(encoded).expect("response is valid JSON")
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
}
