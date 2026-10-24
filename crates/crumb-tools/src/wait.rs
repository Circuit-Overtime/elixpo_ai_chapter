//! Cancellable, bounded waits for interval-based agent monitoring.

use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use serde_json::{Value, json};

const WAIT_TOOL: &str = "wait";
const MAX_REASON_BYTES: usize = 128;
const CANCELLATION_POLL: Duration = Duration::from_millis(50);

/// Upper bounds for one agent-requested wait.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct WaitToolLimits {
    pub max_duration: Duration,
    pub min_status_interval: Duration,
}

impl Default for WaitToolLimits {
    fn default() -> Self {
        Self {
            max_duration: Duration::from_mins(15),
            min_status_interval: Duration::from_millis(250),
        }
    }
}

/// Registers a read-only wait primitive that remains responsive to turn cancellation.
///
/// The tool emits countdown progress at a caller-selected interval. It is intended
/// for waiting between bounded status checks, not for running commands itself.
///
/// # Errors
///
/// Returns an error for zero limits or when the tool name is already registered.
pub fn register_wait_tool(host: &mut ToolHost, limits: WaitToolLimits) -> Result<()> {
    if limits.max_duration.is_zero() || limits.min_status_interval.is_zero() {
        bail!("wait tool limits must be positive");
    }
    host.register(descriptor(limits), Arc::new(WaitTool { limits }))
}

struct WaitTool {
    limits: WaitToolLimits,
}

impl ToolHandler for WaitTool {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        self.call_with_progress(arguments, cancellation, &mut |_| {})
    }

    fn call_with_progress(
        &self,
        arguments: &Value,
        cancellation: &CancellationToken,
        progress: &mut dyn FnMut(&str),
    ) -> Result<ToolOutput> {
        ensure_active(cancellation)?;
        let request = parse_wait_request(arguments, self.limits)?;

        let started = Instant::now();
        let deadline = started + request.duration;
        let mut next_status = started;
        loop {
            ensure_active(cancellation)?;
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            if now >= next_status {
                let remaining = deadline.saturating_duration_since(now);
                let label = request.reason.map_or_else(
                    || format!("Waiting · {} remaining", display_seconds(remaining)),
                    |reason| {
                        format!(
                            "Waiting · {reason} · {} remaining",
                            display_seconds(remaining)
                        )
                    },
                );
                progress(&label);
                next_status = now + request.status_interval;
            }
            let sleep_for = CANCELLATION_POLL
                .min(deadline.saturating_duration_since(now))
                .min(next_status.saturating_duration_since(now));
            if !sleep_for.is_zero() {
                thread::sleep(sleep_for);
            }
        }
        ensure_active(cancellation)?;
        let elapsed = started.elapsed();
        Ok(ToolOutput {
            text: request.reason.map_or_else(
                || format!("Waited {}.", display_seconds(request.duration)),
                |reason| format!("Waited {} for {reason}.", display_seconds(request.duration)),
            ),
            structured: Some(json!({
                "requested_seconds": request.duration.as_secs_f64(),
                "base_seconds": request.base_duration.as_secs_f64(),
                "attempt": request.attempt,
                "backoff_multiplier": request.multiplier,
                "elapsed_millis": elapsed.as_millis(),
                "reason": request.reason,
            })),
            is_error: false,
        })
    }
}

struct WaitRequest<'a> {
    base_duration: Duration,
    duration: Duration,
    status_interval: Duration,
    attempt: u32,
    multiplier: f64,
    reason: Option<&'a str>,
}

fn parse_wait_request(arguments: &Value, limits: WaitToolLimits) -> Result<WaitRequest<'_>> {
    let base_duration = duration_argument(arguments, "seconds")?;
    if base_duration > limits.max_duration {
        bail!(
            "seconds must be greater than zero and at most {}",
            display_seconds(limits.max_duration)
        );
    }
    let attempt_u64 = arguments.get("attempt").map_or(Ok(0), |value| {
        value.as_u64().context("attempt must be an integer")
    })?;
    let attempt = u32::try_from(attempt_u64).context("attempt is outside the supported range")?;
    if attempt > 16 {
        bail!("attempt must be between 0 and 16");
    }
    let multiplier = arguments
        .get("backoff_multiplier")
        .map_or(Ok(1.0), |value| {
            value
                .as_f64()
                .context("backoff_multiplier must be a number")
        })?;
    if !multiplier.is_finite() || !(1.0..=4.0).contains(&multiplier) {
        bail!("backoff_multiplier must be between 1 and 4");
    }
    let cap = arguments
        .get("max_seconds")
        .map(|_| duration_argument(arguments, "max_seconds"))
        .transpose()?
        .unwrap_or(limits.max_duration)
        .min(limits.max_duration);
    let exponent = i32::try_from(attempt).context("attempt exponent is unsupported")?;
    let scaled_seconds = base_duration.as_secs_f64() * multiplier.powi(exponent);
    let duration = Duration::try_from_secs_f64(scaled_seconds.min(cap.as_secs_f64()))
        .context("calculated wait is outside the supported range")?;
    let requested_status_interval = arguments
        .get("status_interval_seconds")
        .map(|_| duration_argument(arguments, "status_interval_seconds"))
        .transpose()?;
    let status_interval = requested_status_interval.unwrap_or(Duration::from_secs(1).min(duration));
    if (requested_status_interval.is_some() && status_interval < limits.min_status_interval)
        || status_interval > duration
    {
        bail!(
            "status_interval_seconds must be between {} and the requested wait",
            display_seconds(limits.min_status_interval)
        );
    }
    let reason = arguments
        .get("reason")
        .map(|value| value.as_str().context("reason must be a string"))
        .transpose()?
        .map(str::trim)
        .filter(|reason| !reason.is_empty());
    if reason.is_some_and(|reason| {
        reason.len() > MAX_REASON_BYTES || reason.chars().any(char::is_control)
    }) {
        bail!("reason must be at most {MAX_REASON_BYTES} bytes without control characters");
    }
    Ok(WaitRequest {
        base_duration,
        duration,
        status_interval,
        attempt,
        multiplier,
        reason,
    })
}

