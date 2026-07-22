from scripts.check_ai_agent_e2e import run_ai_agent_e2e_check


def test_ai_agent_e2e_check_writes_artifact_and_agent_runs(tmp_path) -> None:
    artifact = run_ai_agent_e2e_check(tmp_path / "artifact", sample_size=3)

    assert artifact["ok"] is True
    assert artifact["run"]["status"] == "completed"
    assert artifact["agent_runs"]["count"] == 3
    assert artifact["agent_runs"]["agents"] == ["analysis", "report", "qa"]
    assert artifact["agent_runs"]["all_scores_passed"] is True
    assert artifact["checkpoints"]["count"] == 3
    assert [row["checkpoint_name"] for row in artifact["checkpoints"]["rows"]] == [
        "analysis",
        "report",
        "qa",
    ]
    assert artifact["checkpoints"]["rows"][-1]["state_steps"] == [
        "analysis",
        "report",
        "qa",
    ]
    assert (tmp_path / "artifact" / "artifact.json").exists()
    assert (tmp_path / "artifact" / "report.md").exists()
