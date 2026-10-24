//! Bounded read-only parallel analysis exposed as one native tool.

use std::num::NonZeroUsize;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use crumb_agent::{
    AgentMode, AgentSession, CancellationToken, DenyAllApprovals, RiskClass, SessionId,
    SessionJournal, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
    tool_activity_label,
};
use crumb_llm::LlmProvider;
use serde_json::{Value, json};

use crate::{EventSink, HarnessEvent, HarnessLimits, HarnessTurn, NativeHarness};

const SPAWN_AGENTS: &str = "spawn_agents";
const NAMES: [&str; 8] = ["Koi", "Nyx", "Rune", "Echo", "Lux", "Mica", "Rook", "Zed"];
const LOGOS: [&str; 4] = ["◆", "●", "▲", "■"];
const HARD_MAX_AGENTS: usize = 4;
const MAX_AGENT_NAME_BYTES: usize = 32;
const MAX_AGENT_LOGO_BYTES: usize = 16;
static NEXT_TEAM: AtomicU64 = AtomicU64::new(1);

/// Hard ceilings for one parallel-analysis request.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ParallelAgentLimits {
    pub max_agents: NonZeroUsize,
    pub max_task_bytes: NonZeroUsize,
    pub max_result_bytes: NonZeroUsize,
}

impl Default for ParallelAgentLimits {
    fn default() -> Self {
        Self {
            max_agents: NonZeroUsize::new(4).expect("constant is non-zero"),
            max_task_bytes: NonZeroUsize::new(8 * 1024).expect("constant is non-zero"),
            max_result_bytes: NonZeroUsize::new(16 * 1024).expect("constant is non-zero"),
        }
    }
}

/// Provider and session settings inherited by read-only subagents.
#[derive(Clone)]
pub struct ParallelAgentConfig {
    pub workspace: PathBuf,
    pub journal_root: PathBuf,
    pub model: String,
    pub max_output_tokens: Option<u32>,
    pub harness_limits: HarnessLimits,
    pub team_limits: ParallelAgentLimits,
}

/// Adds a non-recursive `spawn_agents` tool backed by independent native Harness turns.
///
/// The supplied host is cloned before registration and narrowed to read-only tools,
/// so children cannot mutate the workspace, use network tools, or spawn more agents.
///
/// # Errors
///
/// Returns an error when paths, limits, or model configuration are invalid.
pub fn register_parallel_agent_tool(
    host: &mut ToolHost,
    provider: Arc<dyn LlmProvider>,
    config: ParallelAgentConfig,
) -> Result<()> {
    if config.team_limits.max_agents.get() > HARD_MAX_AGENTS {
        bail!("parallel agent limit cannot exceed the hard maximum of {HARD_MAX_AGENTS}");
    }
    if config.model.trim().is_empty() {
        bail!("parallel agent model must not be empty");
    }
    let workspace = std::fs::canonicalize(&config.workspace).with_context(|| {
        format!(
            "failed to resolve parallel agent workspace `{}`",
            config.workspace.display()
        )
    })?;
    if !workspace.is_dir() {
        bail!("parallel agent workspace must be a directory");
    }
    std::fs::create_dir_all(&config.journal_root).with_context(|| {
        format!(
            "failed to create parallel agent journal root `{}`",
            config.journal_root.display()
        )
    })?;
    let child_tools = host.read_only();
    host.register(
        descriptor(config.team_limits),
        Arc::new(ParallelAgentTool {
            provider,
            child_tools,
            config: ParallelAgentConfig {
                workspace,
                ..config
            },
        }),
    )
}

struct ParallelAgentTool {
    provider: Arc<dyn LlmProvider>,
    child_tools: ToolHost,
    config: ParallelAgentConfig,
}

impl ToolHandler for ParallelAgentTool {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        self.call_with_progress(arguments, cancellation, &mut |_| {})
    }

    fn call_with_progress(
        &self,
        arguments: &Value,
        cancellation: &CancellationToken,
        progress: &mut dyn FnMut(&str),
    ) -> Result<ToolOutput> {
        match run_team(self, arguments, cancellation, progress) {
            Ok(output) => Ok(output),
            Err(error) if cancellation.is_cancelled() => Err(error),
            Err(error) => Ok(ToolOutput::error(error.to_string())),
        }
    }
}

