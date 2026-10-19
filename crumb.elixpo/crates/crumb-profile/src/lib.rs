//! Versioned, portable, permission-neutral Crumb persona profiles.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use directories::BaseDirs;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tempfile::Builder;

const PROFILE_VERSION: u32 = 1;
const SELECTION_VERSION: u32 = 1;
const MAX_PROFILE_BYTES: usize = 64 * 1024;
const MAX_PROFILES: usize = 128;
const MAX_ID_BYTES: usize = 64;
const MAX_LABEL_BYTES: usize = 128;
const MAX_INSTRUCTIONS_BYTES: usize = 16 * 1024;
const MAX_REFERENCES: usize = 64;
const MAX_EXTRA_FIELDS: usize = 32;

/// A named skill or connector reference. References never carry credentials.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ProfileReference {
    pub id: String,
    #[serde(default)]
    pub enabled: bool,
}

/// Which approved memory scopes and tags a profile prefers during retrieval.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ProfileMemoryPolicy {
    #[serde(default = "enabled")]
    pub include_user: bool,
    #[serde(default = "enabled")]
    pub include_project: bool,
    #[serde(default)]
    pub tags: Vec<String>,
}

impl Default for ProfileMemoryPolicy {
    fn default() -> Self {
        Self {
            include_user: true,
            include_project: true,
            tags: Vec::new(),
        }
    }
}

/// Portable persona preferences. None of these fields grant permissions.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProfileDocument {
    pub version: u32,
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub instructions: String,
    #[serde(default)]
    pub response_style: Option<String>,
    #[serde(default)]
    pub preferred_models: BTreeMap<String, String>,
    #[serde(default)]
    pub effort: Option<String>,
    #[serde(default)]
    pub skills: Vec<ProfileReference>,
    #[serde(default)]
    pub connectors: Vec<ProfileReference>,
    #[serde(default)]
    pub memory: ProfileMemoryPolicy,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl ProfileDocument {
    /// Creates an empty profile with safe defaults.
    ///
    /// # Errors
    ///
    /// Returns an error when the ID or label is invalid.
    pub fn new(id: impl Into<String>, label: impl Into<String>) -> Result<Self> {
        let profile = Self {
            version: PROFILE_VERSION,
            id: id.into(),
            label: label.into(),
            instructions: String::new(),
            response_style: None,
            preferred_models: BTreeMap::new(),
            effort: None,
            skills: Vec::new(),
            connectors: Vec::new(),
            memory: ProfileMemoryPolicy::default(),
            extra: BTreeMap::new(),
        };
        validate_profile(&profile)?;
        Ok(profile)
    }
}

/// Private user-wide profile collection.
#[derive(Clone, Debug)]
pub struct ProfileStore {
    root: PathBuf,
}

/// Project-local selection of a user-wide profile.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ProfileSelection {
    pub version: u32,
    pub profile_id: Option<String>,
}

/// Atomic project selection storage.
#[derive(Clone, Debug)]
pub struct ProfileSelectionStore {
    path: PathBuf,
}

impl ProfileStore {
    /// Uses `~/.crumb/profiles` for the current user.
    ///
    /// # Errors
    ///
    /// Returns an error when the home directory is unavailable.
    pub fn discover() -> Result<Self> {
        let root = BaseDirs::new()
            .context("home directory is unavailable")?
            .home_dir()
            .join(".crumb/profiles");
        Ok(Self::new(root))
    }

    #[must_use]
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Lists profile IDs in deterministic order.
    ///
    /// # Errors
    ///
    /// Returns an error when storage is unreadable or contains too many profiles.
    pub fn list(&self) -> Result<Vec<String>> {
        if !self.root.exists() {
            return Ok(Vec::new());
        }
        let mut ids = Vec::new();
        for entry in fs::read_dir(&self.root)? {
            let path = entry?.path();
            if path.extension().and_then(|value| value.to_str()) == Some("json")
                && let Some(id) = path.file_stem().and_then(|value| value.to_str())
            {
                validate_id(id)?;
                ids.push(id.to_owned());
            }
        }
        if ids.len() > MAX_PROFILES {
            bail!("profile store exceeds the {MAX_PROFILES} profile limit");
        }
        ids.sort();
        Ok(ids)
    }

