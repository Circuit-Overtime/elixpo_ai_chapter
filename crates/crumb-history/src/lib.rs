//! Local SQLite-backed command history for crumb.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use crumb_platform::Platform;
use directories::BaseDirs;
use rusqlite::{Connection, Row, params};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS history (
    id            INTEGER PRIMARY KEY,
    command       TEXT NOT NULL,
    cwd           TEXT NOT NULL,
    platform      TEXT NOT NULL CHECK (platform IN ('linux', 'macos', 'windows')),
    mode          TEXT NOT NULL CHECK (mode IN ('native', 'builtin', 'ai', 'agent')),
    exit_code     INTEGER,
    created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS history_created_at ON history(created_at_ms DESC, id DESC);
CREATE INDEX IF NOT EXISTS history_command ON history(command);
PRAGMA user_version = 1;
";

/// Input mode associated with a history record.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HistoryMode {
    Native,
    BuiltIn,
    Ai,
    Agent,
}

impl HistoryMode {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Native => "native",
            Self::BuiltIn => "builtin",
            Self::Ai => "ai",
            Self::Agent => "agent",
        }
    }

    fn parse(value: &str) -> rusqlite::Result<Self> {
        match value {
            "native" => Ok(Self::Native),
            "builtin" => Ok(Self::BuiltIn),
            "ai" => Ok(Self::Ai),
            "agent" => Ok(Self::Agent),
            _ => Err(rusqlite::Error::InvalidQuery),
        }
    }
}

/// One persisted command and its execution metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HistoryEntry {
    pub id: i64,
    pub command: String,
    pub cwd: PathBuf,
    pub platform: Platform,
    pub mode: HistoryMode,
    pub exit_code: Option<i32>,
    pub created_at_ms: i64,
}

/// Metadata supplied when recording a command.
#[derive(Clone, Copy, Debug)]
pub struct RecordContext<'a> {
    pub cwd: &'a Path,
    pub platform: Platform,
    pub mode: HistoryMode,
    pub exit_code: Option<i32>,
}

/// Single-process handle to crumb's local history database.
pub struct HistoryStore {
    connection: Connection,
}

impl HistoryStore {
    /// Opens the default `~/.crumb/history.sqlite` database.
    ///
    /// # Errors
    ///
    /// Returns an error when the home directory is unavailable, its crumb
    /// directory cannot be created, or SQLite cannot open/migrate the file.
    pub fn open_default() -> Result<Self> {
        let base_dirs = BaseDirs::new().ok_or_else(|| anyhow!("home directory is unavailable"))?;
        Self::open(base_dirs.home_dir().join(".crumb/history.sqlite"))
    }

    /// Opens and migrates a database at an explicit path.
    ///
    /// # Errors
    ///
    /// Returns an error when its parent directory cannot be created or SQLite
    /// cannot open/migrate the database.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!("failed to create history directory {}", parent.display())
            })?;
        }
        let connection = Connection::open(path)
            .with_context(|| format!("failed to open history database {}", path.display()))?;
        Self::from_connection(connection)
    }

    /// Creates an isolated in-memory store, primarily for tests.
    ///
    /// # Errors
    ///
    /// Returns an error when SQLite initialization or migration fails.
    pub fn in_memory() -> Result<Self> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    /// Records a non-empty, non-sensitive command.
    ///
    /// Returns `Ok(None)` when the command is intentionally excluded.
    ///
    /// # Errors
    ///
    /// Returns an error when SQLite cannot insert the record or the system
    /// clock cannot be represented.
    pub fn record(&self, command: &str, context: RecordContext<'_>) -> Result<Option<i64>> {
        if command.trim().is_empty() || is_sensitive(command) {
            return Ok(None);
        }
        let created_at_ms = current_timestamp_ms()?;
        self.connection.execute(
            "INSERT INTO history (command, cwd, platform, mode, exit_code, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                command,
                context.cwd.to_string_lossy(),
                context.platform.to_string(),
                context.mode.as_str(),
                context.exit_code,
                created_at_ms,
            ],
        )?;
        Ok(Some(self.connection.last_insert_rowid()))
    }

    /// Returns newest history entries first.
    ///
    /// # Errors
    ///
    /// Returns an error when SQLite cannot prepare or execute the query.
    pub fn recent(&self, limit: u32) -> Result<Vec<HistoryEntry>> {
        self.query(
            "SELECT id, command, cwd, platform, mode, exit_code, created_at_ms
             FROM history ORDER BY created_at_ms DESC, id DESC LIMIT ?1",
            params![limit],
        )
    }

    /// Searches command text literally and returns newest matches first.
    ///
    /// # Errors
    ///
    /// Returns an error when SQLite cannot prepare or execute the query.
    pub fn search(&self, text: &str, limit: u32) -> Result<Vec<HistoryEntry>> {
        let escaped = escape_like(text);
        self.query(
            "SELECT id, command, cwd, platform, mode, exit_code, created_at_ms
             FROM history WHERE command LIKE '%' || ?1 || '%' ESCAPE '\\'
             ORDER BY created_at_ms DESC, id DESC LIMIT ?2",
            params![escaped, limit],
        )
    }

    fn from_connection(connection: Connection) -> Result<Self> {
        connection.execute_batch(SCHEMA)?;
        Ok(Self { connection })
    }

    fn query<P>(&self, sql: &str, parameters: P) -> Result<Vec<HistoryEntry>>
    where
        P: rusqlite::Params,
    {
        let mut statement = self.connection.prepare(sql)?;
        let entries = statement
            .query_map(parameters, decode_entry)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(entries)
    }
}

