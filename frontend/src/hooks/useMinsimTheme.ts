import { useEffect, useState } from 'react'
import {
  applyMinsimTheme,
  currentMinsimTheme,
  MINSIM_THEME_CHANGE_EVENT,
  MINSIM_THEME_STORAGE_KEY,
  type MinsimTheme,
} from '../theme'

export function useMinsimTheme() {
  const [theme, setTheme] = useState<MinsimTheme>(currentMinsimTheme)

  // OS 테마는 구독하지 않는다. 라이트가 기본이고 사용자가 고른 값만 따른다.
  useEffect(() => {
    const syncFromDocument = () => setTheme(currentMinsimTheme())
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== MINSIM_THEME_STORAGE_KEY) return
      applyMinsimTheme(event.newValue === 'dark' ? 'dark' : 'light')
    }

    window.addEventListener(MINSIM_THEME_CHANGE_EVENT, syncFromDocument)
    window.addEventListener('storage', syncFromStorage)
    syncFromDocument()
    return () => {
      window.removeEventListener(MINSIM_THEME_CHANGE_EVENT, syncFromDocument)
      window.removeEventListener('storage', syncFromStorage)
    }
  }, [])

  return theme
}
