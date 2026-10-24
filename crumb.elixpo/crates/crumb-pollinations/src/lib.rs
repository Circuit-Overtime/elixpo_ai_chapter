//! Pollinations-specific configuration and wire protocol adapter.

mod decisions;
mod search;
mod wire;

pub use decisions::{JevDecisionConfig, register_jev_decision_tool};
pub use search::{PollinationsSearchConfig, register_web_search_tool};

use std::collections::VecDeque;
use std::fmt;
use std::pin::Pin;
use std::time::Duration;

use bytes::Bytes;
use crumb_llm::{
    ChatEvent, ChatRequest, ChatStream, EmbeddingRequest, EmbeddingResponse, LlmProvider,
    ModelInfo, ProviderError, ProviderErrorKind, ProviderFuture, ProviderResult,
};
use futures_util::{Stream, StreamExt};
use reqwest::{Client, RequestBuilder, Response, StatusCode};
use wire::{
    ChatCompletionRequest, SseDecoder, TextModelsResponse, WireEmbeddingRequest,
    WireEmbeddingResponse,
};

pub(crate) const DEFAULT_BASE_URL: &str = "https://gen.pollinations.ai";

/// Bounded retry behavior for retryable Pollinations requests.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RetryPolicy {
    pub max_attempts: u8,
    pub base_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_millis(200),
        }
    }
}

/// Configuration required to construct the Pollinations provider.
#[derive(Clone)]
pub struct PollinationsConfig {
    base_url: String,
    api_key: String,
    /// Total time allowed for non-streaming requests such as model listing.
    pub request_timeout: Duration,
    /// Time allowed to establish a connection.
    pub connect_timeout: Duration,
    /// Longest silence tolerated while waiting for response bytes. It resets
    /// after every chunk, so long streamed answers are never cut off.
    pub stream_idle_timeout: Duration,
    pub retry: RetryPolicy,
}

impl PollinationsConfig {
    /// Creates configuration for the production Pollinations endpoint.
    ///
    /// # Errors
    ///
    /// Returns an authentication error when the supplied API key is empty.
    pub fn new(api_key: impl Into<String>) -> ProviderResult<Self> {
        let api_key = api_key.into();
        if api_key.trim().is_empty() {
            return Err(ProviderError::new(
                ProviderErrorKind::Authentication,
                "Pollinations API key is empty",
                false,
            ));
        }
        Ok(Self {
            base_url: DEFAULT_BASE_URL.to_owned(),
            api_key,
            request_timeout: Duration::from_mins(1),
            connect_timeout: Duration::from_secs(10),
            stream_idle_timeout: Duration::from_mins(3),
            retry: RetryPolicy::default(),
        })
    }

    /// Creates configuration for a keyless OpenAI-compatible server, such as
    /// a local model runtime. Requests carry no `Authorization` header.
    #[must_use]
    pub fn without_key() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.to_owned(),
            api_key: String::new(),
            request_timeout: Duration::from_mins(1),
            connect_timeout: Duration::from_secs(10),
            stream_idle_timeout: Duration::from_mins(3),
            retry: RetryPolicy::default(),
        }
    }

    /// Overrides the API origin, primarily for deterministic HTTP tests.
    ///
    /// # Errors
    ///
    /// Returns an invalid-request error when the origin is empty.
    pub fn with_base_url(mut self, base_url: impl Into<String>) -> ProviderResult<Self> {
        let base_url = base_url.into();
        if base_url.trim().is_empty() {
            return Err(ProviderError::new(
                ProviderErrorKind::InvalidRequest,
                "Pollinations base URL is empty",
                false,
            ));
        }
        base_url
            .trim_end_matches('/')
            .clone_into(&mut self.base_url);
        Ok(self)
    }

    pub(crate) fn endpoint(&self, path: &str) -> String {
        format!("{}{path}", self.base_url)
    }

    /// Adds bearer authentication when this configuration has a key.
    pub(crate) fn authorize(&self, request: RequestBuilder) -> RequestBuilder {
        if self.api_key.is_empty() {
            request
        } else {
            request.bearer_auth(&self.api_key)
        }
    }
}

impl fmt::Debug for PollinationsConfig {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PollinationsConfig")
            .field("base_url", &self.base_url)
            .field("api_key", &"[REDACTED]")
            .field("request_timeout", &self.request_timeout)
            .field("connect_timeout", &self.connect_timeout)
            .field("stream_idle_timeout", &self.stream_idle_timeout)
            .field("retry", &self.retry)
            .finish()
    }
}

