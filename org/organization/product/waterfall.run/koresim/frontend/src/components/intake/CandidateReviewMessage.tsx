import { useEffect, useState } from "react";
import type { CreativeCandidate, IntakeSlotValue } from "../../intake/types";

export function CandidateReviewMessage({
  candidates,
  assumptions,
  onAccept,
}: {
  candidates: CreativeCandidate[];
  assumptions: IntakeSlotValue[];
  onAccept: (candidates: CreativeCandidate[]) => void;
}) {
  const [drafts, setDrafts] = useState(candidates);

  useEffect(() => {
    setDrafts(candidates);
  }, [candidates]);

  const updateCandidate = (candidateId: string, text: string) => {
    setDrafts((prev) => prev.map((candidate) => candidate.id === candidateId ? { ...candidate, text } : candidate));
  };
  const removeCandidate = (candidateId: string) => {
    setDrafts((prev) => prev.filter((candidate) => candidate.id !== candidateId));
  };
  const addCandidate = () => {
    setDrafts((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        text: "",
        angle: "differentiation",
        why: "사용자가 직접 추가한 후보입니다.",
        source: "user",
      },
    ]);
  };

  const validCount = drafts.filter((candidate) => candidate.text.trim()).length;

  return (
    <div className="ks-candidate-review">
      {assumptions.length > 0 && (
        <div className="ks-assumption-box">
          <span className="ks-assumption-title">사용할 가정</span>
          {assumptions.map((assumption, index) => (
            <span key={`${assumption.slotId}-${index}`}>{String(assumption.value)}</span>
          ))}
        </div>
      )}
      <div className="ks-candidate-list">
        {drafts.map((candidate, index) => (
          <div className="ks-candidate-card" key={candidate.id}>
            <div className="ks-candidate-meta">
              <span>{String.fromCharCode(65 + index)}</span>
              <small>{angleLabel(candidate.angle)}</small>
            </div>
            <textarea
              className="ks-candidate-textarea"
              value={candidate.text}
              rows={2}
              onChange={(event) => updateCandidate(candidate.id, event.target.value)}
            />
            <p>{candidate.why}</p>
            <button className="ks-intake-link-btn" type="button" onClick={() => removeCandidate(candidate.id)}>
              삭제
            </button>
          </div>
        ))}
      </div>
      <div className="ks-chat-actions">
        <button className="ks-chat-btn ks-chat-btn--secondary" type="button" onClick={addCandidate}>
          후보 추가
        </button>
        <button
          className="ks-chat-btn ks-chat-btn--primary"
          type="button"
          disabled={validCount < 2 || validCount > 10}
          onClick={() => onAccept(drafts.filter((candidate) => candidate.text.trim()))}
        >
          이대로 시뮬레이션
        </button>
      </div>
    </div>
  );
}

function angleLabel(angle: CreativeCandidate["angle"]): string {
  const labels: Record<CreativeCandidate["angle"], string> = {
    outcome: "결과",
    pain_relief: "문제 해결",
    automation: "자동화",
    differentiation: "차별화",
    trust: "신뢰",
  };
  return labels[angle];
}
