import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react";
import { APIError } from "./api/client";
import { recordAnalyticsEvent } from "./api/analytics";
import { getUserUsage, googleLogin } from "./api/auth";
import { linkIntakeSessionRun } from "./api/intake";
import { cancelRun, createRun, getPresets, getRun } from "./api/runs";
import { AuthStatus } from "./components/AuthStatus";
import {
  applyPublicConfig,
  clampSampleSize,
  DEFAULT_SAMPLE_SIZE,
  EVENT_BANNER,
  EVENT_MODE_ENABLED,
} from "./config/limits";
import { GoalFirstChatFlow } from "./components/intake/GoalFirstChatFlow";
import { SimulationProgress } from "./components/SimulationProgress";
import { useRunEvents } from "./hooks/useRunEvents";
import type { DemoPreset, RunCreateRequest, SimulationType, TargetFilter, UserUsageResponse } from "./types/api";
import {
  simulations,
  introPlaceholders,
  chatSteps,
} from "./data/mockData";
import {
  chatScenarioCountsBySimulation,
  chatScenarioFixtures,
  type ChatScenarioFixture,
} from "./data/chatScenarioFixtures";

/* ─── 타입 ─── */
type ChatState = {
  step: number;
  answers: Record<string, string>;
};

/* ─── 아이콘 ─── */
function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

/* ─── 시뮬레이션 선택 패널 ─── */
function SimPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (key: string) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const visible = showMore ? simulations : simulations.slice(0, 5);

  return (
    <div className="ks-sim-picker">
      <div className="ks-sim-picker-title">무엇을 시뮬레이션할까요?</div>
      <div className="ks-sim-list">
        {visible.map((sim) => (
          <button
            key={sim.key}
            className={`ks-sim-btn ${selected === sim.key ? "ks-sim-btn--active" : ""}`}
            onClick={() => onSelect(sim.key)}
          >
            <span className="ks-sim-icon">{sim.icon}</span>
            <span className="ks-sim-label">{sim.label}</span>
          </button>
        ))}
      </div>
      {!showMore && (
        <button className="ks-sim-more" onClick={() => setShowMore(true)}>
          + 더보기 ({simulations.length - 5}종)
        </button>
      )}
    </div>
  );
}

function SimulationFirstPanel({
  selected,
  onSelect,
}: {
  selected: SimulationType;
  onSelect: (key: string) => void;
}) {
  const selectedLabel = simulations.find((sim) => sim.key === selected)?.label ?? "시뮬레이션";
  return (
    <section className="ks-sim-first" aria-label="시뮬레이션 유형 선택">
      <div className="ks-sim-first-head">
        <span className="ks-preset-kicker">먼저 선택</span>
        <h2>어떤 시뮬레이션으로 볼까요?</h2>
        <p>유형을 먼저 고르면 대화에서 필요한 질문과 입력폼이 그 목적에 맞게 정리됩니다.</p>
      </div>
      <SimPicker selected={selected} onSelect={onSelect} />
      <p className="ks-sim-first-selected">현재 선택: {selectedLabel}</p>
    </section>
  );
}

