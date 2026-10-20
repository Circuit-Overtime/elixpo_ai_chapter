//! Minimal interactive loop and input classification for crumb.

use std::env;
use std::io::{self, BufRead, Write};
use std::path::Path;

use crumb_core::{AuthAction, BuiltInCommand, HistoryAction, InputEvent};
use crumb_platform::Platform;

/// Reason the REPL returned control to its caller.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReplOutcome {
    Exit,
    LaunchNativeShell,
}

/// One command exposed through Crumb's `/` namespace.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SlashCommand {
    pub usage: &'static str,
    pub description: &'static str,
}

/// Commands shown by `/help` and interactive completion.
pub const SLASH_COMMANDS: &[SlashCommand] = &[
    SlashCommand {
        usage: "/help",
        description: "show Crumb commands",
    },
    SlashCommand {
        usage: "/auth login",
        description: "connect your crumb.elixpo account",
    },
    SlashCommand {
        usage: "/auth status",
        description: "show Crumb account access",
    },
    SlashCommand {
        usage: "/auth logout",
        description: "remove local Crumb account access",
    },
    SlashCommand {
        usage: "/connectors",
        description: "show connected services",
    },
    SlashCommand {
        usage: "/skills",
        description: "select or unload agent skills",
    },
    SlashCommand {
        usage: "/skills load ",
        description: "load a skill into agent context",
    },
    SlashCommand {
        usage: "/skills unload ",
        description: "unload a skill from agent context",
    },
    SlashCommand {
        usage: "/skill",
        description: "discover and manage skill packages",
    },
    SlashCommand {
        usage: "/skill search ",
        description: "search compact offline skill metadata",
    },
    SlashCommand {
        usage: "/skill inspect ",
        description: "inspect provenance and requirements before install",
    },
    SlashCommand {
        usage: "/skill install ",
        description: "explicitly install a verified skill package disabled",
    },
    SlashCommand {
        usage: "/skill run ",
        description: "run one installed and enabled skill for a task",
    },
    SlashCommand {
        usage: "/skill enable ",
        description: "enable one installed or bundled skill",
    },
    SlashCommand {
        usage: "/skill disable ",
        description: "remove one skill from agent context",
    },
    SlashCommand {
        usage: "/skill update ",
        description: "explicitly update a verified skill package",
    },
    SlashCommand {
        usage: "/skill rollback ",
        description: "roll back a verified skill package",
    },
    SlashCommand {
        usage: "/skill remove ",
        description: "remove a disabled installed skill package",
    },
    SlashCommand {
        usage: "/skill doctor",
        description: "verify installed skill package state",
    },
    SlashCommand {
        usage: "/context",
        description: "show inline reference syntax",
    },
    SlashCommand {
        usage: "/history",
        description: "show recent native history",
    },
    SlashCommand {
        usage: "/history search ",
        description: "search native history",
    },
    SlashCommand {
        usage: "/mode",
        description: "select auto, negotiate, or plan mode",
    },
    SlashCommand {
        usage: "/mode use ",
        description: "set auto, negotiate, or plan mode",
    },
    SlashCommand {
        usage: "/model",
        description: "inspect or select a model",
    },
    SlashCommand {
        usage: "/model use ",
        description: "select an exact provider/model",
    },
    SlashCommand {
        usage: "/pack",
        description: "inspect model capability packs",
    },
    SlashCommand {
        usage: "/pack use ",
        description: "switch router, vision, image, and coder models together",
    },
    SlashCommand {
        usage: "/effort",
        description: "inspect or set reasoning effort",
    },
    SlashCommand {
        usage: "/effort use ",
        description: "set light, medium, high, extra high, or default",
    },
    SlashCommand {
        usage: "/session",
        description: "manage agent sessions",
    },
    SlashCommand {
        usage: "/session list",
        description: "list agent sessions",
    },
    SlashCommand {
        usage: "/session search ",
        description: "search session metadata",
    },
    SlashCommand {
        usage: "/session resume ",
        description: "resume an agent session",
    },
    SlashCommand {
        usage: "/session inspect ",
        description: "inspect redacted session metadata",
    },
    SlashCommand {
        usage: "/session rename ",
        description: "label an agent session",
    },
    SlashCommand {
        usage: "/session archive ",
        description: "archive an agent session",
    },
    SlashCommand {
        usage: "/session restore ",
        description: "restore an archived session",
    },
    SlashCommand {
        usage: "/session export ",
        description: "print a redacted session export",
    },
    SlashCommand {
        usage: "/session delete ",
        description: "move a session to recoverable trash",
    },
    SlashCommand {
        usage: "/instance",
        description: "show this workspace's stable Crumb identity",
    },
    SlashCommand {
        usage: "/instance rename ",
        description: "rename this Crumb instance without changing its identity",
    },
    SlashCommand {
        usage: "/peers",
        description: "list active local Crumb agents",
    },
    SlashCommand {
        usage: "/peer",
        description: "show local agent handoff help",
    },
    SlashCommand {
        usage: "/peer status",
        description: "show this instance and active local peers",
    },
    SlashCommand {
        usage: "/peer inbox",
        description: "list pending peer deliveries without opening them",
    },
    SlashCommand {
        usage: "/peer tasks",
        description: "list durable redacted peer task state",
    },
    SlashCommand {
        usage: "/peer task ",
        description: "inspect one durable redacted peer task",
    },
    SlashCommand {
        usage: "/peer inspect ",
        description: "safely inspect one pending peer delivery",
    },
    SlashCommand {
        usage: "/peer accept ",
        description: "run one pending delivery in an isolated peer turn",
    },
    SlashCommand {
        usage: "/peer reject ",
        description: "reject one pending delivery without invoking a model",
    },
    SlashCommand {
        usage: "/peer responses",
        description: "list correlated peer responses without opening them",
    },
    SlashCommand {
        usage: "/peer ack ",
        description: "acknowledge one peer response without opening it",
    },
    SlashCommand {
        usage: "/peer file",
        description: "show verified peer file quarantine help",
    },
    SlashCommand {
        usage: "/peer file fetch ",
        description: "verify one pending file part into quarantine",
    },
    SlashCommand {
        usage: "/peer file import ",
        description: "import one fetched peer file into a new workspace path",
    },
    SlashCommand {
        usage: "/peer file discard ",
        description: "discard one exact fetched peer file and receipt",
    },
    SlashCommand {
        usage: "/review",
        description: "review Crumb-owned edits",
    },
    SlashCommand {
        usage: "/review list",
        description: "list edit checkpoints",
    },
    SlashCommand {
        usage: "/review diff ",
        description: "show a bounded checkpoint diff",
    },
    SlashCommand {
        usage: "/review approve ",
        description: "approve a checkpoint",
    },
    SlashCommand {
        usage: "/review reject ",
        description: "safely rewind a checkpoint",
    },
    SlashCommand {
        usage: "/review comment ",
        description: "attach feedback to the next agent turn",
    },
    SlashCommand {
        usage: "/review export ",
        description: "print checkpoint metadata as JSON",
    },
    SlashCommand {
        usage: "/jobs",
        description: "list local agent jobs",
    },
    SlashCommand {
        usage: "/jobs inspect ",
        description: "inspect redacted job metadata",
    },
    SlashCommand {
        usage: "/jobs create ",
        description: "start an approved background request",
    },
    SlashCommand {
        usage: "/jobs schedule once ",
        description: "opt in to one scheduled run",
    },
    SlashCommand {
        usage: "/jobs schedule recurring ",
        description: "opt in to a recurring local run",
    },
    SlashCommand {
        usage: "/jobs cancel ",
        description: "cancel a queued or running job",
    },
    SlashCommand {
        usage: "/jobs reattach ",
        description: "resume a completed job session",
    },
    SlashCommand {
        usage: "/jobs tick",
        description: "launch due opted-in schedules",
    },
    SlashCommand {
        usage: "/background",
        description: "continue the active agent turn as a local job",
    },
    SlashCommand {
        usage: "/pause",
        description: "pause the active agent turn at a safe boundary",
    },
    SlashCommand {
        usage: "/resume",
        description: "continue a paused agent turn",
    },
    SlashCommand {
        usage: "/cancel",
        description: "cancel the active agent turn",
    },
    SlashCommand {
        usage: "/attach ",
        description: "attach a typed @ reference",
    },
    SlashCommand {
        usage: "/detach ",
        description: "remove attached context",
    },
    SlashCommand {
        usage: "/plugins",
        description: "inspect installed plugins",
    },
    SlashCommand {
        usage: "/plugins enable ",
        description: "enable supervised MCP discovery",
    },
    SlashCommand {
        usage: "/plugins disable ",
        description: "disable a supervised MCP server",
    },
    SlashCommand {
        usage: "/plugins allow ",
        description: "allow one exact supervised MCP tool",
    },
    SlashCommand {
        usage: "/plugins deny ",
        description: "remove one MCP tool grant",
    },
    SlashCommand {
        usage: "/marketplace",
        description: "browse installable skills and MCPs",
    },
    SlashCommand {
        usage: "/marketplace inspect ",
        description: "inspect a marketplace package",
    },
    SlashCommand {
        usage: "/marketplace sync",
        description: "refresh inspection-only remote metadata",
    },
    SlashCommand {
        usage: "/marketplace remote",
        description: "browse cached remote metadata",
    },
    SlashCommand {
        usage: "/marketplace remote inspect ",
        description: "inspect a cached remote package",
    },
    SlashCommand {
        usage: "/marketplace install ",
        description: "verify and install a package",
    },
    SlashCommand {
        usage: "/marketplace install-remote ",
        description: "verify and install a signed remote package",
    },
    SlashCommand {
        usage: "/marketplace validate ",
        description: "validate a local marketplace catalog",
    },
    SlashCommand {
        usage: "/tools",
        description: "inspect available tools",
    },
    SlashCommand {
        usage: "/permissions",
        description: "inspect agent permissions",
    },
    SlashCommand {
        usage: "/permissions always-ask",
        description: "ask before every privileged tool",
    },
    SlashCommand {
        usage: "/permissions sensitive",
        description: "ask only before sensitive commands",
    },
    SlashCommand {
        usage: "/permissions full-access",
        description: "run registered tools without prompts",
    },
    SlashCommand {
        usage: "/permissions allow-all",
        description: "grant all packaged tools and full access",
    },
    SlashCommand {
        usage: "/permissions allow-network ",
        description: "allow web_fetch or web_search",
    },
    SlashCommand {
        usage: "/permissions deny-network ",
        description: "remove a network-tool grant",
    },
    SlashCommand {
        usage: "/permissions allow-workspace ",
        description: "allow a workspace-write tool",
    },
    SlashCommand {
        usage: "/permissions deny-workspace ",
        description: "remove a workspace-tool grant",
    },
    SlashCommand {
        usage: "/permissions allow-execution ",
        description: "allow a process-execution tool",
    },
    SlashCommand {
        usage: "/permissions deny-execution ",
        description: "remove an execution-tool grant",
    },
    SlashCommand {
        usage: "/memory",
        description: "manage approved memory",
    },
    SlashCommand {
        usage: "/memory show ",
        description: "show approved project or user memory",
    },
    SlashCommand {
        usage: "/memory remember ",
        description: "explicitly persist a memory",
    },
    SlashCommand {
        usage: "/memory forget ",
        description: "remove a memory by display index",
    },
    SlashCommand {
        usage: "/memory compact ",
        description: "deduplicate approved memory",
    },
    SlashCommand {
        usage: "/graph",
        description: "show local project graph status",
    },
    SlashCommand {
        usage: "/graph build",
        description: "explicitly build the local project graph",
    },
    SlashCommand {
        usage: "/graph refresh",
        description: "explicitly rebuild the local project graph",
    },
    SlashCommand {
        usage: "/graph query ",
        description: "query bounded local graph evidence",
    },
    SlashCommand {
        usage: "/graph explain ",
        description: "explain one graph node with provenance",
    },
    SlashCommand {
        usage: "/graph path ",
        description: "find a bounded path between two nodes",
    },
    SlashCommand {
        usage: "/graph dependencies ",
        description: "trace bounded dependencies from one node",
    },
    SlashCommand {
        usage: "/graph impact ",
        description: "trace bounded reverse impact for one node",
    },
    SlashCommand {
        usage: "/graph owners ",
        description: "show ownership relationships for one node",
    },
    SlashCommand {
        usage: "/graph enable",
        description: "enable the pinned Graphify MCP adapter",
    },
    SlashCommand {
        usage: "/graph disable",
        description: "disable project graph context",
    },
    SlashCommand {
        usage: "/profile",
        description: "show the active persona profile",
    },
    SlashCommand {
        usage: "/profile list",
        description: "list persona profiles",
    },
    SlashCommand {
        usage: "/profile show ",
        description: "inspect a persona profile",
    },
    SlashCommand {
        usage: "/profile effective",
        description: "show effective profile preference sources",
    },
    SlashCommand {
        usage: "/profile create ",
        description: "create a persona profile",
    },
    SlashCommand {
        usage: "/profile clone ",
        description: "clone a persona profile",
    },
    SlashCommand {
        usage: "/profile select ",
        description: "select a profile for this project",
    },
    SlashCommand {
        usage: "/profile clear",
        description: "clear this project's profile",
    },
    SlashCommand {
        usage: "/profile rename ",
        description: "rename a persona profile",
    },
    SlashCommand {
        usage: "/profile export ",
        description: "export a profile as safe JSON",
    },
    SlashCommand {
        usage: "/profile import ",
        description: "import a bounded profile file",
    },
    SlashCommand {
        usage: "/profile delete ",
        description: "delete an inactive profile",
    },
    SlashCommand {
        usage: "/config",
        description: "inspect live configuration",
    },
    SlashCommand {
        usage: "/config provider ",
        description: "configure Harness providers and models",
    },
    SlashCommand {
        usage: "/config harness native",
        description: "use Crumb's native tool and multi-agent Harness",
    },
    SlashCommand {
        usage: "/config provider discover ",
        description: "discover provider models on demand",
    },
    SlashCommand {
        usage: "/cancel",
        description: "cancel the active agent turn",
    },
    SlashCommand {
        usage: "/doctor",
        description: "diagnose optional AI services",
    },
    SlashCommand {
        usage: "/cost",
        description: "show session usage",
    },
    SlashCommand {
        usage: "/platform",
        description: "show the native platform",
    },
    SlashCommand {
        usage: "/version",
        description: "show the Crumb version",
    },
    SlashCommand {
        usage: "/shell",
        description: "enter the raw native shell",
    },
    SlashCommand {
        usage: "/exit",
        description: "exit Crumb",
    },
];

