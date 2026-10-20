//! Read-only manifest scanner exposed as the `detect_stack` agent tool.
//!
//! Detects project language(s), package manager, and build/test tooling
//! from repo manifests. Detection and its process-local cache never write to
//! the scanned workspace.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::bounded_text;

const DETECT_STACK: &str = "detect_stack";
const MAX_SCANNED_SUBDIRECTORIES: usize = 64;

const IGNORED_SUBDIRS: &[&str] = &[
    "node_modules",
    "target",
    ".git",
    "vendor",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".crumb",
];

/// Runtime ceiling for the `detect_stack` tool's textual output.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StackDetectionLimits {
    pub max_output_bytes: usize,
}

/// Confidence that a given ecosystem was correctly identified.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StackConfidence {
    /// Manifest found at the workspace root.
    High,
    /// Manifest found one level down (monorepo subpackage).
    Medium,
}

/// A single detected ecosystem (language + tooling) within the workspace.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LanguageDetection {
    pub language: String,
    pub manifest_files: Vec<String>,
    pub package_manager: Option<String>,
    pub build_tools: Vec<String>,
    pub test_tools: Vec<String>,
    pub confidence: StackConfidence,
}

/// Full result of a `detect_stack` scan.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct DetectedStack {
    pub languages: Vec<LanguageDetection>,
    pub scanned_at_unix: u64,
    pub cache_hit: bool,
}

/// Registers the read-only `detect_stack` tool rooted at one canonical
/// workspace.
///
/// # Errors
///
/// Returns an error when the workspace is unavailable, the output limit is
/// zero, or the tool name is already registered.
pub fn register_stack_detection_tool(
    host: &mut ToolHost,
    workspace: &Path,
    limits: StackDetectionLimits,
) -> Result<()> {
    if limits.max_output_bytes == 0 {
        bail!("stack detection output limit must be positive");
    }
    let root = fs::canonicalize(workspace)
        .with_context(|| format!("failed to resolve workspace `{}`", workspace.display()))?;
    if !root.is_dir() {
        bail!("workspace root must be a directory");
    }
    host.register(
        descriptor(),
        Arc::new(DetectStack {
            root,
            limits,
            cache: Mutex::new(None),
        }),
    )
}

struct DetectStack {
    root: PathBuf,
    limits: StackDetectionLimits,
    cache: Mutex<Option<CacheFile>>,
}

impl ToolHandler for DetectStack {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        Ok(match detect_stack(self, arguments, cancellation) {
            Ok(output) => output,
            Err(error) => ToolOutput::error(error.to_string()),
        })
    }
}

fn detect_stack(
    tool: &DetectStack,
    arguments: &Value,
    cancellation: &CancellationToken,
) -> Result<ToolOutput> {
    ensure_active(cancellation)?;
    let refresh = optional_bool(arguments, "refresh")?.unwrap_or(false);

    let fingerprint = fingerprint(&tool.root);
    ensure_active(cancellation)?;

    if !refresh {
        let cache = tool
            .cache
            .lock()
            .map_err(|_| anyhow::anyhow!("stack detection cache is unavailable"))?;
        if let Some(cached) = cache.as_ref()
            && cached.fingerprint == fingerprint
        {
            let mut result = cached.result.clone();
            result.cache_hit = true;
            return Ok(tool_output(&result, tool.limits.max_output_bytes));
        }
    }

    let languages = scan(&tool.root);
    ensure_active(cancellation)?;

    let result = DetectedStack {
        languages,
        scanned_at_unix: now_unix(),
        cache_hit: false,
    };

    *tool
        .cache
        .lock()
        .map_err(|_| anyhow::anyhow!("stack detection cache is unavailable"))? = Some(CacheFile {
        fingerprint,
        result: result.clone(),
    });

    Ok(tool_output(&result, tool.limits.max_output_bytes))
}

fn tool_output(result: &DetectedStack, max_output_bytes: usize) -> ToolOutput {
    let mut summary = if result.languages.is_empty() {
        "no known stack detected".to_owned()
    } else {
        let mut lines: Vec<String> = result
            .languages
            .iter()
            .map(|language| {
                let package_manager = language.package_manager.as_deref().unwrap_or("none");
                format!(
                    "{} [{:?}] package_manager={package_manager}",
                    language.language, language.confidence
                )
            })
            .collect();
        lines.sort();
        lines.join("\n")
    };
    if result.cache_hit {
        summary.push_str("\n(from cache)");
    }
    ToolOutput {
        text: bounded_text(summary, max_output_bytes),
        structured: serde_json::to_value(result).ok(),
        is_error: false,
    }
}

