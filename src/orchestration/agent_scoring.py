"""Deterministic scoring helpers for LLM agent outputs."""
from __future__ import annotations

import json
import re
from typing import Any

REQUIRED_FIELDS: dict[str, tuple[str, ...]] = {
    "analysis": ("summary", "key_findings", "segment_notes"),
    "report": ("headline", "recommendations", "risks"),
    "qa": ("passed", "severity", "warnings", "review_notes", "confidence"),
}

QA_SEVERITIES = {"pass", "directional_only", "warning", "fail"}
PRIORITIES = {"high", "medium", "low"}
RISK_SEVERITIES = {"high", "medium", "low"}
HANGUL_RE = re.compile(r"[가-힣]")


def score_agent_outputs(
    outputs: dict[str, dict[str, Any]],
    *,
    forbidden_terms: list[str] | None = None,
    safe_input: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    terms = [term for term in forbidden_terms or [] if term]
    return {
        agent_name: score_agent_output(
            agent_name,
            output,
            forbidden_terms=terms,
            safe_input=safe_input,
        )
        for agent_name, output in outputs.items()
    }


def score_agent_output(
    agent_name: str,
    output: dict[str, Any],
    *,
    forbidden_terms: list[str] | None = None,
    safe_input: dict[str, Any] | None = None,
) -> dict[str, Any]:
    required = REQUIRED_FIELDS.get(agent_name, ())
    missing = [field for field in required if field not in output]
    text = json.dumps(output, ensure_ascii=False, sort_keys=True)
    leaked_terms = [
        term for term in forbidden_terms or [] if isinstance(term, str) and term and term in text
    ]
    base = {
        "schema_valid": not missing,
        "missing_fields": missing,
        "no_raw_leak": not leaked_terms,
        "leaked_terms": leaked_terms[:10],
        "korean_output": _has_korean_output(agent_name, output),
    }
    if agent_name == "analysis":
        base["evidence_valid"] = _analysis_evidence_valid(output)
        if "generation_verdicts" in output:
            base["generation_verdicts_valid"] = _generation_verdicts_valid(output)
    elif agent_name == "report":
        base["actionability_valid"] = _recommendations_valid(output)
        base["risk_mitigation_valid"] = _risks_valid(output)
    elif agent_name == "qa":
        base["qa_severity_valid"] = output.get("severity") in QA_SEVERITIES
        base["small_sample_severity_valid"] = _small_sample_severity_valid(output, safe_input)
    return base


def _analysis_evidence_valid(output: dict[str, Any]) -> bool:
    findings = output.get("key_findings")
    if not isinstance(findings, list) or not findings:
        return False
    for item in findings:
        if not isinstance(item, dict):
            return False
        if not _nonempty(item.get("metric_key")):
            return False
        if not _nonempty(item.get("finding")):
            return False
        if not _nonempty(item.get("evidence")):
            return False
        confidence = item.get("confidence")
        if isinstance(confidence, bool) or not isinstance(confidence, int | float):
            return False
        if not 0 <= float(confidence) <= 1:
            return False
    return True


def _recommendations_valid(output: dict[str, Any]) -> bool:
    recommendations = output.get("recommendations")
    if not isinstance(recommendations, list) or not recommendations:
        return False
    for item in recommendations:
        if not isinstance(item, dict):
            return False
        if item.get("priority") not in PRIORITIES:
            return False
        if not _nonempty(item.get("action")) or not _nonempty(item.get("reason")):
            return False
    return True


def _risks_valid(output: dict[str, Any]) -> bool:
    risks = output.get("risks")
    if not isinstance(risks, list) or not risks:
        return False
    for item in risks:
        if not isinstance(item, dict):
            return False
        if item.get("severity") not in RISK_SEVERITIES:
            return False
        if not _nonempty(item.get("risk")) or not _nonempty(item.get("mitigation")):
            return False
    return True


VERDICT_VALUES = {"매력적", "조건부", "보류"}


def _generation_verdicts_valid(output: dict[str, Any]) -> bool:
    verdicts = output.get("generation_verdicts")
    if not isinstance(verdicts, list):
        return False
    for item in verdicts:
        if not isinstance(item, dict):
            return False
        if item.get("verdict") not in VERDICT_VALUES:
            return False
        if not _nonempty(item.get("segment_key")) or not _nonempty(item.get("rationale")):
            return False
        confidence = item.get("confidence")
        if isinstance(confidence, bool) or not isinstance(confidence, int | float):
            return False
        if not 0 <= float(confidence) <= 1:
            return False
    return True


def _small_sample_severity_valid(output: dict[str, Any], safe_input: dict[str, Any] | None) -> bool:
    total = _number((safe_input or {}).get("total_responses"))
    if total is None or total >= 30:
        return True
    # Severity may legitimately escalate above directional_only (e.g. high
    # parse-failure rate) — only 'pass' is invalid for small samples.
    return output.get("severity") in {"directional_only", "warning", "fail"}


def _has_korean_output(agent_name: str, output: dict[str, Any]) -> bool:
    values: list[str] = []
    if agent_name == "analysis":
        values.append(_string(output.get("summary")))
        values.extend(
            _string(item.get(key))
            for item in output.get("key_findings", [])
            if isinstance(item, dict)
            for key in ("finding", "evidence")
        )
    elif agent_name == "report":
        values.append(_string(output.get("headline")))
        values.extend(
            _string(item.get(key))
            for item in output.get("recommendations", [])
            if isinstance(item, dict)
            for key in ("action", "reason")
        )
        values.extend(
            _string(item.get(key))
            for item in output.get("risks", [])
            if isinstance(item, dict)
            for key in ("risk", "mitigation")
        )
    elif agent_name == "qa":
        values.extend(_string(item) for item in output.get("warnings", []) if isinstance(item, str))
        values.extend(
            _string(item) for item in output.get("review_notes", []) if isinstance(item, str)
        )
    else:
        values.append(json.dumps(output, ensure_ascii=False))
    text = " ".join(value for value in values if value)
    if not text:
        return False
    return len(HANGUL_RE.findall(text)) >= 3


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None
