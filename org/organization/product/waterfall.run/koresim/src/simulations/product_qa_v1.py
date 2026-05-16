"""Product QA protocol for ranking concrete product artifacts."""
from __future__ import annotations

import re
from collections import Counter
from typing import Any

from src.simulations.common import (
    LETTERS,
    GenericPersonaSimulation,
    GenericSimulationResult,
    demographic_segments,
    parse_score,
    pct,
    top_counts,
)
from src.simulations.protocols import ProtocolSpec, ProtocolStep


PRODUCT_QA_PROTOCOL_ID = "product_qa_v1"


def product_qa_v1_protocol() -> ProtocolSpec:
    return ProtocolSpec(
        protocol_id=PRODUCT_QA_PROTOCOL_ID,
        steps=[
            ProtocolStep(
                id="artifact_ranking",
                mode="ranking",
                task_type="product_qa_response",
            )
        ],
    )


class ProductQAV1Simulation:
    simulation_type = "value_proposition"

    async def run(self, input_data: dict[str, Any], *args: Any, **kwargs: Any) -> GenericSimulationResult:
        runner = GenericPersonaSimulation(
            simulation_type=self.simulation_type,
            purpose="product QA research",
            task_type="product_qa_response",
            prompt_builder=build_product_qa_prompt,
            parser=parse_product_qa_response,
            aggregator=aggregate_product_qa,
        )
        result = await runner.run(input_data, *args, **kwargs)
        protocol = product_qa_v1_protocol().model_dump()
        protocol["step_summaries"] = [
            {
                "id": "artifact_ranking",
                "parsed_count": result.total_responses - result.parse_failed,
                "parse_failed": result.parse_failed,
            }
        ]
        return GenericSimulationResult(
            simulation_type=result.simulation_type,
            input=result.input,
            total_responses=result.total_responses,
            parse_failed=result.parse_failed,
            metrics=result.metrics,
            segments=result.segments,
            insights=result.insights,
            raw_results=result.raw_results,
            parsed_results=result.parsed_results,
            protocol=protocol,
        )


def build_product_qa_prompt(input_data: dict[str, Any]) -> str:
    artifacts = "\n".join(
        f"[{LETTERS[index]}] {statement}"
        for index, statement in enumerate(input_data["statements"])
    )
    criteria = ", ".join(input_data.get("criteria") or ["명확성", "신뢰도", "행동가능성"])
    return (
        f"제품/서비스 맥락:\n{input_data['product_context']}\n\n"
        f"평가 산출물 유형: {input_data.get('artifact_type') or 'product_artifact'}\n"
        f"평가 기준: {criteria}\n\n"
        f"후보:\n{artifacts}\n\n"
        "실제 사용자 입장에서 후보를 모두 순위화하세요. 좋은 말만 하지 말고 "
        "가장 덜 설득되는 후보도 명확히 고르세요.\n"
        "답변 형식:\n"
        "순위: A > B > C\n"
        "최상위: A/B/C 중 하나\n"
        "최하위: A/B/C 중 하나\n"
        "명확성: 1~5\n"
        "신뢰도: 1~5\n"
        "행동가능성: 1~5\n"
        "이유: 한 문장"
    )


def parse_product_qa_response(response: str) -> dict[str, Any] | None:
    ranking = _parse_ranking(response)
    top = _parse_choice_line(response, "최상위")
    bottom = _parse_choice_line(response, "최하위")
    clarity = parse_score(response, "명확성")
    credibility = parse_score(response, "신뢰도")
    actionability = parse_score(response, "행동가능성")
    if not ranking or top is None or bottom is None:
        return None
    return {
        "primary": top,
        "ranking": ranking,
        "top_choice": top,
        "bottom_choice": bottom,
        "clarity": clarity,
        "credibility": credibility,
        "actionability": actionability,
        "reason": _parse_line(response, "이유"),
    }


def aggregate_product_qa(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    parsed = [item for item in parsed_results if item]
    total = len(parsed)
    top_counts_map = Counter(item["top_choice"] for item in parsed)
    bottom_counts_map = Counter(item["bottom_choice"] for item in parsed)
    average_scores = {
        "clarity": _avg([item.get("clarity") for item in parsed]),
        "credibility": _avg([item.get("credibility") for item in parsed]),
        "actionability": _avg([item.get("actionability") for item in parsed]),
    }
    return {
        "metrics": {
            "protocol_id": PRODUCT_QA_PROTOCOL_ID,
            "artifact_type": input_data.get("artifact_type") or "product_artifact",
            "artifacts": input_data["statements"],
            "top_choice_counts": dict(top_counts_map),
            "top_choice_pct": {k: pct(v, total) for k, v in top_counts_map.items()},
            "bottom_choice_counts": dict(bottom_counts_map),
            "bottom_choice_pct": {k: pct(v, total) for k, v in bottom_counts_map.items()},
            "average_scores": average_scores,
            "top_reasons": top_counts([item["reason"] for item in parsed], limit=8),
        },
        "segments": demographic_segments(raw_results, parsed_results, key="top_choice"),
        "insights": _product_qa_insights(top_counts_map, bottom_counts_map, total),
    }


def _product_qa_insights(
    top_counts_map: Counter[str],
    bottom_counts_map: Counter[str],
    total: int,
) -> list[dict[str, Any]]:
    if not top_counts_map:
        return []
    winner, count = top_counts_map.most_common(1)[0]
    insights = [
        {
            "type": "product_qa_winner",
            "title": "Top-ranked artifact",
            "choice": winner,
            "pct": pct(count, total),
        }
    ]
    if bottom_counts_map:
        loser, loser_count = bottom_counts_map.most_common(1)[0]
        insights.append(
            {
                "type": "product_qa_weakest",
                "title": "Most often ranked last",
                "choice": loser,
                "pct": pct(loser_count, total),
            }
        )
    return insights


def _parse_ranking(response: str) -> list[str]:
    match = re.search(r"순위[:\s]*([A-J](?:\s*[>,]\s*[A-J])*)", response)
    if not match:
        return []
    return re.findall(r"[A-J]", match.group(1))


def _parse_choice_line(response: str, label: str) -> str | None:
    match = re.search(rf"{label}[:\s]*([A-J])", response)
    return match.group(1) if match else None


def _parse_line(response: str, label: str) -> str:
    match = re.search(rf"{label}[:\s]*(.+?)(?:\n|$)", response)
    return match.group(1).strip()[:240] if match else ""


def _avg(values: list[int | None]) -> float:
    valid = [value for value in values if isinstance(value, int)]
    return round(sum(valid) / len(valid), 2) if valid else 0.0
