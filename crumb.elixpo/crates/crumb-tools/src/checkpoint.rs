//! Reviewable checkpoints for edits performed through Crumb-owned tools.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const MANIFEST: &str = "manifest.json";
const BEFORE: &str = "before.bin";
const AFTER: &str = "after.bin";
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
static NEXT_CHECKPOINT: AtomicU64 = AtomicU64::new(0);

/// Review state of one Crumb-owned edit.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckpointStatus {
    Pending,
    Approved,
    Rejected,
}

/// Explicit user decision applied to a checkpoint.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CheckpointDecision {
    Approve,
    Reject,
}

/// Redacted per-file checkpoint metadata.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CheckpointFile {
    pub path: PathBuf,
    pub before_exists: bool,
    pub before_bytes: usize,
    pub after_bytes: usize,
    pub before_digest: Option<String>,
    pub after_digest: String,
    pub status: CheckpointStatus,
}

/// Machine-readable checkpoint summary. File contents are stored separately.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct WorkspaceCheckpoint {
    pub id: String,
    pub created_at_ms: u64,
    pub file: CheckpointFile,
}

/// Workspace-confined store for edits made by Crumb-owned write tools.
#[derive(Clone, Debug)]
pub struct CheckpointStore {
    workspace: PathBuf,
    root: PathBuf,
    max_file_bytes: usize,
}

impl CheckpointStore {
    /// Opens a lazy checkpoint store without scanning workspace files.
    ///
    /// # Errors
    ///
    /// Returns an error when the workspace is unavailable or the limit is zero.
    pub fn new(workspace: &Path, max_file_bytes: usize) -> Result<Self> {
        if max_file_bytes == 0 {
            bail!("checkpoint file limit must be positive");
        }
        let workspace = fs::canonicalize(workspace)
            .with_context(|| format!("failed to resolve workspace `{}`", workspace.display()))?;
        if !workspace.is_dir() {
            bail!("checkpoint workspace must be a directory");
        }
        let root = workspace.join(".crumb").join("checkpoints");
        Ok(Self {
            workspace,
            root,
            max_file_bytes,
        })
    }

    /// Records one completed Crumb-owned edit and its exact preimage.
    ///
    /// # Errors
    ///
    /// Returns an error for unsafe paths, credential-like content, oversized
    /// files, or persistence failures.
    pub fn record_edit(
        &self,
        path: &Path,
        before: Option<&[u8]>,
        after: &[u8],
    ) -> Result<WorkspaceCheckpoint> {
        let path = self.validate_edit(path, before, after)?;
        let current = fs::read(self.resolve_target(&path)?)
            .with_context(|| format!("failed to verify Crumb edit `{}`", path.display()))?;
        if current != after {
            bail!("workspace file does not match the claimed Crumb edit");
        }
        let id = checkpoint_id();
        let root = self.ensure_root()?;
        let directory = root.join(&id);
        fs::create_dir(&directory).with_context(|| {
            format!(
                "failed to create checkpoint directory {}",
                directory.display()
            )
        })?;
        if let Some(content) = before {
            write_new(&directory.join(BEFORE), content)?;
        }
        write_new(&directory.join(AFTER), after)?;
        let checkpoint = WorkspaceCheckpoint {
            id,
            created_at_ms: timestamp_ms(),
            file: CheckpointFile {
                path,
                before_exists: before.is_some(),
                before_bytes: before.map_or(0, <[u8]>::len),
                after_bytes: after.len(),
                before_digest: before.map(digest),
                after_digest: digest(after),
                status: CheckpointStatus::Pending,
            },
        };
        write_manifest(&directory, &checkpoint)?;
        Ok(checkpoint)
    }

    /// Validates checkpoint safety before a write tool mutates the workspace.
    ///
    /// # Errors
    ///
    /// Returns an error for unsafe paths, credential-like content, or files
    /// exceeding the configured limit.
    pub fn validate_edit(
        &self,
        path: &Path,
        before: Option<&[u8]>,
        after: &[u8],
    ) -> Result<PathBuf> {
        let path = validate_relative_path(path)?;
        ensure_checkpoint_safe(&path, before, after)?;
        if before.is_some_and(|content| content.len() > self.max_file_bytes)
            || after.len() > self.max_file_bytes
        {
            bail!("checkpoint content exceeds the configured file limit");
        }
        Ok(path)
    }

