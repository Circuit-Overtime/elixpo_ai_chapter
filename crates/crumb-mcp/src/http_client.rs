use std::collections::BTreeSet;
use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use crumb_agent::{
    CancellationToken, CredentialReference, McpServer, McpTransport, RiskClass, ToolDescriptor,
    ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use crumb_auth::SecretString;
use reqwest::blocking::{Client, Response};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue};
use serde_json::{Value, json};

use crate::client::{
    DiscoveredTool, McpDiagnostic, parse_tool, parse_tool_output, redacted_error,
    validate_component,
};

const PROTOCOL_VERSION: &str = "2025-11-25";
const SESSION_HEADER: &str = "mcp-session-id";

#[derive(Clone, Copy, Debug)]
pub struct StreamableHttpLimits {
    pub startup_timeout: Duration,
    pub request_timeout: Duration,
    pub max_response_bytes: usize,
    pub max_tools: usize,
}

impl Default for StreamableHttpLimits {
    fn default() -> Self {
        Self {
            startup_timeout: Duration::from_secs(10),
            request_timeout: Duration::from_secs(30),
            max_response_bytes: 1024 * 1024,
            max_tools: 128,
        }
    }
}

/// Registers enabled Streamable HTTP MCP servers. Credential resolution is
/// supplied by the caller so this transport never reads or persists secrets.
pub fn register_streamable_http_servers<F>(
    host: &mut ToolHost,
    servers: &[McpServer],
    limits: StreamableHttpLimits,
    mut resolve_credential: F,
) -> Vec<McpDiagnostic>
where
    F: FnMut(&CredentialReference) -> Result<SecretString>,
{
    let mut diagnostics = Vec::new();
    for server in servers
        .iter()
        .filter(|server| server.enabled && server.transport == McpTransport::StreamableHttp)
    {
        let credential = match server
            .credential
            .as_ref()
            .map(&mut resolve_credential)
            .transpose()
        {
            Ok(value) => value,
            Err(error) => {
                diagnostics.push(McpDiagnostic {
                    server_id: server.id.clone(),
                    message: redacted_error(&error),
                });
                continue;
            }
        };
        if let Err(error) = register_server(host, server, credential, limits) {
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
    credential: Option<SecretString>,
    limits: StreamableHttpLimits,
) -> Result<()> {
    validate_component(&server.id, "server ID")?;
    let endpoint = server
        .url
        .as_deref()
        .context("external MCP HTTP URL is missing")?;
    let client = Arc::new(StreamableHttpClient::connect(endpoint, credential, limits)?);
    let tools = client.discover()?;
    let mut names = BTreeSet::new();
    for tool in &tools {
        let namespaced = format!("mcp__{}__{}", server.id, tool.name);
        if !names.insert(namespaced.clone()) || host.descriptor(&namespaced).is_some() {
            bail!("external MCP tool namespace collision");
        }
    }
    for tool in tools {
        register_tool(host, server, &client, tool)?;
    }
    Ok(())
}

fn register_tool(
    host: &mut ToolHost,
    server: &McpServer,
    client: &Arc<StreamableHttpClient>,
    tool: DiscoveredTool,
) -> Result<()> {
    let namespaced = format!("mcp__{}__{}", server.id, tool.name);
    host.register(
        ToolDescriptor {
            name: namespaced,
            description: tool.description,
            input_schema: tool.input_schema,
            risk: RiskClass::NetworkAccess,
            transport: ToolTransport::Mcp {
                server_id: server.id.clone(),
            },
        },
        Arc::new(HttpToolHandler {
            client: Arc::clone(client),
            remote_name: tool.name,
        }),
    )
}

struct StreamableHttpClient {
    client: Client,
    endpoint: String,
    credential: Option<Arc<SecretString>>,
    session_id: Mutex<Option<String>>,
    request_lock: Mutex<()>,
    next_id: AtomicU64,
    limits: StreamableHttpLimits,
}

impl StreamableHttpClient {
    fn connect(
        endpoint: &str,
        credential: Option<SecretString>,
        limits: StreamableHttpLimits,
    ) -> Result<Self> {
        if limits.max_response_bytes == 0 || limits.max_tools == 0 {
            bail!("MCP limits must be positive");
        }
        let client = Client::builder()
            .connect_timeout(limits.startup_timeout)
            .timeout(limits.request_timeout)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .context("external MCP HTTP client is unavailable")?;
        let result = Self {
            client,
            endpoint: endpoint.to_owned(),
            credential: credential.map(Arc::new),
            session_id: Mutex::new(None),
            request_lock: Mutex::new(()),
            next_id: AtomicU64::new(1),
            limits,
        };
        result.initialize()?;
        Ok(result)
    }

    fn initialize(&self) -> Result<()> {
        let result = self.request(
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
        self.notification("notifications/initialized", &json!({}))
    }

    fn discover(&self) -> Result<Vec<DiscoveredTool>> {
        let result = self.request(
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
        let result = self.request(
            "tools/call",
            &json!({"name": name, "arguments": arguments}),
            self.limits.request_timeout,
            cancellation,
        )?;
        parse_tool_output(&result, self.limits.max_response_bytes)
    }

    fn request(
        &self,
        method: &str,
        params: &Value,
        timeout: Duration,
        cancellation: &CancellationToken,
    ) -> Result<Value> {
        let _guard = self
            .request_lock
            .lock()
            .map_err(|_| anyhow!("external MCP HTTP request state is unavailable"))?;
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let message = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        let retry_safe = matches!(method, "initialize" | "tools/list");
        let (response, session_id) =
            self.send(&message, Some(id), timeout, cancellation, retry_safe)?;
        self.update_session(session_id)?;
        if response.get("error").is_some() {
            bail!("external MCP request failed");
        }
        response
            .get("result")
            .cloned()
            .context("external MCP response has no result")
    }

    fn notification(&self, method: &str, params: &Value) -> Result<()> {
        let message = json!({"jsonrpc":"2.0","method":method,"params":params});
        let (_, session_id) = self.send(
            &message,
            None,
            self.limits.startup_timeout,
            &CancellationToken::default(),
            true,
        )?;
        self.update_session(session_id)
    }

    fn send(
        &self,
        message: &Value,
        expected_id: Option<u64>,
        timeout: Duration,
        cancellation: &CancellationToken,
        retry_safe: bool,
    ) -> Result<(Value, Option<String>)> {
        let encoded = serde_json::to_vec(message)?;
        if encoded.len() > self.limits.max_response_bytes {
            bail!("external MCP request exceeded the byte limit");
        }
        let client = self.client.clone();
        let endpoint = self.endpoint.clone();
        let credential = self.credential.clone();
        let session_id = self
            .session_id
            .lock()
            .map_err(|_| anyhow!("external MCP HTTP session state is unavailable"))?
            .clone();
        let maximum = self.limits.max_response_bytes;
        let (sender, receiver) = mpsc::sync_channel(1);
        thread::Builder::new()
            .name("crumb-mcp-http".to_owned())
            .spawn(move || {
                let request = HttpRequest {
                    encoded,
                    expected_id,
                    retry_safe,
                };
                let result = perform_request(
                    &client,
                    &endpoint,
                    credential.as_deref(),
                    session_id.as_deref(),
                    maximum,
                    &request,
                );
                let _ = sender.send(result);
            })
            .context("failed to start external MCP HTTP request")?;
        let deadline = Instant::now() + timeout;
        loop {
            if cancellation.is_cancelled() {
                bail!("external MCP request cancelled");
            }
            let now = Instant::now();
            if now >= deadline {
                bail!("external MCP request timed out");
            }
            match receiver.recv_timeout(
                deadline
                    .saturating_duration_since(now)
                    .min(Duration::from_millis(25)),
            ) {
                Ok(result) => return result,
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => {
                    bail!("external MCP HTTP request failed");
                }
            }
        }
    }

    fn update_session(&self, session_id: Option<String>) -> Result<()> {
        if let Some(session_id) = session_id {
            *self
                .session_id
                .lock()
                .map_err(|_| anyhow!("external MCP HTTP session state is unavailable"))? =
                Some(session_id);
        }
        Ok(())
    }
}

struct HttpRequest {
    encoded: Vec<u8>,
    expected_id: Option<u64>,
    retry_safe: bool,
}

fn perform_request(
    client: &Client,
    endpoint: &str,
    credential: Option<&SecretString>,
    session_id: Option<&str>,
    maximum: usize,
    request: &HttpRequest,
) -> Result<(Value, Option<String>)> {
    let mut headers = HeaderMap::new();
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/json, text/event-stream"),
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        "mcp-protocol-version",
        HeaderValue::from_static(PROTOCOL_VERSION),
    );
    if let Some(session_id) = session_id {
        headers.insert(
            SESSION_HEADER,
            HeaderValue::from_str(session_id).context("external MCP session ID is invalid")?,
        );
    }
    if let Some(credential) = credential {
        let mut value = HeaderValue::from_str(&format!("Bearer {}", credential.expose()))
            .context("external MCP credential is invalid")?;
        value.set_sensitive(true);
        headers.insert(AUTHORIZATION, value);
    }
    let send = || {
        client
            .post(endpoint)
            .headers(headers.clone())
            .body(request.encoded.clone())
            .send()
    };
    let response = match send() {
        Ok(response) => response,
        Err(_) if request.retry_safe => send().map_err(|error| sanitized_http_error(&error))?,
        Err(error) => return Err(sanitized_http_error(&error)),
    };
    let session_id = response
        .headers()
        .get(SESSION_HEADER)
        .map(|value| value.to_str().map(str::to_owned))
        .transpose()
        .context("external MCP session ID is invalid")?;
    if request.expected_id.is_none() {
        if response.status().is_success() {
            return Ok((Value::Null, session_id));
        }
        bail!("external MCP HTTP request failed");
    }
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let response = response
        .error_for_status()
        .context("external MCP HTTP request failed")?;
    let body = read_bounded(response, maximum)?;
    let value = if content_type.starts_with("text/event-stream") {
        parse_sse(&body, request.expected_id.expect("checked above"))?
    } else {
        serde_json::from_slice(&body).context("external MCP returned malformed JSON")?
    };
    if value.get("id").and_then(Value::as_u64) != request.expected_id {
        bail!("external MCP response ID is invalid");
    }
    Ok((value, session_id))
}

fn sanitized_http_error(error: &reqwest::Error) -> anyhow::Error {
    if error.is_timeout() {
        anyhow!("external MCP request timed out")
    } else {
        anyhow!("external MCP HTTP request failed")
    }
}

fn read_bounded(response: Response, maximum: usize) -> Result<Vec<u8>> {
    let limit = u64::try_from(maximum).unwrap_or(u64::MAX).saturating_add(1);
    let mut body = Vec::new();
    response
        .take(limit)
        .read_to_end(&mut body)
        .context("external MCP HTTP response failed")?;
    if body.len() > maximum {
        bail!("external MCP response exceeded the byte limit");
    }
    Ok(body)
}

fn parse_sse(body: &[u8], expected_id: u64) -> Result<Value> {
    let text = std::str::from_utf8(body).context("external MCP SSE response is malformed")?;
    for line in text.lines() {
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let value: Value =
            serde_json::from_str(data.trim()).context("external MCP SSE response is malformed")?;
        if value.get("id").and_then(Value::as_u64) == Some(expected_id) {
            return Ok(value);
        }
    }
    bail!("external MCP SSE response is malformed")
}

struct HttpToolHandler {
    client: Arc<StreamableHttpClient>,
    remote_name: String,
}

impl ToolHandler for HttpToolHandler {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        self.client.call(&self.remote_name, arguments, cancellation)
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    use crumb_agent::{AgentMode, ConfiguredApprovals, DenyAllApprovals};

    use super::*;

    struct Fixture {
        url: String,
        calls: Arc<AtomicUsize>,
        stopped: Arc<AtomicBool>,
        worker: Option<thread::JoinHandle<()>>,
    }

    impl Fixture {
        fn start(delay: Duration, malformed_list: bool) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("fixture listener");
            listener.set_nonblocking(true).expect("fixture nonblocking");
            let address = listener.local_addr().expect("fixture address");
            let calls = Arc::new(AtomicUsize::new(0));
            let stopped = Arc::new(AtomicBool::new(false));
            let worker_calls = Arc::clone(&calls);
            let worker_stopped = Arc::clone(&stopped);
            let worker = thread::spawn(move || {
                while !worker_stopped.load(Ordering::Acquire) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            handle_request(&mut stream, &worker_calls, delay, malformed_list);
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(2));
                        }
                        Err(_) => break,
                    }
                }
            });
            Self {
                url: format!("http://{address}/mcp"),
                calls,
                stopped,
                worker: Some(worker),
            }
        }

        fn server(&self) -> McpServer {
            McpServer {
                id: "remote".to_owned(),
                transport: McpTransport::StreamableHttp,
                command: std::path::PathBuf::new(),
                arguments: Vec::new(),
                url: Some(self.url.clone()),
                credential: None,
                enabled: true,
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            self.stopped.store(true, Ordering::Release);
            let _ = TcpStream::connect(
                self.url
                    .trim_start_matches("http://")
                    .trim_end_matches("/mcp"),
            );
            if let Some(worker) = self.worker.take() {
                let _ = worker.join();
            }
        }
    }

    fn handle_request(
        stream: &mut TcpStream,
        calls: &AtomicUsize,
        delay: Duration,
        malformed_list: bool,
    ) {
        let Some(body) = read_http_body(stream) else {
            return;
        };
        let Ok(message) = serde_json::from_slice::<Value>(&body) else {
            return;
        };
        let method = message.get("method").and_then(Value::as_str).unwrap_or("");
        if method == "notifications/initialized" {
            let _ = stream.write_all(
                b"HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            );
            return;
        }
        let id = message.get("id").cloned().unwrap_or(Value::Null);
        let payload = match method {
            "initialize" => json!({
                "jsonrpc":"2.0", "id":id,
                "result":{"protocolVersion":PROTOCOL_VERSION,"capabilities":{"tools":{}},"serverInfo":{"name":"fixture","version":"1"}}
            }),
            "tools/list" if malformed_list => {
                let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 1\r\nConnection: close\r\n\r\n{");
                let _ = stream.flush();
                let _ = stream.shutdown(std::net::Shutdown::Write);
                return;
            }
            "tools/list" => json!({
                "jsonrpc":"2.0", "id":id,
                "result":{"tools":[{"name":"echo","description":"fixture","inputSchema":{"type":"object"}}]}
            }),
            "tools/call" => {
                thread::sleep(delay);
                calls.fetch_add(1, Ordering::Relaxed);
                json!({"jsonrpc":"2.0","id":id,"result":{"content":[{"type":"text","text":"called"}],"isError":false}})
            }
            _ => return,
        };
        let encoded = serde_json::to_vec(&payload).expect("fixture JSON");
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nMcp-Session-Id: fixture-session\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            encoded.len()
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.write_all(&encoded);
    }

    fn read_http_body(stream: &mut TcpStream) -> Option<Vec<u8>> {
        stream.set_read_timeout(Some(Duration::from_secs(1))).ok()?;
        let mut request = Vec::new();
        let mut byte = [0_u8; 1];
        while !request.ends_with(b"\r\n\r\n") {
            stream.read_exact(&mut byte).ok()?;
            request.push(byte[0]);
            if request.len() > 16 * 1024 {
                return None;
            }
        }
        let headers = std::str::from_utf8(&request).ok()?;
        let length = headers.lines().find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })?;
        let mut body = vec![0; length];
        stream.read_exact(&mut body).ok()?;
        Some(body)
    }

    #[test]
    fn remote_calls_are_discovered_and_denied_before_network() {
        let fixture = Fixture::start(Duration::ZERO, false);
        let mut host = ToolHost::default();
        let diagnostics = register_streamable_http_servers(
            &mut host,
            &[fixture.server()],
            StreamableHttpLimits::default(),
            |_| unreachable!("fixture has no credential"),
        );
        assert_eq!(diagnostics, []);
        assert_eq!(
            host.descriptor("mcp__remote__echo")
                .expect("remote descriptor")
                .risk,
            RiskClass::NetworkAccess
        );
        assert!(
            host.call(
                "mcp__remote__echo",
                &json!({}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
            )
            .is_err()
        );
        assert_eq!(fixture.calls.load(Ordering::Relaxed), 0);

        let approvals = ConfiguredApprovals::default()
            .with_mcp_tools(["mcp__remote__echo".to_owned()].into_iter().collect());
        let output = host
            .call(
                "mcp__remote__echo",
                &json!({}),
                AgentMode::Auto,
                &approvals,
                &CancellationToken::default(),
            )
            .expect("approved remote call");
        assert_eq!(output.text, "called");
        assert_eq!(fixture.calls.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn malformed_remote_servers_are_isolated() {
        let fixture = Fixture::start(Duration::ZERO, true);
        let mut host = ToolHost::default();
        let diagnostics = register_streamable_http_servers(
            &mut host,
            &[fixture.server()],
            StreamableHttpLimits::default(),
            |_| unreachable!("fixture has no credential"),
        );
        assert_eq!(diagnostics.len(), 1);
        assert!(diagnostics[0].message.contains("malformed"));
        assert!(host.descriptor("mcp__remote__echo").is_none());
    }

    #[test]
    fn timeouts_and_credentials_are_redacted() {
        let fixture = Fixture::start(Duration::from_millis(100), false);
        let client = StreamableHttpClient::connect(
            &fixture.url,
            None,
            StreamableHttpLimits {
                startup_timeout: Duration::from_secs(1),
                request_timeout: Duration::from_millis(20),
                ..StreamableHttpLimits::default()
            },
        )
        .expect("client connects");
        let error = client
            .call("echo", &json!({}), &CancellationToken::default())
            .expect_err("slow remote call times out");
        assert!(error.to_string().contains("timed out"));

        let mut host = ToolHost::default();
        let mut credential_server = fixture.server();
        credential_server.credential = Some(CredentialReference::Environment {
            name: "FIXTURE_SECRET".to_owned(),
        });
        let diagnostics = register_streamable_http_servers(
            &mut host,
            &[credential_server],
            StreamableHttpLimits::default(),
            |_| bail!("credential super-secret-value is missing"),
        );
        assert_eq!(diagnostics.len(), 1);
        assert!(!diagnostics[0].message.contains("super-secret-value"));
    }

    #[test]
    fn active_remote_calls_can_be_cancelled() {
        let fixture = Fixture::start(Duration::from_secs(2), false);
        let client =
            StreamableHttpClient::connect(&fixture.url, None, StreamableHttpLimits::default())
                .expect("client connects");
        let cancellation = CancellationToken::default();
        let trigger = cancellation.clone();
        let worker = thread::spawn(move || {
            thread::sleep(Duration::from_millis(10));
            trigger.cancel();
        });
        let started = Instant::now();
        let error = client
            .call("echo", &json!({}), &cancellation)
            .expect_err("remote call is cancelled");
        worker.join().expect("cancellation worker");
        assert!(error.to_string().contains("cancelled"));
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn sse_responses_select_the_matching_json_rpc_event() {
        let body = b"event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":7,\"result\":{}}\n\n";
        assert_eq!(
            parse_sse(body, 7).expect("valid SSE response")["id"],
            json!(7)
        );
    }
}
