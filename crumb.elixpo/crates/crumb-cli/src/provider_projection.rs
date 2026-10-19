//! Non-secret provider projection for the replaceable process Harness.

use std::collections::BTreeMap;
use std::hash::{DefaultHasher, Hash, Hasher};

use anyhow::{Context, Result};
use crumb_agent::{
    AgentConfig, CacheRetention, CompatibilityFlag, CredentialReference, Modality, ModelRoute,
    ProviderCompatibility, ProviderConfig, ProviderHeader, ProviderModel, ProviderProtocol,
    ProviderTransport,
};
use crumb_auth::{CredentialStore, OsCredentialStore, SecretString};
use serde_json::{Map, Value, json};

const KEYRING_CREDENTIAL_ENV: &str = "CRUMB_PROVIDER_API_KEY";

/// One adapter profile plus the transient environment values it references.
///
/// This type deliberately has no `Debug` implementation.
pub struct HarnessProviderProjection {
    pub providers_json: String,
    pub environment: Vec<(String, SecretString)>,
    pub revision: u64,
    pub max_tokens: Option<u64>,
}

/// Projects the selected configured provider into the `dsh-llm-pi-ai` shape.
///
/// # Errors
///
/// Returns an error when the selected provider/model is missing, a referenced
/// credential cannot be resolved, or the non-secret projection cannot be
/// serialized.
pub fn project_provider(
    config: &AgentConfig,
    route: &ModelRoute,
) -> Result<HarnessProviderProjection> {
    let provider = config.providers.get(&route.provider).with_context(|| {
        format!(
            "process Harness provider `{}` is not configured; add a provider preset or custom provider",
            route.provider
        )
    })?;
    let selected_model = provider
        .models
        .iter()
        .find(|model| model.id == route.model)
        .with_context(|| {
            format!(
                "model `{}` is not configured for provider `{}`",
                route.model, route.provider
            )
        })?;
    let mut environment = Vec::new();
    let profile = provider_profile(provider, &mut environment)?;
    let mut providers = Map::new();
    providers.insert(route.provider.clone(), profile);
    let providers_json = serde_json::to_string(&providers)
        .context("failed to serialize Harness provider projection")?;
    let revision = projection_revision(provider, route)?;
    Ok(HarnessProviderProjection {
        providers_json,
        environment,
        revision,
        max_tokens: selected_model
            .max_output_tokens
            .or(provider.default_max_output_tokens),
    })
}

fn provider_profile(
    provider: &ProviderConfig,
    environment: &mut Vec<(String, SecretString)>,
) -> Result<Value> {
    let mut profile = Map::new();
    profile.insert("displayName".to_owned(), json!(provider.display_name));
    profile.insert("api".to_owned(), json!(protocol_name(provider.protocol)));
    profile.insert("baseURL".to_owned(), json!(provider.base_url));
    profile.insert(
        "models".to_owned(),
        Value::Array(provider.models.iter().map(model_profile).collect()),
    );
    if let Some(reference) = &provider.credential {
        let (name, secret) = resolve_credential(reference)?;
        profile.insert("apiKeyEnv".to_owned(), json!(&name));
        environment.push((name, secret));
    }
    let headers = project_headers(&provider.headers, environment)?;
    if !headers.is_empty() {
        profile.insert("headers".to_owned(), Value::Object(headers));
    }
    insert_optional(
        &mut profile,
        "defaultContextWindow",
        provider.default_context_window,
    );
    insert_optional(
        &mut profile,
        "defaultMaxTokens",
        provider.default_max_output_tokens,
    );
    let default_input = harness_modalities(&provider.default_input);
    if !default_input.is_empty() {
        profile.insert("defaultInput".to_owned(), json!(default_input));
    }
    insert_optional(&mut profile, "reasoning", provider.reasoning.as_deref());
    if !provider.thinking_budgets.is_empty() {
        profile.insert(
            "thinkingBudgets".to_owned(),
            json!(provider.thinking_budgets),
        );
    }
    insert_optional(
        &mut profile,
        "cacheRetention",
        provider.cache_retention.map(cache_retention_name),
    );
    insert_optional(
        &mut profile,
        "transport",
        provider.transport.map(transport_name),
    );
    insert_optional(&mut profile, "timeoutMs", provider.timeout_ms);
    insert_optional(
        &mut profile,
        "websocketConnectTimeoutMs",
        provider.websocket_connect_timeout_ms,
    );
    insert_optional(
        &mut profile,
        "streamIdleTimeoutMs",
        provider.stream_idle_timeout_ms,
    );
    insert_optional(
        &mut profile,
        "maxRequestImageBytes",
        provider.max_request_image_bytes,
    );
    let compatibility = compatibility_profile(&provider.compatibility);
    if !compatibility.is_empty() {
        profile.insert("compat".to_owned(), Value::Object(compatibility));
    }
    profile.insert("retryPolicy".to_owned(), retry_profile(provider));
    Ok(Value::Object(profile))
}

