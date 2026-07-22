export type MinsimTheme = 'light' | 'dark'

export const MINSIM_THEME_STORAGE_KEY = 'minsim.theme'
export const MINSIM_THEME_CHANGE_EVENT = 'minsim:theme-change'

export function currentMinsimTheme(): MinsimTheme {
  return document.documentElement.dataset.theme === 'minsim-dark' ? 'dark' : 'light'
}

export function storedMinsimTheme(): MinsimTheme | null {
  try {
    const stored = window.localStorage.getItem(MINSIM_THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

/** 라이트가 기본. OS 설정은 참조하지 않는다. */
export function preferredMinsimTheme(): MinsimTheme {
  return storedMinsimTheme() ?? 'light'
}

export function storeMinsimTheme(theme: MinsimTheme) {
  try {
    window.localStorage.setItem(MINSIM_THEME_STORAGE_KEY, theme)
  } catch {
    return
  }
}

export function applyMinsimTheme(theme: MinsimTheme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'minsim-dark' : 'minsim'
  document.documentElement.style.colorScheme = theme
  window.dispatchEvent(new CustomEvent<MinsimTheme>(MINSIM_THEME_CHANGE_EVENT, { detail: theme }))
}
