"""Generate and publish announcements, Q&A, polls, and mention replies."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from rtk.models import FunctionDef, Message, ToolDef

from agents.discussions.mood import MOOD_EMOJI, Genre, MoodDecision

PROMPTS = Path(__file__).resolve().parents[2] / "prompts"
SKILLS = Path(__file__).resolve().parents[2] / "skills"
DISCLOSURE = "---\n_Posted by @elixpoo, Elixpo's automated project-management agent._"
MENTION_RE = re.compile(r"(?<![A-Za-z0-9_.+-])@elixpoo(?![A-Za-z0-9_.+-])", re.IGNORECASE)


class UnsafeDraft(RuntimeError):
    """The mandatory public-post safety gate rejected or could not classify a draft."""


def contains_mention(body: str) -> bool:
    return bool(MENTION_RE.search(body or ""))


def _prompt(name: str) -> str:
    return (PROMPTS / name).read_text().strip()


def _skill(name: str) -> str:
    """Load a repo skill while omitting discovery-only YAML frontmatter."""
    text = (SKILLS / name / "SKILL.md").read_text().strip()
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            return parts[2].strip()
    return text


def _instructions(skill: str, prompt: str) -> str:
    return (
        f"{_skill('living-repo-persona')}\n\n"
        f"{_skill(skill)}\n\n## Runtime output requirements\n\n{_prompt(prompt)}"
    )


def _content(response) -> str:
    if not response.choices:
        raise RuntimeError("model returned no choices")
    return (response.choices[0].message.content or "").strip()


def _json_from_response(response, tool_name: str) -> dict[str, Any]:
    """Read a forced tool call, with JSON-content fallback for compatible providers."""
    if not response.choices:
        raise RuntimeError("model returned no choices")
    message = response.choices[0].message
    for call in message.tool_calls or []:
        if call.function.name == tool_name:
            return json.loads(call.function.arguments)
    raw = (message.content or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"model did not call {tool_name!r} or return JSON") from exc


async def _structured_call(
    router,
    *,
    task: str,
    system_prompt: str,
    payload: dict[str, Any],
    schema: dict[str, Any],
    max_tokens: int,
) -> dict[str, Any]:
    tool = ToolDef(
        function=FunctionDef(
            name=task,
            description="Submit the final GitHub Discussions draft.",
            parameters=schema,
        )
    )
    response = await router.call(
        "discussions",
        [
            Message(role="system", content=system_prompt),
            Message(role="user", content=json.dumps(payload, ensure_ascii=False)),
        ],
        tools=[tool],
        tool_choice={"type": "function", "function": {"name": task}},
        effort="low",
        max_tokens=max_tokens,
    )
    return _json_from_response(response, task)


async def safety_check(router, text: str) -> None:
    """Fail closed unless qwen-safety explicitly labels the complete post safe."""
    response = await router.call(
        "safety",
        [
            Message(
                role="system",
                content=_skill("github-discussion-publisher")
                + "\n\n"
                + (
                    "Moderate the following public GitHub post. Reply with exactly SAFE when it "
                    "is acceptable, otherwise reply UNSAFE and a short category."
                ),
            ),
            Message(role="user", content=text),
        ],
        effort="low",
        max_tokens=40,
    )
    verdict = _content(response).casefold()
    if re.search(r"\bunsafe\b", verdict) or not re.search(r"\bsafe\b", verdict):
        raise UnsafeDraft(f"public-post safety gate returned: {verdict[:120] or 'empty response'}")


def public_body(body: str, marker: str) -> str:
    return f"{body.strip()}\n\n{DISCLOSURE}\n{marker}"


def emoji_title(title: str, emoji: str) -> str:
    """Apply exactly one deterministic mood emoji to a Discussion title."""
    clean = str(title or "").strip()
    for existing in {*MOOD_EMOJI.values(), "🧠"}:
        if clean.startswith(existing):
            clean = clean[len(existing):].lstrip(" :-—")
            break
    return f"{emoji} {clean}"


def render_activity(genre: Genre | str, draft: dict[str, Any], sources: list[dict] | None = None) -> str:
    """Render generated fields through a stable, readable Markdown contract."""
    genre = Genre(genre)
    summary = str(draft.get("summary", "")).strip()
    impact = str(draft.get("impact", "")).strip()
    prompt = str(draft.get("prompt", "")).strip()
    highlights = [str(item).strip() for item in draft.get("highlights", []) if str(item).strip()][:6]
    if not summary or not impact or not highlights:
        raise RuntimeError("activity draft requires summary, impact, and at least one highlight")
    bullets = "\n".join(f"- {item}" for item in highlights)

    if genre is Genre.ANNOUNCEMENT:
        sections = [
            f"## What changed\n\n{summary}\n\n{bullets}",
            f"## Why it matters\n\n{impact}",
        ]
        if prompt:
            sections.append(f"## What you can do\n\n{prompt}")
    elif genre is Genre.POLL:
        options = [str(item).strip() for item in draft.get("options", []) if str(item).strip()][:6]
        if len(options) < 2:
            raise RuntimeError("a poll activity needs at least two options")
        choices = "\n".join(f"{index}. **{option}**" for index, option in enumerate(options, 1))
        sections = [
            f"## Context\n\n{summary}\n\n{bullets}",
            f"## The decision\n\n{impact}",
            f"## Options\n\n{choices}",
            "## Vote with context\n\n"
            + (prompt or "Reply with the option number and the constraint driving your choice."),
        ]
    elif genre is Genre.QNA:
        sections = [
            f"## Scenario\n\n{summary}",
            f"## Questions\n\n{bullets}",
            f"## What a useful answer includes\n\n{impact}",
        ]
        if prompt:
            sections.append(f"## Share your approach\n\n{prompt}")
    else:
        raise RuntimeError("skip decisions cannot be rendered")

    source_lines = [
        f"- [#{item.get('number')}: {item.get('title', 'Merged change')}]({item.get('html_url')})"
        for item in (sources or [])
        if item.get("html_url")
    ]
    if source_lines:
        sections.append("## Merged sources\n\n" + "\n".join(source_lines))
    return "\n\n".join(sections)


def _change_priority(file: dict) -> tuple[int, str]:
    filename = str(file.get("filename", "")).casefold()
    evidence = ("changelog", "release", "migration", "breaking", "readme", "docs/")
    rank = next((index for index, term in enumerate(evidence) if term in filename), len(evidence))
    return rank, filename


def _compact_changes(files: list[dict], patch_budget: int = 18_000) -> list[dict]:
    """Prioritize release evidence and bound aggregate model input cost."""
    changes = []
    remaining = patch_budget
    for file in sorted(files, key=_change_priority)[:24]:
        raw_patch = str(file.get("patch") or "")
        patch = raw_patch[: min(3500, remaining)] if remaining else ""
        remaining -= len(patch)
        changes.append(
            {
                "filename": file.get("filename", ""),
                "status": file.get("status", ""),
                "patch": patch,
            }
        )
    return changes


async def merge_draft(router, pulls: list[dict], files: list[dict], decision: MoodDecision) -> dict[str, Any]:
    changes = _compact_changes(files)
    return await _structured_call(
        router,
        task="submit_merge_decision",
        system_prompt=_instructions("merge-discussion-orchestrator", "discussions_merge.md"),
        payload={
            "mood_decision": decision.model_context(),
            "pull_requests": [
                {
                    "number": pull.get("number"),
                    "title": pull.get("title", ""),
                    "body": str(pull.get("body") or "")[:3000],
                    "url": pull.get("html_url", ""),
                    "labels": [label.get("name", "") for label in pull.get("labels", [])],
                }
                for pull in pulls[:5]
            ],
            "changed_files": changes,
        },
        schema={
            "type": "object",
            "additionalProperties": False,
            "required": ["title", "summary", "highlights", "impact", "prompt", "options", "topic"],
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string"},
                "highlights": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 6},
                "impact": {"type": "string"},
                "prompt": {"type": "string"},
                "options": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
                "topic": {
                    "type": "string",
                    "enum": ["general", "mlops", "gitops", "docker", "kubernetes"],
                },
            },
        },
        max_tokens=900,
    )


async def qna_draft(router, recent_titles: list[str]) -> dict[str, Any]:
    return await _structured_call(
        router,
        task="submit_qna",
        system_prompt=_instructions("technical-qna-host", "discussions_qna.md"),
        payload={
            "mood_decision": {
                "mood": "mentoring",
                "genre": "qna",
                "emoji": "🧠",
                "evidence": ["weekly community heartbeat"],
            },
            "recent_discussion_titles_to_avoid": recent_titles[:30],
        },
        schema={
            "type": "object",
            "additionalProperties": False,
            "required": ["title", "summary", "highlights", "impact", "prompt", "topic"],
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string"},
                "highlights": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 4},
                "impact": {"type": "string"},
                "prompt": {"type": "string"},
                "topic": {"type": "string", "enum": ["mlops", "gitops", "docker", "kubernetes"]},
            },
        },
        max_tokens=700,
    )


async def reply_draft(router, discussion: dict, comment: dict, context: list[dict]) -> str:
    compact_context = [
        {"author": (item.get("author") or {}).get("login", "unknown"), "body": item.get("body", "")[:1500]}
        for item in context[-8:]
    ]
    result = await _structured_call(
        router,
        task="submit_reply",
        system_prompt=_instructions("discussion-mention-responder", "discussions_reply.md"),
        payload={
            "discussion": {
                "title": discussion.get("title", ""),
                "body": discussion.get("body", "")[:5000],
                "url": discussion.get("html_url") or discussion.get("url", ""),
            },
            "conversation": compact_context,
            "mention": {
                "author": (comment.get("user") or {}).get("login", "unknown"),
                "body": comment.get("body", "")[:4000],
            },
        },
        schema={
            "type": "object",
            "additionalProperties": False,
            "required": ["body"],
            "properties": {"body": {"type": "string"}},
        },
        max_tokens=700,
    )
    return str(result["body"]).strip()
