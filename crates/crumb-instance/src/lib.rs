//! Stable, non-secret identity and workspace layout metadata for Crumb.
//!
//! The metadata is intentionally an index, not another conversation store.
//! Chat content, tool output, credentials, and absolute workspace paths do not
//! belong in this document.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

/// Current on-disk instance metadata schema.
pub const INSTANCE_SCHEMA_VERSION: u32 = 1;
/// Maximum accepted size of `.crumb/instance.json`.
pub const MAX_INSTANCE_METADATA_BYTES: usize = 16 * 1024;
/// Maximum UTF-8 byte length of a human-facing instance name.
pub const MAX_INSTANCE_NAME_BYTES: usize = 64;

const INSTANCE_ID_PREFIX: &str = "crumb_";
const INSTANCE_ID_RANDOM_BYTES: usize = 16;
const INSTANCE_ID_HEX_BYTES: usize = INSTANCE_ID_RANDOM_BYTES * 2;

/// Relative locations owned by existing Crumb subsystems.
///
/// Every path is relative to the workspace's `.crumb` directory. Keeping the
/// index relative makes it portable and prevents a copied workspace from
/// leaking its previous absolute location.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceLayout {
    pub agent_config: PathBuf,
    pub graph_settings: PathBuf,
    pub memory: PathBuf,
    pub sessions: PathBuf,
    pub jobs: PathBuf,
    pub checkpoints: PathBuf,
    pub a2a: PathBuf,
}

impl Default for WorkspaceLayout {
    fn default() -> Self {
        Self {
            agent_config: PathBuf::from("agent.json"),
            graph_settings: PathBuf::from("graph.json"),
            memory: PathBuf::from("MEMORY.md"),
            sessions: PathBuf::from("sessions"),
            jobs: PathBuf::from("jobs"),
            checkpoints: PathBuf::from("checkpoints"),
            a2a: PathBuf::from("a2a"),
        }
    }
}

impl WorkspaceLayout {
    /// Validates that the index contains only the canonical, relative layout.
    ///
    /// # Errors
    ///
    /// Returns an error for absolute, traversing, or unsupported paths.
    pub fn validate(&self) -> Result<()> {
        for path in [
            &self.agent_config,
            &self.graph_settings,
            &self.memory,
            &self.sessions,
            &self.jobs,
            &self.checkpoints,
            &self.a2a,
        ] {
            validate_relative_path(path)?;
        }

        if self != &Self::default() {
            bail!("workspace layout is not supported by this Crumb version");
        }
        Ok(())
    }

    /// Resolves one indexed path beneath a trusted `.crumb` root.
    ///
    /// # Errors
    ///
    /// Returns an error if the supplied relative path is unsafe or is not one
    /// of the paths in this layout.
    pub fn resolve(&self, crumb_root: &Path, relative: &Path) -> Result<PathBuf> {
        validate_relative_path(relative)?;
        let known = [
            &self.agent_config,
            &self.graph_settings,
            &self.memory,
            &self.sessions,
            &self.jobs,
            &self.checkpoints,
            &self.a2a,
        ];
        if !known
            .iter()
            .any(|known_path| known_path.as_path() == relative)
        {
            bail!("path is not part of the Crumb workspace layout");
        }
        Ok(crumb_root.join(relative))
    }
}

/// Persistent identity for one Crumb workspace.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstanceMetadata {
    pub schema_version: u32,
    pub instance_id: String,
    pub name: String,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub layout: WorkspaceLayout,
}

impl InstanceMetadata {
    /// Validates the persisted identity and its non-secret path index.
    ///
    /// # Errors
    ///
    /// Returns an error when the schema, identifier, name, timestamps, or
    /// layout are malformed.
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != INSTANCE_SCHEMA_VERSION {
            bail!(
                "unsupported Crumb instance metadata schema {}",
                self.schema_version
            );
        }
        validate_instance_id(&self.instance_id)?;
        validate_instance_name(&self.name)?;
        if self.created_at_ms == 0 || self.updated_at_ms < self.created_at_ms {
            bail!("Crumb instance timestamps are invalid");
        }
        self.layout.validate()
    }
}

