import { Moon, Sun } from 'lucide-react'
import { useMinsimTheme } from '../hooks/useMinsimTheme'
import {
  applyMinsimTheme,
  storeMinsimTheme,
  type MinsimTheme,
} from '../theme'

export function ThemeToggle() {
  const theme = useMinsimTheme()
  const dark = theme === 'dark'
  const actionTitle = dark ? '라이트 모드로 전환' : '다크 모드로 전환'

  const toggle = () => {
    const next: MinsimTheme = dark ? 'light' : 'dark'
    storeMinsimTheme(next)
    applyMinsimTheme(next)
  }

  return (
    <button
      className="minsim-theme-toggle"
      type="button"
      aria-label="다크 모드"
      aria-pressed={dark}
      title={actionTitle}
      onClick={toggle}
    >
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  )
}
