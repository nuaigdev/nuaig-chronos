import type { Metadata, Viewport } from 'next'
import { Inter, Outfit, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { NotificationsProvider } from '@/hooks/useNotifications'
import { ThemeProvider } from '@/hooks/useTheme'
import { ThemeAwareToaster } from '@/components/layout/ThemeAwareToaster'

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
  title: 'Chronos — Time Intelligence Platform',
  description: 'Professional time tracking, project management, and workforce analytics',
  applicationName: 'Chronos',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Chronos',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: '#0c0f1a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable} bg-chronos-bg text-chronos-text antialiased`}>
        <ThemeProvider>
          <NotificationsProvider>
            {children}
            <ThemeAwareToaster />
          </NotificationsProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
