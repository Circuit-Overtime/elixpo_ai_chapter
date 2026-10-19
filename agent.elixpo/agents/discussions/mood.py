"""Evidence-bounded repository-mood classifier with stable variance.

No model participates in this decision. Merged PR metadata and bounded patches
produce plausible moods; recent history discourages repetition and a stable
weighted choice gives similarly relevant changes different communication modes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from hashlib import sha256
from typing import Sequence


class Genre(str, Enum):
    ANNOUNCEMENT = "announcement"
    POLL = "poll"
    QNA = "qna"
    SKIP = "skip"


class Mood(str, Enum):
    ALERT = "alert"
    ENERGIZED = "energized"
    CURIOUS = "curious"
    MENTORING = "mentoring"
    RESTING = "resting"


MOOD_EMOJI = {
    Mood.ALERT: "🚨",
    Mood.ENERGIZED: "🚀",
    Mood.CURIOUS: "🗳️",
    Mood.MENTORING: "🧭",
    Mood.RESTING: "🌙",
}


@dataclass(frozen=True)
class MoodDecision:
    mood: Mood
    genre: Genre
    emoji: str
    scores: dict[str, int]
    signals: tuple[str, ...]

    @property
    def should_post(self) -> bool:
        return self.genre is not Genre.SKIP

    def model_context(self) -> dict:
        return {
            "mood": self.mood.value,
            "genre": self.genre.value,
            "emoji": self.emoji,
            "scores": self.scores,
            "evidence": list(self.signals),
        }


def _contains(text: str, words: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{re.escape(word)}\b", text) for word in words)


def _stable_fraction(material: str) -> float:
    """Map evidence to a retry-stable value in the half-open interval [0, 1)."""
    value = int.from_bytes(sha256(material.encode("utf-8")).digest()[:8], "big")
    return value / 2**64


def _choose_genre(
    candidates: dict[Genre, float],
    pulls: list[dict],
    scores: dict[str, int],
    recent_moods: Sequence[str],
    seed: str | None,
) -> Genre:
    identities = sorted(
        str(pull.get("node_id") or pull.get("number") or pull.get("title") or "unknown")
        for pull in pulls
    )
    material = "|".join(
        (
            ",".join(identities),
            ",".join(f"{name}:{scores[name]}" for name in sorted(scores)),
            ",".join(recent_moods[:5]),
            seed or "",
        )
    )
    point = _stable_fraction(material) * sum(candidates.values())
    cumulative = 0.0
    for genre, weight in candidates.items():
        cumulative += weight
        if point < cumulative:
            return genre
    return next(reversed(candidates))


def assess_mood(
    pulls: list[dict],
    files: list[dict],
    *,
    recent_moods: Sequence[str] = (),
    seed: str | None = None,
) -> MoodDecision:
    """Classify activity with inspectable signals and bounded, stable variance."""
    scores = {"announcement": 0, "poll": 0, "qna": 0}
    signals: list[str] = []
    paths = [str(file.get("filename", "")).casefold() for file in files]
    patch_text = "\n".join(str(file.get("patch") or "")[:2500] for file in files[:30]).casefold()
    pr_text = "\n".join(
        " ".join(
            [
                str(pull.get("title", "")),
                str(pull.get("body") or "")[:3000],
                " ".join(str(label.get("name", "")) for label in pull.get("labels", [])),
            ]
        )
        for pull in pulls
    ).casefold()
    text = f"{pr_text}\n{patch_text}"
    total_changes = sum(int(file.get("changes", 0) or 0) for file in files)

    maintenance_paths = (
        "tests/",
        "test_",
        ".github/",
        "package-lock.json",
        "poetry.lock",
        "uv.lock",
        "license",
    )
    maintenance_only = bool(paths) and all(any(term in path for term in maintenance_paths) for path in paths)
    dependency_only = _contains(pr_text, ("dependabot", "dependencies", "dependency bump")) or "chore(deps)" in pr_text
    critical = _contains(text, ("breaking", "security", "vulnerability", "deprecated", "deprecation", "migration"))

    if any(any(term in path for term in ("changelog", "release", "migration")) for path in paths):
        scores["announcement"] += 6
        signals.append("release or migration documentation changed")
    if critical:
        scores["announcement"] += 6
        signals.append("breaking, security, deprecation, or migration language detected")
    if any(re.match(r"^(feat|feature)(\(.+\))?!?:", str(pull.get("title", "")).casefold()) for pull in pulls):
        scores["announcement"] += 4
        signals.append("feature-style merged PR")
    user_paths = ("src/", "app/", "api/", "cli/", "public/", "agent.elixpo/src/")
    if any(any(term in path for term in user_paths) for path in paths):
        scores["announcement"] += 2
        signals.append("user-facing implementation paths changed")
    if total_changes >= 200:
        scores["announcement"] += 1
        signals.append("substantial merged diff")

    if _contains(pr_text, ("rfc", "design", "feedback", "proposal", "roadmap", "decision")):
        scores["poll"] += 5
        signals.append("explicit design or feedback signal")
    if _contains(text, ("option", "alternative", "follow-up", "next iteration", "tradeoff")):
        scores["poll"] += 3
        signals.append("unresolved option or follow-up signal")
    if any(any(term in path for term in ("config/", "schema", "interface", "settings")) for path in paths):
        scores["poll"] += 2
        signals.append("configuration or interface surface changed")

    domain_terms = ("mlops", "gitops", "docker", "kubernetes", "k8s", "helm", "container")
    if _contains(text, domain_terms) or any(any(term in path for term in domain_terms) for path in paths):
        scores["qna"] += 4
        signals.append("MLOps, GitOps, Docker, or Kubernetes change")
    if any(any(term in path for term in ("docs/", "example", "tutorial", "guide")) for path in paths):
        scores["qna"] += 3
        signals.append("documentation or example change")
    if any(re.match(r"^fix(\(.+\))?!?:", str(pull.get("title", "")).casefold()) for pull in pulls):
        scores["qna"] += 2
        signals.append("merged fix can support a diagnostic discussion")

    if maintenance_only or dependency_only:
        signals.append("maintenance-only activity")
        if not critical:
            return MoodDecision(Mood.RESTING, Genre.SKIP, MOOD_EMOJI[Mood.RESTING], scores, tuple(signals))

    if critical:
        return MoodDecision(
            Mood.ALERT,
            Genre.ANNOUNCEMENT,
            MOOD_EMOJI[Mood.ALERT],
            scores,
            tuple(signals),
        )

    thresholds = {Genre.ANNOUNCEMENT: 5, Genre.POLL: 5, Genre.QNA: 4}
    genre_moods = {
        Genre.ANNOUNCEMENT: Mood.ENERGIZED,
        Genre.POLL: Mood.CURIOUS,
        Genre.QNA: Mood.MENTORING,
    }
    normalized_history = tuple(
        mood.value if isinstance(mood, Mood) else str(mood).casefold().removeprefix("mood-")
        for mood in recent_moods
    )
    candidates: dict[Genre, float] = {}
    for genre, threshold in thresholds.items():
        score = scores[genre.value]
        if score < threshold:
            continue
        mood_name = genre_moods[genre].value
        weight = float(score**2)
        occurrences = normalized_history[:5].count(mood_name)
        if normalized_history[:1] == (mood_name,):
            weight *= 0.2
        weight *= 0.6**occurrences
        if mood_name not in normalized_history[:3]:
            weight *= 1.2
        candidates[genre] = max(weight, 0.01)

    if not candidates:
        return MoodDecision(Mood.RESTING, Genre.SKIP, MOOD_EMOJI[Mood.RESTING], scores, tuple(signals))

    genre = _choose_genre(candidates, pulls, scores, normalized_history, seed)
    mood = genre_moods[genre]
    if len(candidates) > 1:
        signals.append("selected from evidence-qualified genres with recent-mood novelty bias")
    return MoodDecision(mood, genre, MOOD_EMOJI[mood], scores, tuple(signals))