fn scan(root: &Path) -> Vec<LanguageDetection> {
    let mut found: Vec<LanguageDetection> = Vec::new();

    for scanner in scanners() {
        if let Some(detection) = scanner(root, "") {
            found.push(detection);
        }
    }

    let Ok(read) = fs::read_dir(root) else {
        return found;
    };
    for entry in read.flatten().take(MAX_SCANNED_SUBDIRECTORIES) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().into_owned();
        if IGNORED_SUBDIRS.contains(&dir_name.as_str()) {
            continue;
        }
        for scanner in scanners() {
            if let Some(mut detection) = scanner(&path, &dir_name) {
                if found.iter().any(|f| f.language == detection.language) {
                    continue;
                }
                detection.confidence = StackConfidence::Medium;
                found.push(detection);
            }
        }
    }

    found
}

type Scanner = fn(&Path, &str) -> Option<LanguageDetection>;

fn scanners() -> [Scanner; 8] {
    [
        scan_node,
        scan_python,
        scan_rust,
        scan_go,
        scan_java_maven,
        scan_java_gradle,
        scan_ruby,
        scan_php,
    ]
}

fn exists(dir: &Path, name: &str) -> bool {
    dir.join(name).is_file()
}

fn present(dir: &Path, label: &str, candidates: &[&str]) -> Vec<String> {
    candidates
        .iter()
        .filter(|candidate| exists(dir, candidate))
        .map(|candidate| labeled(label, candidate))
        .collect()
}

fn labeled(label: &str, name: &str) -> String {
    if label.is_empty() {
        name.to_owned()
    } else {
        format!("{label}/{name}")
    }
}

fn scan_node(dir: &Path, label: &str) -> Option<LanguageDetection> {
    if !exists(dir, "package.json") {
        return None;
    }
    let candidates = [
        "package.json",
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "bun.lockb",
    ];
    let package_manager = if exists(dir, "pnpm-lock.yaml") {
        "pnpm"
    } else if exists(dir, "yarn.lock") {
        "yarn"
    } else if exists(dir, "bun.lockb") {
        "bun"
    } else {
        "npm"
    };

    let mut build_tools = Vec::new();
    let mut test_tools = Vec::new();
    if let Ok(contents) = fs::read_to_string(dir.join("package.json"))
        && let Ok(manifest) = serde_json::from_str::<Value>(&contents)
    {
        let has_dependency = |name: &str| {
            ["dependencies", "devDependencies"].iter().any(|section| {
                manifest
                    .get(section)
                    .and_then(|deps| deps.get(name))
                    .is_some()
            })
        };
        for (dependency, tool) in [("vite", "vite"), ("webpack", "webpack"), ("next", "next")] {
            if has_dependency(dependency) {
                build_tools.push(tool.to_owned());
            }
        }
        for (dependency, tool) in [("jest", "jest"), ("vitest", "vitest"), ("mocha", "mocha")] {
            if has_dependency(dependency) {
                test_tools.push(tool.to_owned());
            }
        }
    }

    Some(LanguageDetection {
        language: "JavaScript/TypeScript (Node.js)".to_owned(),
        manifest_files: present(dir, label, &candidates),
        package_manager: Some(package_manager.to_owned()),
        build_tools,
        test_tools,
        confidence: StackConfidence::High,
    })
}

fn scan_python(dir: &Path, label: &str) -> Option<LanguageDetection> {
    let candidates = [
        "pyproject.toml",
        "requirements.txt",
        "setup.py",
        "setup.cfg",
        "Pipfile",
        "Pipfile.lock",
        "poetry.lock",
        "uv.lock",
    ];
    let found = present(dir, label, &candidates);
    if found.is_empty() {
        return None;
    }
    let package_manager = if exists(dir, "poetry.lock") {
        "poetry"
    } else if exists(dir, "uv.lock") {
        "uv"
    } else if exists(dir, "Pipfile") {
        "pipenv"
    } else {
        "pip"
    };
    let mut test_tools = Vec::new();
    if exists(dir, "pytest.ini") || exists(dir, "tox.ini") {
        test_tools.push("pytest".to_owned());
    }
    Some(LanguageDetection {
        language: "Python".to_owned(),
        manifest_files: found,
        package_manager: Some(package_manager.to_owned()),
        build_tools: Vec::new(),
        test_tools,
        confidence: StackConfidence::High,
    })
}

fn scan_rust(dir: &Path, label: &str) -> Option<LanguageDetection> {
    if !exists(dir, "Cargo.toml") {
        return None;
    }
    Some(LanguageDetection {
        language: "Rust".to_owned(),
        manifest_files: present(dir, label, &["Cargo.toml", "Cargo.lock"]),
        package_manager: Some("cargo".to_owned()),
        build_tools: vec!["cargo build".to_owned()],
        test_tools: vec!["cargo test".to_owned()],
        confidence: StackConfidence::High,
    })
}

