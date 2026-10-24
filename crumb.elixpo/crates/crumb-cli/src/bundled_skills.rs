//! Offline core skills compiled into the Crumb binary.

use std::path::{Path, PathBuf};

use crumb_agent::{AgentConfig, SkillConfig};

pub(crate) const PREFIX: &str = "builtin:";
pub(crate) const DEFAULT_IDS: &[&str] = &[
    "codebase-map",
    "failure-autopsy",
    "test-repair",
    "safe-refactor",
    "security-review",
    "plan-execute",
    "web-research",
    "github-workflow",
    "karpathy-guidelines",
    "skill-authoring",
    "crumb-commands",
    "crumb-support",
    "polli",
];

pub(crate) struct BundledSkill {
    pub id: &'static str,
    pub description: &'static str,
    pub instructions: &'static str,
}

macro_rules! skill {
    ($id:literal, $description:literal) => {
        BundledSkill {
            id: $id,
            description: $description,
            instructions: include_str!(concat!("../../../skills/core/", $id, "/SKILL.md")),
        }
    };
}

macro_rules! community_skill {
    ($id:literal, $description:literal) => {
        BundledSkill {
            id: $id,
            description: $description,
            instructions: include_str!(concat!("../../../skills/community/", $id, "/SKILL.md")),
        }
    };
}

pub(crate) static ALL: &[BundledSkill] = &[
    skill!(
        "codebase-map",
        "map an unfamiliar repository before changing it"
    ),
    skill!(
        "failure-autopsy",
        "diagnose failures from evidence before editing"
    ),
    skill!(
        "test-repair",
        "repair failing tests with minimal verified changes"
    ),
    skill!(
        "safe-refactor",
        "preserve behavior while improving structure"
    ),
    skill!(
        "security-review",
        "review trust boundaries, secrets, and unsafe flows"
    ),
    skill!(
        "performance-profile",
        "measure bottlenecks before optimizing"
    ),
    skill!(
        "docs-maintainer",
        "keep user-facing documentation accurate and concise"
    ),
    skill!(
        "release-readiness",
        "audit a local build for release blockers"
    ),
    skill!(
        "plan-execute",
        "split broad work into bounded verified packages"
    ),
    skill!(
        "web-research",
        "automatically research current or uncertain facts with source verification"
    ),
    skill!(
        "github-workflow",
        "inspect GitHub issues, pull requests, authentication, branches, and checks"
    ),
    community_skill!(
        "karpathy-guidelines",
        "apply Karpathy-inspired simplicity, surgical changes, explicit assumptions, and verification"
    ),
    skill!(
        "skill-authoring",
        "create or update focused reusable Crumb Agent Skills"
    ),
    skill!(
        "crumb-commands",
        "explain Crumb commands, shortcuts, model packs, sessions, memory, and permissions"
    ),
    skill!(
        "crumb-support",
        "explain what Crumb is and how to report bugs, request features, or get help"
    ),
    community_skill!(
        "polli",
        "generate images, audio, video, and text with the Pollinations polli CLI"
    ),
];

pub(crate) fn get(id: &str) -> Option<&'static BundledSkill> {
    ALL.iter().find(|skill| skill.id == id)
}

pub(crate) fn path(id: &str) -> PathBuf {
    PathBuf::from(format!("{PREFIX}{id}"))
}

pub(crate) fn id_from_path(path: &Path) -> Option<&str> {
    path.to_str()?.strip_prefix(PREFIX)
}

pub(crate) fn instructions(path: &Path) -> Option<&'static str> {
    get(id_from_path(path)?).map(|skill| skill.instructions)
}

pub(crate) fn apply_defaults(config: &mut AgentConfig) {
    for id in DEFAULT_IDS {
        if config.skills.iter().any(|skill| skill.id == *id) {
            continue;
        }
        config.skills.push(SkillConfig {
            id: (*id).to_owned(),
            path: path(id),
            enabled: true,
        });
    }
}

#[cfg(test)]
mod tests {
    use crumb_agent::{AgentConfig, SkillConfig};

    use super::{ALL, DEFAULT_IDS, apply_defaults, get, id_from_path, path};

    #[test]
    fn bundled_paths_round_trip_to_nonempty_instructions() {
        for skill in ALL {
            assert_eq!(id_from_path(&path(skill.id)), Some(skill.id));
            assert!(get(skill.id).is_some_and(|found| !found.instructions.is_empty()));
        }
    }

    #[test]
    fn defaults_are_added_once_and_preserve_explicit_unloads() {
        let mut config = AgentConfig {
            skills: vec![SkillConfig {
                id: "failure-autopsy".to_owned(),
                path: path("failure-autopsy"),
                enabled: false,
            }],
            ..AgentConfig::default()
        };

        apply_defaults(&mut config);
        apply_defaults(&mut config);

        assert_eq!(config.skills.len(), DEFAULT_IDS.len());
        assert!(
            !config
                .skills
                .iter()
                .find(|skill| skill.id == "failure-autopsy")
                .expect("default skill")
                .enabled
        );
        assert!(config.skills.iter().any(|skill| skill.id == "codebase-map"));
        assert!(config.skills.iter().any(|skill| skill.id == "plan-execute"));
    }
}
