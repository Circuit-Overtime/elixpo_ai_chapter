//! Lightweight terminal presentation for crumb.

use std::collections::VecDeque;
use std::env;
use std::fmt::Write as _;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crumb_platform::Platform;

const WORDMARK: &str = r"░█████╗░██████╗░██╗░░░██╗███╗░░░███╗██████╗░
██╔══██╗██╔══██╗██║░░░██║████╗░████║██╔══██╗
██║░░╚═╝██████╔╝██║░░░██║██╔████╔██║██████╦╝
██║░░██╗██╔══██╗██║░░░██║██║╚██╔╝██║██╔══██╗
╚█████╔╝██║░░██║╚██████╔╝██║░╚═╝░██║██████╦╝
░╚════╝░╚═╝░░╚═╝░╚═════╝░╚═╝░░░░░╚═╝╚═════╝░";
const PANDA_AWAKE: &str = include_str!("../assets/panda-awake.txt");
const PANDA_COOL: &str = include_str!("../assets/panda-cool.txt");
const PANDA_CLOSING: &str = include_str!("../assets/panda-closing.txt");
const COOKIE_SPINNER: [&str; 4] = ["(.:)", "(:.)", "(o.)", "(.o)"];
const TRANSCRIPT_INPUT_MAX_ROWS: usize = 4;
const CONTEXT_METER_WIDTH: usize = 12;
const CRUMB_BADGE: &str = "[ CRUMB ]";
const PARALLEL_TOOL: &str = "spawn_agents";
const PEER_INSPECTION_MAX_BYTES: usize = 8 * 1024;
const PEER_INSPECTION_MAX_LINES: usize = 80;

const PUNCHLINES: &[&str] = &[
    "Broken biscuit. Working terminal.",
    "Crumbs included. Cleanup optional.",
    "Breaking biscuits, not workflows.",
    "Small crumb. Big terminal energy.",
    "Bash first. Snack later.",
    "Shell yeah. Crumb happens.",
    "Fresh from the command-line bakery.",
    "One shell. Several questionable snacks.",
    "Bite-sized commands. Full-stack appetite.",
    "Crunching tasks, not your patience.",
    "Natural language in. Terminal magic out.",
    "The shell is real. The jokes are optional-ish.",
    "Your command broke. The biscuit came that way.",
    "Less yak shaving. More biscuit breaking.",
    "Works offline. The jokes do too.",
    "AI optional. Personality unavoidable.",
    "No prompt prefix. No crumbs under the rug.",
    "Built with Rust. Seasoned with crumbs.",
    "404: boring terminal not found.",
    "Your shell called. It wants an agent.",
    "Command line, now with conversational crunch.",
    "The panda has entered the shell.",
    "Oreo approved this terminal. Probably.",
    "Oreo is debugging. Please hold the bamboo.",
    "Oreo says this probably needs a test.",
    "Oreo watches the permissions. Closely.",
    "Panda-powered. Developer-controlled.",
    "No cookies were accepted. One was broken.",
    "A little crumb goes a long way.",
    "Type boldly. Ctrl+C responsibly.",
];

/// Startup branding density.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BrandingMode {
    Full,
    Compact,
    Disabled,
}

/// Output density and assistive-technology behavior.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OutputMode {
    Rich,
    Plain,
    ScreenReader,
}

/// Whether transient UI may animate.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MotionMode {
    Full,
    Reduced,
}

/// Public lifecycle state for one agent-to-agent exchange.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PeerActivityState {
    Connecting,
    Exchanging,
    Waiting,
    Completed,
    Failed,
}

/// Semantic presentation for short terminal status messages.
///
/// Keeping meaning separate from ANSI colors lets future themes remap these
/// tones without changing command or runtime code.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StatusTone {
    Info,
    Action,
    Waiting,
    Success,
    Warning,
}

impl PeerActivityState {
    const fn label(self) -> &'static str {
        match self {
            Self::Connecting => "connecting",
            Self::Exchanging => "sharing context",
            Self::Waiting => "waiting",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }
}

/// Bounded, non-secret summary shown while two Crumb instances communicate.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PeerActivity<'a> {
    pub local_name: &'a str,
    pub remote_name: &'a str,
    pub state: PeerActivityState,
    pub elapsed: Duration,
    pub artifact_count: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PandaMood {
    Awake,
    Cool,
}

/// Presentation settings resolved once during startup.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UiSettings {
    pub color: bool,
    pub output: OutputMode,
    pub motion: MotionMode,
    pub branding: BrandingMode,
}

impl UiSettings {
    /// Resolves UI settings from terminal capability and environment flags.
    #[must_use]
    pub fn from_environment(is_terminal: bool) -> Self {
        let screen_reader = env_flag("CRUMB_SCREEN_READER");
        let plain = !is_terminal || screen_reader || env_flag("CRUMB_PLAIN");
        let color = is_terminal && !plain && env::var_os("NO_COLOR").is_none();
        let branding = match (
            is_terminal && !screen_reader,
            env::var("CRUMB_BRANDING").as_deref(),
        ) {
            (false, _) | (_, Ok("off" | "none" | "disabled")) => BrandingMode::Disabled,
            (_, Ok("compact")) => BrandingMode::Compact,
            _ => BrandingMode::Full,
        };
        Self {
            color,
            output: if screen_reader {
                OutputMode::ScreenReader
            } else if plain {
                OutputMode::Plain
            } else {
                OutputMode::Rich
            },
            motion: if screen_reader || env_flag("CRUMB_REDUCED_MOTION") {
                MotionMode::Reduced
            } else {
                MotionMode::Full
            },
            branding,
        }
    }
}

/// Git information shown in the prompt.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GitSegment {
    pub branch: String,
    pub dirty: bool,
}

impl GitSegment {
    /// Reads local Git state without invoking a shell or accessing the network.
    #[must_use]
    pub fn discover(cwd: &Path) -> Option<Self> {
        let branch = git_output(cwd, &["symbolic-ref", "--quiet", "--short", "HEAD"])
            .or_else(|| git_output(cwd, &["rev-parse", "--short", "HEAD"]))?;
        let dirty = git_output(cwd, &["status", "--porcelain", "--untracked-files=no"])
            .is_some_and(|output| !output.is_empty());
        Some(Self { branch, dirty })
    }
}

/// State required to render one prompt.
#[derive(Clone, Debug)]
pub struct PromptContext<'a> {
    pub cwd: &'a Path,
    pub platform: Platform,
    pub git: Option<&'a GitSegment>,
    pub last_exit_code: Option<i32>,
    pub terminal_width: u16,
}

/// Non-secret state rendered once when the standalone terminal starts.
#[derive(Clone, Debug)]
pub struct StartupContext<'a> {
    pub version: &'a str,
    pub platform: Platform,
    pub instance_name: Option<&'a str>,
    pub model: Option<&'a str>,
    pub mode: &'a str,
    pub effort: Option<&'a str>,
    pub session_budget_tokens: u64,
    pub context_tokens: u64,
    pub auto_compaction: bool,
    pub agent_configured: bool,
}

/// Stateless terminal renderer.
#[derive(Clone, Copy, Debug)]
pub struct Renderer {
    settings: UiSettings,
}

impl Renderer {
    #[must_use]
    pub const fn new(settings: UiSettings) -> Self {
        Self { settings }
    }

    #[must_use]
    pub fn branding(&self) -> String {
        self.branding_for_width(120)
    }

    /// Renders the startup brand with a panda sized for the terminal width.
    #[must_use]
    pub fn branding_for_width(&self, terminal_width: u16) -> String {
        let punchline = startup_punchline();
        match self.settings.branding {
            BrandingMode::Full => format!(
                "{}\n  {}\n  {}",
                self.brand_art(terminal_width),
                self.paint(punchline, "1"),
                self.paint("Try: explain this workspace · /help shows commands", "2",)
            ),
            BrandingMode::Compact => {
                format!(
                    "{}  {}",
                    self.paint("crumb", "36;1"),
                    self.paint(punchline, "2")
                )
            }
            BrandingMode::Disabled => String::new(),
        }
    }

    /// Renders the application-style ready screen used in full-screen mode.
    #[must_use]
    pub fn welcome(&self, context: &StartupContext<'_>, terminal_width: u16) -> String {
        let panda = panda_art(panda_mood(Some(context.agent_configured)));
        let wordmark = if terminal_width < 60 {
            "CRUMB"
        } else {
            WORDMARK
        };
        let pack = context.model.unwrap_or("not configured");
        let instance = context
            .instance_name
            .map_or(String::new(), |name| format!(" · {name}"));
        let state = if context.agent_configured {
            format!("Ready{instance} · pack {pack} · {}", context.mode)
        } else {
            format!("Native shell ready{instance} · run /auth login to connect")
        };
        let copy = format!(
            "{wordmark}\nCrumb CLI v{} · Native commands stay native.\n{} · effort {}\nTry: explain this workspace · /help shows commands",
            context.version,
            state,
            context.effort.unwrap_or("default"),
        );
        if terminal_width < 96 {
            let panda = format!("  {}", trim_art(panda).replace('\n', "\n  "));
            let copy = paint_welcome_copy(
                *self,
                &copy,
                "  ",
                usize::from(terminal_width.saturating_sub(2)),
            );
            return format!("{}\n\n{}", self.paint_panda(&panda), copy);
        }
        compose_welcome(*self, trim_art(panda), &copy)
    }

    /// Renders the interactive workspace trust boundary.
    #[must_use]
    pub fn folder_trust(
        &self,
        workspace: &Path,
        allow_selected: bool,
        terminal_width: u16,
    ) -> String {
        let yes = if allow_selected { "›" } else { " " };
        let no = if allow_selected { " " } else { "›" };
        let yes_line = format!("{yes} 1. Yes, trust this folder for this session");
        let no_line = format!("{no} 2. No (Esc)");
        let width = usize::from(terminal_width.clamp(56, 100));
        let inner = width.saturating_sub(4);
        let row = |text: &str| format!("│ {:<inner$} │", fit_terminal_text(text, inner));
        let yes_line = if allow_selected {
            self.paint(&row(&yes_line), "30;44;1")
        } else {
            row(&yes_line)
        };
        let no_line = if allow_selected {
            row(&no_line)
        } else {
            self.paint(&row(&no_line), "30;44;1")
        };
        [
            self.paint(&format!("╭{}╮", "─".repeat(width - 2)), "2"),
            self.paint(&row("Confirm folder trust"), "1"),
            self.paint(&row(""), "2"),
            self.paint(&row(&workspace.display().to_string()), "2"),
            self.paint(
                &row("Crumb may read, edit, and run commands here with your permission."),
                "2",
            ),
            self.paint(&row(""), "2"),
            yes_line,
            no_line,
            self.paint(&row(""), "2"),
            self.paint(&row("↑/↓ navigate · Enter select · Esc cancel"), "2"),
            self.paint(&format!("╰{}╯", "─".repeat(width - 2)), "2"),
        ]
        .join("\n")
    }

