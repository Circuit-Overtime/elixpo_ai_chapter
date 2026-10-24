use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use crumb_agent::{AgentConfig, AgentMode, LiveConfig, Modality};
use reedline::{Completer, CompletionResult, Span, Suggestion};

pub const COMPLETION_PALETTE_ROWS: u16 = 9;

#[derive(Clone, Debug)]
pub struct CompletionWorkspace(Arc<RwLock<PathBuf>>);

impl CompletionWorkspace {
    pub fn new(workspace: PathBuf) -> Self {
        Self(Arc::new(RwLock::new(workspace)))
    }

    pub fn set(&self, workspace: &Path) {
        if let Ok(mut active) = self.0.write() {
            workspace.clone_into(&mut active);
        }
    }

    fn get(&self) -> PathBuf {
        self.0
            .read()
            .map_or_else(|_| PathBuf::from("."), |active| active.clone())
    }
}

pub struct CrumbCompleter {
    workspace: CompletionWorkspace,
}

impl CrumbCompleter {
    pub const fn new(workspace: CompletionWorkspace) -> Self {
        Self { workspace }
    }
}

impl Completer for CrumbCompleter {
    fn complete(&mut self, line: &str, pos: usize) -> CompletionResult {
        let Some(prefix) = line.get(..pos) else {
            return CompletionResult::fresh(Vec::new());
        };
        let (_, token) = current_token(prefix);
        let suggestions = if prefix.starts_with('/') && !prefix.contains('\n') {
            slash_suggestions(prefix, pos, &self.workspace.get())
        } else if token.starts_with('@') {
            reference_suggestions(prefix, pos, &self.workspace.get())
        } else if token.starts_with('?') {
            help_suggestions(prefix, pos, &self.workspace.get())
        } else {
            native_path_suggestions(prefix, pos, &self.workspace.get())
        };
        CompletionResult::fresh(suggestions)
    }
}

fn help_suggestions(line: &str, pos: usize, workspace: &Path) -> Vec<Suggestion> {
    let (start, token) = current_token(line);
    if !token.starts_with('?') {
        return Vec::new();
    }
    let query = token.trim_start_matches('?');
    let mut settings = vec![
        (
            "? help".to_owned(),
            "/help".to_owned(),
            "help, keyboard shortcuts, and command guidance".to_owned(),
        ),
        (
            "? session info".to_owned(),
            "? config".to_owned(),
            "active model, effort, context, tokens, and session".to_owned(),
        ),
    ];
    settings.extend(
        crumb_repl::SLASH_COMMANDS
            .iter()
            .filter(|command| is_setting_command(command.usage))
            .map(|command| {
                (
                    format!("? {}", command.usage.trim_start_matches('/')),
                    command.usage.to_owned(),
                    command.description.to_owned(),
                )
            }),
    );
    settings.extend(configured_runtime_actions(workspace));
    settings.extend(configured_skill_actions(workspace).into_iter().map(
        |(command, description)| {
            (
                format!("? {}", command.trim_start_matches('/')),
                command,
                description,
            )
        },
    ));
    settings
        .into_iter()
        .filter(|(display, _, _)| {
            query.is_empty()
                || display
                    .strip_prefix("? ")
                    .is_some_and(|label| label.starts_with(query))
        })
        .map(|(display, value, description)| {
            routed_suggestion(&display, &value, &description, Span::new(start, pos))
        })
        .collect()
}

fn configured_runtime_actions(workspace: &Path) -> Vec<(String, String, String)> {
    let Some(path) = config_path(workspace) else {
        return Vec::new();
    };
    let Ok(config) = LiveConfig::new(path).load() else {
        return Vec::new();
    };
    let mut actions = mode_actions(config.mode);
    actions.extend(model_actions(&config));
    actions.extend(effort_actions(&config));
    actions
}

fn mode_actions(selected: AgentMode) -> Vec<(String, String, String)> {
    [
        ("auto", AgentMode::Auto, "execute approved read-only tools"),
        (
            "negotiate",
            AgentMode::Negotiate,
            "request approval before tool execution",
        ),
        ("plan", AgentMode::Plan, "reason without executing tools"),
    ]
    .into_iter()
    .map(|(name, mode, description)| {
        (
            format!("? mode {name}"),
            format!("/mode use {name}"),
            selection_description(description, mode == selected),
        )
    })
    .collect()
}

