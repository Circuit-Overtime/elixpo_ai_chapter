//! Sessions across folders: a small index of workspaces that have agent
//! sessions, the grouped `/sessions all` view, and the `/sessions` picker.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use crumb_agent::{SessionSummary, list_sessions, set_session_archived, set_session_label};
use crumb_ui::Renderer;
use directories::BaseDirs;
use serde::{Deserialize, Serialize};

use crate::agent_runtime::{AgentRuntime, ResumeContinuity};
use crate::choice_dialog::{
    ChoiceDialog, DialogOutcome, DialogRow, run_choice_dialog, run_text_prompt,
};

/// Folders remembered in the index; the least recently used are dropped.
const MAX_INDEXED_FOLDERS: usize = 200;

#[derive(Default, Deserialize, Serialize)]
struct FolderIndex {
    folders: Vec<IndexedFolder>,
}

#[derive(Deserialize, Serialize)]
struct IndexedFolder {
    path: PathBuf,
    last_used_ms: u64,
}

/// Agent sessions stored in one folder.
pub(crate) struct FolderSessions {
    pub path: PathBuf,
    pub sessions: usize,
    pub last_event_ms: u64,
}

pub(crate) fn session_root(workspace: &Path) -> PathBuf {
    workspace.join(".crumb").join("sessions").join("crumb")
}

fn index_path() -> Option<PathBuf> {
    BaseDirs::new().map(|dirs| {
        dirs.home_dir()
            .join(".crumb")
            .join("sessions")
            .join("workspaces.json")
    })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| {
            u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX)
        })
}

/// Remembers that `workspace` has agent sessions. Best effort: the index only
/// powers `/sessions all`, so a failure never interrupts a turn.
pub(crate) fn record_workspace(workspace: &Path) {
    let Some(path) = index_path() else {
        return;
    };
    let mut index = load_index(&path);
    index.folders.retain(|folder| folder.path != workspace);
    index.folders.insert(
        0,
        IndexedFolder {
            path: workspace.to_path_buf(),
            last_used_ms: now_ms(),
        },
    );
    index.folders.truncate(MAX_INDEXED_FOLDERS);
    if let Some(parent) = path.parent()
        && fs::create_dir_all(parent).is_ok()
        && let Ok(encoded) = serde_json::to_vec_pretty(&index)
    {
        let temporary = path.with_extension("json.tmp");
        if fs::write(&temporary, encoded).is_ok() {
            let _ = fs::rename(&temporary, &path);
        }
    }
}

