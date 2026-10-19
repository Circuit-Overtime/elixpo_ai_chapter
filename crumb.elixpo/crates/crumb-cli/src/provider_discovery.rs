use std::collections::BTreeSet;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use crumb_agent::{
    AgentConfig, Modality, ProviderConfig, ProviderHeader, ProviderModel, ProviderProtocol,
};
use reqwest::Client;
use serde_json::Value;
use url::Url;

use crate::provider_projection::resolve_credential_secret;

const MAX_DISCOVERY_BYTES: usize = 4 * 1024 * 1024;

pub(crate) fn discover_models(provider: &ProviderConfig) -> Result<Vec<ProviderModel>> {
    let endpoint = models_endpoint(&provider.base_url)?;
    let timeout = Duration::from_millis(provider.timeout_ms.unwrap_or(30_000).min(60_000));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .context("failed to start provider discovery runtime")?;
    runtime.block_on(discover_models_async(provider, endpoint, timeout))
}

async fn discover_models_async(
    provider: &ProviderConfig,
    endpoint: Url,
    timeout: Duration,
) -> Result<Vec<ProviderModel>> {
    let client = Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .context("failed to construct provider discovery client")?;
    let mut request = client.get(endpoint);
    if let Some(reference) = &provider.credential {
        let secret = resolve_credential_secret(reference)?;
        request = match provider.protocol {
            ProviderProtocol::AnthropicMessages => request
                .header("x-api-key", secret.expose())
                .header("anthropic-version", "2023-06-01"),
            ProviderProtocol::OpenAiCompletions | ProviderProtocol::OpenAiResponses => {
                request.bearer_auth(secret.expose())
            }
        };
    }
    for (name, header) in &provider.headers {
        request = request.header(name, resolve_header(header)?);
    }
    let mut response = request
        .send()
        .await
        .context("provider model discovery request failed")?;
    if response.status().is_redirection() {
        bail!("provider model discovery blocked an HTTP redirect");
    }
    if !response.status().is_success() {
        bail!(
            "provider model discovery returned HTTP {}",
            response.status().as_u16()
        );
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .context("provider model discovery response failed")?
    {
        if body.len().saturating_add(chunk.len()) > MAX_DISCOVERY_BYTES {
            bail!("provider model discovery response exceeds the byte limit");
        }
        body.extend_from_slice(&chunk);
    }
    let payload: Value =
        serde_json::from_slice(&body).context("provider model discovery returned invalid JSON")?;
    parse_models(&payload, provider)
}

fn models_endpoint(base_url: &str) -> Result<Url> {
    let mut endpoint = Url::parse(base_url).context("provider base URL is invalid")?;
    if endpoint.scheme() != "https"
        && endpoint
            .host_str()
            .is_none_or(|host| !matches!(host, "localhost" | "127.0.0.1" | "::1"))
    {
        bail!("provider discovery requires HTTPS outside loopback development");
    }
    let path = endpoint.path().trim_end_matches('/');
    endpoint.set_path(&format!("{path}/models"));
    endpoint.set_query(None);
    endpoint.set_fragment(None);
    Ok(endpoint)
}

fn resolve_header(header: &ProviderHeader) -> Result<String> {
    match header {
        ProviderHeader::Public { value } => Ok(value.clone()),
        ProviderHeader::Environment { name } => std::env::var(name)
            .with_context(|| format!("provider header environment `{name}` is missing")),
    }
}

fn parse_models(payload: &Value, provider: &ProviderConfig) -> Result<Vec<ProviderModel>> {
    let entries = payload
        .get("data")
        .or_else(|| payload.get("models"))
        .and_then(Value::as_array)
        .or_else(|| payload.as_array())
        .context("provider model discovery response has no model list")?;
    let mut models = entries
        .iter()
        .filter_map(|entry| discovered_model(entry, provider))
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.id.cmp(&right.id));
    models.dedup_by(|left, right| left.id == right.id);
    if models.is_empty() {
        bail!("provider model discovery returned no usable model identifiers");
    }
    Ok(models)
}