    /// Renders the persistent keyboard guide below the full-screen composer.
    #[must_use]
    pub fn composer_hotkeys(&self, terminal_width: u16) -> String {
        let guide = if terminal_width < 52 {
            "↵ send · Tab complete · / commands"
        } else if terminal_width < 80 {
            "Enter send · Tab complete · PgUp/PgDn · / commands"
        } else {
            "Enter send · Ctrl+Enter queue · PgUp/PgDn scroll · Tab · @ · / · ?"
        };
        let guide = fit_terminal_text(guide, usize::from(terminal_width.saturating_sub(2)));
        self.paint(&format!("  {guide}"), "2")
    }

    /// Renders the persistent keyboard guide when the composer owns artifacts.
    #[must_use]
    pub fn composer_artifact_hotkeys(&self, terminal_width: u16) -> String {
        let guide = if terminal_width < 52 {
            "^V attach · Alt+X remove · Enter send"
        } else {
            "Ctrl+V attach · Alt+P preview · Alt+X remove · Enter send"
        };
        let guide = fit_terminal_text(guide, usize::from(terminal_width.saturating_sub(2)));
        self.paint(&format!("  {guide}"), "2")
    }

    /// Renders the fixed keyboard guide while an agent turn is active.
    #[must_use]
    pub fn composer_active_hotkeys(&self, terminal_width: u16) -> String {
        let guide = if terminal_width < 52 {
            "↵ steer · ^↵ queue · ^C cancel"
        } else if terminal_width < 80 {
            "Enter steer · PgUp/PgDn scroll · Ctrl+C cancel"
        } else {
            "Type a follow-up · Enter steer · Ctrl+Enter queue · PgUp/PgDn scroll · /pause · Ctrl+C cancel"
        };
        let guide = fit_terminal_text(guide, usize::from(terminal_width.saturating_sub(2)));
        self.paint(&format!("  {guide}"), "2")
    }

    /// Renders the persistent state row immediately below the composer.
    #[must_use]
    pub fn composer_idle_status(&self) -> String {
        format!("  {} {}", self.paint("●", "36"), self.paint("Ready", "2"))
    }

    /// Renders compact, non-secret model and context state for the fixed footer.
    #[must_use]
    pub fn context_footer(&self, context: &StartupContext<'_>, terminal_width: u16) -> String {
        let pack = context.model.unwrap_or("native");
        let instance = context
            .instance_name
            .map_or(String::new(), |name| format!(" · {name}"));
        let effort = context.effort.unwrap_or("default");
        let text = if terminal_width < 60 {
            format!(
                "{}/{} · effort {effort} · {}",
                compact_tokens(context.context_tokens),
                compact_tokens(context.session_budget_tokens),
                context.mode
            )
        } else {
            format!(
                "{}{} · effort {effort} · {pack} · {}",
                context_meter(context),
                instance,
                context.mode
            )
        };
        let text = fit_terminal_text(&text, usize::from(terminal_width.saturating_sub(2)));
        self.paint(&format!("  {text}"), "2")
    }

    /// Renders the bottom edge of the full-width composer.
    #[must_use]
    pub fn composer_bottom_border(&self, terminal_width: u16) -> String {
        let inner = usize::from(terminal_width.saturating_sub(6));
        self.paint(&format!("  ╰{}╯", "─".repeat(inner)), "2")
    }

    /// Renders the fixed divider between startup context and the transcript.
    #[must_use]
    pub fn transcript_divider(&self, available_width: u16) -> String {
        self.paint(&"─".repeat(usize::from(available_width)), "2")
    }

    /// Renders one vertical composer edge.
    #[must_use]
    pub fn composer_side_border(&self) -> String {
        self.paint("│", "2")
    }

    /// Renders the inactive prompt hint while a submitted turn is running.
    #[must_use]
    pub fn composer_placeholder(&self, available_width: u16) -> String {
        let placeholder = fit_terminal_text(
            "Ask Crumb anything or type a command · @ context · / commands · Tab complete",
            usize::from(available_width),
        );
        self.paint(&placeholder, "2;1")
    }

    /// Renders bounded follow-up text inside the active composer.
    #[must_use]
    pub fn composer_follow_up(&self, input: &str, available_width: u16) -> String {
        let input = fit_terminal_text(input, usize::from(available_width));
        self.paint(&input, "1")
    }

    /// Renders right-aligned, non-secret composer status.
    #[must_use]
    pub fn composer_status(&self, status: &str) -> String {
        self.paint(status, "35")
    }

    /// Renders a submitted line as part of the scrolling transcript.
    #[must_use]
    pub fn transcript_input(&self, username: &str, input: &str) -> String {
        self.transcript_input_at(username, input, None, 0)
    }