    /// Lists valid checkpoint manifests newest-first.
    ///
    /// # Errors
    ///
    /// Returns an error when the checkpoint root cannot be read.
    pub fn list(&self) -> Result<Vec<WorkspaceCheckpoint>> {
        if !self.root.is_dir() {
            return Ok(Vec::new());
        }
        let root = self.ensure_root()?;
        let mut checkpoints = fs::read_dir(&root)
            .with_context(|| format!("failed to read checkpoint root {}", root.display()))?
            .filter_map(std::result::Result::ok)
            .filter_map(|entry| self.load(&entry.file_name().to_string_lossy()).ok())
            .collect::<Vec<_>>();
        checkpoints.sort_by_key(|checkpoint| std::cmp::Reverse(checkpoint.created_at_ms));
        Ok(checkpoints)
    }

    /// Loads one bounded checkpoint manifest.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid identifiers, manifests, or paths.
    pub fn load(&self, id: &str) -> Result<WorkspaceCheckpoint> {
        validate_id(id)?;
        let directory = self.checkpoint_directory(id)?;
        let path = directory.join(MANIFEST);
        let metadata = fs::symlink_metadata(&path)
            .with_context(|| format!("failed to inspect checkpoint {id}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            bail!("checkpoint manifest must be a regular non-symlink file");
        }
        if metadata.len() > MAX_MANIFEST_BYTES {
            bail!("checkpoint manifest exceeds its size limit");
        }
        let bytes = fs::read(&path).with_context(|| format!("failed to read checkpoint {id}"))?;
        let checkpoint: WorkspaceCheckpoint = serde_json::from_slice(&bytes)
            .with_context(|| format!("invalid checkpoint manifest {id}"))?;
        if checkpoint.id != id {
            bail!("checkpoint manifest identifier mismatch");
        }
        validate_relative_path(&checkpoint.file.path)?;
        Ok(checkpoint)
    }

    /// Renders a bounded, content-safe whole-file diff.
    ///
    /// # Errors
    ///
    /// Returns an error for missing, binary, invalid, or oversized content.
    pub fn render_diff(&self, id: &str, max_output_bytes: usize) -> Result<String> {
        if max_output_bytes == 0 {
            bail!("diff output limit must be positive");
        }
        let checkpoint = self.load(id)?;
        let directory = self.checkpoint_directory(id)?;
        let before = if checkpoint.file.before_exists {
            read_bounded(&directory.join(BEFORE), self.max_file_bytes)?
        } else {
            Vec::new()
        };
        let after = read_bounded(&directory.join(AFTER), self.max_file_bytes)?;
        let before = std::str::from_utf8(&before).context("checkpoint preimage is binary")?;
        let after = std::str::from_utf8(&after).context("checkpoint result is binary")?;
        Ok(render_whole_file_diff(
            &checkpoint.file.path,
            before,
            after,
            max_output_bytes,
        ))
    }

    /// Approves an edit or safely restores its exact preimage.
    ///
    /// Rejection refuses to overwrite any file changed after the checkpoint.
    ///
    /// # Errors
    ///
    /// Returns an error for stale content, unsafe paths, repeated decisions, or
    /// filesystem failures.
    pub fn decide(&self, id: &str, decision: CheckpointDecision) -> Result<WorkspaceCheckpoint> {
        let mut checkpoint = self.load(id)?;
        if checkpoint.file.status != CheckpointStatus::Pending {
            bail!("checkpoint has already been decided");
        }
        if decision == CheckpointDecision::Reject {
            self.restore(&checkpoint)?;
            checkpoint.file.status = CheckpointStatus::Rejected;
        } else {
            checkpoint.file.status = CheckpointStatus::Approved;
        }
        write_manifest(&self.checkpoint_directory(id)?, &checkpoint)?;
        Ok(checkpoint)
    }

    /// Applies one decision to every pending checkpoint, newest-first.
    ///
    /// Rejection stops at the first stale file so a later user edit is never
    /// overwritten. Checkpoints successfully handled before that refusal keep
    /// their explicit decision.
    ///
    /// # Errors
    ///
    /// Returns an error when checkpoints cannot be listed or a decision cannot
    /// be applied safely.
    pub fn decide_pending(&self, decision: CheckpointDecision) -> Result<Vec<WorkspaceCheckpoint>> {
        self.list()?
            .into_iter()
            .filter(|checkpoint| checkpoint.file.status == CheckpointStatus::Pending)
            .map(|checkpoint| self.decide(&checkpoint.id, decision))
            .collect()
    }

    fn restore(&self, checkpoint: &WorkspaceCheckpoint) -> Result<()> {
        let target = self.resolve_target(&checkpoint.file.path)?;
        let current = fs::read(&target).with_context(|| {
            format!(
                "edited file `{}` is missing",
                checkpoint.file.path.display()
            )
        })?;
        if digest(&current) != checkpoint.file.after_digest {
            bail!("edited file changed after the checkpoint; refusing rewind");
        }
        if checkpoint.file.before_exists {
            let before = read_bounded(
                &self.checkpoint_directory(&checkpoint.id)?.join(BEFORE),
                self.max_file_bytes,
            )?;
            fs::write(&target, before).with_context(|| {
                format!("failed to restore `{}`", checkpoint.file.path.display())
            })?;
        } else {
            fs::remove_file(&target).with_context(|| {
                format!(
                    "failed to remove `{}` during rewind",
                    checkpoint.file.path.display()
                )
            })?;
        }
        Ok(())
    }

    fn checkpoint_directory(&self, id: &str) -> Result<PathBuf> {
        validate_id(id)?;
        let root = self.ensure_root()?;
        let directory = fs::canonicalize(root.join(id))
            .with_context(|| format!("checkpoint {id} does not exist"))?;
        if !directory.starts_with(&root) {
            bail!("checkpoint directory escapes its configured root");
        }
        if !directory.is_dir() {
            bail!("checkpoint does not exist");
        }
        Ok(directory)
    }

    fn ensure_root(&self) -> Result<PathBuf> {
        let crumb = self.workspace.join(".crumb");
        ensure_owned_directory(&crumb, "Crumb state")?;
        ensure_owned_directory(&self.root, "checkpoint root")?;
        let root = fs::canonicalize(&self.root).with_context(|| {
            format!("failed to resolve checkpoint root {}", self.root.display())
        })?;
        if !root.starts_with(&self.workspace) {
            bail!("checkpoint root escapes its workspace");
        }
        Ok(root)
    }

    fn resolve_target(&self, path: &Path) -> Result<PathBuf> {
        let candidate = self.workspace.join(validate_relative_path(path)?);
        let metadata = fs::symlink_metadata(&candidate)
            .with_context(|| format!("edited file `{}` does not exist", path.display()))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            bail!("edited path must be a regular non-symlink file");
        }
        let resolved = fs::canonicalize(&candidate)
            .with_context(|| format!("failed to resolve edited file `{}`", path.display()))?;
        if !resolved.starts_with(&self.workspace) {
            bail!("edited file escapes its workspace");
        }
        Ok(resolved)
    }
}