/// Pollinations implementation of the provider-neutral model interface.
pub struct PollinationsProvider {
    config: PollinationsConfig,
    client: Client,
}

impl PollinationsProvider {
    /// Creates a lazy provider client without making a network request.
    ///
    /// # Errors
    ///
    /// Returns an invalid-request error if the HTTP client cannot be built.
    pub fn new(config: PollinationsConfig) -> ProviderResult<Self> {
        let client = Client::builder()
            .connect_timeout(config.connect_timeout)
            .read_timeout(config.stream_idle_timeout)
            .build()
            .map_err(|_| {
                ProviderError::new(
                    ProviderErrorKind::InvalidRequest,
                    "failed to construct Pollinations HTTP client",
                    false,
                )
            })?;
        Ok(Self { config, client })
    }

    async fn list_models_inner(&self) -> ProviderResult<Vec<ModelInfo>> {
        let endpoint = self.config.endpoint("/text/models");
        let response = self
            .send_with_retry(|| {
                self.client
                    .get(&endpoint)
                    .timeout(self.config.request_timeout)
            })
            .await?;
        let payload = response
            .json::<TextModelsResponse>()
            .await
            .map_err(|error| map_reqwest_error(&error))?;
        Ok(payload.into_models())
    }

    async fn chat_stream_inner(
        &self,
        request: &ChatRequest,
    ) -> ProviderResult<Box<dyn ChatStream>> {
        let endpoint = self.config.endpoint("/v1/chat/completions");
        let body = ChatCompletionRequest::from(request);
        // Retrying is safe: it only happens before any response arrives, and
        // Pollinations documents that resending an identical request is fine.
        let response = self
            .send_with_retry(|| {
                self.config
                    .authorize(self.client.post(&endpoint))
                    .json(&body)
            })
            .await?;
        Ok(Box::new(PollinationsChatStream::new(
            response.bytes_stream(),
        )))
    }

    async fn embeddings_inner(
        &self,
        request: &EmbeddingRequest,
    ) -> ProviderResult<EmbeddingResponse> {
        let endpoint = self.config.endpoint("/v1/embeddings");
        let body = WireEmbeddingRequest::from(request);
        let response = self
            .send_once(
                self.config
                    .authorize(self.client.post(endpoint))
                    .timeout(self.config.request_timeout)
                    .json(&body),
            )
            .await?;
        let payload = response
            .json::<WireEmbeddingResponse>()
            .await
            .map_err(|error| map_reqwest_error(&error))?;
        Ok(payload.into())
    }

    async fn send_once(&self, request: RequestBuilder) -> ProviderResult<Response> {
        let response = request
            .send()
            .await
            .map_err(|error| map_reqwest_error(&error))?;
        checked_response(response)
    }

    async fn send_with_retry(
        &self,
        build_request: impl Fn() -> RequestBuilder,
    ) -> ProviderResult<Response> {
        let attempts = self.config.retry.max_attempts.max(1);
        for attempt in 0..attempts {
            let result = match build_request().send().await {
                Ok(response) => checked_response(response),
                Err(error) => Err(map_reqwest_error(&error)),
            };
            match result {
                Ok(response) => return Ok(response),
                Err(error) if error.retryable && attempt + 1 < attempts => {
                    let multiplier = 1_u32 << u32::from(attempt.min(16));
                    tokio::time::sleep(self.config.retry.base_delay.saturating_mul(multiplier))
                        .await;
                }
                Err(error) => return Err(error),
            }
        }
        unreachable!("retry loop executes at least once")
    }
}

impl fmt::Debug for PollinationsProvider {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PollinationsProvider")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

impl LlmProvider for PollinationsProvider {
    fn name(&self) -> &'static str {
        "pollinations"
    }

    fn list_models(&self) -> ProviderFuture<'_, Vec<ModelInfo>> {
        Box::pin(self.list_models_inner())
    }

    fn chat_stream(&self, request: ChatRequest) -> ProviderFuture<'_, Box<dyn ChatStream>> {
        Box::pin(async move { self.chat_stream_inner(&request).await })
    }

    fn embeddings(&self, request: EmbeddingRequest) -> ProviderFuture<'_, EmbeddingResponse> {
        Box::pin(async move { self.embeddings_inner(&request).await })
    }
}