fn discovered_model(entry: &Value, provider: &ProviderConfig) -> Option<ProviderModel> {
    let id = entry
        .get("id")
        .or_else(|| entry.get("name"))
        .and_then(Value::as_str)?
        .trim();
    if id.is_empty() || id.len() > 256 || id.chars().any(char::is_control) {
        return None;
    }
    let mut model = ProviderModel::new(id);
    model.display_name = entry
        .get("display_name")
        .or_else(|| entry.get("displayName"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    model.context_window = unsigned_field(entry, &["context_length", "context_window"])
        .or(provider.default_context_window);
    model.max_output_tokens = unsigned_field(entry, &["max_output_tokens", "max_tokens"])
        .or(provider.default_max_output_tokens);
    model.input = modalities(entry).unwrap_or_else(|| provider.default_input.clone());
    model.tool_calling = entry.get("tools").and_then(Value::as_bool).unwrap_or(false)
        || capability(entry, "tool_calling")
        || capability(entry, "tools");
    Some(model)
}

fn unsigned_field(value: &Value, names: &[&str]) -> Option<u64> {
    names
        .iter()
        .find_map(|name| value.get(*name).and_then(Value::as_u64))
        .filter(|value| *value > 0)
}

fn modalities(value: &Value) -> Option<BTreeSet<Modality>> {
    let values = value
        .get("input_modalities")
        .or_else(|| value.get("input"))?
        .as_array()?;
    Some(
        values
            .iter()
            .filter_map(Value::as_str)
            .filter_map(|value| match value {
                "text" => Some(Modality::Text),
                "image" => Some(Modality::Image),
                "audio" => Some(Modality::Audio),
                "video" => Some(Modality::Video),
                _ => None,
            })
            .collect(),
    )
}

fn capability(value: &Value, expected: &str) -> bool {
    value
        .get("capabilities")
        .and_then(Value::as_array)
        .is_some_and(|capabilities| {
            capabilities
                .iter()
                .filter_map(Value::as_str)
                .any(|capability| capability == expected)
        })
}

pub(crate) fn compatibility_diagnostics(config: &AgentConfig) -> Vec<String> {
    let mut diagnostics = Vec::new();
    for (modality, routes) in &config.models {
        for route in routes {
            let Some(provider) = config.providers.get(&route.provider) else {
                diagnostics.push(format!(
                    "{modality:?} route {}/{}: provider is missing",
                    route.provider, route.model
                ));
                continue;
            };
            let Some(model) = provider.models.iter().find(|model| model.id == route.model) else {
                diagnostics.push(format!(
                    "{modality:?} route {}/{}: model metadata is missing; run `/config provider discover {}`",
                    route.provider, route.model, route.provider
                ));
                continue;
            };
            if *modality == Modality::Text
                && !model.input.is_empty()
                && !model.input.contains(&Modality::Text)
            {
                diagnostics.push(format!(
                    "Text route {}/{}: model does not advertise text input",
                    route.provider, route.model
                ));
            }
            if let Some(effort) = config.reasoning_effort_for(route)
                && !model.reasoning_efforts.contains_key(effort)
            {
                diagnostics.push(format!(
                    "{modality:?} route {}/{}: effort `{effort}` is unsupported",
                    route.provider, route.model
                ));
            }
        }
    }
    diagnostics
}

#[cfg(test)]
mod tests {
    use crumb_agent::{ProviderConfig, ProviderProtocol};
    use serde_json::json;

    use super::{models_endpoint, parse_models};

    #[test]
    fn discovery_parses_openai_style_model_metadata() {
        let provider = ProviderConfig::new(
            "fixture",
            ProviderProtocol::OpenAiCompletions,
            "https://example.test/v1",
        );
        let models = parse_models(
            &json!({"data": [{"id": "coder", "context_length": 128_000, "capabilities": ["tool_calling"]}]}),
            &provider,
        )
        .expect("models");
        assert_eq!(models[0].id, "coder");
        assert_eq!(models[0].context_window, Some(128_000));
        assert!(models[0].tool_calling);
    }

    #[test]
    fn discovery_endpoint_preserves_version_prefix() {
        assert_eq!(
            models_endpoint("https://example.test/v1")
                .expect("endpoint")
                .as_str(),
            "https://example.test/v1/models"
        );
    }
}
