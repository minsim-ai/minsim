import { useCallback, useEffect, useRef, useState } from "react";
import { generateIntakeCandidates, getIntakeSession, listIntakeHistory, saveIntakeSession } from "../../api/intake";
import { advanceIntakeSession, createInitialIntakeSession } from "../../intake/planner";
import { buildCreativeTestingPayload, buildGenericSimulationPayload, buildIntakeRunProvenance } from "../../intake/payloadBuilder";
import { asString, asStringArray, createSlot, upsertSlot } from "../../intake/slotUtils";
import type { CreativeCandidate, CreativeCandidateAngle, IntakeSession, IntakeSlotValue } from "../../intake/types";
import type { IntakeCreativeCandidate, IntakeHistoryItem, IntakeSessionResponse, JsonObject, RunCreateRequest, SimulationType } from "../../types/api";
import { AssumptionReviewMessage } from "./AssumptionReviewMessage";
import { CandidateReviewMessage } from "./CandidateReviewMessage";
import { DynamicFormMessage } from "./DynamicFormMessage";
import { ThinkingIndicator } from "../ThinkingIndicator";

export function GoalFirstChatFlow({
  onStart,
  selectedSimulationType,
  startFresh = false,
  runDisabled = false,
  runDisabledMessage,
  storageNamespace = "anonymous",
}: {
  onStart: (payload: RunCreateRequest, intakeSessionId: string) => void;
  selectedSimulationType: SimulationType;
  startFresh?: boolean;
  runDisabled?: boolean;
  runDisabledMessage?: string;
  storageNamespace?: string;
}) {
  const [session, setSession] = useState<IntakeSession>(() => createInitialIntakeSession());
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<IntakeHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [revealedAssistantKey, setRevealedAssistantKey] = useState<string | null>(null);
  const restoreCompletedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const savedSessionKey = `koresim:lastIntakeSessionId:${storageNamespace}:${selectedSimulationType}`;

  const refreshHistory = useCallback(() => {
    listIntakeHistory(8)
      .then((response) => {
        setHistory(response.items);
        setHistoryError(null);
      })
      .catch(() => {
        setHistoryError("대화 히스토리를 불러오지 못했습니다.");
      });
  }, []);

  useEffect(() => {
    if (startFresh) {
      window.localStorage.removeItem(savedSessionKey);
      setSession(createInitialIntakeSession());
      restoreCompletedRef.current = true;
      refreshHistory();
      return;
    }

    const savedSessionId = window.localStorage.getItem(savedSessionKey);
    if (!savedSessionId) {
      setInput("");
      setSession(createInitialIntakeSession());
      restoreCompletedRef.current = true;
      refreshHistory();
      return;
    }

    let cancelled = false;
    getIntakeSession(savedSessionId)
      .then((response) => {
        if (!cancelled && isIntakeSessionSnapshot(response.snapshot)) {
          setSession(response.snapshot);
        }
      })
      .catch(() => {
        window.localStorage.removeItem(savedSessionKey);
      })
      .finally(() => {
        restoreCompletedRef.current = true;
        refreshHistory();
      });

    return () => {
      cancelled = true;
    };
  }, [refreshHistory, savedSessionKey, startFresh]);

  useEffect(() => {
    if (!restoreCompletedRef.current) return;
    if (session.turnCount === 0) return;
    const timeout = window.setTimeout(() => {
      void saveIntakeSession({
        session_id: session.id,
        status: session.status,
        snapshot: session as unknown as JsonObject,
      }).then((response) => {
        window.localStorage.setItem(savedSessionKey, response.session_id);
        setHistory((prev) => upsertHistory(prev, historyItemFromSessionResponse(response)));
      }).catch(() => {
        // Intake persistence is helpful for recovery, but should not block an active run.
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [savedSessionKey, session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [revealedAssistantKey, session.messages.length, session.action?.type]);

  const submitText = () => {
    if (!input.trim()) return;
    setSession((prev) => advanceIntakeSession(prev, {
      type: "user_message",
      content: input.trim(),
      selectedSimulationType,
    }));
    setInput("");
  };

  const updateReadySampleSize = (sampleSize: number) => {
    const clamped = clampRunSampleSize(sampleSize);
    setSession((prev) => {
      if (prev.action?.type !== "run_ready") return prev;
      const nextSlots = upsertSlot(
        prev.slots,
        createSlot("sample_size", clamped, "user", 0.99, "run_ready_sample_control", false),
      );
      const nextSession = { ...prev, slots: nextSlots };
      const payload = prev.action.payload.simulation_type === "creative_testing"
        ? buildCreativeTestingPayload(nextSession)
        : buildGenericSimulationPayload(nextSession);
      return {
        ...nextSession,
        action: {
          ...prev.action,
          payload,
          provenance: buildIntakeRunProvenance(nextSession),
        },
      };
    });
  };

  const action = session.action;
  const inputPlaceholder = action?.type === "ask_question" ? placeholderForQuestion(action.slotIds) : "";
  const lastAssistantMessageIndex = findLastAssistantMessageIndex(session.messages);
  const lastAssistantMessage = lastAssistantMessageIndex >= 0 ? session.messages[lastAssistantMessageIndex] : null;
  const lastAssistantMessageKey = lastAssistantMessage
    ? `${session.id}:${lastAssistantMessageIndex}:${lastAssistantMessage.content}`
    : null;
  const shouldDelayLatestAssistant = session.turnCount > 0;
  const isLatestAssistantRevealed = !shouldDelayLatestAssistant || !lastAssistantMessageKey || revealedAssistantKey === lastAssistantMessageKey;

  useEffect(() => {
    if (!lastAssistantMessageKey) return;
    if (!shouldDelayLatestAssistant) {
      setRevealedAssistantKey(lastAssistantMessageKey);
      return;
    }
    setRevealedAssistantKey(null);
    const timeout = window.setTimeout(() => {
      setRevealedAssistantKey(lastAssistantMessageKey);
    }, randomThinkingDelayMs());
    return () => window.clearTimeout(timeout);
  }, [lastAssistantMessageKey, shouldDelayLatestAssistant]);

  return (
    <section className="ks-chat-box ks-goal-chat" aria-label="목표 기반 시뮬레이션">
      <div className="ks-goal-chat-head">
        <span className="ks-preset-kicker">목표 먼저 입력</span>
        <h2>원하는 결정을 먼저 말해주세요</h2>
      </div>
      <IntakeHistoryPanel
        currentSessionId={session.id}
        error={historyError}
        sessions={history}
        onRefresh={refreshHistory}
        onSelect={(sessionId) => {
          getIntakeSession(sessionId)
            .then((response) => {
              if (!isIntakeSessionSnapshot(response.snapshot)) return;
              setSession(response.snapshot);
              window.localStorage.setItem(savedSessionKey, sessionId);
            })
            .catch(() => {
              setHistoryError("선택한 대화를 불러오지 못했습니다.");
            });
        }}
        onStartNew={() => {
          const fresh = createInitialIntakeSession();
          setInput("");
          setSession(fresh);
          window.localStorage.removeItem(savedSessionKey);
        }}
      />
      <div className="ks-chat-history">
        {session.messages.map((message, index) => (
          message.role === "user" ? (
            <div className="ks-msg-user" key={`${message.role}-${index}`}>
              <div className="ks-msg-body">{message.content}</div>
            </div>
          ) : (
            <AssistantMessage key={`${message.role}-${index}`} thinking={index === lastAssistantMessageIndex && !isLatestAssistantRevealed}>
              {message.content}
            </AssistantMessage>
          )
        ))}
      </div>

      <div className="ks-chat-active">
        {isLatestAssistantRevealed && action?.type === "ask_question" && (
          <div className="ks-input-wrap">
            <textarea
              className="ks-chat-textarea"
              rows={3}
              value={input}
              placeholder={inputPlaceholder}
              onChange={(event) => setInput(event.target.value)}
              onPaste={(event) => {
                event.preventDefault();
                const pasted = event.clipboardData.getData("text");
                const target = event.currentTarget;
                const start = target.selectionStart ?? input.length;
                const end = target.selectionEnd ?? input.length;
                setInput(`${input.slice(0, start)}${pasted}${input.slice(end)}`);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitText();
                }
              }}
            />
            <div className="ks-input-actions">
              <button className="ks-send-btn" type="button" aria-label="전송" onClick={submitText}>
                ↑
              </button>
            </div>
          </div>
        )}

        {isLatestAssistantRevealed && action?.type === "show_form" && (
          <DynamicFormMessage
            form={action.form}
            simulationType={session.taskFrame?.primarySimulationType ?? undefined}
            onSubmit={(values) => setSession((prev) => advanceIntakeSession(prev, { type: "form_submit", values }))}
          />
        )}

        {isLatestAssistantRevealed && action?.type === "candidate_review" && (
          <>
            <AssistantMessage>{action.message}</AssistantMessage>
            <LlmCandidateReview
              session={session}
              fallbackCandidates={action.candidates}
              fallbackAssumptions={action.assumptions}
              onAccept={(candidates, assumptions) => {
                setSession((prev) => advanceIntakeSession(prev, { type: "candidate_accept", candidates, assumptions }));
              }}
            />
          </>
        )}

        {isLatestAssistantRevealed && action?.type === "confirm_assumptions" && (
          <>
            <AssistantMessage>{action.message}</AssistantMessage>
            <AssumptionReviewMessage
              assumptions={action.assumptions}
              simulationType={selectedSimulationType}
              onConfirm={() => setSession((prev) => advanceIntakeSession(prev, { type: "confirm_assumptions" }))}
            />
          </>
        )}

        {isLatestAssistantRevealed && action?.type === "repair_input" && (
          <div className="ks-intake-repair">
            <AssistantMessage>{action.message}</AssistantMessage>
            <button className="ks-chat-btn ks-chat-btn--secondary" type="button" onClick={() => setSession(createInitialIntakeSession())}>
              처음부터 다시
            </button>
          </div>
        )}

        {isLatestAssistantRevealed && action?.type === "run_ready" && (
          <div className="ks-run-ready">
            <AssistantMessage>{action.message}</AssistantMessage>
            <RunSummary
              payload={action.payload}
              assumptionCount={action.assumptions.length}
              generatedCount={Object.keys(action.provenance.generated).length}
              inferredCount={Object.keys(action.provenance.inferred).length}
              onSampleSizeChange={updateReadySampleSize}
            />
            <div className="ks-chat-actions">
              <button className="ks-chat-btn ks-chat-btn--secondary" type="button" onClick={() => setSession(createInitialIntakeSession())}>
                새로 시작
              </button>
              <div className="ks-run-start-stack">
                {runDisabled && runDisabledMessage && (
                  <p className="ks-quota-inline">{runDisabledMessage}</p>
                )}
                <button
                  className="ks-chat-btn ks-chat-btn--primary"
                  disabled={runDisabled}
                  type="button"
                  onClick={() => onStart(action.payload, session.id)}
                >
                시뮬레이션 시작
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <button className="ks-chat-reset" type="button" onClick={() => setSession(createInitialIntakeSession())}>
        처음부터 다시
      </button>
      <div ref={bottomRef} />
    </section>
  );
}

function placeholderForQuestion(slotIds: string[]): string {
  if (slotIds.includes("product_description")) return "예: 블로그를 자동으로 작성해주는 윈도우 프로그램이에요";
  if (slotIds.includes("goal")) return "예: 제 상품 상세페이지 헤드라인을 만들고 싶어요";
  return "답변을 입력해주세요";
}

function AssistantMessage({
  children,
  thinking = false,
  thinkingCopy = "생각중입니다..",
}: {
  children?: string;
  thinking?: boolean;
  thinkingCopy?: string;
}) {
  return (
    <div className="ks-msg-system">
      {thinking ? (
        <>
          <span className="ks-thinking-copy">{thinkingCopy}</span>
          <ThinkingIndicator />
        </>
      ) : (
        <span>{children}</span>
      )}
    </div>
  );
}

function findLastAssistantMessageIndex(messages: IntakeSession["messages"]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return index;
  }
  return -1;
}

function randomThinkingDelayMs(): number {
  return Math.floor(3000 + Math.random() * 2000);
}

function IntakeHistoryPanel({
  currentSessionId,
  error,
  sessions,
  onRefresh,
  onSelect,
  onStartNew,
}: {
  currentSessionId: string;
  error: string | null;
  sessions: IntakeHistoryItem[];
  onRefresh: () => void;
  onSelect: (sessionId: string) => void;
  onStartNew: () => void;
}) {
  return (
    <details className="ks-intake-history">
      <summary>
        <span>최근 대화</span>
        <small>{sessions.length}개</small>
      </summary>
      <div className="ks-intake-history-panel">
        <div className="ks-intake-history-actions">
          <button className="ks-intake-link-btn" type="button" onClick={onStartNew}>
            새 대화
          </button>
          <button className="ks-intake-link-btn" type="button" onClick={onRefresh}>
            새로고침
          </button>
        </div>
        {error && <p className="ks-intake-history-error">{error}</p>}
        {sessions.length === 0 ? (
          <p className="ks-intake-history-empty">저장된 대화가 아직 없습니다.</p>
        ) : (
          <div className="ks-intake-history-list">
            {sessions.map((item) => (
              <article
                className={`ks-intake-history-item${item.session_id === currentSessionId ? " ks-intake-history-item--active" : ""}`}
                key={item.session_id}
              >
                <button className="ks-intake-history-open" type="button" onClick={() => onSelect(item.session_id)}>
                  <span>{item.title || "새 intake 대화"}</span>
                  <small>{statusLabel(item.status)} · {formatHistoryDate(item.updated_at)}</small>
                </button>
                <div className="ks-intake-history-transcript">
                  {item.messages.slice(0, 6).map((message, index) => (
                    <p className={`ks-intake-history-message ks-intake-history-message--${message.role}`} key={`${item.session_id}-${index}`}>
                      <b>{message.role === "user" ? "사용자" : "AI"}</b>
                      <span>{message.content}</span>
                    </p>
                  ))}
                  {item.messages.length > 6 && (
                    <p className="ks-intake-history-more">+ {item.messages.length - 6}개 메시지 더 있음</p>
                  )}
                </div>
                {item.run_id && (
                  <a className="ks-intake-history-result" href={`/results?run_id=${encodeURIComponent(item.run_id)}`}>
                    결과물 바로가기
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function upsertHistory(history: IntakeHistoryItem[], item: IntakeHistoryItem): IntakeHistoryItem[] {
  return [item, ...history.filter((session) => session.session_id !== item.session_id)]
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, 8);
}

function historyItemFromSessionResponse(response: IntakeSessionResponse): IntakeHistoryItem {
  const session = isIntakeSessionSnapshot(response.snapshot) ? response.snapshot : null;
  return {
    session_id: response.session_id,
    status: response.status,
    title: response.title || (session ? sessionTitle(session) : "새 intake 대화"),
    run_id: response.run_id,
    messages: session?.messages.map((message) => ({
      role: message.role,
      content: message.content,
      created_at: response.updated_at,
    })) ?? [],
    created_at: response.created_at,
    updated_at: response.updated_at,
  };
}

function sessionTitle(session: IntakeSession): string {
  const firstUser = session.messages.find((message) => message.role === "user")?.content;
  const product = asString(session.slots.product_description);
  return (firstUser || product || "새 intake 대화").slice(0, 64);
}

function statusLabel(status: string): string {
  if (status === "ready") return "준비됨";
  if (status === "reviewing") return "검토 중";
  return "작성 중";
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function LlmCandidateReview({
  session,
  fallbackCandidates,
  fallbackAssumptions,
  onAccept,
}: {
  session: IntakeSession;
  fallbackCandidates: CreativeCandidate[];
  fallbackAssumptions: IntakeSlotValue[];
  onAccept: (candidates: CreativeCandidate[], assumptions: IntakeSlotValue[]) => void;
}) {
  const [candidates, setCandidates] = useState(fallbackCandidates);
  const [assumptions, setAssumptions] = useState(fallbackAssumptions);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;
    setCandidates(fallbackCandidates);
    setAssumptions(fallbackAssumptions);
    setStatus("loading");

    const targetCustomers = [
      ...asStringArray(session.slots.target_customers),
      ...fallbackAssumptions
        .filter((assumption) => assumption.slotId === "target_customers" && typeof assumption.value === "string")
        .map((assumption) => String(assumption.value)),
    ].slice(0, 5);

    generateIntakeCandidates({
      product_description: asString(session.slots.product_description) || session.taskFrame?.userGoal || "제품",
      target_customers: targetCustomers,
      main_benefit: asString(session.slots.main_benefit) || null,
      tone: asString(session.slots.tone) || null,
      count: 4,
    })
      .then((response) => {
        if (cancelled) return;
        setCandidates(response.candidates.map(toCreativeCandidate));
        setAssumptions(mergeAssumptions(fallbackAssumptions, response.assumptions.map(toSlotAssumption)));
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("fallback");
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackAssumptions, fallbackCandidates, session.id, session.slots, session.taskFrame?.userGoal]);

  if (status === "loading") {
    return <AssistantMessage thinking thinkingCopy="LLM으로 후보를 생성하는 중입니다" />;
  }

  return (
    <>
      {status === "fallback" && (
        <AssistantMessage>LLM 후보 생성이 지연되어 우선 로컬 후보를 보여드립니다. 수정 후 그대로 진행할 수 있습니다.</AssistantMessage>
      )}
      <CandidateReviewMessage
        candidates={candidates}
        assumptions={assumptions}
        onAccept={(acceptedCandidates) => onAccept(acceptedCandidates, assumptions)}
      />
    </>
  );
}

function toCreativeCandidate(candidate: IntakeCreativeCandidate): CreativeCandidate {
  return {
    id: candidate.id,
    text: candidate.text,
    angle: normalizeAngle(candidate.angle),
    why: candidate.why,
    source: "generated",
  };
}

function normalizeAngle(angle: string): CreativeCandidateAngle {
  if (angle === "outcome" || angle === "pain_relief" || angle === "automation" || angle === "differentiation" || angle === "trust") {
    return angle;
  }
  return "differentiation";
}

function toSlotAssumption(assumption: { slot_id: string; value: unknown; confidence: number }): IntakeSlotValue {
  return {
    slotId: assumption.slot_id,
    value: assumption.value,
    source: "generated",
    confidence: assumption.confidence,
    evidence: "llm_candidate_generation",
    needsUserReview: true,
    reviewed: false,
  };
}

function mergeAssumptions(base: IntakeSlotValue[], incoming: IntakeSlotValue[]): IntakeSlotValue[] {
  const seen = new Set<string>();
  return [...base, ...incoming].filter((assumption) => {
    const key = `${assumption.slotId}:${JSON.stringify(assumption.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isIntakeSessionSnapshot(value: unknown): value is IntakeSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<IntakeSession>;
  return (
    typeof candidate.id === "string" &&
    (candidate.status === "collecting" || candidate.status === "reviewing" || candidate.status === "ready") &&
    Array.isArray(candidate.messages) &&
    Boolean(candidate.slots && typeof candidate.slots === "object")
  );
}

function RunSummary({
  payload,
  assumptionCount,
  generatedCount,
  inferredCount,
  onSampleSizeChange,
}: {
  payload: RunCreateRequest;
  assumptionCount: number;
  generatedCount: number;
  inferredCount: number;
  onSampleSizeChange: (sampleSize: number) => void;
}) {
  const input = payload.input;
  const creatives = typeof input === "object" && "creatives" in input && Array.isArray(input.creatives)
    ? input.creatives
    : [];
  const sampleSize = clampRunSampleSize(payload.sample_size ?? 50);
  const [sampleInput, setSampleInput] = useState(String(sampleSize));

  useEffect(() => {
    setSampleInput(String(sampleSize));
  }, [sampleSize]);

  const commitSampleInput = () => {
    const parsed = Number(sampleInput);
    const next = Number.isFinite(parsed) ? parsed : sampleSize;
    onSampleSizeChange(next);
    setSampleInput(String(clampRunSampleSize(next)));
  };

  return (
    <>
      <div className="ks-run-summary">
        <span>목적: {simulationLabel(payload.simulation_type)}</span>
        <span>{creatives.length > 0 ? `후보: ${creatives.length}개` : "입력: 준비됨"}</span>
        <span>표본: {sampleSize}명</span>
        <span>가정: {assumptionCount}개 기록</span>
        <span>출처: 추론 {inferredCount} · 생성 {generatedCount}</span>
      </div>
      <div className="ks-run-sample-control">
        <div>
          <strong>표본 수</strong>
          <p>빠른 확인은 50명, 더 안정적인 비교는 200명으로 실행하세요.</p>
        </div>
        <div className="ks-run-sample-inputs">
          <input
            aria-label="표본 수"
            max={200}
            min={50}
            step={10}
            type="range"
            value={sampleSize}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              setSampleInput(String(next));
              onSampleSizeChange(next);
            }}
          />
          <input
            aria-label="표본 수 직접 입력"
            max={200}
            min={50}
            step={10}
            type="number"
            value={sampleInput}
            onBlur={commitSampleInput}
            onChange={(event) => setSampleInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
          <span>명</span>
        </div>
      </div>
    </>
  );
}

function clampRunSampleSize(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(50, Math.min(Math.round(value), 200));
}

function simulationLabel(simulationType: RunCreateRequest["simulation_type"]): string {
  const labels: Record<RunCreateRequest["simulation_type"], string> = {
    startup_item_validation: "창업 아이템 검증",
    creative_testing: "크리에이티브 비교",
    price_optimization: "가격 최적화",
    product_launch: "신제품 반응",
    value_proposition: "가치 제안",
    market_segmentation: "시장 세분화",
    competitive_positioning: "경쟁 포지셔닝",
    brand_perception: "브랜드 인식",
    churn_prediction: "이탈 예측",
    campaign_strategy: "캠페인 전략",
    campus_policy: "정책 찬반",
    campus_priority: "우선순위",
    open_survey: "자유 설문",
  };
  return labels[simulationType] ?? simulationType;
}
