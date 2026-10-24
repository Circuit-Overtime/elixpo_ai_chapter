//! Provider-neutral model contracts for crumb.

use std::collections::VecDeque;
use std::error::Error;
use std::fmt;
use std::future::Future;
use std::pin::Pin;

/// Boxed asynchronous provider operation.
pub type ProviderFuture<'a, T> = Pin<Box<dyn Future<Output = ProviderResult<T>> + Send + 'a>>;

/// Result returned by provider-neutral operations.
pub type ProviderResult<T> = Result<T, ProviderError>;

/// Capabilities advertised by a model.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModelCapability {
    Chat,
    Streaming,
    Embeddings,
    Tools,
    Vision,
}

/// Provider-neutral model metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
    pub capabilities: Vec<ModelCapability>,
    pub context_window: Option<u64>,
}

/// Role associated with one chat message.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChatRole {
    System,
    User,
    Assistant,
    Tool,
}

/// One provider-neutral chat message.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
    pub images: Vec<ImageInput>,
    pub tool_call_id: Option<String>,
    pub tool_calls: Vec<ToolCall>,
}

impl ChatMessage {
    #[must_use]
    pub fn text(role: ChatRole, content: impl Into<String>) -> Self {
        Self {
            role,
            content: content.into(),
            images: Vec::new(),
            tool_call_id: None,
            tool_calls: Vec::new(),
        }
    }

    #[must_use]
    pub fn assistant_tool_calls(calls: Vec<ToolCall>) -> Self {
        Self {
            role: ChatRole::Assistant,
            content: String::new(),
            images: Vec::new(),
            tool_call_id: None,
            tool_calls: calls,
        }
    }

    #[must_use]
    pub fn tool_result(call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: ChatRole::Tool,
            content: content.into(),
            images: Vec::new(),
            tool_call_id: Some(call_id.into()),
            tool_calls: Vec::new(),
        }
    }
}

/// One trusted, bounded image supplied to a vision-capable chat model.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImageInput {
    pub media_type: String,
    pub data: Vec<u8>,
}

impl ChatMessage {
    #[must_use]
    pub fn user_with_images(content: impl Into<String>, images: Vec<ImageInput>) -> Self {
        Self {
            role: ChatRole::User,
            content: content.into(),
            images,
            tool_call_id: None,
            tool_calls: Vec::new(),
        }
    }
}

/// Model-visible declaration of one callable function.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// Complete, provider-neutral function call assembled from a stream.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

/// How the model may choose from the supplied tools.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ToolChoice {
    Auto,
    None,
    Required,
}

/// Input for one streamed chat request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<ToolDefinition>,
    pub tool_choice: ToolChoice,
    pub max_output_tokens: Option<u32>,
}

/// Token counts reported by a provider when available.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub cached_input_tokens: u64,
    pub output_tokens: u64,
}

/// Reason a streamed response ended.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FinishReason {
    Stop,
    Length,
    ToolCall,
    Other(String),
}

/// Ordered event emitted by a chat stream.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ChatEvent {
    TextDelta(String),
    /// Model reasoning streamed separately from the answer. It is display
    /// material only and is never sent back to the model as history.
    ReasoningDelta(String),
    ToolCall(ToolCall),
    Usage(TokenUsage),
    Finished(FinishReason),
}

/// Input for one embedding request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EmbeddingRequest {
    pub model: String,
    pub input: Vec<String>,
    pub dimensions: Option<u32>,
}

/// Provider-neutral embedding result.
#[derive(Clone, Debug, PartialEq)]
pub struct EmbeddingResponse {
    pub vectors: Vec<Vec<f32>>,
    pub usage: TokenUsage,
}

/// Stable category for failures produced by any provider adapter.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProviderErrorKind {
    Authentication,
    InvalidRequest,
    RateLimited,
    Timeout,
    Unavailable,
    Protocol,
    Other,
}

/// Vendor-neutral provider failure safe to surface to terminal code.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProviderError {
    pub kind: ProviderErrorKind,
    pub message: String,
    pub retryable: bool,
}

impl ProviderError {
    #[must_use]
    pub fn new(kind: ProviderErrorKind, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            kind,
            message: message.into(),
            retryable,
        }
    }
}

impl fmt::Display for ProviderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for ProviderError {}

/// Asynchronous stream of provider-neutral chat events.
pub trait ChatStream: Send {
    /// Returns the next ordered event, or `None` after the stream is complete.
    fn next(&mut self) -> ProviderFuture<'_, Option<ChatEvent>>;
}

/// Object-safe interface implemented by model provider adapters.
pub trait LlmProvider: Send + Sync {
    #[must_use]
    fn name(&self) -> &'static str;

    /// Lists models currently exposed by this provider.
    fn list_models(&self) -> ProviderFuture<'_, Vec<ModelInfo>>;

    /// Starts a streamed chat response.
    fn chat_stream(&self, request: ChatRequest) -> ProviderFuture<'_, Box<dyn ChatStream>>;

    /// Creates embeddings for one or more inputs.
    fn embeddings(&self, request: EmbeddingRequest) -> ProviderFuture<'_, EmbeddingResponse>;
}