    /// Loads and validates one profile.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid ID or malformed, oversized, or future storage.
    pub fn load(&self, id: &str) -> Result<ProfileDocument> {
        validate_id(id)?;
        let path = self.path_for(id);
        let metadata =
            fs::symlink_metadata(&path).with_context(|| format!("profile `{id}` was not found"))?;
        if !metadata.file_type().is_file() || metadata.len() > MAX_PROFILE_BYTES as u64 {
            bail!("profile must be a bounded regular file");
        }
        let contents = fs::read_to_string(&path)?;
        let profile: ProfileDocument =
            serde_json::from_str(&contents).context("profile is malformed")?;
        validate_profile(&profile)?;
        if profile.id != id {
            bail!("profile ID does not match its file name");
        }
        Ok(profile)
    }

    /// Creates a profile only when the ID is unused.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid data, duplicates, limits, or failed persistence.
    pub fn create(&self, profile: &ProfileDocument) -> Result<()> {
        validate_profile(profile)?;
        if self.path_for(&profile.id).exists() {
            bail!("profile `{}` already exists", profile.id);
        }
        if self.list()?.len() >= MAX_PROFILES {
            bail!("profile store reached the {MAX_PROFILES} profile limit");
        }
        self.write(profile)
    }

    /// Clones a profile under a new ID and label.
    ///
    /// # Errors
    ///
    /// Returns an error when either profile is invalid or persistence fails.
    pub fn clone_profile(&self, source: &str, id: &str, label: &str) -> Result<ProfileDocument> {
        let mut profile = self.load(source)?;
        id.clone_into(&mut profile.id);
        label.clone_into(&mut profile.label);
        self.create(&profile)?;
        Ok(profile)
    }

    /// Renames a profile with rollback if removal of the old file fails.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid IDs, duplicates, or failed persistence.
    pub fn rename(&self, source: &str, id: &str) -> Result<ProfileDocument> {
        let mut profile = self.load(source)?;
        id.clone_into(&mut profile.id);
        self.create(&profile)?;
        if let Err(error) = fs::remove_file(self.path_for(source)) {
            let _ = fs::remove_file(self.path_for(id));
            return Err(error).context("failed to remove the old profile during rename");
        }
        Ok(profile)
    }

    /// Exports one validated profile as portable pretty JSON.
    ///
    /// # Errors
    ///
    /// Returns an error when the profile cannot be loaded or serialized.
    pub fn export(&self, id: &str) -> Result<String> {
        Ok(serde_json::to_string_pretty(&self.load(id)?)?)
    }

    /// Imports a profile. External references always start disabled.
    ///
    /// # Errors
    ///
    /// Returns an error for malformed, unsafe, oversized, or duplicate profiles.
    pub fn import(&self, contents: &str) -> Result<ProfileDocument> {
        if contents.len() > MAX_PROFILE_BYTES {
            bail!("profile exceeds the {MAX_PROFILE_BYTES} byte limit");
        }
        let mut profile: ProfileDocument =
            serde_json::from_str(contents).context("profile import is malformed")?;
        for reference in profile.skills.iter_mut().chain(&mut profile.connectors) {
            reference.enabled = false;
        }
        self.create(&profile)?;
        Ok(profile)
    }

    /// Deletes one profile explicitly.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid or missing ID or failed removal.
    pub fn delete(&self, id: &str) -> Result<()> {
        validate_id(id)?;
        fs::remove_file(self.path_for(id))
            .with_context(|| format!("profile `{id}` was not found"))?;
        Ok(())
    }

    fn path_for(&self, id: &str) -> PathBuf {
        self.root.join(format!("{id}.json"))
    }

    fn write(&self, profile: &ProfileDocument) -> Result<()> {
        let contents = serde_json::to_string_pretty(profile)?;
        if contents.len() > MAX_PROFILE_BYTES {
            bail!("profile exceeds the {MAX_PROFILE_BYTES} byte limit");
        }
        fs::create_dir_all(&self.root)?;
        let mut temporary = Builder::new().prefix(".profile-").tempfile_in(&self.root)?;
        temporary.write_all(contents.as_bytes())?;
        temporary.as_file_mut().sync_all()?;
        temporary
            .persist(self.path_for(&profile.id))
            .map_err(|error| error.error)?;
        Ok(())
    }
}

impl ProfileSelectionStore {
    #[must_use]
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    #[must_use]
    pub fn for_project(project_root: &Path) -> Self {
        Self::new(project_root.join(".crumb/profile.json"))
    }

    /// Loads the selection. Missing storage means no selected profile.
    ///
    /// # Errors
    ///
    /// Returns an error for malformed, oversized, or future storage.
    pub fn load(&self) -> Result<ProfileSelection> {
        if !self.path.exists() {
            return Ok(ProfileSelection {
                version: SELECTION_VERSION,
                profile_id: None,
            });
        }
        let contents = fs::read_to_string(&self.path)?;
        if contents.len() > 1024 {
            bail!("profile selection is oversized");
        }
        let selection: ProfileSelection =
            serde_json::from_str(&contents).context("profile selection is malformed")?;
        validate_selection(&selection)?;
        Ok(selection)
    }

