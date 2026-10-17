"""
Elixpo CI Configuration — agent.elixpo
Single source of truth for all CI workflows and scripts.
"""

# ── LLM ─────────────────────────────────────────────
LLM_API_URL = "https://gen.pollinations.ai/v1/chat/completions"
LLM_MODEL_AGENT = "deepseek"
LLM_MODEL_CODE = "nova-fast"
LLM_MODEL_CHAT = "nova-fast"
LLM_MODEL_THINKING = "deepseek"
LLM_MODEL_SEARCH = "perplexity-fast"

LLM_MAX_TOKENS_AGENT = 3500
LLM_MAX_TOKENS_CODE = 6000
LLM_MAX_TOKENS_THINKING = 5000
LLM_MAX_TOKENS_SEARCH = 2500

# Back-compat alias — scripts that haven't been migrated still import LLM_MODEL.
LLM_MODEL = LLM_MODEL_CHAT

# ── Repository ──────────────────────────────────────
REPO = "elixpo/sketch.elixpo"
PROJECT_NAME = "LixSketch"
PROJECT_DESCRIPTION = "Collaborative infinite canvas for diagrams, sketches, and documents"

# ── GitHub Projects V2 ──────────────────────────────
# Shared org-wide projects (linked to all elixpo repos).
# One project per category — Repository column shows which repo each issue came from.
# Each project has its own Priority field with Urgent/High/Medium/Low.
PROJECT_OWNER = "elixpo"

PROJECTS = {
    "Feature": {
        "number": 2,
        "url": "https://github.com/orgs/elixpo/projects/2",
    },
    "Bugs": {
        "number": 3,
        "url": "https://github.com/orgs/elixpo/projects/3",
    },
    "Support": {
        "number": 4,
        "url": "https://github.com/orgs/elixpo/projects/4",
    },
    "Dev": {
        "number": 5,
        "url": "https://github.com/orgs/elixpo/projects/5",
    },
}

# Valid categories and priorities (for LLM prompts + validation)
CATEGORIES = list(PROJECTS.keys())
PRIORITIES = ["Urgent", "High", "Medium", "Low"]

# ── GitHub Issue Types (sidebar "Type") ─────────────
# Org-wide issue types — fetched once with the GraphQL API.
# We map our Project categories → these native GitHub issue types.
ISSUE_TYPES = {
    "Task": "IT_kwDOCZpXlc4BRtJ8",
    "Bug": "IT_kwDOCZpXlc4BRtJ-",
    "Feature": "IT_kwDOCZpXlc4BRtJ_",
}

# Category → Issue Type mapping
CATEGORY_TO_TYPE = {
    "Feature": "Feature",
    "Bugs": "Bug",
    "Support": "Task",
    "Dev": "Task",
}

# ── Organization ────────────────────────────────────
ORG_MEMBERS = ["Circuit-Overtime", "anwe-ch", "elixpoo", "ez-vivek"]

# Maintainer skill map — used for LLM-driven PR reviewer assignment
MAINTAINERS = {
    "Circuit-Overtime": {
        "skills": ["agent", "agentic", "breaking", "urgent", "backend", "python", "ci", "devops", "llm", "core"],
        "role": "Lead — handles agentic work, breaking fixes, and urgent issues",
    },
    "ez-vivek": {
        "skills": ["frontend", "ui", "ux", "nextjs", "react", "css", "components", "styling", "design"],
        "role": "Frontend maintainer",
    },
    "anwe-ch": {
        "skills": ["docs", "documentation", "readme", "guide", "tutorial", "api-docs", "examples"],
        "role": "Documentation maintainer",
    },
}

# ── Gist ────────────────────────────────────────────
GIST_ACCOUNT = "elixpoo"
GIST_ID = ""  # filled after first merge creates it

# ── Agent ───────────────────────────────────────────
AGENT_TRIGGER = "@elixpoo"
AGENT_LABEL = "ELIXPO"

# ── README update heuristics ────────────────────────
# Path prefixes that count as "core" for this repo — changes touching these
# are more likely to warrant a README update. Override per-repo.
CORE_PATHS = ()  # TODO: list path prefixes that count as "core" for README-update heuristics