/// Deterministic provider used by downstream unit and integration tests.
#[derive(Clone, Debug)]
pub struct MockProvider {
    models: Vec<ModelInfo>,
    chat_events: Vec<ChatEvent>,
    embedding_response: EmbeddingResponse,
    failure: Option<ProviderError>,
}

impl MockProvider {
    #[must_use]
    pub const fn new(
        models: Vec<ModelInfo>,
        chat_events: Vec<ChatEvent>,
        embedding_response: EmbeddingResponse,
    ) -> Self {
        Self {
            models,
            chat_events,
            embedding_response,
            failure: None,
        }
    }

    #[must_use]
    pub fn with_failure(mut self, failure: ProviderError) -> Self {
        self.failure = Some(failure);
        self
    }

    fn result<T>(&self, value: T) -> ProviderResult<T> {
        self.failure.clone().map_or(Ok(value), Err)
    }
}

impl LlmProvider for MockProvider {
    fn name(&self) -> &'static str {
        "mock"
    }

    fn list_models(&self) -> ProviderFuture<'_, Vec<ModelInfo>> {
        Box::pin(std::future::ready(self.result(self.models.clone())))
    }

    fn chat_stream(&self, _request: ChatRequest) -> ProviderFuture<'_, Box<dyn ChatStream>> {
        let result = self.result(Box::new(MockChatStream {
            events: self.chat_events.clone().into(),
        }) as Box<dyn ChatStream>);
        Box::pin(std::future::ready(result))
    }

    fn embeddings(&self, _request: EmbeddingRequest) -> ProviderFuture<'_, EmbeddingResponse> {
        Box::pin(std::future::ready(
            self.result(self.embedding_response.clone()),
        ))
    }
}

#[derive(Debug)]
struct MockChatStream {
    events: VecDeque<ChatEvent>,
}

impl ChatStream for MockChatStream {
    fn next(&mut self) -> ProviderFuture<'_, Option<ChatEvent>> {
        Box::pin(std::future::ready(Ok(self.events.pop_front())))
    }
}

#[cfg(test)]
mod tests {
    use std::future::Future;
    use std::task::{Context, Poll, Waker};

    use super::{
        ChatEvent, ChatMessage, ChatRequest, ChatRole, EmbeddingRequest, EmbeddingResponse,
        FinishReason, LlmProvider, MockProvider, ModelCapability, ModelInfo, ProviderError,
        ProviderErrorKind, TokenUsage, ToolChoice,
    };

    fn resolve<T>(future: impl Future<Output = T>) -> T {
        let mut context = Context::from_waker(Waker::noop());
        let mut future = Box::pin(future);
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => value,
            Poll::Pending => panic!("mock futures must resolve immediately"),
        }
    }

    fn model() -> ModelInfo {
        ModelInfo {
            id: "mock-chat".to_owned(),
            display_name: "Mock Chat".to_owned(),
            capabilities: vec![ModelCapability::Chat, ModelCapability::Streaming],
            context_window: Some(8_192),
        }
    }

    fn embeddings() -> EmbeddingResponse {
        EmbeddingResponse {
            vectors: vec![vec![0.25, 0.75]],
            usage: TokenUsage {
                input_tokens: 2,
                cached_input_tokens: 0,
                output_tokens: 0,
            },
        }
    }

    #[test]
    fn mock_provider_is_usable_behind_trait_object() {
        let provider: Box<dyn LlmProvider> =
            Box::new(MockProvider::new(vec![model()], Vec::new(), embeddings()));

        assert_eq!(provider.name(), "mock");
        assert_eq!(
            resolve(provider.list_models()).expect("models should load"),
            vec![model()]
        );
    }

    #[test]
    fn mock_stream_preserves_event_order_and_completion() {
        let events = vec![
            ChatEvent::TextDelta("hello ".to_owned()),
            ChatEvent::TextDelta("world".to_owned()),
            ChatEvent::Finished(FinishReason::Stop),
        ];
        let provider = MockProvider::new(vec![model()], events.clone(), embeddings());
        let request = ChatRequest {
            model: "mock-chat".to_owned(),
            messages: vec![ChatMessage::text(ChatRole::User, "hello")],
            tools: Vec::new(),
            tool_choice: ToolChoice::None,
            max_output_tokens: Some(32),
        };
        let mut stream = resolve(provider.chat_stream(request)).expect("stream should start");

        for expected in events {
            assert_eq!(
                resolve(stream.next()).expect("event should load"),
                Some(expected)
            );
        }
        assert_eq!(resolve(stream.next()).expect("stream should end"), None);
    }

    #[test]
    fn mock_embeddings_return_configured_vectors() {
        let expected = embeddings();
        let provider = MockProvider::new(vec![model()], Vec::new(), expected.clone());
        let request = EmbeddingRequest {
            model: "mock-embed".to_owned(),
            input: vec!["crumb".to_owned()],
            dimensions: Some(2),
        };

        assert_eq!(
            resolve(provider.embeddings(request)).expect("embeddings should load"),
            expected
        );
    }

    #[test]
    fn mock_failure_uses_provider_neutral_error() {
        let failure = ProviderError::new(
            ProviderErrorKind::Unavailable,
            "mock provider unavailable",
            true,
        );
        let provider = MockProvider::new(vec![model()], Vec::new(), embeddings())
            .with_failure(failure.clone());

        assert_eq!(resolve(provider.list_models()), Err(failure));
    }
}
