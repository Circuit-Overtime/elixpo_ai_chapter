use base64::Engine as _;
use crumb_llm::{
    ChatEvent, ChatRequest, ChatRole, EmbeddingRequest, EmbeddingResponse, FinishReason,
    ModelCapability, ModelInfo, ProviderError, ProviderErrorKind, ProviderResult, TokenUsage,
    ToolCall, ToolChoice, ToolDefinition,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Serialize)]
pub(crate) struct ChatCompletionRequest<'a> {
    model: &'a str,
    messages: Vec<ChatCompletionMessage<'a>>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<ChatTool<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<&'static str>,
    stream_options: StreamOptions,
}

impl<'a> From<&'a ChatRequest> for ChatCompletionRequest<'a> {
    fn from(request: &'a ChatRequest) -> Self {
        let prompt_cache_supported =
            supports_prompt_cache(&request.model, request.tools.is_empty());
        let cacheable_user_messages = if prompt_cache_supported {
            request
                .messages
                .iter()
                .enumerate()
                .rev()
                .filter_map(|(index, message)| (message.role == ChatRole::User).then_some(index))
                .take(2)
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        Self {
            model: &request.model,
            messages: request
                .messages
                .iter()
                .enumerate()
                .map(|(index, message)| {
                    ChatCompletionMessage::new(
                        message,
                        prompt_cache_supported
                            && ((index < 2 && message.role == ChatRole::System)
                                || cacheable_user_messages.contains(&index)),
                    )
                })
                .collect(),
            stream: true,
            max_tokens: request.max_output_tokens,
            tools: request.tools.iter().map(ChatTool::from).collect(),
            tool_choice: (!request.tools.is_empty()).then(|| tool_choice_name(request.tool_choice)),
            stream_options: StreamOptions {
                include_usage: true,
            },
        }
    }
}

#[derive(Debug, Serialize)]
struct ChatCompletionMessage<'a> {
    role: &'static str,
    content: ChatCompletionContent<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tool_calls: Vec<AssistantToolCall<'a>>,
}