/// Atomic storage for `<workspace>/.crumb/instance.json`.
#[derive(Clone, Debug)]
pub struct InstanceStore {
    workspace: PathBuf,
    crumb_root: PathBuf,
    path: PathBuf,
}

impl InstanceStore {
    /// Creates a store rooted at a workspace without touching the filesystem.
    #[must_use]
    pub fn for_workspace(workspace: &Path) -> Self {
        let crumb_root = workspace.join(".crumb");
        let path = crumb_root.join("instance.json");
        Self {
            workspace: workspace.to_path_buf(),
            crumb_root,
            path,
        }
    }

    /// Returns the workspace's `.crumb` directory.
    #[must_use]
    pub fn crumb_root(&self) -> &Path {
        &self.crumb_root
    }

    /// Returns the instance metadata path.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Loads existing metadata without creating any files.
    ///
    /// # Errors
    ///
    /// Returns an error if `.crumb` is unsafe, `instance.json` is missing,
    /// symlinked, non-regular, oversized, malformed, or semantically invalid.
    pub fn load(&self) -> Result<InstanceMetadata> {
        self.inspect_crumb_root(false)?;
        let metadata = fs::symlink_metadata(&self.path).with_context(|| {
            format!(
                "Crumb instance metadata is unavailable at {}",
                self.path.display()
            )
        })?;
        if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
            bail!("Crumb instance metadata must be a regular file, not a symlink");
        }
        if metadata.len() > MAX_INSTANCE_METADATA_BYTES as u64 {
            bail!("Crumb instance metadata exceeds the byte limit");
        }

