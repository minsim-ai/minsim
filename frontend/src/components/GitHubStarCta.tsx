import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { recordAnalyticsEvent } from '../api/analytics'

/** Simple GitHub mark — lucide no longer ships brand icons. */
function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2C6.477 2 2 6.486 2 12.021c0 4.425 2.865 8.18 6.839 9.504.5.093.682-.217.682-.483 0-.237-.009-.866-.013-1.7-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.621.069-.609.069-.609 1.004.071 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.833.091-.647.35-1.088.636-1.339-2.22-.253-4.555-1.113-4.555-4.952 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.944.359.31.678.92.678 1.855 0 1.338-.012 2.419-.012 2.749 0 .268.18.58.688.481A10.02 10.02 0 0 0 22 12.021C22 6.486 17.523 2 12 2Z" />
    </svg>
  )
}

export const DEFAULT_GITHUB_REPO_URL = 'https://github.com/minsim-ai/minsim'
const DISMISS_KEY = 'minsim.githubStarCta.dismissedUntil'
const DISMISS_DAYS = 7

function readDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const until = Number(raw)
    if (!Number.isFinite(until)) return false
    return Date.now() < until
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000
    localStorage.setItem(DISMISS_KEY, String(until))
  } catch {
    // ignore storage failures
  }
}

function resolveRepoUrl(): string {
  const fromEnv = (import.meta.env.VITE_GITHUB_REPO_URL as string | undefined)?.trim()
  return fromEnv || DEFAULT_GITHUB_REPO_URL
}

type Props = {
  variant?: 'immersive' | 'card'
  className?: string
  /** Analytics page path, e.g. '/' or '/loading'. */
  page?: string
  title?: string
  subtitle?: string
}

export function GitHubStarCta({
  variant = 'card',
  className = '',
  page = '/loading',
  title = '기다리는 동안… ⭐ 깃허브 스타 하나면 큰 힘이 돼요',
  subtitle = '선택 사항 · 새 탭 💛',
}: Props) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const repoUrl = useMemo(() => resolveRepoUrl(), [])

  if (dismissed) return null

  const handleClick = () => {
    void recordAnalyticsEvent({
      event_name: 'github_star_clicked',
      page,
      payload: { repo_url: repoUrl },
    }).catch(() => undefined)
  }

  const handleDismiss = () => {
    writeDismissed()
    setDismissed(true)
  }

  return (
    <div className={`minsim-github-star minsim-github-star--${variant} ${className}`.trim()}>
      <div className="minsim-github-star-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="minsim-github-star-actions">
        <a
          className={variant === 'immersive' ? 'minsim-github-star-btn' : 'btn ghost sm'}
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
        >
          <GitHubMark size={16} />
          GitHub 스타 주기
        </a>
        <button
          type="button"
          className="minsim-github-star-dismiss"
          onClick={handleDismiss}
          aria-label="일주일 동안 숨기기"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