    /// Atomically selects or clears a project profile.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid ID or failed persistence.
    pub fn select(&self, profile_id: Option<&str>) -> Result<ProfileSelection> {
        if let Some(id) = profile_id {
            validate_id(id)?;
        }
        let selection = ProfileSelection {
            version: SELECTION_VERSION,
            profile_id: profile_id.map(str::to_owned),
        };
        let contents = serde_json::to_string_pretty(&selection)?;
        let parent = self
            .path
            .parent()
            .context("profile selection path has no parent")?;
        fs::create_dir_all(parent)?;
        let mut temporary = Builder::new()
            .prefix(".profile-selection-")
            .tempfile_in(parent)?;
        temporary.write_all(contents.as_bytes())?;
        temporary.as_file_mut().sync_all()?;
        temporary.persist(&self.path).map_err(|error| error.error)?;
        Ok(selection)
    }
}

const fn enabled() -> bool {
    true
}

fn validate_selection(selection: &ProfileSelection) -> Result<()> {
    if selection.version != SELECTION_VERSION {
        bail!("profile selection version is unsupported");
    }
    if let Some(id) = &selection.profile_id {
        validate_id(id)?;
    }
    Ok(())
}

fn validate_profile(profile: &ProfileDocument) -> Result<()> {
    if profile.version != PROFILE_VERSION {
        bail!("profile version {} is unsupported", profile.version);
    }
    validate_id(&profile.id)?;
    validate_text(&profile.label, MAX_LABEL_BYTES, "profile label")?;
    if profile.instructions.len() > MAX_INSTRUCTIONS_BYTES
        || profile
            .instructions
            .chars()
            .any(|character| character == '\0')
    {
        bail!("profile instructions exceed safe limits");
    }
    if let Some(style) = &profile.response_style {
        validate_text(style, MAX_LABEL_BYTES, "response style")?;
    }
    if let Some(effort) = &profile.effort
        && !["light", "medium", "high", "extra high", "ultra"].contains(&effort.as_str())
    {
        bail!("profile effort is unsupported");
    }
    if profile.preferred_models.len() > MAX_REFERENCES {
        bail!("profile has too many preferred model references");
    }
    for (modality, model) in &profile.preferred_models {
        validate_id(modality)?;
        validate_text(model, MAX_LABEL_BYTES, "preferred model reference")?;
    }
    validate_references(&profile.skills)?;
    validate_references(&profile.connectors)?;
    if profile.memory.tags.len() > MAX_REFERENCES {
        bail!("profile memory policy has too many tags");
    }
    for tag in &profile.memory.tags {
        validate_text(tag, MAX_ID_BYTES, "memory tag")?;
    }
    if profile.extra.len() > MAX_EXTRA_FIELDS {
        bail!("profile has too many extension fields");
    }
    reject_secrets(&serde_json::to_value(profile)?)?;
    Ok(())
}

fn validate_references(references: &[ProfileReference]) -> Result<()> {
    if references.len() > MAX_REFERENCES {
        bail!("profile has too many external references");
    }
    let mut ids = BTreeSet::new();
    for reference in references {
        validate_id(&reference.id)?;
        if !ids.insert(&reference.id) {
            bail!("profile contains duplicate external references");
        }
    }
    Ok(())
}

fn validate_id(id: &str) -> Result<()> {
    if id.is_empty()
        || id.len() > MAX_ID_BYTES
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        bail!(
            "profile IDs must use 1-{MAX_ID_BYTES} lowercase letters, numbers, dashes, or underscores"
        );
    }
    Ok(())
}

fn validate_text(value: &str, maximum: usize, label: &str) -> Result<()> {
    if value.is_empty() || value.len() > maximum || value.chars().any(char::is_control) {
        bail!("{label} must contain 1-{maximum} safe bytes");
    }
    Ok(())
}