fn run_team(
    tool: &ParallelAgentTool,
    arguments: &Value,
    cancellation: &CancellationToken,
    progress: &mut dyn FnMut(&str),
) -> Result<ToolOutput> {
    ensure_active(cancellation)?;
    let request = parse_request(arguments, tool.config.team_limits)?;
    let team = team_id();
    let assignments = request.assignments;
    let (activity_tx, activity_rx) = mpsc::sync_channel(64);
    let mut workers = Vec::with_capacity(assignments.len());
    for (index, assignment) in assignments.iter().cloned().enumerate() {
        let provider = Arc::clone(&tool.provider);
        let child_tools = tool.child_tools.clone();
        let config = tool.config.clone();
        let worker = WorkerSpec {
            team: team.clone(),
            objective: request.objective.clone(),
            assignments: assignments.clone(),
            index,
            name: assignment.name,
            logo: assignment.logo,
            task: assignment.task,
            provider,
            tools: child_tools,
            config,
            cancellation: cancellation.clone(),
            activity: activity_tx.clone(),
        };
        workers.push(
            thread::Builder::new()
                .name(format!("crumb-{}", worker.name.to_ascii_lowercase()))
                .spawn(move || run_worker(worker))
                .context("failed to start parallel agent")?,
        );
    }
    drop(activity_tx);

    let total = workers.len();
    let mut reported_active = None;
    loop {
        let active = workers
            .iter()
            .filter(|worker| !worker.is_finished())
            .count();
        if reported_active != Some(active) {
            progress(&team_progress_label(active, total));
            reported_active = Some(active);
        }
        if active == 0 {
            break;
        }
        match activity_rx.recv_timeout(Duration::from_millis(40)) {
            Ok(label) => progress(&label),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    while let Ok(label) = activity_rx.try_recv() {
        progress(&label);
    }
    let mut findings = Vec::with_capacity(workers.len());
    for worker in workers {
        findings.push(
            worker
                .join()
                .map_err(|_| anyhow::anyhow!("parallel agent worker panicked"))??,
        );
    }
    ensure_active(cancellation)?;
    let reports = findings
        .iter()
        .map(|finding| {
            format!(
                "{} {} [{}]:\n{}",
                finding.logo,
                finding.name,
                if finding.failed { "failed" } else { "complete" },
                finding.text
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let text = bounded_text(
        format!(
            "Team {team} report\nObjective: {}\n\n{reports}\n\nParent action: reconcile agreements, conflicts, and evidence into one final response.",
            request.objective
        ),
        tool.config.harness_limits.max_output_bytes.get(),
    );
    Ok(ToolOutput {
        text,
        structured: Some(json!({
            "team_id": team,
            "objective": request.objective,
            "status": if findings.iter().any(|finding| finding.failed) { "partial" } else { "complete" },
            "agents": findings.iter().map(|finding| json!({
                "name": finding.name,
                "logo": finding.logo,
                "session_id": finding.session_id,
                "status": if finding.failed { "failed" } else { "complete" },
                "finding": finding.text,
            })).collect::<Vec<_>>()
        })),
        is_error: findings.iter().any(|finding| finding.failed),
    })
}

struct Finding {
    name: String,
    logo: String,
    session_id: String,
    text: String,
    failed: bool,
}

struct WorkerSpec {
    team: String,
    objective: String,
    assignments: Vec<AgentAssignment>,
    index: usize,
    name: String,
    logo: String,
    task: String,
    provider: Arc<dyn LlmProvider>,
    tools: ToolHost,
    config: ParallelAgentConfig,
    cancellation: CancellationToken,
    activity: SyncSender<String>,
}

fn run_worker(worker: WorkerSpec) -> Result<Finding> {
    let WorkerSpec {
        team,
        objective,
        assignments,
        index,
        name,
        logo,
        task,
        provider,
        tools,
        config,
        cancellation,
        activity,
    } = worker;
    publish_activity(&activity, format!("{logo} {name} · Inspecting assignment"));
    // Display identities are user-facing Unicode. Durable identifiers are
    // generated independently so spaces, emoji, and punctuation cannot make
    // a valid display name fail SessionId validation.
    let session_id = SessionId::new(format!("agent-{team}-{}", index + 1))?;
    let journal = SessionJournal::open(&config.journal_root, &session_id)?;
    let mut session = AgentSession::start(
        session_id.clone(),
        AgentMode::Auto,
        config.workspace,
        journal,
    )?;
    let harness = NativeHarness::new(
        provider,
        tools,
        Arc::new(DenyAllApprovals),
        config.harness_limits,
    );
    let mut conversation = harness.conversation();
    let mut events = TeamEvents::new(name.clone(), activity.clone());
    let roster = assignments
        .iter()
        .map(|assignment| {
            format!(
                "- {} {}: {}",
                assignment.logo, assignment.name, assignment.task
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let turn = HarnessTurn {
        model: config.model,
        user_message: format!(
            "You are {logo} {name}, one read-only member of a Crumb agent team supervised by the parent Harness. Work only on your assignment, avoid duplicating sibling scopes, cite concrete paths or evidence, and flag dependencies, disagreements, or uncertainty for parent synthesis. Do not request mutations or claim to be the final answer.\n\nShared objective:\n{objective}\n\nTeam assignments:\n{roster}\n\nYour assignment:\n{task}"
        ),
        images: Vec::new(),
        persona: None,
        static_context: Vec::new(),
        selected_skills: Vec::new(),
        trusted_context: Vec::new(),
        max_output_tokens: config.max_output_tokens,
    };
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .context("failed to start parallel agent runtime")?;
    let outcome = runtime.block_on(harness.run_turn(
        &mut session,
        &mut conversation,
        turn,
        &cancellation,
        &mut events,
    ));
    let (text, failed) = match outcome {
        Ok(outcome) => {
            publish_activity(&activity, format!("{logo} {name} · Reported findings"));
            (
                bounded_text(outcome.text, config.team_limits.max_result_bytes.get()),
                false,
            )
        }
        Err(error) => {
            publish_activity(&activity, format!("{logo} {name} · Failed safely"));
            (format!("analysis failed: {error}"), true)
        }
    };
    Ok(Finding {
        name,
        logo,
        session_id: session_id.as_str().to_owned(),
        text,
        failed,
    })
}

fn team_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis());
    let sequence = NEXT_TEAM.fetch_add(1, Ordering::Relaxed);
    format!("{}-{timestamp}-{sequence}", std::process::id())
}

struct TeamRequest {
    objective: String,
    assignments: Vec<AgentAssignment>,
}

#[derive(Clone)]
struct AgentAssignment {
    name: String,
    logo: String,
    task: String,
}

fn parse_request(arguments: &Value, limits: ParallelAgentLimits) -> Result<TeamRequest> {
    let objective = arguments
        .get("objective")
        .and_then(Value::as_str)
        .unwrap_or("Parallel investigation requested by the parent Harness")
        .trim();
    if objective.is_empty() || objective.len() > limits.max_task_bytes.get() {
        bail!("parallel agent objective is empty or exceeds the byte limit");
    }
    let tasks = arguments
        .get("tasks")
        .and_then(Value::as_array)
        .context("tasks must be an array")?;
    if tasks.len() < 2 {
        bail!("parallel analysis requires at least two tasks");
    }
    let maximum = limits.max_agents.get().min(HARD_MAX_AGENTS);
    if tasks.len() > maximum {
        bail!("parallel analysis exceeds the configured agent limit");
    }
    let assignments = tasks
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let (name, logo, task) = if let Some(task) = value.as_str() {
                (NAMES[index], LOGOS[index], task)
            } else {
                let object = value
                    .as_object()
                    .context("each agent must be a task string or an agent object")?;
                let name = object
                    .get("name")
                    .and_then(Value::as_str)
                    .context("agent name must be a string")?
                    .trim();
                let logo = object
                    .get("logo")
                    .and_then(Value::as_str)
                    .context("agent logo must be a string")?
                    .trim();
                let task = object
                    .get("task")
                    .and_then(Value::as_str)
                    .context("agent task must be a string")?;
                (name, logo, task)
            };
            validate_agent_identity(name, logo)?;
            let task = task.trim();
            if task.is_empty() || task.len() > limits.max_task_bytes.get() {
                bail!("parallel agent task is empty or exceeds the byte limit");
            }
            Ok(AgentAssignment {
                name: name.to_owned(),
                logo: logo.to_owned(),
                task: task.to_owned(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let mut names = std::collections::BTreeSet::new();
    if assignments
        .iter()
        .any(|assignment| !names.insert(assignment.name.to_lowercase()))
    {
        bail!("parallel agent names must be unique");
    }
    Ok(TeamRequest {
        objective: objective.to_owned(),
        assignments,
    })
}

fn validate_agent_identity(name: &str, logo: &str) -> Result<()> {
    if name.is_empty()
        || name.len() > MAX_AGENT_NAME_BYTES
        || name.chars().any(|character| {
            character.is_control() || matches!(character, '/' | '\\' | ':' | '[' | ']')
        })
    {
        bail!("agent name must be 1-{MAX_AGENT_NAME_BYTES} safe display bytes");
    }
    if logo.is_empty()
        || logo.len() > MAX_AGENT_LOGO_BYTES
        || logo.chars().count() > 4
        || logo.chars().any(char::is_control)
    {
        bail!("agent logo must be 1-4 visible characters");
    }
    Ok(())
}

fn bounded_text(mut text: String, limit: usize) -> String {
    if text.len() <= limit {
        return text;
    }
    let mut boundary = limit;
    while !text.is_char_boundary(boundary) {
        boundary -= 1;
    }
    text.truncate(boundary);
    text
}

fn ensure_active(cancellation: &CancellationToken) -> Result<()> {
    if cancellation.is_cancelled() {
        bail!("tool call cancelled");
    }
    Ok(())
}

struct TeamEvents {
    name: String,
    activity: SyncSender<String>,
    reporting: bool,
}

impl TeamEvents {
    fn new(name: String, activity: SyncSender<String>) -> Self {
        Self {
            name,
            activity,
            reporting: false,
        }
    }
}

impl EventSink for TeamEvents {
    fn emit(&mut self, event: HarnessEvent) {
        let label = match event {
            HarnessEvent::TurnStarted => Some("Thinking".to_owned()),
            HarnessEvent::ToolRequested { name, detail, .. } => Some(detail.map_or_else(
                || tool_activity_label(&name),
                |detail| format!("{} · {detail}", tool_activity_label(&name)),
            )),
            HarnessEvent::ToolProgress { label, .. } => Some(label),
            HarnessEvent::ToolFinished { name, success, .. } => Some(format!(
                "{} · {}",
                tool_activity_label(&name),
                if success { "done" } else { "failed" }
            )),
            HarnessEvent::TextDelta(_) if !self.reporting => {
                self.reporting = true;
                Some("Reporting findings".to_owned())
            }
            HarnessEvent::ToolOutput { .. }
            | HarnessEvent::FileChanged { .. }
            | HarnessEvent::TextDelta(_)
            | HarnessEvent::ReasoningDelta(_)
            | HarnessEvent::ResponseRevised
            | HarnessEvent::Correction(_)
            | HarnessEvent::Usage(_)
            | HarnessEvent::TurnFinished => None,
        };
        if let Some(label) = label {
            publish_activity(&self.activity, format!("{} · {label}", self.name));
        }
    }
}

const TEAM_PROGRESS_SUFFIX: &str = " parallel agents working";

/// Progress label announcing how many team members are still running.
#[must_use]
pub fn team_progress_label(active: usize, total: usize) -> String {
    format!("{active} of {total}{TEAM_PROGRESS_SUFFIX}")
}

/// Parses a [`team_progress_label`] into `(active, total)`.
#[must_use]
pub fn parse_team_progress(label: &str) -> Option<(usize, usize)> {
    let (active, total) = label
        .strip_suffix(TEAM_PROGRESS_SUFFIX)?
        .split_once(" of ")?;
    Some((active.parse().ok()?, total.parse().ok()?))
}

fn publish_activity(activity: &SyncSender<String>, label: String) {
    let _ = activity.try_send(label);
}

fn descriptor(limits: ParallelAgentLimits) -> ToolDescriptor {
    ToolDescriptor {
        name: SPAWN_AGENTS.to_owned(),
        description: "Supervise two or more named read-only agents working concurrently toward one shared objective, then return a bounded team report for parent synthesis.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "objective": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": limits.max_task_bytes.get(),
                    "description": "Shared outcome the parent Harness wants the team to achieve"
                },
                "tasks": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": limits.max_agents.get().min(HARD_MAX_AGENTS),
                    "description": "Two to four independent assignments. Use agent objects when custom terminal names and logos help distinguish roles.",
                    "items": {
                        "oneOf": [
                            {"type": "string", "minLength": 1, "maxLength": limits.max_task_bytes.get()},
                            {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string", "minLength": 1, "maxLength": MAX_AGENT_NAME_BYTES},
                                    "logo": {"type": "string", "minLength": 1, "maxLength": 4},
                                    "task": {"type": "string", "minLength": 1, "maxLength": limits.max_task_bytes.get()}
                                },
                                "required": ["name", "logo", "task"],
                                "additionalProperties": false
                            }
                        ]
                    }
                }
            },
            "required": ["tasks"],
            "additionalProperties": false
        }),
        risk: RiskClass::NetworkAccess,
        transport: ToolTransport::Native,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::num::NonZeroUsize;
    use std::sync::Arc;
    use std::time::Duration;

    use crumb_agent::{AgentMode, CancellationToken, ConfiguredApprovals, ToolHost};
    use crumb_llm::{ChatEvent, EmbeddingResponse, FinishReason, MockProvider, TokenUsage};
    use serde_json::json;

    #[test]
    fn team_progress_labels_round_trip() {
        let label = super::team_progress_label(3, 4);
        assert_eq!(label, "3 of 4 parallel agents working");
        assert_eq!(super::parse_team_progress(&label), Some((3, 4)));
        assert_eq!(
            super::parse_team_progress("Koi · Inspecting assignment"),
            None
        );
    }
    use tempfile::TempDir;

    use super::{
        NAMES, ParallelAgentConfig, ParallelAgentLimits, parse_request,
        register_parallel_agent_tool,
    };
    use crate::HarnessLimits;

    #[test]
    fn short_names_are_unique_and_terminal_friendly() {
        let unique = NAMES.into_iter().collect::<std::collections::BTreeSet<_>>();
        assert_eq!(unique.len(), NAMES.len());
        assert!(NAMES.iter().all(|name| name.len() <= 4));
    }

    #[test]
    fn task_fanout_is_bounded() {
        let limits = ParallelAgentLimits {
            max_agents: NonZeroUsize::new(2).unwrap(),
            max_task_bytes: NonZeroUsize::new(8).unwrap(),
            max_result_bytes: NonZeroUsize::new(32).unwrap(),
        };
        let request = parse_request(
            &json!({"objective":"ship it", "tasks":["one", "two"]}),
            limits,
        )
        .expect("bounded team request");
        assert_eq!(request.objective, "ship it");
        assert!(parse_request(&json!({"tasks":["one"]}), limits).is_err());
        assert!(parse_request(&json!({"tasks":["one", "two", "three"]}), limits).is_err());
        assert!(parse_request(&json!({"tasks":["too long!", "two"]}), limits).is_err());

        let permissive = ParallelAgentLimits {
            max_agents: NonZeroUsize::new(8).unwrap(),
            ..limits
        };
        assert!(
            parse_request(
                &json!({"tasks":["one", "two", "tri", "four", "five"]}),
                permissive
            )
            .is_err()
        );
    }

    #[test]
    fn custom_agent_identities_are_bounded_and_unique() {
        let limits = ParallelAgentLimits::default();
        let request = parse_request(
            &json!({
                "tasks":[
                    {"name":"UI Scout", "logo":"🖼️", "task":"inspect auth"},
                    {"name":"Builder", "logo":"🛠️", "task":"inspect UI"}
                ]
            }),
            limits,
        )
        .expect("custom identities");
        assert_eq!(request.assignments[0].name, "UI Scout");
        assert_eq!(request.assignments[0].logo, "🖼️");
        assert_eq!(request.assignments[1].name, "Builder");
        assert!(
            parse_request(
                &json!({"tasks":[
                    {"name":"Scout", "logo":"🔎", "task":"one"},
                    {"name":"scout", "logo":"🛠️", "task":"two"}
                ]}),
                limits
            )
            .is_err()
        );
        assert!(
            parse_request(
                &json!({"tasks":[
                    {"name":"bad/name", "logo":"🔎", "task":"one"},
                    {"name":"Builder", "logo":"🛠️", "task":"two"}
                ]}),
                limits
            )
            .is_err()
        );
    }

    #[test]
    fn registered_tool_runs_named_workers_and_journals_each_one() {
        let workspace = TempDir::new().expect("workspace");
        let journal_root = workspace.path().join("sessions/agents");
        let provider = MockProvider::new(
            Vec::new(),
            vec![
                ChatEvent::TextDelta("evidence".to_owned()),
                ChatEvent::Finished(FinishReason::Stop),
            ],
            EmbeddingResponse {
                vectors: Vec::new(),
                usage: TokenUsage::default(),
            },
        );
        let mut host = ToolHost::default();
        register_parallel_agent_tool(
            &mut host,
            Arc::new(provider),
            ParallelAgentConfig {
                workspace: workspace.path().to_path_buf(),
                journal_root: journal_root.clone(),
                model: "fixture".to_owned(),
                max_output_tokens: Some(128),
                harness_limits: HarnessLimits {
                    turn_timeout: Duration::from_secs(2),
                    ..HarnessLimits::default()
                },
                team_limits: ParallelAgentLimits::default(),
            },
        )
        .expect("parallel tool registers");
        let approvals = ConfiguredApprovals::new(BTreeSet::from(["spawn_agents".to_owned()]));

        let mut progress = Vec::new();
        let output = host
            .call_with_progress(
                "spawn_agents",
                &json!({
                    "objective":"map both surfaces",
                    "tasks":[
                        {"name":"UI Scout", "logo":"🖼️", "task":"inspect one"},
                        {"name":"Builder", "logo":"🛠️", "task":"inspect two"}
                    ]
                }),
                AgentMode::Auto,
                &approvals,
                &CancellationToken::default(),
                &mut |label| progress.push(label.to_owned()),
            )
            .expect("parallel analysis succeeds");

        assert!(!output.is_error);
        assert!(output.text.contains("Objective: map both surfaces"));
        assert!(output.text.contains("🖼️ UI Scout [complete]:\nevidence"));
        assert!(output.text.contains("🛠️ Builder [complete]:\nevidence"));
        assert!(output.text.contains("Parent action: reconcile"));
        assert_eq!(
            output
                .structured
                .as_ref()
                .and_then(|value| value.get("status"))
                .and_then(serde_json::Value::as_str),
            Some("complete")
        );
        assert_eq!(
            output
                .structured
                .as_ref()
                .and_then(|value| value["agents"][0]["logo"].as_str()),
            Some("🖼️")
        );
        assert_eq!(
            std::fs::read_dir(journal_root)
                .expect("journals exist")
                .count(),
            2
        );
        assert!(
            progress
                .iter()
                .any(|label| label == "🖼️ UI Scout · Inspecting assignment")
        );
        assert!(
            progress
                .iter()
                .any(|label| label.starts_with("🛠️ Builder ·"))
        );
    }
}
