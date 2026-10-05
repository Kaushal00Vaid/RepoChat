import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'repochat-theme'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Default to light theme
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    return stored ?? 'light'
  })

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // Apply on mount
  useEffect(() => {
    applyTheme(theme)
  }, [])

  const toggle = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'))
  const setLight = () => setTheme('light')
  const setDark = () => setTheme('dark')

  return { theme, toggle, setLight, setDark }
}
