//! Typed decisions from Pollinations' Jev model (`/alpha/decisions`).
//!
//! Jev answers independent `choice`, `score`, and `noul` (yes/no probability)
//! questions about supplied facts, with calibrated probabilities. It is the
//! same call Pollinations' Ask Jev MCP server makes, without the extra hop.

use std::fmt::Write as _;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use reqwest::Client;
use serde_json::{Map, Value, json};

use crate::search::{truncate_utf8, wait_for_cancellation};

const DECISION_MODEL: &str = "typesafe/jev-1.13";
const DECISIONS_URL: &str = "https://gen.pollinations.ai/alpha/decisions";
const MAX_QUESTIONS: usize = 16;
/// Jev accepts up to 64k tokens of state and questions; stay well inside it.
const MAX_REQUEST_BYTES: usize = 128 * 1024;

/// Runtime-only configuration for the Jev decision tool.
#[derive(Clone)]
pub struct JevDecisionConfig {
    api_key: String,
    request_timeout: Duration,
    max_output_bytes: usize,
}

impl JevDecisionConfig {
    /// Creates a bounded decision configuration. The key is never formatted.
    ///
    /// # Errors
    ///
    /// Returns an error when the credential or output limit is empty.
    pub fn new(api_key: impl Into<String>, max_output_bytes: usize) -> Result<Self> {
        let api_key = api_key.into();
        if api_key.trim().is_empty() {
            bail!("Pollinations API key is empty");
        }
        if max_output_bytes == 0 {
            bail!("decision output limit must be positive");
        }
        Ok(Self {
            api_key,
            request_timeout: Duration::from_secs(45),
            max_output_bytes,
        })
    }
}

impl std::fmt::Debug for JevDecisionConfig {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("JevDecisionConfig")
            .field("api_key", &"[REDACTED]")
            .field("request_timeout", &self.request_timeout)
            .field("max_output_bytes", &self.max_output_bytes)
            .finish()
    }
}

/// Registers the permission-gated `jev_decide` tool.
///
/// # Errors
///
/// Returns an error when the HTTP client or tool descriptor cannot be created.
pub fn register_jev_decision_tool(host: &mut ToolHost, config: JevDecisionConfig) -> Result<()> {
    let client = Client::builder()
        .timeout(config.request_timeout)
        .build()
        .context("failed to construct decision client")?;
    host.register(
        ToolDescriptor {
            name: "jev_decide".to_owned(),
            description: "Get calibrated judgments from Pollinations' Jev decision model about facts you supply in `state`. Each named question is answered independently: `choice` picks one key from `criteria` (an object mapping option keys to what they mean), `score` places the state on an ordered scale (`criteria` is a list from lowest to highest), and `noul` gives the probability that a yes/no proposition is true. Answers carry probabilities and confidence. Use it to rank or triage options, for example before asking the user, or to classify text; put every relevant fact in `state`, because confidence can stay high when facts are missing. Do counting, arithmetic, and date comparisons yourself. Sends the state to Pollinations; requires network permission.".to_owned(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "state": {
                        "description": "The facts to judge: a string or any JSON."
                    },
                    "questions": {
                        "type": "object",
                        "description": "Questions keyed by a name you choose; each is answered under the same key.",
                        "minProperties": 1,
                        "maxProperties": MAX_QUESTIONS,
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string", "enum": ["choice", "score", "noul"]},
                                "instructions": {"description": "What to decide, rate, or evaluate."},
                                "criteria": {"description": "choice: object of option keys to meanings; score: list of at least two rungs, lowest first; noul: optional {true, false} descriptions."}
                            },
                            "required": ["type", "instructions"]
                        }
                    }
                },
                "required": ["state", "questions"],
                "additionalProperties": false
            }),
            risk: RiskClass::NetworkAccess,
            transport: ToolTransport::Native,
        },
        Arc::new(JevDecision { client, config }),
    )
}

#[derive(Clone)]
struct JevDecision {
    client: Client,
    config: JevDecisionConfig,
}