fn model_actions(config: &AgentConfig) -> Vec<(String, String, String)> {
    let selected = config
        .models
        .get(&Modality::Text)
        .and_then(|routes| routes.first());
    config
        .providers
        .iter()
        .flat_map(|(provider_id, provider)| {
            provider.models.iter().map(move |model| {
                let selection = format!("{provider_id}/{}", model.id);
                let is_selected = selected
                    .is_some_and(|route| route.provider == *provider_id && route.model == model.id);
                let description = model
                    .display_name
                    .as_deref()
                    .unwrap_or(provider.display_name.as_str());
                (
                    format!("? model {selection}"),
                    format!("/model use {selection}"),
                    selection_description(description, is_selected),
                )
            })
        })
        .collect()
}

fn effort_actions(config: &AgentConfig) -> Vec<(String, String, String)> {
    let Some(route) = config
        .models
        .get(&Modality::Text)
        .and_then(|routes| routes.first())
    else {
        return Vec::new();
    };
    let selected = config.reasoning_effort_for(route);
    let mut efforts = vec![("default".to_owned(), None)];
    if let Some(model) = config
        .providers
        .get(&route.provider)
        .and_then(|provider| provider.models.iter().find(|model| model.id == route.model))
    {
        efforts.extend(model.reasoning_efforts.keys().map(|effort| {
            (
                effort_display_name(effort).to_owned(),
                Some(effort.as_str()),
            )
        }));
    }
    efforts
        .into_iter()
        .map(|(display, wire)| {
            let is_selected = wire == selected;
            (
                format!("? effort {display}"),
                format!("/effort use {display}"),
                selection_description("reasoning effort", is_selected),
            )
        })
        .collect()
}

fn selection_description(description: &str, selected: bool) -> String {
    if selected {
        format!("selected · {description}")
    } else {
        description.to_owned()
    }
}

fn effort_display_name(effort: &str) -> &str {
    match effort {
        "low" => "light",
        "xhigh" => "extra high",
        "max" => "ultra",
        value => value,
    }
}

fn current_token(line: &str) -> (usize, &str) {
    let start = line
        .char_indices()
        .rev()
        .find_map(|(index, character)| character.is_whitespace().then_some(index + 1))
        .unwrap_or(0);
    (start, &line[start..])
}

fn slash_suggestions(prefix: &str, pos: usize, workspace: &Path) -> Vec<Suggestion> {
    let mut commands = crumb_repl::SLASH_COMMANDS
        .iter()
        .filter(|command| {
            !is_setting_command(command.usage)
                || command.usage.starts_with("/auth")
                || command.usage.starts_with("/permissions")
                || command.usage == "/skill"
                || command.usage.starts_with("/skill ")
        })
        .map(|command| (command.usage.to_owned(), command.description.to_owned()))
        .collect::<Vec<_>>();
    commands.push((
        "/skills add".to_owned(),
        "register a local SKILL.md file; starts disabled".to_owned(),
    ));
    commands.extend(configured_pack_actions(workspace));
    commands.extend(configured_skill_actions(workspace));
    commands
        .into_iter()
        .filter(|(usage, _)| usage.starts_with(prefix))
        .map(|(usage, description)| suggestion(&usage, &description, Span::new(0, pos)))
        .collect()
}

fn configured_pack_actions(workspace: &Path) -> Vec<(String, String)> {
    let config = config_path(workspace)
        .and_then(|path| LiveConfig::new(path).load().ok())
        .unwrap_or_default();
    let mut packs = config
        .model_packs
        .iter()
        .map(|(id, pack)| {
            (
                id.clone(),
                (
                    pack.label.clone(),
                    config.active_model_pack.as_deref() == Some(id),
                ),
            )
        })
        .collect::<std::collections::BTreeMap<_, _>>();
    for (id, label) in [
        ("quick", "Quick Crumb"),
        ("balanced", "Balanced Crumb"),
        ("deep", "Deep Crumb"),
    ] {
        packs.entry(id.to_owned()).or_insert_with(|| {
            (
                label.to_owned(),
                config.active_model_pack.as_deref() == Some(id),
            )
        });
    }
    packs
        .into_iter()
        .map(|(id, (label, selected))| {
            (
                format!("/pack use {id}"),
                selection_description(&label, selected),
            )
        })
        .collect()
}

