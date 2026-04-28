import type { Metadata } from 'next'
import { Inter, Outfit, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/hooks/useAuth'
import { Toaster } from 'react-hot-toast'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
})

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'NuAIg Chronos — Time Intelligence Platform',
  description: 'Professional time tracking, project management, and workforce analytics by NuAIg',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable} bg-chronos-bg text-chronos-text antialiased`}>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1a1f2e',
                color: '#e2e8f0',
                border: '1px solid #2d3748',
                borderRadius: '12px',
                fontFamily: 'var(--font-body)',
              },
              success: { iconTheme: { primary: '#34d399', secondary: '#1a1f2e' } },
              error: { iconTheme: { primary: '#f87171', secondary: '#1a1f2e' } },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}
