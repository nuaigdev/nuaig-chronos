'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  // Read persisted theme on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chronos-theme') as Theme | null
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved)
      }
    } catch {
      // localStorage may not be available
    }
    setMounted(true)
  }, [])

  // Apply theme class to <html> whenever theme changes
  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(theme)
    try {
      localStorage.setItem('chronos-theme', theme)
    } catch {
      // ignore
    }
  }, [theme, mounted])

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
