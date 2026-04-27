import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/hooks/useAuth'
import { Toaster } from 'react-hot-toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'NuAIg Chronos — Time Intelligence Platform',
  description: 'Professional time tracking, project management, and workforce analytics by NuAIg',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.className} bg-chronos-bg text-chronos-text antialiased`}>
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
                fontFamily: 'DM Sans, sans-serif',
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
