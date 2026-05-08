'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useNotifications } from '@/hooks/useNotifications'
import { LayoutDashboard, FileText, FolderKanban, Bell } from 'lucide-react'

const TABS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/dashboard/timesheets', icon: FileText, label: 'Timesheets' },
  { href: '/dashboard/projects', icon: FolderKanban, label: 'Projects' },
  { href: '/dashboard/notifications', icon: Bell, label: 'Alerts' },
]

export default function MobileBottomNav() {
  const pathname = usePathname()
  const { unreadCount } = useNotifications()

  return (
    <nav className="mobile-bottom-nav">
      {TABS.map(tab => {
        const isActive =
          tab.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(tab.href)
        const Icon = tab.icon
        const showBadge = tab.href === '/dashboard/notifications' && unreadCount > 0

        return (
          <Link key={tab.href} href={tab.href} className={`mobile-tab ${isActive ? 'active' : ''}`}>
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon size={20} />
              {showBadge && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-8px',
                  background: 'var(--chronos-accent)', color: 'white',
                  borderRadius: '100px', fontSize: '9px', fontWeight: 700,
                  minWidth: '14px', height: '14px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  border: '2px solid var(--chronos-surface)',
                  lineHeight: 1,
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="mobile-tab-label">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
