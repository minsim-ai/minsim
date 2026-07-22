import { useState, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'

export function AutofillPanel({
  initialPrompt,
  busy,
  error,
  notes,
  onGenerate,
  footer,
  generateLabel = 'AI 생성',
  blurb = '아이디어 한 문장과 화면의 현재 초안(이름·설명·기능 등)을 함께 참고해 전체 항목을 다시 채웁니다. 채워진 값은 원하는 부분만 수정하면 됩니다.',
  promptPlaceholder = '예: 잠이 잘 오게 하는 뇌파 생성 머리띠를 생각 중인데 시장 검토하고 싶어',
}: {
  initialPrompt: string
  busy: boolean
  error: string | null
  notes: string[]
  onGenerate: (prompt: string) => void
  footer?: ReactNode
  generateLabel?: string
  blurb?: string
  promptPlaceholder?: string
}) {
  const [prompt, setPrompt] = useState(initialPrompt)

  return (
    <aside className="card minsim-autofill-panel">
      <div className="lbl-mono row" style={{ gap: 6, alignItems: 'center' }}>
        <Sparkles size={14} aria-hidden="true" /> AI 생성
      </div>
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
        {blurb}
      </p>
      <textarea
        className="inp"
        rows={3}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={promptPlaceholder}
        aria-label="AI 생성 프롬프트"
      />
      <button
        className="btn btn-ai"
        type="button"
        onClick={() => onGenerate(prompt)}
        disabled={busy || !prompt.trim()}
      >
        {busy ? 'AI가 항목을 채우는 중…' : generateLabel}
      </button>
      {error && (
        <p className="muted" role="alert" style={{ fontSize: 12.5, margin: 0 }}>
          {error}
        </p>
      )}
      {notes.map((note) => (
        <p key={note} className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
          · {note}
        </p>
      ))}
      {footer}
    </aside>
  )
}