fn reject_secrets(value: &Value) -> Result<()> {
    match value {
        Value::Object(fields) => {
            for (key, value) in fields {
                let key = key.to_ascii_lowercase();
                if [
                    "password",
                    "secret",
                    "token",
                    "api_key",
                    "apikey",
                    "credential",
                ]
                .iter()
                .any(|marker| key.contains(marker))
                {
                    bail!("profiles cannot contain credential fields");
                }
                reject_secrets(value)?;
            }
        }
        Value::Array(values) => {
            for value in values {
                reject_secrets(value)?;
            }
        }
        Value::String(value) => {
            let lowercase = value.to_ascii_lowercase();
            if [
                "-----begin private key",
                "authorization: bearer",
                "api_key=",
                "access_token=",
                "client_secret=",
                "password=",
            ]
            .iter()
            .any(|marker| lowercase.contains(marker))
            {
                bail!("profiles cannot contain credentials");
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use tempfile::tempdir;

    use super::{
        MAX_PROFILE_BYTES, PROFILE_VERSION, ProfileDocument, ProfileReference,
        ProfileSelectionStore, ProfileStore,
    };

    #[test]
    fn profile_crud_is_atomic_and_deterministic() {
        let directory = tempdir().expect("profile tempdir");
        let store = ProfileStore::new(directory.path().join("profiles"));
        let mut profile = ProfileDocument::new("reviewer", "Code reviewer").expect("profile");
        profile.instructions = "Review changes carefully.".to_owned();
        store.create(&profile).expect("create");
        assert_eq!(store.list().expect("list"), ["reviewer"]);
        assert_eq!(store.load("reviewer").expect("load"), profile);

        let cloned = store
            .clone_profile("reviewer", "concise", "Concise reviewer")
            .expect("clone");
        assert_eq!(cloned.instructions, profile.instructions);
        let renamed = store.rename("concise", "brief").expect("rename");
        assert_eq!(renamed.id, "brief");
        assert_eq!(store.list().expect("list"), ["brief", "reviewer"]);
        assert!(
            store
                .export("brief")
                .expect("export")
                .contains("Concise reviewer")
        );
        store.delete("brief").expect("delete");
        assert_eq!(store.list().expect("list"), ["reviewer"]);
    }

    #[test]
    fn import_disables_external_references_and_preserves_safe_extensions() {
        let directory = tempdir().expect("profile tempdir");
        let store = ProfileStore::new(directory.path().join("profiles"));
        let mut profile = ProfileDocument::new("builder", "Builder").expect("profile");
        profile.skills.push(ProfileReference {
            id: "code-review".to_owned(),
            enabled: true,
        });
        profile.connectors.push(ProfileReference {
            id: "github".to_owned(),
            enabled: true,
        });
        profile.extra.insert("theme".to_owned(), json!("violet"));

        let imported = store
            .import(&serde_json::to_string(&profile).expect("JSON"))
            .expect("import");
        assert!(!imported.skills[0].enabled);
        assert!(!imported.connectors[0].enabled);
        assert_eq!(imported.extra["theme"], "violet");
        let exported = store.export("builder").expect("export");
        let round_trip: ProfileDocument = serde_json::from_str(&exported).expect("round trip");
        assert_eq!(round_trip.extra["theme"], "violet");
    }

    #[test]
    fn unsafe_or_future_profiles_fail_without_replacing_existing_data() {
        let directory = tempdir().expect("profile tempdir");
        let store = ProfileStore::new(directory.path().join("profiles"));
        let profile = ProfileDocument::new("safe", "Safe profile").expect("profile");
        store.create(&profile).expect("create");

        let mut unsafe_profile = profile.clone();
        unsafe_profile
            .extra
            .insert("api_token".to_owned(), json!("secret-value"));
        assert!(store.create(&unsafe_profile).is_err());
        assert_eq!(store.load("safe").expect("unchanged profile"), profile);

        let mut oversized = profile.clone();
        oversized.instructions = "x".repeat(MAX_PROFILE_BYTES);
        assert!(store.write(&oversized).is_err());
        assert_eq!(store.load("safe").expect("atomic prior profile"), profile);

        let mut future = ProfileDocument::new("future", "Future").expect("profile");
        future.version = PROFILE_VERSION + 1;
        assert!(
            store
                .import(&serde_json::to_string(&future).expect("JSON"))
                .is_err()
        );
        assert!(ProfileDocument::new("../escape", "Bad").is_err());
    }

    #[test]
    fn project_selection_round_trips_and_rejects_future_versions() {
        let directory = tempdir().expect("profile tempdir");
        let path = directory.path().join(".crumb/profile.json");
        let selection = ProfileSelectionStore::new(&path);
        assert_eq!(selection.load().expect("empty selection").profile_id, None);
        selection.select(Some("reviewer")).expect("select");
        assert_eq!(
            selection.load().expect("selection").profile_id.as_deref(),
            Some("reviewer")
        );
        selection.select(None).expect("clear");
        assert_eq!(selection.load().expect("cleared").profile_id, None);

        std::fs::write(path, r#"{"version":2,"profile_id":"reviewer"}"#).expect("future selection");
        assert!(selection.load().is_err());
    }
}