fn is_setting_command(usage: &str) -> bool {
    [
        "/auth",
        "/connectors",
        "/skill",
        "/skills",
        "/context",
        "/mode",
        "/model",
        "/effort",
        "/session",
        "/plugins",
        "/tools",
        "/permissions",
        "/memory",
        "/profile",
        "/config",
        "/doctor",
        "/cost",
        "/platform",
        "/version",
    ]
    .iter()
    .any(|prefix| usage == *prefix || usage.starts_with(&format!("{prefix} ")))
}

fn configured_skill_actions(workspace: &Path) -> Vec<(String, String)> {
    let config = config_path(workspace)
        .and_then(|path| LiveConfig::new(path).load().ok())
        .unwrap_or_default();
    let configured_ids = config
        .skills
        .iter()
        .map(|skill| skill.id.clone())
        .collect::<std::collections::BTreeSet<_>>();
    let mut actions = config
        .skills
        .into_iter()
        .flat_map(|skill| {
            let mut actions = vec![if skill.enabled {
                (
                    format!("/skill disable {}", skill.id),
                    "disable in agent context".to_owned(),
                )
            } else {
                (
                    format!("/skill enable {}", skill.id),
                    "enable in agent context".to_owned(),
                )
            }];
            if !skill.enabled {
                actions.push((
                    format!("/skills remove {}", skill.id),
                    "remove registration without deleting its source".to_owned(),
                ));
            }
            actions
        })
        .collect::<Vec<_>>();
    actions.extend(
        crate::bundled_skills::ALL
            .iter()
            .filter(|skill| !configured_ids.contains(skill.id))
            .map(|skill| {
                (
                    format!("/skill enable {}", skill.id),
                    format!("enable bundled skill · {}", skill.description),
                )
            }),
    );
    actions
}

fn reference_suggestions(line: &str, pos: usize, workspace: &Path) -> Vec<Suggestion> {
    let (start, token) = current_token(line);
    if !token.starts_with('@') {
        return Vec::new();
    }
    let span = Span::new(start, pos);
    if let Some(path) = token.strip_prefix("@file:") {
        return path_suggestions(workspace, path, false, span);
    }
    if let Some(path) = token.strip_prefix("@folder:") {
        return path_suggestions(workspace, path, true, span);
    }
    path_suggestions(workspace, token.trim_start_matches('@'), false, span)
        .into_iter()
        .chain(path_suggestions(
            workspace,
            token.trim_start_matches('@'),
            true,
            span,
        ))
        .collect()
}

fn native_path_suggestions(line: &str, pos: usize, workspace: &Path) -> Vec<Suggestion> {
    if line.trim_start().starts_with([':', '?']) {
        return Vec::new();
    }
    let (start, token) = current_token(line);
    if start == 0
        || token.is_empty()
        || token.starts_with('-')
        || token.contains('=')
        || token.contains('\n')
    {
        return Vec::new();
    }
    let typed_path = Path::new(token);
    let parent = typed_path.parent().unwrap_or_else(|| Path::new(""));
    let fragment = typed_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let directory = if token.starts_with("~/") {
        let Some(home) = std::env::var_os("HOME") else {
            return Vec::new();
        };
        PathBuf::from(home).join(parent.strip_prefix("~").unwrap_or(parent))
    } else {
        workspace.join(parent)
    };
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    let show_hidden = fragment.starts_with('.');
    let mut suggestions = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            if !name.starts_with(fragment) || (!show_hidden && name.starts_with('.')) {
                return None;
            }
            let is_directory = entry.file_type().ok()?.is_dir();
            let mut value = parent.join(name).display().to_string();
            if is_directory {
                value.push('/');
            }
            Some(Suggestion {
                display_override: Some(palette_row(
                    &value,
                    if is_directory { "folder" } else { "file" },
                )),
                span: Span::new(start, pos),
                append_whitespace: !is_directory,
                value,
                ..Suggestion::default()
            })
        })
        .take(100)
        .collect::<Vec<_>>();
    suggestions.sort_by(|left, right| left.value.cmp(&right.value));
    suggestions
}

fn config_path(workspace: &Path) -> Option<PathBuf> {
    workspace.ancestors().find_map(|directory| {
        let candidate = directory.join(".crumb/agent.json");
        candidate.is_file().then_some(candidate)
    })
}