type ResponseByteStream = Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>;

struct PollinationsChatStream {
    source: ResponseByteStream,
    decoder: SseDecoder,
    queued: VecDeque<ChatEvent>,
    source_finished: bool,
}

impl PollinationsChatStream {
    fn new(source: impl Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static) -> Self {
        Self {
            source: Box::pin(source),
            decoder: SseDecoder::default(),
            queued: VecDeque::new(),
            source_finished: false,
        }
    }
}

impl ChatStream for PollinationsChatStream {
    fn next(&mut self) -> ProviderFuture<'_, Option<ChatEvent>> {
        Box::pin(async move {
            loop {
                if let Some(event) = self.queued.pop_front() {
                    return Ok(Some(event));
                }
                if self.source_finished {
                    return Ok(None);
                }
                match self.source.next().await {
                    Some(Ok(bytes)) => self.queued.extend(self.decoder.push(&bytes)?),
                    Some(Err(error)) => return Err(map_reqwest_error(&error)),
                    None => {
                        self.source_finished = true;
                        self.queued
                            .extend(std::mem::take(&mut self.decoder).finish()?);
                    }
                }
            }
        })
    }
}

fn checked_response(response: Response) -> ProviderResult<Response> {
    let status = response.status();
    if status.is_success() {
        Ok(response)
    } else {
        Err(map_status(status))
    }
}

fn map_status(status: StatusCode) -> ProviderError {
    let (kind, retryable) = match status.as_u16() {
        401 | 403 => (ProviderErrorKind::Authentication, false),
        400 | 404 | 409 | 422 => (ProviderErrorKind::InvalidRequest, false),
        408 => (ProviderErrorKind::Timeout, true),
        429 => (ProviderErrorKind::RateLimited, true),
        500..=599 => (ProviderErrorKind::Unavailable, true),
        _ => (ProviderErrorKind::Other, false),
    };
    ProviderError::new(
        kind,
        format!("Pollinations request failed with HTTP {status}"),
        retryable,
    )
}

fn map_reqwest_error(error: &reqwest::Error) -> ProviderError {
    if error.is_timeout() {
        ProviderError::new(
            ProviderErrorKind::Timeout,
            "Pollinations request timed out",
            true,
        )
    } else if error.is_connect() || error.is_request() {
        ProviderError::new(
            ProviderErrorKind::Unavailable,
            "Pollinations is unavailable",
            true,
        )
    } else if error.is_decode() {
        ProviderError::new(
            ProviderErrorKind::Protocol,
            "Pollinations returned an invalid response",
            false,
        )
    } else {
        ProviderError::new(
            ProviderErrorKind::Other,
            "Pollinations request failed",
            false,
        )
    }
}

#[cfg(test)]
mod tests {
    use crumb_llm::ProviderErrorKind;
    use reqwest::StatusCode;

    use super::{PollinationsConfig, map_status};

    #[test]
    fn configuration_debug_output_redacts_api_key() {
        let config = PollinationsConfig::new("sk_top_secret").expect("config should be valid");
        let debug = format!("{config:?}");

        assert!(debug.contains("[REDACTED]"));
        assert!(!debug.contains("sk_top_secret"));
    }

    #[test]
    fn endpoint_join_has_one_separator() {
        let config = PollinationsConfig::new("sk_test")
            .expect("config should be valid")
            .with_base_url("http://127.0.0.1:8080/")
            .expect("test URL should be valid");

        assert_eq!(
            config.endpoint("/v1/chat/completions"),
            "http://127.0.0.1:8080/v1/chat/completions"
        );
    }

    #[test]
    fn status_mapping_is_neutral_and_retry_aware() {
        let authentication = map_status(StatusCode::UNAUTHORIZED);
        let rate_limit = map_status(StatusCode::TOO_MANY_REQUESTS);
        let server = map_status(StatusCode::BAD_GATEWAY);

        assert_eq!(authentication.kind, ProviderErrorKind::Authentication);
        assert!(!authentication.retryable);
        assert_eq!(rate_limit.kind, ProviderErrorKind::RateLimited);
        assert!(rate_limit.retryable);
        assert_eq!(server.kind, ProviderErrorKind::Unavailable);
        assert!(server.retryable);
    }
}

#[cfg(test)]
mod http_tests;