fn scan_go(dir: &Path, label: &str) -> Option<LanguageDetection> {
    if !exists(dir, "go.mod") {
        return None;
    }
    Some(LanguageDetection {
        language: "Go".to_owned(),
        manifest_files: present(dir, label, &["go.mod", "go.sum"]),
        package_manager: Some("go modules".to_owned()),
        build_tools: vec!["go build".to_owned()],
        test_tools: vec!["go test".to_owned()],
        confidence: StackConfidence::High,
    })
}

fn scan_java_maven(dir: &Path, label: &str) -> Option<LanguageDetection> {
    if !exists(dir, "pom.xml") {
        return None;
    }
    Some(LanguageDetection {
        language: "Java (Maven)".to_owned(),
        manifest_files: present(dir, label, &["pom.xml"]),
        package_manager: Some("maven".to_owned()),
        build_tools: vec!["mvn package".to_owned()],
        test_tools: vec!["mvn test".to_owned()],
        confidence: StackConfidence::High,
    })
}

fn scan_java_gradle(dir: &Path, label: &str) -> Option<LanguageDetection> {
    let candidates = [
        "build.gradle",
        "build.gradle.kts",
        "settings.gradle",
        "settings.gradle.kts",
    ];
    let found = present(dir, label, &candidates);
    if found.is_empty() {
        return None;
    }
    let wrapper = if exists(dir, "gradlew") {
        "./gradlew"
    } else {
        "gradle"
    };
    Some(LanguageDetection {
        language: "Java/Kotlin (Gradle)".to_owned(),
        manifest_files: found,
        package_manager: Some("gradle".to_owned()),
        build_tools: vec![format!("{wrapper} build")],
        test_tools: vec![format!("{wrapper} test")],
        confidence: StackConfidence::High,
    })
}

fn scan_ruby(dir: &Path, label: &str) -> Option<LanguageDetection> {
    if !exists(dir, "Gemfile") {
        return None;
    }
    let mut test_tools = Vec::new();
    if dir.join("spec").is_dir() {
        test_tools.push("rspec".to_owned());
    }
    Some(LanguageDetection {
        language: "Ruby".to_owned(),
        manifest_files: present(dir, label, &["Gemfile", "Gemfile.lock"]),
        package_manager: Some("bundler".to_owned()),
        build_tools: Vec::new(),
        test_tools,
        confidence: StackConfidence::High,
    })
}

fn scan_php(dir: &Path, label: &str) -> Option<LanguageDetection> {
    if !exists(dir, "composer.json") {
        return None;
    }
    let mut test_tools = Vec::new();
    if exists(dir, "phpunit.xml") || exists(dir, "phpunit.xml.dist") {
        test_tools.push("phpunit".to_owned());
    }
    Some(LanguageDetection {
        language: "PHP".to_owned(),
        manifest_files: present(dir, label, &["composer.json", "composer.lock"]),
        package_manager: Some("composer".to_owned()),
        build_tools: Vec::new(),
        test_tools,
        confidence: StackConfidence::High,
    })
}

fn all_manifest_candidates() -> &'static [&'static str] {
    &[
        "package.json",
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "bun.lockb",
        "pyproject.toml",
        "requirements.txt",
        "setup.py",
        "setup.cfg",
        "Pipfile",
        "Pipfile.lock",
        "poetry.lock",
        "uv.lock",
        "Cargo.toml",
        "Cargo.lock",
        "go.mod",
        "go.sum",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "settings.gradle",
        "settings.gradle.kts",
        "Gemfile",
        "Gemfile.lock",
        "composer.json",
        "composer.lock",
    ]
}

fn fingerprint(root: &Path) -> String {
    let mut entries: Vec<String> = Vec::new();
    fingerprint_dir(root, "", &mut entries);

    if let Ok(read) = fs::read_dir(root) {
        for entry in read.flatten().take(MAX_SCANNED_SUBDIRECTORIES) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().into_owned();
            if IGNORED_SUBDIRS.contains(&dir_name.as_str()) {
                continue;
            }
            fingerprint_dir(&path, &dir_name, &mut entries);
        }
    }

    entries.sort();
    let mut hasher = Sha256::new();
    for entry in &entries {
        hasher.update(entry.as_bytes());
        hasher.update(b"\n");
    }
    format!("{:x}", hasher.finalize())
}

