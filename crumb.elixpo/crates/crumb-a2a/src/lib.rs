//! Bounded, transport-neutral data contracts for A2A protocol v1.0.
//!
//! This crate models discovery cards, messages, tasks, and artifacts. It does
//! not perform discovery, network requests, persistence, authorization, or
//! logging. Callers must use [`from_json`] for untrusted JSON so payload and
//! semantic limits are applied together.
//!
//! Inline `raw` parts are intentionally unsupported. File exchange uses an
//! HTTPS URL or a workspace-scoped `artifacts/...` reference and still needs
//! an explicit acceptance decision in the transport layer.

use std::{collections::BTreeMap, fmt, path::Path};

use chrono::DateTime;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use url::{Host, Url};

pub const PROTOCOL_VERSION: &str = "1.0";
pub const MAX_WIRE_BYTES: usize = 256 * 1024;
pub const MAX_TEXT_BYTES: usize = 64 * 1024;
pub const MAX_DATA_BYTES: usize = 64 * 1024;
pub const MAX_METADATA_BYTES: usize = 32 * 1024;
pub const MAX_PARTS: usize = 32;
pub const MAX_HISTORY_MESSAGES: usize = 64;
pub const MAX_ARTIFACTS: usize = 32;
pub const MAX_SKILLS: usize = 64;
pub const MAX_INTERFACES: usize = 8;

const MAX_ID_BYTES: usize = 256;
const MAX_NAME_BYTES: usize = 256;
const MAX_DESCRIPTION_BYTES: usize = 8 * 1024;
const MAX_URL_BYTES: usize = 4 * 1024;
const MAX_LIST_ITEMS: usize = 64;
const MAX_JSON_DEPTH: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationError {
    pub path: &'static str,
    pub message: String,
}

impl ValidationError {
    fn new(path: &'static str, message: impl Into<String>) -> Self {
        Self {
            path,
            message: message.into(),
        }
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.path, self.message)
    }
}

impl std::error::Error for ValidationError {}

#[derive(Debug)]
pub enum DecodeError {
    TooLarge { actual: usize, limit: usize },
    Json(serde_json::Error),
    Validation(ValidationError),
}

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooLarge { actual, limit } => {
                write!(f, "A2A payload is {actual} bytes; limit is {limit}")
            }
            Self::Json(error) => write!(f, "invalid A2A JSON: {error}"),
            Self::Validation(error) => write!(f, "invalid A2A value: {error}"),
        }
    }
}

impl std::error::Error for DecodeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Json(error) => Some(error),
            Self::Validation(error) => Some(error),
            Self::TooLarge { .. } => None,
        }
    }
}

pub trait Validate {
    /// Checks local size, shape, and security constraints.
    ///
    /// # Errors
    ///
    /// Returns [`ValidationError`] when the value cannot safely cross the
    /// Crumb A2A boundary.
    fn validate(&self) -> Result<(), ValidationError>;
}

/// Decodes and validates an untrusted A2A JSON payload.
///
/// # Errors
///
/// Returns [`DecodeError`] when the wire payload is too large, is not valid
/// strict JSON for `T`, or violates semantic validation limits.
pub fn from_json<T>(bytes: &[u8]) -> Result<T, DecodeError>
where
    T: DeserializeOwned + Validate,
{
    if bytes.len() > MAX_WIRE_BYTES {
        return Err(DecodeError::TooLarge {
            actual: bytes.len(),
            limit: MAX_WIRE_BYTES,
        });
    }
    let value: T = serde_json::from_slice(bytes).map_err(DecodeError::Json)?;
    value.validate().map_err(DecodeError::Validation)?;
    Ok(value)
}