/// Classifies one line without executing native shell input.
#[must_use]
pub fn classify_input(input: &str) -> InputEvent {
    let command = input.trim_end_matches(['\r', '\n']);
    let command = if command.starts_with('/') || command.starts_with('?') {
        command.trim_end()
    } else {
        command
    };
    match command {
        "/auth login" => InputEvent::BuiltIn(BuiltInCommand::Auth(AuthAction::Login)),
        "/auth status" => InputEvent::BuiltIn(BuiltInCommand::Auth(AuthAction::Status)),
        "/auth logout" => InputEvent::BuiltIn(BuiltInCommand::Auth(AuthAction::Logout)),
        "/connectors" => InputEvent::BuiltIn(BuiltInCommand::Connectors),
        "/context" => InputEvent::BuiltIn(BuiltInCommand::Context),
        "/exit" | "exit" => InputEvent::BuiltIn(BuiltInCommand::Exit),
        "/help" | "?" => InputEvent::BuiltIn(BuiltInCommand::Help),
        _ if command.trim_end() == "? config" => {
            InputEvent::BuiltIn(BuiltInCommand::Reserved("? config".to_owned()))
        }
        "/history" => InputEvent::BuiltIn(BuiltInCommand::History(HistoryAction::Recent)),
        "/history search" => InputEvent::BuiltIn(BuiltInCommand::History(HistoryAction::Search(
            String::new(),
        ))),
        "/platform" => InputEvent::BuiltIn(BuiltInCommand::Platform),
        "/shell" => InputEvent::BuiltIn(BuiltInCommand::Shell),
        "/skills" => InputEvent::BuiltIn(BuiltInCommand::Skills),
        "/version" => InputEvent::BuiltIn(BuiltInCommand::Version),
        _ if command.starts_with("/history search ") => {
            InputEvent::BuiltIn(BuiltInCommand::History(HistoryAction::Search(
                command["/history search ".len()..].to_owned(),
            )))
        }
        _ if reserved_slash_command(command) => {
            InputEvent::BuiltIn(BuiltInCommand::Reserved(command.to_owned()))
        }
        _ => InputEvent::NativeInput(command.to_owned()),
    }
}

