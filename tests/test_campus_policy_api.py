"""campus_policy 관련 신규 API 엔드포인트 계약."""
import json

import pytest
from fastapi.testclient import TestClient

from src.api.main import create_app
from src.llm.base import LLMResponse


class StubDraftClient:
    async def generate(self, request) -> LLMResponse:
        payload = {
            "current_state": "평일 09-23시, 주말 10-18시 운영.",
            "proposed_change": "1층 열람실만 연중 24시간 개방.",
            "tradeoffs": "연간 운영비 1.2억 증가.",
        }
        return LLMResponse(
            content=json.dumps(payload, ensure_ascii=False),
            provider="fake",
            provider_model="stub",
        )


@pytest.fixture
def client():
    app = create_app()
    app.state.llm_client = StubDraftClient()
    with TestClient(app) as test_client:
        yield test_client


def test_policy_draft_fills_empty_fields_and_marks_them(client):
    response = client.post(
        "/api/intake/policy-draft", json={"agenda": "중앙도서관 24시간 개방"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["fields"]["current_state"]
    assert set(body["ai_generated"]) == {"current_state", "proposed_change", "tradeoffs"}


def test_policy_draft_does_not_overwrite_user_input(client):
    response = client.post(
        "/api/intake/policy-draft",
        json={"agenda": "중앙도서관 24시간 개방", "fields": {"current_state": "내가 쓴 값"}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["fields"]["current_state"] == "내가 쓴 값"
    assert "current_state" not in body["ai_generated"]


def test_policy_draft_rejects_empty_agenda(client):
    assert client.post("/api/intake/policy-draft", json={"agenda": ""}).status_code == 422


def test_survey_endpoint_409s_when_result_missing(client):
    response = client.get("/api/runs/does-not-exist/survey")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "RESULT_NOT_READY"


def test_persuasion_409s_when_result_missing(client):
    response = client.post(
        "/api/projects/p/runs/does-not-exist/persuasion", json={"condition": "외주 경비"}
    )
    assert response.status_code in {401, 404, 409}


def test_persuasion_rejects_empty_condition(client):
    response = client.post("/api/projects/p/runs/r/persuasion", json={"condition": ""})
    assert response.status_code == 422


def test_opposed_cohort_selects_only_opposers():
    from src.services.followup_service import select_cohort_subset

    rows = [
        {"uuid": "a", "parsed": {"stance": "반대", "reason": "비용"}},
        {"uuid": "b", "parsed": {"stance": "찬성", "reason": "편의"}},
        {"uuid": "c", "stance": "반대"},
    ]
    picked = {item["uuid"] for item in select_cohort_subset(rows, "opposed")}
    assert picked == {"a", "c"}
