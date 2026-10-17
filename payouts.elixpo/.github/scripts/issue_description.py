"""
issue_description.py — Auto-generate a structured description for issues
opened with no body (or a very thin body).

Env vars: AGENT_TOKEN, POLLINATIONS_KEY, ISSUE_NUMBER, ISSUE_AUTHOR, REPO
Optional: CONTEXT_PATH (path to downloaded repo-context artifact's context.md)
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ci_config import *
from _common import github_rest, call_llm


MIN_BODY_CHARS = 30
CONTEXT_MAX_CHARS = 6000


def needs_generating(body):
    """Return True if the issue body is missing or too thin."""
    if body is None:
        return True
    stripped = body.strip()
    if len(stripped) < MIN_BODY_CHARS:
        return True
    return False


def load_context():
    """Read the repo context from CONTEXT_PATH if available, else ''."""
    ctx_path = os.environ.get("CONTEXT_PATH", "").strip()
    if not ctx_path:
        print("No CONTEXT_PATH set; proceeding with empty context.")
        return ""
    if not os.path.isfile(ctx_path):
        print(f"Context file not found at {ctx_path}; proceeding with empty context.")
        return ""
    try:
        with open(ctx_path, "r", encoding="utf-8") as f:
            ctx = f.read()
        print(f"Loaded {len(ctx)} chars of repo context from {ctx_path}")
        if len(ctx) > CONTEXT_MAX_CHARS:
            print(f"Truncating context to {CONTEXT_MAX_CHARS} chars")
            ctx = ctx[:CONTEXT_MAX_CHARS]
        return ctx
    except Exception as e:
        print(f"Failed to read context file: {e}")
        return ""


def fallback_body(title, author="reporter"):
    """Basic template used when the LLM response is malformed.

    New format per product direction:
      - Description + Tasks + Checklist come first (self-contained issue body).
      - Questions, if any, appear LAST as a small `### Questions from @elixpoo`
        subsection with a short note tagging **@elixpoo** (the bot) — never
        tagging the reporter — asking them to answer or label `ELIXPO`.
    """
    return (
        "## Problem Statement\n"
        f"{title}\n\n"
        "## Tasks\n"
        "- Scope to be defined once the questions below are answered.\n\n"
        "## Checklist\n"
        "- [ ] Implementation complete\n"
        "- [ ] Tests pass\n"
        "- [ ] Documentation updated if behavior changes\n\n"
        "---\n\n"
        "### Questions from @elixpoo\n"
        "- What is the exact scope of this change?\n"
        "- Which files or components should be affected?\n"
        "- What is the expected behavior after the change?\n\n"
        "Answering these will make the description richer — tag **@elixpoo** "
        "and ask me to update the issue description, or label the issue with "
        "**`ELIXPO`** to let me solve it.\n"
    )


def looks_valid(body):
    """Check that the generated body has the new structure.

    Required: Problem Statement + Tasks + Checklist. Questions section is
    optional (the model may write 'None — title is clear.' and omit the block).
    """
    if not body:
        return False
    required = [
        "## Problem Statement",
        "## Tasks",
        "## Checklist",
    ]
    return all(marker in body for marker in required)


def main():
    repo = os.environ.get("REPO", REPO)
    issue_number = os.environ["ISSUE_NUMBER"]
    author = os.environ.get("ISSUE_AUTHOR", "").strip() or "reporter"

    print(f"Checking issue #{issue_number} in {repo} (author: @{author})")

    # 1. Fetch the issue
    issue = github_rest("GET", f"/repos/{repo}/issues/{issue_number}")
    title = issue.get("title", "") or ""
    body = issue.get("body", "") or ""

    # 2. Skip if already well-formed
    if "## Problem Statement" in body:
        print("Body already contains a Problem Statement section; skipping.")
        return

    # 3. Skip if body already looks good
    if not needs_generating(body):
        print("Body looks good, skipping.")
        return

    print(f"Body is empty or thin ({len(body.strip())} chars); generating description.")

    # 4. Load repo context (optional)
    context = load_context()

    # 5. Call the LLM
    # Format rules:
    #   - The description block (Problem Statement + Tasks + Checklist)
    #     must stand alone and NEVER @-tag the reporter. It's a description
    #     of the issue, not a conversation with them.
    #   - Any clarifying questions go LAST, under a small `### Questions
    #     from @elixpoo` subsection with a short footer tagging @elixpoo
    #     (the bot) — never the reporter — asking to answer or label ELIXPO.
    system_prompt = (
        f"You are structuring a GitHub issue for {PROJECT_NAME} ({PROJECT_DESCRIPTION}).\n"
        "The reporter left only a title. Your job is to produce a structured "
        "skeleton — NOT to invent requirements. The issue body describes the "
        "issue; it is NOT a message addressed to the reporter.\n\n"
        "STRICT RULES:\n"
        "1. ONLY reference files, directories, functions, or components that appear VERBATIM "
        "in the 'Repo context' section below. Never invent file paths. If you cannot find a "
        "relevant file in the context, describe the component generically (e.g., 'the auth module') "
        "without a path.\n"
        "2. Do NOT assume scope, fix approach, or implementation details the reporter did not state.\n"
        "3. Be factual and concise. No hedging, no filler, no marketing language.\n"
        "4. Do NOT @-tag the reporter anywhere in the body. The description is about the issue, "
        "not a direct message to anyone.\n"
        "5. If the title leaves things unclear, put concise questions in the final "
        "`### Questions from @elixpoo` block — this is the primary way to move the issue forward.\n\n"
        "Output EXACTLY this markdown (no preamble, no closing text):\n\n"
        "## Problem Statement\n"
        "<1-3 sentences restating what the title conveys. If the title is vague, say so plainly "
        "(e.g., 'The reporter asks for X, but the specific scope is not stated.'). Do not pad.>\n\n"
        "## Tasks\n"
        "- <only list tasks that are OBVIOUSLY required given the title + context. Reference real "
        "files from the context when they are unambiguously relevant. Otherwise use generic language.>\n"
        "- <If the scope is unclear, write a single bullet: 'Scope to be defined once the questions below are answered.'>\n\n"
        "## Checklist\n"
        "- [ ] <verification items that are objectively required, e.g., 'Change reviewed', 'Tests pass', "
        "'Docs updated if behavior changes'. Keep to 3-5 items. Do not include 'questions answered' here — "
        "that belongs in the Questions block below.>\n\n"
        "---\n\n"
        "### Questions from @elixpoo\n"
        "- <concrete question needed before work starts>\n"
        "- <2-5 questions total; if the title is fully self-explanatory, OMIT this entire `---` + `### Questions from @elixpoo` section (do not write 'None — title is clear.' — just leave it out).>\n\n"
        "Answering these will make the description richer — tag **@elixpoo** and ask me to update the "
        "issue description, or label the issue with **`ELIXPO`** to let me solve it."
    )

    user_message = f"Issue title: {title}\n\nRepo context:\n{context}"

    generated = ""
    try:
        generated = call_llm(LLM_MODEL_CHAT, system_prompt, user_message, temperature=0.3)
        print(f"LLM returned {len(generated)} chars")
    except Exception as e:
        print(f"LLM call failed: {e}")

    # 6. Validate; fall back if malformed
    if not looks_valid(generated):
        print("LLM response malformed or missing; using fallback template.")
        generated = fallback_body(title, author)

    # 7. Update the issue body
    try:
        github_rest(
            "PATCH",
            f"/repos/{repo}/issues/{issue_number}",
            {"body": generated},
        )
        print(f"Updated body of issue #{issue_number}")
    except Exception as e:
        print(f"Failed to update issue body: {e}")


if __name__ == "__main__":
    main()