fn path_suggestions(
    workspace: &Path,
    typed: &str,
    directories_only: bool,
    span: Span,
) -> Vec<Suggestion> {
    let typed_path = Path::new(typed);
    let parent = typed_path.parent().unwrap_or_else(|| Path::new(""));
    let fragment = typed_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let directory = workspace.join(parent);
    let Ok(canonical_workspace) = std::fs::canonicalize(workspace) else {
        return Vec::new();
    };
    let Ok(canonical_directory) = std::fs::canonicalize(&directory) else {
        return Vec::new();
    };
    if !canonical_directory.starts_with(&canonical_workspace) {
        return Vec::new();
    }
    let Ok(entries) = std::fs::read_dir(canonical_directory) else {
        return Vec::new();
    };
    let marker = if directories_only {
        "@folder:"
    } else {
        "@file:"
    };
    let mut suggestions = entries
        .flatten()
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if (directories_only && !file_type.is_dir())
                || (!directories_only && !file_type.is_file())
            {
                return None;
            }
            let name = entry.file_name().into_string().ok()?;
            if !name.starts_with(fragment) {
                return None;
            }
            let path = parent.join(name);
            Some(suggestion(
                &format!("{marker}{}", path.display()),
                if directories_only { "folder" } else { "file" },
                span,
            ))
        })
        .take(100)
        .collect::<Vec<_>>();
    suggestions.sort_by(|left, right| left.value.cmp(&right.value));
    suggestions
}

fn suggestion(value: &str, description: &str, span: Span) -> Suggestion {
    Suggestion {
        value: value.to_owned(),
        display_override: Some(palette_row(value, description)),
        span,
        append_whitespace: !value.ends_with([':', ' ']),
        ..Suggestion::default()
    }
}

fn routed_suggestion(display: &str, value: &str, description: &str, span: Span) -> Suggestion {
    Suggestion {
        value: value.to_owned(),
        display_override: Some(palette_row(display, description)),
        span,
        append_whitespace: false,
        ..Suggestion::default()
    }
}