function PresetSelector({
  presets,
  loading,
  onStart,
  runDisabled = false,
  runDisabledMessage,
}: {
  presets: DemoPreset[];
  loading: boolean;
  onStart: (preset: DemoPreset) => void;
  runDisabled?: boolean;
  runDisabledMessage?: string;
}) {
  if (!loading && presets.length === 0) return null;
  return (
    <section className="ks-preset-panel" aria-label="빠른 시작 프리셋">
      <div className="ks-preset-head">
        <span className="ks-preset-kicker">Quick start</span>
        <h2>30초 안에 데모 실행</h2>
      </div>
      <div className="ks-preset-grid">
        {loading ? (
          <div className="ks-preset-card ks-preset-card--muted">프리셋을 불러오는 중입니다.</div>
        ) : presets.map((preset) => (
          <button
            key={preset.id}
            className="ks-preset-card"
            disabled={runDisabled}
            type="button"
            onClick={() => onStart(preset)}
          >
            <span className="ks-preset-title">{preset.title}</span>
            <span className="ks-preset-desc">{preset.description}</span>
            <span className="ks-preset-meta">
              n={preset.sample_size} · seed {preset.seed}
              {preset.fallback_simulation_type ? " · fallback" : ""}
            </span>
            {preset.fallback_reason && (
              <span className="ks-preset-fallback">{preset.fallback_reason}</span>
            )}
            {runDisabled && runDisabledMessage && (
              <span className="ks-preset-fallback">{runDisabledMessage}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function ApiErrorBanner({ message, authRequired }: { message: string; authRequired: boolean }) {
  return (
    <div className={`ks-api-error${authRequired ? " ks-api-error--auth" : ""}`} role="alert">
      <div>
        <strong>{authRequired ? "로그인이 필요합니다" : "요청을 처리하지 못했습니다"}</strong>
        <p>{message}</p>
      </div>
      {authRequired && (
        <button className="ks-chat-btn ks-chat-btn--primary" type="button" onClick={() => googleLogin("/app")}>
          Google 로그인
        </button>
      )}
    </div>
  );
}

function QuotaPill({
  usage,
  loading,
}: {
  usage: UserUsageResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return <span className="ks-quota-pill ks-quota-pill--muted">무료 실행 확인 중</span>;
  }
  if (!usage) return null;
  if (usage.quota_bypass) {
    return <span className="ks-quota-pill">운영 계정 · 무제한</span>;
  }
  // free_run_limit <= 0 means unlimited for every authenticated account.
  if (usage.free_run_limit <= 0) {
    return <span className="ks-quota-pill">무제한 실행</span>;
  }
  const exhausted = usage.remaining_runs <= 0;
  return (
    <span className={`ks-quota-pill${exhausted ? " ks-quota-pill--exhausted" : ""}`}>
      무료 실행 {usage.remaining_runs}회 남음
    </span>
  );
}

function DevScenarioPicker({
  selectedSim,
  activeScenarioId,
  onSelect,
  onClear,
}: {
  selectedSim: SimulationType;
  activeScenarioId: string | null;
  onSelect: (scenario: ChatScenarioFixture) => void;
  onClear: () => void;
}) {
  const scenarios = useMemo(
    () => chatScenarioFixtures.filter((scenario) => scenario.simulationType === selectedSim),
    [selectedSim],
  );
  const totalCount = chatScenarioFixtures.length;
  const selectedLabel = simulations.find((sim) => sim.key === selectedSim)?.label ?? selectedSim;

  if (!import.meta.env.DEV) return null;

  return (
    <section className="ks-dev-scenarios" aria-label="개발용 채팅 시나리오">
      <div className="ks-dev-scenarios-head">
        <div>
          <span className="ks-dev-scenarios-kicker">Scenario fixtures</span>
          <h2>{selectedLabel} 대화 샘플</h2>
        </div>
        <span className="ks-dev-scenarios-count">
          {chatScenarioCountsBySimulation[selectedSim] ?? 0} / {totalCount}
        </span>
      </div>
      <div className="ks-dev-scenarios-grid">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            className={`ks-dev-scenario ${activeScenarioId === scenario.id ? "ks-dev-scenario--active" : ""}`}
            type="button"
            onClick={() => onSelect(scenario)}
          >
            <span className="ks-dev-scenario-title">{scenario.title}</span>
            <span className="ks-dev-scenario-role">{scenario.userRole}</span>
            <span className="ks-dev-scenario-intent">{scenario.userIntent}</span>
          </button>
        ))}
      </div>
      {activeScenarioId && (
        <button className="ks-dev-scenarios-clear" type="button" onClick={onClear}>
          선택 해제
        </button>
      )}
    </section>
  );
}

/* ─── 스트리밍 텍스트 ─── */
function StreamText({ text }: { text: string }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setShown(0)
    if (!text) return
    const id = setInterval(() => {
      setShown(n => {
        if (n >= text.length) { clearInterval(id); return n }
        return n + 1
      })
    }, 40)
    return () => clearInterval(id)
  }, [text])
  return <>{text.slice(0, shown)}</>
}

/* ─── 채팅 메시지 ─── */
function SystemMsg({ children }: { children: React.ReactNode }) {
  return <p className="ks-msg-system">{children}</p>;
}

function UserMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="ks-msg-user">
      <div className="ks-msg-body">{children}</div>
    </div>
  );
}