        let encoded_capacity = usize::try_from(metadata.len())
            .context("Crumb instance metadata size is unsupported")?;
        let read_limit = u64::try_from(MAX_INSTANCE_METADATA_BYTES + 1)
            .context("Crumb instance metadata limit is unsupported")?;
        let mut encoded = Vec::with_capacity(encoded_capacity);
        File::open(&self.path)
            .context("Crumb instance metadata could not be opened")?
            .take(read_limit)
            .read_to_end(&mut encoded)
            .context("Crumb instance metadata could not be read")?;
        if encoded.len() > MAX_INSTANCE_METADATA_BYTES {
            bail!("Crumb instance metadata exceeds the byte limit");
        }
        let instance: InstanceMetadata =
            serde_json::from_slice(&encoded).context("Crumb instance metadata is malformed")?;
        instance.validate()?;
        Ok(instance)
    }

    /// Loads an existing identity or creates one from the workspace name.
    ///
    /// Creation is atomic and does not replace a concurrently-created
    /// identity. Invalid existing metadata is reported instead of overwritten.
    ///
    /// # Errors
    ///
    /// Returns an error when metadata is invalid or cannot be persisted.
    pub fn load_or_create(&self) -> Result<InstanceMetadata> {
        let name = self.default_name();
        self.load_or_create_named(&name)
    }

    /// Loads an existing identity or atomically creates one with `name`.
    ///
    /// `name` is used only during creation; an existing name is never silently
    /// changed by startup.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid name or unsafe/unwritable metadata.
    pub fn load_or_create_named(&self, name: &str) -> Result<InstanceMetadata> {
        validate_instance_name(name)?;
        match fs::symlink_metadata(&self.path) {
            Ok(_) => return self.load(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(error).context("Crumb instance metadata could not be inspected");
            }
        }

        self.inspect_crumb_root(true)?;
        let now = now_ms()?;
        let instance = InstanceMetadata {
            schema_version: INSTANCE_SCHEMA_VERSION,
            instance_id: generate_instance_id()?,
            name: name.to_owned(),
            created_at_ms: now,
            updated_at_ms: now,
            layout: WorkspaceLayout::default(),
        };
        instance.validate()?;

        match self.write_new(&instance) {
            Ok(()) => Ok(instance),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => self.load(),
            Err(error) => Err(error).context("Crumb instance metadata could not be created"),
        }
    }

    /// Atomically changes the human-facing name while preserving identity.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid name or unsafe/unwritable metadata.
    pub fn rename(&self, name: &str) -> Result<InstanceMetadata> {
        validate_instance_name(name)?;
        let mut instance = self.load()?;
        if instance.name == name {
            return Ok(instance);
        }
        name.clone_into(&mut instance.name);
        instance.updated_at_ms = now_ms()?.max(instance.created_at_ms);
        instance.validate()?;
        self.replace(&instance)?;
        Ok(instance)
    }

    fn default_name(&self) -> String {
        let candidate = self
            .workspace
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Crumb");
        if validate_instance_name(candidate).is_ok() {
            candidate.to_owned()
        } else {
            "Crumb".to_owned()
        }
    }

    fn inspect_crumb_root(&self, create: bool) -> Result<()> {
        match fs::symlink_metadata(&self.crumb_root) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
                    bail!("workspace .crumb path must be a directory, not a symlink");
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && create => {
                create_private_directory(&self.crumb_root)?;
            }
            Err(error) => {
                return Err(error).with_context(|| {
                    format!(
                        "workspace .crumb directory is unavailable at {}",
                        self.crumb_root.display()
                    )
                });
            }
        }
        Ok(())
    }

    fn write_new(&self, instance: &InstanceMetadata) -> std::io::Result<()> {
        let mut temporary = tempfile::NamedTempFile::new_in(&self.crumb_root)?;
        write_instance(&mut temporary, instance)?;
        temporary
            .persist_noclobber(&self.path)
            .map_err(|error| error.error)?;
        sync_parent(&self.crumb_root)?;
        Ok(())
    }

    fn replace(&self, instance: &InstanceMetadata) -> Result<()> {
        self.inspect_crumb_root(false)?;
        let current = fs::symlink_metadata(&self.path)
            .context("Crumb instance metadata could not be inspected before replacement")?;
        if current.file_type().is_symlink() || !current.file_type().is_file() {
            bail!("Crumb instance metadata must be a regular file, not a symlink");
        }

        let mut temporary = tempfile::NamedTempFile::new_in(&self.crumb_root)
            .context("temporary Crumb instance metadata could not be created")?;
        write_instance(&mut temporary, instance)
            .context("temporary Crumb instance metadata could not be written")?;
        temporary
            .persist(&self.path)
            .map_err(|error| error.error)
            .context("Crumb instance metadata could not be atomically replaced")?;
        sync_parent(&self.crumb_root)
            .context("Crumb instance metadata directory could not sync")?;
        Ok(())
    }
}

/// Validates a user-visible Crumb instance name.
///
/// Names may contain Unicode and ordinary spaces, but not leading/trailing
/// whitespace, controls, path separators, or traversal aliases.
///
/// # Errors
///
/// Returns an error when the name is empty, too long, path-like, or unsafe for
/// display in terminal status surfaces.
pub fn validate_instance_name(name: &str) -> Result<()> {
    if name.is_empty() || name.len() > MAX_INSTANCE_NAME_BYTES || name.trim() != name {
        bail!("Crumb instance name must be 1-{MAX_INSTANCE_NAME_BYTES} bytes without edge spaces");
    }
    if matches!(name, "." | "..")
        || name
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '\\'))
    {
        bail!("Crumb instance name cannot contain controls, separators, or traversal aliases");
    }
    Ok(())
}

fn validate_instance_id(instance_id: &str) -> Result<()> {
    let Some(random) = instance_id.strip_prefix(INSTANCE_ID_PREFIX) else {
        bail!("Crumb instance identifier has an invalid prefix");
    };
    if random.len() != INSTANCE_ID_HEX_BYTES
        || !random
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        bail!("Crumb instance identifier is malformed");
    }
    Ok(())
}

fn validate_relative_path(path: &Path) -> Result<()> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        bail!("Crumb workspace layout paths must be non-empty and relative");
    }
    if path
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!("Crumb workspace layout path contains unsafe components");
    }
    Ok(())
}