/// Validates and encodes an A2A value as ProtoJSON-compatible JSON.
///
/// # Errors
///
/// Returns [`DecodeError`] when validation fails, serialization fails, or the
/// resulting wire payload exceeds [`MAX_WIRE_BYTES`].
pub fn to_json<T>(value: &T) -> Result<Vec<u8>, DecodeError>
where
    T: Serialize + Validate,
{
    value.validate().map_err(DecodeError::Validation)?;
    let bytes = serde_json::to_vec(value).map_err(DecodeError::Json)?;
    if bytes.len() > MAX_WIRE_BYTES {
        return Err(DecodeError::TooLarge {
            actual: bytes.len(),
            limit: MAX_WIRE_BYTES,
        });
    }
    Ok(bytes)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentCard {
    pub name: String,
    pub description: String,
    pub supported_interfaces: Vec<AgentInterface>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<AgentProvider>,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub documentation_url: Option<String>,
    pub capabilities: AgentCapabilities,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub security_schemes: BTreeMap<String, Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub security_requirements: Vec<SecurityRequirement>,
    pub default_input_modes: Vec<String>,
    pub default_output_modes: Vec<String>,
    pub skills: Vec<AgentSkill>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub signatures: Vec<AgentCardSignature>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentInterface {
    pub url: String,
    pub protocol_binding: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    pub protocol_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentProvider {
    pub url: String,
    pub organization: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentCapabilities {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub streaming: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub push_notifications: Option<bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extensions: Vec<AgentExtension>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extended_agent_card: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentExtension {
    pub uri: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub examples: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub input_modes: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub output_modes: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub security_requirements: Vec<SecurityRequirement>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SecurityRequirement {
    pub schemes: BTreeMap<String, StringList>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StringList {
    pub list: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentCardSignature {
    pub protected: String,
    pub signature: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header: Option<Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Role {
    #[serde(rename = "ROLE_UNSPECIFIED")]
    Unspecified,
    #[serde(rename = "ROLE_USER")]
    User,
    #[serde(rename = "ROLE_AGENT")]
    Agent,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Message {
    pub message_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    pub role: Role,
    pub parts: Vec<Part>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extensions: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reference_task_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Part {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
}

impl Part {
    #[must_use]
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            text: Some(text.into()),
            data: None,
            url: None,
            metadata: None,
            filename: None,
            media_type: Some("text/plain".to_owned()),
        }
    }

    #[must_use]
    pub fn data(data: Value) -> Self {
        Self {
            text: None,
            data: Some(data),
            url: None,
            metadata: None,
            filename: None,
            media_type: Some("application/json".to_owned()),
        }
    }

    #[must_use]
    pub fn file(
        url: impl Into<String>,
        filename: impl Into<String>,
        media_type: impl Into<String>,
    ) -> Self {
        Self {
            text: None,
            data: None,
            url: Some(url.into()),
            metadata: None,
            filename: Some(filename.into()),
            media_type: Some(media_type.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Artifact {
    pub artifact_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub parts: Vec<Part>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskState {
    #[serde(rename = "TASK_STATE_UNSPECIFIED")]
    Unspecified,
    #[serde(rename = "TASK_STATE_SUBMITTED")]
    Submitted,
    #[serde(rename = "TASK_STATE_WORKING")]
    Working,
    #[serde(rename = "TASK_STATE_COMPLETED")]
    Completed,
    #[serde(rename = "TASK_STATE_FAILED")]
    Failed,
    #[serde(rename = "TASK_STATE_CANCELED")]
    Canceled,
    #[serde(rename = "TASK_STATE_INPUT_REQUIRED")]
    InputRequired,
    #[serde(rename = "TASK_STATE_REJECTED")]
    Rejected,
    #[serde(rename = "TASK_STATE_AUTH_REQUIRED")]
    AuthRequired,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskStatus {
    pub state: TaskState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<Message>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Task {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_id: Option<String>,
    pub status: TaskStatus,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub artifacts: Vec<Artifact>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub history: Vec<Message>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SendMessageConfiguration {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub accepted_output_modes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_length: Option<u32>,
    #[serde(default)]
    pub return_immediately: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SendMessageRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    pub message: Message,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub configuration: Option<SendMessageConfiguration>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SendMessageResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task: Option<Task>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<Message>,
}

impl Validate for AgentCard {
    fn validate(&self) -> Result<(), ValidationError> {
        bounded_nonempty("agentCard.name", &self.name, MAX_NAME_BYTES)?;
        bounded_nonempty(
            "agentCard.description",
            &self.description,
            MAX_DESCRIPTION_BYTES,
        )?;
        bounded_nonempty("agentCard.version", &self.version, MAX_NAME_BYTES)?;
        bounded_vec(
            "agentCard.supportedInterfaces",
            &self.supported_interfaces,
            1,
            MAX_INTERFACES,
        )?;
        for interface in &self.supported_interfaces {
            interface.validate()?;
        }
        if let Some(provider) = &self.provider {
            provider.validate()?;
        }
        if let Some(url) = &self.documentation_url {
            validate_https_url("agentCard.documentationUrl", url)?;
        }
        self.capabilities.validate()?;
        validate_json(
            "agentCard.securitySchemes",
            &serde_json::to_value(&self.security_schemes).map_err(|error| {
                ValidationError::new("agentCard.securitySchemes", error.to_string())
            })?,
            MAX_METADATA_BYTES,
        )?;
        bounded_vec(
            "agentCard.securityRequirements",
            &self.security_requirements,
            0,
            MAX_LIST_ITEMS,
        )?;
        for requirement in &self.security_requirements {
            requirement.validate()?;
        }
        validate_modes(
            "agentCard.defaultInputModes",
            &self.default_input_modes,
            true,
        )?;
        validate_modes(
            "agentCard.defaultOutputModes",
            &self.default_output_modes,
            true,
        )?;
        bounded_vec("agentCard.skills", &self.skills, 0, MAX_SKILLS)?;
        for skill in &self.skills {
            skill.validate()?;
        }
        bounded_vec("agentCard.signatures", &self.signatures, 0, MAX_LIST_ITEMS)?;
        for signature in &self.signatures {
            signature.validate()?;
        }
        if let Some(url) = &self.icon_url {
            validate_https_url("agentCard.iconUrl", url)?;
        }
        Ok(())
    }
}

impl Validate for AgentInterface {
    fn validate(&self) -> Result<(), ValidationError> {
        bounded_nonempty("agentInterface.protocolBinding", &self.protocol_binding, 32)?;
        if !matches!(
            self.protocol_binding.as_str(),
            "JSONRPC" | "GRPC" | "HTTP+JSON"
        ) {
            return Err(ValidationError::new(
                "agentInterface.protocolBinding",
                "unsupported core binding",
            ));
        }
        bounded_nonempty("agentInterface.protocolVersion", &self.protocol_version, 16)?;
        if self.protocol_version != PROTOCOL_VERSION {
            return Err(ValidationError::new(
                "agentInterface.protocolVersion",
                "only A2A 1.0 is accepted",
            ));
        }
        if self.protocol_binding == "GRPC" && !self.url.contains("://") {
            validate_grpc_address(&self.url)?;
        } else {
            validate_https_url("agentInterface.url", &self.url)?;
        }
        if let Some(tenant) = &self.tenant {
            bounded_nonempty("agentInterface.tenant", tenant, MAX_ID_BYTES)?;
        }
        Ok(())
    }
}

impl Validate for AgentProvider {
    fn validate(&self) -> Result<(), ValidationError> {
        validate_https_url("agentProvider.url", &self.url)?;
        bounded_nonempty(
            "agentProvider.organization",
            &self.organization,
            MAX_NAME_BYTES,
        )
    }
}

impl Validate for AgentCapabilities {
    fn validate(&self) -> Result<(), ValidationError> {
        bounded_vec(
            "agentCapabilities.extensions",
            &self.extensions,
            0,
            MAX_LIST_ITEMS,
        )?;
        for extension in &self.extensions {
            extension.validate()?;
        }
        Ok(())
    }
}

impl Validate for AgentExtension {
    fn validate(&self) -> Result<(), ValidationError> {
        validate_absolute_uri("agentExtension.uri", &self.uri)?;
        if let Some(description) = &self.description {
            bounded(
                "agentExtension.description",
                description,
                MAX_DESCRIPTION_BYTES,
            )?;
        }
        if let Some(params) = &self.params {
            validate_json("agentExtension.params", params, MAX_METADATA_BYTES)?;
        }
        Ok(())
    }
}

impl Validate for AgentSkill {
    fn validate(&self) -> Result<(), ValidationError> {
        validate_id("agentSkill.id", &self.id)?;
        bounded_nonempty("agentSkill.name", &self.name, MAX_NAME_BYTES)?;
        bounded_nonempty(
            "agentSkill.description",
            &self.description,
            MAX_DESCRIPTION_BYTES,
        )?;
        validate_string_list("agentSkill.tags", &self.tags, true, MAX_NAME_BYTES)?;
        validate_string_list("agentSkill.examples", &self.examples, false, MAX_TEXT_BYTES)?;
        validate_modes("agentSkill.inputModes", &self.input_modes, false)?;
        validate_modes("agentSkill.outputModes", &self.output_modes, false)?;
        bounded_vec(
            "agentSkill.securityRequirements",
            &self.security_requirements,
            0,
            MAX_LIST_ITEMS,
        )?;
        for requirement in &self.security_requirements {
            requirement.validate()?;
        }
        Ok(())
    }
}

impl Validate for SecurityRequirement {
    fn validate(&self) -> Result<(), ValidationError> {
        if self.schemes.len() > MAX_LIST_ITEMS {
            return Err(ValidationError::new(
                "securityRequirement.schemes",
                "too many schemes",
            ));
        }
        for (name, scopes) in &self.schemes {
            bounded_nonempty("securityRequirement.scheme", name, MAX_NAME_BYTES)?;
            validate_string_list(
                "securityRequirement.scopes",
                &scopes.list,
                false,
                MAX_NAME_BYTES,
            )?;
        }
        Ok(())
    }
}

impl Validate for AgentCardSignature {
    fn validate(&self) -> Result<(), ValidationError> {
        bounded_nonempty(
            "agentCardSignature.protected",
            &self.protected,
            MAX_URL_BYTES,
        )?;
        bounded_nonempty(
            "agentCardSignature.signature",
            &self.signature,
            MAX_URL_BYTES,
        )?;
        if let Some(header) = &self.header {
            validate_json("agentCardSignature.header", header, MAX_METADATA_BYTES)?;
        }
        Ok(())
    }
}

impl Validate for Message {
    fn validate(&self) -> Result<(), ValidationError> {
        validate_id("message.messageId", &self.message_id)?;
        validate_optional_id("message.contextId", self.context_id.as_deref())?;
        validate_optional_id("message.taskId", self.task_id.as_deref())?;
        if self.role == Role::Unspecified {
            return Err(ValidationError::new(
                "message.role",
                "role must be specified",
            ));
        }
        bounded_vec("message.parts", &self.parts, 1, MAX_PARTS)?;
        for part in &self.parts {
            part.validate()?;
        }
        validate_optional_json(
            "message.metadata",
            self.metadata.as_ref(),
            MAX_METADATA_BYTES,
        )?;
        validate_uri_list("message.extensions", &self.extensions)?;
        validate_string_list(
            "message.referenceTaskIds",
            &self.reference_task_ids,
            false,
            MAX_ID_BYTES,
        )?;
        Ok(())
    }
}

impl Validate for Part {
    fn validate(&self) -> Result<(), ValidationError> {
        let content_count = usize::from(self.text.is_some())
            + usize::from(self.data.is_some())
            + usize::from(self.url.is_some());
        if content_count != 1 {
            return Err(ValidationError::new(
                "part",
                "exactly one of text, data, or url is required",
            ));
        }
        if let Some(text) = &self.text {
            bounded("part.text", text, MAX_TEXT_BYTES)?;
            if self.filename.is_some() {
                return Err(ValidationError::new(
                    "part.filename",
                    "filename is only valid for URL file parts",
                ));
            }
        }
        if let Some(data) = &self.data {
            validate_json("part.data", data, MAX_DATA_BYTES)?;
            if self.filename.is_some() {
                return Err(ValidationError::new(
                    "part.filename",
                    "filename is only valid for URL file parts",
                ));
            }
        }
        if let Some(url) = &self.url {
            validate_file_reference(url)?;
        }
        validate_optional_json("part.metadata", self.metadata.as_ref(), MAX_METADATA_BYTES)?;
        if let Some(filename) = &self.filename {
            validate_filename(filename)?;
        }
        if let Some(media_type) = &self.media_type {
            validate_media_type("part.mediaType", media_type)?;
        }
        Ok(())
    }
}

impl Validate for Artifact {
    fn validate(&self) -> Result<(), ValidationError> {
        validate_id("artifact.artifactId", &self.artifact_id)?;
        if let Some(name) = &self.name {
            bounded_nonempty("artifact.name", name, MAX_NAME_BYTES)?;
        }
        if let Some(description) = &self.description {
            bounded("artifact.description", description, MAX_DESCRIPTION_BYTES)?;
        }
        bounded_vec("artifact.parts", &self.parts, 1, MAX_PARTS)?;
        for part in &self.parts {
            part.validate()?;
        }
        validate_optional_json(
            "artifact.metadata",
            self.metadata.as_ref(),
            MAX_METADATA_BYTES,
        )?;
        validate_uri_list("artifact.extensions", &self.extensions)
    }
}

impl Validate for TaskStatus {
    fn validate(&self) -> Result<(), ValidationError> {
        if self.state == TaskState::Unspecified {
            return Err(ValidationError::new(
                "taskStatus.state",
                "state must be specified",
            ));
        }
        if let Some(message) = &self.message {
            message.validate()?;
        }
        if let Some(timestamp) = &self.timestamp {
            bounded_nonempty("taskStatus.timestamp", timestamp, 64)?;
            DateTime::parse_from_rfc3339(timestamp)
                .map_err(|_| ValidationError::new("taskStatus.timestamp", "must be RFC 3339"))?;
        }
        Ok(())
    }
}

impl Validate for Task {
    fn validate(&self) -> Result<(), ValidationError> {
        validate_id("task.id", &self.id)?;
        validate_optional_id("task.contextId", self.context_id.as_deref())?;
        self.status.validate()?;
        bounded_vec("task.artifacts", &self.artifacts, 0, MAX_ARTIFACTS)?;
        for artifact in &self.artifacts {
            artifact.validate()?;
        }
        bounded_vec("task.history", &self.history, 0, MAX_HISTORY_MESSAGES)?;
        for message in &self.history {
            message.validate()?;
        }
        validate_optional_json("task.metadata", self.metadata.as_ref(), MAX_METADATA_BYTES)
    }
}

impl Validate for SendMessageConfiguration {
    fn validate(&self) -> Result<(), ValidationError> {
        validate_modes(
            "sendMessageConfiguration.acceptedOutputModes",
            &self.accepted_output_modes,
            false,
        )?;
        if self.history_length.is_some_and(|length| length > 64) {
            return Err(ValidationError::new(
                "sendMessageConfiguration.historyLength",
                "exceeds local history limit",
            ));
        }
        Ok(())
    }
}

impl Validate for SendMessageRequest {
    fn validate(&self) -> Result<(), ValidationError> {
        if let Some(tenant) = &self.tenant {
            validate_id("sendMessageRequest.tenant", tenant)?;
        }
        self.message.validate()?;
        if self.message.role != Role::User {
            return Err(ValidationError::new(
                "sendMessageRequest.message.role",
                "outbound request role must be ROLE_USER",
            ));
        }
        if let Some(configuration) = &self.configuration {
            configuration.validate()?;
        }
        validate_optional_json(
            "sendMessageRequest.metadata",
            self.metadata.as_ref(),
            MAX_METADATA_BYTES,
        )
    }
}

impl Validate for SendMessageResponse {
    fn validate(&self) -> Result<(), ValidationError> {
        match (&self.task, &self.message) {
            (Some(task), None) => task.validate(),
            (None, Some(message)) => {
                message.validate()?;
                if message.role != Role::Agent {
                    return Err(ValidationError::new(
                        "sendMessageResponse.message.role",
                        "response role must be ROLE_AGENT",
                    ));
                }
                Ok(())
            }
            _ => Err(ValidationError::new(
                "sendMessageResponse",
                "exactly one of task or message is required",
            )),
        }
    }
}

fn bounded(path: &'static str, value: &str, max: usize) -> Result<(), ValidationError> {
    if value.len() > max {
        return Err(ValidationError::new(path, format!("exceeds {max} bytes")));
    }
    if value
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err(ValidationError::new(
            path,
            "contains unsupported control characters",
        ));
    }
    Ok(())
}

fn bounded_nonempty(path: &'static str, value: &str, max: usize) -> Result<(), ValidationError> {
    if value.trim().is_empty() {
        return Err(ValidationError::new(path, "must not be empty"));
    }
    bounded(path, value, max)
}

fn bounded_vec<T>(
    path: &'static str,
    values: &[T],
    min: usize,
    max: usize,
) -> Result<(), ValidationError> {
    if values.len() < min || values.len() > max {
        return Err(ValidationError::new(
            path,
            format!("must contain between {min} and {max} items"),
        ));
    }
    Ok(())
}

fn validate_id(path: &'static str, value: &str) -> Result<(), ValidationError> {
    bounded_nonempty(path, value, MAX_ID_BYTES)?;
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err(ValidationError::new(
            path,
            "contains unsupported characters",
        ));
    }
    Ok(())
}

fn validate_optional_id(path: &'static str, value: Option<&str>) -> Result<(), ValidationError> {
    value.map_or(Ok(()), |value| validate_id(path, value))
}

fn validate_string_list(
    path: &'static str,
    values: &[String],
    required: bool,
    max_item_bytes: usize,
) -> Result<(), ValidationError> {
    bounded_vec(path, values, usize::from(required), MAX_LIST_ITEMS)?;
    for value in values {
        bounded_nonempty(path, value, max_item_bytes)?;
    }
    Ok(())
}

fn validate_modes(
    path: &'static str,
    modes: &[String],
    required: bool,
) -> Result<(), ValidationError> {
    validate_string_list(path, modes, required, 256)?;
    for mode in modes {
        validate_media_type(path, mode)?;
    }
    Ok(())
}

fn validate_media_type(path: &'static str, value: &str) -> Result<(), ValidationError> {
    bounded_nonempty(path, value, 256)?;
    let Some((kind, subtype)) = value.split_once('/') else {
        return Err(ValidationError::new(path, "must be a media type"));
    };
    if kind.is_empty() || subtype.is_empty() || value.chars().any(char::is_whitespace) {
        return Err(ValidationError::new(path, "must be a media type"));
    }
    Ok(())
}

fn validate_json(
    path: &'static str,
    value: &Value,
    max_bytes: usize,
) -> Result<(), ValidationError> {
    let bytes =
        serde_json::to_vec(value).map_err(|error| ValidationError::new(path, error.to_string()))?;
    if bytes.len() > max_bytes {
        return Err(ValidationError::new(
            path,
            format!("exceeds {max_bytes} encoded bytes"),
        ));
    }
    if json_depth(value) > MAX_JSON_DEPTH {
        return Err(ValidationError::new(
            path,
            format!("exceeds nesting depth {MAX_JSON_DEPTH}"),
        ));
    }
    Ok(())
}

fn validate_optional_json(
    path: &'static str,
    value: Option<&Value>,
    max_bytes: usize,
) -> Result<(), ValidationError> {
    value.map_or(Ok(()), |value| validate_json(path, value, max_bytes))
}

fn json_depth(value: &Value) -> usize {
    match value {
        Value::Array(values) => 1 + values.iter().map(json_depth).max().unwrap_or(0),
        Value::Object(values) => 1 + values.values().map(json_depth).max().unwrap_or(0),
        _ => 1,
    }
}

fn parse_url(path: &'static str, value: &str) -> Result<Url, ValidationError> {
    bounded_nonempty(path, value, MAX_URL_BYTES)?;
    let url =
        Url::parse(value).map_err(|_| ValidationError::new(path, "must be an absolute URL"))?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err(ValidationError::new(
            path,
            "embedded credentials are forbidden",
        ));
    }
    Ok(url)
}

fn validate_https_url(path: &'static str, value: &str) -> Result<(), ValidationError> {
    let url = parse_url(path, value)?;
    if url.scheme() == "https" && url.host().is_some() {
        return Ok(());
    }
    if url.scheme() == "http" && is_loopback_host(url.host().as_ref()) {
        return Ok(());
    }
    Err(ValidationError::new(
        path,
        "must use HTTPS (HTTP is allowed only for loopback)",
    ))
}

fn is_loopback_host(host: Option<&Host<&str>>) -> bool {
    match host {
        Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(address)) => address.is_loopback(),
        Some(Host::Ipv6(address)) => address.is_loopback(),
        None => false,
    }
}

fn validate_absolute_uri(path: &'static str, value: &str) -> Result<(), ValidationError> {
    let url = parse_url(path, value)?;
    if url.scheme().is_empty() {
        return Err(ValidationError::new(path, "URI scheme is required"));
    }
    Ok(())
}

fn validate_grpc_address(value: &str) -> Result<(), ValidationError> {
    bounded_nonempty("agentInterface.url", value, MAX_URL_BYTES)?;
    if value.contains(['/', '@']) {
        return Err(ValidationError::new(
            "agentInterface.url",
            "invalid gRPC address",
        ));
    }
    let parsed = Url::parse(&format!("https://{value}"))
        .map_err(|_| ValidationError::new("agentInterface.url", "invalid gRPC address"))?;
    if parsed.host().is_none() || parsed.port().is_none() {
        return Err(ValidationError::new(
            "agentInterface.url",
            "gRPC address needs host and port",
        ));
    }
    Ok(())
}

fn validate_file_reference(value: &str) -> Result<(), ValidationError> {
    bounded_nonempty("part.url", value, MAX_URL_BYTES)?;
    if value.contains("://") {
        return validate_https_url("part.url", value);
    }
    if value.contains(['\\', ':', '%']) || value.starts_with('/') {
        return Err(ValidationError::new(
            "part.url",
            "invalid local artifact reference",
        ));
    }
    let segments: Vec<_> = value.split('/').collect();
    if segments.len() < 2
        || segments.first() != Some(&"artifacts")
        || segments
            .iter()
            .any(|segment| segment.is_empty() || matches!(*segment, "." | ".."))
        || Path::new(value).is_absolute()
    {
        return Err(ValidationError::new(
            "part.url",
            "local references must remain under artifacts/",
        ));
    }
    if segments.iter().any(|segment| {
        !segment
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    }) {
        return Err(ValidationError::new(
            "part.url",
            "local artifact reference contains unsupported characters",
        ));
    }
    Ok(())
}

fn validate_filename(value: &str) -> Result<(), ValidationError> {
    bounded_nonempty("part.filename", value, MAX_NAME_BYTES)?;
    if value == "." || value == ".." || value.contains(['/', '\\']) {
        return Err(ValidationError::new(
            "part.filename",
            "must be a single filename",
        ));
    }
    Ok(())
}

fn validate_uri_list(path: &'static str, values: &[String]) -> Result<(), ValidationError> {
    bounded_vec(path, values, 0, MAX_LIST_ITEMS)?;
    for value in values {
        validate_absolute_uri(path, value)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn message(role: Role, part: Part) -> Message {
        Message {
            message_id: "msg-1".to_owned(),
            context_id: Some("ctx-1".to_owned()),
            task_id: None,
            role,
            parts: vec![part],
            metadata: None,
            extensions: Vec::new(),
            reference_task_ids: Vec::new(),
        }
    }

    #[test]
    fn send_message_round_trips_protojson_names() {
        let request = SendMessageRequest {
            tenant: None,
            message: message(Role::User, Part::text("hello")),
            configuration: Some(SendMessageConfiguration {
                accepted_output_modes: vec!["text/plain".to_owned()],
                history_length: Some(4),
                return_immediately: true,
            }),
            metadata: None,
        };

        let bytes = to_json(&request).expect("valid request");
        let json: Value = serde_json::from_slice(&bytes).expect("JSON");
        assert_eq!(json["message"]["role"], "ROLE_USER");
        assert_eq!(json["configuration"]["returnImmediately"], true);
        let decoded: SendMessageRequest = from_json(&bytes).expect("round trip");
        assert_eq!(decoded, request);
    }

    #[test]
    fn rejects_unknown_fields() {
        let bytes = br#"{
            "message": {
                "messageId": "msg-1",
                "role": "ROLE_USER",
                "parts": [{"text": "hello", "raw": "c2VjcmV0"}]
            }
        }"#;

        assert!(matches!(
            from_json::<SendMessageRequest>(bytes),
            Err(DecodeError::Json(_))
        ));
    }

    #[test]
    fn rejects_oversized_text_and_wire_payload() {
        let request = SendMessageRequest {
            tenant: None,
            message: message(Role::User, Part::text("x".repeat(MAX_TEXT_BYTES + 1))),
            configuration: None,
            metadata: None,
        };
        assert!(matches!(to_json(&request), Err(DecodeError::Validation(_))));

        let bytes = vec![b' '; MAX_WIRE_BYTES + 1];
        assert!(matches!(
            from_json::<SendMessageRequest>(&bytes),
            Err(DecodeError::TooLarge { .. })
        ));
    }

    #[test]
    fn rejects_invalid_interface_url_and_protocol() {
        let invalid_url = AgentInterface {
            url: "not a URL".to_owned(),
            protocol_binding: "HTTP+JSON".to_owned(),
            tenant: None,
            protocol_version: PROTOCOL_VERSION.to_owned(),
        };
        assert!(invalid_url.validate().is_err());

        let wrong_version = AgentInterface {
            url: "https://agent.example/a2a".to_owned(),
            protocol_binding: "HTTP+JSON".to_owned(),
            tenant: None,
            protocol_version: "0.3".to_owned(),
        };
        assert!(wrong_version.validate().is_err());
    }

    #[test]
    fn permits_https_and_loopback_interfaces_only() {
        for url in [
            "https://agent.example/a2a",
            "http://localhost:8123/a2a",
            "http://127.0.0.1:8123/a2a",
        ] {
            AgentInterface {
                url: url.to_owned(),
                protocol_binding: "HTTP+JSON".to_owned(),
                tenant: None,
                protocol_version: PROTOCOL_VERSION.to_owned(),
            }
            .validate()
            .expect("allowed interface");
        }
        let interface = AgentInterface {
            url: "http://agent.example/a2a".to_owned(),
            protocol_binding: "HTTP+JSON".to_owned(),
            tenant: None,
            protocol_version: PROTOCOL_VERSION.to_owned(),
        };
        assert!(interface.validate().is_err());
    }

    #[test]
    fn rejects_traversal_absolute_and_arbitrary_authority_file_refs() {
        for reference in [
            "../secret",
            "/etc/passwd",
            "artifacts/../secret",
            "file:///etc/passwd",
            "file://attacker/share/file",
            "ssh://attacker/file",
            "//attacker/share",
        ] {
            let part = Part::file(reference, "file.txt", "text/plain");
            assert!(part.validate().is_err(), "accepted {reference}");
        }

        Part::file(
            "artifacts/sha256-deadbeef/file.txt",
            "file.txt",
            "text/plain",
        )
        .validate()
        .expect("workspace artifact reference");
        Part::file(
            "https://peer.example/artifacts/file.txt",
            "file.txt",
            "text/plain",
        )
        .validate()
        .expect("HTTPS artifact reference");
    }

    #[test]
    fn rejects_multiple_part_contents() {
        let part = Part {
            text: Some("hello".to_owned()),
            data: Some(json!({"also": "data"})),
            url: None,
            metadata: None,
            filename: None,
            media_type: None,
        };
        assert!(part.validate().is_err());
    }

    #[test]
    fn rejects_deep_or_large_structured_data() {
        let mut value = json!("leaf");
        for _ in 0..=MAX_JSON_DEPTH {
            value = json!({"nested": value});
        }
        assert!(Part::data(value).validate().is_err());

        assert!(
            Part::data(json!({"value": "x".repeat(MAX_DATA_BYTES)}))
                .validate()
                .is_err()
        );
    }

    #[test]
    fn send_response_is_a_strict_oneof() {
        let none = SendMessageResponse {
            task: None,
            message: None,
        };
        assert!(none.validate().is_err());

        let response = SendMessageResponse {
            task: None,
            message: Some(message(Role::Agent, Part::text("done"))),
        };
        response.validate().expect("valid response");
    }
}
