import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowRight, MessagesSquare, Send, Users, X } from 'lucide-react'
import {
  askProjectRunFollowup,
  askProjectRunInterviewThread,
  createProjectRunInterviewThread,
  listProjectRunInterviewThreads,
} from '../api/projects'
import type {
  FollowupAnswer,
  InterviewThreadResponse,
  ProjectRunFollowupResponse,
} from '../types/api'
import type { MinsimReport } from './minsimReport'

type ResearchSubject = {
  uuid: string
  name: string
  choice: string
  meta: string
  quote: string
}

type FollowupEntry = ProjectRunFollowupResponse & { id: string }

type ResearchWorkspaceProps = {
  projectId: string
  runId: string
  report: MinsimReport
}

const GROUP_SUGGESTIONS = [
  '이 조사 대상 서비스/제품 기준으로, 가장 큰 거절 이유를 구체적인 상황과 함께 설명해주세요.',
  '이 조사 대상이라면, 어떤 조건이 바뀌면 선택을 다시 고려할까요?',
]

const INTERVIEW_SUGGESTIONS = [
  '이 조사 대상 서비스/제품에 대해 그렇게 느낀 가장 큰 계기가 무엇인가요?',
  '이 조사 대상이라면, 어떤 조건이면 지금 생각이 달라질까요?',
  '이 조사 대상 서비스/제품을 누구에게, 어떤 상황에 쓰고 싶으신가요?',
]