impl<'a> ChatCompletionMessage<'a> {
    fn new(message: &'a crumb_llm::ChatMessage, cacheable: bool) -> Self {
        Self {
            role: role_name(message.role),
            content: if !message.images.is_empty() {
                let mut parts = vec![ChatContentBlock::Text {
                    text: &message.content,
                }];
                parts.extend(
                    message
                        .images
                        .iter()
                        .map(|image| ChatContentBlock::ImageUrl {
                            image_url: ImageUrl {
                                url: format!(
                                    "data:{};base64,{}",
                                    image.media_type,
                                    base64::engine::general_purpose::STANDARD.encode(&image.data)
                                ),
                            },
                        }),
                );
                ChatCompletionContent::Parts(parts)
            } else if cacheable {
                ChatCompletionContent::Cached([CachedTextBlock {
                    kind: "text",
                    text: &message.content,
                    cache_control: CacheControl { kind: "ephemeral" },
                }])
            } else {
                ChatCompletionContent::Text(&message.content)
            },
            tool_call_id: message.tool_call_id.as_deref(),
            tool_calls: message
                .tool_calls
                .iter()
                .map(AssistantToolCall::from)
                .collect(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum ChatCompletionContent<'a> {
    Text(&'a str),
    Cached([CachedTextBlock<'a>; 1]),
    Parts(Vec<ChatContentBlock<'a>>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ChatContentBlock<'a> {
    Text { text: &'a str },
    ImageUrl { image_url: ImageUrl },
}

#[derive(Debug, Serialize)]
struct ImageUrl {
    url: String,
}

#[derive(Debug, Serialize)]
struct CachedTextBlock<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    text: &'a str,
    cache_control: CacheControl,
}

#[derive(Debug, Serialize)]
struct CacheControl {
    #[serde(rename = "type")]
    kind: &'static str,
}

fn supports_prompt_cache(model: &str, tools_empty: bool) -> bool {
    let model = model
        .rsplit('/')
        .next()
        .unwrap_or(model)
        .to_ascii_lowercase();
    matches!(model.as_str(), "nova" | "nova-fast")
        || model.starts_with("claude")
        || (tools_empty && model.starts_with("gemini"))
}

#[derive(Debug, Serialize)]
struct ChatTool<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    function: ChatFunction<'a>,
}

impl<'a> From<&'a ToolDefinition> for ChatTool<'a> {
    fn from(tool: &'a ToolDefinition) -> Self {
        Self {
            kind: "function",
            function: ChatFunction {
                name: &tool.name,
                description: &tool.description,
                parameters: &tool.input_schema,
            },
        }
    }
}

#[derive(Debug, Serialize)]
struct ChatFunction<'a> {
    name: &'a str,
    description: &'a str,
    parameters: &'a serde_json::Value,
}

#[derive(Debug, Serialize)]
struct AssistantToolCall<'a> {
    id: &'a str,
    #[serde(rename = "type")]
    kind: &'static str,
    function: AssistantFunction<'a>,
}

impl<'a> From<&'a ToolCall> for AssistantToolCall<'a> {
    fn from(call: &'a ToolCall) -> Self {
        Self {
            id: &call.id,
            kind: "function",
            function: AssistantFunction {
                name: &call.name,
                arguments: call.arguments.to_string(),
            },
        }
    }
}

#[derive(Debug, Serialize)]
struct AssistantFunction<'a> {
    name: &'a str,
    arguments: String,
}

#[derive(Debug, Serialize)]
struct StreamOptions {
    include_usage: bool,
}

const fn role_name(role: ChatRole) -> &'static str {
    match role {
        ChatRole::System => "system",
        ChatRole::User => "user",
        ChatRole::Assistant => "assistant",
        ChatRole::Tool => "tool",
    }
}

const fn tool_choice_name(choice: ToolChoice) -> &'static str {
    match choice {
        ToolChoice::Auto => "auto",
        ToolChoice::None => "none",
        ToolChoice::Required => "required",
    }
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChunk {
    #[serde(default)]
    choices: Vec<ChatChoice>,
    usage: Option<WireUsage>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    #[serde(default)]
    delta: ChatDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ChatDelta {
    content: Option<String>,
    /// Reasoning text; OpenAI-compatible servers use either field name.
    #[serde(alias = "reasoning")]
    reasoning_content: Option<String>,
    #[serde(default)]
    tool_calls: Vec<ToolCallDelta>,
}

#[derive(Debug, Deserialize)]
struct ToolCallDelta {
    index: usize,
    id: Option<String>,
    function: Option<FunctionDelta>,
}

#[derive(Debug, Deserialize)]
struct FunctionDelta {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Debug, Default)]
struct PendingToolCall {
    id: Option<String>,
    name: String,
    arguments: String,
}

#[derive(Debug, Deserialize)]
struct WireUsage {
    prompt_tokens: u64,
    completion_tokens: u64,
    #[serde(default)]
    prompt_tokens_details: Option<WirePromptTokenDetails>,
}

#[derive(Debug, Default, Deserialize)]
struct WirePromptTokenDetails {
    #[serde(default)]
    cached_tokens: u64,
}

#[derive(Debug, Serialize)]
pub(crate) struct WireEmbeddingRequest<'a> {
    model: &'a str,
    input: &'a [String],
    #[serde(skip_serializing_if = "Option::is_none")]
    dimensions: Option<u32>,
}