fn ensure_owned_directory(path: &Path, label: &str) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => bail!("{label} cannot be a symlink"),
        Ok(metadata) if !metadata.is_dir() => bail!("{label} must be a directory"),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => fs::create_dir(path)
            .with_context(|| format!("failed to create {label} {}", path.display())),
        Err(error) => Err(error).with_context(|| format!("failed to inspect {label}")),
    }
}

fn validate_relative_path(path: &Path) -> Result<PathBuf> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        bail!("checkpoint path must be workspace-relative");
    }
    if path.components().any(|component| {
        !matches!(component, Component::Normal(_))
            || matches!(
                component.as_os_str().to_str(),
                Some(".git" | ".crumb" | ".ssh")
            )
    }) {
        bail!("checkpoint path is not safe");
    }
    Ok(path.to_path_buf())
}

fn ensure_checkpoint_safe(path: &Path, before: Option<&[u8]>, after: &[u8]) -> Result<()> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .context("checkpoint filename must be UTF-8")?
        .to_ascii_lowercase();
    let sensitive_name = name.starts_with(".env")
        || matches!(
            name.as_str(),
            ".npmrc"
                | ".pypirc"
                | ".netrc"
                | "credentials.json"
                | "secrets.json"
                | "id_rsa"
                | "id_ed25519"
        )
        || [".pem", ".p12", ".pfx", ".key"]
            .iter()
            .any(|suffix| name.ends_with(suffix));
    let private_key = before.into_iter().chain([after]).any(|content| {
        content
            .windows(b"-----BEGIN PRIVATE KEY-----".len())
            .any(|window| window == b"-----BEGIN PRIVATE KEY-----")
    });
    if sensitive_name || private_key {
        bail!("credential-sensitive files cannot be checkpointed");
    }
    Ok(())
}