fn reserved_slash_command(command: &str) -> bool {
    let Some(name) = command.split_whitespace().next() else {
        return false;
    };
    SLASH_COMMANDS.iter().any(|candidate| {
        candidate
            .usage
            .split_whitespace()
            .next()
            .is_some_and(|root| root == name)
    })
}

/// Renders the phase-one prompt for a working directory.
#[must_use]
pub fn render_prompt(cwd: &Path) -> String {
    format!("crumb:{}> ", cwd.display())
}

/// Reads and classifies one prompt line.
///
/// # Errors
///
/// Returns an error when terminal input/output fails.
pub fn read_input<R: BufRead, W: Write>(
    reader: &mut R,
    writer: &mut W,
    cwd: &Path,
) -> io::Result<Option<InputEvent>> {
    write!(writer, "{}", render_prompt(cwd))?;
    writer.flush()?;

    let mut line = String::new();
    if reader.read_line(&mut line)? == 0 {
        return Ok(None);
    }
    Ok(Some(classify_input(&line)))
}

/// Reads and classifies one line without rendering a prompt.
///
/// # Errors
///
/// Returns an error when terminal input fails.
pub fn read_classified_line<R: BufRead>(reader: &mut R) -> io::Result<Option<InputEvent>> {
    let mut line = String::new();
    if reader.read_line(&mut line)? == 0 {
        return Ok(None);
    }
    Ok(Some(classify_input(&line)))
}