impl<'a> From<&'a EmbeddingRequest> for WireEmbeddingRequest<'a> {
    fn from(request: &'a EmbeddingRequest) -> Self {
        Self {
            model: &request.model,
            input: &request.input,
            dimensions: request.dimensions,
        }
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct WireEmbeddingResponse {
    data: Vec<WireEmbedding>,
    usage: WireEmbeddingUsage,
}

#[derive(Debug, Deserialize)]
struct WireEmbedding {
    embedding: Vec<f32>,
    index: usize,
}

#[derive(Debug, Deserialize)]
struct WireEmbeddingUsage {
    prompt_tokens: u64,
}

impl From<WireEmbeddingResponse> for EmbeddingResponse {
    fn from(mut response: WireEmbeddingResponse) -> Self {
        response.data.sort_by_key(|item| item.index);
        Self {
            vectors: response
                .data
                .into_iter()
                .map(|item| item.embedding)
                .collect(),
            usage: TokenUsage {
                input_tokens: response.usage.prompt_tokens,
                cached_input_tokens: 0,
                output_tokens: 0,
            },
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub(crate) enum TextModelsResponse {
    Models(Vec<WireModel>),
    Wrapped { data: Vec<WireModel> },
}

impl TextModelsResponse {
    pub(crate) fn into_models(self) -> Vec<ModelInfo> {
        let models = match self {
            Self::Models(models) | Self::Wrapped { data: models } => models,
        };
        models.into_iter().map(WireModel::into_model).collect()
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct WireModel {
    #[serde(alias = "name")]
    id: String,
    #[serde(default, alias = "displayName")]
    display_name: Option<String>,
    #[serde(default, alias = "contextLength")]
    context_window: Option<u64>,
    #[serde(default)]
    capabilities: serde_json::Value,
    #[serde(default, alias = "inputModalities")]
    input_modalities: Vec<String>,
}

impl WireModel {
    fn into_model(self) -> ModelInfo {
        let mut capabilities = vec![ModelCapability::Chat, ModelCapability::Streaming];
        if capability_enabled(&self.capabilities, "tool_calling") {
            capabilities.push(ModelCapability::Tools);
        }
        if self
            .input_modalities
            .iter()
            .any(|modality| modality == "image")
        {
            capabilities.push(ModelCapability::Vision);
        }
        ModelInfo {
            display_name: self.display_name.unwrap_or_else(|| self.id.clone()),
            id: self.id,
            capabilities,
            context_window: self.context_window,
        }
    }
}

fn capability_enabled(capabilities: &serde_json::Value, name: &str) -> bool {
    match capabilities {
        serde_json::Value::Array(values) => values.iter().any(|value| value == name),
        serde_json::Value::Object(values) => {
            values.get(name).and_then(serde_json::Value::as_bool) == Some(true)
        }
        _ => false,
    }
}

/// Incremental decoder for OpenAI-compatible server-sent events.
#[derive(Debug, Default)]
pub(crate) struct SseDecoder {
    pending: Vec<u8>,
    done: bool,
    finish_reason: Option<FinishReason>,
    tool_calls: BTreeMap<usize, PendingToolCall>,
}

impl SseDecoder {
    pub(crate) fn push(&mut self, bytes: &[u8]) -> ProviderResult<Vec<ChatEvent>> {
        if self.done && !bytes.is_empty() {
            return Err(protocol_error("received data after the stream finished"));
        }
        self.pending.extend_from_slice(bytes);
        let mut events = Vec::new();

        while let Some((end, delimiter_length)) = find_event_boundary(&self.pending) {
            let event = self.pending.drain(..end).collect::<Vec<_>>();
            self.pending.drain(..delimiter_length);
            self.decode_event(&event, &mut events)?;
        }
        Ok(events)
    }

    pub(crate) fn finish(mut self) -> ProviderResult<Vec<ChatEvent>> {
        let mut events = Vec::new();
        if !self.pending.iter().all(u8::is_ascii_whitespace) {
            let pending = std::mem::take(&mut self.pending);
            self.decode_event(&pending, &mut events)?;
        }
        if self.done {
            return Ok(events);
        }
        let Some(reason) = self.finish_reason.take() else {
            return Err(protocol_error(
                "stream ended before a completion marker or finish reason",
            ));
        };
        self.emit_tool_calls(&mut events)?;
        events.push(ChatEvent::Finished(reason));
        Ok(events)
    }

    fn decode_event(&mut self, event: &[u8], output: &mut Vec<ChatEvent>) -> ProviderResult<()> {
        let text = std::str::from_utf8(event)
            .map_err(|_| protocol_error("stream event is not valid UTF-8"))?;
        let data = text
            .lines()
            .filter_map(|line| line.strip_prefix("data:"))
            .map(str::trim_start)
            .collect::<Vec<_>>()
            .join("\n");
        if data.is_empty() {
            return Ok(());
        }
        if data == "[DONE]" {
            self.emit_tool_calls(output)?;
            output.push(ChatEvent::Finished(
                self.finish_reason
                    .take()
                    .unwrap_or_else(|| FinishReason::Other("done".to_owned())),
            ));
            self.done = true;
            return Ok(());
        }

        let chunk: ChatCompletionChunk = serde_json::from_str(&data)
            .map_err(|_| protocol_error("stream contains malformed chat JSON"))?;
        for choice in chunk.choices {
            if let Some(reasoning) = choice.delta.reasoning_content
                && !reasoning.is_empty()
            {
                output.push(ChatEvent::ReasoningDelta(reasoning));
            }
            if let Some(content) = choice.delta.content
                && !content.is_empty()
            {
                output.push(ChatEvent::TextDelta(content));
            }
            for delta in choice.delta.tool_calls {
                let pending = self.tool_calls.entry(delta.index).or_default();
                if let Some(id) = delta.id {
                    pending.id = Some(id);
                }
                if let Some(function) = delta.function {
                    if let Some(name) = function.name {
                        pending.name.push_str(&name);
                    }
                    if let Some(arguments) = function.arguments {
                        pending.arguments.push_str(&arguments);
                    }
                }
            }
            if let Some(reason) = choice.finish_reason {
                self.finish_reason = Some(map_finish_reason(&reason));
            }
        }
        if let Some(usage) = chunk.usage {
            output.push(ChatEvent::Usage(TokenUsage {
                input_tokens: usage.prompt_tokens,
                cached_input_tokens: usage
                    .prompt_tokens_details
                    .map_or(0, |details| details.cached_tokens),
                output_tokens: usage.completion_tokens,
            }));
        }
        Ok(())
    }

    fn emit_tool_calls(&mut self, output: &mut Vec<ChatEvent>) -> ProviderResult<()> {
        for (_, pending) in std::mem::take(&mut self.tool_calls) {
            let id = pending
                .id
                .filter(|value| !value.is_empty())
                .ok_or_else(|| protocol_error("streamed tool call is missing an id"))?;
            if pending.name.is_empty() {
                return Err(protocol_error("streamed tool call is missing a name"));
            }
            // Malformed arguments are the model's mistake, not a broken
            // stream: pass the raw text on so the tool rejects it and the
            // model can retry, instead of failing the whole response.
            let arguments = if pending.arguments.trim().is_empty() {
                serde_json::Value::Object(serde_json::Map::new())
            } else {
                serde_json::from_str(&pending.arguments)
                    .unwrap_or(serde_json::Value::String(pending.arguments))
            };
            output.push(ChatEvent::ToolCall(ToolCall {
                id,
                name: pending.name,
                arguments,
            }));
        }
        Ok(())
    }
}

fn find_event_boundary(bytes: &[u8]) -> Option<(usize, usize)> {
    let lf = bytes.windows(2).position(|window| window == b"\n\n");
    let crlf = bytes.windows(4).position(|window| window == b"\r\n\r\n");
    match (lf, crlf) {
        (Some(left), Some(right)) if left <= right => Some((left, 2)),
        (Some(_) | None, Some(right)) => Some((right, 4)),
        (Some(left), None) => Some((left, 2)),
        (None, None) => None,
    }
}

fn map_finish_reason(reason: &str) -> FinishReason {
    match reason {
        "stop" => FinishReason::Stop,
        "length" => FinishReason::Length,
        "tool_calls" | "function_call" => FinishReason::ToolCall,
        other => FinishReason::Other(other.to_owned()),
    }
}

fn protocol_error(message: &'static str) -> ProviderError {
    ProviderError::new(ProviderErrorKind::Protocol, message, false)
}

#[cfg(test)]
mod tests {
    use crumb_llm::{
        ChatEvent, ChatMessage, ChatRequest, ChatRole, FinishReason, ImageInput, ProviderErrorKind,
        TokenUsage, ToolChoice, ToolDefinition,
    };

    use super::{ChatCompletionRequest, SseDecoder};

    #[test]
    fn chat_request_uses_openai_roles_and_streaming() {
        let request = ChatRequest {
            model: "openai".to_owned(),
            messages: vec![ChatMessage::text(ChatRole::User, "hello")],
            tools: Vec::new(),
            tool_choice: ToolChoice::None,
            max_output_tokens: Some(64),
        };

        let json = serde_json::to_value(ChatCompletionRequest::from(&request))
            .expect("request should serialize");

        assert_eq!(json["model"], "openai");
        assert_eq!(json["messages"][0]["role"], "user");
        assert_eq!(json["messages"][0]["content"], "hello");
        assert_eq!(json["stream"], true);
        assert_eq!(json["stream_options"]["include_usage"], true);
        assert_eq!(json["max_tokens"], 64);
        assert!(json.get("tools").is_none());
        assert!(json.get("tool_choice").is_none());
    }

    #[test]
    fn nova_request_caches_the_system_prefix_and_latest_user_turn() {
        let request = ChatRequest {
            model: "nova-fast".to_owned(),
            messages: vec![
                ChatMessage::text(ChatRole::System, "stable"),
                ChatMessage::text(ChatRole::System, "dynamic"),
                ChatMessage::text(ChatRole::User, "hello"),
            ],
            tools: vec![ToolDefinition {
                name: "run_shell".to_owned(),
                description: "run a bounded command".to_owned(),
                input_schema: serde_json::json!({"type":"object"}),
            }],
            tool_choice: ToolChoice::Auto,
            max_output_tokens: None,
        };

        let json = serde_json::to_value(ChatCompletionRequest::from(&request))
            .expect("request should serialize");

        assert_eq!(json["messages"][0]["content"][0]["type"], "text");
        assert_eq!(json["messages"][0]["content"][0]["text"], "stable");
        assert_eq!(
            json["messages"][0]["content"][0]["cache_control"]["type"],
            "ephemeral"
        );
        assert_eq!(json["messages"][1]["content"][0]["text"], "dynamic");
        assert_eq!(
            json["messages"][1]["content"][0]["cache_control"]["type"],
            "ephemeral"
        );
        assert_eq!(json["messages"][2]["content"][0]["text"], "hello");
        assert_eq!(
            json["messages"][2]["content"][0]["cache_control"]["type"],
            "ephemeral"
        );
        assert_eq!(json["tools"][0]["function"]["name"], "run_shell");
    }

    #[test]
    fn unsupported_model_keeps_plain_string_messages() {
        let request = ChatRequest {
            model: "openai".to_owned(),
            messages: vec![ChatMessage::text(ChatRole::System, "stable")],
            tools: Vec::new(),
            tool_choice: ToolChoice::None,
            max_output_tokens: None,
        };

        let json = serde_json::to_value(ChatCompletionRequest::from(&request))
            .expect("request should serialize");

        assert_eq!(json["messages"][0]["content"], "stable");
    }

    #[test]
    fn vision_request_serializes_text_and_data_url_parts() {
        let request = ChatRequest {
            model: "vision".to_owned(),
            messages: vec![ChatMessage::user_with_images(
                "describe this",
                vec![ImageInput {
                    media_type: "image/png".to_owned(),
                    data: vec![0, 1, 2],
                }],
            )],
            tools: Vec::new(),
            tool_choice: ToolChoice::None,
            max_output_tokens: None,
        };

        let json = serde_json::to_value(ChatCompletionRequest::from(&request))
            .expect("vision request should serialize");

        assert_eq!(json["messages"][0]["content"][0]["type"], "text");
        assert_eq!(json["messages"][0]["content"][0]["text"], "describe this");
        assert_eq!(json["messages"][0]["content"][1]["type"], "image_url");
        assert_eq!(
            json["messages"][0]["content"][1]["image_url"]["url"],
            "data:image/png;base64,AAEC"
        );
    }

    #[test]
    fn chat_request_serializes_tools_and_choice() {
        let request = ChatRequest {
            model: "openai".to_owned(),
            messages: vec![ChatMessage::text(ChatRole::User, "weather")],
            tools: vec![ToolDefinition {
                name: "weather".to_owned(),
                description: "Read the forecast".to_owned(),
                input_schema: serde_json::json!({"type":"object"}),
            }],
            tool_choice: ToolChoice::Auto,
            max_output_tokens: None,
        };
        let json = serde_json::to_value(ChatCompletionRequest::from(&request))
            .expect("request should serialize");

        assert_eq!(json["tool_choice"], "auto");
        assert_eq!(json["tools"][0]["type"], "function");
        assert_eq!(json["tools"][0]["function"]["name"], "weather");
    }

    #[test]
    fn chat_request_serializes_correlated_tool_history() {
        let call = crumb_llm::ToolCall {
            id: "call_1".to_owned(),
            name: "weather".to_owned(),
            arguments: serde_json::json!({"city":"Pune"}),
        };
        let request = ChatRequest {
            model: "openai".to_owned(),
            messages: vec![
                ChatMessage::assistant_tool_calls(vec![call]),
                ChatMessage::tool_result("call_1", "sunny"),
            ],
            tools: Vec::new(),
            tool_choice: ToolChoice::None,
            max_output_tokens: None,
        };
        let json = serde_json::to_value(ChatCompletionRequest::from(&request))
            .expect("request should serialize");

        assert_eq!(
            json["messages"][0]["tool_calls"][0]["function"]["arguments"],
            r#"{"city":"Pune"}"#
        );
        assert_eq!(json["messages"][1]["role"], "tool");
        assert_eq!(json["messages"][1]["tool_call_id"], "call_1");
    }

    #[test]
    fn decoder_assembles_streamed_tool_calls() {
        let payload = concat!(
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"wea","arguments":"{\"city\":"}}]},"finish_reason":null}]}

"#,
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"ther","arguments":"\"Pune\"}"}}]},"finish_reason":"tool_calls"}]}

