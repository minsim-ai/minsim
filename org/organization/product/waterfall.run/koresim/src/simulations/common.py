"""Shared simulation helpers for Phase 5 engines."""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any, Callable

from src.agent.simulator import BatchSimulator, SimResult
from src.data.sampler import PersonaSampler, TargetFilter
from src.llm.base import LLMClientProtocol


LETTERS = "ABCDEFGHIJ"


@dataclass(frozen=True)
class GenericSimulationResult:
    simulation_type: str
    input: dict[str, Any]
    total_responses: int
    parse_failed: int
    metrics: dict[str, Any]
    segments: dict[str, Any]
    insights: list[dict[str, Any]]
    raw_results: list[SimResult]
    parsed_results: list[dict[str, Any] | None]
    protocol: dict[str, Any] | None = None


PromptBuilder = Callable[[dict[str, Any]], str]
Parser = Callable[[str], dict[str, Any] | None]
Aggregator = Callable[[dict[str, Any], list[SimResult], list[dict[str, Any] | None]], dict[str, Any]]


class GenericPersonaSimulation:
    def __init__(
        self,
        *,
        simulation_type: str,
        purpose: str,
        task_type: str,
        prompt_builder: PromptBuilder,
        parser: Parser,
        aggregator: Aggregator,
    ) -> None:
        self.simulation_type = simulation_type
        self.purpose = purpose
        self.task_type = task_type
        self.prompt_builder = prompt_builder
        self.parser = parser
        self.aggregator = aggregator

    async def run(
        self,
        input_data: dict[str, Any],
        sample_size: int = 200,
        target_filter: TargetFilter | None = None,
        seed: int = 42,
        on_progress: Callable[[int, int], None] | None = None,
        on_result: Callable[[SimResult], None] | None = None,
        llm_client: LLMClientProtocol | None = None,
        sampler: PersonaSampler | None = None,
        model_alias: str | None = None,
    ) -> GenericSimulationResult:
        sampler = sampler or PersonaSampler()
        personas = sampler.sample(n=sample_size, filter_=target_filter, seed=seed)
        simulator = BatchSimulator(
            purpose=self.purpose,
            llm_client=llm_client,
            model_alias=model_alias,
            task_type=self.task_type,
        )
        results = await simulator.run(
            personas,
            self.prompt_builder(input_data),
            on_progress=on_progress,
            on_result=on_result,
        )
        parsed_results = [
            self.parser(result.response) if result.response and not result.error else None
            for result in results
        ]
        parse_failed = sum(
            1
            for result, parsed in zip(results, parsed_results)
            if result.error or parsed is None
        )
        aggregate = self.aggregator(input_data, results, parsed_results)
        return GenericSimulationResult(
            simulation_type=self.simulation_type,
            input=input_data,
            total_responses=len(results),
            parse_failed=parse_failed,
            metrics=aggregate.get("metrics", {}),
            segments=aggregate.get("segments", demographic_segments(results, parsed_results)),
            insights=aggregate.get("insights", []),
            raw_results=results,
            parsed_results=parsed_results,
        )


def parse_reason(response: str) -> str:
    match = re.search(r"이유[:\s]*(.+?)(?:\n|$)", response, re.DOTALL)
    if match:
        return match.group(1).strip()[:240]
    return response.strip()[:240]


def parse_score(response: str, label: str = "점수") -> int | None:
    match = re.search(rf"{label}[:\s]*([1-5])", response)
    return int(match.group(1)) if match else None


def parse_choice(response: str, valid: list[str]) -> str | None:
    valid_set = set(valid)
    match = re.search(r"선택[:\s]*([A-J])", response)
    if match and match.group(1) in valid_set:
        return match.group(1)
    for char in response.upper():
        if char in valid_set:
            return char
    return None


def parse_label(response: str, label: str, allowed: list[str]) -> str | None:
    match = re.search(rf"{label}[:\s]*({'|'.join(map(re.escape, allowed))})", response)
    if match:
        return match.group(1)
    return next((value for value in allowed if value in response), None)


