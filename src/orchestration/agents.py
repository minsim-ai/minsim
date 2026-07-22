"""Run-level analysis/report/QA agent boundaries.

These are deterministic scaffolds for Phase 7 orchestration. They keep agent
responsibilities separate now and can later call LLM tasks through the router.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.simulations.opp_risk import deterministic_generation_verdicts


@dataclass(frozen=True)
class AnalysisAgent:
    name: str = "analysis"

    def summarize(self, result: dict[str, Any]) -> dict[str, Any]:
        metrics = result.get("metrics", {})
        insights = result.get("insights", [])
        metric_keys = sorted(metrics.keys())
        primary = insights[0] if insights else None
        matrix = metrics.get("opp_risk_matrix") if isinstance(metrics, dict) else None
        generation_verdicts, overall_verdict = deterministic_generation_verdicts(matrix)
        payload = {
            "agent": self.name,
            "summary": _analysis_summary(result, primary),
            "key_findings": _key_findings(metrics, primary),
            "segment_notes": _segment_notes(result),
            "metric_keys": metric_keys,
            "insight_count": len(insights),
            "primary_insight": primary,
        }
        if generation_verdicts:
            payload["generation_verdicts"] = generation_verdicts
            payload["overall_verdict"] = overall_verdict
        return payload


@dataclass(frozen=True)
class ReportAgent:
    name: str = "report"

    def compose(self, result: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any]:
        quality = result.get("quality", {})
        return {
            "agent": self.name,
            "headline": _headline(result, analysis),
            "recommendations": _recommendations(result, analysis),
            "risks": _risks(result),
            "quality_grade": quality.get("overall_grade"),
            "warnings": result.get("warnings", []),
        }


@dataclass(frozen=True)
class QAAgent:
    name: str = "qa"

    def check(self, result: dict[str, Any]) -> dict[str, Any]:
        total = int(result.get("total_responses") or 0)
        parse_failed = int(result.get("parse_failed") or 0)
        warnings = list(result.get("warnings") or [])
        if total == 0:
            warnings.append("페르소나 응답이 없습니다.")
        if parse_failed == total and total > 0:
            warnings.append("모든 페르소나 응답 파싱에 실패했습니다.")
        passed = total > 0 and parse_failed < total
        return {
            "agent": self.name,
            "passed": passed,
            "severity": _qa_severity(total=total, parse_failed=parse_failed, passed=passed),
            "warnings": warnings,
            "review_notes": _qa_review_notes(total=total, parse_failed=parse_failed),
            "confidence": 0.7 if total < 30 else 0.82,
        }


def run_agents(result: dict[str, Any]) -> dict[str, Any]:
    if _insufficient_parse_yield(result):
        return _fail_closed_agents(result)
    analysis = AnalysisAgent().summarize(result)
    report = ReportAgent().compose(result, analysis)
    qa = QAAgent().check(result)
    return {"analysis": analysis, "report": report, "qa": qa}


def _insufficient_parse_yield(result: dict[str, Any]) -> bool:
    total = int(result.get("total_responses") or 0)
    parse_failed = int(result.get("parse_failed") or 0)
    valid = max(0, total - parse_failed)
    if valid <= 0:
        return total >= 0  # no usable responses
    metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
    if metrics.get("ranking_available") is False:
        return True
    if total >= 20 and (valid < 20 or (valid / total * 100) < 15.0):
        return True
    return False


def _fail_closed_agents(result: dict[str, Any]) -> dict[str, Any]:
    total = int(result.get("total_responses") or 0)
    parse_failed = int(result.get("parse_failed") or 0)
    valid = max(0, total - parse_failed)
    note = (
        "파싱에 성공한 응답이 부족해 순위·1위 결론을 내지 않습니다. "
        "항목을 짧은 후보 라벨로 다시 입력한 뒤 재실행하세요."
    )
    analysis = {
        "agent": "analysis",
        "mode": "fail_closed",
        "summary": note,
        "key_findings": [],
        "segment_notes": [],
        "metric_keys": [],
        "insight_count": 0,
        "primary_insight": None,
    }
    report = {
        "agent": "report",
        "mode": "fail_closed",
        "headline": "응답 해석 불가 — 재실행 필요",
        "recommendations": [
            {
                "priority": "high",
                "action": "우선순위 항목을 3~6개의 짧은 라벨로 다시 입력하고 재실행",
                "reason": note,
            }
        ],
        "risks": [
            {
                "severity": "high",
                "risk": "저파싱/0파싱 결과로 예산 우선순위를 단정하면 잘못된 의사결정이 됩니다.",
                "mitigation": "항목 라벨을 정리한 뒤 동일 시드로 재실행하세요.",
            }
        ],
        "quality_grade": (result.get("quality") or {}).get("overall_grade"),
        "warnings": list(result.get("warnings") or []) + [note],
    }
    qa = {
        "agent": "qa",
        "mode": "fail_closed",
        "passed": False,
        "severity": "fail",
        "warnings": [note],
        "review_notes": [
            f"유효 응답 {valid}/{total} (parse_failed={parse_failed})",
            "1위·Borda 결론 비활성",
        ],
        "confidence": 0.2,
    }
    return {"analysis": analysis, "report": report, "qa": qa}


def _headline(result: dict[str, Any], analysis: dict[str, Any]) -> str:
    simulation_type = result.get("simulation_type", "simulation")
    primary = analysis.get("primary_insight") or {}
    title = primary.get("title") if isinstance(primary, dict) else None
    return f"{simulation_type}: {title or 'result ready'}"


def _analysis_summary(result: dict[str, Any], primary: Any) -> str:
    if isinstance(primary, dict) and primary.get("title"):
        return f"{primary['title']} 중심으로 집계 결과를 해석했습니다."
    total = result.get("total_responses", 0)
    return f"총 {total}개 응답의 집계 지표를 기반으로 방향성을 확인했습니다."


def _key_findings(metrics: dict[str, Any], primary: Any) -> list[dict[str, Any]]:
    if isinstance(primary, dict) and primary.get("title"):
        return [
            {
                "metric_key": str(primary.get("metric_key") or "insights"),
                "finding": str(primary["title"]),
                "evidence": str(primary.get("detail") or primary.get("description") or "insights"),
                "confidence": 0.7,
            }
        ]
    metric_key = next(iter(sorted(metrics.keys())), "metrics")
    return [
        {
            "metric_key": metric_key,
            "finding": "집계 지표에서 실행 가능한 방향성을 확인했습니다.",
            "evidence": f"{metric_key} 지표가 결과에 포함되어 있습니다.",
            "confidence": 0.65,
        }
    ]


def _segment_notes(result: dict[str, Any]) -> list[dict[str, str]]:
    segments = result.get("segments", {})
    if isinstance(segments, dict) and segments:
        segment_key = next(iter(sorted(segments.keys())))
        return [
            {
                "segment_key": segment_key,
                "note": "세그먼트별 차이를 추가 검증 대상으로 봅니다.",
                "evidence": f"{segment_key} 세그먼트 집계가 포함되어 있습니다.",
            }
        ]
    return []


def _recommendations(result: dict[str, Any], analysis: dict[str, Any]) -> list[dict[str, str]]:
    finding = ""
    findings = analysis.get("key_findings")
    if isinstance(findings, list) and findings and isinstance(findings[0], dict):
        finding = str(findings[0].get("finding") or "")
    return [
        {
            "priority": "high",
            "action": "현재 우세한 방향을 기준안으로 두고 후속 테스트를 진행합니다.",
            "reason": finding or "집계 지표에서 실행 가능한 방향성이 확인되었습니다.",
        }
    ]


def _risks(result: dict[str, Any]) -> list[dict[str, str]]:
    total = int(result.get("total_responses") or 0)
    if total < 30:
        return [
            {
                "severity": "medium",
                "risk": "소표본 결과를 확정 의사결정으로 과해석할 수 있습니다.",
                "mitigation": "50명 이상 표본으로 재실행해 방향성을 검증합니다.",
            }
        ]
    return [
        {
            "severity": "low",
            "risk": "집계 결과가 특정 세그먼트에 치우쳤을 수 있습니다.",
            "mitigation": "핵심 세그먼트별 결과를 함께 검토합니다.",
        }
    ]


def _qa_severity(*, total: int, parse_failed: int, passed: bool) -> str:
    if not passed:
        return "fail"
    # High parse-failure rate trumps the small-sample downgrade: garbage input
    # must trip the review gate even at n < 30 (D-2).
    if total > 0 and parse_failed / total > 0.15:
        return "warning"
    if total < 30:
        return "directional_only"
    if parse_failed:
        return "warning"
    return "pass"


def _qa_review_notes(*, total: int, parse_failed: int) -> list[str]:
    notes = []
    if total > 0 and parse_failed / total > 0.15:
        notes.append("응답 파싱 실패 비율이 높아 사람 검토가 필요합니다.")
    if total < 30:
        notes.append("소표본이므로 방향성 검증으로만 해석합니다.")
    if parse_failed:
        notes.append("일부 응답 파싱 실패가 있어 결과 해석 시 주의가 필요합니다.")
    if not notes:
        notes.append("기본 품질 검사를 통과했습니다.")
    return notes
