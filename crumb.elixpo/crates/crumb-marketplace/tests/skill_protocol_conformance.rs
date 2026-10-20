use std::collections::BTreeSet;
use std::path::PathBuf;

use crumb_marketplace::{
    Artifact, Capability, Catalog, Compatibility, Disclosures, DiscoveryIndex, MAX_CATALOG_BYTES,
    MAX_CATALOG_SEARCH_PAGE_SIZE, MAX_CATALOG_SEARCH_QUERY_BYTES, MAX_CATALOG_SEARCH_TERMS,
    MAX_DISCOVERY_INDEX_BYTES, MAX_PACKAGE_MANIFEST_BYTES, MarketplacePlatform, Package,
    PackageClass, PackageDependency, PackageKind, PackageReleaseRef, Publisher, PublisherIdentity,
    ReleaseProvenance, ReleaseTrust, Revocation, SkillEntry,
};

const REVISION: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn current_platform() -> MarketplacePlatform {
    match std::env::consts::OS {
        "macos" => MarketplacePlatform::Macos,
        "windows" => MarketplacePlatform::Windows,
        _ => MarketplacePlatform::Linux,
    }
}

fn publisher() -> Publisher {
    Publisher {
        id: "crumb".to_owned(),
        display_name: "Crumb".to_owned(),
        source_url: "https://example.com/crumb".to_owned(),
        identity: PublisherIdentity {
            issuer: "https://token.actions.githubusercontent.com".to_owned(),
            subject: "repo:example/crumb:ref:refs/heads/main".to_owned(),
        },
    }
}

fn package(name: &str) -> Package {
    let artifact = format!("skills/{name}/SKILL.md");
    Package {
        id: format!("crumb/{name}"),
        publisher: "crumb".to_owned(),
        version: "1.0.0".to_owned(),
        kind: PackageKind::Skill,
        package_class: PackageClass::Instruction,
        display_name: format!("{name} skill"),
        description: format!("Conformance fixture for {name}"),
        license: "MIT".to_owned(),
        source: format!("./packages/{name}"),
        compatibility: Compatibility {
            minimum_crumb_version: "0.0.0".to_owned(),
            maximum_crumb_version_exclusive: None,
            platforms: BTreeSet::from([current_platform()]),
        },
        provenance: ReleaseProvenance {
            repository: "https://github.com/example/crumb".to_owned(),
            revision: REVISION.to_owned(),
            released_at: "2026-10-18T00:00:00Z".to_owned(),
            trust: ReleaseTrust::Bundled,
        },
        disclosures: Disclosures {
            security_url: "https://example.com/security".to_owned(),
            privacy_url: None,
            data_flow: "Instructions remain local.".to_owned(),
        },
        connector_requirements: Vec::new(),
        dependencies: Vec::new(),
        deprecation: None,
        capabilities: BTreeSet::new(),
        artifacts: vec![Artifact {
            path: PathBuf::from(&artifact),
            sha256: "b".repeat(64),
            size_bytes: 32,
            url: None,
            bundle_url: None,
        }],
        skills: vec![SkillEntry {
            id: name.to_owned(),
            path: PathBuf::from(artifact),
        }],
        mcp_servers: Vec::new(),
    }
}

fn fixture_catalog(packages: Vec<Package>) -> Catalog {
    Catalog {
        schema_version: 3,
        name: "conformance".to_owned(),
        publishers: vec![publisher()],
        revocations: Vec::new(),
        packages,
    }
}

fn parsed(catalog: &Catalog) -> Catalog {
    let bytes = serde_json::to_vec(catalog).expect("catalog fixture serializes");
    Catalog::parse(&bytes).expect("catalog fixture passes public validation")
}

fn composite(name: &str, dependencies: &[(&str, &str)]) -> Package {
    let mut package = package(name);
    package.kind = PackageKind::Bundle;
    package.package_class = PackageClass::Composite;
    package.dependencies = dependencies
        .iter()
        .map(|(id, version)| PackageDependency {
            id: (*id).to_owned(),
            version: (*version).to_owned(),
        })
        .collect();
    package
}

fn plan_ids(catalog: &Catalog, root: &str) -> Vec<String> {
    catalog
        .installation_plan(root)
        .expect("installation plan resolves")
        .into_iter()
        .map(|package| package.id.clone())
        .collect()
}

#[test]
fn manifests_and_discovery_indexes_enforce_public_bounds() {
    assert!(Catalog::parse(&vec![b' '; MAX_CATALOG_BYTES + 1]).is_err());
    let catalog = parsed(&fixture_catalog(vec![package("bounded")]));
    let index = catalog.discovery_index().expect("build discovery index");
    let bytes = index.to_bytes().expect("serialize discovery index");
    assert!(bytes.len() <= MAX_DISCOVERY_INDEX_BYTES);
    DiscoveryIndex::parse(&bytes).expect("parse bounded discovery index");

    assert!(
        DiscoveryIndex::parse(&vec![b' '; MAX_DISCOVERY_INDEX_BYTES + 1]).is_err(),
        "oversized discovery indexes must fail before decoding"
    );

    let mut oversized = package("oversized");
    oversized.description = "x".repeat(MAX_PACKAGE_MANIFEST_BYTES + 1);
    let oversized_catalog = parsed(&fixture_catalog(vec![oversized]));
    assert!(
        oversized_catalog.discovery_index().is_err(),
        "a full manifest larger than the advertised bound must not enter discovery"
    );

    let page_limit_error = index.search("", 0, MAX_CATALOG_SEARCH_PAGE_SIZE + 1);
    assert!(page_limit_error.is_err());
    assert!(
        index
            .search(&"q".repeat(MAX_CATALOG_SEARCH_QUERY_BYTES + 1), 0, 1)
            .is_err()
    );
    let too_many_terms = (0..=MAX_CATALOG_SEARCH_TERMS)
        .map(|index| format!("term{index}"))
        .collect::<Vec<_>>()
        .join(" ");
    assert!(index.search(&too_many_terms, 0, 1).is_err());
}

