"""
seed_discussions.py - Seed ecosystem-fit GitHub Discussions as @elixpoo.

GitHub doesn't expose a mutation to create discussion *categories* (those are a
one-time UI step under Org/Repo Settings → Discussions). This script seeds the
welcome/onboarding *posts* into whichever categories already exist, so the
org Discussions space (github.com/orgs/elixpo/discussions, sourced from
elixpo/elixpo_chapter) is welcoming and on-brand from day one.

It is idempotent: a seed is skipped if a discussion with the same title already
exists. Run it via the "Seed Discussions" workflow (workflow_dispatch) after
Discussions has been enabled on the source repo.

Environment:
    AGENT_TOKEN       GitHub token for @elixpoo (secret: ELIXPOO_GITHUB_AGENTIC_TOKEN)
    DISCUSSIONS_REPO  owner/name of the discussions source repo
                      (default: elixpo/elixpo_chapter)
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from scripts._common import github_graphql  # noqa: E402

REPO = os.environ.get("DISCUSSIONS_REPO", "elixpo/elixpo_chapter").strip()

# Each seed targets the first existing category whose name matches one of
# `categories` (case-insensitive); falls back to "General", then any category.
SEEDS = [
    {
        "title": "👋 Welcome to the Elixpo Chapter community",
        "categories": ["Announcements", "General"],
        "body": """\
# Welcome to **Elixpo Chapter** 👋

Elixpo is an open-source ecosystem of interconnected AI and developer tools - built in the open by a global community of **45+ contributors** and shared under **MIT & CC-BY-4.0**, free forever.

## What lives in the ecosystem
- 🎨 **Elixpo Art** - AI image generation · <https://elixpo.com>
- ✍️ **Elixpo Blogs / LixEditor** - rich WYSIWYG block editor (LaTeX, Mermaid, code) · <https://blogs.elixpo.com>
- 🖊️ **LixSketch** - open-source SVG whiteboard engine (npm + VS Code) · <https://sketch.elixpo.com>
- 💬 **Elixpo Chat** & 🔎 **Elixpo Search** · <https://chat.elixpo.com> · <https://search.elixpo.com>
- 👤 **Elixpo Accounts** · <https://accounts.elixpo.com>

## How to take part
- 🙋 Say hi in **Introductions**
- 🚀 Share what you're building in **Show & tell**
- 🧭 Propose features in **Ideas**
- ❓ Ask anything in **Q&A**

Everything is community-driven and open source. Glad you're here! 🌱
""",
    },
    {
        "title": "🙋 Introduce yourself",
        "categories": ["Introductions", "General"],
        "body": """\
Welcome! Drop a quick intro so the community can get to know you 👇

- **Who you are** (name / handle / where you're based)
- **What you build** or are learning
- **Which Elixpo tools** caught your eye (Art, LixSketch, LixEditor, Chat, Search…)
- Anything you'd love to contribute to or collaborate on

No experience required - designers, writers, first-time contributors, and seasoned devs are all welcome. 💛
""",
    },
    {
        "title": "🚀 Submit your project to be featured in the Elixpo ecosystem",
        "categories": ["Show and tell", "Ideas", "General"],
        "body": """\
Building something open source? It could be **featured across the Elixpo ecosystem**. ✨

Share it here with:

- **Project name & one-liner**
- **Repository link** (open source preferred)
- **What it does** and who it's for
- **How it connects** to the Elixpo ecosystem (tools, packages, AI, dev workflow…)
- A screenshot, demo, or short clip if you have one

Maintainers review submissions regularly. Packages, tools, integrations, and community projects are all welcome. 🌍
""",
    },
    {
        "title": "🧭 Roadmap & ideas - what should we build next?",
        "categories": ["Ideas", "General"],
        "body": """\
This is the place to shape where Elixpo goes next. 🧭

Tell us:
- A **feature or improvement** you'd love (for any tool - Art, LixSketch, LixEditor, Chat, Search, Accounts)
- A **rough problem** worth solving, even if you don't have the solution
- **Integrations** you'd like to see between ecosystem tools

Upvote ideas you care about with 👍 - it helps us prioritise. Nothing is too small or too ambitious.
""",
    },
    {
        "title": "❓ Q&A - get help with Elixpo tools",
        "categories": ["Q&A", "General"],
        "body": """\
Stuck on something? Ask here and the community will help. 🙌

To get a great answer fast:
- Mention the **tool/package** (`@elixpo/lixsketch`, `@elixpo/lixeditor`, Elixpo Art/Chat/Search…)
- Share **what you tried** and the **exact error / behaviour**
- Add a minimal repro, version, and OS where relevant

Helpful answers can be marked as the accepted answer to guide the next person. 📚
""",
    },
]


def fetch_repo_state(repo: str) -> dict:
    owner, name = repo.split("/", 1)
    query = """
    query($owner:String!,$name:String!){
      repository(owner:$owner,name:$name){
        id
        hasDiscussionsEnabled
        discussionCategories(first:50){ nodes{ id name } }
        discussions(first:100){ nodes{ title } }
      }
    }
    """
    result = github_graphql(query, {"owner": owner, "name": name})
    repo_node = (result.get("data") or {}).get("repository")
    if not repo_node:
        raise RuntimeError(f"Could not read repository {repo}: {result.get('errors')}")
    return repo_node


def pick_category(preferred: list[str], categories: list[dict]) -> dict | None:
    by_name = {c["name"].lower(): c for c in categories}
    for want in preferred + ["General"]:
        hit = by_name.get(want.lower())
        if hit:
            return hit
    return categories[0] if categories else None


def create_discussion(repo_id: str, category_id: str, title: str, body: str) -> str:
    mutation = """
    mutation($repositoryId:ID!,$categoryId:ID!,$title:String!,$body:String!){
      createDiscussion(input:{repositoryId:$repositoryId,categoryId:$categoryId,title:$title,body:$body}){
        discussion{ url }
      }
    }
    """
    result = github_graphql(
        mutation,
        {"repositoryId": repo_id, "categoryId": category_id, "title": title, "body": body},
    )
    if result.get("errors"):
        raise RuntimeError(f"createDiscussion failed for '{title}': {result['errors']}")
    return (((result.get("data") or {}).get("createDiscussion") or {}).get("discussion") or {}).get("url", "")


def main() -> int:
    print(f"Seeding discussions in {REPO} …")
    state = fetch_repo_state(REPO)

    if not state.get("hasDiscussionsEnabled"):
        print(
            "[error] Discussions are not enabled on "
            f"{REPO}.\n"
            "        Enable them first: Repo Settings → Features → Discussions,\n"
            "        and set this repo as the Organization Discussions source\n"
            "        (Org Settings → Discussions).",
            file=sys.stderr,
        )
        return 1

    categories = state.get("discussionCategories", {}).get("nodes", [])
    if not categories:
        print("[error] No discussion categories found.", file=sys.stderr)
        return 1

    existing_titles = {
        (d.get("title") or "").strip().lower()
        for d in state.get("discussions", {}).get("nodes", [])
    }

    repo_id = state["id"]
    created = 0
    for seed in SEEDS:
        if seed["title"].strip().lower() in existing_titles:
            print(f"  • skip (exists): {seed['title']}")
            continue
        category = pick_category(seed["categories"], categories)
        if not category:
            print(f"  • skip (no category): {seed['title']}")
            continue
        url = create_discussion(repo_id, category["id"], seed["title"], seed["body"])
        created += 1
        print(f"  ✓ created in '{category['name']}': {seed['title']}\n    {url}")

    print(f"Done. {created} discussion(s) created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