fn generate_instance_id() -> Result<String> {
    let mut random = [0_u8; INSTANCE_ID_RANDOM_BYTES];
    getrandom::fill(&mut random).context("secure Crumb instance identifier generation failed")?;
    let mut encoded = String::with_capacity(INSTANCE_ID_PREFIX.len() + INSTANCE_ID_HEX_BYTES);
    encoded.push_str(INSTANCE_ID_PREFIX);
    for byte in random {
        use std::fmt::Write as _;
        write!(&mut encoded, "{byte:02x}").expect("writing to a String cannot fail");
    }
    Ok(encoded)
}

fn now_ms() -> Result<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system clock is before the Unix epoch")?
        .as_millis();
    u64::try_from(millis).context("system timestamp exceeds the supported range")
}

fn write_instance(
    file: &mut tempfile::NamedTempFile,
    instance: &InstanceMetadata,
) -> std::io::Result<()> {
    let mut encoded = serde_json::to_vec_pretty(instance).map_err(std::io::Error::other)?;
    encoded.push(b'\n');
    if encoded.len() > MAX_INSTANCE_METADATA_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Crumb instance metadata exceeds the byte limit",
        ));
    }
    set_private_file_permissions(file.as_file())?;
    file.write_all(&encoded)?;
    file.as_file_mut().sync_all()
}

#[cfg(unix)]
fn create_private_directory(path: &Path) -> Result<()> {
    use std::os::unix::fs::DirBuilderExt as _;

    let mut builder = fs::DirBuilder::new();
    builder.mode(0o700);
    match builder.create(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(path)?;
            if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
                bail!("workspace .crumb path must be a directory, not a symlink");
            }
            Ok(())
        }
        Err(error) => Err(error).context("workspace .crumb directory could not be created"),
    }
}

#[cfg(not(unix))]
fn create_private_directory(path: &Path) -> Result<()> {
    match fs::create_dir(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(path)?;
            if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
                bail!("workspace .crumb path must be a directory, not a symlink");
            }
            Ok(())
        }
        Err(error) => Err(error).context("workspace .crumb directory could not be created"),
    }
}

