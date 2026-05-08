import type { Metadata } from 'next'
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