    /// Renders a submitted line with an optional right-aligned local timestamp.
    #[must_use]
    pub fn transcript_input_at(
        &self,
        _username: &str,
        input: &str,
        timestamp: Option<&str>,
        terminal_width: u16,
    ) -> String {
        if self.settings.output == OutputMode::ScreenReader {
            return format!("User: {input}");
        }
        let card_width = usize::from(terminal_width.saturating_sub(4));
        let content_width = card_width.saturating_sub(2);
        let timestamp = timestamp.unwrap_or_default();
        let mut body = vec![String::new()];
        let mut pending = input.lines().map(str::to_owned).collect::<VecDeque<_>>();
        if pending.is_empty() {
            pending.push_back(String::new());
        }
        while body.len() <= TRANSCRIPT_INPUT_MAX_ROWS
            && let Some(line) = pending.pop_front()
        {
            let first = body.len() == 1;
            let marker = if first { "◆ >" } else { "  │" };
            let timestamp_width = if first && !timestamp.is_empty() {
                timestamp.chars().count().saturating_add(1)
            } else {
                0
            };
            let available = content_width
                .saturating_sub(marker.chars().count())
                .saturating_sub(timestamp_width)
                .saturating_sub(1);
            let (line, remainder) = split_terminal_line(&line, available);
            if let Some(remainder) = remainder {
                pending.push_front(remainder);
            }
            let mut row = format!("{marker} {line}");
            if first && !timestamp.is_empty() {
                let padding = content_width
                    .saturating_sub(row.chars().count())
                    .saturating_sub(timestamp.chars().count())
                    .max(1);
                row.push_str(&" ".repeat(padding));
                row.push_str(timestamp);
            }
            body.push(row);
        }
        if !pending.is_empty()
            && let Some(last) = body.last_mut()
        {
            if content_width == 0 {
                last.push_str(" …");
            } else {
                *last = fit_terminal_text(&format!("{last} …"), content_width);
            }
        }
        body.push(String::new());
        body.into_iter()
            .map(|line| self.transcript_card_line(&line, card_width, "1"))
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn transcript_card_line(self, line: &str, width: usize, style: &str) -> String {
        if width == 0 {
            return format!("  {}", self.paint(line, style));
        }
        let line = fit_terminal_text(line, width);
        let padded = format!("{line:<width$}");
        format!(
            "  {}",
            self.paint(&padded, &format!("{style};48;2;85;85;85"))
        )
    }

    /// Starts raw native output with a shell-specific transcript branch.
    #[must_use]
    pub fn native_output_prefix(&self) -> String {
        if self.settings.output == OutputMode::ScreenReader {
            return "Shell output: ".to_owned();
        }
        format!("  {} ", self.paint("╰──▶", "35;1"))
    }

    /// Renders a compact, non-blocking startup readiness summary.
    #[must_use]
    pub fn startup_status(&self, context: &StartupContext<'_>) -> String {
        let pack = context.model.unwrap_or("not configured");
        let instance = context.instance_name.unwrap_or("unnamed");
        let state = if context.agent_configured {
            "agent ready"
        } else {
            "native shell ready · AI disconnected · run /auth login to connect"
        };
        if self.settings.output == OutputMode::ScreenReader {
            return format!(
                "crumb {} on {}\n{state}; instance {instance}; pack {pack}; mode {}",
                context.version, context.platform, context.mode
            );
        }
        format!(
            "{}  {}\n{}  {}",
            self.paint(" SESSION ", "30;46;1"),
            self.paint(
                &format!("crumb {} · {}", context.version, context.platform),
                "2"
            ),
            self.paint(
                if context.agent_configured {
                    "●"
                } else {
                    "○"
                },
                "36;1"
            ),
            self.paint(
                &format!(
                    "{state} · instance {instance} · pack {pack} · {}",
                    context.mode
                ),
                "2"
            )
        )
    }

    /// Renders the stable context shown before a Harness turn begins.
    #[must_use]
    pub fn agent_header(
        &self,
        model: &str,
        effort: Option<&str>,
        mode: &str,
        skill: Option<&str>,
    ) -> String {
        self.agent_header_for_width(model, effort, mode, skill, u16::MAX)
    }

    /// Renders Harness context without crossing the terminal UI margins.
    #[must_use]
    pub fn agent_header_for_width(
        &self,
        model: &str,
        effort: Option<&str>,
        mode: &str,
        skill: Option<&str>,
        terminal_width: u16,
    ) -> String {
        let mut details = vec![format!("pack {model}"), format!("mode {mode}")];
        if let Some(effort) = effort {
            details.push(format!("effort {effort}"));
        }
        if let Some(skill) = skill {
            details.push(format!("skill {skill}"));
        }
        if self.settings.output == OutputMode::ScreenReader {
            format!("Crumb agent\n{}", details.join(", "))
        } else {
            let prefix = format!(
                "  {}  ",
                self.paint(CRUMB_BADGE, "38;2;255;255;204;48;5;53;1")
            );
            let prefix_width = 2 + CRUMB_BADGE.chars().count() + 2;
            let content_width = usize::from(terminal_width.saturating_sub(2))
                .saturating_sub(prefix_width)
                .max(1);
            wrap_terminal_line(&details.join(" · "), content_width)
                .into_iter()
                .enumerate()
                .map(|(index, line)| {
                    let prefix = if index == 0 {
                        prefix.clone()
                    } else {
                        " ".repeat(prefix_width)
                    };
                    format!("{prefix}{}", self.paint(&line, "2"))
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
    }

    /// Renders one committed Harness response without protocol metadata.
    #[must_use]
    pub fn agent_response(&self, response: &str) -> String {
        self.agent_response_for_width(response, u16::MAX)
    }

    /// Renders one committed Harness response inside the terminal UI margins.
    #[must_use]
    pub fn agent_response_for_width(&self, response: &str, terminal_width: u16) -> String {
        let response = visible_agent_text(response);
        let content_width = usize::from(terminal_width.saturating_sub(10)).max(1);
        let response = render_terminal_markdown(*self, &response, content_width);
        if self.settings.output == OutputMode::ScreenReader {
            return response;
        }
        let mut lines = response.lines();
        let Some(first) = lines.next() else {
            return format!("\n  {}", self.paint("╰──▶", "35"));
        };
        let mut body = format!("\n  {} {first}", self.paint("╰──▶", "35;1"));
        for line in lines {
            body.push_str("\n        ");
            body.push_str(line);
        }
        body
    }

    /// Renders a recoverable command failure without ending the terminal session.
    #[must_use]
    pub fn command_error(&self, message: &str) -> String {
        self.command_error_for_width(message, u16::MAX)
    }

    /// Renders a recoverable command failure inside the terminal UI margins.
    #[must_use]
    pub fn command_error_for_width(&self, message: &str, terminal_width: u16) -> String {
        if self.settings.output == OutputMode::ScreenReader {
            return format!("Crumb command failed: {message}");
        }
        let mut output = format!(
            "  {}  {}",
            self.paint("[ CRUMB ]", "38;2;255;255;204;48;5;53;1"),
            self.paint("Command failed", "31;1")
        );
        let content_width = usize::from(terminal_width.saturating_sub(9)).max(1);
        for (index, line) in wrap_terminal_line(message, content_width)
            .into_iter()
            .enumerate()
        {
            if index == 0 {
                let _ = write!(output, "\n  {} {line}", self.paint("╰──▶", "31;1"));
            } else {
                let _ = write!(output, "\n        {line}");
            }
        }
        output
    }

    /// Renders a compact semantic status line using the active UI settings.
    #[must_use]
    pub fn status_line(&self, tone: StatusTone, message: &str) -> String {
        if self.settings.output == OutputMode::ScreenReader {
            let label = match tone {
                StatusTone::Info => "Info",
                StatusTone::Action => "Action",
                StatusTone::Waiting => "Waiting",
                StatusTone::Success => "Success",
                StatusTone::Warning => "Warning",
            };
            return format!("{label}: {message}");
        }
        let (marker, marker_style, message_style) = match tone {
            StatusTone::Info => ("◆", "36;1", ""),
            StatusTone::Action => ("›", "35;1", "36"),
            StatusTone::Waiting => ("◌", "33;1", "2"),
            StatusTone::Success => ("●", "32;1", "32"),
            StatusTone::Warning => ("!", "33;1", "33"),
        };
        format!(
            "  {} {}",
            self.paint(marker, marker_style),
            self.paint(message, message_style)
        )
    }

    /// Renders the persistent handoff shown after leaving the alternate screen.
    #[must_use]
    pub fn session_handoff(
        self,
        elapsed: Duration,
        session_id: Option<&str>,
        session_tokens: u64,
    ) -> String {
        let runtime = format!("Runtime  {:.1}s", elapsed.as_secs_f32());
        let session = session_id.map_or_else(
            || "Session  no agent session".to_owned(),
            |id| format!("Session  {id} · ~{} tokens", compact_tokens(session_tokens)),
        );
        let resume = session_id.map_or_else(
            || "Resume   start crumb to begin a session".to_owned(),
            |id| format!("Resume   crumb --resume={id}"),
        );
        if self.settings.output == OutputMode::ScreenReader {
            return format!("{runtime}\n{session}\n{resume}");
        }
        let details = [runtime, session, resume];
        let art = trim_art(PANDA_CLOSING);
        let art_lines = art.lines().collect::<Vec<_>>();
        let detail_start = art_lines.len().saturating_sub(details.len()) / 2;
        let art_width = art
            .lines()
            .map(|line| line.chars().count())
            .max()
            .unwrap_or_default();
        art_lines
            .into_iter()
            .enumerate()
            .map(|(index, line)| {
                let detail = index
                    .checked_sub(detail_start)
                    .and_then(|detail_index| details.get(detail_index))
                    .map_or("", String::as_str);
                format!(
                    "  {}   {}",
                    self.paint(&format!("{line:<art_width$}"), "38;2;128;128;128"),
                    self.paint(detail, "2")
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Renders a Harness failure without conflating it with native shell output.
    #[must_use]
    pub fn agent_error(&self, message: &str, cancelled: bool) -> String {
        self.agent_error_for_width(message, cancelled, u16::MAX)
    }

    /// Renders a Harness failure inside the terminal UI margins.
    #[must_use]
    pub fn agent_error_for_width(
        &self,
        message: &str,
        cancelled: bool,
        terminal_width: u16,
    ) -> String {
        let (marker, title) = if cancelled {
            ("■", "Agent cancelled")
        } else {
            ("!", "Agent unavailable")
        };
        if self.settings.output == OutputMode::ScreenReader {
            return format!("{title}: {message}");
        }
        let mut output = format!(
            "  {} {} {}",
            self.paint("│", "35"),
            self.paint(marker, if cancelled { "33;1" } else { "31;1" }),
            self.paint(title, "1")
        );
        let content_width = usize::from(terminal_width.saturating_sub(6)).max(1);
        for line in wrap_terminal_line(message, content_width) {
            let _ = write!(
                output,
                "\n  {} {}",
                self.paint("│", "35"),
                self.paint(&line, "2")
            );
        }
        let _ = write!(output, "\n  {}", self.paint("╰─", "35"));
        output
    }

    /// Renders one transient Harness activity update.
    #[must_use]
    pub fn agent_activity(&self, label: &str) -> String {
        if self.settings.output == OutputMode::ScreenReader {
            format!("Activity: {label}")
        } else {
            format!(
                "  {}  ↳ {}",
                self.paint("│", "35"),
                self.paint(label, "38;5;245")
            )
        }
    }

    /// Renders one edited-file activity with semantic diff colors.
    #[must_use]
    pub fn agent_file_change(&self, path: &str, additions: u64, deletions: u64) -> String {
        self.agent_change_activity(&format!("Edited · {path}"), additions, deletions)
    }

    /// Renders the final per-turn edit summary with green additions and red deletions.
    #[must_use]
    pub fn agent_change_summary(&self, edits: &[(&str, u64, u64)]) -> String {
        let additions = edits.iter().map(|(_, additions, _)| additions).sum::<u64>();
        let deletions = edits.iter().map(|(_, _, deletions)| deletions).sum::<u64>();
        let noun = if edits.len() == 1 { "file" } else { "files" };
        let mut output = self.agent_change_activity(
            &format!("Changes · {} {noun}", edits.len()),
            additions,
            deletions,
        );
        for (path, added, deleted) in edits {
            let _ = write!(
                output,
                "\n    {}  {} {}",
                self.paint(path, "38;5;245"),
                self.paint(&format!("+{added}"), "32"),
                self.paint(&format!("-{deleted}"), "31")
            );
        }
        output
    }

    fn agent_change_activity(self, label: &str, additions: u64, deletions: u64) -> String {
        let counts = format!("+{additions} -{deletions}");
        if self.settings.output == OutputMode::ScreenReader {
            return format!("Activity: {label} · {counts}");
        }
        format!(
            "  {}  ↳ {} · {} {}",
            self.paint("│", "35"),
            self.paint(label, "38;5;245"),
            self.paint(&format!("+{additions}"), "32"),
            self.paint(&format!("-{deletions}"), "31")
        )
    }

    /// Renders one subdued, always-visible summary for an inter-agent exchange.
    ///
    /// Message bodies, tool output, and file paths are intentionally excluded;
    /// a later transcript control can expose approved details independently.
    #[must_use]
    pub fn peer_activity(&self, activity: &PeerActivity<'_>) -> String {
        let seconds = activity.elapsed.as_secs_f32();
        let artifacts = match activity.artifact_count {
            0 => String::new(),
            1 => " · 1 artifact".to_owned(),
            count => format!(" · {count} artifacts"),
        };
        let label = format!(
            "{} ↔ {} · {} · {seconds:.1}s{artifacts}",
            activity.local_name,
            activity.remote_name,
            activity.state.label(),
        );
        if self.settings.output == OutputMode::ScreenReader {
            format!("Agent exchange: {label}")
        } else {
            format!(
                "  {}  ⇄ {}",
                self.paint("│", "38;5;245"),
                self.paint(&label, "38;5;245")
            )
        }
    }

    /// Renders explicitly inspected peer content as bounded plain text.
    ///
    /// Peer input is never interpreted as terminal Markdown. ANSI sequences,
    /// terminal controls, and bidirectional text controls are removed before
    /// subdued rendering, and both source and rendered line counts are capped.
    #[must_use]
    pub fn peer_untrusted_text_for_width(&self, content: &str, terminal_width: u16) -> String {
        let content = sanitize_peer_text(content);
        let content_width = usize::from(terminal_width.saturating_sub(10)).max(1);
        let lines = content
            .lines()
            .flat_map(|line| wrap_terminal_line(line, content_width))
            .take(PEER_INSPECTION_MAX_LINES)
            .collect::<Vec<_>>();
        if self.settings.output == OutputMode::ScreenReader {
            return format!("Peer delivery details:\n{}", lines.join("\n"));
        }
        let mut output = format!(
            "  {}  {}",
            self.paint("│", "38;5;245"),
            self.paint("peer delivery details", "38;5;245")
        );
        for line in lines {
            let _ = write!(
                output,
                "\n  {}    {}",
                self.paint("│", "38;5;245"),
                self.paint(&line, "38;5;245")
            );
        }
        output
    }

    /// Renders bounded tool output as a distinct transcript block.
    #[must_use]
    pub fn agent_tool_output_for_width(&self, content: &str, terminal_width: u16) -> String {
        let content = content.trim_end();
        if self.settings.output == OutputMode::ScreenReader {
            return format!("Tool output:\n{content}");
        }
        let content_width = usize::from(terminal_width.saturating_sub(10)).max(1);
        let mut output = format!(
            "  {}    {}",
            self.paint("│", "35"),
            self.paint("tool output", "38;5;245")
        );
        for source_line in content.lines() {
            for line in wrap_terminal_line(source_line, content_width) {
                let _ = write!(
                    output,
                    "\n  {}    {}",
                    self.paint("│", "35"),
                    self.paint(&line, "2")
                );
            }
        }
        output
    }

    /// Renders the clickable summary row for captured tool output.
    #[must_use]
    pub fn agent_tool_output_toggle(&self, expanded: bool, lines: usize, bytes: usize) -> String {
        let marker = if expanded { "▼" } else { "▶" };
        let label = format!("{marker} Tool output · {lines} lines · {bytes} B");
        if self.settings.output == OutputMode::ScreenReader {
            return label;
        }
        format!(
            "  {}    {}",
            self.paint("│", "35"),
            self.paint(&label, "38;5;245")
        )
    }

    /// Renders only the body of an expanded tool-output block.
    #[must_use]
    pub fn agent_tool_output_body_for_width(
        &self,
        content: &str,
        terminal_width: u16,
    ) -> Vec<String> {
        let content_width = usize::from(terminal_width.saturating_sub(10)).max(1);
        content
            .trim_end()
            .lines()
            .flat_map(|source_line| wrap_terminal_line(source_line, content_width))
            .map(|line| {
                if self.settings.output == OutputMode::ScreenReader {
                    line
                } else {
                    format!("  {}    {}", self.paint("│", "35"), self.paint(&line, "2"))
                }
            })
            .collect()
    }

    /// Renders a durable tool outcome in the scrolling transcript.
    #[must_use]
    pub fn agent_tool_result(&self, name: &str, success: bool) -> String {
        let state = if success { "completed" } else { "failed" };
        let (title, detail) = if name == PARALLEL_TOOL {
            (
                if success {
                    "Agent team reported"
                } else {
                    "Agent team failed"
                },
                "parallel findings returned to the parent Harness",
            )
        } else {
            (
                if success {
                    "Tool completed"
                } else {
                    "Tool failed"
                },
                name,
            )
        };
        if self.settings.output == OutputMode::ScreenReader {
            return if name == PARALLEL_TOOL {
                format!("Parallel agent team {state}")
            } else {
                format!("Tool {name} {state}")
            };
        }
        let color = if success { "38;5;245" } else { "31;1" };
        format!(
            "  {}  {} {} {}",
            self.paint(CRUMB_BADGE, "38;2;255;255;204;48;5;53;1"),
            self.paint(title, color),
            self.paint("·", "2"),
            self.paint(detail, if success { "38;5;245" } else { "1" })
        )
    }

    /// Renders an approval request without implying that the model can grant it.
    #[must_use]
    pub fn agent_approval_required(&self, name: &str) -> String {
        if self.settings.output == OutputMode::ScreenReader {
            return format!("Approval required for tool {name}");
        }
        let detail = if name == PARALLEL_TOOL {
            "Koi · Nyx · Rune · Echo · user permission required".to_owned()
        } else {
            format!("{name} · user permission required")
        };
        format!(
            "  {}  {}\n  {} {}",
            self.paint(CRUMB_BADGE, "38;2;255;255;204;48;5;53;1"),
            self.paint(
                if name == PARALLEL_TOOL {
                    "Allow a parallel agent team?"
                } else {
                    "Approval required"
                },
                "33;1",
            ),
            self.paint("╰──▶", "33;1"),
            self.paint(&detail, "1")
        )
    }

    /// Renders a trusted allow-once decision with an optional bounded summary.
    #[must_use]
    pub fn agent_approval_prompt(
        &self,
        name: &str,
        risk: &str,
        digest: &str,
        detail: Option<&str>,
    ) -> String {
        let short_digest = digest.get(..12).unwrap_or(digest);
        if self.settings.output == OutputMode::ScreenReader {
            let mut prompt = format!(
                "Approval required for {name}, risk {risk}, request {short_digest}. Enter or y allows once; a always allows this tool; s selects sensitive-only mode; f selects full access; n or escape denies."
            );
            if let Some(detail) = detail {
                let _ = write!(prompt, " Requested action: {detail}.");
            }
            return prompt;
        }
        let detail_line = detail.map_or_else(String::new, |detail| {
            format!("\n     {}", self.paint(detail, "36;1"))
        });
        format!(
            "  {}  {}\n  {} {}{}\n     {}\n     {}",
            self.paint("[ CRUMB ]", "38;2;255;255;204;48;5;53;1"),
            self.paint("Allow this tool once?", "33;1"),
            self.paint("╰──▶", "33;1"),
            self.paint(name, "1"),
            detail_line,
            self.paint(&format!("risk {risk} · request {short_digest}"), "2"),
            self.paint(
                "Enter/y once · a always allow tool · s sensitive · f full access · n/Esc deny",
                "2",
            )
        )
    }

    /// Renders a one-shot peer-exchange approval without offering persistent
    /// tool or permission-mode elevation.
    #[must_use]
    pub fn peer_approval_prompt(&self, name: &str, digest: &str, peer: Option<&str>) -> String {
        let short_digest = digest.get(..12).unwrap_or(digest);
        if self.settings.output == OutputMode::ScreenReader {
            let mut prompt = format!(
                "Peer communication approval required for {name}, request {short_digest}. Enter or y allows this exchange once; n or escape denies."
            );
            if let Some(peer) = peer {
                let _ = write!(prompt, " Selected peer: {peer}.");
            }
            return prompt;
        }
        let peer_line = peer.map_or_else(String::new, |peer| {
            format!("\n     {}", self.paint(&format!("peer {peer}"), "36;1"))
        });
        format!(
            "  {}  {}\n  {} {}{}\n     {}\n     {}",
            self.paint("[ CRUMB ]", "38;2;255;255;204;48;5;53;1"),
            self.paint("Allow this peer exchange once?", "33;1"),
            self.paint("╰──▶", "33;1"),
            self.paint(name, "1"),
            peer_line,
            self.paint(
                &format!("risk peer communication · request {short_digest}"),
                "2"
            ),
            self.paint("Enter/y once · n/Esc deny", "2"),
        )
    }

    /// Starts a single-line terminal activity animation.
    #[must_use]
    pub fn activity(&self, label: &str) -> ActivityIndicator {
        ActivityIndicator::start(
            label,
            self.settings.output == OutputMode::Rich && self.settings.motion == MotionMode::Full,
            self.settings.color,
            None,
        )
    }

    /// Starts an activity animation pinned to a zero-based terminal row.
    #[must_use]
    pub fn activity_at(&self, label: &str, row: u16) -> ActivityIndicator {
        ActivityIndicator::start(
            label,
            self.settings.output == OutputMode::Rich && self.settings.motion == MotionMode::Full,
            self.settings.color,
            Some(row),
        )
    }

    #[must_use]
    pub fn prompt(&self, context: &PromptContext<'_>) -> String {
        let cwd = display_path(context.cwd);
        if self.settings.output != OutputMode::Rich {
            let mut segments = vec![format!("crumb {cwd}"), context.platform.to_string()];
            append_optional_segments(&mut segments, context);
            return format!("{}\n> ", segments.join(" | "));
        }

        let mut context_line = self.paint(&format!("  {cwd}"), "34;1");
        if let Some(git) = context.git {
            let dirty = if git.dirty { " *" } else { "" };
            context_line.push_str(&self.paint(&format!("  git:{}{dirty}", git.branch), "2"));
        }
        if let Some(exit_code) = context.last_exit_code
            && exit_code != 0
        {
            context_line.push_str(&self.paint(&format!("  exit:{exit_code}"), "31"));
        }
        let rule_width = usize::from(context.terminal_width.saturating_sub(6));
        format!(
            "{context_line}\n  {}\n  {} ",
            self.paint(&format!("╭{}╮", "─".repeat(rule_width)), "2"),
            self.paint("│", "36;1")
        )
    }

    fn paint(self, text: &str, color: &str) -> String {
        if self.settings.color {
            format!("\x1b[{color}m{text}\x1b[0m")
        } else {
            text.to_owned()
        }
    }

    fn brand_art(self, terminal_width: u16) -> String {
        let panda = panda_art(panda_mood(None));
        if terminal_width < 76 {
            let wordmark = if terminal_width < 60 {
                "CRUMB"
            } else {
                WORDMARK
            };
            return format!(
                "{}\n{}",
                self.paint_panda(trim_art(panda)),
                self.paint(wordmark, "38;2;255;255;204;1")
            );
        }
        compose_styled_art(self, trim_art(panda), WORDMARK, 4)
    }

    fn paint_panda(self, panda: &str) -> String {
        panda
            .lines()
            .map(|line| paint_panda_line(self, line))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn panda_mood(agent_configured: Option<bool>) -> PandaMood {
    match env::var("CRUMB_MOOD").as_deref() {
        Ok("awake") => PandaMood::Awake,
        Ok("cool") => PandaMood::Cool,
        _ if agent_configured == Some(true) => PandaMood::Cool,
        _ => PandaMood::Awake,
    }
}

const fn panda_art(mood: PandaMood) -> &'static str {
    match mood {
        PandaMood::Awake => PANDA_AWAKE,
        PandaMood::Cool => PANDA_COOL,
    }
}

fn paint_panda_line(renderer: Renderer, line: &str) -> String {
    let mut painted = String::new();
    for character in line.chars() {
        let color = match character {
            '╭' | '╮' | '╯' | '╰' | '─' | '│' => "38;2;255;253;241",
            '█' | '═' => "38;2;96;80;122",
            '▛' | '▀' | '▜' => "38;2;151;119;188",
            '▌' | '▐' => "38;2;119;93;154",
            '▙' | '▄' | '▟' => "38;2;76;61;99",
            '●' => "38;2;157;128;193;1",
            '░' => "38;2;255;190;195",
            '▒' => "38;2;255;125;139",
            '▓' => "38;2;255;88;110",
            '▆' | '▃' | '▂' => "38;2;255;154;171",
            _ => {
                painted.push(character);
                continue;
            }
        };
        painted.push_str(&renderer.paint(&character.to_string(), color));
    }
    painted
}

fn trim_art(art: &str) -> &str {
    art.trim()
}

fn compact_tokens(tokens: u64) -> String {
    if tokens >= 1_000_000 {
        format!("{}.{}m", tokens / 1_000_000, tokens % 1_000_000 / 100_000)
    } else if tokens >= 1_000 {
        format!("{}.{}k", tokens / 1_000, tokens % 1_000 / 100)
    } else {
        tokens.to_string()
    }
}

fn context_meter(context: &StartupContext<'_>) -> String {
    let budget = context.session_budget_tokens.max(1);
    let used = context.context_tokens.min(budget);
    let filled = usize::try_from(
        used.saturating_mul(CONTEXT_METER_WIDTH as u64)
            .div_ceil(budget),
    )
    .unwrap_or(CONTEXT_METER_WIDTH)
    .min(CONTEXT_METER_WIDTH);
    let meter = format!(
        "{}{}",
        "━".repeat(filled),
        "─".repeat(CONTEXT_METER_WIDTH.saturating_sub(filled))
    );
    let percent = used.saturating_mul(100) / budget;
    format!(
        "Model context [{meter}] {percent:>3}% · {} / {}",
        compact_tokens(used),
        compact_tokens(context.session_budget_tokens)
    )
}

fn fit_terminal_text(text: &str, width: usize) -> String {
    let mut fitted = text.chars().take(width).collect::<String>();
    if text.chars().count() > width && width > 1 {
        fitted.pop();
        fitted.push('…');
    }
    fitted
}

fn split_terminal_line(text: &str, width: usize) -> (String, Option<String>) {
    if width == 0 || text.chars().count() <= width {
        return (text.to_owned(), None);
    }
    let prefix = text.chars().take(width).collect::<String>();
    let split = prefix
        .char_indices()
        .filter(|(_, character)| character.is_whitespace())
        .map(|(index, _)| index)
        .next_back()
        .filter(|index| *index > 0)
        .unwrap_or(prefix.len());
    let head = prefix[..split].trim_end().to_owned();
    let remainder = text[split..].trim_start().to_owned();
    (head, Some(remainder))
}

fn compose_styled_art(renderer: Renderer, left: &str, right: &str, gap: usize) -> String {
    let left = left.lines().collect::<Vec<_>>();
    let right = right.lines().collect::<Vec<_>>();
    let height = left.len().max(right.len());
    let left_width = left
        .iter()
        .map(|line| line.chars().count())
        .max()
        .unwrap_or(0);
    let left_offset = height.saturating_sub(left.len()) / 2;
    let right_offset = height.saturating_sub(right.len()) / 2;
    (0..height)
        .map(|row| {
            let left_line = row
                .checked_sub(left_offset)
                .and_then(|index| left.get(index))
                .copied()
                .unwrap_or("");
            let right_line = row
                .checked_sub(right_offset)
                .and_then(|index| right.get(index))
                .copied()
                .unwrap_or("");
            format!(
                "{}{}{}",
                renderer.paint_panda(&format!("{left_line:<left_width$}")),
                " ".repeat(gap),
                renderer.paint(right_line, "38;2;255;255;204;1")
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn compose_welcome(renderer: Renderer, panda: &str, copy: &str) -> String {
    let panda = panda.lines().collect::<Vec<_>>();
    let copy = copy.lines().collect::<Vec<_>>();
    let height = panda.len().max(copy.len());
    let panda_width = panda
        .iter()
        .map(|line| line.chars().count())
        .max()
        .unwrap_or(0);
    (0..height)
        .map(|row| {
            let panda_line = panda.get(row).copied().unwrap_or("");
            let copy_line = copy.get(row).copied().unwrap_or("");
            format!(
                "  {}    {}",
                renderer.paint_panda(&format!("{panda_line:<panda_width$}")),
                renderer.paint(copy_line, welcome_copy_style(row))
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn paint_welcome_copy(renderer: Renderer, copy: &str, gutter: &str, width: usize) -> String {
    copy.lines()
        .enumerate()
        .map(|(row, line)| {
            format!(
                "{gutter}{}",
                renderer.paint(&fit_terminal_text(line, width), welcome_copy_style(row))
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

const fn welcome_copy_style(row: usize) -> &'static str {
    match row {
        0..=5 => "38;2;255;255;204;1",
        6 => "97;1",
        7 => "36;1",
        9 => "35",
        _ => "2",
    }
}

fn startup_punchline() -> &'static str {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO);
    let process = u128::from(std::process::id());
    let width = u128::try_from(PUNCHLINES.len()).unwrap_or(1);
    let index = usize::try_from((elapsed.as_nanos() ^ process) % width).unwrap_or(0);
    PUNCHLINES[index]
}

/// A best-effort activity line that always clears itself before final output.
pub struct ActivityIndicator {
    running: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    started: Instant,
    label: String,
    visible: bool,
    color: bool,
    row: Option<u16>,
}

impl ActivityIndicator {
    fn start(label: &str, animated: bool, color: bool, row: Option<u16>) -> Self {
        let running = Arc::new(AtomicBool::new(animated));
        let thread = animated.then(|| {
            let running = Arc::clone(&running);
            let label = label.to_owned();
            thread::spawn(move || animate_activity(&label, color, &running, row))
        });
        Self {
            running,
            thread,
            started: Instant::now(),
            label: label.to_owned(),
            visible: animated,
            color,
            row,
        }
    }

    /// Returns the stable activity label so a fullscreen caller can relocate
    /// the animation after repainting a scrollable viewport.
    #[must_use]
    pub fn label(&self) -> &str {
        &self.label
    }

    /// Returns how long the current activity phase has been running.
    #[must_use]
    pub fn elapsed(&self) -> Duration {
        self.started.elapsed()
    }

    /// Returns the pinned terminal row used by a fullscreen activity.
    ///
    /// Replacements reuse this row so moving the input cursor into the
    /// composer cannot make an in-flight status jump to the footer.
    #[must_use]
    pub const fn row(&self) -> Option<u16> {
        self.row
    }

    /// Stops and clears the activity line before another message is rendered.
    pub fn finish(mut self) {
        self.stop();
    }

    /// Stops the animation and leaves one compact completion crumb.
    pub fn complete(mut self) {
        self.stop();
        if self.visible && self.row.is_none() {
            let elapsed = self.started.elapsed().as_secs_f32();
            let summary = if self.color {
                format!("\x1b[90m. Worked for {elapsed:.1}s\x1b[0m")
            } else {
                format!(". Worked for {elapsed:.1}s")
            };
            let _ = writeln!(io::stderr(), "{summary}");
            let _ = io::stderr().flush();
        }
    }

    fn stop(&mut self) {
        self.running.store(false, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
            clear_activity_line(self.row);
        }
    }
}

impl Drop for ActivityIndicator {
    fn drop(&mut self) {
        self.stop();
    }
}

fn animate_activity(label: &str, color: bool, running: &AtomicBool, row: Option<u16>) {
    let mut frame = 0_usize;
    let started = Instant::now();
    while running.load(Ordering::Acquire) {
        let cookie = COOKIE_SPINNER[frame];
        let elapsed = started.elapsed().as_secs_f32();
        let line = if color {
            format!("\x1b[35;1m{cookie}\x1b[0m \x1b[90m{label} · {elapsed:.1}s\x1b[0m")
        } else {
            format!("{cookie} {label} · {elapsed:.1}s")
        };
        write_activity_line(&line, row);
        let _ = io::stderr().flush();
        frame = (frame + 1) % COOKIE_SPINNER.len();
        thread::sleep(Duration::from_millis(140));
    }
}

fn write_activity_line(line: &str, row: Option<u16>) {
    let rendered = if let Some(row) = row {
        format!("\x1b7\x1b[{};1H\x1b[2K  {line}\x1b8", row.saturating_add(1))
    } else {
        format!("\r\x1b[2K{line}")
    };
    let _ = io::stderr().write_all(rendered.as_bytes());
}

fn clear_activity_line(row: Option<u16>) {
    write_activity_line("", row);
    let _ = io::stderr().flush();
}

/// Removes provider reasoning wrappers from text intended for the terminal.
#[must_use]
pub fn visible_agent_text(response: &str) -> String {
    let mut visible = response.to_owned();
    for (opening, closing) in [
        ("<thinking>", "</thinking>"),
        ("<think>", "</think>"),
        ("<TASK>", "</TASK>"),
        ("<task>", "</task>"),
    ] {
        while let Some(start) = visible.find(opening) {
            let tail = &visible[start + opening.len()..];
            let end = tail.find(closing).map_or(visible.len(), |offset| {
                start + opening.len() + offset + closing.len()
            });
            visible.replace_range(start..end, "");
        }
    }
    let visible = visible.trim();
    visible
        .strip_prefix("<response>")
        .and_then(|body| body.strip_suffix("</response>"))
        .map_or_else(|| visible.to_owned(), |body| body.trim().to_owned())
}

fn render_terminal_markdown(ui: Renderer, markdown: &str, content_width: usize) -> String {
    let mut output_lines = Vec::new();
    let mut fence: Option<String> = None;
    let mut mermaid_source = Vec::new();

    for line in markdown.lines() {
        let trimmed = line.trim_start();
        if let Some(info) = trimmed.strip_prefix("```") {
            if let Some(language) = fence.take() {
                if language.eq_ignore_ascii_case("mermaid") {
                    render_mermaid_block(ui, &mermaid_source, content_width, &mut output_lines);
                    mermaid_source.clear();
                } else {
                    output_lines.push(ui.paint("└─", "2"));
                }
            } else {
                let language = info.trim();
                if !language.eq_ignore_ascii_case("mermaid") {
                    let label = if language.is_empty() {
                        "code".to_owned()
                    } else {
                        format!("code · {language}")
                    };
                    output_lines.push(format!(
                        "{} {}",
                        ui.paint("┌─", "2"),
                        ui.paint(&label, "35;1")
                    ));
                }
                fence = Some(language.to_owned());
            }
            continue;
        }

        if fence
            .as_deref()
            .is_some_and(|language| language.eq_ignore_ascii_case("mermaid"))
        {
            mermaid_source.push(line.to_owned());
            continue;
        }

        if fence.is_some() {
            for chunk in wrap_terminal_line(line, content_width.saturating_sub(2).max(1)) {
                output_lines.push(format!("{} {chunk}", ui.paint("│", "2")));
            }
            continue;
        }

        for line in wrap_markdown_source_line(line, content_width) {
            output_lines.push(render_markdown_line(ui, &line));
        }
    }

    if let Some(language) = fence {
        if language.eq_ignore_ascii_case("mermaid") {
            render_mermaid_block(ui, &mermaid_source, content_width, &mut output_lines);
        } else {
            output_lines.push(ui.paint("└─", "2"));
        }
    }
    output_lines.join("\n")
}

fn render_mermaid_block(
    ui: Renderer,
    source: &[String],
    content_width: usize,
    output: &mut Vec<String>,
) {
    output.push(format!(
        "{} {}",
        ui.paint("┌─", "2"),
        ui.paint("mermaid diagram · preview", "35;1")
    ));
    if let Some(preview) = mermaid_terminal_preview(source) {
        for line in preview {
            for chunk in wrap_terminal_line(&line, content_width.saturating_sub(2).max(1)) {
                output.push(format!("{} {chunk}", ui.paint("│", "2")));
            }
        }
    } else {
        output.push(format!(
            "{} {}",
            ui.paint("│", "2"),
            ui.paint("Preview unavailable for this Mermaid syntax", "2")
        ));
    }
    output.push(format!(
        "{} {}",
        ui.paint("├─", "2"),
        ui.paint("source", "35;1")
    ));
    for line in source {
        for chunk in wrap_terminal_line(line, content_width.saturating_sub(2).max(1)) {
            output.push(format!("{} {chunk}", ui.paint("│", "2")));
        }
    }
    output.push(ui.paint("└─", "2"));
}

fn mermaid_terminal_preview(source: &[String]) -> Option<Vec<String>> {
    let diagram = source
        .iter()
        .map(|line| line.trim())
        .find(|line| !line.is_empty() && !line.starts_with("%%"))?;
    let sequence = diagram.eq_ignore_ascii_case("sequenceDiagram");
    let flow = diagram
        .split_whitespace()
        .next()
        .is_some_and(|word| matches!(word.to_ascii_lowercase().as_str(), "graph" | "flowchart"));
    if !sequence && !flow {
        return None;
    }

    let mut preview = Vec::new();
    for line in source.iter().map(|line| line.trim()).filter(|line| {
        !line.is_empty()
            && !line.starts_with("%%")
            && !line.eq_ignore_ascii_case("sequenceDiagram")
            && !line.starts_with("graph ")
            && !line.starts_with("flowchart ")
    }) {
        let Some((left, arrow, right)) = split_mermaid_edge(line) else {
            continue;
        };
        let (right, message) = if sequence {
            right
                .split_once(':')
                .map_or((right, ""), |(node, message)| (node, message.trim()))
        } else {
            (right, "")
        };
        let left = mermaid_node_label(left);
        let right = mermaid_node_label(right);
        if left.is_empty() || right.is_empty() {
            continue;
        }
        let connector = match arrow {
            "==>" => "══▶",
            "-.->" => "┄─▶",
            "---" => "───",
            _ => "──▶",
        };
        if message.is_empty() {
            preview.push(format!("〔{left}〕 {connector} 〔{right}〕"));
        } else {
            preview.push(format!("〔{left}〕 ── {message} ──▶ 〔{right}〕"));
        }
    }
    (!preview.is_empty()).then_some(preview)
}

fn split_mermaid_edge(line: &str) -> Option<(&str, &str, &str)> {
    ["-.->", "-->>", "->>", "-->", "==>", "---"]
        .into_iter()
        .find_map(|arrow| {
            line.split_once(arrow)
                .map(|(left, right)| (left.trim(), arrow, right.trim()))
        })
}

fn mermaid_node_label(node: &str) -> String {
    let node = node.trim();
    let node = if node.starts_with('|') {
        node.get(1..)
            .and_then(|tail| tail.split_once('|').map(|(_, node)| node))
            .unwrap_or(node)
    } else {
        node
    };
    for (opening, closing) in [('[', ']'), ('(', ')'), ('{', '}')] {
        if let Some(start) = node.find(opening)
            && let Some(end) = node[start + 1..].find(closing)
        {
            return node[start + 1..start + 1 + end]
                .trim_matches(['"', '\''])
                .to_owned();
        }
    }
    node.split_whitespace()
        .next()
        .unwrap_or_default()
        .trim_end_matches(';')
        .to_owned()
}

fn wrap_markdown_source_line(line: &str, width: usize) -> Vec<String> {
    let trimmed = line.trim_start();
    let indent = &line[..line.len() - trimmed.len()];
    let indent_width = indent.chars().count();
    let available = width.saturating_sub(indent_width).max(1);

    for marker in ["- ", "* ", "+ ", "> "] {
        if let Some(body) = trimmed.strip_prefix(marker) {
            let chunks = wrap_terminal_line(body, available.saturating_sub(2).max(1));
            return chunks
                .into_iter()
                .enumerate()
                .map(|(index, chunk)| {
                    let continuation = if index == 0 || marker == "> " {
                        marker
                    } else {
                        "  "
                    };
                    format!("{indent}{continuation}{chunk}")
                })
                .collect();
        }
    }

    if let Some((level, heading)) = markdown_heading(trimmed) {
        let chunks = wrap_terminal_line(heading, available);
        return chunks
            .into_iter()
            .enumerate()
            .map(|(index, chunk)| {
                if index == 0 {
                    format!("{indent}{} {chunk}", "#".repeat(level))
                } else {
                    format!("{indent}{chunk}")
                }
            })
            .collect();
    }

    wrap_terminal_line(trimmed, available)
        .into_iter()
        .map(|chunk| format!("{indent}{chunk}"))
        .collect()
}

fn wrap_terminal_line(line: &str, width: usize) -> Vec<String> {
    if line.is_empty() {
        return vec![String::new()];
    }
    let mut wrapped = Vec::new();
    let mut pending = line.to_owned();
    loop {
        let (head, remainder) = split_terminal_line(&pending, width);
        wrapped.push(head);
        let Some(remainder) = remainder else {
            break;
        };
        pending = remainder;
    }
    wrapped
}

#[derive(Clone, Copy)]
enum PeerEscapeState {
    Text,
    Escape,
    Csi,
    String { escaped: bool },
}

fn sanitize_peer_text(input: &str) -> String {
    let mut output = String::with_capacity(input.len().min(PEER_INSPECTION_MAX_BYTES));
    let mut state = PeerEscapeState::Text;
    let mut lines = 1_usize;
    for character in input.chars() {
        state = match state {
            PeerEscapeState::Text if character == '\u{1b}' => PeerEscapeState::Escape,
            PeerEscapeState::Text if character == '\u{9b}' => PeerEscapeState::Csi,
            PeerEscapeState::Text
                if matches!(character, '\u{90}' | '\u{98}' | '\u{9d}'..='\u{9f}') =>
            {
                PeerEscapeState::String { escaped: false }
            }
            PeerEscapeState::Text => {
                if character == '\n' {
                    if lines >= PEER_INSPECTION_MAX_LINES {
                        break;
                    }
                    if output.len() + 1 > PEER_INSPECTION_MAX_BYTES {
                        break;
                    }
                    output.push('\n');
                    lines += 1;
                } else if character == '\t' {
                    if output.len() + 1 > PEER_INSPECTION_MAX_BYTES {
                        break;
                    }
                    output.push(' ');
                } else if !is_peer_control(character) && !is_bidi_control(character) {
                    if output.len() + character.len_utf8() > PEER_INSPECTION_MAX_BYTES {
                        break;
                    }
                    output.push(character);
                }
                PeerEscapeState::Text
            }
            PeerEscapeState::Escape => match character {
                '[' => PeerEscapeState::Csi,
                ']' | 'P' | 'X' | '^' | '_' => PeerEscapeState::String { escaped: false },
                _ => PeerEscapeState::Text,
            },
            PeerEscapeState::Csi => {
                if ('@'..='~').contains(&character) {
                    PeerEscapeState::Text
                } else {
                    PeerEscapeState::Csi
                }
            }
            PeerEscapeState::String { escaped: false } if character == '\u{7}' => {
                PeerEscapeState::Text
            }
            PeerEscapeState::String { .. } if character == '\u{9c}' => PeerEscapeState::Text,
            PeerEscapeState::String { escaped: false } if character == '\u{1b}' => {
                PeerEscapeState::String { escaped: true }
            }
            PeerEscapeState::String { escaped: true } if character == '\\' => PeerEscapeState::Text,
            PeerEscapeState::String { .. } => PeerEscapeState::String { escaped: false },
        };
    }
    output.trim_end().to_owned()
}

fn is_peer_control(character: char) -> bool {
    matches!(character as u32, 0x00..=0x1f | 0x7f..=0x9f)
}

fn is_bidi_control(character: char) -> bool {
    matches!(
        character,
        '\u{061c}'
            | '\u{200e}'
            | '\u{200f}'
            | '\u{202a}'..='\u{202e}'
            | '\u{2066}'..='\u{2069}'
    )
}

fn render_markdown_line(renderer: Renderer, line: &str) -> String {
    let trimmed = line.trim_start();
    let indent = &line[..line.len() - trimmed.len()];

    if let Some((level, heading)) = markdown_heading(trimmed) {
        let color = if level <= 2 {
            "38;2;255;255;204;1"
        } else {
            "1"
        };
        return format!("{indent}{}", renderer.paint(heading, color));
    }
    if let Some(quote) = trimmed.strip_prefix("> ") {
        return format!(
            "{indent}{} {}",
            renderer.paint("│", "2"),
            render_inline_markdown(renderer, quote)
        );
    }
    if let Some(item) = trimmed
        .strip_prefix("- ")
        .or_else(|| trimmed.strip_prefix("* "))
        .or_else(|| trimmed.strip_prefix("+ "))
    {
        return format!(
            "{indent}{} {}",
            renderer.paint("•", "35;1"),
            render_inline_markdown(renderer, item)
        );
    }
    if matches!(trimmed, "---" | "***" | "___") {
        return format!("{indent}{}", renderer.paint("────────────────", "2"));
    }
    format!("{indent}{}", render_inline_markdown(renderer, trimmed))
}

fn markdown_heading(line: &str) -> Option<(usize, &str)> {
    let hashes = line.bytes().take_while(|byte| *byte == b'#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    line.get(hashes..)?
        .strip_prefix(' ')
        .map(|text| (hashes, text))
}

fn render_inline_markdown(renderer: Renderer, text: &str) -> String {
    let mut output = String::new();
    let mut rest = text;
    while !rest.is_empty() {
        if let Some(code) = rest.strip_prefix('`')
            && let Some(end) = code.find('`')
        {
            output.push_str(&renderer.paint(&code[..end], "36"));
            rest = &code[end + 1..];
            continue;
        }
        if let Some(bold) = rest.strip_prefix("**")
            && let Some(end) = bold.find("**")
        {
            output.push_str(&renderer.paint(&bold[..end], "1"));
            rest = &bold[end + 2..];
            continue;
        }
        if let Some(label) = rest.strip_prefix('[')
            && let Some(label_end) = label.find("](")
            && let Some(url_end) = label[label_end + 2..].find(')')
        {
            let url_start = label_end + 2;
            let url_end = url_start + url_end;
            output.push_str(&renderer.paint(&label[..label_end], "36;4"));
            output.push_str(" (");
            output.push_str(&label[url_start..url_end]);
            output.push(')');
            rest = &label[url_end + 1..];
            continue;
        }

        let next = rest
            .char_indices()
            .find_map(|(index, character)| matches!(character, '`' | '*' | '[').then_some(index))
            .filter(|index| *index > 0)
            .unwrap_or(rest.len());
        if next == 0 {
            let character = rest.chars().next().expect("non-empty markdown text");
            output.push(character);
            rest = &rest[character.len_utf8()..];
        } else {
            output.push_str(&rest[..next]);
            rest = &rest[next..];
        }
    }
    output
}

fn append_optional_segments(segments: &mut Vec<String>, context: &PromptContext<'_>) {
    if let Some(git) = context.git {
        let dirty = if git.dirty { " *" } else { "" };
        segments.push(format!("git:{}{dirty}", git.branch));
    }
    if let Some(exit_code) = context.last_exit_code
        && exit_code != 0
    {
        segments.push(format!("exit:{exit_code}"));
    }
}

fn display_path(path: &Path) -> String {
    let home = env::var_os(home_variable());
    if let Some(home) = home.map(PathBuf::from)
        && let Ok(relative) = path.strip_prefix(&home)
    {
        return if relative.as_os_str().is_empty() {
            "~".to_owned()
        } else {
            format!("~/{}", relative.display())
        };
    }
    path.display().to_string()
}

fn home_variable() -> &'static str {
    if cfg!(windows) { "USERPROFILE" } else { "HOME" }
}

fn env_flag(name: &str) -> bool {
    env::var(name).is_ok_and(|value| !matches!(value.as_str(), "" | "0" | "false" | "no"))
}

fn git_output(cwd: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::time::Duration;

    use crumb_platform::Platform;

    use super::{
        BrandingMode, COOKIE_SPINNER, GitSegment, MotionMode, OutputMode, PUNCHLINES, PeerActivity,
        PeerActivityState, PromptContext, Renderer, StartupContext, StatusTone, UiSettings,
    };

    #[test]
    fn plain_prompt_is_deterministic() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        let git = GitSegment {
            branch: "main".to_owned(),
            dirty: true,
        };

        let prompt = renderer.prompt(&PromptContext {
            cwd: Path::new("/workspace/crumb"),
            platform: Platform::Linux,
            git: Some(&git),
            last_exit_code: Some(2),
            terminal_width: 80,
        });

        assert_eq!(
            prompt,
            "crumb /workspace/crumb | linux | git:main * | exit:2\n> "
        );
    }

    #[test]
    fn rich_prompt_uses_two_lines_without_color_when_disabled() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Rich,
            motion: MotionMode::Full,
            branding: BrandingMode::Compact,
        });

        let prompt = renderer.prompt(&PromptContext {
            cwd: Path::new("/workspace"),
            platform: Platform::MacOs,
            git: None,
            last_exit_code: Some(0),
            terminal_width: 80,
        });

        assert!(prompt.starts_with("  /workspace\n  ╭"));
        assert!(prompt.ends_with("\n  │ "));
        assert!(!prompt.contains("exit:"));
        let top_border = prompt.lines().nth(1).expect("composer top border");
        let bottom_border = renderer.composer_bottom_border(80);
        assert_eq!(top_border.chars().count(), 78);
        assert_eq!(bottom_border.chars().count(), 78);
        assert!(top_border.ends_with('╮'));
        assert!(bottom_border.ends_with('╯'));
    }

    #[test]
    fn full_branding_contains_the_product_name_shape() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Rich,
            motion: MotionMode::Full,
            branding: BrandingMode::Full,
        });

        let branding = renderer.branding_for_width(120);
        let narrow = renderer.branding_for_width(60);
        let wide = renderer.branding_for_width(180);

        assert!(branding.contains("░█████╗░██████╗░"));
        assert!(
            PUNCHLINES
                .iter()
                .any(|punchline| branding.contains(punchline))
        );
        assert!(narrow.contains("░█████╗░██████╗░"));
        assert!(narrow.contains("╭▄█▄╮"));
        assert!(wide.contains("╭▄█▄╮"));
    }

    #[test]
    fn agent_output_keeps_response_and_metadata_distinct() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        assert_eq!(
            renderer.agent_header("Balanced Crumb", Some("high"), "auto", None),
            "  [ CRUMB ]  pack Balanced Crumb · mode auto · effort high"
        );
        assert_eq!(renderer.agent_response("done\n"), "\n  ╰──▶ done");
        assert_eq!(
            renderer.command_error("connector unavailable"),
            "  [ CRUMB ]  Command failed\n  ╰──▶ connector unavailable"
        );
        assert_eq!(
            renderer.transcript_input("elixpo", "fix this"),
            "  \n  ◆ > fix this\n  "
        );
        assert_eq!(renderer.native_output_prefix(), "  ╰──▶ ");
        let handoff =
            renderer.session_handoff(Duration::from_secs(10), Some("crumb-session-1"), 1_200);
        assert!(handoff.contains("Runtime  10.0s"));
        assert!(handoff.contains("╭───╮   ╭───╮"));
        assert!(handoff.contains("Session  crumb-session-1 · ~1.2k tokens"));
        assert!(handoff.contains("Resume   crumb --resume=crumb-session-1"));
        let lines = handoff.lines().collect::<Vec<_>>();
        assert!(lines[0].starts_with("  ╭───╮"));
        let detail_column = |line: &str, detail: &str| {
            line.split_once(detail)
                .expect("handoff detail")
                .0
                .chars()
                .count()
        };
        let runtime_column = detail_column(lines[2], "Runtime");
        assert_eq!(detail_column(lines[3], "Session"), runtime_column);
        assert_eq!(detail_column(lines[4], "Resume"), runtime_column);
        assert!(runtime_column <= 20);
    }

    #[test]
    fn semantic_status_lines_are_theme_ready_and_accessible() {
        let plain = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        assert_eq!(
            plain.status_line(StatusTone::Success, "Account connected"),
            "  ● Account connected"
        );
        assert_eq!(
            plain.status_line(StatusTone::Warning, "Login required"),
            "  ! Login required"
        );

        let screen_reader = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::ScreenReader,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        assert_eq!(
            screen_reader.status_line(StatusTone::Action, "Open the account page"),
            "Action: Open the account page"
        );
    }

    #[test]
    fn agent_output_renders_terminal_markdown_and_mermaid_preview() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        let response = "# Result\n**Ready** after `cargo test`.\n- checks passed\n```rust\nfn main() {}\n```\n```mermaid\ngraph TD\n  A --> B\n```";
        let output = renderer.agent_response(response);

        assert!(output.contains("╰──▶ Result"));
        assert!(output.contains("Ready after cargo test."));
        assert!(output.contains("• checks passed"));
        assert!(output.contains("┌─ code · rust"));
        assert!(output.contains("│ fn main() {}"));
        assert!(output.contains("┌─ mermaid diagram · preview"));
        assert!(output.contains("│ 〔A〕 ──▶ 〔B〕"));
        assert!(output.contains("├─ source"));
        assert!(output.contains("│ graph TD"));
        assert!(!output.contains("```"));
    }

    #[test]
    fn mermaid_sequence_diagram_gets_a_terminal_preview_and_keeps_source() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        let response = "```mermaid\nsequenceDiagram\n  User->>Crumb: Run tests\n  Crumb-->>User: 618 passed\n```";

        let output = renderer.agent_response(response);

        assert!(output.contains("〔User〕 ── Run tests ──▶ 〔Crumb〕"));
        assert!(output.contains("〔Crumb〕 ── 618 passed ──▶ 〔User〕"));
        assert!(output.contains("│ sequenceDiagram"));
    }

    #[test]
    fn agent_output_wraps_inside_terminal_ui_margins() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        let response = "A deliberately long response line that must remain inside the UI margins.\n- A similarly long list item that also wraps cleanly.\n```text\nlong code output that must remain bounded too\n```";
        let output = renderer.agent_response_for_width(response, 44);

        assert!(output.lines().all(|line| line.chars().count() <= 42));
        assert_eq!(output.matches("• ").count(), 1);
        assert!(output.matches("│ ").count() >= 2);
    }

    #[test]
    fn transcript_card_uses_the_requested_neutral_grey_fill() {
        let renderer = Renderer::new(UiSettings {
            color: true,
            output: OutputMode::Rich,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        assert!(
            renderer
                .transcript_input_at("you", "pwd", None, 80)
                .contains("\x1b[1;48;2;85;85;85m")
        );
    }

    #[test]
    fn transcript_card_wraps_long_submissions_inside_its_width() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        let card = renderer.transcript_input_at(
            "you",
            "Use parallel agents to inspect authentication flow and reconcile findings clearly",
            Some("21:34"),
            44,
        );

        assert!(!card.contains('…'));
        assert!(card.contains("authentication"));
        assert!(card.contains("reconcile findings"));
        assert!(card.lines().all(|line| line.chars().count() <= 42));
    }

    #[test]
    fn closing_avatar_uses_one_muted_grey_color() {
        let renderer = Renderer::new(UiSettings {
            color: true,
            output: OutputMode::Rich,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        let handoff = renderer.session_handoff(Duration::from_secs(1), None, 0);
        assert!(handoff.contains("╭───╮   ╭───╮"));
        assert!(handoff.contains("\x1b[38;2;128;128;128m"));
    }

    #[test]
    fn active_footer_keeps_steering_controls_visible() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        let wide = renderer.composer_active_hotkeys(120);
        assert!(wide.contains("Enter steer"));
        assert!(wide.contains("Ctrl+Enter queue"));
        assert!(wide.contains("PgUp/PgDn scroll"));
        assert!(wide.contains("/pause"));
        assert!(wide.contains("Ctrl+C cancel"));
        let narrow = renderer.composer_active_hotkeys(60);
        assert!(narrow.contains("Enter steer"));
        assert!(narrow.contains("Ctrl+C cancel"));
    }

    #[test]
    fn context_footer_keeps_live_usage_and_compact_model_identity() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        let footer = renderer.context_footer(
            &StartupContext {
                version: "0.1.0",
                platform: Platform::Linux,
                instance_name: Some("Oreo"),
                model: Some("Quick Crumb"),
                mode: "auto",
                effort: Some("high"),
                session_budget_tokens: 64_000,
                context_tokens: 12_800,
                auto_compaction: true,
                agent_configured: true,
            },
            100,
        );

        assert!(footer.contains("Model context"));
        assert!(footer.contains("12.8k / 64.0k"));
        assert!(footer.contains("effort high"));
        assert!(footer.contains("· Oreo ·"));
        assert!(footer.contains("Quick Crumb"));
        assert!(footer.contains("auto"));
        assert!(footer.chars().count() <= 100);
    }

    #[test]
    fn context_footer_always_labels_default_effort() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        let footer = renderer.context_footer(
            &StartupContext {
                version: "0.1.0",
                platform: Platform::Linux,
                instance_name: None,
                model: Some("Quick Crumb"),
                mode: "auto",
                effort: None,
                session_budget_tokens: 64_000,
                context_tokens: 0,
                auto_compaction: false,
                agent_configured: true,
            },
            100,
        );

        assert!(footer.contains("effort default"));
        let narrow = renderer.context_footer(
            &StartupContext {
                version: "0.1.0",
                platform: Platform::Linux,
                instance_name: None,
                model: Some("Quick Crumb"),
                mode: "auto",
                effort: Some("extra high"),
                session_budget_tokens: 64_000,
                context_tokens: 0,
                auto_compaction: false,
                agent_configured: true,
            },
            38,
        );
        assert!(narrow.contains("effort extra high"));
    }

    #[test]
    fn agent_events_distinguish_tool_results_and_user_owned_approval() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Rich,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        assert_eq!(
            renderer.agent_tool_result("web_fetch", true),
            "  [ CRUMB ]  Tool completed · web_fetch"
        );
        assert_eq!(
            renderer.agent_tool_result("write_file", false),
            "  [ CRUMB ]  Tool failed · write_file"
        );
        assert_eq!(
            renderer.agent_tool_output_for_width("folder-a\nfolder-b", 80),
            "  │    tool output\n  │    folder-a\n  │    folder-b"
        );
        assert_eq!(
            renderer.agent_tool_output_toggle(false, 2, 17),
            "  │    ▶ Tool output · 2 lines · 17 B"
        );
        assert_eq!(
            renderer.agent_tool_output_toggle(true, 2, 17),
            "  │    ▼ Tool output · 2 lines · 17 B"
        );
        assert_eq!(
            renderer.agent_approval_required("write_file"),
            "  [ CRUMB ]  Approval required\n  ╰──▶ write_file · user permission required"
        );
        assert_eq!(
            renderer.agent_approval_prompt(
                "write_file",
                "workspace write",
                "0123456789abcdef",
                None
            ),
            "  [ CRUMB ]  Allow this tool once?\n  ╰──▶ write_file\n     risk workspace write · request 0123456789ab\n     Enter/y once · a always allow tool · s sensitive · f full access · n/Esc deny"
        );
        assert_eq!(
            renderer.agent_approval_prompt(
                "run_shell",
                "process execution",
                "0123456789abcdef",
                Some("$ cargo test --workspace")
            ),
            "  [ CRUMB ]  Allow this tool once?\n  ╰──▶ run_shell\n     $ cargo test --workspace\n     risk process execution · request 0123456789ab\n     Enter/y once · a always allow tool · s sensitive · f full access · n/Esc deny"
        );
        assert_eq!(
            renderer.agent_tool_result("spawn_agents", true),
            "  [ CRUMB ]  Agent team reported · parallel findings returned to the parent Harness"
        );
        assert_eq!(
            renderer.agent_approval_required("spawn_agents"),
            "  [ CRUMB ]  Allow a parallel agent team?\n  ╰──▶ Koi · Nyx · Rune · Echo · user permission required"
        );
        assert_eq!(
            renderer.peer_approval_prompt("send_peer_message", "0123456789abcdef", Some("Miso")),
            "  [ CRUMB ]  Allow this peer exchange once?\n  ╰──▶ send_peer_message\n     peer Miso\n     risk peer communication · request 0123456789ab\n     Enter/y once · n/Esc deny"
        );
    }

    #[test]
    fn successful_tool_status_uses_subdued_grey() {
        let renderer = Renderer::new(UiSettings {
            color: true,
            output: OutputMode::Rich,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        let searching = renderer.agent_activity("Searching web · weather Kolkata tomorrow");
        let completed = renderer.agent_tool_result("web_search", true);

        assert!(searching.contains("\x1b[38;5;245mSearching web"));
        assert!(completed.contains("\x1b[38;5;245mTool completed"));
        assert!(!completed.contains("\x1b[32;1m"));
    }

    #[test]
    fn file_change_counts_use_semantic_diff_colors() {
        let renderer = Renderer::new(UiSettings {
            color: true,
            output: OutputMode::Rich,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        let activity = renderer.agent_file_change("src/main.rs", 7, 2);
        assert!(activity.contains("\x1b[32m+7\x1b[0m"));
        assert!(activity.contains("\x1b[31m-2\x1b[0m"));

        let summary = renderer.agent_change_summary(&[("src/main.rs", 7, 2)]);
        assert!(summary.contains("\x1b[32m+7\x1b[0m"));
        assert!(summary.contains("\x1b[31m-2\x1b[0m"));
    }

    #[test]
    fn peer_activity_is_subdued_and_excludes_internal_content() {
        let renderer = Renderer::new(UiSettings {
            color: true,
            output: OutputMode::Rich,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        let output = renderer.peer_activity(&PeerActivity {
            local_name: "Oreo",
            remote_name: "Miso",
            state: PeerActivityState::Exchanging,
            elapsed: Duration::from_millis(1_250),
            artifact_count: 2,
        });

        assert!(output.contains("Oreo ↔ Miso"));
        assert!(output.contains("sharing context · 1.2s · 2 artifacts"));
        assert!(output.contains("\x1b[38;5;245m"));
        assert!(!output.contains("message"));
        assert!(!output.contains("tool output"));
    }

    #[test]
    fn peer_inspection_is_plain_bounded_and_strips_terminal_controls() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        let hostile = format!(
            "**not markdown**\n\x1b[31mred\x1b[0m\n\u{9d}hidden\u{9c}shown\nleft\u{202e}right\n{}",
            "x".repeat(10_000)
        );
        let output = renderer.peer_untrusted_text_for_width(&hostile, 80);

        assert!(output.contains("**not markdown**"));
        assert!(output.contains("red"));
        assert!(output.contains("shown"));
        assert!(!output.contains("hidden"));
        assert!(output.contains("leftright"));
        assert!(!output.contains('\x1b'));
        assert!(!output.contains('\u{202e}'));
        assert!(output.lines().count() <= 81);
        assert!(!output.contains("10_000"));
    }

    #[test]
    fn screen_reader_peer_activity_has_a_semantic_label() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::ScreenReader,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });
        let output = renderer.peer_activity(&PeerActivity {
            local_name: "Oreo",
            remote_name: "Miso",
            state: PeerActivityState::Waiting,
            elapsed: Duration::from_secs(3),
            artifact_count: 0,
        });

        assert_eq!(output, "Agent exchange: Oreo ↔ Miso · waiting · 3.0s");
    }

    #[test]
    fn screen_reader_agent_events_avoid_decorative_components() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::ScreenReader,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        assert_eq!(
            renderer.agent_tool_result("web_fetch", true),
            "Tool web_fetch completed"
        );
        assert_eq!(
            renderer.agent_approval_required("write_file"),
            "Approval required for tool write_file"
        );
        assert_eq!(
            renderer.agent_approval_prompt(
                "write_file",
                "workspace write",
                "0123456789abcdef",
                None
            ),
            "Approval required for write_file, risk workspace write, request 0123456789ab. Enter or y allows once; a always allows this tool; s selects sensitive-only mode; f selects full access; n or escape denies."
        );
        assert_eq!(
            renderer.peer_approval_prompt("share_peer_file", "fedcba9876543210", Some("Oreo")),
            "Peer communication approval required for share_peer_file, request fedcba987654. Enter or y allows this exchange once; n or escape denies. Selected peer: Oreo."
        );
    }

    #[test]
    fn reduced_motion_never_starts_an_activity_animation_thread() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Rich,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        let indicator = renderer.activity("Thinking");
        assert!(!indicator.visible);
        assert!(indicator.thread.is_none());
    }

    #[test]
    fn startup_status_contains_only_non_secret_readiness_metadata() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Plain,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Compact,
        });
        let status = renderer.startup_status(&StartupContext {
            version: "0.1.0",
            platform: Platform::Linux,
            instance_name: Some("Oreo"),
            model: Some("Balanced Crumb"),
            mode: "auto",
            effort: Some("medium"),
            session_budget_tokens: 64_000,
            context_tokens: 0,
            auto_compaction: true,
            agent_configured: true,
        });

        assert_eq!(
            status,
            " SESSION   crumb 0.1.0 · linux\n●  agent ready · instance Oreo · pack Balanced Crumb · auto"
        );
        let welcome = renderer.welcome(
            &StartupContext {
                version: "0.1.0",
                platform: Platform::Linux,
                instance_name: Some("Oreo"),
                model: Some("Balanced Crumb"),
                mode: "auto",
                effort: Some("medium"),
                session_budget_tokens: 64_000,
                context_tokens: 0,
                auto_compaction: true,
                agent_configured: true,
            },
            120,
        );
        assert!(welcome.contains("Crumb CLI v0.1.0 · Native commands stay native."));
        assert!(welcome.contains("Ready · Oreo · pack Balanced Crumb · auto"));
        assert!(!welcome.contains("Model context"));
        assert!(!welcome.contains("compact"));
        assert!(welcome.contains("╭▄█▄╮"));

        let disconnected = renderer.startup_status(&StartupContext {
            version: "1.0.2",
            platform: Platform::Linux,
            instance_name: Some("Oreo"),
            model: Some("Balanced Crumb"),
            mode: "auto",
            effort: Some("medium"),
            session_budget_tokens: 256_000,
            context_tokens: 0,
            auto_compaction: true,
            agent_configured: false,
        });
        assert!(disconnected.contains("AI disconnected"));
        assert!(disconnected.contains("run /auth login to connect"));
    }

    #[test]
    fn welcome_layout_stays_inside_narrow_standard_and_wide_viewports() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Rich,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Full,
        });
        let context = StartupContext {
            version: "0.1.0",
            platform: Platform::Linux,
            instance_name: Some("Oreo"),
            model: Some("Deep Crumb"),
            mode: "auto",
            effort: Some("extra high"),
            session_budget_tokens: 64_000,
            context_tokens: 48_000,
            auto_compaction: true,
            agent_configured: true,
        };

        for width in [40_u16, 60, 80, 96, 120] {
            let welcome = renderer.welcome(&context, width);
            assert!(
                welcome
                    .lines()
                    .all(|line| line.chars().count() <= usize::from(width)),
                "welcome exceeded {width} columns:\n{welcome}"
            );
        }
        assert!(renderer.welcome(&context, 40).contains("CRUMB"));
        assert!(renderer.welcome(&context, 60).contains("░█████╗░██████╗░"));
    }

    #[test]
    fn folder_trust_keeps_the_workspace_and_selection_visible() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::Rich,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Full,
        });
        let dialog = renderer.folder_trust(Path::new("/workspace/crumb"), true, 80);

        assert!(dialog.contains("Confirm folder trust"));
        assert!(dialog.contains("/workspace/crumb"));
        assert!(dialog.contains("› 1. Yes"));
        assert!(dialog.contains("2. No (Esc)"));
    }

    #[test]
    fn hidden_reasoning_is_not_rendered() {
        assert_eq!(
            super::visible_agent_text("<thinking>private chain</thinking>\nanswer"),
            "answer"
        );
        assert_eq!(
            super::visible_agent_text("answer<think>unfinished"),
            "answer"
        );
        assert_eq!(
            super::visible_agent_text("<response>\nexact answer\n</response>"),
            "exact answer"
        );
        assert_eq!(
            super::visible_agent_text(
                "<TASK>Processing</TASK><TASK>Analyzing image</TASK>\nImage result"
            ),
            "Image result"
        );
    }

    #[test]
    fn cookie_spinner_is_compact_ascii_art() {
        assert!(COOKIE_SPINNER.iter().all(|frame| frame.is_ascii()));
        assert!(COOKIE_SPINNER.iter().all(|frame| frame.len() == 4));
        assert!(COOKIE_SPINNER.iter().all(|frame| frame.starts_with('(')));
        assert!(COOKIE_SPINNER.iter().all(|frame| frame.ends_with(')')));
    }

    #[test]
    fn screen_reader_output_avoids_decorative_symbols() {
        let renderer = Renderer::new(UiSettings {
            color: false,
            output: OutputMode::ScreenReader,
            motion: MotionMode::Reduced,
            branding: BrandingMode::Disabled,
        });

        assert_eq!(
            renderer.agent_header("Deep Crumb", None, "plan", None),
            "Crumb agent\npack Deep Crumb, mode plan"
        );
        assert_eq!(
            renderer.agent_error("stopped", true),
            "Agent cancelled: stopped"
        );
        assert_eq!(renderer.branding(), "");
    }
}