fn fingerprint_dir(dir: &Path, label: &str, out: &mut Vec<String>) {
    for name in all_manifest_candidates() {
        let path = dir.join(name);
        if let Ok(metadata) = fs::metadata(&path) {
            let modified = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |duration| duration.as_secs());
            out.push(format!("{label}/{name}:{}:{modified}", metadata.len()));
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
struct CacheFile {
    fingerprint: String,
    result: DetectedStack,
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

fn ensure_active(cancellation: &CancellationToken) -> Result<()> {
    if cancellation.is_cancelled() {
        bail!("tool call cancelled");
    }
    Ok(())
}

fn optional_bool(arguments: &Value, name: &str) -> Result<Option<bool>> {
    match arguments.get(name) {
        None => Ok(None),
        Some(value) => value
            .as_bool()
            .map(Some)
            .with_context(|| format!("{name} must be a boolean")),
    }
}

fn descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: DETECT_STACK.to_owned(),
        description: "Detect project language(s), package manager, and build/test tooling from repo manifests. Read-only; cached only for this process.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "refresh": {
                    "type": "boolean",
                    "description": "Bypass the cache and force a fresh scan."
                }
            },
            "additionalProperties": false
        }),
        risk: RiskClass::ReadOnly,
        transport: ToolTransport::Native,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    use crumb_agent::{AgentMode, CancellationToken, DenyAllApprovals, ToolHost};
    use serde_json::json;

    use super::{StackDetectionLimits, register_stack_detection_tool};

    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

    struct TempWorkspace(PathBuf);

    impl TempWorkspace {
        fn new() -> Self {
            let sequence = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "crumb-stack-detection-{}-{sequence}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("temporary workspace is created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn host(workspace: &Path) -> ToolHost {
        let mut host = ToolHost::default();
        register_stack_detection_tool(
            &mut host,
            workspace,
            StackDetectionLimits {
                max_output_bytes: 4096,
            },
        )
        .expect("stack detection tool is registered");
        host
    }

    fn call(host: &ToolHost, arguments: &serde_json::Value) -> crumb_agent::ToolOutput {
        host.call(
            "detect_stack",
            arguments,
            AgentMode::Auto,
            &DenyAllApprovals,
            &CancellationToken::default(),
        )
        .expect("read-only call is authorized without approval")
    }

    #[test]
    fn detects_rust_project_without_approval() {
        let workspace = TempWorkspace::new();
        fs::write(
            workspace.path().join("Cargo.toml"),
            "[package]\nname=\"x\"\n",
        )
        .expect("fixture is written");

        let output = call(&host(workspace.path()), &json!({}));
        assert!(!output.is_error);
        assert!(output.text.contains("Rust"));
        assert!(output.text.contains("cargo"));
    }

    #[test]
    fn detects_polyglot_monorepo_with_confidence_split() {
        let workspace = TempWorkspace::new();
        fs::write(workspace.path().join("package.json"), "{}").expect("fixture is written");
        let sub = workspace.path().join("api");
        fs::create_dir(&sub).expect("subdir is created");
        fs::write(sub.join("pyproject.toml"), "").expect("fixture is written");

        let output = call(&host(workspace.path()), &json!({}));
        assert!(!output.is_error);
        assert!(output.text.contains("Node.js"));
        assert!(output.text.contains("Python"));

        let structured = output.structured.expect("structured payload is present");
        let languages = structured["languages"].as_array().expect("languages array");
        let python = languages
            .iter()
            .find(|entry| entry["language"] == "Python")
            .expect("python detection present");
        assert_eq!(python["confidence"], "medium");
    }

    #[test]
    fn empty_workspace_detects_nothing() {
        let workspace = TempWorkspace::new();
        let output = call(&host(workspace.path()), &json!({}));
        assert!(!output.is_error);
        assert!(output.text.contains("no known stack detected"));
    }

    #[test]
    fn cache_is_reused_without_writing_to_the_workspace() {
        let workspace = TempWorkspace::new();
        fs::write(workspace.path().join("Cargo.toml"), "").expect("fixture is written");
        let bound_host = host(workspace.path());

        let first = call(&bound_host, &json!({}));
        assert!(!first.text.contains("from cache"));

        let second = call(&bound_host, &json!({}));
        assert!(second.text.contains("from cache"));

        assert!(!workspace.path().join(".crumb").exists());
    }

    #[test]
    fn refresh_argument_bypasses_the_cache() {
        let workspace = TempWorkspace::new();
        fs::write(workspace.path().join("Cargo.toml"), "").expect("fixture is written");
        let bound_host = host(workspace.path());

        call(&bound_host, &json!({}));
        let refreshed = call(&bound_host, &json!({"refresh": true}));
        assert!(!refreshed.text.contains("from cache"));
    }

    #[test]
    fn cancellation_stops_before_any_scan() {
        let workspace = TempWorkspace::new();
        let cancellation = CancellationToken::default();
        cancellation.cancel();
        let error = host(workspace.path())
            .call(
                "detect_stack",
                &json!({}),
                AgentMode::Auto,
                &DenyAllApprovals,
                &cancellation,
            )
            .expect_err("cancelled calls do not reach the handler");
        assert_eq!(error.kind, crumb_agent::ToolCallErrorKind::Cancelled);
    }
}