fn validate_id(id: &str) -> Result<()> {
    if id.is_empty()
        || id.len() > 80
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        bail!("invalid checkpoint identifier");
    }
    Ok(())
}

fn checkpoint_id() -> String {
    format!(
        "cp-{}-{}-{}",
        timestamp_ms(),
        std::process::id(),
        NEXT_CHECKPOINT.fetch_add(1, Ordering::Relaxed)
    )
}

fn timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        })
}

fn digest(content: &[u8]) -> String {
    format!("{:x}", Sha256::digest(content))
}

fn write_new(path: &Path, content: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .with_context(|| format!("failed to create checkpoint data {}", path.display()))?;
    file.write_all(content)
        .with_context(|| format!("failed to write checkpoint data {}", path.display()))?;
    file.flush()
        .with_context(|| format!("failed to flush checkpoint data {}", path.display()))
}

fn write_manifest(directory: &Path, checkpoint: &WorkspaceCheckpoint) -> Result<()> {
    let path = directory.join(MANIFEST);
    if let Ok(metadata) = fs::symlink_metadata(&path)
        && (metadata.file_type().is_symlink() || !metadata.is_file())
    {
        bail!("checkpoint manifest must be a regular non-symlink file");
    }
    let bytes = serde_json::to_vec_pretty(checkpoint).context("failed to encode checkpoint")?;
    if bytes.len() > usize::try_from(MAX_MANIFEST_BYTES).unwrap_or(usize::MAX) {
        bail!("checkpoint manifest exceeds its size limit");
    }
    fs::write(&path, bytes)
        .with_context(|| format!("failed to write checkpoint manifest {}", path.display()))
}