fn palette_row(value: &str, description: &str) -> String {
    let width = crossterm::terminal::size()
        .map_or(80, |(columns, _)| usize::from(columns))
        .saturating_sub(8)
        .max(24);
    let label_width = width.saturating_mul(2).saturating_div(5).clamp(18, 44);
    let value = value
        .chars()
        .take(label_width.saturating_sub(2))
        .collect::<String>();
    let mut row = format!("{value:<label_width$}{description}");
    row.truncate(row.floor_char_boundary(width.min(row.len())));
    row
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use reedline::Completer;

    use super::{CompletionWorkspace, CrumbCompleter};

    #[test]
    fn short_palettes_list_each_suggestion_once() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));
        let result = completer.complete("/help", 5);
        let values = result
            .suggestions()
            .iter()
            .map(|candidate| candidate.value.as_str())
            .collect::<Vec<_>>();

        assert!(values.contains(&"/help"));
        let unique = values.iter().collect::<std::collections::HashSet<_>>();
        assert_eq!(
            unique.len(),
            values.len(),
            "duplicate suggestions: {values:?}"
        );
    }

    #[test]
    fn slash_completion_includes_help() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));
        let result = completer.complete("/he", 3);
        assert!(
            result
                .suggestions()
                .iter()
                .any(|candidate| candidate.value == "/help")
        );
    }

    #[test]
    fn slash_completion_includes_auth_actions() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));
        let result = completer.complete("/auth", 5);

        for command in ["/auth login", "/auth status", "/auth logout"] {
            assert!(
                result
                    .suggestions()
                    .iter()
                    .any(|candidate| candidate.value == command),
                "missing auth suggestion for {command}"
            );
        }
    }

    #[test]
    fn slash_completion_refilters_after_pack_prefix_is_shortened() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));

        let result = completer.complete("/pac", 4);

        assert!(
            result
                .suggestions()
                .iter()
                .any(|candidate| candidate.value == "/pack")
        );
        assert!(
            result
                .suggestions()
                .iter()
                .any(|candidate| candidate.value == "/pack use ")
        );
    }

    #[test]
    fn pack_completion_exposes_nested_commands_and_pack_ids() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));

        let root = completer.complete("/pack", 5);
        assert!(
            root.suggestions()
                .iter()
                .any(|candidate| candidate.value == "/pack use ")
        );

        let nested = completer.complete("/pack use ", 10);
        for id in ["quick", "balanced", "deep"] {
            assert!(
                nested
                    .suggestions()
                    .iter()
                    .any(|candidate| candidate.value == format!("/pack use {id}")),
                "missing nested pack suggestion for {id}"
            );
        }
    }

    #[test]
    fn peer_completion_exposes_inbox_and_nested_file_actions() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));

        let nested = completer.complete("/peer ", 6);

        for command in [
            "/peer status",
            "/peer inbox",
            "/peer tasks",
            "/peer task ",
            "/peer inspect ",
            "/peer file",
            "/peer file fetch ",
            "/peer file import ",
            "/peer file discard ",
        ] {
            assert!(
                nested
                    .suggestions()
                    .iter()
                    .any(|candidate| candidate.value == command),
                "missing nested peer suggestion for {command}"
            );
        }

        let files = completer.complete("/peer file ", 11);
        for command in [
            "/peer file fetch ",
            "/peer file import ",
            "/peer file discard ",
        ] {
            assert!(
                files
                    .suggestions()
                    .iter()
                    .any(|candidate| candidate.value == command),
                "missing nested peer file suggestion for {command}"
            );
        }

        let backspaced = completer.complete("/peer file im", 13);
        assert!(
            backspaced
                .suggestions()
                .iter()
                .any(|candidate| candidate.value == "/peer file import ")
        );
    }

    #[test]
    fn skill_completion_exposes_protocol_operations_after_backspacing() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));

        let partial = completer.complete("/skil", 5);
        assert!(
            partial
                .suggestions()
                .iter()
                .any(|candidate| candidate.value == "/skill")
        );

        let nested = completer.complete("/skill ", 7);
        for action in [
            "search ",
            "inspect ",
            "install ",
            "run ",
            "enable ",
            "disable ",
            "update ",
            "rollback ",
            "remove ",
            "doctor",
        ] {
            assert!(
                nested
                    .suggestions()
                    .iter()
                    .any(|candidate| candidate.value == format!("/skill {action}")),
                "missing nested skill suggestion for {action}"
            );
        }
    }

    #[test]
    fn permissions_completion_exposes_root_and_nested_actions() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));

        let root = completer.complete("/per", 4);
        assert!(
            root.suggestions()
                .iter()
                .any(|candidate| candidate.value == "/permissions")
        );

        let nested = completer.complete("/permissions ", 13);
        for action in [
            "always-ask",
            "sensitive",
            "full-access",
            "allow-all",
            "allow-network ",
            "deny-network ",
            "allow-workspace ",
            "deny-workspace ",
            "allow-execution ",
            "deny-execution ",
        ] {
            assert!(
                nested
                    .suggestions()
                    .iter()
                    .any(|candidate| candidate.value == format!("/permissions {action}")),
                "missing nested permission suggestion for {action}"
            );
        }
    }

    #[test]
    fn settings_palette_includes_offline_bundled_skills_without_a_config() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is valid")
            .as_nanos();
        let workspace = std::env::temp_dir().join(format!("crumb-bundled-menu-{suffix}"));
        std::fs::create_dir_all(&workspace).expect("workspace is created");
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(workspace.clone()));

        let result = completer.complete("?", 1);

        assert!(
            result
                .suggestions()
                .iter()
                .any(|candidate| { candidate.value == "/skill enable failure-autopsy" })
        );
        std::fs::remove_dir_all(workspace).expect("workspace removed");
    }

    #[test]
    fn settings_palette_exposes_the_available_skill_action() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is valid")
            .as_nanos();
        let workspace = std::env::temp_dir().join(format!("crumb-skill-menu-{suffix}"));
        std::fs::create_dir_all(workspace.join(".crumb")).expect("config directory can be created");
        std::fs::write(
            workspace.join(".crumb/agent.json"),
            br#"{"skills":[{"id":"review","path":"skills/review","enabled":false}]}"#,
        )
        .expect("skill config can be written");
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(workspace.clone()));

        let result = completer.complete("?", 1);

        let skill = result
            .suggestions()
            .iter()
            .find(|candidate| candidate.value == "/skill enable review")
            .expect("disabled skill exposes a load action");
        assert!(
            skill
                .display_override
                .as_deref()
                .is_some_and(|display| display.starts_with("? skill enable review"))
        );
        std::fs::remove_dir_all(workspace).expect("temporary workspace can be removed");
    }

    #[test]
    fn settings_palette_exposes_live_mode_model_and_effort_choices() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is valid")
            .as_nanos();
        let workspace = std::env::temp_dir().join(format!("crumb-runtime-menu-{suffix}"));
        std::fs::create_dir_all(workspace.join(".crumb")).expect("config directory can be created");
        std::fs::write(
            workspace.join(".crumb/agent.json"),
            br#"{
              "mode":"auto",
              "providers":{
                "fixture":{
                  "display_name":"Fixture Gateway",
                  "protocol":"open_ai_responses",
                  "base_url":"https://example.com/v1",
                  "models":[{
                    "id":"coding-model",
                    "display_name":"Coding Model",
                    "input":["text"],
                    "reasoning_efforts":{"low":"low","high":"high"}
                  }]
                }
              },
              "models":{
                "text":[{"provider":"fixture","model":"coding-model","effort":"high"}]
              }
            }"#,
        )
        .expect("agent config can be written");
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(workspace.clone()));

        let settings = completer.complete("?", 1);
        assert!(
            settings
                .suggestions()
                .iter()
                .any(|candidate| candidate.value == "/mode use plan")
        );
        let model = settings
            .suggestions()
            .iter()
            .find(|candidate| candidate.value == "/model use fixture/coding-model")
            .expect("configured model is selectable");
        assert!(
            model
                .display_override
                .as_deref()
                .is_some_and(|display| display.contains("selected · Coding Model"))
        );
        assert!(
            settings
                .suggestions()
                .iter()
                .any(|candidate| candidate.value == "/effort use light")
        );
        assert!(
            settings
                .suggestions()
                .iter()
                .any(|candidate| candidate.value == "/effort use high")
        );
        assert!(
            settings
                .suggestions()
                .iter()
                .all(|candidate| candidate.value != "/effort use ultra")
        );
        let filtered = completer.complete("?mod", 4);
        assert!(
            filtered
                .suggestions()
                .iter()
                .any(|candidate| candidate.value == "/model use fixture/coding-model")
        );
        std::fs::remove_dir_all(workspace).expect("temporary workspace can be removed");
    }

    #[test]
    fn file_references_complete_inside_plain_language() {
        let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(workspace));
        let result = completer.complete("explain @Car", 12);
        assert_eq!(result.suggestions()[0].value, "@file:Cargo.lock");
        assert_eq!(result.suggestions()[0].span.start, 8);
    }

    #[test]
    fn question_mark_opens_the_help_completion() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));
        let result = completer.complete("?", 1);

        assert_eq!(result.suggestions()[0].value, "/help");
        assert!(
            result.suggestions()[0]
                .display_override
                .as_deref()
                .is_some_and(|display| display.contains("keyboard shortcuts"))
        );
        assert!(
            result
                .suggestions()
                .iter()
                .any(|suggestion| suggestion.value == "? config")
        );
        assert!(
            result
                .suggestions()
                .iter()
                .any(|suggestion| suggestion.value == "/plugins")
        );
    }

    #[test]
    fn slash_palette_excludes_settings() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));
        let result = completer.complete("/", 1);

        assert!(
            result
                .suggestions()
                .iter()
                .all(|suggestion| suggestion.value != "/config")
        );
    }

    #[test]
    fn native_arguments_complete_relative_directories() {
        let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(workspace));
        let result = completer.complete("cd do", 5);

        assert!(
            result
                .suggestions()
                .iter()
                .any(|candidate| candidate.value == "docs/")
        );
    }

    #[test]
    fn forced_agent_text_does_not_offer_native_paths() {
        let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(workspace));
        let line = ": what's todays ";
        let result = completer.complete(line, line.len());

        assert_eq!(result.suggestions(), []);
    }

    #[test]
    fn help_queries_do_not_fall_through_to_native_paths() {
        let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(workspace));
        for line in ["? when ", "? when w"] {
            let result = completer.complete(line, line.len());
            assert_eq!(
                result.suggestions(),
                [],
                "unexpected suggestions for {line}"
            );
        }
    }

    #[test]
    fn trailing_space_does_not_list_the_workspace() {
        let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(workspace));
        let line = "say something ";
        let result = completer.complete(line, line.len());

        assert_eq!(result.suggestions(), []);
    }

    #[test]
    fn empty_completion_renders_no_menu_rows() {
        let mut completer = CrumbCompleter::new(CompletionWorkspace::new(PathBuf::from(".")));
        let line = "cd this-path-does-not-exist";
        let result = completer.complete(line, line.len());
        assert_eq!(result.suggestions(), []);
    }
}
