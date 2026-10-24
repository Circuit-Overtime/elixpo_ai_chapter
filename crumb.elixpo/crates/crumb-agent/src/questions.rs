//! Questions an agent asks the user, answered through a trusted frontend.
//!
//! The `ask_user` tool runs on the agent's worker thread; the frontend shows
//! the question and sends the answer back over a bounded channel, the same
//! handoff approvals use. The tool is registered only for interactive turns.

use std::sync::Arc;
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender, TrySendError, sync_channel};
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result};
use serde_json::{Value, json};

use crate::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};

const CANCELLATION_POLL: Duration = Duration::from_millis(10);
const MAX_OPTIONS: usize = 12;
const MAX_TEXT_BYTES: usize = 2_000;

/// How the user answers a question.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QuestionKind {
    /// Pick exactly one option.
    Single,
    /// Pick any number of options.
    Multiple,
    /// Type a free-form answer.
    Text,
}

/// One answer the agent offers.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuestionOption {
    pub label: String,
    pub description: Option<String>,
}

/// A question shown to the user.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserQuestion {
    pub prompt: String,
    pub kind: QuestionKind,
    pub options: Vec<QuestionOption>,
    /// Offer an "Other" row that takes a typed answer.
    pub allow_other: bool,
}

/// The user's reply.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum QuestionAnswer {
    Selected(Vec<String>),
    Text(String),
    Dismissed,
}

/// Creates the bridge between an agent turn and the frontend that answers.
#[must_use]
pub fn question_channel() -> (QuestionAsker, QuestionInbox) {
    let (sender, receiver) = sync_channel(1);
    (QuestionAsker { sender }, QuestionInbox { receiver })
}

/// Worker-side end: blocks until the user answers or the turn is cancelled.
#[derive(Clone)]
pub struct QuestionAsker {
    sender: SyncSender<PendingQuestion>,
}

impl QuestionAsker {
    /// Returns `None` when the turn is cancelled or the frontend is gone.
    #[must_use]
    pub fn ask(
        &self,
        question: UserQuestion,
        cancellation: &CancellationToken,
    ) -> Option<QuestionAnswer> {
        let (responder, answers) = sync_channel(1);
        let mut pending = PendingQuestion {
            question,
            responder,
        };
        loop {
            if cancellation.is_cancelled() {
                return None;
            }
            match self.sender.try_send(pending) {
                Ok(()) => break,
                Err(TrySendError::Full(returned)) => {
                    pending = returned;
                    thread::sleep(CANCELLATION_POLL);
                }
                Err(TrySendError::Disconnected(_)) => return None,
            }
        }
        loop {
            if cancellation.is_cancelled() {
                return None;
            }
            match answers.recv_timeout(CANCELLATION_POLL) {
                Ok(answer) => return Some(answer),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return None,
            }
        }
    }
}

/// Frontend-side end of the question channel.
pub struct QuestionInbox {
    receiver: Receiver<PendingQuestion>,
}

impl QuestionInbox {
    /// Waits briefly for the next question.
    ///
    /// # Errors
    ///
    /// Returns the standard timeout or disconnection state.
    pub fn recv_timeout(
        &self,
        timeout: Duration,
    ) -> std::result::Result<PendingQuestion, RecvTimeoutError> {
        self.receiver.recv_timeout(timeout)
    }
}

/// A question waiting for the user.
pub struct PendingQuestion {
    pub question: UserQuestion,
    responder: SyncSender<QuestionAnswer>,
}

impl PendingQuestion {
    /// Sends the user's answer back to the waiting agent.
    pub fn answer(self, answer: QuestionAnswer) {
        let _ = self.responder.try_send(answer);
    }
}

/// Registers `ask_user`, backed by `asker`.
///
/// # Errors
///
/// Returns an error if the tool name is already registered.
pub fn register_ask_user_tool(host: &mut ToolHost, asker: QuestionAsker) -> Result<()> {
    host.register(
        ToolDescriptor {
            name: "ask_user".to_owned(),
            description: "Ask the user a question and wait for the answer. Use it when a decision is genuinely the user's (a preference, a trade-off, missing information you cannot find with other tools), not to confirm routine steps; tool approvals are requested automatically. Offer 2-6 concrete options when you can; use kind \"multiple\" when several may apply and \"text\" for free-form input.".to_owned(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The question, phrased for the user."},
                    "kind": {"type": "string", "enum": ["single", "multiple", "text"]},
                    "options": {
                        "type": "array",
                        "maxItems": MAX_OPTIONS,
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {"type": "string"},
                                "description": {"type": "string"}
                            },
                            "required": ["label"],
                            "additionalProperties": false
                        }
                    },
                    "allow_other": {"type": "boolean", "description": "Offer an Other choice with a typed answer."}
                },
                "required": ["question", "kind"],
                "additionalProperties": false
            }),
            risk: RiskClass::ReadOnly,
            transport: ToolTransport::Native,
        },
        Arc::new(AskUser { asker }),
    )
}