impl ToolHandler for JevDecision {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        let request = match decision_request(arguments) {
            Ok(request) => request,
            Err(error) => return Ok(ToolOutput::error(error.to_string())),
        };
        let tool = self.clone();
        let cancellation = cancellation.clone();
        thread::Builder::new()
            .name("crumb-jev-decision".to_owned())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .context("failed to start decision runtime")?;
                runtime.block_on(tool.decide(&request, &cancellation))
            })
            .context("failed to start decision worker")?
            .join()
            .map_err(|_| anyhow!("decision worker failed"))?
    }
}

impl JevDecision {
    async fn decide(
        &self,
        request: &Value,
        cancellation: &CancellationToken,
    ) -> Result<ToolOutput> {
        let send = self
            .client
            .post(DECISIONS_URL)
            .bearer_auth(&self.config.api_key)
            .json(request)
            .send();
        let response = tokio::select! {
            result = send => result.context("decision request failed")?,
            () = wait_for_cancellation(cancellation) => bail!("decision cancelled"),
        };
        let status = response.status();
        if !status.is_success() {
            return Ok(ToolOutput::error(format!(
                "Jev rejected the decision request with HTTP {}",
                status.as_u16()
            )));
        }
        let payload = response
            .json::<Value>()
            .await
            .context("decision response was not JSON")?;
        let answers = payload
            .get("answers")
            .and_then(Value::as_object)
            .context("decision response has no answers")?;
        let summary = summarize_answers(answers, request);
        Ok(ToolOutput {
            text: truncate_utf8(&summary, self.config.max_output_bytes).to_owned(),
            structured: Some(json!({
                "model": payload.get("model").cloned().unwrap_or_else(|| json!(DECISION_MODEL)),
                "answers": answers,
            })),
            is_error: false,
        })
    }
}

/// Validates tool arguments and builds the `/alpha/decisions` body.
fn decision_request(arguments: &Value) -> Result<Value> {
    let state = arguments.get("state").context("state is required")?;
    if state.is_null() || state.as_str().is_some_and(|text| text.trim().is_empty()) {
        bail!("state must describe the facts to judge");
    }
    let questions = arguments
        .get("questions")
        .and_then(Value::as_object)
        .context("questions must be an object of named questions")?;
    if questions.is_empty() || questions.len() > MAX_QUESTIONS {
        bail!("ask between 1 and {MAX_QUESTIONS} questions");
    }
    for (name, question) in questions {
        let kind = question.get("type").and_then(Value::as_str);
        let criteria = question.get("criteria");
        if question.get("instructions").is_none() {
            bail!("question `{name}` needs instructions");
        }
        match kind {
            Some("choice")
                if criteria
                    .and_then(Value::as_object)
                    .is_some_and(|c| !c.is_empty()) => {}
            Some("choice") => bail!("choice question `{name}` needs criteria mapping options"),
            Some("score")
                if criteria
                    .and_then(Value::as_array)
                    .is_some_and(|c| c.len() >= 2) => {}
            Some("score") => bail!("score question `{name}` needs at least two ordered criteria"),
            Some("noul") => {}
            _ => bail!("question `{name}` must have type choice, score, or noul"),
        }
    }
    let request = json!({
        "model": DECISION_MODEL,
        "state": state,
        "questions": questions,
    });
    if serde_json::to_vec(&request).map_or(usize::MAX, |bytes| bytes.len()) > MAX_REQUEST_BYTES {
        bail!(
            "state and questions exceed {MAX_REQUEST_BYTES} bytes; supply only the relevant facts"
        );
    }
    Ok(request)
}

