'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useProfile } from '@/hooks/useProfile'
import { useNotifications } from '@/hooks/useNotifications'
import { useTheme } from '@/hooks/useTheme'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/utils'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  LayoutDashboard, FolderKanban, FileText,
  Users, BarChart3, Settings, Bell, Building2, LogOut, KeyRound, X, Layers, Sun, Moon
} from 'lucide-react'
import toast from 'react-hot-toast'

// Single stable client instance — never recreate inside a component
const supabase = createClient()

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'manager', 'employee'] },
  { href: '/dashboard/clients', icon: Building2, label: 'Clients', roles: ['admin', 'manager'] },
  { href: '/dashboard/projects', icon: FolderKanban, label: 'Projects', roles: ['admin', 'manager', 'employee'] },
  { href: '/dashboard/timesheets', icon: FileText, label: 'Timesheets', roles: ['admin', 'manager', 'employee'] },
  { href: '/dashboard/approvals', icon: FileText, label: 'Approvals', roles: ['admin', 'manager'] },
  { href: '/dashboard/team', icon: Users, label: 'Team', roles: ['admin', 'manager'] },
  { href: '/dashboard/departments', icon: Layers, label: 'Departments', roles: ['admin', 'manager'] },
  { href: '/dashboard/reports', icon: BarChart3, label: 'Reports', roles: ['admin', 'manager'] },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings', roles: ['admin'] },
]

// Abstract Chronos logo mark — three offset arcs forming a dynamic C-shape
function ChronosLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Outer arc — top right */}
      <path
        d="M 26 8 C 30 12 30 20 26 24"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* Middle arc — full sweep */}
      <path
        d="M 22 4 C 30 8 30 24 22 28"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* Inner shape — solid pill */}
      <rect x="6" y="11" width="14" height="10" rx="5" fill="white" />
    </svg>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, isAdmin, isManager } = useProfile()
  const { unreadCount } = useNotifications()
  const { theme, toggleTheme } = useTheme()
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' })
  const [changingPassword, setChangingPassword] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleChangePassword = async () => {
    if (!passwordForm.newPassword || passwordForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setChangingPassword(true)
    try {
      // Use the API route instead of supabase.auth.updateUser to avoid
      // the session invalidation that causes an infinite loading state.
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: passwordForm.newPassword }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to update password')
      toast.success('Password updated successfully!')
      setShowPasswordModal(false)
      setPasswordForm({ newPassword: '', confirmPassword: '' })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setChangingPassword(false)
    }
  }

  const visibleItems = NAV_ITEMS.filter(item =>
    item.roles.includes(profile?.role || 'employee')
  )

  void isAdmin; void isManager // used for nav filtering via profile.role

  return (
    <>
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
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: '0 0 12px rgba(59,130,246,0.25)',
          }}>
            <ChronosLogo size={20} />
          </div>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '17px', letterSpacing: '-0.03em', lineHeight: 1 }}>
              <span className="gradient-text">Chronos</span>
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
          <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '6px', display: 'flex', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-accent)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button onClick={() => setShowPasswordModal(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '6px', display: 'flex', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-accent)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
            title="Change password"
          >
            <KeyRound size={14} />
          </button>
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

      {/* Password Change Modal — portal to escape sidebar stacking context */}
      {mounted && showPasswordModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowPasswordModal(false); setPasswordForm({ newPassword: '', confirmPassword: '' }) } }}
        >
          <div style={{ background: 'var(--chronos-surface)', borderRadius: '16px', border: '1px solid var(--chronos-border)', padding: '28px', width: '100%', maxWidth: '400px', boxShadow: '0 24px 48px rgba(0,0,0,0.4)', position: 'relative', zIndex: 10000 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(167,139,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--chronos-accent)' }}>
                  <KeyRound size={18} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px' }}>Change Password</div>
                  <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>Update your account password</div>
                </div>
              </div>
              <button onClick={() => { setShowPasswordModal(false); setPasswordForm({ newPassword: '', confirmPassword: '' }) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '6px' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
              ><X size={16} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>New Password</label>
                <input
                  type="password"
                  className="input-base"
                  placeholder="Min. 6 characters"
                  value={passwordForm.newPassword}
                  onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Confirm Password</label>
                <input
                  type="password"
                  className="input-base"
                  placeholder="Re-enter new password"
                  value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                  style={{ width: '100%' }}
                />
              </div>
              {passwordForm.newPassword && passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                <p style={{ fontSize: '12px', color: 'var(--chronos-danger)', marginTop: '-6px' }}>Passwords do not match</p>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button className="btn-secondary" onClick={() => { setShowPasswordModal(false); setPasswordForm({ newPassword: '', confirmPassword: '' }) }}>Cancel</button>
                <button className="btn-primary" onClick={handleChangePassword} disabled={changingPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}>
                  {changingPassword && <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3"/><path d="M12 3a9 9 0 019 9"/></svg>}
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