/// Runs the WP-001 REPL until `/exit` or end-of-input.
///
/// Native input is classified and reported, but deliberately not executed.
///
/// # Errors
///
/// Returns an error when the working directory cannot be read or terminal
/// input/output fails.
pub fn run<R: BufRead, W: Write>(
    mut reader: R,
    mut writer: W,
    platform: Platform,
    version: &str,
) -> io::Result<ReplOutcome> {
    loop {
        let cwd = env::current_dir()?;
        let Some(event) = read_input(&mut reader, &mut writer, &cwd)? else {
            return Ok(ReplOutcome::Exit);
        };

        match event {
            InputEvent::BuiltIn(BuiltInCommand::Auth(_)) => {
                writeln!(
                    writer,
                    "authentication is available in the crumb executable"
                )?;
            }
            InputEvent::BuiltIn(BuiltInCommand::Connectors) => {
                writeln!(writer, "connectors are available in the crumb executable")?;
            }
            InputEvent::BuiltIn(BuiltInCommand::Context) => {
                writeln!(
                    writer,
                    "context references are available in the crumb executable"
                )?;
            }
            InputEvent::BuiltIn(BuiltInCommand::Exit) => return Ok(ReplOutcome::Exit),
            InputEvent::BuiltIn(BuiltInCommand::Help) => {
                writeln!(writer, "help is available in the crumb executable")?;
            }
            InputEvent::BuiltIn(BuiltInCommand::History(_)) => {
                writeln!(writer, "history is available in the crumb executable")?;
            }
            InputEvent::BuiltIn(BuiltInCommand::Platform) => writeln!(writer, "{platform}")?,
            InputEvent::BuiltIn(BuiltInCommand::Reserved(command)) => {
                writeln!(writer, "reserved Crumb command: {command}")?;
            }
            InputEvent::BuiltIn(BuiltInCommand::Shell) => {
                let shell_name = match platform {
                    Platform::Linux => "Bash",
                    Platform::MacOs => "Zsh",
                    Platform::Windows => "PowerShell",
                };
                writeln!(
                    writer,
                    "entering native {shell_name} through crumb (type `exit` to leave crumb)"
                )?;
                writer.flush()?;
                return Ok(ReplOutcome::LaunchNativeShell);
            }
            InputEvent::BuiltIn(BuiltInCommand::Skills) => {
                writeln!(writer, "skills are available in the crumb executable")?;
            }
            InputEvent::BuiltIn(BuiltInCommand::Version) => writeln!(writer, "crumb {version}")?,
            InputEvent::NativeInput(command) if command.trim().is_empty() => {}
            InputEvent::NativeInput(command) => {
                writeln!(
                    writer,
                    "native input (execution arrives in WP-002): {command}"
                )?;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;
    use std::path::Path;

    use crumb_core::{AuthAction, BuiltInCommand, HistoryAction, InputEvent};
    use crumb_platform::Platform;

    use super::{ReplOutcome, classify_input, read_input, render_prompt, run};

    #[test]
    fn classifies_supported_built_ins() {
        assert_eq!(
            classify_input("/exit\n"),
            InputEvent::BuiltIn(BuiltInCommand::Exit)
        );
        assert_eq!(
            classify_input("exit"),
            InputEvent::BuiltIn(BuiltInCommand::Exit)
        );
        assert_eq!(
            classify_input("/version"),
            InputEvent::BuiltIn(BuiltInCommand::Version)
        );
        assert_eq!(
            classify_input("/platform"),
            InputEvent::BuiltIn(BuiltInCommand::Platform)
        );
        assert_eq!(
            classify_input("/shell"),
            InputEvent::BuiltIn(BuiltInCommand::Shell)
        );
        assert_eq!(
            classify_input("/auth login"),
            InputEvent::BuiltIn(BuiltInCommand::Auth(AuthAction::Login))
        );
        assert_eq!(
            classify_input("/history search cargo test"),
            InputEvent::BuiltIn(BuiltInCommand::History(HistoryAction::Search(
                "cargo test".to_owned()
            )))
        );
        assert_eq!(
            classify_input("/history   "),
            InputEvent::BuiltIn(BuiltInCommand::History(HistoryAction::Recent))
        );
        assert_eq!(
            classify_input("/skills"),
            InputEvent::BuiltIn(BuiltInCommand::Skills)
        );
        assert_eq!(
            classify_input("/skill search review"),
            InputEvent::BuiltIn(BuiltInCommand::Reserved("/skill search review".to_owned()))
        );
        assert_eq!(
            classify_input("/peer status"),
            InputEvent::BuiltIn(BuiltInCommand::Reserved("/peer status".to_owned()))
        );
        assert_eq!(
            classify_input("/peers"),
            InputEvent::BuiltIn(BuiltInCommand::Reserved("/peers".to_owned()))
        );
        assert_eq!(
            classify_input("?"),
            InputEvent::BuiltIn(BuiltInCommand::Help)
        );
        assert_eq!(
            classify_input("? config  "),
            InputEvent::BuiltIn(BuiltInCommand::Reserved("? config".to_owned()))
        );
        assert_eq!(
            classify_input("/mode auto"),
            InputEvent::BuiltIn(BuiltInCommand::Reserved("/mode auto".to_owned()))
        );
    }

    #[test]
    fn classifies_other_input_as_native() {
        assert_eq!(
            classify_input("  git status  "),
            InputEvent::NativeInput("  git status  ".to_owned())
        );
        assert_eq!(
            classify_input("/usr/bin/env"),
            InputEvent::NativeInput("/usr/bin/env".to_owned())
        );
    }

    #[test]
    fn prompt_contains_the_working_directory() {
        assert_eq!(
            render_prompt(Path::new("/tmp/project")),
            "crumb:/tmp/project> "
        );
    }

    #[test]
    fn reads_one_classified_input_event() {
        let mut input = Cursor::new("git status\n");
        let mut output = Vec::new();

        let event = read_input(&mut input, &mut output, Path::new("/workspace"))
            .expect("input should be read");

        assert_eq!(
            event,
            Some(InputEvent::NativeInput("git status".to_owned()))
        );
        assert_eq!(
            String::from_utf8(output).expect("output should be UTF-8"),
            "crumb:/workspace> "
        );
    }

    #[test]
    fn repl_handles_built_ins_and_stops() {
        let input = Cursor::new("/platform\n/version\n/exit\n");
        let mut output = Vec::new();

        let outcome = run(input, &mut output, Platform::Linux, "0.1.0").expect("REPL should run");

        let output = String::from_utf8(output).expect("output should be UTF-8");
        assert_eq!(outcome, ReplOutcome::Exit);
        assert!(output.contains("linux"));
        assert!(output.contains("crumb 0.1.0"));
    }

    #[test]
    fn shell_command_returns_control_to_the_cli() {
        let input = Cursor::new("/shell\n");
        let mut output = Vec::new();

        let outcome = run(input, &mut output, Platform::Linux, "0.1.0").expect("REPL should run");

        assert_eq!(outcome, ReplOutcome::LaunchNativeShell);
        assert!(
            String::from_utf8(output)
                .expect("output should be UTF-8")
                .contains("entering native Bash")
        );
    }
}