/// One readable line per answer, in the order the questions were asked.
fn summarize_answers(answers: &Map<String, Value>, request: &Value) -> String {
    let mut summary = String::from("Jev decisions:\n");
    let names = request
        .get("questions")
        .and_then(Value::as_object)
        .map(|questions| questions.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    for name in names {
        let Some(answer) = answers.get(&name) else {
            let _ = writeln!(summary, "- {name}: no answer");
            continue;
        };
        let confidence = answer
            .get("confidence")
            .and_then(Value::as_f64)
            .map_or(String::new(), |confidence| {
                format!(" (confidence {confidence:.2})")
            });
        let line = match answer.get("type").and_then(Value::as_str) {
            Some("choice") => format!(
                "choice `{name}`: {}{confidence}{}",
                answer.get("choice").and_then(Value::as_str).unwrap_or("?"),
                probabilities(answer)
            ),
            Some("score") => format!(
                "score `{name}`: {} on the scale{confidence}; legend {}",
                answer
                    .get("score")
                    .and_then(Value::as_f64)
                    .map_or("?".to_owned(), |score| format!("{score:.2}")),
                answer
                    .get("legend")
                    .map_or("{}".to_owned(), Value::to_string)
            ),
            Some("noul") => format!(
                "noul `{name}`: {} probability true",
                answer.get("noul").and_then(Value::as_f64).map_or(
                    "?".to_owned(),
                    |probability| format!("{:.0}%", probability * 100.0)
                )
            ),
            _ => format!("{name}: {answer}"),
        };
        let _ = writeln!(summary, "- {line}");
    }
    summary
}

fn probabilities(answer: &Value) -> String {
    let Some(probabilities) = answer.get("probabilities").and_then(Value::as_object) else {
        return String::new();
    };
    let mut ranked = probabilities
        .iter()
        .filter_map(|(option, probability)| Some((option, probability.as_f64()?)))
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| right.1.total_cmp(&left.1));
    let listed = ranked
        .iter()
        .map(|(option, probability)| format!("{option} {probability:.2}"))
        .collect::<Vec<_>>()
        .join(", ");
    format!("; {listed}")
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{decision_request, summarize_answers};

    #[test]
    fn requests_are_validated_and_pinned_to_jev() {
        let request = decision_request(&json!({
            "state": "Payouts have failed for three days.",
            "questions": {
                "team": {"type": "choice", "instructions": "Who handles this?", "criteria": {"billing": "payments", "technical": "bugs"}},
                "urgency": {"type": "score", "instructions": "How urgent?", "criteria": ["low", "medium", "high"]},
                "angry": {"type": "noul", "instructions": "Is the user upset?"}
            }
        }))
        .expect("valid request");
        assert_eq!(request["model"], "typesafe/jev-1.13");
        assert_eq!(
            request["questions"].as_object().map(serde_json::Map::len),
            Some(3)
        );

        for invalid in [
            json!({"state": "x", "questions": {}}),
            json!({"state": "", "questions": {"q": {"type": "noul", "instructions": "?"}}}),
            json!({"state": "x", "questions": {"q": {"type": "choice", "instructions": "?"}}}),
            json!({"state": "x", "questions": {"q": {"type": "score", "instructions": "?", "criteria": ["one"]}}}),
            json!({"state": "x", "questions": {"q": {"type": "rank", "instructions": "?"}}}),
        ] {
            assert!(decision_request(&invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn answers_summarize_with_ranked_probabilities() {
        let request = json!({"questions": {"team": {}, "urgency": {}, "angry": {}}});
        let answers = json!({
            "team": {"type": "choice", "choice": "billing", "confidence": 0.82, "probabilities": {"technical": 0.18, "billing": 0.82}},
            "urgency": {"type": "score", "score": 2.4, "confidence": 0.7, "legend": {"0": "low", "1": "medium", "2": "high"}, "probabilities": {}},
            "angry": {"type": "noul", "noul": 0.91}
        });
        let summary = summarize_answers(answers.as_object().expect("object"), &request);
        assert!(
            summary
                .contains("choice `team`: billing (confidence 0.82); billing 0.82, technical 0.18")
        );
        assert!(summary.contains("score `urgency`: 2.40 on the scale (confidence 0.70)"));
        assert!(summary.contains("noul `angry`: 91% probability true"));
    }
}