fn model_profile(model: &ProviderModel) -> Value {
    let mut profile = Map::new();
    profile.insert("id".to_owned(), json!(model.id));
    insert_optional(&mut profile, "name", model.display_name.as_deref());
    insert_optional(&mut profile, "contextWindow", model.context_window);
    insert_optional(&mut profile, "maxTokens", model.max_output_tokens);
    let input = harness_modalities(&model.input);
    if !input.is_empty() {
        profile.insert("input".to_owned(), json!(input));
    }
    profile.insert(
        "reasoningEfforts".to_owned(),
        if model.reasoning_efforts.is_empty() {
            Value::Bool(false)
        } else {
            json!(model.reasoning_efforts)
        },
    );
    let compatibility = compatibility_profile(&model.compatibility);
    if !compatibility.is_empty() {
        profile.insert("compat".to_owned(), Value::Object(compatibility));
    }
    Value::Object(profile)
}

fn project_headers(
    headers: &BTreeMap<String, ProviderHeader>,
    environment: &mut Vec<(String, SecretString)>,
) -> Result<Map<String, Value>> {
    let mut projected = Map::new();
    for (name, header) in headers {
        match header {
            ProviderHeader::Public { value } => {
                projected.insert(name.clone(), json!(value));
            }
            ProviderHeader::Environment { name: variable } => {
                let secret = environment_secret(variable, "provider header")?;
                environment.push((variable.clone(), secret));
                projected.insert(name.clone(), json!({"$env": variable}));
            }
        }
    }
    Ok(projected)
}

fn resolve_credential(reference: &CredentialReference) -> Result<(String, SecretString)> {
    let secret = resolve_credential_secret(reference)?;
    let name = match reference {
        CredentialReference::Environment { name } => name.clone(),
        CredentialReference::Keyring { .. } => KEYRING_CREDENTIAL_ENV.to_owned(),
    };
    Ok((name, secret))
}

pub(crate) fn resolve_credential_secret(reference: &CredentialReference) -> Result<SecretString> {
    match reference {
        CredentialReference::Environment { name } => resolve_environment_credential(name),
        CredentialReference::Keyring { service, account } => {
            OsCredentialStore::named(service, account)?
                .get()?
                .with_context(|| format!("keyring reference `{service}/{account}` is empty"))
        }
    }
}

fn resolve_environment_credential(name: &str) -> Result<SecretString> {
    prefer_environment_or_pollinations_oauth(name, environment_secret(name, "credential"), || {
        Ok(OsCredentialStore::new()?.get()?)
    })
}

fn prefer_environment_or_pollinations_oauth(
    name: &str,
    environment: Result<SecretString>,
    oauth: impl FnOnce() -> Result<Option<SecretString>>,
) -> Result<SecretString> {
    match environment {
        Ok(secret) => Ok(secret),
        Err(environment_error) if is_pollinations_environment(name) => match oauth()? {
            Some(secret) => Ok(secret),
            None => Err(environment_error).context("crumb.elixpo OAuth credential is unavailable"),
        },
        Err(error) => Err(error),
    }
}

fn is_pollinations_environment(name: &str) -> bool {
    matches!(name, "POLLINATIONS_API_KEY" | "POLLINATIONS_KEY")
}

fn environment_secret(name: &str, label: &str) -> Result<SecretString> {
    let value =
        std::env::var(name).with_context(|| format!("{label} environment `{name}` is missing"))?;
    if value.trim().is_empty() {
        anyhow::bail!("{label} environment `{name}` is empty");
    }
    Ok(SecretString::new(value))
}

fn projection_revision(provider: &ProviderConfig, route: &ModelRoute) -> Result<u64> {
    let encoded = serde_json::to_vec(&(provider, route))
        .context("failed to fingerprint Harness provider configuration")?;
    let mut hasher = DefaultHasher::new();
    encoded.hash(&mut hasher);
    Ok(hasher.finish())
}

fn retry_profile(provider: &ProviderConfig) -> Value {
    let retry = provider.retry;
    let mut policy = Map::new();
    policy.insert("mode".to_owned(), json!("normal"));
    policy.insert("maxRetries".to_owned(), json!(retry.max_retries));
    if retry.base_delay_ms > 0 {
        policy.insert(
            "backoff".to_owned(),
            json!({
                "initialDelayMs": retry.base_delay_ms,
                "maxDelayMs": retry.max_delay_ms,
                "jitterRatio": 0.1
            }),
        );
    }
    Value::Object(policy)
}