struct AskUser {
    asker: QuestionAsker,
}

impl ToolHandler for AskUser {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        let question = match parse_question(arguments) {
            Ok(question) => question,
            Err(error) => return Ok(ToolOutput::error(error.to_string())),
        };
        let Some(answer) = self.asker.ask(question, cancellation) else {
            anyhow::bail!("tool call cancelled");
        };
        let text = match &answer {
            QuestionAnswer::Selected(choices) => format!("The user chose: {}", choices.join("; ")),
            QuestionAnswer::Text(text) => format!("The user answered: {text}"),
            QuestionAnswer::Dismissed => {
                "The user dismissed the question without answering. Do not ask again; continue with your best judgment and state the assumption you made.".to_owned()
            }
        };
        Ok(ToolOutput {
            text,
            structured: Some(match answer {
                QuestionAnswer::Selected(choices) => json!({"selected": choices}),
                QuestionAnswer::Text(text) => json!({"text": text}),
                QuestionAnswer::Dismissed => json!({"dismissed": true}),
            }),
            is_error: false,
        })
    }
}

fn parse_question(arguments: &Value) -> Result<UserQuestion> {
    let prompt = arguments
        .get("question")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|prompt| !prompt.is_empty())
        .context("question must be a non-empty string")?;
    let kind = match arguments.get("kind").and_then(Value::as_str) {
        Some("single") => QuestionKind::Single,
        Some("multiple") => QuestionKind::Multiple,
        Some("text") => QuestionKind::Text,
        _ => anyhow::bail!("kind must be single, multiple, or text"),
    };
    let options = arguments
        .get("options")
        .and_then(Value::as_array)
        .map(|options| {
            options
                .iter()
                .take(MAX_OPTIONS)
                .filter_map(|option| {
                    let label = option.get("label")?.as_str()?.trim();
                    (!label.is_empty()).then(|| QuestionOption {
                        label: truncate(label),
                        description: option
                            .get("description")
                            .and_then(Value::as_str)
                            .map(truncate),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if kind != QuestionKind::Text && options.is_empty() {
        anyhow::bail!("single and multiple questions need at least one option");
    }
    Ok(UserQuestion {
        prompt: truncate(prompt),
        kind,
        options,
        allow_other: arguments
            .get("allow_other")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

fn truncate(text: &str) -> String {
    let mut end = text.len().min(MAX_TEXT_BYTES);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_owned()
}

#[cfg(test)]
mod tests {
    use std::thread;

    use serde_json::json;

    use super::{QuestionAnswer, QuestionKind, parse_question, question_channel};
    use crate::CancellationToken;

    #[test]
    fn questions_parse_with_options_and_reject_empty_choices() {
        let question = parse_question(&json!({
            "question": "Which database?",
            "kind": "single",
            "options": [{"label": "SQLite", "description": "embedded"}, {"label": "Postgres"}],
            "allow_other": true
        }))
        .expect("valid question");
        assert_eq!(question.kind, QuestionKind::Single);
        assert_eq!(question.options.len(), 2);
        assert!(question.allow_other);

        assert!(parse_question(&json!({"question": "Pick", "kind": "multiple"})).is_err());
        assert!(parse_question(&json!({"question": "Name?", "kind": "text"})).is_ok());
        assert!(parse_question(&json!({"question": " ", "kind": "text"})).is_err());
    }

    #[test]
    fn answers_travel_back_to_the_asking_thread() {
        let (asker, inbox) = question_channel();
        let worker = thread::spawn(move || {
            let question = parse_question(&json!({"question": "Ship it?", "kind": "text"}))
                .expect("valid question");
            asker.ask(question, &CancellationToken::default())
        });
        let pending = inbox
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("question arrives");
        assert_eq!(pending.question.prompt, "Ship it?");
        pending.answer(QuestionAnswer::Text("yes".to_owned()));
        assert_eq!(
            worker.join().expect("worker joins"),
            Some(QuestionAnswer::Text("yes".to_owned()))
        );
    }

    #[test]
    fn cancellation_releases_a_waiting_question() {
        let (asker, _inbox) = question_channel();
        let cancellation = CancellationToken::default();
        cancellation.cancel();
        let question =
            parse_question(&json!({"question": "Wait?", "kind": "text"})).expect("valid question");
        assert_eq!(asker.ask(question, &cancellation), None);
    }
}
