"""Bounded semantic-tag utilities for segment labels (A-4).

Free-text segment labels from persona responses grow without bound; these
helpers normalize spacing/particles, merge near-duplicates deterministically,
and enforce a hard cap with the remainder folded into 기타. Reusable by any
simulation that aggregates free-text tags.
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher

SEGMENT_TAG_CAP = 10
RESIDUAL_TAG = "기타"

INTEREST_VALUES = ("관심있음", "관심없음", "가격저항")

_TRAILING_PARTICLES = ("들", "층의", "족의")
_PUNCT_RE = re.compile(r"[\"'“”‘’`*_.,!?~·]+")
_SPACE_RE = re.compile(r"\s+")


def normalize_tag(label: str) -> str:
    """Canonical comparison key: NFKC, no punctuation, collapsed spacing."""

    cleaned = unicodedata.normalize("NFKC", label or "")
    cleaned = _PUNCT_RE.sub(" ", cleaned)
    cleaned = _SPACE_RE.sub(" ", cleaned).strip()
    for particle in _TRAILING_PARTICLES:
        if cleaned.endswith(particle) and len(cleaned) > len(particle) + 1:
            cleaned = cleaned[: -len(particle)]
    return cleaned


def _comparison_key(label: str) -> str:
    return normalize_tag(label).replace(" ", "")


def _similar(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    if len(a) >= 5 and len(b) >= 5 and (a in b or b in a):
        return True
    # Conservative fuzzy threshold: spacing variants already collapse via the
    # comparison key, so this only needs to catch near-typos without merging
    # genuinely distinct labels.
    return SequenceMatcher(None, a, b).ratio() >= 0.85


def merge_similar_tags(
    counts: Counter[str] | dict[str, int],
    cap: int = SEGMENT_TAG_CAP,
) -> tuple[dict[str, int], dict[str, str]]:
    """Merge near-duplicate labels into the larger bucket, then hard-cap.

    Returns (bounded counts incl. 기타 remainder, alias map original→kept).
    Deterministic: ties break by count desc, then label.
    """

    items = sorted(
        ((label, int(count)) for label, count in dict(counts).items() if label),
        key=lambda item: (-item[1], item[0]),
    )
    kept: list[tuple[str, str]] = []  # (display label, comparison key)
    merged: Counter[str] = Counter()
    aliases: dict[str, str] = {}

    for label, count in items:
        key = _comparison_key(label)
        target = next((display for display, kept_key in kept if _similar(key, kept_key)), None)
        if target is None:
            kept.append((label, key))
            merged[label] += count
        else:
            merged[target] += count
            if target != label:
                aliases[label] = target

    ranked = sorted(merged.items(), key=lambda item: (-item[1], item[0]))
    bounded: dict[str, int] = {}
    residual = 0
    for index, (label, count) in enumerate(ranked):
        if label == RESIDUAL_TAG or index >= cap:
            residual += count
            if label != RESIDUAL_TAG:
                aliases[label] = RESIDUAL_TAG
            continue
        bounded[label] = count
    if residual > 0:
        bounded[RESIDUAL_TAG] = bounded.get(RESIDUAL_TAG, 0) + residual
    return bounded, aliases
