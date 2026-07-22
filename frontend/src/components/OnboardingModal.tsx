import { useId, useState, type FormEvent } from 'react'
import { saveUserOnboarding } from '../api/auth'
import { recordAnalyticsEvent } from '../api/analytics'
import type { LifeStage, ReferralSource } from '../types/api'

const REFERRAL_OPTIONS: { value: ReferralSource; label: string }[] = [
  { value: 'referral', label: '지인 추천 💬' },
  { value: 'sns', label: 'SNS·커뮤니티 📱' },
  { value: 'search', label: '검색 🔍' },
  { value: 'school', label: '학교·수업 🎓' },
  { value: 'work', label: '회사·동료 💼' },
  { value: 'other', label: '기타 ✨' },
]

const LIFE_STAGE_OPTIONS: { value: LifeStage; label: string }[] = [
  { value: 'student', label: '학생 🎒' },
  { value: 'worker', label: '직장인 💼' },
  { value: 'other', label: '기타 🌱' },
]

type Props = {
  open: boolean
  onCompleted: () => void
}

export function OnboardingModal({ open, onCompleted }: Props) {
  const titleId = useId()
  const descId = useId()
  const [referralSource, setReferralSource] = useState<ReferralSource | null>(null)
  const [lifeStage, setLifeStage] = useState<LifeStage | null>(null)
  const [occupation, setOccupation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const occupationTrimmed = occupation.trim()
  const canSubmit = Boolean(referralSource && lifeStage && occupationTrimmed.length >= 1 && !submitting)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!referralSource || !lifeStage || !occupationTrimmed) return
    setSubmitting(true)
    setError(null)
    try {
      await saveUserOnboarding({
        referral_source: referralSource,
        life_stage: lifeStage,
        occupation: occupationTrimmed.slice(0, 80),
      })
      void recordAnalyticsEvent({
        event_name: 'onboarding_completed',
        page: '/onboarding',
        payload: { referral_source: referralSource, life_stage: lifeStage },
      }).catch(() => undefined)
      onCompleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했어요. 잠시 후 다시 시도해 주세요.')
      setSubmitting(false)
    }
  }

  return (
    <div className="minsim-onboarding-backdrop" role="presentation">
      <div
        className="minsim-onboarding-modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <form className="minsim-onboarding-form" onSubmit={handleSubmit}>
          <div className="minsim-onboarding-hero">
            <span className="minsim-onboarding-emoji" aria-hidden="true">
              ✨
            </span>
            <h2 id={titleId}>민심에 와주셔서 감사해요 ✨</h2>
            <p id={descId} className="muted">
              30초만 알려주시면, 더 잘 맞춰볼게요 🙌 부담 없이 편하게!
            </p>
          </div>

          <fieldset className="minsim-onboarding-fieldset">
            <legend>어디서 보고 찾아 들어오셨나요?</legend>
            <div className="minsim-onboarding-chips" role="radiogroup" aria-label="유입 경로">
              {REFERRAL_OPTIONS.map((option) => {
                const selected = referralSource === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`minsim-onboarding-chip ${selected ? 'is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setReferralSource(option.value)}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="minsim-onboarding-fieldset">
            <legend>지금은 어떤 쪽에 가까우신가요?</legend>
            <div className="minsim-onboarding-chips" role="radiogroup" aria-label="학생/직장">
              {LIFE_STAGE_OPTIONS.map((option) => {
                const selected = lifeStage === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`minsim-onboarding-chip ${selected ? 'is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setLifeStage(option.value)}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="minsim-onboarding-field">
            <span>직업·전공을 알려주세요</span>
            <input
              type="text"
              value={occupation}
              maxLength={80}
              autoComplete="organization-title"
              placeholder="예: 프로덕트 매니저, 컴공 석사, 마케터…"
              onChange={(event) => setOccupation(event.target.value)}
            />
          </label>

          {!canSubmit && !submitting && (
            <p className="minsim-onboarding-hint muted">거의 다 왔어요 🙂 세 가지를 채워 주세요.</p>
          )}
          {error && (
            <p className="minsim-onboarding-error" role="alert">
              {error}
            </p>
          )}

          <button className="btn primary block" type="submit" disabled={!canSubmit}>
            {submitting ? '저장 중…' : '알려주고 시작하기 🚀'}
          </button>
        </form>
      </div>
    </div>
  )
}
