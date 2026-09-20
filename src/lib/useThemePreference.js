import { useEffect, useState } from 'react'

const STORAGE_KEY = 'snackshop-theme'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // The theme still works when browser storage is unavailable.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function useThemePreference() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { window.localStorage.setItem(STORAGE_KEY, theme) } catch {
      // Keep the in-memory preference for this session.
    }
  }, [theme])

  useEffect(() => {
    const syncTheme = event => {
      if (event.key === STORAGE_KEY && ['light', 'dark'].includes(event.newValue)) {
        setTheme(event.newValue)
      }
    }
    window.addEventListener('storage', syncTheme)
    return () => window.removeEventListener('storage', syncTheme)
  }, [])

  return {
    theme,
    toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark'),
  }
}
