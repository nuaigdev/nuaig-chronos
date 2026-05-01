'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell, Plus } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { formatDate } from '@/utils'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/clients': 'Clients',
  '/dashboard/projects': 'Projects',
  '/dashboard/tasks': 'Tasks',
  '/dashboard/time-logs': 'Time Logs',
  '/dashboard/timesheets': 'Timesheets',
  '/dashboard/approvals': 'Approvals',
  '/dashboard/team': 'Team',
  '/dashboard/reports': 'Reports',
  '/dashboard/settings': 'Settings',
  '/dashboard/notifications': 'Notifications',
}

const QUICK_ACTIONS: Record<string, { label: string; href: string }> = {
  '/dashboard/tasks': { label: 'New Task', href: '/dashboard/tasks/new' },
  '/dashboard/time-logs': { label: 'Log Time', href: '/dashboard/time-logs/new' },
}

export default function TopBar() {
  const pathname = usePathname()
  const { unreadCount } = useNotifications()
  const { company } = useAuth()

  const title = Object.keys(PAGE_TITLES)
    .sort((a, b) => b.length - a.length)
    .find(key => pathname.startsWith(key))

  const quickAction = QUICK_ACTIONS[pathname]
  const today = formatDate(new Date(), 'EEEE, MMMM d')

  return (
    <header style={{
      height: '60px',
      borderBottom: '1px solid var(--chronos-border)',
      display: 'flex', alignItems: 'center',
      padding: '0 24px',
      background: 'var(--chronos-surface)',
      gap: '16px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Title */}
      <div style={{ flex: 1 }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '16px', fontWeight: 700, letterSpacing: '-0.02em' }}>
          {title ? PAGE_TITLES[title] : 'Chronos'}
        </h2>
        <p style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', marginTop: '1px' }}>{today}</p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Company badge */}
        {company && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px',
            borderRadius: '8px',
            background: 'var(--chronos-surface-2)',
            border: '1px solid var(--chronos-border)',
          }}>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--chronos-text)',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
            }}>
              {company.name}
            </span>
          </div>
        )}

        {quickAction && (
          <Link href={quickAction.href}>
            <button className="btn-primary" style={{ padding: '7px 14px', fontSize: '13px' }}>
              <Plus size={14} />
              {quickAction.label}
            </button>
          </Link>
        )}

        <Link href="/dashboard/notifications">
          <button style={{
            position: 'relative', background: 'var(--chronos-surface-2)', border: '1px solid var(--chronos-border)',
            borderRadius: '10px', width: '36px', height: '36px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: 'var(--chronos-text-muted)',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--chronos-text)'; e.currentTarget.style.borderColor = 'var(--chronos-border-bright)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--chronos-text-muted)'; e.currentTarget.style.borderColor = 'var(--chronos-border)' }}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px',
                background: 'var(--chronos-accent)', color: 'white',
                borderRadius: '100px', fontSize: '10px', fontWeight: 700,
                minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--chronos-surface)'
              }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
        </Link>
      </div>
    </header>
  )
}
