import { useCallback, useEffect, useRef, useState } from "react";
import { generateIntakeCandidates, getIntakeSession, listIntakeHistory, saveIntakeSession } from "../../api/intake";
import { advanceIntakeSession, createInitialIntakeSession } from "../../intake/planner";
import { asString, asStringArray } from "../../intake/slotUtils";
import type { CreativeCandidate, CreativeCandidateAngle, IntakeSession, IntakeSlotValue } from "../../intake/types";
import type { IntakeCreativeCandidate, IntakeHistoryItem, IntakeSessionResponse, JsonObject, RunCreateRequest } from "../../types/api";
import { AssumptionReviewMessage } from "./AssumptionReviewMessage";
import { CandidateReviewMessage } from "./CandidateReviewMessage";
import { DynamicFormMessage } from "./DynamicFormMessage";

const savedSessionKey = "koresim:lastIntakeSessionId";

export function GoalFirstChatFlow({
  onStart,
  startFresh = false,
}: {
  onStart: (payload: RunCreateRequest, intakeSessionId: string) => void;
  startFresh?: boolean;
}) {
  const [session, setSession] = useState<IntakeSession>(() => createInitialIntakeSession());
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<IntakeHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const restoreCompletedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
  }, [refreshHistory, startFresh]);

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
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages.length, session.action?.type]);

  const submitText = () => {
    if (!input.trim()) return;
    setSession((prev) => advanceIntakeSession(prev, { type: "user_message", content: input.trim() }));
    setInput("");
  };

  const action = session.action;
  const inputPlaceholder = action?.type === "ask_question" ? placeholderForQuestion(action.slotIds) : "";

  return (
    <section className="ks-chat-box ks-goal-chat" aria-label="목표 기반 시뮬레이션">
      <div className="ks-goal-chat-head">
        <span className="ks-preset-kicker">Goal-first intake</span>
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
            <p className="ks-msg-system" key={`${message.role}-${index}`}>{message.content}</p>
          )
        ))}
      </div>

      <div className="ks-chat-active">
        {action?.type === "ask_question" && (
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

        {action?.type === "show_form" && (
          <DynamicFormMessage
            form={action.form}
            onSubmit={(values) => setSession((prev) => advanceIntakeSession(prev, { type: "form_submit", values }))}
          />
        )}

        {action?.type === "candidate_review" && (
          <>
            <p className="ks-msg-system">{action.message}</p>
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

        {action?.type === "confirm_assumptions" && (
          <>
            <p className="ks-msg-system">{action.message}</p>
            <AssumptionReviewMessage
              assumptions={action.assumptions}
              onConfirm={() => setSession((prev) => advanceIntakeSession(prev, { type: "confirm_assumptions" }))}
            />
          </>
        )}

        {action?.type === "repair_input" && (
          <div className="ks-intake-repair">
            <p className="ks-msg-system">{action.message}</p>
            <button className="ks-chat-btn ks-chat-btn--secondary" type="button" onClick={() => setSession(createInitialIntakeSession())}>
              처음부터 다시
            </button>
          </div>
        )}

        {action?.type === "run_ready" && (
          <div className="ks-run-ready">
            <p className="ks-msg-system">{action.message}</p>
            <RunSummary
              payload={action.payload}
              assumptionCount={action.assumptions.length}
              generatedCount={Object.keys(action.provenance.generated).length}
              inferredCount={Object.keys(action.provenance.inferred).length}
            />
            <div className="ks-chat-actions">
              <button className="ks-chat-btn ks-chat-btn--secondary" type="button" onClick={() => setSession(createInitialIntakeSession())}>
                새로 시작
              </button>
              <button className="ks-chat-btn ks-chat-btn--primary" type="button" onClick={() => onStart(action.payload, session.id)}>
                시뮬레이션 시작
              </button>
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
    return <p className="ks-msg-system">LLM으로 후보를 생성하는 중입니다. 잠시만 기다려주세요.</p>;
  }

  return (
    <>
      {status === "fallback" && (
        <p className="ks-msg-system">LLM 후보 생성이 지연되어 우선 로컬 후보를 보여드립니다. 수정 후 그대로 진행할 수 있습니다.</p>
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
}: {
  payload: RunCreateRequest;
  assumptionCount: number;
  generatedCount: number;
  inferredCount: number;
}) {
  const input = payload.input;
  const creatives = typeof input === "object" && "creatives" in input && Array.isArray(input.creatives)
    ? input.creatives
    : [];
  return (
    <div className="ks-run-summary">
      <span>목적: 크리에이티브 비교</span>
      <span>후보: {creatives.length}개</span>
      <span>표본: {payload.sample_size ?? 200}명</span>
      <span>가정: {assumptionCount}개 기록</span>
      <span>출처: 추론 {inferredCount} · 생성 {generatedCount}</span>
    </div>
  );
}