#[test]
fn referenced_manifests_fail_closed_on_tampering_or_digest_mismatch() {
    let catalog = parsed(&fixture_catalog(vec![package("receipt")]));
    let index = catalog.discovery_index().expect("build discovery index");
    let release = &index.releases[0].release;
    let package = catalog
        .package_for_release(release)
        .expect("resolve exact package");
    let manifest = serde_json::to_vec(package).expect("serialize manifest");
    Package::parse_referenced_manifest(&manifest, release).expect("verify exact manifest");

    let mut tampered = manifest.clone();
    let position = tampered
        .windows(b"receipt skill".len())
        .position(|window| window == b"receipt skill")
        .expect("fixture display name exists");
    tampered[position] = b'R';
    assert!(Package::parse_referenced_manifest(&tampered, release).is_err());

    let wrong_digest = PackageReleaseRef {
        manifest_sha256: "0".repeat(64),
        ..release.clone()
    };
    assert!(Package::parse_referenced_manifest(&manifest, &wrong_digest).is_err());

    let wrong_identity = PackageReleaseRef {
        id: "crumb/another".to_owned(),
        ..release.clone()
    };
    assert!(Package::parse_referenced_manifest(&manifest, &wrong_identity).is_err());
}

#[test]
fn package_paths_cannot_escape_the_install_root() {
    for unsafe_path in ["../SKILL.md", "/tmp/SKILL.md", "skills/../SKILL.md"] {
        let mut package = package("escape");
        package.artifacts[0].path = PathBuf::from(unsafe_path);
        package.skills[0].path = PathBuf::from(unsafe_path);
        let bytes = serde_json::to_vec(&fixture_catalog(vec![package])).expect("serialize fixture");
        assert!(
            Catalog::parse(&bytes).is_err(),
            "unsafe path `{unsafe_path}` must be rejected"
        );
    }
}

#[test]
fn dependency_planning_rejects_unavailable_incompatible_and_revoked_releases() {
    let root = composite("root", &[("crumb/base", "1.0.0")]);

    let unavailable = parsed(&fixture_catalog(vec![root.clone()]));
    let error = unavailable
        .installation_plan("crumb/root")
        .expect_err("missing dependency must fail");
    assert!(error.to_string().contains("was not found"));

    let mut incompatible_base = package("base");
    incompatible_base.compatibility.minimum_crumb_version = "9999.0.0".to_owned();
    let incompatible = parsed(&fixture_catalog(vec![root.clone(), incompatible_base]));
    let error = incompatible
        .installation_plan("crumb/root")
        .expect_err("incompatible dependency must fail");
    assert!(error.to_string().contains("incompatible"));

    let mut revoked_catalog = fixture_catalog(vec![root, package("base")]);
    revoked_catalog.revocations.push(Revocation {
        package: "crumb/base".to_owned(),
        version: "1.0.0".to_owned(),
        reason: "conformance revocation".to_owned(),
        revoked_at: "2026-10-18T00:00:00Z".to_owned(),
    });
    let revoked = parsed(&revoked_catalog);
    let error = revoked
        .installation_plan("crumb/root")
        .expect_err("revoked dependency must fail");
    assert!(error.to_string().contains("revoked"));
}

#[test]
fn dependency_order_is_dependency_first_and_independent_of_catalog_order() {
    let leaf = package("leaf");
    let middle = composite("middle", &[("crumb/leaf", "1.0.0")]);
    let sibling = package("sibling");
    let root = composite(
        "root",
        &[("crumb/middle", "1.0.0"), ("crumb/sibling", "1.0.0")],
    );

    let forward = parsed(&fixture_catalog(vec![
        root.clone(),
        leaf.clone(),
        sibling.clone(),
        middle.clone(),
    ]));
    let reversed = parsed(&fixture_catalog(vec![root, middle, sibling, leaf]));

    let expected = vec![
        "crumb/leaf".to_owned(),
        "crumb/middle".to_owned(),
        "crumb/sibling".to_owned(),
        "crumb/root".to_owned(),
    ];
    assert_eq!(plan_ids(&forward, "crumb/root"), expected);
    assert_eq!(plan_ids(&reversed, "crumb/root"), expected);
}

#[test]
fn discovery_metadata_excludes_instruction_and_runtime_bodies() {
    let mut private = package("private");
    private.source = "./packages/private-instruction-sentinel".to_owned();
    private.capabilities.insert(Capability::WorkspaceRead);
    let catalog = parsed(&fixture_catalog(vec![private]));
    let bytes = catalog
        .discovery_index()
        .expect("build discovery index")
        .to_bytes()
        .expect("serialize discovery index");
    let encoded = String::from_utf8(bytes).expect("discovery JSON is UTF-8");

    assert!(!encoded.contains("private-instruction-sentinel"));
    assert!(!encoded.contains("SKILL.md"));
    for excluded_field in [
        "artifacts",
        "skills",
        "dependencies",
        "capabilities",
        "connector_requirements",
        "mcp_servers",
        "source",
    ] {
        assert!(
            !encoded.contains(&format!("\"{excluded_field}\"")),
            "discovery leaked `{excluded_field}`"
        );
    }
}
