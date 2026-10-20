//! Provider-neutral, bounded project-graph retrieval with explicit provenance.

use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

mod graphify;

pub use graphify::{
    GRAPHIFY_PINNED_VERSION, GraphSettings, GraphSettingsStore, GraphifyAdapter, GraphifyStatus,
};

pub const GRAPHIFY_SCHEMA_VERSION: u64 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct NativeSearchLimits {
    pub max_files: usize,
    pub max_file_bytes: usize,
    pub max_total_bytes: usize,
    pub max_results: usize,
}

impl Default for NativeSearchLimits {
    fn default() -> Self {
        Self {
            max_files: 5_000,
            max_file_bytes: 1024 * 1024,
            max_total_bytes: 16 * 1024 * 1024,
            max_results: 32,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeSearchHit {
    pub source_file: PathBuf,
    pub source_location: String,
    pub preview: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeSearchEvidence {
    pub hits: Vec<NativeSearchHit>,
    pub scanned_files: usize,
    pub truncated: bool,
}

/// Searches regular UTF-8 workspace files without following symlinks or
/// entering generated, dependency, VCS, or Crumb state directories.
///
/// # Errors
///
/// Returns an error for invalid limits, an invalid query, or an unavailable
/// workspace. Individual unreadable and non-UTF-8 files are skipped.
pub fn native_project_search(
    workspace: &Path,
    query: &str,
    limits: NativeSearchLimits,
) -> Result<NativeSearchEvidence> {
    validate_native_search(query, limits)?;
    let workspace = fs::canonicalize(workspace).context("project workspace is unavailable")?;
    let needle = query.trim().to_lowercase();
    let mut directories = VecDeque::from([workspace.clone()]);
    let mut hits = Vec::new();
    let mut scanned_files = 0_usize;
    let mut scanned_bytes = 0_usize;
    let mut truncated = false;

    'walk: while let Some(directory) = directories.pop_front() {
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };
        let mut entries = entries
            .filter_map(std::result::Result::ok)
            .collect::<Vec<_>>();
        entries.sort_by_key(std::fs::DirEntry::file_name);
        for entry in entries {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                if !ignored_search_directory(&entry.file_name()) {
                    directories.push_back(entry.path());
                }
                continue;
            }
            if !file_type.is_file() {
                continue;
            }
            if scanned_files == limits.max_files {
                truncated = true;
                break 'walk;
            }
            scanned_files += 1;
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            let length = usize::try_from(metadata.len()).unwrap_or(usize::MAX);
            if length > limits.max_file_bytes {
                continue;
            }
            if scanned_bytes.saturating_add(length) > limits.max_total_bytes {
                truncated = true;
                break 'walk;
            }
            scanned_bytes = scanned_bytes.saturating_add(length);
            let Ok(encoded) = fs::read(entry.path()) else {
                continue;
            };
            let Ok(text) = std::str::from_utf8(&encoded) else {
                continue;
            };
            for (index, line) in text.lines().enumerate() {
                if !line.to_lowercase().contains(&needle) {
                    continue;
                }
                let source_file = entry
                    .path()
                    .strip_prefix(&workspace)
                    .context("native search escaped the workspace")?
                    .to_path_buf();
                hits.push(NativeSearchHit {
                    source_file,
                    source_location: format!("L{}", index + 1),
                    preview: bounded_preview(line, 240),
                });
                if hits.len() == limits.max_results {
                    truncated = true;
                    break 'walk;
                }
            }
        }
    }
    Ok(NativeSearchEvidence {
        hits,
        scanned_files,
        truncated,
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GraphLimits {
    pub max_bytes: usize,
    pub max_nodes: usize,
    pub max_edges: usize,
    pub max_results: usize,
    pub max_depth: usize,
}

impl Default for GraphLimits {
    fn default() -> Self {
        Self {
            max_bytes: 16 * 1024 * 1024,
            max_nodes: 50_000,
            max_edges: 200_000,
            max_results: 32,
            max_depth: 4,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceFreshness {
    Fresh,
    Changed,
    Deleted,
    Unverifiable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EdgeConfidence {
    Extracted,
    Inferred,
    Unknown,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GraphProvenance {
    pub source_file: PathBuf,
    pub source_location: Option<String>,
    pub freshness: EvidenceFreshness,
    pub confidence: EdgeConfidence,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub kind: Option<String>,
    pub provenance: GraphProvenance,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub relation: String,
    pub rationale: Option<String>,
    pub provenance: GraphProvenance,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GraphEvidence {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GraphStatus {
    pub schema_version: u64,
    pub adapter_version: String,
    pub nodes: usize,
    pub edges: usize,
    pub stale_sources: usize,
    pub graph_path: PathBuf,
}

#[derive(Debug)]
pub struct ProjectGraph {
    workspace: PathBuf,
    graph_path: PathBuf,
    graph_modified: Option<SystemTime>,
    adapter_version: String,
    nodes: BTreeMap<String, RawNode>,
    edges: Vec<RawEdge>,
    limits: GraphLimits,
}

#[derive(Debug, Deserialize)]
struct RawGraph {
    graph: RawMetadata,
    nodes: Vec<RawNode>,
    #[serde(alias = "edges")]
    links: Vec<RawEdge>,
}

#[derive(Debug, Deserialize)]
struct RawMetadata {
    schema_version: u64,
    graphify_version: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawNode {
    id: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    file_type: Option<String>,
    #[serde(default, rename = "type")]
    node_type: Option<String>,
    #[serde(default)]
    source_file: Option<PathBuf>,
    #[serde(default)]
    source_location: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawEdge {
    source: String,
    target: String,
    #[serde(default)]
    relation: String,
    #[serde(default)]
    confidence: String,
    #[serde(default)]
    rationale: Option<String>,
    #[serde(default)]
    source_file: Option<PathBuf>,
    #[serde(default)]
    source_location: Option<String>,
}

impl ProjectGraph {
    /// Loads a graph only after enforcing byte, schema, node, edge, identifier,
    /// and source-path bounds.
    ///
    /// # Errors
    ///
    /// Returns an error for unavailable, oversized, malformed, incompatible,
    /// or workspace-escaping graph data.
    pub fn load(workspace: &Path, graph_path: &Path, limits: GraphLimits) -> Result<Self> {
        validate_limits(limits)?;
        let metadata = fs::metadata(graph_path).context("project graph is unavailable")?;
        let length = usize::try_from(metadata.len()).unwrap_or(usize::MAX);
        if length > limits.max_bytes {
            bail!("project graph exceeds the byte limit");
        }
        let encoded = fs::read(graph_path).context("project graph could not be read")?;
        if encoded.len() > limits.max_bytes {
            bail!("project graph exceeds the byte limit");
        }
        let raw: RawGraph = serde_json::from_slice(&encoded).map_err(|error| {
            anyhow::anyhow!(
                "project graph is malformed at line {} column {}: {error}",
                error.line(),
                error.column()
            )
        })?;
        if raw.graph.schema_version != GRAPHIFY_SCHEMA_VERSION {
            bail!("project graph schema is incompatible");
        }
        if raw.graph.graphify_version.trim().is_empty() {
            bail!("project graph adapter version is missing");
        }
        if raw.nodes.len() > limits.max_nodes || raw.links.len() > limits.max_edges {
            bail!("project graph exceeds the topology limit");
        }
        let mut nodes = BTreeMap::new();
        for node in raw.nodes {
            validate_text(&node.id, 256, "node ID")?;
            validate_text(&node.label, 2048, "node label")?;
            if let Some(kind) = node.node_type.as_deref().or(node.file_type.as_deref()) {
                validate_text(kind, 128, "node type")?;
            }
            validate_source(node.source_file.as_deref())?;
            if nodes.insert(node.id.clone(), node).is_some() {
                bail!("project graph contains duplicate node IDs");
            }
        }
        for edge in &raw.links {
            if !nodes.contains_key(&edge.source) || !nodes.contains_key(&edge.target) {
                bail!("project graph edge references an unknown node");
            }
            validate_text(&edge.relation, 128, "edge relation")?;
            validate_source(edge.source_file.as_deref())?;
        }
        Ok(Self {
            workspace: workspace.to_path_buf(),
            graph_path: graph_path.to_path_buf(),
            graph_modified: metadata.modified().ok(),
            adapter_version: raw.graph.graphify_version,
            nodes,
            edges: raw.links,
            limits,
        })
    }

    #[must_use]
    pub fn status(&self) -> GraphStatus {
        let stale_sources = self
            .nodes
            .values()
            .filter(|node| {
                !matches!(
                    self.freshness(node.source_file.as_deref()),
                    EvidenceFreshness::Fresh
                )
            })
            .map(|node| node.source_file.as_deref())
            .collect::<BTreeSet<_>>()
            .len();
        GraphStatus {
            schema_version: GRAPHIFY_SCHEMA_VERSION,
            adapter_version: self.adapter_version.clone(),
            nodes: self.nodes.len(),
            edges: self.edges.len(),
            stale_sources,
            graph_path: self.graph_path.clone(),
        }
    }

    #[must_use]
    pub fn query(&self, query: &str) -> GraphEvidence {
        let needle = query.trim().to_ascii_lowercase();
        if needle.is_empty() {
            return self.evidence(&BTreeSet::new(), false);
        }
        let mut ids = BTreeSet::new();
        let mut truncated = false;
        for node in self.nodes.values().filter(|node| {
            node.id.to_ascii_lowercase().contains(&needle)
                || node.label.to_ascii_lowercase().contains(&needle)
                || node.source_file.as_deref().is_some_and(|path| {
                    path.to_string_lossy()
                        .to_ascii_lowercase()
                        .contains(&needle)
                })
        }) {
            if ids.len() == self.limits.max_results {
                truncated = true;
                break;
            }
            ids.insert(node.id.clone());
        }
        self.evidence(&ids, truncated)
    }

    #[must_use]
    pub fn explain(&self, id: &str) -> GraphEvidence {
        self.neighborhood(id, 1)
    }

    #[must_use]
    pub fn dependencies(&self, id: &str) -> GraphEvidence {
        self.directional(id, false)
    }

    #[must_use]
    pub fn impact(&self, id: &str) -> GraphEvidence {
        self.directional(id, true)
    }

    #[must_use]
    pub fn owners(&self, id: &str) -> GraphEvidence {
        if !self.nodes.contains_key(id) {
            return self.evidence(&BTreeSet::new(), false);
        }
        let mut selected = BTreeSet::from([id.to_owned()]);
        for edge in self.edges.iter().filter(|edge| {
            (edge.source == id || edge.target == id)
                && edge.relation.to_ascii_lowercase().contains("own")
        }) {
            selected.insert(edge.source.clone());
            selected.insert(edge.target.clone());
            if selected.len() >= self.limits.max_results {
                break;
            }
        }
        self.evidence(&selected, false)
    }

    #[must_use]
    pub fn neighborhood(&self, id: &str, depth: usize) -> GraphEvidence {
        if !self.nodes.contains_key(id) || depth == 0 {
            return self.evidence(&BTreeSet::new(), false);
        }
        let depth = depth.min(self.limits.max_depth);
        let mut selected = BTreeSet::from([id.to_owned()]);
        let mut queue = VecDeque::from([(id.to_owned(), 0_usize)]);
        let mut truncated = false;
        while let Some((current, level)) = queue.pop_front() {
            if level == depth {
                continue;
            }
            for edge in self
                .edges
                .iter()
                .filter(|edge| edge.source == current || edge.target == current)
            {
                let next = if edge.source == current {
                    &edge.target
                } else {
                    &edge.source
                };
                if selected.len() == self.limits.max_results {
                    truncated = true;
                    break;
                }
                if selected.insert(next.clone()) {
                    queue.push_back((next.clone(), level + 1));
                }
            }
        }
        self.evidence(&selected, truncated)
    }

    #[must_use]
    pub fn shortest_path(&self, source: &str, target: &str) -> GraphEvidence {
        if !self.nodes.contains_key(source) || !self.nodes.contains_key(target) {
            return self.evidence(&BTreeSet::new(), false);
        }
        let mut queue = VecDeque::from([source.to_owned()]);
        let mut parent = BTreeMap::<String, String>::new();
        let mut depth = BTreeMap::from([(source.to_owned(), 0_usize)]);
        while let Some(current) = queue.pop_front() {
            if current == target {
                break;
            }
            let current_depth = depth[&current];
            if current_depth >= self.limits.max_depth {
                continue;
            }
            for edge in self
                .edges
                .iter()
                .filter(|edge| edge.source == current || edge.target == current)
            {
                let next = if edge.source == current {
                    &edge.target
                } else {
                    &edge.source
                };
                if !depth.contains_key(next) {
                    parent.insert(next.clone(), current.clone());
                    depth.insert(next.clone(), current_depth + 1);
                    queue.push_back(next.clone());
                }
            }
        }
        if !depth.contains_key(target) {
            return self.evidence(&BTreeSet::new(), false);
        }
        let mut selected = BTreeSet::from([target.to_owned()]);
        let mut current = target;
        while let Some(previous) = parent.get(current) {
            selected.insert(previous.clone());
            current = previous;
        }
        self.evidence(&selected, false)
    }

    fn directional(&self, id: &str, reverse: bool) -> GraphEvidence {
        if !self.nodes.contains_key(id) {
            return self.evidence(&BTreeSet::new(), false);
        }
        let mut selected = BTreeSet::from([id.to_owned()]);
        let mut queue = VecDeque::from([(id.to_owned(), 0_usize)]);
        let mut truncated = false;
        while let Some((current, depth)) = queue.pop_front() {
            if depth == self.limits.max_depth {
                continue;
            }
            for edge in self.edges.iter().filter(|edge| {
                let connected = if reverse {
                    edge.target == current
                } else {
                    edge.source == current
                };
                connected && dependency_relation(&edge.relation)
            }) {
                let next = if reverse { &edge.source } else { &edge.target };
                if selected.len() == self.limits.max_results {
                    truncated = true;
                    break;
                }
                if selected.insert(next.clone()) {
                    queue.push_back((next.clone(), depth + 1));
                }
            }
        }
        self.evidence(&selected, truncated)
    }

    fn evidence(&self, selected: &BTreeSet<String>, mut truncated: bool) -> GraphEvidence {
        let nodes = selected
            .iter()
            .filter_map(|id| self.nodes.get(id))
            .map(|node| self.project_node(node))
            .collect();
        let edge_limit = self.limits.max_results.saturating_mul(4);
        let mut matching_edges = self
            .edges
            .iter()
            .filter(|edge| selected.contains(&edge.source) && selected.contains(&edge.target))
            .peekable();
        let edges = matching_edges
            .by_ref()
            .take(edge_limit)
            .map(|edge| self.project_edge(edge))
            .collect::<Vec<_>>();
        truncated |= matching_edges.next().is_some();
        GraphEvidence {
            nodes,
            edges,
            truncated,
        }
    }

    fn project_node(&self, node: &RawNode) -> GraphNode {
        GraphNode {
            id: node.id.clone(),
            label: node.label.clone(),
            kind: node.node_type.clone().or_else(|| node.file_type.clone()),
            provenance: self.provenance(
                node.source_file.as_deref(),
                node.source_location.clone(),
                EdgeConfidence::Unknown,
            ),
        }
    }

    fn project_edge(&self, edge: &RawEdge) -> GraphEdge {
        GraphEdge {
            source: edge.source.clone(),
            target: edge.target.clone(),
            relation: edge.relation.clone(),
            rationale: edge.rationale.clone(),
            provenance: self.provenance(
                edge.source_file.as_deref(),
                edge.source_location.clone(),
                match edge.confidence.to_ascii_uppercase().as_str() {
                    "EXTRACTED" => EdgeConfidence::Extracted,
                    "INFERRED" => EdgeConfidence::Inferred,
                    _ => EdgeConfidence::Unknown,
                },
            ),
        }
    }

    fn provenance(
        &self,
        source: Option<&Path>,
        location: Option<String>,
        confidence: EdgeConfidence,
    ) -> GraphProvenance {
        GraphProvenance {
            source_file: source.unwrap_or_else(|| Path::new("")).to_path_buf(),
            source_location: location,
            freshness: self.freshness(source),
            confidence,
        }
    }

    fn freshness(&self, source: Option<&Path>) -> EvidenceFreshness {
        let Some(source) = source else {
            return EvidenceFreshness::Unverifiable;
        };
        let path = self.workspace.join(source);
        let Ok(metadata) = fs::metadata(path) else {
            return EvidenceFreshness::Deleted;
        };
        match (metadata.modified(), self.graph_modified) {
            (Ok(source_modified), Some(graph_modified)) if source_modified <= graph_modified => {
                EvidenceFreshness::Fresh
            }
            (Ok(_), Some(_)) => EvidenceFreshness::Changed,
            _ => EvidenceFreshness::Unverifiable,
        }
    }
}

fn validate_limits(limits: GraphLimits) -> Result<()> {
    if limits.max_bytes == 0
        || limits.max_nodes == 0
        || limits.max_edges == 0
        || limits.max_results == 0
        || limits.max_depth == 0
    {
        bail!("project graph limits must be positive");
    }
    Ok(())
}

fn validate_native_search(query: &str, limits: NativeSearchLimits) -> Result<()> {
    let query = query.trim();
    if query.is_empty() || query.len() > 256 || query.chars().any(char::is_control) {
        bail!("native project search query is invalid");
    }
    if limits.max_files == 0
        || limits.max_file_bytes == 0
        || limits.max_total_bytes == 0
        || limits.max_results == 0
    {
        bail!("native project search limits must be positive");
    }
    Ok(())
}

fn ignored_search_directory(name: &std::ffi::OsStr) -> bool {
    matches!(
        name.to_str(),
        Some(".git" | ".crumb" | "graphify-out" | "node_modules" | "target")
    )
}

fn bounded_preview(line: &str, maximum: usize) -> String {
    let line = line.trim();
    if line.len() <= maximum {
        return line.to_owned();
    }
    let boundary = line
        .char_indices()
        .map(|(index, _)| index)
        .take_while(|index| *index <= maximum.saturating_sub(1))
        .last()
        .unwrap_or(0);
    format!("{}…", &line[..boundary])
}

fn dependency_relation(relation: &str) -> bool {
    let relation = relation.to_ascii_lowercase();
    ["call", "import", "use", "depend", "inherit", "reference"]
        .iter()
        .any(|candidate| relation.contains(candidate))
}

fn validate_text(value: &str, maximum: usize, label: &str) -> Result<()> {
    if value.is_empty() || value.len() > maximum || value.chars().any(char::is_control) {
        bail!("project graph {label} is invalid");
    }
    Ok(())
}

fn validate_source(source: Option<&Path>) -> Result<()> {
    let Some(source) = source else {
        return Ok(());
    };
    if source.is_absolute()
        || source.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        bail!("project graph source path escapes the workspace");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::thread;
    use std::time::Duration;

    use super::*;

    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let workspace = tempfile::tempdir().expect("workspace");
        fs::write(workspace.path().join("a.rs"), "fn a() {}\n").expect("source");
        fs::write(workspace.path().join("b.rs"), "fn b() {}\n").expect("source");
        let graph = workspace.path().join("graph.json");
        fs::write(
            &graph,
            serde_json::to_vec(&serde_json::json!({
                "directed": true,
                "multigraph": false,
                "graph": {"schema_version": 1, "graphify_version": "0.9.92"},
                "nodes": [
                    {"id":"a","label":"alpha","file_type":"code","type":"function","source_file":"a.rs","source_location":"L1"},
                    {"id":"b","label":"beta","file_type":"code","source_file":"b.rs","source_location":"L1"}
                ],
                "links": [{
                    "source":"a","target":"b","relation":"calls","confidence":"EXTRACTED",
                    "source_file":"a.rs","source_location":"L1","rationale":"direct call"
                }]
            }))
            .expect("JSON"),
        )
        .expect("graph");
        (workspace, graph)
    }

    #[test]
    fn bounded_queries_keep_source_and_edge_provenance() {
        let (workspace, graph_path) = fixture();
        let graph = ProjectGraph::load(workspace.path(), &graph_path, GraphLimits::default())
            .expect("valid graph");
        let evidence = graph.explain("a");
        assert_eq!(evidence.nodes.len(), 2);
        assert_eq!(evidence.edges.len(), 1);
        assert_eq!(evidence.nodes[0].kind.as_deref(), Some("function"));
        assert_eq!(
            evidence.edges[0].provenance.confidence,
            EdgeConfidence::Extracted
        );
        assert_eq!(evidence.edges[0].provenance.source_file, Path::new("a.rs"));
        assert_eq!(evidence.edges[0].rationale.as_deref(), Some("direct call"));
        assert_eq!(graph.shortest_path("a", "b").nodes.len(), 2);
        assert_eq!(graph.dependencies("a").nodes.len(), 2);
        assert_eq!(graph.impact("b").nodes.len(), 2);
    }

    #[test]
    fn changed_and_deleted_sources_are_visible() {
        let (workspace, graph_path) = fixture();
        thread::sleep(Duration::from_millis(20));
        fs::write(workspace.path().join("a.rs"), "fn changed() {}\n").expect("change");
        fs::remove_file(workspace.path().join("b.rs")).expect("delete");
        let graph = ProjectGraph::load(workspace.path(), &graph_path, GraphLimits::default())
            .expect("valid graph");
        let evidence = graph.explain("a");
        assert_eq!(
            evidence.nodes[0].provenance.freshness,
            EvidenceFreshness::Changed
        );
        assert_eq!(
            evidence.nodes[1].provenance.freshness,
            EvidenceFreshness::Deleted
        );
        assert_eq!(graph.status().stale_sources, 2);
    }

    #[test]
    fn malformed_oversized_and_escaping_graphs_fail_closed() {
        let (workspace, graph_path) = fixture();
        let tiny = GraphLimits {
            max_bytes: 8,
            ..GraphLimits::default()
        };
        assert!(ProjectGraph::load(workspace.path(), &graph_path, tiny).is_err());
        fs::write(
            &graph_path,
            br#"{"graph":{"schema_version":1,"graphify_version":"0.9.92"},"nodes":[{"id":"x","label":"x","source_file":"../secret"}],"links":[]}"#,
        )
        .expect("escaping fixture");
        assert!(ProjectGraph::load(workspace.path(), &graph_path, GraphLimits::default()).is_err());
    }

    #[test]
    fn native_search_is_bounded_deterministic_and_skips_generated_state() {
        let workspace = tempfile::tempdir().expect("workspace");
        fs::create_dir_all(workspace.path().join("src")).expect("source directory");
        fs::create_dir_all(workspace.path().join("target")).expect("generated directory");
        fs::write(
            workspace.path().join("src/lib.rs"),
            "fn alpha() {}\nfn beta() { alpha(); }\n",
        )
        .expect("source fixture");
        fs::write(workspace.path().join("target/leak.rs"), "alpha secret\n")
            .expect("ignored fixture");

        let evidence =
            native_project_search(workspace.path(), "alpha", NativeSearchLimits::default())
                .expect("native search");
        assert_eq!(evidence.hits.len(), 2);
        assert!(
            evidence
                .hits
                .iter()
                .all(|hit| hit.source_file == Path::new("src/lib.rs"))
        );
        assert_eq!(evidence.hits[0].source_location, "L1");
        assert_eq!(evidence.hits[1].source_location, "L2");
        assert!(!evidence.truncated);

        let bounded = native_project_search(
            workspace.path(),
            "alpha",
            NativeSearchLimits {
                max_results: 1,
                ..NativeSearchLimits::default()
            },
        )
        .expect("bounded native search");
        assert_eq!(bounded.hits.len(), 1);
        assert!(bounded.truncated);
    }

    #[test]
    fn native_search_rejects_invalid_queries_and_limits() {
        let workspace = tempfile::tempdir().expect("workspace");
        assert!(
            native_project_search(workspace.path(), "\n", NativeSearchLimits::default()).is_err()
        );
        assert!(
            native_project_search(
                workspace.path(),
                "query",
                NativeSearchLimits {
                    max_files: 0,
                    ..NativeSearchLimits::default()
                },
            )
            .is_err()
        );
    }
}