fn decode_entry(row: &Row<'_>) -> rusqlite::Result<HistoryEntry> {
    let platform: String = row.get(3)?;
    let mode: String = row.get(4)?;
    Ok(HistoryEntry {
        id: row.get(0)?,
        command: row.get(1)?,
        cwd: PathBuf::from(row.get::<_, String>(2)?),
        platform: parse_platform(&platform)?,
        mode: HistoryMode::parse(&mode)?,
        exit_code: row.get(5)?,
        created_at_ms: row.get(6)?,
    })
}

fn parse_platform(value: &str) -> rusqlite::Result<Platform> {
    match value {
        "linux" => Ok(Platform::Linux),
        "macos" => Ok(Platform::MacOs),
        "windows" => Ok(Platform::Windows),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

fn current_timestamp_ms() -> Result<i64> {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    i64::try_from(millis).context("history timestamp exceeds SQLite integer range")
}

fn escape_like(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn is_sensitive(command: &str) -> bool {
    let lowercase = command.to_ascii_lowercase();
    [
        "authorization:",
        "pollinations_api_key",
        "api_key=",
        "apikey=",
        "password=",
        "passwd=",
        "token=",
        "secret=",
        "sk_",
    ]
    .iter()
    .any(|marker| lowercase.contains(marker))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::process;
    use std::time::{SystemTime, UNIX_EPOCH};

    use crumb_platform::Platform;

    use super::{HistoryMode, HistoryStore, RecordContext};

    fn context(exit_code: i32) -> RecordContext<'static> {
        RecordContext {
            cwd: Path::new("/workspace/crumb"),
            platform: Platform::Linux,
            mode: HistoryMode::Native,
            exit_code: Some(exit_code),
        }
    }

    #[test]
    fn records_recent_commands_with_metadata() {
        let store = HistoryStore::in_memory().expect("history should initialize");

        store.record("pwd", context(0)).expect("pwd should record");
        store
            .record("false", context(1))
            .expect("false should record");

        let entries = store.recent(10).expect("recent history should load");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].command, "false");
        assert_eq!(entries[0].exit_code, Some(1));
        assert_eq!(entries[0].cwd, Path::new("/workspace/crumb"));
    }

    #[test]
    fn search_treats_sql_wildcards_literally() {
        let store = HistoryStore::in_memory().expect("history should initialize");
        store
            .record("echo 100%", context(0))
            .expect("command should record");
        store
            .record("echo 1000", context(0))
            .expect("command should record");

        let entries = store.search("100%", 10).expect("history search should run");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].command, "echo 100%");
    }

    #[test]
    fn skips_empty_and_sensitive_commands() {
        let store = HistoryStore::in_memory().expect("history should initialize");

        assert_eq!(
            store.record("  ", context(0)).expect("empty is valid"),
            None
        );
        assert_eq!(
            store
                .record("export POLLINATIONS_API_KEY=sk_private", context(0))
                .expect("sensitive is valid"),
            None
        );
        assert!(matches!(
            store.recent(10).expect("history should load").as_slice(),
            []
        ));
    }

    #[test]
    fn file_store_migrates_and_persists_across_reopen() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be valid")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "crumb-history-test-{}-{nonce}.sqlite",
            process::id()
        ));

        {
            let store = HistoryStore::open(&path).expect("file history should initialize");
            store
                .record("echo persisted", context(0))
                .expect("command should record");
        }
        let reopened = HistoryStore::open(&path).expect("history should reopen");
        let entries = reopened.recent(10).expect("persisted history should load");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].command, "echo persisted");
        drop(reopened);
        fs::remove_file(path).expect("temporary history should be removable");
    }
}
