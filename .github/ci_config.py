"""
Elixpo CI Configuration — accounts.elixpo
Single source of truth for all CI workflows and scripts.
"""

# ── LLM ─────────────────────────────────────────────
LLM_API_URL = "https://gen.pollinations.ai/v1/chat/completions"
LLM_MODEL_AGENT = "glm"       
LLM_MODEL_CODE = "qwen-coder"        
LLM_MODEL_CHAT = "perplexity-fast"        
LLM_MODEL_THINKING = "perplexity-reasoning"  
LLM_MODEL_SEARCH = "gemini-search"    

# Back-compat alias — scripts that haven't been migrated still import LLM_MODEL.
LLM_MODEL = LLM_MODEL_CHAT

# ── Repository ──────────────────────────────────────
REPO = "elixpo/art.elixpo"
PROJECT_NAME = "art.elixpo"
PROJECT_DESCRIPTION = "AI-powered art generation platform"

# ── GitHub Projects V2 ──────────────────────────────
# Shared org-wide projects (linked to all elixpo repos).
# One project per category — Repository column shows which repo each issue came from.
# Each project has its own Priority field with Urgent/High/Medium/Low.
PROJECT_OWNER = "elixpo"

PROJECTS = {
    "Feature": {
        "id": "PVT_kwDOCZpXlc4BU5G2",
        "number": 2,
        "url": "https://github.com/orgs/elixpo/projects/2",
        "priority_field_id": "PVTSSF_lADOCZpXlc4BU5G2zhI73CA",
        "priority_options": {
            "Urgent": "b23fe0c8",
            "High": "d7eb7128",
            "Medium": "5f4dffcc",
            "Low": "69fbb73e",
        },
    },
    "Bugs": {
        "id": "PVT_kwDOCZpXlc4BU5G4",
        "number": 3,
        "url": "https://github.com/orgs/elixpo/projects/3",
        "priority_field_id": "PVTSSF_lADOCZpXlc4BU5G4zhI74wo",
        "priority_options": {
            "Urgent": "941c406a",
            "High": "bf1e8234",
            "Medium": "26edf47b",
            "Low": "a8b967d7",
        },
    },
    "Support": {
        "id": "PVT_kwDOCZpXlc4BU5G6",
        "number": 4,
        "url": "https://github.com/orgs/elixpo/projects/4",
        "priority_field_id": "PVTSSF_lADOCZpXlc4BU5G6zhI76r8",
        "priority_options": {
            "Urgent": "31ddaa82",
            "High": "6bedb306",
            "Medium": "843e5a46",
            "Low": "f57a96cd",
        },
    },
    "Dev": {
        "id": "PVT_kwDOCZpXlc4BU5G7",
        "number": 5,
        "url": "https://github.com/orgs/elixpo/projects/5",
        "priority_field_id": "PVTSSF_lADOCZpXlc4BU5G7zhI78bE",
        "priority_options": {
            "Urgent": "0442c856",
            "High": "fe20675f",
            "Medium": "508c18fa",
            "Low": "987b0728",
        },
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
