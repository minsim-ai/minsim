"""Deterministic 5-indicator opportunity/risk matrix (schema opp-risk/v1).

Python port of the frontend heuristic in frontend/src/v2/minsimReport.ts
(buildOppRisk / oppRiskNote). Keyword lists and score formulas MUST stay in
sync with the frontend — tests/test_opp_risk_matrix.py and the minsim result
fixture share a golden case to guard drift.

The matrix is injected into envelope metrics so the analysis agent can issue
one holistic verdict per age band (A-3), and deterministic_generation_verdicts
provides the fallback when the LLM agent is unavailable.
"""
from __future__ import annotations

import re
from typing import Any

OPP_RISK_VERSION = "opp-risk/v1"

OPP_RISK_COLS = (
    {"k": "수용도", "dir": "up"},
    {"k": "니즈 강도", "dir": "up"},
    {"k": "가격 저항", "dir": "down"},
    {"k": "신뢰 우려", "dir": "down"},
    {"k": "경쟁 압력", "dir": "down"},
)

# Keep in sync with frontend/src/v2/minsimReport.ts PRICE/TRUST/ALT keyword lists.
PRICE_KEYWORDS = ["가격", "비싸", "부담", "구독", "요금", "비용", "지출", "할인", "결제", "유료", "가성비", "돈"]
TRUST_KEYWORDS = ["신뢰", "불안", "의심", "진짜", "효과", "회의", "과장", "검증", "광고", "사기", "걱정", "못믿", "믿을"]
ALT_KEYWORDS = ["이미", "기존", "대안", "다른", "비교", "경쟁", "굳이", "쓰던", "충분", "있어"]

AGE_ORDER = ["20대", "30대", "40대", "50대", "60대", "70대+", "70대", "80대+"]

VERDICT_LABELS = ("매력적", "조건부", "보류")


def build_opp_risk_matrix(envelope: dict[str, Any]) -> dict[str, Any] | None:
    segments = envelope.get("segments")
    by_age = segments.get("breakdown_by_age") if isinstance(segments, dict) else None
    if not isinstance(by_age, dict):
        return None
    labels = _order_keys(
        [label for label in by_age if _sum_counts(by_age.get(label)) > 0], AGE_ORDER
    )
    if not labels:
        return None

    raw_results = envelope.get("raw_results")
    valid = [
        raw
        for raw in (raw_results if isinstance(raw_results, list) else [])
        if isinstance(raw, dict) and not raw.get("error")
    ]
    all_reasons = [text for text in (_reason_text(raw) for raw in valid) if text]
    global_price = _pct_of(_count_matches(all_reasons, PRICE_KEYWORDS), len(all_reasons))
    global_trust = _pct_of(_count_matches(all_reasons, TRUST_KEYWORDS), len(all_reasons))
    winner_id = _winner_id(envelope.get("metrics"))

    scored: list[dict[str, Any]] = []
    for label in labels:
        counts = _number_record(by_age.get(label))
        n = sum(counts.values())
        if winner_id is not None and winner_id in counts:
            winner_count = counts[winner_id]
        else:
            winner_count = max([0, *counts.values()])
        winner_share = (winner_count / n) * 100 if n > 0 else 0.0

        personas = [
            raw
            for raw in valid
            if _age_bucket_matches(_persona_age(raw), label)
        ]
        scores = [score for score in (_score_of(raw) for raw in personas) if score is not None]
        avg = sum(scores) / len(scores) if scores else None
        pos_share = _pct_of(sum(1 for score in scores if score >= 4), len(scores)) if scores else None
        score_norm = ((avg - 1) / 4) * 100 if avg is not None else None

        reasons = [text for text in (_reason_text(raw) for raw in personas) if text]
        denom = len(personas)
        price_hits = _count_matches(reasons, PRICE_KEYWORDS)
        trust_hits = _count_matches(reasons, TRUST_KEYWORDS)
        alt_hits = _count_matches(reasons, ALT_KEYWORDS)

        acceptance = _clamp(
            winner_share * 0.6 + pos_share * 0.4 if pos_share is not None else winner_share
        )
        if score_norm is not None:
            need = _clamp(score_norm * 0.7 + (pos_share if pos_share is not None else score_norm) * 0.3)
        else:
            need = _clamp(min(90.0, winner_share * 0.8 + 15))
        price = _clamp((price_hits / denom) * 100 if denom > 0 else global_price)
        trust = _clamp((trust_hits / denom) * 100 if denom > 0 else global_trust)
        competition = _clamp(
            0.6 * (100 - winner_share) + 0.4 * ((alt_hits / denom) * 100 if denom > 0 else 0)
        )

        v = [acceptance, need, price, trust, competition]
        opportunity = acceptance + need - (price + trust + competition) / 3
        scored.append({"seg": label, "n": n, "v": v, "opportunity": opportunity})

    best_index = -1
    best_score = float("-inf")
    for index, row in enumerate(scored):
        if row["opportunity"] > best_score:
            best_score = row["opportunity"]
            best_index = index

    rows = [
        {
            "seg": row["seg"],
            "n": row["n"],
            "v": row["v"],
            "sweet": len(scored) > 1 and index == best_index and best_score > 40,
        }
        for index, row in enumerate(scored)
    ]
    return {"version": OPP_RISK_VERSION, "cols": [dict(col) for col in OPP_RISK_COLS], "rows": rows}


