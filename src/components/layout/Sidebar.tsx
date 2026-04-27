'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/utils'
import {
  LayoutDashboard, FolderKanban, CheckSquare, Clock, FileText,
  Users, BarChart3, Settings, Bell, Building2, LogOut, ChevronRight
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'manager', 'employee'] },
  { href: '/dashboard/clients', icon: Building2, label: 'Clients', roles: ['admin', 'manager'] },
  { href: '/dashboard/projects', icon: FolderKanban, label: 'Projects', roles: ['admin', 'manager', 'employee'] },
  { href: '/dashboard/tasks', icon: CheckSquare, label: 'Tasks', roles: ['admin', 'manager', 'employee'] },
  { href: '/dashboard/time-logs', icon: Clock, label: 'Time Logs', roles: ['admin', 'manager', 'employee'] },
  { href: '/dashboard/timesheets', icon: FileText, label: 'Timesheets', roles: ['admin', 'manager', 'employee'] },
  { href: '/dashboard/approvals', icon: CheckSquare, label: 'Approvals', roles: ['admin', 'manager'] },
  { href: '/dashboard/team', icon: Users, label: 'Team', roles: ['admin', 'manager'] },
  { href: '/dashboard/reports', icon: BarChart3, label: 'Reports', roles: ['admin', 'manager'] },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings', roles: ['admin'] },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, isAdmin, isManager } = useAuth()
  const { unreadCount } = useNotifications()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const visibleItems = NAV_ITEMS.filter(item =>
    item.roles.includes(profile?.role || 'employee')
  )

  return (
    <aside style={{
      width: '240px',
      minWidth: '240px',
      height: '100vh',
      background: 'var(--chronos-surface)',
      borderRight: '1px solid var(--chronos-border)',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--chronos-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '16px', letterSpacing: '-0.03em', lineHeight: 1 }}>
              <span className="gradient-text">NuAIg</span>
              <span style={{ color: 'var(--chronos-text)' }}> Chronos</span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--chronos-text-muted)', fontFamily: 'DM Sans, sans-serif', marginTop: '2px' }}>
              Time Intelligence
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {visibleItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className={`sidebar-item ${isActive ? 'active' : ''}`}>
              <Icon size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.href === '/dashboard/approvals' && (
                <span style={{
                  background: 'var(--chronos-warning)',
                  color: '#000',
                  borderRadius: '100px',
                  padding: '1px 7px',
                  fontSize: '11px',
                  fontWeight: 600
                }}>!</span>
              )}
            </Link>
          )
        })}

        {/* Notifications */}
        <Link href="/dashboard/notifications" className={`sidebar-item ${pathname === '/dashboard/notifications' ? 'active' : ''}`}>
          <Bell size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Notifications</span>
          {unreadCount > 0 && (
            <span style={{
              background: 'var(--chronos-accent)',
              color: 'white',
              borderRadius: '100px',
              padding: '1px 7px',
              fontSize: '11px',
              fontWeight: 600
            }}>{unreadCount}</span>
          )}
        </Link>
      </nav>

      {/* User profile */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid var(--chronos-border)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px', borderRadius: '10px',
          background: 'var(--chronos-surface-2)',
        }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontSize: '12px', fontWeight: 700, color: 'white',
            fontFamily: 'Syne, sans-serif'
          }}>
            {getInitials(profile?.full_name || 'U')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--chronos-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile?.full_name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', textTransform: 'capitalize' }}>
              {profile?.role}
            </div>
          </div>
          <button onClick={handleSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '6px', display: 'flex', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-danger)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}