fn compatibility_profile(compatibility: &ProviderCompatibility) -> Map<String, Value> {
    let mut projected = Map::new();
    for (flag, enabled) in &compatibility.flags {
        let name = match flag {
            CompatibilityFlag::Store => "supportsStore",
            CompatibilityFlag::DeveloperRole => "supportsDeveloperRole",
            CompatibilityFlag::ReasoningEffort => "supportsReasoningEffort",
            CompatibilityFlag::UsageInStreaming => "supportsUsageInStreaming",
            CompatibilityFlag::StrictTools => "supportsStrictTools",
            CompatibilityFlag::Temperature => "supportsTemperature",
        };
        projected.insert(name.to_owned(), json!(enabled));
    }
    insert_optional(
        &mut projected,
        "maxTokensField",
        compatibility.max_tokens_field.as_deref(),
    );
    insert_optional(
        &mut projected,
        "thinkingFormat",
        compatibility.thinking_format.as_deref(),
    );
    insert_optional(
        &mut projected,
        "cacheControlFormat",
        compatibility.cache_control_format.as_deref(),
    );
    projected
}

fn harness_modalities(modalities: &std::collections::BTreeSet<Modality>) -> Vec<&'static str> {
    modalities
        .iter()
        .filter_map(|modality| match modality {
            Modality::Text => Some("text"),
            Modality::Image => Some("image"),
            _ => None,
        })
        .collect()
}

fn insert_optional<T: serde::Serialize>(
    map: &mut Map<String, Value>,
    name: &str,
    value: Option<T>,
) {
    if let Some(value) = value {
        map.insert(name.to_owned(), json!(value));
    }
}

const fn protocol_name(protocol: ProviderProtocol) -> &'static str {
    match protocol {
        ProviderProtocol::OpenAiCompletions => "openai-completions",
        ProviderProtocol::OpenAiResponses => "openai-responses",
        ProviderProtocol::AnthropicMessages => "anthropic-messages",
    }
}

const fn transport_name(transport: ProviderTransport) -> &'static str {
    match transport {
        ProviderTransport::Sse => "sse",
        ProviderTransport::Websocket => "websocket",
        ProviderTransport::WebsocketCached => "websocket-cached",
        ProviderTransport::Auto => "auto",
    }
}

const fn cache_retention_name(retention: CacheRetention) -> &'static str {
    match retention {
        CacheRetention::None => "none",
        CacheRetention::Short => "short",
        CacheRetention::Long => "long",
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};

    use crumb_agent::{
        AgentConfig, Modality, ModelRoute, ProviderConfig, ProviderModel, ProviderProtocol,
    };

    use anyhow::anyhow;
    use crumb_auth::SecretString;

    use super::{prefer_environment_or_pollinations_oauth, project_provider};

    #[test]
    fn projection_uses_exact_provider_model_and_contains_no_secret_field() {
        let mut provider = ProviderConfig::new(
            "Fixture",
            ProviderProtocol::OpenAiResponses,
            "https://example.test/v1",
        );
        let mut model = ProviderModel::new("vendor/coder");
        model.input = BTreeSet::from([Modality::Text, Modality::Image]);
        model.context_window = Some(128_000);
        model.max_output_tokens = Some(4_096);
        model.reasoning_efforts = BTreeMap::from([("high".to_owned(), Some("high".to_owned()))]);
        provider.models.push(model);
        let route = ModelRoute {
            provider: "fixture".to_owned(),
            model: "vendor/coder".to_owned(),
            reasoning_effort: Some("high".to_owned()),
        };
        let config = AgentConfig {
            providers: BTreeMap::from([("fixture".to_owned(), provider)]),
            models: BTreeMap::from([(Modality::Text, vec![route.clone()])]),
            ..AgentConfig::default()
        };

        let projection = project_provider(&config, &route).expect("projection succeeds");

        assert!(projection.providers_json.contains("vendor/coder"));
        assert!(projection.providers_json.contains("openai-responses"));
        assert!(!projection.providers_json.contains("api_key"));
        assert!(matches!(projection.environment.as_slice(), []));
        assert_eq!(projection.max_tokens, Some(4_096));
    }

    #[test]
    fn pollinations_environment_reference_falls_back_to_oauth_keyring() {
        let secret = prefer_environment_or_pollinations_oauth(
            "POLLINATIONS_KEY",
            Err(anyhow!("environment missing")),
            || Ok(Some(SecretString::new("oauth-secret"))),
        )
        .expect("OAuth credential is used");

        assert_eq!(secret.expose(), "oauth-secret");
    }

    #[test]
    fn unrelated_environment_reference_never_uses_pollinations_oauth() {
        let result = prefer_environment_or_pollinations_oauth(
            "OTHER_API_KEY",
            Err(anyhow!("environment missing")),
            || panic!("OAuth fallback must not be consulted"),
        );
        let Err(error) = result else {
            panic!("unrelated environment unexpectedly resolved");
        };

        assert!(error.to_string().contains("environment missing"));
    }
}
