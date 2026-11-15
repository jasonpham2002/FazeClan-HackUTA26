import { useEffect, useState } from 'react'
import { Button } from './ui'

const preferenceKey = 'faze-color-mode'
type Theme = 'light' | 'dark'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  )

  function applyTheme(next: Theme) {
    document.documentElement.dataset.theme = next
    setTheme(next)
  }

  useEffect(() => {
    function syncTheme(event: StorageEvent) {
      if (event.key === preferenceKey || event.key === null) {
        applyTheme(event.newValue === 'light' ? 'light' : 'dark')
      }
    }

    window.addEventListener('storage', syncTheme)
    return () => window.removeEventListener('storage', syncTheme)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    try {
      localStorage.setItem(preferenceKey, next)
    } catch {
      // The current tab can still switch themes.
    }
  }

  return (
    <Button size="sm" className="w-32" icon={theme === 'dark' ? 'sun' : 'moon'} onClick={toggleTheme}>
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </Button>
  )
}
