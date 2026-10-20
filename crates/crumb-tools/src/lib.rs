//! Native tools whose permissions remain owned by Crumb.

mod a2a;
mod checkpoint;
mod clock;
mod disposable;
mod github;
mod shell;
mod stack_detection;
mod wait;
mod web;
mod workspace;

pub use a2a::{
    LIST_PEER_AGENTS_TOOL, ListPeerAgentsTool, SEND_PEER_MESSAGE_TOOL, SHARE_PEER_FILE_TOOL,
    SendPeerMessageTool, SharePeerFileTool, register_a2a_tools,
};
pub use checkpoint::{
    CheckpointDecision, CheckpointFile, CheckpointStatus, CheckpointStore, WorkspaceCheckpoint,
};
pub use clock::register_current_time_tool;
pub use disposable::{DisposableToolConfig, register_disposable_tool};
pub use github::{GitHubIssueLimits, register_github_issue_tool};
pub use shell::{AgentShellConfig, register_shell_tool, register_shell_tool_with_optimizer};
pub use stack_detection::{
    DetectedStack, LanguageDetection, StackConfidence, StackDetectionLimits,
    register_stack_detection_tool,
};
pub use wait::{WaitToolLimits, register_wait_tool};
pub use web::{WebFetchLimits, register_web_fetch_tool};
pub use workspace::{
    WorkspaceToolLimits, WorkspaceWriteLimits, register_workspace_read_tools,
    register_workspace_write_tool,
};

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
