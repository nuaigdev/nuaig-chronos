'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useProfile } from '@/hooks/useProfile'
import { useTheme } from '@/hooks/useTheme'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/utils'
import { createPortal } from 'react-dom'
import { KeyRound, LogOut, X, Sun, Moon } from 'lucide-react'
import toast from 'react-hot-toast'

const supabase = createClient()

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/projects': 'Projects',
  '/dashboard/timesheets': 'Timesheets',
  '/dashboard/notifications': 'Notifications',
}

function ChronosLogoSmall() {
  return (
    <svg width={22} height={22} viewBox="0 0 32 32" fill="none">
      <path d="M 26 8 C 30 12 30 20 26 24" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <path d="M 22 4 C 30 8 30 24 22 28" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
      <rect x="6" y="11" width="14" height="10" rx="5" fill="white" />
    </svg>
  )
}

export default function MobileHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile } = useProfile()
  const { theme, toggleTheme } = useTheme()
  const [showMenu, setShowMenu] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' })
  const [changingPassword, setChangingPassword] = useState(false)
  const [mounted, setMounted] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const title = Object.keys(PAGE_TITLES)
    .sort((a, b) => b.length - a.length)
    .find(key => pathname.startsWith(key))

  const handleSignOut = async () => {
    setShowMenu(false)
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

  return (
    <>
      <header className="mobile-header">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ChronosLogoSmall />
          </div>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '15px',
            letterSpacing: '-0.03em',
          }}>
            <span className="gradient-text">
              {title ? PAGE_TITLES[title] : 'Chronos'}
            </span>
          </span>
        </div>

        {/* Right: theme + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={toggleTheme}
            style={{
              background: 'var(--chronos-surface-2)', border: '1px solid var(--chronos-border)',
              borderRadius: '8px', width: '34px', height: '34px', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              color: 'var(--chronos-text-muted)', transition: 'all 0.15s',
            }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              style={{
                width: '34px', height: '34px', borderRadius: '8px',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: 700, color: 'white',
                fontFamily: 'var(--font-display)',
              }}
            >
              {getInitials(profile?.full_name || 'U')}
            </button>

            {/* Dropdown menu */}
            {showMenu && (
              <div style={{
                position: 'absolute', top: '42px', right: 0,
                background: 'var(--chronos-surface)', border: '1px solid var(--chronos-border)',
                borderRadius: '12px', padding: '8px', minWidth: '200px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.3)', zIndex: 200,
              }}>
                {/* User info */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--chronos-border)', marginBottom: '4px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--chronos-text)' }}>
                    {profile?.full_name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', textTransform: 'capitalize', marginTop: '2px' }}>
                    {profile?.role}
                  </div>
                </div>

                {/* Change Password */}
                <button
                  onClick={() => { setShowMenu(false); setShowPasswordModal(true) }}
                  className="mobile-menu-item"
                >
                  <KeyRound size={14} />
                  Change Password
                </button>

                {/* Sign out */}
                <button
                  onClick={handleSignOut}
                  className="mobile-menu-item"
                  style={{ color: 'var(--chronos-danger)' }}
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Password Change Modal */}
      {mounted && showPasswordModal && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 9999, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) { setShowPasswordModal(false); setPasswordForm({ newPassword: '', confirmPassword: '' }) } }}
        >
          <div style={{
            background: 'var(--chronos-surface)', borderRadius: '16px',
            border: '1px solid var(--chronos-border)', padding: '24px',
            width: '100%', maxWidth: '400px',
            boxShadow: '0 24px 48px rgba(0,0,0,0.4)', position: 'relative', zIndex: 10000,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: 'rgba(167,139,250,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--chronos-accent)',
                }}>
                  <KeyRound size={18} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px' }}>Change Password</div>
                  <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>Update your account password</div>
                </div>
              </div>
              <button
                onClick={() => { setShowPasswordModal(false); setPasswordForm({ newPassword: '', confirmPassword: '' }) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '6px' }}
              >
                <X size={16} />
              </button>
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