export function ResearchWorkspace({ projectId, runId, report }: ResearchWorkspaceProps) {
  const [selectedSubject, setSelectedSubject] = useState<ResearchSubject | null>(null)
  const [cohort, setCohort] = useState('all')
  const [question, setQuestion] = useState('이 결과에서 가장 큰 거절 이유를 더 구체적으로 말해주세요.')
  const [threads, setThreads] = useState<InterviewThreadResponse[]>([])
  const [followups, setFollowups] = useState<FollowupEntry[]>([])
  const [pending, setPending] = useState<'followup' | 'interview' | null>(null)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const composingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoadingThreads(true)
    listProjectRunInterviewThreads(projectId, runId)
      .then((response) => {
        if (!cancelled) setThreads(response.threads)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingThreads(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, runId])

  const quoteByUuid = useMemo(
    () => new Map(report.quotes.map((quote) => [quote.uuid, quote])),
    [report.quotes],
  )
  // One list: person + quote together (no separate "근거 발언 / 응답자" tabs).
  const subjects = useMemo<ResearchSubject[]>(() => {
    const fromCrowd = report.crowd.map((person) => {
      const quote = quoteByUuid.get(person.uuid)
      return {
        uuid: person.uuid,
        name: person.name,
        choice: person.choice,
        meta: [person.sex, person.age ? `${person.age}세` : '', person.region, person.occ].filter(Boolean).join(' · '),
        quote: quote?.q || person.quote || '',
      }
    })
    const seen = new Set(fromCrowd.map((item) => item.uuid))
    // Keep quote-only people who are not already in the crowd list.
    const quoteOnly = report.quotes
      .filter((quote) => !seen.has(quote.uuid))
      .map((quote) => ({
        uuid: quote.uuid,
        name: quote.name,
        choice: quote.choice,
        meta: quote.meta,
        quote: quote.q,
      }))
    return [...fromCrowd, ...quoteOnly]
  }, [quoteByUuid, report.crowd, report.quotes])
  const activeThread = selectedSubject
    ? threads.find((thread) => thread.subject_uuid === selectedSubject.uuid) ?? null
    : null
  const choices = report.creatives.map((creative) => creative.id)
  const outcomeLabel = (choice: string) => report.creatives.find((creative) => creative.id === choice)?.label ?? choice
  const cohortLabel = cohortName(cohort, outcomeLabel, report.segment.mode)
  const suggestions = selectedSubject ? INTERVIEW_SUGGESTIONS : GROUP_SUGGESTIONS

  const selectSubject = (subject: ResearchSubject) => {
    setSelectedSubject(subject)
    setQuestion('이 조사 대상 서비스/제품에 대해 왜 그렇게 답했는지 조금 더 자세히 설명해주세요.')
    setError(null)
    window.requestAnimationFrame(() => {
      document.getElementById('research-conversation')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const selectGroup = () => {
    setSelectedSubject(null)
    setQuestion('이 조사 대상 서비스/제품 기준으로, 이 결과에서 가장 큰 거절 이유를 더 구체적으로 말해주세요.')
    setError(null)
  }

  const upsertThread = (thread: InterviewThreadResponse) => {
    setThreads((current) => [thread, ...current.filter((item) => item.thread_id !== thread.thread_id)])
  }

  const ensureThread = async (subject: ResearchSubject): Promise<InterviewThreadResponse> => {
    const existing = threads.find((thread) => thread.subject_uuid === subject.uuid)
    if (existing) return existing
    const created = await createProjectRunInterviewThread(projectId, runId, {
      subject_uuid: subject.uuid,
      subject_label: subjectLabel(subject, outcomeLabel),
      subject_meta: subject.meta,
      context_quote: subject.quote,
    })
    upsertThread(created)
    return created
  }

  const submitQuestion = async (event: FormEvent) => {
    event.preventDefault()
    const cleanQuestion = question.trim()
    if (!cleanQuestion || pending) return
    setError(null)
    try {
      if (selectedSubject) {
        setPending('interview')
        const thread = await ensureThread(selectedSubject)
        const updated = await askProjectRunInterviewThread(projectId, runId, thread.thread_id, {
          question: cleanQuestion,
        })
        upsertThread(updated)
      } else {
        setPending('followup')
        const response = await askProjectRunFollowup(projectId, runId, {
          question: cleanQuestion,
          cohort,
          sample_size: 8,
        })
        setFollowups((current) => [{ ...response, id: `followup-${Date.now()}` }, ...current])
      }
      setQuestion('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(null)
    }
  }

  const handleQuestionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || composingRef.current) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const interviewAnswer = (answer: FollowupAnswer) => {
    selectSubject({
      uuid: answer.uuid,
      name: answer.name,
      choice: '',
      meta: [answer.sex, answer.age ? `${answer.age}세` : '', answer.province ?? ''].filter(Boolean).join(' · '),
      quote: answer.answer,
    })
  }

  return (
    <section id="result-evidence" className="research-workspace">
      <div className="research-workspace-heading">
        <div>
          <div className="kicker">응답 탐색 · 후속 리서치</div>
          <h2>응답 탐색 & 대화</h2>
          <p>근거 발언과 응답자를 한곳에서 살펴보고, 집단에 다시 묻거나 한 사람과 대화를 이어가세요.</p>
        </div>
      </div>

      <div className="research-workspace-shell card">
        <div className="research-explorer">
          <div className="research-explorer-toolbar">
            <strong className="research-explorer-title">응답자</strong>
            <span>{subjects.length}명</span>
          </div>

          <p className="research-explorer-hint">
            이름·프로필과 근거 발언을 함께 보여줍니다. 카드를 누르면 아래에서 인터뷰를 이어가세요.
          </p>

          <div className="research-subject-list" role="list">
            {subjects.map((subject) => {
              const hasThread = threads.some((thread) => thread.subject_uuid === subject.uuid && thread.messages.length > 0)
              const selected = selectedSubject?.uuid === subject.uuid
              return (
                <button
                  key={subject.uuid}
                  type="button"
                  className={`research-subject-card${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => selectSubject(subject)}
                >
                  <span className="research-avatar" aria-hidden="true">{subject.name.slice(0, 1)}</span>
                  <span className="research-subject-copy">
                    <span className="research-subject-head">
                      <strong>{subject.name}</strong>
                      <span>{subject.choice ? outcomeLabel(subject.choice) : '응답자'}</span>
                    </span>
                    {subject.quote ? <q>{subject.quote}</q> : null}
                    <small>{subject.meta}</small>
                  </span>
                  <span className={`research-thread-mark${hasThread ? ' saved' : ''}`} aria-label={hasThread ? '저장된 인터뷰 있음' : '인터뷰 시작'}>
                    {hasThread ? '이어가기' : '대화'} <ArrowRight size={13} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div id="research-conversation" className="research-conversation">
          <header className="research-conversation-head">
            {selectedSubject ? (
              <>
                <div className="research-conversation-person">
                  <span className="research-avatar large" aria-hidden="true">{selectedSubject.name.slice(0, 1)}</span>
                  <div>
                    <span className="lbl-mono">1명 인터뷰</span>
                    <h3>{subjectLabel(selectedSubject, outcomeLabel)}</h3>
                    <p>{selectedSubject.meta}</p>
                  </div>
                </div>
                <button type="button" className="research-close-target" onClick={selectGroup}><X size={15} /> 여러명에게 물어보기로 돌아가기</button>
              </>
            ) : (
              <div>
                <span className="lbl-mono">코호트 후속질문</span>
                <h3>{cohortLabel} 응답자에게 다시 묻기</h3>
                <p>8명의 반응을 비교한 뒤 원하는 응답자와 바로 심층 인터뷰할 수 있습니다.</p>
              </div>
            )}
          </header>

          {selectedSubject && selectedSubject.quote && (
            <div className="research-context-quote">
              <span>대화 맥락</span>
              <q>{selectedSubject.quote}</q>
            </div>
          )}

          <div className="research-conversation-stream" aria-live="polite">
            {selectedSubject ? (
              <InterviewStream thread={activeThread} loading={loadingThreads} subject={selectedSubject} />
            ) : (
              <FollowupStream entries={followups} onInterview={interviewAnswer} />
            )}
          </div>

          <form className="research-composer" onSubmit={submitQuestion}>
            {!selectedSubject && (
              <div className="research-target-row">
                <label>
                  <span className="sr-only">질문 대상 코호트</span>
                  <select value={cohort} onChange={(event) => setCohort(event.target.value)}>
                    <option value="all">전체 응답자</option>
                    <option value="positive">긍정층</option>
                    <option value="negative">부정층</option>
                    <option value="confused">혼란층</option>
                    {choices.map((choice) => (
                      <option key={choice} value={choice}>
                        {outcomeLabel(choice)} {report.segment.mode === 'choice' ? '선택자' : '응답자'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="research-suggestions">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>{suggestion}</button>
              ))}
            </div>
            <label className="sr-only" htmlFor="research-question">후속 질문</label>
            <div className="research-composer-input">
              <textarea
                id="research-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onCompositionStart={() => {
                  composingRef.current = true
                }}
                onCompositionEnd={() => {
                  composingRef.current = false
                }}
                onKeyDown={handleQuestionKeyDown}
                rows={3}
                placeholder={selectedSubject ? '이 응답자에게 이어서 질문하세요.' : '선택한 집단에 다시 물어보세요.'}
              />
              <button type="submit" disabled={Boolean(pending) || !question.trim()}>
                {pending ? '답변 생성 중…' : selectedSubject ? '인터뷰 전송' : '8명에게 묻기'}
                {pending ? <MessagesSquare size={16} /> : <Send size={16} />}
              </button>
            </div>
            {error && <p className="research-error" role="alert">{error}</p>}
          </form>
        </div>
      </div>
    </section>
  )
}

function InterviewStream({ thread, loading, subject }: { thread: InterviewThreadResponse | null; loading: boolean; subject: ResearchSubject }) {
  if (loading) return <div className="research-empty"><MessagesSquare size={22} /><strong>저장된 인터뷰를 불러오는 중입니다.</strong></div>
  if (!thread || thread.messages.length === 0) {
    return (
      <div className="research-empty">
        <MessagesSquare size={24} />
        <strong>{subject.name}님과 첫 질문을 시작하세요.</strong>
        <span>첫 답변부터 서버에 저장되어 다음 방문에도 이어집니다.</span>
      </div>
    )
  }
  return (
    <div className="research-message-list">
      {thread.messages.map((message) => (
        <div key={message.message_id} className={`research-message ${message.role}`}>
          <span>{message.role === 'user' ? '나' : subject.name}</span>
          <p>{message.content}</p>
        </div>
      ))}
    </div>
  )
}

function FollowupStream({ entries, onInterview }: { entries: FollowupEntry[]; onInterview: (answer: FollowupAnswer) => void }) {
  if (entries.length === 0) {
    return (
      <div className="research-empty">
        <Users size={25} />
        <strong>집계 결과에서 한 단계 더 물어보세요.</strong>
        <span>질문 결과는 여러 응답을 비교해 보여주며, 한 명을 골라 인터뷰로 이어갈 수 있습니다.</span>
      </div>
    )
  }
  return (
    <div className="research-followup-list">
      {entries.map((entry) => (
        <article key={entry.id}>
          <div className="research-followup-question"><span>Q</span><p>{entry.question}</p></div>
          <p className="research-followup-summary">{entry.summary}</p>
          <div className="research-followup-answers">
            {entry.answers.map((answer) => (
              <div key={`${entry.id}-${answer.uuid}`}>
                <p><strong>{answer.name}</strong><span>{[answer.sex, answer.age ? `${answer.age}세` : '', answer.province ?? ''].filter(Boolean).join(' · ')}</span></p>
                <q>{answer.answer}</q>
                <button type="button" onClick={() => onInterview(answer)}>이 응답자 인터뷰 <ArrowRight size={13} /></button>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

function subjectLabel(subject: ResearchSubject, outcomeLabel: (choice: string) => string): string {
  return subject.choice ? `${subject.name} · ${outcomeLabel(subject.choice)}` : subject.name
}

function cohortName(value: string, outcomeLabel: (choice: string) => string, mode: MinsimReport['segment']['mode']): string {
  if (value === 'all') return '전체'
  if (value === 'positive') return '긍정층'
  if (value === 'negative') return '부정층'
  if (value === 'confused') return '혼란층'
  return `${outcomeLabel(value)} ${mode === 'choice' ? '선택자' : '응답자'}`
}