#[cfg(unix)]
fn set_private_file_permissions(file: &File) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt as _;

    file.set_permissions(fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn set_private_file_permissions(_file: &File) -> std::io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn sync_parent(parent: &Path) -> std::io::Result<()> {
    File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent(_parent: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use serde_json::json;
    use tempfile::TempDir;

    use super::{
        INSTANCE_SCHEMA_VERSION, InstanceStore, MAX_INSTANCE_METADATA_BYTES, WorkspaceLayout,
        validate_instance_name,
    };

    #[test]
    fn creation_is_stable_and_contains_only_relative_layout_paths() {
        let temporary = TempDir::new().expect("temporary workspace");
        let workspace = temporary.path().join("friendly-project");
        fs::create_dir(&workspace).expect("workspace");
        let store = InstanceStore::for_workspace(&workspace);

        let first = store.load_or_create().expect("create metadata");
        let second = store.load_or_create().expect("load metadata");

        assert_eq!(first, second);
        assert_eq!(first.schema_version, INSTANCE_SCHEMA_VERSION);
        assert_eq!(first.name, "friendly-project");
        assert!(first.instance_id.starts_with("crumb_"));
        assert_eq!(first.layout, WorkspaceLayout::default());
        let encoded = fs::read_to_string(store.path()).expect("metadata");
        assert!(!encoded.contains(workspace.to_string_lossy().as_ref()));
        assert!(!encoded.contains("chat"));
        assert!(!encoded.contains("toolOutput"));
    }

    #[test]
    fn rename_preserves_stable_identity_and_creation_time() {
        let temporary = TempDir::new().expect("temporary workspace");
        let store = InstanceStore::for_workspace(temporary.path());
        let original = store
            .load_or_create_named("Builder One")
            .expect("create metadata");

        let renamed = store.rename("Builder Two").expect("rename metadata");
        let loaded = store.load().expect("load renamed metadata");

        assert_eq!(renamed, loaded);
        assert_eq!(loaded.name, "Builder Two");
        assert_eq!(loaded.instance_id, original.instance_id);
        assert_eq!(loaded.created_at_ms, original.created_at_ms);
        assert!(loaded.updated_at_ms >= original.updated_at_ms);
    }

    #[test]
    fn invalid_existing_metadata_is_never_replaced() {
        let temporary = TempDir::new().expect("temporary workspace");
        let store = InstanceStore::for_workspace(temporary.path());
        fs::create_dir(store.crumb_root()).expect("crumb root");
        fs::write(store.path(), b"{ definitely not JSON\n").expect("corrupt metadata");

        assert!(store.load_or_create_named("Safe Name").is_err());
        assert_eq!(
            fs::read(store.path()).expect("metadata remains"),
            b"{ definitely not JSON\n"
        );
    }

    #[test]
    fn oversized_and_unknown_metadata_are_rejected() {
        let temporary = TempDir::new().expect("temporary workspace");
        let store = InstanceStore::for_workspace(temporary.path());
        fs::create_dir(store.crumb_root()).expect("crumb root");
        fs::write(store.path(), vec![b'x'; MAX_INSTANCE_METADATA_BYTES + 1])
            .expect("oversized metadata");
        assert!(store.load().is_err());

        fs::write(
            store.path(),
            serde_json::to_vec(&json!({
                "schemaVersion": 1,
                "instanceId": "crumb_00000000000000000000000000000000",
                "name": "Crumb",
                "createdAtMs": 1,
                "updatedAtMs": 1,
                "layout": WorkspaceLayout::default(),
                "secret": "must not be accepted"
            }))
            .expect("JSON"),
        )
        .expect("unknown metadata");
        assert!(store.load().is_err());
    }

    #[test]
    fn names_and_layout_paths_reject_traversal() {
        for invalid in [
            "",
            " ",
            ".",
            "..",
            "../peer",
            "peer/name",
            "peer\\name",
            "peer\nname",
        ] {
            assert!(
                validate_instance_name(invalid).is_err(),
                "accepted {invalid:?}"
            );
        }
        assert!(validate_instance_name("Workbench 🦀").is_ok());

        let layout = WorkspaceLayout {
            a2a: PathBuf::from("../outside"),
            ..WorkspaceLayout::default()
        };
        assert!(layout.validate().is_err());
    }

    #[cfg(unix)]
    #[test]
    fn generated_metadata_is_private_and_symlinks_are_refused() {
        use std::os::unix::fs::{PermissionsExt as _, symlink};

        let temporary = TempDir::new().expect("temporary workspace");
        let store = InstanceStore::for_workspace(temporary.path());
        store.load_or_create_named("Private").expect("metadata");
        let mode = fs::metadata(store.path())
            .expect("metadata mode")
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);

        fs::remove_file(store.path()).expect("remove metadata");
        let target = temporary.path().join("attacker.json");
        fs::write(&target, b"{}\n").expect("target");
        symlink(&target, store.path()).expect("metadata symlink");
        assert!(store.load().is_err());
        assert!(store.load_or_create_named("Private").is_err());
        assert_eq!(fs::read(&target).expect("target unchanged"), b"{}\n");
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_crumb_root_is_refused() {
        use std::os::unix::fs::symlink;

        let temporary = TempDir::new().expect("temporary workspace");
        let workspace = temporary.path().join("workspace");
        let elsewhere = temporary.path().join("elsewhere");
        fs::create_dir(&workspace).expect("workspace");
        fs::create_dir(&elsewhere).expect("elsewhere");
        symlink(&elsewhere, workspace.join(".crumb")).expect("crumb symlink");

        let store = InstanceStore::for_workspace(&workspace);
        assert!(store.load_or_create_named("Unsafe").is_err());
        assert!(!elsewhere.join("instance.json").exists());
    }
}
