//! Newline-delimited JSON-RPC wire types for the public Harness SDK protocol.

use std::path::Path;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const JSON_RPC_VERSION: &str = "2.0";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams<'a> {
    pub cwd: &'a Path,
    pub provider: &'a str,
    pub model: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPromptParams<'a> {
    pub session_id: &'a str,
    pub content_blocks: [TextContent<'a>; 1],
}

impl<'a> SessionPromptParams<'a> {
    #[must_use]
    pub const fn text(session_id: &'a str, text: &'a str) -> Self {
        Self {
            session_id,
            content_blocks: [TextContent { kind: "text", text }],
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct TextContent<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    text: &'a str,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(default)]
    pub data: Option<Value>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Response {
    pub id: Value,
    pub result: Option<Value>,
    pub error: Option<JsonRpcError>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Notification {
    pub method: String,
    pub params: Value,
}

/// Redacted state safe to send through the bounded terminal activity channel.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HarnessActivity {
    RequestAccepted,
    ResponseDelta {
        text: String,
    },
    /// Model reasoning, displayed separately from the answer.
    ReasoningDelta {
        text: String,
    },
    /// The text streamed since the last tool round was a draft; a revised
    /// attempt follows.
    ResponseRevised,
    /// The streamed answer was corrected after checks; `text` replaces it.
    ResponseCorrected {
        text: String,
    },
    Usage {
        input_tokens: u64,
        output_tokens: u64,
    },
    Status {
        state: String,
    },
    ToolStarted {
        name: String,
        detail: Option<String>,
    },
    ApprovalRequired {
        name: String,
    },
    ToolOutput {
        name: String,
        bytes: Option<u64>,
        content: Option<String>,
    },
    ToolFinished {
        name: String,
        success: bool,
    },
    FileChanged {
        path: String,
        additions: u64,
        deletions: u64,
    },
    Completed {
        reason: String,
    },
    Failed {
        reason: String,
    },
    Cancelled,
    Progress {
        label: String,
    },
}

impl Notification {
    /// Projects provider-shaped data into bounded labels without tool
    /// arguments, output contents, or credentials.
    #[must_use]
    pub fn activity(&self) -> Option<HarnessActivity> {
        if self.method == "session.status" {
            let state = self.params.get("status")?.as_str().and_then(safe_label)?;
            return Some(HarnessActivity::Status { state });
        }
        if self.method != "session.event" {
            return None;
        }
        let event = self.params.get("event")?;
        let event_type = event.get("type")?.as_str()?;
        let data = event.get("data").unwrap_or(&Value::Null);
        let name = tool_name(data);
        match event_type {
            "agent/inbox/spliced" => Some(HarnessActivity::RequestAccepted),
            "tool/start" | "tool/call" | "tool/requested" => {
                Some(HarnessActivity::ToolStarted { name, detail: None })
            }
            "approval/requested" | "tool/approval" => {
                Some(HarnessActivity::ApprovalRequired { name })
            }
            "tool/output" | "tool/result" => Some(HarnessActivity::ToolOutput {
                name,
                bytes: data.get("outputBytes").and_then(Value::as_u64),
                content: None,
            }),
            "tool/end" | "tool/completed" => Some(HarnessActivity::ToolFinished {
                name,
                success: data.get("success").and_then(Value::as_bool).unwrap_or(true),
            }),
            "turn/end" => Some(turn_end_activity(data)),
            "assistant/message" => None,
            other => safe_label(other).map(|label| HarnessActivity::Progress { label }),
        }
    }
}

fn turn_end_activity(data: &Value) -> HarnessActivity {
    let kind = data
        .pointer("/reason/kind")
        .and_then(Value::as_str)
        .and_then(safe_label)
        .unwrap_or_else(|| "completed".to_owned());
    match kind.as_str() {
        "cancelled" | "canceled" => HarnessActivity::Cancelled,
        "failed" | "error" => HarnessActivity::Failed {
            reason: failure_summary(data),
        },
        _ => HarnessActivity::Completed { reason: kind },
    }
}

fn failure_summary(data: &Value) -> String {
    let code = data
        .pointer("/reason/error/code")
        .and_then(Value::as_str)
        .and_then(safe_label)
        .unwrap_or_else(|| "error".to_owned());
    let message = data
        .pointer("/reason/error/message")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let detail = if message.contains("maximum tokens") || message.contains("max tokens") {
        Some("output token limit exceeded")
    } else if message.contains("unauthorized") || message.contains("authentication") {
        Some("provider authentication failed")
    } else if message.contains("rate limit") || message.contains("too many requests") {
        Some("provider rate limit reached")
    } else {
        None
    };
    match detail {
        Some(detail) => format!("{code} · {detail}"),
        None => code,
    }
}

fn tool_name(data: &Value) -> String {
    data.get("toolName")
        .or_else(|| data.get("name"))
        .or_else(|| data.pointer("/tool/name"))
        .and_then(Value::as_str)
        .and_then(safe_label)
        .unwrap_or_else(|| "tool".to_owned())
}

fn safe_label(value: &str) -> Option<String> {
    let label = value
        .chars()
        .filter_map(|character| match character {
            '/' | '-' | '_' | '.' => Some(' '),
            character if character.is_ascii_alphanumeric() || character == ' ' => Some(character),
            _ => None,
        })
        .take(64)
        .collect::<String>();
    (!label.trim().is_empty()).then(|| label.trim().to_owned())
}

#[derive(Clone, Debug, PartialEq)]
pub enum IncomingFrame {
    Response(Response),
    Notification(Notification),
}

impl IncomingFrame {
    /// Parses one complete JSON-RPC line from Harness stdout.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid JSON-RPC versions or unsupported frame
    /// shapes. Callers may ignore malformed lines only within a bounded wait.
    pub fn parse(line: &str) -> Result<Self> {
        let value: Value = serde_json::from_str(line).context("invalid JSON-RPC JSON")?;
        let object = value
            .as_object()
            .context("JSON-RPC frame must be an object")?;
        if object.get("jsonrpc").and_then(Value::as_str) != Some(JSON_RPC_VERSION) {
            bail!("unsupported JSON-RPC version");
        }
        if let Some(id) = object.get("id") {
            let result = object.get("result").cloned();
            let error = object
                .get("error")
                .cloned()
                .map(serde_json::from_value)
                .transpose()
                .context("invalid JSON-RPC error")?;
            if result.is_some() == error.is_some() {
                bail!("JSON-RPC response requires exactly one result or error");
            }
            return Ok(Self::Response(Response {
                id: id.clone(),
                result,
                error,
            }));
        }
        let method = object
            .get("method")
            .and_then(Value::as_str)
            .context("JSON-RPC notification requires a method")?;
        Ok(Self::Notification(Notification {
            method: method.to_owned(),
            params: object.get("params").cloned().unwrap_or(Value::Null),
        }))
    }
}

#[derive(Serialize)]
struct Request<P> {
    jsonrpc: &'static str,
    id: u64,
    method: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<P>,
}

/// Encodes the version-sensitive Harness initialization request.
///
/// # Errors
///
/// Returns an error if a parameter cannot be serialized.
pub fn encode_initialize(id: u64, params: InitializeParams<'_>) -> Result<Vec<u8>> {
    encode_request(id, "initialize", Some(params))
}

/// Encodes one durable session prompt admission request.
///
/// # Errors
///
/// Returns an error if a parameter cannot be serialized.
pub fn encode_session_prompt(id: u64, params: SessionPromptParams<'_>) -> Result<Vec<u8>> {
    encode_request(id, "session/prompt", Some(params))
}

/// Encodes a graceful process shutdown request.
///
/// # Errors
///
/// Returns an error if the request cannot be serialized.
pub fn encode_shutdown(id: u64) -> Result<Vec<u8>> {
    encode_request::<Value>(id, "shutdown", None)
}

fn encode_request<P: Serialize>(
    id: u64,
    method: &'static str,
    params: Option<P>,
) -> Result<Vec<u8>> {
    let request = Request {
        jsonrpc: JSON_RPC_VERSION,
        id,
        method,
        params,
    };
    let mut encoded = serde_json::to_vec(&request).context("failed to encode JSON-RPC request")?;
    encoded.push(b'\n');
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::json;

    use super::{
        HarnessActivity, IncomingFrame, InitializeParams, Notification, SessionPromptParams,
        encode_initialize, encode_session_prompt, encode_shutdown,
    };

    #[test]
    fn initialize_carries_exact_model_effort() {
        let line = encode_initialize(
            1,
            InitializeParams {
                cwd: Path::new("/workspace"),
                provider: "pollinations",
                model: "qwen-coder",
                reasoning_effort: Some("high"),
                max_tokens: Some(4096),
            },
        )
        .expect("request encodes");
        let value: serde_json::Value = serde_json::from_slice(&line).expect("valid JSON");
        assert_eq!(value["method"], "initialize");
        assert_eq!(value["params"]["reasoningEffort"], "high");
        assert_eq!(value["params"]["maxTokens"], 4096);
    }

    #[test]
    fn prompt_uses_one_text_content_block() {
        let line = encode_session_prompt(2, SessionPromptParams::text("session-1", "hello"))
            .expect("request encodes");
        let value: serde_json::Value = serde_json::from_slice(&line).expect("valid JSON");
        assert_eq!(
            value["params"]["contentBlocks"][0],
            json!({"type":"text","text":"hello"})
        );
    }

    #[test]
    fn shutdown_omits_params() {
        let line = encode_shutdown(3).expect("request encodes");
        let value: serde_json::Value = serde_json::from_slice(&line).expect("valid JSON");
        assert!(value.get("params").is_none());
    }

    #[test]
    fn incoming_notifications_and_responses_are_distinct() {
        let notification = IncomingFrame::parse(
            r#"{"jsonrpc":"2.0","method":"session.status","params":{"status":"idle"}}"#,
        )
        .expect("notification parses");
        assert!(matches!(notification, IncomingFrame::Notification(_)));

        let response = IncomingFrame::parse(r#"{"jsonrpc":"2.0","id":1,"result":{}}"#)
            .expect("response parses");
        assert!(matches!(response, IncomingFrame::Response(_)));
    }

    #[test]
    fn invalid_response_shape_is_rejected() {
        assert!(
            IncomingFrame::parse(
                r#"{"jsonrpc":"2.0","id":1,"result":{},"error":{"code":1,"message":"bad"}}"#
            )
            .is_err()
        );
    }

    #[test]
    fn activity_projection_removes_arguments_and_terminal_controls() {
        let notification = Notification {
            method: "session.event".to_owned(),
            params: json!({
                "event": {
                    "type": "tool/start",
                    "data": {
                        "toolName": "shell\u{1b}[31m_run",
                        "arguments": {"command": "secret command"}
                    }
                }
            }),
        };
        assert_eq!(
            notification.activity(),
            Some(HarnessActivity::ToolStarted {
                name: "shell31m run".to_owned(),
                detail: None,
            })
        );
        assert!(!format!("{:?}", notification.activity()).contains("secret command"));
    }

    #[test]
    fn turn_end_states_are_distinct() {
        let notification = Notification {
            method: "session.event".to_owned(),
            params: json!({"event":{"type":"turn/end","data":{"reason":{"kind":"cancelled"}}}}),
        };
        assert_eq!(notification.activity(), Some(HarnessActivity::Cancelled));
    }

    #[test]
    fn failure_activity_is_actionable_without_exposing_provider_text() {
        let notification = Notification {
            method: "session.event".to_owned(),
            params: json!({
                "event": {
                    "type": "turn/end",
                    "data": {
                        "reason": {
                            "kind": "error",
                            "error": {
                                "code": "INVALID_REQUEST",
                                "message": "maximum tokens exceeded; credential sk-secret"
                            }
                        }
                    }
                }
            }),
        };
        assert_eq!(
            notification.activity(),
            Some(HarnessActivity::Failed {
                reason: "INVALID REQUEST · output token limit exceeded".to_owned()
            })
        );
        assert!(!format!("{:?}", notification.activity()).contains("sk-secret"));
    }
}