def deterministic_verdict(row: dict[str, Any]) -> dict[str, Any]:
    """One holistic judgment synthesizing all five indicators for a row."""

    acceptance, need, price, trust, competition = (float(value) for value in row["v"])
    opportunity = acceptance + need
    risks = [("가격 저항", price), ("신뢰 우려", trust), ("경쟁 압력", competition)]
    top_risk_name, top_risk_value = max(risks, key=lambda item: item[1])
    sweet = bool(row.get("sweet"))

    if sweet and top_risk_value < 45:
        verdict = "매력적"
        action = "후속 검증을 가장 먼저 진행할 세그먼트입니다."
        confidence = 0.75
    elif opportunity >= 150 or (need >= 60 and acceptance < 55) or opportunity >= 110:
        verdict = "조건부"
        action = f"{top_risk_name} 해소가 진입 조건입니다."
        confidence = 0.65
    else:
        verdict = "보류"
        action = "반응 근거를 보강한 뒤 재확인이 필요합니다."
        confidence = 0.6

    rationale = (
        f"수용도 {acceptance:.0f}·니즈 {need:.0f} 대비 "
        f"가격 {price:.0f}·신뢰 {trust:.0f}·경쟁 {competition:.0f} 중 "
        f"{top_risk_name}({top_risk_value:.0f})이 가장 큰 저항입니다. {action}"
    )
    return {
        "segment_key": str(row.get("seg", "")),
        "verdict": verdict,
        "rationale": rationale,
        "confidence": confidence,
    }


def deterministic_generation_verdicts(
    matrix: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Fallback per-generation verdicts + overall verdict from the matrix."""

    if not isinstance(matrix, dict):
        return [], None
    rows = matrix.get("rows")
    if not isinstance(rows, list) or not rows:
        return [], None
    verdicts = [deterministic_verdict(row) for row in rows if isinstance(row, dict)]
    if not verdicts:
        return [], None
    sweet_index = next(
        (index for index, row in enumerate(rows) if isinstance(row, dict) and row.get("sweet")),
        0,
    )
    top = verdicts[sweet_index] if sweet_index < len(verdicts) else verdicts[0]
    overall = {
        "verdict": top["verdict"],
        "rationale": f"{top['segment_key']} 세그먼트 기준: {top['rationale']}",
    }
    return verdicts, overall


def _winner_id(metrics: Any) -> str | None:
    if not isinstance(metrics, dict):
        return None
    for key in ("choice_counts", "intent_counts", "segment_counts"):
        counts = _number_record(metrics.get(key))
        if key == "segment_counts":
            counts = {label: value for label, value in counts.items() if label != "기타"}
        if counts:
            return max(counts.items(), key=lambda item: item[1])[0]
    return None


def _reason_text(raw: dict[str, Any]) -> str:
    parsed = raw.get("parsed")
    if isinstance(parsed, dict):
        reason = parsed.get("reason")
        if isinstance(reason, str) and reason.strip():
            return reason
    response = raw.get("response")
    if not isinstance(response, str):
        return ""
    match = re.search(r"이유[:：]\s*([^\n]+)", response)
    return match.group(1).strip() if match else response


def _score_of(raw: dict[str, Any]) -> float | None:
    parsed = raw.get("parsed")
    if isinstance(parsed, dict) and isinstance(parsed.get("score"), int | float):
        return float(parsed["score"])
    response = raw.get("response")
    if not isinstance(response, str):
        return None
    match = re.search(r"점수[:：]\s*([0-9])", response)
    return float(match.group(1)) if match else None


def _persona_age(raw: dict[str, Any]) -> Any:
    persona = raw.get("persona")
    return persona.get("age") if isinstance(persona, dict) else None


def _age_bucket_matches(age: Any, label: str) -> bool:
    if not isinstance(age, int | float):
        return False
    match = re.match(r"(\d+)", label)
    if not match:
        return False
    base = int(match.group(1))
    if "+" in label or "이상" in label:
        return age >= base
    return (int(age) // 10) * 10 == base


def _order_keys(keys: list[str], order: list[str]) -> list[str]:
    ranked = sorted((key for key in keys if key in order), key=order.index)
    rest = [key for key in keys if key not in order]
    return [*ranked, *rest]


def _number_record(value: Any) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    return {
        str(key): int(item)
        for key, item in value.items()
        if isinstance(item, int | float) and not isinstance(item, bool)
    }


def _sum_counts(value: Any) -> int:
    return sum(_number_record(value).values())


def _count_matches(texts: list[str], keywords: list[str]) -> int:
    return sum(1 for text in texts if any(keyword in text for keyword in keywords))


def _pct_of(count: int, total: int) -> float:
    return round((count / total) * 100, 1) if total > 0 else 0.0


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, round(value)))
