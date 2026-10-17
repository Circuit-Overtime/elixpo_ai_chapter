"""issue_description.py — auto-fill vague/empty issue bodies using repo context."""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ci_config import *
from _common import github_rest, call_llm

MIN_BODY_CHARS = 30
CONTEXT_MAX_CHARS = 9000
REQUIRED = ("## Problem Statement", "## Tasks", "## Checklist")

SYSTEM_PROMPT = (
    f"You are structuring a GitHub issue for {PROJECT_NAME} ({PROJECT_DESCRIPTION}). "
    "The reporter left only a title. INVESTIGATE the repo context (changelog, recent PRs + "
    "their changed files, recently modified files, top-level structure) to find what the title "
    "likely refers to, then write a grounded description yourself — you are doing the triage, "
    "not surveying the reporter.\n\n"
    "Rules:\n"
    "1. Only reference files/components that appear VERBATIM in the context. Never invent paths.\n"
    "2. Ground claims in a cited changelog entry, PR, or file — don't invent root causes.\n"
    "3. Be factual and concise; never @-tag the reporter.\n"
    "4. `### Questions from @elixpoo` is a LAST RESORT (max 1-3), only for things no context can "
    "answer — omit the whole section if the context was enough.\n\n"
    "Output EXACTLY:\n\n"
    "## Problem Statement\n<1-3 sentences, citing the file/PR/changelog entry you found, if any>\n\n"
    "## Tasks\n- <concrete tasks referencing real files>\n"
    "- <'Scope to be defined once the questions below are answered.' only if truly ungrounded>\n\n"
    "## Checklist\n- [ ] <3-5 objective verification items, e.g. tests pass, docs updated>\n\n"
    "---\n\n### Questions from @elixpoo\n- <question the context can't answer>\n"
    "- <omit this whole block if unnecessary>\n\n"
    "Answering these will make the description richer — tag **@elixpoo** and ask me to update the "
    "issue description, or label the issue with **`ELIXPO`** to let me solve it."
)


def load_context():
    path = os.environ.get("CONTEXT_PATH", "").strip()
    if not path or not os.path.isfile(path):
        return ""
    try:
        return open(path, encoding="utf-8").read()[:CONTEXT_MAX_CHARS]
    except Exception as e:
        print(f"Failed to read context file: {e}")
        return ""


def fallback_body(title):
    return (
        f"## Problem Statement\n{title}\n\n"
        "## Tasks\n- Scope to be defined once the questions below are answered.\n\n"
        "## Checklist\n- [ ] Implementation complete\n- [ ] Tests pass\n"
        "- [ ] Documentation updated if behavior changes\n\n---\n\n"
        "### Questions from @elixpoo\n"
        "- What is the exact scope of this change?\n"
        "- Which files or components should be affected?\n"
        "- What is the expected behavior after the change?\n\n"
        "Answering these will make the description richer — tag **@elixpoo** "
        "and ask me to update the issue description, or label the issue with "
        "**`ELIXPO`** to let me solve it.\n"
    )


def main():
    repo = os.environ.get("REPO", REPO)
    issue_number = os.environ["ISSUE_NUMBER"]

    issue = github_rest("GET", f"/repos/{repo}/issues/{issue_number}")
    title, body = issue.get("title") or "", issue.get("body") or ""

    if "## Problem Statement" in body or len(body.strip()) >= MIN_BODY_CHARS:
        print("Body already present/adequate; skipping.")
        return

    user_message = (
        f"Issue title: {title}\n\nInvestigate the repo context below before writing the "
        f"description; fall back to Questions only if it gives you nothing.\n\n"
        f"Repo context:\n{load_context()}"
    )

    try:
        generated = call_llm(LLM_MODEL_CHAT, SYSTEM_PROMPT, user_message, temperature=0.3)
    except Exception as e:
        print(f"LLM call failed: {e}")
        generated = ""

    if not generated or not all(m in generated for m in REQUIRED):
        print("LLM response malformed or missing; using fallback template.")
        generated = fallback_body(title)

    try:
        github_rest("PATCH", f"/repos/{repo}/issues/{issue_number}", {"body": generated})
        print(f"Updated body of issue #{issue_number}")
    except Exception as e:
        print(f"Failed to update issue body: {e}")


if __name__ == "__main__":
    main()
