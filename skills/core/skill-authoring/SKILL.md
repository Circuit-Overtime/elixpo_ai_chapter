---
name: skill-authoring
description: Create or update reusable Crumb Agent Skills when the user asks for a custom skill, workflow, capability pack, or SKILL.md. Do not activate for ordinary implementation work that merely uses an existing skill.
---

# Skill Authoring

Create the smallest skill that materially improves repeated work.

- Use a lowercase dash-separated ID under 64 characters.
- Create `skills/local/<id>/SKILL.md` unless the user specifies another workspace path.
- Include YAML frontmatter with a precise `name` and discriminating `description`.
- Put only shared decisions and constraints in `SKILL.md`; put substantial conditional detail in `references/` and deterministic repeated operations in `scripts/`.
- Assume the agent already knows general software practices. Avoid generic advice, duplicated project policy, speculative edge cases, and unrelated capabilities.
- Preserve user intent and permission boundaries. A skill can guide tool use but cannot grant itself access.
- Inspect third-party skill text and scripts before adapting them. Preserve attribution and license information.
- Validate that the file has complete frontmatter, no scaffold placeholders, and that every referenced resource exists.
- Do not silently enable a newly created or downloaded skill. Report its path and let the user register/load it, unless the request explicitly includes activation.