"#,
            "data: [DONE]\n\n"
        );
        let mut decoder = SseDecoder::default();
        let events = decoder.push(payload.as_bytes()).expect("valid tool stream");

        assert_eq!(
            events,
            vec![
                ChatEvent::ToolCall(crumb_llm::ToolCall {
                    id: "call_1".to_owned(),
                    name: "weather".to_owned(),
                    arguments: serde_json::json!({"city":"Pune"}),
                }),
                ChatEvent::Finished(FinishReason::ToolCall),
            ]
        );
    }

    #[test]
    fn decoder_handles_split_unicode_sse_and_usage() {
        let payload = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"hé\"},\"finish_reason\":null}]}\n\n",
            "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],",
            "\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":1,\"prompt_tokens_details\":{\"cached_tokens\":2}}}\n\n",
            "data: [DONE]\n\n"
        );
        let split = payload.find("é").expect("unicode text should exist") + 1;
        let mut decoder = SseDecoder::default();

        let mut events = decoder
            .push(&payload.as_bytes()[..split])
            .expect("partial event should be retained");
        events.extend(
            decoder
                .push(&payload.as_bytes()[split..])
                .expect("remaining events should decode"),
        );
        assert_eq!(
            decoder
                .finish()
                .expect("stream should finish cleanly")
                .len(),
            0
        );

        assert_eq!(
            events,
            vec![
                ChatEvent::TextDelta("hé".to_owned()),
                ChatEvent::Usage(TokenUsage {
                    input_tokens: 3,
                    cached_input_tokens: 2,
                    output_tokens: 1,
                }),
                ChatEvent::Finished(FinishReason::Stop),
            ]
        );
    }

    #[test]
    fn malformed_chat_payload_is_a_non_retryable_protocol_error() {
        let mut decoder = SseDecoder::default();

        let error = decoder
            .push(b"data: {not-json}\n\n")
            .expect_err("malformed JSON should fail");

        assert_eq!(error.kind, ProviderErrorKind::Protocol);
        assert!(!error.retryable);
    }

    #[test]
    fn decoder_emits_reasoning_separately_from_answer_text() {
        let payload = concat!(
            "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"think\"},\"finish_reason\":null}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"reasoning\":\"ing\"},\"finish_reason\":null}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"answer\"},\"finish_reason\":\"stop\"}]}\n\n",
            "data: [DONE]\n\n"
        );
        let mut decoder = SseDecoder::default();

        let events = decoder.push(payload.as_bytes()).expect("valid stream");

        assert_eq!(
            events,
            vec![
                ChatEvent::ReasoningDelta("think".to_owned()),
                ChatEvent::ReasoningDelta("ing".to_owned()),
                ChatEvent::TextDelta("answer".to_owned()),
                ChatEvent::Finished(FinishReason::Stop),
            ]
        );
    }

    #[test]
    fn malformed_tool_arguments_reach_the_harness_as_raw_text() {
        let payload = concat!(
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\"path\": "}}]},"finish_reason":"tool_calls"}]}

"#,
            "data: [DONE]\n\n"
        );
        let mut decoder = SseDecoder::default();

        let events = decoder
            .push(payload.as_bytes())
            .expect("a model's malformed arguments must not fail the stream");

        assert_eq!(
            events[0],
            ChatEvent::ToolCall(crumb_llm::ToolCall {
                id: "call_1".to_owned(),
                name: "read_file".to_owned(),
                arguments: serde_json::Value::String("{\"path\": ".to_owned()),
            })
        );
    }

    #[test]
    fn decoder_accepts_finish_reason_when_provider_omits_done_sentinel() {
        let mut decoder = SseDecoder::default();
        let events = decoder
            .push(
                b"data: {\"choices\":[{\"delta\":{\"content\":\"seen\"},\"finish_reason\":\"stop\"}]}\n\n",
            )
            .expect("completion chunk");
        assert_eq!(events, vec![ChatEvent::TextDelta("seen".to_owned())]);
        assert_eq!(
            decoder.finish().expect("finish reason closes stream"),
            vec![ChatEvent::Finished(FinishReason::Stop)]
        );
    }
}