/* ─── 채팅 흐름 ─── */
function ChatFlow({
  simKey,
  onStart,
  scenario,
  runDisabled = false,
  runDisabledMessage,
}: {
  simKey: string;
  onStart: (answers: Record<string, string>) => void;
  scenario: ChatScenarioFixture | null;
  runDisabled?: boolean;
  runDisabledMessage?: string;
}) {
  const [state, setState] = useState<ChatState>({ step: 0, answers: {} });
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const steps = useMemo(() => chatSteps[simKey] ?? [], [simKey]);
  const ADVANCED_STEP = steps.length + 1;
  const DONE_STEP = steps.length + 2;

  useEffect(() => {
    setState({ step: 0, answers: {} });
    setThinking(false);
  }, [simKey]);

  useEffect(() => {
    if (!scenario || scenario.simulationType !== simKey) return;
    const answers = scenarioToAnswers(scenario);
    setState({ step: DONE_STEP, answers });
    setThinking(false);
  }, [scenario, simKey, DONE_STEP]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (thinking) return;
    if (state.step === 0) {
      textareaRef.current?.focus();
    } else if (state.step > 0 && state.step <= steps.length) {
      const cur = steps[state.step - 1];
      if (cur?.type === "textarea") textareaRef.current?.focus();
      else if (cur?.type === "text") inputRef.current?.focus();
    } else if (state.step === ADVANCED_STEP) {
      inputRef.current?.focus();
    }
  }, [state.step, thinking, steps, ADVANCED_STEP]);

  const advance = (value: string) => {
    if (thinking) return;
    if (state.step === 0 && !value.trim()) return;

    setThinking(true);
    if (textareaRef.current) textareaRef.current.value = '';
    if (inputRef.current) inputRef.current.value = '';
    const cur = state.step;
    setTimeout(() => {
      setState(prev => {
        if (cur === 0) {
          return { ...prev, answers: { ...prev.answers, intro: value.trim() }, step: 1 };
        } else if (cur <= steps.length) {
          const step = steps[cur - 1];
          return { ...prev, answers: { ...prev.answers, [step.id]: value }, step: cur + 1 };
        } else if (cur === ADVANCED_STEP) {
          return { ...prev, answers: { ...prev.answers, advanced: value }, step: DONE_STEP };
        }
        return prev;
      });
      setThinking(false);
    }, 2000);
  };

  const getCurrentValue = (): string => {
    if (state.step === 0) return textareaRef.current?.value ?? "";
    if (state.step === ADVANCED_STEP) return inputRef.current?.value ?? "";
    const cur = steps[state.step - 1];
    return cur?.type === "textarea"
      ? textareaRef.current?.value ?? ""
      : inputRef.current?.value ?? "";
  };

  const handleSend = () => advance(getCurrentValue());

  return (
    <div className="ks-chat-box">
      {/* 히스토리 */}
      <div className="ks-chat-history">
        {state.answers.intro !== undefined && (
          <>
            <SystemMsg>무엇을 시뮬레이션할까요?</SystemMsg>
            <UserMsg>{state.answers.intro}</UserMsg>
          </>
        )}
        {steps.map((step) => {
          if (!(step.id in state.answers)) return null;
          return (
            <div key={step.id}>
              <SystemMsg>{step.question}</SystemMsg>
              <UserMsg>{state.answers[step.id]}</UserMsg>
            </div>
          );
        })}
        {state.answers.advanced !== undefined && (
          <>
            <SystemMsg>타겟이나 시드를 설정하시겠어요?</SystemMsg>
            <UserMsg>{state.answers.advanced || "(기본값으로 진행)"}</UserMsg>
          </>
        )}
      </div>

      {/* 현재 입력 단계 */}
      <div className="ks-chat-active">
        {/* AI 질문 영역 */}
        {thinking ? (
          <SystemMsg>추론중..</SystemMsg>
        ) : state.step === 0 ? (
          <SystemMsg><StreamText key="step-0" text="무엇을 시뮬레이션할까요? 자유롭게 적어주세요." /></SystemMsg>
        ) : state.step > 0 && state.step <= steps.length ? (
          <SystemMsg><StreamText key={`step-${state.step}`} text={steps[state.step - 1].question} /></SystemMsg>
        ) : state.step === ADVANCED_STEP ? (
          <SystemMsg><StreamText key="advanced" text="마지막으로, 타겟을 좁히고 싶으신가요? 지역·연령·성별 등을 적거나 그냥 보내세요." /></SystemMsg>
        ) : state.step >= DONE_STEP ? (
          <SystemMsg><StreamText key="done" text="모든 정보가 준비되었습니다. 시뮬레이션을 시작할까요?" /></SystemMsg>
        ) : null}

        {/* 입력 영역 — thinking 중에도 유지, 비활성화만 */}
        {state.step === 0 && (
          <div className="ks-input-wrap">
            <textarea
              ref={textareaRef}
              className="ks-chat-textarea"
              disabled={thinking}
              placeholder={introPlaceholders[simKey] ?? ""}
              rows={3}
              onKeyDown={(e) => {
                if (!thinking && e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  advance(textareaRef.current?.value ?? "");
                }
              }}
            />
            <div className="ks-input-actions">
              <button className="ks-upload-btn" disabled={thinking} type="button" aria-label="파일 첨부">
                <UploadIcon />
              </button>
              <button className="ks-send-btn" disabled={thinking} type="button" aria-label="전송" onClick={handleSend}>
                <SendIcon />
              </button>
            </div>
          </div>
        )}

        {state.step > 0 && state.step <= steps.length && (
          steps[state.step - 1].type === "radio" ? (
            <div className="ks-chat-radio-group">
              {steps[state.step - 1].options?.map((opt) => (
                <button key={opt} className="ks-chat-radio" disabled={thinking} onClick={() => advance(opt)}>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <div className="ks-input-wrap">
              {steps[state.step - 1].type === "textarea" ? (
                <textarea
                  ref={textareaRef}
                  className="ks-chat-textarea"
                  disabled={thinking}
                  placeholder={steps[state.step - 1].placeholder ?? ""}
                  rows={4}
                  onKeyDown={(e) => {
                    if (!thinking && e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      advance(textareaRef.current?.value ?? "");
                    }
                  }}
                />
              ) : (
                <input
                  ref={inputRef}
                  className="ks-chat-input"
                  disabled={thinking}
                  type="text"
                  placeholder={steps[state.step - 1].placeholder ?? ""}
                  onKeyDown={(e) => {
                    if (!thinking && e.key === "Enter") advance(inputRef.current?.value ?? "");
                  }}
                />
              )}
              <div className="ks-input-actions">
                <button className="ks-send-btn" disabled={thinking} type="button" aria-label="전송" onClick={handleSend}>
                  <SendIcon />
                </button>
              </div>
            </div>
          )
        )}

        {state.step === ADVANCED_STEP && (
          <div className="ks-input-wrap">
            <input
              ref={inputRef}
              className="ks-chat-input"
              disabled={thinking}
              type="text"
              placeholder="예: 30~40대 서울 여성, 시드 42 (없으면 그냥 전송)"
              onKeyDown={(e) => {
                if (!thinking && e.key === "Enter") advance(inputRef.current?.value ?? "");
              }}
            />
            <div className="ks-input-actions">
              <button className="ks-send-btn" disabled={thinking} type="button" aria-label="전송" onClick={handleSend}>
                <SendIcon />
              </button>
            </div>
          </div>
        )}

        {state.step >= DONE_STEP && (
          <div className="ks-chat-actions">
            {runDisabled && runDisabledMessage && (
              <p className="ks-quota-inline">{runDisabledMessage}</p>
            )}
            <button
              className="ks-chat-btn ks-chat-btn--primary"
              disabled={runDisabled}
              onClick={() => onStart(state.answers)}
            >
              🚀 시뮬레이션 시작
            </button>
          </div>
        )}
      </div>

      {state.step > 0 && (
        <button
          className="ks-chat-reset"
          onClick={() => { setState({ step: 0, answers: {} }); setThinking(false); }}
        >
          ⟲ 처음부터 다시
        </button>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

/* ─── 메인 ─── */
type Phase = 'chat' | 'loading' | 'results';

function App() {
  const startFreshIntake = new URLSearchParams(window.location.search).get('new') === '1';
  const [selectedSim, setSelectedSim] = useState<SimulationType>("creative_testing");
  const [phase, setPhase] = useState<Phase>('chat');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [presets, setPresets] = useState<DemoPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UserUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const runEvents = useRunEvents(activeRunId, phase === 'loading');
  const runDisabled = usage?.can_create_run === false;
  const runDisabledMessage = runDisabled
    ? `무료 실행 ${usage?.free_run_limit ?? 0}회를 모두 사용했습니다. 추가 실행은 운영자에게 문의해주세요.`
    : undefined;

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    recordAnalyticsEvent({
      event_name: 'page_view',
      page: '/app',
      simulation_type: selectedSim,
      payload: {},
    }).catch(() => {
      // Analytics must not block the simulation workflow.
    });
  }, [selectedSim]);

  const handleSimChange = (key: string) => {
    setSelectedSim(key as SimulationType);
    setPhase('chat');
    setApiError(null);
    setActiveScenarioId(null);
  };

  const activeScenario = useMemo(
    () => chatScenarioFixtures.find((scenario) => scenario.id === activeScenarioId) ?? null,
    [activeScenarioId],
  );

  const refreshUsage = useCallback(() => {
    setUsageLoading(true);
    return getUserUsage()
      .then((value) => setUsage(value))
      .catch((err) => {
        if (err instanceof APIError && err.reason === 'auth_required') {
          setUsage(null);
          return;
        }
        setUsage(null);
      })
      .finally(() => setUsageLoading(false));
  }, []);

  const guardQuota = () => {
    if (!runDisabled) return true;
    setApiError(runDisabledMessage ?? '무료 실행 횟수가 남아 있지 않습니다.');
    return false;
  };

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/config')
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        if (cancelled || !config) return;
        applyPublicConfig(config);
      })
      .catch(() => {
        // Keep compiled defaults when config is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPresets()
      .then((items) => {
        if (cancelled) return;
        setPresets(items);
      })
      .catch((err) => {
        if (cancelled) return;
        setApiError(err instanceof APIError && err.reason === 'auth_required'
          ? formatError(err)
          : `프리셋을 불러오지 못했습니다. ${formatError(err)}`);
      })
      .finally(() => {
        if (!cancelled) setPresetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeRunId || phase !== 'loading') return;
    if (runEvents.snapshot?.status === 'completed' && runEvents.snapshot.result_available) {
      navigateToResults(activeRunId);
    }
    if (
      runEvents.snapshot?.status === 'failed' ||
      runEvents.snapshot?.status === 'interrupted' ||
      runEvents.snapshot?.status === 'canceled'
    ) {
      setApiError(runEvents.snapshot.error?.message ?? `Simulation ${runEvents.snapshot.status}.`);
      setPhase('chat');
    }
  }, [activeRunId, phase, runEvents.snapshot]);

  useEffect(() => {
    if (!startFreshIntake) return;
    localStorage.removeItem('koresim:lastIntakeSessionId');
    window.history.replaceState(null, '', '/app');
  }, [startFreshIntake]);

  useEffect(() => {
    if (startFreshIntake) return;
    const savedRunId = localStorage.getItem('koresim:lastRunId');
    if (!savedRunId) return;

    let cancelled = false;
    getRun(savedRunId)
      .then((snapshot) => {
        if (cancelled) return;
        if (snapshot.status === 'queued' || snapshot.status === 'running') {
          setActiveRunId(savedRunId);
          setPhase('loading');
        } else if (snapshot.status === 'failed' || snapshot.status === 'interrupted') {
          setApiError(snapshot.error?.message ?? `Previous run ${snapshot.status}.`);
        }
      })
      .catch(() => {
        localStorage.removeItem('koresim:lastRunId');
      });

    return () => {
      cancelled = true;
    };
  }, [startFreshIntake]);

  const handleStart = async (answers: Record<string, string>) => {
    if (!guardQuota()) return;
    setApiError(null);
    setPhase('loading');
    try {
      const payload = buildRunPayload(selectedSim, answers);
      const created = await createRun(payload);
      setActiveRunId(created.run_id);
      localStorage.setItem('koresim:lastRunId', created.run_id);
      void refreshUsage();
    } catch (err) {
      setPhase('chat');
      setActiveRunId(null);
      setApiError(formatError(err));
      void refreshUsage();
    }
  };

  const handleIntakeStart = async (payload: RunCreateRequest, intakeSessionId: string) => {
    if (!guardQuota()) return;
    setApiError(null);
    setActiveScenarioId(null);
    setSelectedSim(payload.simulation_type);
    setPhase('loading');
    try {
      const created = await createRun(payload);
      setActiveRunId(created.run_id);
      localStorage.setItem('koresim:lastRunId', created.run_id);
      void linkIntakeSessionRun(intakeSessionId, { run_id: created.run_id });
      void refreshUsage();
    } catch (err) {
      setPhase('chat');
      setActiveRunId(null);
      setApiError(formatError(err));
      void refreshUsage();
    }
  };

  const handlePresetStart = async (preset: DemoPreset) => {
    if (!guardQuota()) return;
    setApiError(null);
    setActiveScenarioId(null);
    setSelectedSim(preset.simulation_type);
    setPhase('loading');
    try {
      const payload = buildRunPayloadFromPreset(preset);
      const created = await createRun(payload);
      setActiveRunId(created.run_id);
      localStorage.setItem('koresim:lastRunId', created.run_id);
      void refreshUsage();
    } catch (err) {
      setPhase('chat');
      setActiveRunId(null);
      setApiError(formatError(err));
      void refreshUsage();
    }
  };

  const handleCancel = async () => {
    if (!activeRunId) return;
    try {
      const snapshot = await cancelRun(activeRunId);
      setApiError(snapshot.error?.message ?? '시뮬레이션을 취소했습니다.');
    } catch (err) {
      setApiError(formatError(err));
    } finally {
      setPhase('chat');
      setActiveRunId(null);
    }
  };

  return (
    <main className="ks-app">
      {/* 헤더 */}
      <header className="ks-header">
        <div className="ks-header-inner">
          <div className="ks-logo">
            <span className="ks-logo-mark" />
            Arabesque
          </div>
          <nav className="ks-header-menu">
            <a href="/">공개 랜딩</a>
            <a href="/results">최근 결과</a>
            <a href="/validation">검증 사례</a>
            <a href="/admin">어드민</a>
            <a href="/app" className="ks-cta">데모 실행</a>
            <QuotaPill usage={usage} loading={usageLoading} />
            <AuthStatus compact />
          </nav>
        </div>
      </header>

      {EVENT_MODE_ENABLED && EVENT_BANNER ? (
        <div
          role="status"
          style={{
            background: 'var(--color-primary, #0066FF)',
            color: '#fff',
            textAlign: 'center',
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {EVENT_BANNER}
        </div>
      ) : null}

      {/* 히어로 */}
      <section className="ks-hero">
        <h1>한국 시장 결정을 빠르게 시뮬레이션하세요</h1>
        <p>가격, 캠페인, 메시지, 출시 고민을 먼저 적으면 필요한 정보만 묻고 결과 보고서까지 생성합니다.</p>
      </section>

      {/* 메인 콘텐츠 */}
      <div className="ks-main">
        <div className="ks-layout">
          <div className="ks-content">
            {apiError && (
              <ApiErrorBanner
                message={apiError}
                authRequired={isAuthRequiredMessage(apiError)}
              />
            )}
            <SimulationFirstPanel selected={selectedSim} onSelect={handleSimChange} />
            <GoalFirstChatFlow
              onStart={handleIntakeStart}
              runDisabled={runDisabled}
              runDisabledMessage={runDisabledMessage}
              selectedSimulationType={selectedSim}
              startFresh={startFreshIntake}
              storageNamespace={usage?.user_id ?? "anonymous"}
            />
            <details className="ks-aux-panel">
              <summary>샘플 프리셋으로 빠르게 보기</summary>
              <PresetSelector
                presets={presets}
                loading={presetsLoading}
                onStart={handlePresetStart}
                runDisabled={runDisabled}
                runDisabledMessage={runDisabledMessage}
              />
            </details>
            {import.meta.env.DEV && (
              <details className="ks-aux-panel">
                <summary>개발용 대화 샘플</summary>
                <DevScenarioPicker
                  selectedSim={selectedSim}
                  activeScenarioId={activeScenarioId}
                  onSelect={(scenario) => {
                    setSelectedSim(scenario.simulationType);
                    setActiveScenarioId(scenario.id);
                    setPhase('chat');
                    setApiError(null);
                  }}
                  onClear={() => setActiveScenarioId(null)}
                />
              </details>
            )}
            <details className="ks-manual-chat">
              <summary>수동 시뮬레이션 입력</summary>
              <ChatFlow
                simKey={selectedSim}
                onStart={handleStart}
                runDisabled={runDisabled}
                runDisabledMessage={runDisabledMessage}
                scenario={activeScenario}
              />
            </details>
          </div>
        </div>
      </div>

      {phase === 'loading' && (
        <SimulationProgress
          snapshot={runEvents.snapshot}
          onComplete={() => {
            if (activeRunId) navigateToResults(activeRunId);
          }}
          onCancel={handleCancel}
        />
      )}
    </main>
  );
}

function buildRunPayloadFromPreset(preset: DemoPreset): RunCreateRequest {
  return {
    simulation_type: preset.simulation_type,
    input: preset.input,
    sample_size: preset.sample_size,
    target_filter: preset.target_filter,
    seed: preset.seed,
  };
}

function scenarioToAnswers(scenario: ChatScenarioFixture): Record<string, string> {
  return {
    intro: scenario.firstMessage,
    ...Object.fromEntries(scenario.turns.map((turn) => [turn.stepId, turn.userAnswer])),
    advanced: scenario.advancedAnswer,
  };
}

function buildRunPayload(simKey: string, answers: Record<string, string>): RunCreateRequest {
  const targetFilter = parseTargetFilter(answers.target_age ?? answers.target, answers.advanced);
  const sampleSize = parseSampleSize(answers.sample_size);
  const seed = parseSeed(answers.advanced);
  const base = {
    simulation_type: simKey as SimulationType,
    sample_size: sampleSize,
    target_filter: targetFilter,
    seed,
  };

  if (simKey === 'creative_testing') {
    return { ...base, input: { creatives: parseCreatives(answers.creatives) } };
  }
  if (simKey === 'price_optimization') {
    const usePriceResearchV2 = answers.protocol_mode?.includes('멀티턴')
    return {
      ...base,
      input: {
        ...(usePriceResearchV2 ? { protocol_id: 'price_research_v2' as const } : {}),
        product_name: firstSentence(answers.product, '가격 테스트 제품'),
        product_description: answers.product || answers.intro || '가격 민감도를 확인할 제품입니다.',
        price_points: parseNumberList(answers.prices, [4500, 5500, 6500]),
        context_note: answers.target || answers.intro || null,
        ...(usePriceResearchV2 ? { calibration: parseCalibration(answers.calibration) } : {}),
      },
    };
  }
  if (simKey === 'product_launch') {
    return {
      ...base,
      input: {
        product_concept: [answers.product, answers.spec].filter(Boolean).join('\n'),
        key_features: parseLines(answers.spec, ['핵심 기능']),
        target_use_case: answers.target || answers.intro || '초기 구매 고려 상황',
        expected_price_range: answers.price || null,
        alternatives: [],
      },
    };
  }
  if (simKey === 'value_proposition') {
    const useProductQa = answers.protocol_mode?.includes('Product QA')
    return {
      ...base,
      input: {
        ...(useProductQa ? { protocol_id: 'product_qa_v1' as const } : {}),
        ...(useProductQa ? { artifact_type: answers.artifact_type || 'landing_copy' } : {}),
        product_context: answers.context || answers.intro || '가치 제안 테스트 대상',
        statements: parseLines(answers.vps, ['첫 번째 가치 제안', '두 번째 가치 제안']).slice(0, 5),
        ...(useProductQa ? { criteria: ['명확성', '신뢰도', '행동가능성'] } : {}),
      },
    };
  }
  if (simKey === 'market_segmentation') {
    return {
      ...base,
      input: {
        category: answers.category || firstSentence(answers.intro, '시장 카테고리'),
        product_family: answers.intro || null,
        core_questions: parseLines(answers.questions, ['구매 기준은 무엇인가요?']),
        n_segments: parseFirstNumber(answers.n_segments, 6),
      },
    };
  }
  if (simKey === 'competitive_positioning') {
    return {
      ...base,
      input: {
        category_context: [answers.category, answers.intro].filter(Boolean).join('\n') || '경쟁 제품 비교',
        products: parseLines(answers.competitors, ['A 제품', 'B 제품']).slice(0, 5),
        attributes: ['가격', '품질', '신뢰', '편의'],
      },
    };
  }
  if (simKey === 'brand_perception') {
    return {
      ...base,
      input: {
        brand_name: answers.brand || firstSentence(answers.intro, '브랜드'),
        category: answers.compare || answers.intro || '브랜드 카테고리',
        attributes: parseLines(answers.attributes, ['신뢰', '고급', '친근']).slice(0, 15),
        context_note: answers.compare || null,
      },
    };
  }
  if (simKey === 'churn_prediction') {
    return {
      ...base,
      input: {
        service_name: answers.service || firstSentence(answers.intro, '서비스'),
        current_situation: answers.current || answers.intro || '현재 이용 상황',
        trigger_event: answers.trigger || '가격이나 혜택 변화',
        competitor_offer: answers.competitor || null,
      },
    };
  }
  if (simKey === 'campaign_strategy') {
    return {
      ...base,
      input: {
        product_context: answers.context || answers.intro || '캠페인 대상 제품',
        channels: parseLines(answers.channels, ['인스타그램', '네이버 검색']).slice(0, 5).map((name) => ({ name })),
        messages: parseLines(answers.messages, ['첫 번째 메시지', '두 번째 메시지']).slice(0, 4).map((creative, index) => ({
          name: `메시지 ${index + 1}`,
          creative,
        })),
        budget: parseFirstNumber(answers.budget, 100000000),
      },
    };
  }
  return {
    ...base,
    input: { creatives: parseCreatives(answers.creatives) },
  };
}

function parseCreatives(value: string | undefined): string[] {
  const creatives = (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (creatives.length < 2) {
    throw new Error('비교할 광고 카피를 최소 2개 입력해야 합니다.');
  }
  return creatives;
}

function parseSampleSize(value: string | undefined): number {
  const match = value?.match(/\d+/);
  const parsed = match ? Number(match[0]) : DEFAULT_SAMPLE_SIZE;
  return clampSampleSize(parsed, DEFAULT_SAMPLE_SIZE);
}

function parseLines(value: string | undefined, fallback: string[]): string[] {
  const parsed = (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function parseNumberList(value: string | undefined, fallback: number[]): number[] {
  const numbers = (value ?? '')
    .match(/\d[\d,]*/g)
    ?.map((raw) => Number(raw.replaceAll(',', '')))
    .filter((number) => Number.isFinite(number) && number > 0) ?? [];
  return Array.from(new Set(numbers.length >= 3 ? numbers : fallback)).slice(0, 6).sort((a, b) => a - b);
}

function parseCalibration(value: string | undefined): Record<string, unknown> | null {
  const entries = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/)
      return match ? [match[1].trim(), Number(match[2])] as const : null
    })
    .filter((item): item is readonly [string, number] => Boolean(item))
  if (entries.length === 0) return null
  return {
    dimensions: {
      occupation: Object.fromEntries(entries),
    },
  }
}

function parseFirstNumber(value: string | undefined, fallback: number): number {
  const match = value?.match(/\d[\d,]*/);
  return match ? Number(match[0].replaceAll(',', '')) : fallback;
}

function firstSentence(value: string | undefined, fallback: string): string {
  const text = value?.trim();
  if (!text) return fallback;
  return text.split(/[.,\n]/)[0]?.trim() || fallback;
}

function parseTargetFilter(ageValue?: string, advancedValue?: string): TargetFilter {
  const combined = `${ageValue ?? ''} ${advancedValue ?? ''}`;
  const ageMatch = combined.match(/(\d{1,3})\D+(\d{1,3})/);
  const targetFilter: TargetFilter = {}
  if (ageMatch) {
    targetFilter.age_min = Number(ageMatch[1]);
    targetFilter.age_max = Number(ageMatch[2]);
  }
  if (combined.includes('서울')) targetFilter.province = ['서울'];
  if (combined.includes('경기')) targetFilter.province = [...(targetFilter.province ?? []), '경기'];
  if (combined.includes('여성')) targetFilter.sex = '여자';
  if (combined.includes('남성')) targetFilter.sex = '남자';
  return targetFilter;
}

function parseSeed(value: string | undefined): number {
  const match = value?.match(/(?:seed|시드)\s*[:=]?\s*(\d+)/i);
  return match ? Number(match[1]) : 42;
}

function formatError(err: unknown): string {
  if (err instanceof APIError) {
    if (err.reason === 'auth_required' || err.reason === 'access_required') return err.message;
    const code = String(err.payload?.code ?? '')
    if (code === 'QUEUE_BUSY') {
      const wait = Number((err.payload?.details as { estimated_wait_seconds?: number } | undefined)?.estimated_wait_seconds ?? 0)
      const waitHint = wait > 0 ? ` (약 ${Math.ceil(wait / 60)}분 후 재시도)` : ''
      return `${err.payload?.message ?? err.message}${waitHint}`
    }
    return err.payload?.message ?? err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

function isAuthRequiredMessage(message: string): boolean {
  return message.includes('로그인이 필요합니다') || message.includes('Google 계정');
}

function navigateToResults(runId: string) {
  window.history.pushState(null, '', `/results?run_id=${encodeURIComponent(runId)}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default App;