def parse_line(response: str, label: str, limit: int = 240) -> str:
    for line in response.splitlines():
        cleaned = re.sub(r"^\s*[-*]\s*", "", line).replace("**", "").strip()
        match = re.match(rf"^{re.escape(label)}\s*[:：-]\s*(.+?)\s*$", cleaned)
        if match:
            return match.group(1).strip()[:limit]
    return ""


def age_bucket(age: Any) -> str:
    if not isinstance(age, int):
        return "unknown"
    if age < 20:
        return "10대"
    if age < 30:
        return "20대"
    if age < 40:
        return "30대"
    if age < 50:
        return "40대"
    if age < 60:
        return "50대"
    if age < 70:
        return "60대"
    return "70대+"


def sample_summary(raw_results: list[SimResult]) -> dict[str, Any]:
    age = Counter()
    sex = Counter()
    province = Counter()
    occupation = Counter()
    education = Counter()
    for raw in raw_results:
        persona = raw.persona
        age[age_bucket(persona.get("age"))] += 1
        if persona.get("sex"):
            sex[str(persona["sex"])] += 1
        if persona.get("province"):
            province[str(persona["province"])] += 1
        if persona.get("occupation"):
            occupation[str(persona["occupation"])] += 1
        if persona.get("education_level"):
            education[str(persona["education_level"])] += 1
    return {
        "actual_sample_size": len(raw_results),
        "age_buckets": dict(age),
        "sex": dict(sex),
        "province": dict(province),
        "occupation_top10": occupation.most_common(10),
        "education": dict(education),
    }


def quality(total_responses: int, parse_failed: int) -> dict[str, Any]:
    parse_success = max(0, total_responses - parse_failed)
    parse_success_rate = round(parse_success / total_responses * 100, 1) if total_responses else 0.0
    if total_responses >= 200:
        sample_grade = "A"
    elif total_responses >= 50:
        sample_grade = "B"
    elif total_responses >= 10:
        sample_grade = "C"
    else:
        sample_grade = "D"
    if parse_success_rate >= 90 and total_responses >= 50:
        overall = "A"
    elif parse_success_rate >= 80 and total_responses >= 10:
        overall = "B"
    else:
        overall = "C"
    return {
        "parse_success_rate": parse_success_rate,
        "sample_quality_grade": sample_grade,
        "overall_grade": overall,
    }


def quality_warnings(total_responses: int, parse_failed: int, extra: list[str] | None = None) -> list[str]:
    result: list[str] = []
    q = quality(total_responses, parse_failed)
    if total_responses < 50:
        result.append("표본이 50명 미만이므로 결과는 방향성 확인용입니다.")
    if q["parse_success_rate"] < 85:
        result.append("응답 파싱 성공률이 낮아 결과 해석에 주의가 필요합니다.")
    result.extend(extra or [])
    return result


def demographic_segments(
    raw_results: list[SimResult],
    parsed_results: list[dict[str, Any] | None],
    key: str = "primary",
) -> dict[str, Any]:
    by_age: dict[str, Counter] = defaultdict(Counter)
    by_sex: dict[str, Counter] = defaultdict(Counter)
    by_province: dict[str, Counter] = defaultdict(Counter)
    for raw, parsed in zip(raw_results, parsed_results):
        if parsed is None:
            continue
        value = parsed.get(key) or parsed.get("choice") or parsed.get("intent") or parsed.get("segment")
        if value is None:
            continue
        value = str(value)
        persona = raw.persona
        by_age[age_bucket(persona.get("age"))][value] += 1
        if persona.get("sex"):
            by_sex[str(persona["sex"])][value] += 1
        if persona.get("province"):
            by_province[str(persona["province"])][value] += 1
    return {
        "breakdown_by_age": {k: dict(v) for k, v in by_age.items()},
        "breakdown_by_sex": {k: dict(v) for k, v in by_sex.items()},
        "breakdown_by_province": {k: dict(v) for k, v in by_province.items()},
    }


def top_counts(values: list[str], limit: int = 10) -> list[dict[str, Any]]:
    return [
        {"label": label, "count": count}
        for label, count in Counter(value for value in values if value).most_common(limit)
    ]


def pct(count: int, total: int) -> float:
    return round(count / total * 100, 1) if total else 0.0