fn load_index(path: &Path) -> FolderIndex {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

/// Folders with at least one used session, most recently active first.
pub(crate) fn folder_groups() -> Vec<FolderSessions> {
    let Some(path) = index_path() else {
        return Vec::new();
    };
    let mut groups = load_index(&path)
        .folders
        .into_iter()
        .filter_map(|folder| {
            let sessions = used_sessions(&session_root(&folder.path));
            let last_event_ms = sessions
                .iter()
                .map(|session| session.last_event_at_ms)
                .max()?;
            Some(FolderSessions {
                path: folder.path,
                sessions: sessions.len(),
                last_event_ms,
            })
        })
        .collect::<Vec<_>>();
    groups.sort_by_key(|group| std::cmp::Reverse(group.last_event_ms));
    groups
}

/// Sessions that ran at least one turn, most recent first.
fn used_sessions(root: &Path) -> Vec<SessionSummary> {
    list_sessions(root)
        .unwrap_or_default()
        .into_iter()
        .filter(|session| session.turns > 0)
        .collect()
}

/// "just now", "5 min ago", "3 h ago", "2 d ago".
pub(crate) fn relative_time(now_ms: u64, then_ms: u64) -> String {
    let minutes = now_ms.saturating_sub(then_ms) / 60_000;
    match minutes {
        0 => "just now".to_owned(),
        1..=59 => format!("{minutes} min ago"),
        60..=1_439 => format!("{} h ago", minutes / 60),
        _ => format!("{} d ago", minutes / 1_440),
    }
}

/// Prints every folder with sessions, marking the current one.
pub(crate) fn show_folder_groups(cwd: &Path, writer: &mut dyn Write) -> Result<()> {
    let groups = folder_groups();
    writeln!(writer, "◆ Sessions by folder")?;
    if groups.is_empty() {
        writeln!(writer, "  No agent sessions recorded yet")?;
        return Ok(());
    }
    let now = now_ms();
    let current = fs::canonicalize(cwd).unwrap_or_else(|_| cwd.to_path_buf());
    for group in groups {
        let marker = if group.path == current {
            "  (this folder)"
        } else {
            ""
        };
        writeln!(
            writer,
            "  {} · {} session{} · {}{marker}",
            group.path.display(),
            group.sessions,
            if group.sessions == 1 { "" } else { "s" },
            relative_time(now, group.last_event_ms),
        )?;
    }
    writeln!(
        writer,
        "  Open a folder and run /sessions to resume one there."
    )?;
    Ok(())
}

fn session_row(session: &SessionSummary, now: u64) -> DialogRow {
    let label = session.label.clone().unwrap_or_else(|| {
        let id = session.id.as_str();
        format!("Session {}", id.get(..12).unwrap_or(id))
    });
    let mut detail = format!(
        "{} · {} turn{}",
        relative_time(now, session.last_event_at_ms),
        session.turns,
        if session.turns == 1 { "" } else { "s" }
    );
    if session.archived {
        detail.push_str(" · archived");
    }
    DialogRow {
        label,
        detail,
        checked: None,
    }
}

/// Interactive `/sessions`: pick a session in this folder to resume, rename
/// it, or archive it. Returns what to print into the transcript.
pub(crate) fn browse_sessions(
    cwd: &Path,
    runtime: &mut Option<AgentRuntime>,
    renderer: Renderer,
    fullscreen: bool,
    writer: &mut dyn Write,
) -> Result<()> {
    let root = session_root(cwd);
    let other_folders = folder_groups()
        .into_iter()
        .filter(|group| fs::canonicalize(cwd).ok().as_deref() != Some(group.path.as_path()))
        .count();
    let notes = if other_folders == 0 {
        Vec::new()
    } else {
        vec![format!(
            "{other_folders} other folder{} with sessions · /sessions all",
            if other_folders == 1 { "" } else { "s" }
        )]
    };
    let dialog = ChoiceDialog {
        title: "Sessions in this folder",
        notes: &notes,
        hint: "↑/↓ choose · Enter resume · r rename · a archive/restore · Esc close",
        actions: &['r', 'a'],
    };
    loop {
        let sessions = used_sessions(&root);
        if sessions.is_empty() {
            writeln!(writer, "◆ No agent sessions in this folder yet")?;
            if other_folders > 0 {
                writeln!(writer, "  Run /sessions all to see other folders.")?;
            }
            return Ok(());
        }
        let now = now_ms();
        let mut rows = sessions
            .iter()
            .map(|session| session_row(session, now))
            .collect::<Vec<_>>();
        match run_choice_dialog(renderer, &dialog, &mut rows, fullscreen)? {
            DialogOutcome::Cancelled => return Ok(()),
            DialogOutcome::Chosen(index) => {
                let session = &sessions[index];
                return resume(cwd, runtime, session, &rows[index].label, writer);
            }
            DialogOutcome::Action('r', index) => {
                let session = &sessions[index];
                let current = session.label.as_deref().unwrap_or_default();
                if let Some(label) =
                    run_text_prompt(renderer, "Rename session", current, fullscreen)?
                {
                    set_session_label(&root, session.id.as_str(), &label)?;
                }
            }
            DialogOutcome::Action(_, index) => {
                let session = &sessions[index];
                set_session_archived(&root, session.id.as_str(), !session.archived)?;
            }
        }
    }
}

fn resume(
    cwd: &Path,
    runtime: &mut Option<AgentRuntime>,
    session: &SessionSummary,
    label: &str,
    writer: &mut dyn Write,
) -> Result<()> {
    if runtime.is_none() {
        *runtime = Some(AgentRuntime::new()?);
    }
    let continuity = runtime
        .as_mut()
        .context("agent runtime is unavailable")?
        .resume(cwd, session.id.as_str())?;
    let note = match continuity {
        ResumeContinuity::AlreadyActive => " · already active",
        ResumeContinuity::Warm => " · conversation restored",
        ResumeContinuity::MetadataOnly => " · earlier conversation was not saved",
    };
    writeln!(writer, "◆ Resumed {label}{note}")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::relative_time;

    #[test]
    fn relative_times_read_naturally() {
        let now = 10 * 86_400_000;
        assert_eq!(relative_time(now, now - 20_000), "just now");
        assert_eq!(relative_time(now, now - 5 * 60_000), "5 min ago");
        assert_eq!(relative_time(now, now - 3 * 3_600_000), "3 h ago");
        assert_eq!(relative_time(now, now - 2 * 86_400_000), "2 d ago");
        assert_eq!(relative_time(now, now + 1_000), "just now");
    }
}
