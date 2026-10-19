//! Provider-neutral request contract for replaceable agent harnesses.

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

use crate::{AgentMode, ModelRoute, SessionId};

/// Exact-model capabilities advertised by a harness adapter.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ModelCapabilities {
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub reasoning_efforts: Vec<String>,
}

/// One turn passed to either the native or subprocess harness.
///
/// Adapters translate this provider-neutral shape into their supported wire.
#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessTurnRequest {
    pub session_id: SessionId,
    pub request: String,
    pub mode: AgentMode,
    pub provider: String,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
}

impl HarnessTurnRequest {
    #[must_use]
    pub fn new(
        session_id: SessionId,
        request: String,
        mode: AgentMode,
        route: &ModelRoute,
        reasoning_effort: Option<&str>,
    ) -> Self {
        Self {
            session_id,
            request,
            mode,
            provider: route.provider.clone(),
            model: route.model.clone(),
            reasoning_effort: reasoning_effort.map(str::to_owned),
        }
    }

    /// Checks the exact model and effort before an adapter performs network I/O.
    ///
    /// # Errors
    ///
    /// Returns an error when capabilities are for a different model or the
    /// selected model does not advertise the requested effort.
    pub fn validate_capabilities(&self, capabilities: &ModelCapabilities) -> Result<()> {
        if self.provider != capabilities.provider || self.model != capabilities.model {
            bail!(
                "harness capabilities do not match selected model `{}/{}`",
                self.provider,
                self.model
            );
        }
        if let Some(effort) = &self.reasoning_effort
            && !capabilities
                .reasoning_efforts
                .iter()
                .any(|supported| supported == effort)
        {
            bail!(
                "model `{}/{}` does not advertise reasoning effort `{effort}`",
                self.provider,
                self.model
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::{AgentMode, ModelRoute, SessionId};

    use super::{HarnessTurnRequest, ModelCapabilities};

    fn request(effort: Option<&str>) -> HarnessTurnRequest {
        HarnessTurnRequest::new(
            SessionId::new("test-session").expect("valid fixture"),
            "inspect this workspace".to_owned(),
            AgentMode::Plan,
            &ModelRoute {
                provider: "fixture".to_owned(),
                model: "fixture-coder".to_owned(),
                reasoning_effort: None,
            },
            effort,
        )
    }

    #[test]
    fn effort_is_preserved_for_the_selected_harness() {
        assert_eq!(
            request(Some("high")).reasoning_effort.as_deref(),
            Some("high")
        );
    }

    #[test]
    fn unsupported_effort_fails_before_the_adapter_runs() {
        let capabilities = ModelCapabilities {
            provider: "fixture".to_owned(),
            model: "fixture-coder".to_owned(),
            reasoning_efforts: vec!["low".to_owned(), "medium".to_owned()],
        };
        assert!(
            request(Some("high"))
                .validate_capabilities(&capabilities)
                .is_err()
        );
    }
}