fn read_bounded(path: &Path, limit: usize) -> Result<Vec<u8>> {
    let metadata = fs::symlink_metadata(path)
        .with_context(|| format!("failed to inspect checkpoint data {}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        bail!("checkpoint data must be a regular non-symlink file");
    }
    let file = File::open(path)
        .with_context(|| format!("failed to open checkpoint data {}", path.display()))?;
    let mut content = Vec::with_capacity(limit.min(64 * 1024));
    file.take(u64::try_from(limit).unwrap_or(u64::MAX).saturating_add(1))
        .read_to_end(&mut content)
        .with_context(|| format!("failed to read checkpoint data {}", path.display()))?;
    if content.len() > limit {
        bail!("checkpoint data exceeds its size limit");
    }
    Ok(content)
}

fn render_whole_file_diff(path: &Path, before: &str, after: &str, limit: usize) -> String {
    let mut output = format!("--- a/{}\n+++ b/{}\n", path.display(), path.display());
    for (prefix, content) in [('-', before), ('+', after)] {
        for line in content.lines() {
            let rendered = format!("{prefix}{line}\n");
            if output.len().saturating_add(rendered.len()) > limit {
                output.push_str("[diff truncated]\n");
                truncate_utf8(&mut output, limit);
                return output;
            }
            output.push_str(&rendered);
        }
    }
    truncate_utf8(&mut output, limit);
    output
}

fn truncate_utf8(value: &mut String, limit: usize) {
    if value.len() <= limit {
        return;
    }
    let mut boundary = limit;
    while !value.is_char_boundary(boundary) {
        boundary -= 1;
    }
    value.truncate(boundary);
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};

    use super::{CheckpointDecision, CheckpointStatus, CheckpointStore};

    struct Workspace(PathBuf);

    impl Workspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "crumb-checkpoint-{}-{}",
                std::process::id(),
                super::NEXT_CHECKPOINT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            fs::create_dir(&path).expect("workspace is created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for Workspace {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).expect("workspace is removed");
        }
    }

    #[test]
    fn rejected_checkpoint_restores_only_an_unchanged_crumb_edit() {
        let workspace = Workspace::new();
        let path = workspace.path().join("notes.txt");
        fs::write(&path, "after").expect("edited fixture is written");
        let store = CheckpointStore::new(workspace.path(), 128).expect("store opens");
        let checkpoint = store
            .record_edit(Path::new("notes.txt"), Some(b"before"), b"after")
            .expect("checkpoint is recorded");
        let decided = store
            .decide(&checkpoint.id, CheckpointDecision::Reject)
            .expect("checkpoint is rejected");
        assert_eq!(decided.file.status, CheckpointStatus::Rejected);
        assert_eq!(fs::read_to_string(path).expect("fixture reads"), "before");
    }

    #[test]
    fn rewind_refuses_to_overwrite_a_later_user_change() {
        let workspace = Workspace::new();
        let path = workspace.path().join("notes.txt");
        fs::write(&path, "after").expect("edited fixture is written");
        let store = CheckpointStore::new(workspace.path(), 128).expect("store opens");
        let checkpoint = store
            .record_edit(Path::new("notes.txt"), Some(b"before"), b"after")
            .expect("checkpoint is recorded");
        fs::write(&path, "user change").expect("later edit is written");
        assert!(
            store
                .decide(&checkpoint.id, CheckpointDecision::Reject)
                .is_err()
        );
        assert_eq!(
            fs::read_to_string(path).expect("fixture reads"),
            "user change"
        );
    }

    #[test]
    fn credential_paths_are_never_copied() {
        let workspace = Workspace::new();
        let store = CheckpointStore::new(workspace.path(), 128).expect("store opens");
        assert!(
            store
                .record_edit(Path::new(".env.local"), Some(b"old"), b"new")
                .is_err()
        );
        assert_eq!(store.list().expect("list succeeds"), []);
    }

    #[test]
    fn diff_output_is_bounded() {
        let workspace = Workspace::new();
        fs::write(workspace.path().join("notes.txt"), "after").expect("fixture is written");
        let store = CheckpointStore::new(workspace.path(), 128).expect("store opens");
        let checkpoint = store
            .record_edit(Path::new("notes.txt"), Some(b"before"), b"after")
            .expect("checkpoint is recorded");
        let diff = store.render_diff(&checkpoint.id, 32).expect("diff renders");
        assert!(diff.len() <= 32);
    }

    #[test]
    fn whole_change_decision_approves_every_pending_file() {
        let workspace = Workspace::new();
        let store = CheckpointStore::new(workspace.path(), 128).expect("store opens");
        for (name, content) in [
            ("one.txt", b"one".as_slice()),
            ("two.txt", b"two".as_slice()),
        ] {
            fs::write(workspace.path().join(name), content).expect("fixture is written");
            store
                .record_edit(Path::new(name), None, content)
                .expect("checkpoint is recorded");
        }
        let decided = store
            .decide_pending(CheckpointDecision::Approve)
            .expect("whole change is approved");
        assert_eq!(decided.len(), 2);
        assert!(
            decided
                .iter()
                .all(|checkpoint| checkpoint.file.status == CheckpointStatus::Approved)
        );
    }
}
