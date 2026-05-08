'use client'

import { Toaster } from 'react-hot-toast'
import { useTheme } from '@/hooks/useTheme'

export function ThemeAwareToaster() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: isDark ? '#1a1f2e' : '#ffffff',
          color: isDark ? '#e2e8f0' : '#1a1f2e',
          border: `1px solid ${isDark ? '#2d3748' : '#e2e6ec'}`,
          borderRadius: '12px',
          fontFamily: 'var(--font-body)',
        },
        success: { iconTheme: { primary: isDark ? '#34d399' : '#059669', secondary: isDark ? '#1a1f2e' : '#ffffff' } },
        error: { iconTheme: { primary: isDark ? '#f87171' : '#dc2626', secondary: isDark ? '#1a1f2e' : '#ffffff' } },
      }}
    />
  )
}
