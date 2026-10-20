//! Cross-platform current-time lookup without shell or network access.

use std::sync::Arc;

use anyhow::{Context, Result, bail};
use chrono::{FixedOffset, SecondsFormat, Utc};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use serde_json::{Value, json};

/// Registers a read-only clock tool using an explicit UTC offset.
///
/// # Errors
///
/// Returns an error if the tool name is already registered.
pub fn register_current_time_tool(host: &mut ToolHost) -> Result<()> {
    host.register(
        ToolDescriptor {
            name: "current_time".to_owned(),
            description: "Return the verified current date and time for an explicit UTC offset such as +05:30. Use this for current local-time questions without shell or web access.".to_owned(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "utc_offset": {
                        "type": "string",
                        "pattern": "^[+-](0[0-9]|1[0-4]):[0-5][0-9]$",
                        "description": "UTC offset in ±HH:MM form"
                    }
                },
                "required": ["utc_offset"],
                "additionalProperties": false
            }),
            risk: RiskClass::ReadOnly,
            transport: ToolTransport::Native,
        },
        Arc::new(CurrentTime),
    )
}

struct CurrentTime;

impl ToolHandler for CurrentTime {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        if cancellation.is_cancelled() {
            bail!("tool call cancelled");
        }
        let requested = arguments
            .get("utc_offset")
            .and_then(Value::as_str)
            .context("utc_offset must be a string")?;
        let offset = parse_offset(requested)?;
        let current = Utc::now().with_timezone(&offset);
        let timestamp = current.to_rfc3339_opts(SecondsFormat::Secs, false);
        Ok(ToolOutput {
            text: format!("Current time at UTC{requested}: {timestamp}"),
            structured: Some(json!({
                "utc_offset": requested,
                "timestamp": timestamp
            })),
            is_error: false,
        })
    }
}

fn parse_offset(value: &str) -> Result<FixedOffset> {
    let bytes = value.as_bytes();
    if bytes.len() != 6
        || !matches!(bytes[0], b'+' | b'-')
        || bytes[3] != b':'
        || ![bytes[1], bytes[2], bytes[4], bytes[5]]
            .into_iter()
            .all(|byte| byte.is_ascii_digit())
    {
        bail!("utc_offset must use ±HH:MM form");
    }
    let hours = i32::from(bytes[1] - b'0') * 10 + i32::from(bytes[2] - b'0');
    let minutes = i32::from(bytes[4] - b'0') * 10 + i32::from(bytes[5] - b'0');
    if hours > 14 || minutes > 59 || (hours == 14 && minutes != 0) {
        bail!("utc_offset is outside the supported range");
    }
    let seconds = hours
        .saturating_mul(3_600)
        .saturating_add(minutes.saturating_mul(60));
    let seconds = if bytes[0] == b'-' { -seconds } else { seconds };
    FixedOffset::east_opt(seconds).context("utc_offset is invalid")
}

#[cfg(test)]
mod tests {
    use crumb_agent::{AgentMode, CancellationToken, DenyAllApprovals, ToolHost};
    use serde_json::json;

    use super::{parse_offset, register_current_time_tool};

    #[test]
    fn current_time_is_read_only_and_supports_half_hour_offsets() {
        let mut host = ToolHost::default();
        register_current_time_tool(&mut host).expect("clock registers");

        let output = host
            .call(
                "current_time",
                &json!({"utc_offset":"+05:30"}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
            )
            .expect("read-only clock executes automatically");

        assert!(output.text.contains("UTC+05:30"));
        assert!(output.text.contains("+05:30"));
        assert!(parse_offset("+14:30").is_err());
    }
}
