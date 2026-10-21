//! Provider-neutral coding-backend selection and lazy executable discovery.

use std::env;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Explicitly selected coding-agent CLI adapter.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CodingBackend {
    Codex,
    Claude,
}

/// Read-only result of resolving one configured backend executable.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BackendDiscovery {
    pub backend: CodingBackend,
    pub configured_command: PathBuf,
    pub executable: Option<PathBuf>,
}

impl BackendDiscovery {
    /// Resolves a configured command from the current process path without
    /// starting the CLI or performing network activity.
    #[must_use]
    pub fn discover(backend: CodingBackend, command: &Path) -> Self {
        Self {
            backend,
            configured_command: command.to_path_buf(),
            executable: resolve_executable(command),
        }
    }

    #[must_use]
    pub fn is_available(&self) -> bool {
        self.executable.is_some()
    }
}

fn resolve_executable(command: &Path) -> Option<PathBuf> {
    if command.components().count() > 1 || command.is_absolute() {
        return command.is_file().then(|| command.to_path_buf());
    }
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .flat_map(|directory| executable_candidates(&directory, command))
        .find(|candidate| candidate.is_file())
}

fn executable_candidates(directory: &Path, command: &Path) -> Vec<PathBuf> {
    let direct = directory.join(command);
    #[cfg(windows)]
    {
        let mut candidates = vec![direct.clone()];
        if direct.extension().is_none() {
            let extensions = env::var_os("PATHEXT").unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".into());
            candidates.extend(
                extensions
                    .to_string_lossy()
                    .split(';')
                    .filter(|extension| !extension.is_empty())
                    .map(|extension| direct.with_extension(extension.trim_start_matches('.'))),
            );
        }
        candidates
    }
    #[cfg(not(windows))]
    {
        vec![direct]
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{BackendDiscovery, CodingBackend};

    #[test]
    fn missing_backend_is_reported_without_becoming_an_error() {
        let discovery = BackendDiscovery::discover(
            CodingBackend::Claude,
            Path::new("crumb-definitely-missing-backend"),
        );
        assert!(!discovery.is_available());
        assert!(discovery.executable.is_none());
    }
}
