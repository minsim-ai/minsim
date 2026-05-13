import type { IntakeSlotValue } from "../../intake/types";

export function AssumptionReviewMessage({
  assumptions,
  onConfirm,
}: {
  assumptions: IntakeSlotValue[];
  onConfirm: () => void;
}) {
  return (
    <div className="ks-assumption-review">
      <div className="ks-assumption-box">
        <span className="ks-assumption-title">확인할 가정</span>
        {assumptions.map((assumption, index) => (
          <span key={`${assumption.slotId}-${index}`}>
            {assumptionLabel(assumption.slotId)}: {String(assumption.value)}
          </span>
        ))}
      </div>
      <div className="ks-chat-actions">
        <button className="ks-chat-btn ks-chat-btn--primary" type="button" onClick={onConfirm}>
          가정 확인
        </button>
      </div>
    </div>
  );
}

function assumptionLabel(slotId: string): string {
  const labels: Record<string, string> = {
    creative_surface: "문구 위치",
    target_customers: "핵심 고객",
    main_benefit: "장점",
  };
  return labels[slotId] ?? slotId;
}