fn duration_argument(arguments: &Value, field: &str) -> Result<Duration> {
    let seconds = arguments
        .get(field)
        .and_then(Value::as_f64)
        .with_context(|| format!("{field} must be a number"))?;
    if !seconds.is_finite() || seconds <= 0.0 {
        bail!("{field} must be a positive finite number");
    }
    Duration::try_from_secs_f64(seconds).with_context(|| format!("{field} is outside the range"))
}

fn display_seconds(duration: Duration) -> String {
    let seconds = duration.as_secs_f64();
    if duration.subsec_nanos() == 0 {
        format!("{}s", duration.as_secs())
    } else {
        format!("{seconds:.1}s")
    }
}

fn ensure_active(cancellation: &CancellationToken) -> Result<()> {
    if cancellation.is_cancelled() {
        bail!("tool call cancelled");
    }
    Ok(())
}

fn descriptor(limits: WaitToolLimits) -> ToolDescriptor {
    ToolDescriptor {
        name: WAIT_TOOL.to_owned(),
        description: "Wait for a bounded duration before the next status check. Use this between polling attempts when watching a build, deployment, job, or external process. The wait is cancellable and emits countdown status; after it completes, inspect the target again with the appropriate tool.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "seconds": {
                    "type": "number",
                    "exclusiveMinimum": 0,
                    "maximum": limits.max_duration.as_secs_f64(),
                    "description": "How long to wait before the next check"
                },
                "status_interval_seconds": {
                    "type": "number",
                    "minimum": limits.min_status_interval.as_secs_f64(),
                    "description": "How often to publish a visible countdown update; must not exceed seconds"
                },
                "attempt": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 16,
                    "description": "Zero-based polling attempt used to calculate bounded backoff"
                },
                "backoff_multiplier": {
                    "type": "number",
                    "minimum": 1,
                    "maximum": 4,
                    "description": "Delay multiplier applied once per attempt"
                },
                "max_seconds": {
                    "type": "number",
                    "exclusiveMinimum": 0,
                    "maximum": limits.max_duration.as_secs_f64(),
                    "description": "Cap for the calculated backoff delay"
                },
                "reason": {
                    "type": "string",
                    "maxLength": MAX_REASON_BYTES,
                    "description": "Short safe label for what is being watched"
                }
            },
            "required": ["seconds"],
            "additionalProperties": false
        }),
        risk: RiskClass::ReadOnly,
        transport: ToolTransport::Native,
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use crumb_agent::{AgentMode, CancellationToken, DenyAllApprovals, ToolHost};
    use serde_json::json;

    use super::{WaitToolLimits, register_wait_tool};

    #[test]
    fn bounded_wait_reports_progress_and_completes() {
        let mut host = ToolHost::default();
        register_wait_tool(
            &mut host,
            WaitToolLimits {
                max_duration: Duration::from_secs(1),
                min_status_interval: Duration::from_millis(20),
            },
        )
        .expect("wait registers");
        let mut progress = Vec::new();
        let output = host
            .call_with_progress(
                "wait",
                &json!({
                    "seconds": 0.02,
                    "status_interval_seconds": 0.02,
                    "attempt": 2,
                    "backoff_multiplier": 2,
                    "max_seconds": 0.1,
                    "reason": "CI checks"
                }),
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
                &mut |label| progress.push(label.to_owned()),
            )
            .expect("wait completes");

        assert!(!output.is_error);
        assert!(output.text.contains("CI checks"));
        assert_eq!(output.structured.as_ref().unwrap()["attempt"], 2);
        assert_eq!(
            output.structured.as_ref().unwrap()["requested_seconds"],
            0.08
        );
        assert!(
            progress
                .iter()
                .any(|label| label.starts_with("Waiting · CI checks ·"))
        );
    }

    #[test]
    fn wait_rejects_out_of_bounds_and_honors_cancellation() {
        let mut host = ToolHost::default();
        register_wait_tool(
            &mut host,
            WaitToolLimits {
                max_duration: Duration::from_millis(100),
                min_status_interval: Duration::from_millis(10),
            },
        )
        .expect("wait registers");
        assert!(
            host.call(
                "wait",
                &json!({"seconds": 1}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &CancellationToken::default(),
            )
            .is_err()
        );
        let cancellation = CancellationToken::default();
        cancellation.cancel();
        assert!(
            host.call(
                "wait",
                &json!({"seconds": 0.05}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &cancellation,
            )
            .is_err()
        );
    }
}
