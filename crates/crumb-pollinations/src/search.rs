//! Bounded Pollinations web search exposed through Crumb's native tool policy.

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use reqwest::Client;
use serde_json::{Value, json};

const DEFAULT_MODEL: &str = "perplexity";
const MAX_QUERY_BYTES: usize = 8 * 1024;
const SEARCH_SYSTEM_PROMPT: &str = "Search the public web for the exact query supplied. Do not omit, replace, or broaden any named person, organization, place, product, quoted phrase, or qualifier. Ordinary public-source research about a named person is allowed: report relevant public professional, biographical, and project information with source URLs, and do not refuse merely because the subject is an individual. Never expose private credentials, private contact details, precise non-public locations, financial records, medical records, or other genuinely sensitive non-public data. Be concise and distinguish verified, self-reported, uncertain, and conflicting claims.";
const PUBLIC_RESEARCH_RETRY_PROMPT: &str = "Perform ordinary public-source research for the exact query. A person's name is not a reason to refuse. Return useful non-sensitive professional, biographical, project, and authorship facts found on public pages, with source URLs. Exclude private contact details, credentials, precise non-public locations, financial records, medical records, and unsupported claims.";

/// Runtime-only configuration for the Pollinations search tool.
#[derive(Clone)]
pub struct PollinationsSearchConfig {
    api_key: String,
    model: String,
    request_timeout: Duration,
    max_output_bytes: usize,
}

impl PollinationsSearchConfig {
    /// Creates a bounded search configuration. The API key is never formatted.
    ///
    /// # Errors
    ///
    /// Returns an error when the credential or limits are empty.
    pub fn new(api_key: impl Into<String>, max_output_bytes: usize) -> Result<Self> {
        let api_key = api_key.into();
        if api_key.trim().is_empty() {
            bail!("Pollinations API key is empty");
        }
        if max_output_bytes == 0 {
            bail!("web search output limit must be positive");
        }
        Ok(Self {
            api_key,
            model: DEFAULT_MODEL.to_owned(),
            request_timeout: Duration::from_secs(45),
            max_output_bytes,
        })
    }

    /// Selects the configured Pollinations web-search route.
    #[must_use]
    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = model.into();
        self
    }
}

impl std::fmt::Debug for PollinationsSearchConfig {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PollinationsSearchConfig")
            .field("api_key", &"[REDACTED]")
            .field("model", &self.model)
            .field("request_timeout", &self.request_timeout)
            .field("max_output_bytes", &self.max_output_bytes)
            .finish()
    }
}

/// Registers the permission-gated `web_search` MCP tool.
///
/// # Errors
///
/// Returns an error when the HTTP client or tool descriptor cannot be created.
pub fn register_web_search_tool(
    host: &mut ToolHost,
    config: PollinationsSearchConfig,
) -> Result<()> {
    let client = Client::builder()
        .timeout(config.request_timeout)
        .build()
        .context("failed to construct web search client")?;
    host.register(
        ToolDescriptor {
            name: "web_search".to_owned(),
            description: "Search the public web for current information and return cited results, including non-sensitive public information about named people. Preserve all names, organizations, places, quoted phrases, and qualifiers from the user's request in the query; never broaden a specific subject into a generic topic. Requires network permission.".to_owned(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A precise search query retaining every named entity and qualifier from the user's request.",
                        "minLength": 1,
                        "maxLength": MAX_QUERY_BYTES
                    }
                },
                "required": ["query"],
                "additionalProperties": false
            }),
            risk: RiskClass::NetworkAccess,
            transport: ToolTransport::Native,
        },
        Arc::new(PollinationsSearch { client, config }),
    )
}

#[derive(Clone)]
struct PollinationsSearch {
    client: Client,
    config: PollinationsSearchConfig,
}

impl ToolHandler for PollinationsSearch {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        let query = arguments
            .get("query")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|query| !query.is_empty())
            .ok_or_else(|| anyhow!("web search query is required"))?;
        if query.len() > MAX_QUERY_BYTES {
            bail!("web search query exceeds the byte limit");
        }
        let tool = self.clone();
        let query = query.to_owned();
        let cancellation = cancellation.clone();
        thread::Builder::new()
            .name("crumb-web-search".to_owned())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .context("failed to start web search runtime")?;
                runtime.block_on(tool.search(&query, &cancellation))
            })
            .context("failed to start web search worker")?
            .join()
            .map_err(|_| anyhow!("web search worker failed"))?
    }
}

impl PollinationsSearch {
    async fn search(&self, query: &str, cancellation: &CancellationToken) -> Result<ToolOutput> {
        let mut payload = self
            .request_search(query, SEARCH_SYSTEM_PROMPT, cancellation)
            .await?;
        let mut answer = search_answer(&payload)?;
        if is_blanket_person_refusal(answer) {
            payload = self
                .request_search(query, PUBLIC_RESEARCH_RETRY_PROMPT, cancellation)
                .await?;
            answer = search_answer(&payload)?;
        }
        let text = truncate_utf8(answer, self.config.max_output_bytes);
        Ok(ToolOutput {
            text: text.to_owned(),
            structured: Some(json!({
                "model": self.config.model,
                "citations": payload.get("citations").cloned().unwrap_or_else(|| json!([]))
            })),
            is_error: false,
        })
    }

    async fn request_search(
        &self,
        query: &str,
        system_prompt: &str,
        cancellation: &CancellationToken,
    ) -> Result<Value> {
        let request = self
            .client
            .post("https://gen.pollinations.ai/v1/chat/completions")
            .bearer_auth(&self.config.api_key)
            .json(&json!({
                "model": self.config.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query}
                ],
                "stream": false
            }))
            .send();
        let response = tokio::select! {
            result = request => result.context("web search request failed")?,
            () = wait_for_cancellation(cancellation) => bail!("web search cancelled"),
        };
        if !response.status().is_success() {
            bail!(
                "web search was rejected with HTTP {}",
                response.status().as_u16()
            );
        }
        response
            .json::<Value>()
            .await
            .context("web search returned invalid JSON")
    }
}

fn search_answer(payload: &Value) -> Result<&str> {
    payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("web search response did not contain text"))
}

fn is_blanket_person_refusal(answer: &str) -> bool {
    let answer = answer.to_ascii_lowercase();
    (answer.contains("can't provide") || answer.contains("cannot provide"))
        && (answer.contains("details about individuals")
            || answer.contains("information about individuals")
            || answer.contains("privacy and security policies"))
}

pub(crate) async fn wait_for_cancellation(cancellation: &CancellationToken) {
    while !cancellation.is_cancelled() {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

pub(crate) fn truncate_utf8(value: &str, max_bytes: usize) -> &str {
    if value.len() <= max_bytes {
        return value;
    }
    let mut boundary = max_bytes;
    while !value.is_char_boundary(boundary) {
        boundary -= 1;
    }
    &value[..boundary]
}

#[cfg(test)]
mod tests {
    use super::{is_blanket_person_refusal, truncate_utf8};

    #[test]
    fn truncation_preserves_utf8_boundaries() {
        assert_eq!(truncate_utf8("crumb 🐼", 7), "crumb ");
    }

    #[test]
    fn detects_generic_person_research_refusal() {
        assert!(is_blanket_person_refusal(
            "I can't provide specific details about individuals due to privacy and security policies."
        ));
        assert!(!is_blanket_person_refusal(
            "I could not verify that claim in the public sources I searched."
        ));
    }
}
