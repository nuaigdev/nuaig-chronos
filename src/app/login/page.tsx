'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (error.message?.toLowerCase().includes('database') || error.status === 500) {
          throw new Error('A server error occurred. Please try again in a moment.')
        }
        if (error.message?.toLowerCase().includes('invalid login')) {
          throw new Error('Invalid email or password. Contact your admin if you need access.')
        }
        throw error
      }
      if (data?.user) {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const steps = [
    {
      number: '1',
      title: 'Get your credentials',
      desc: 'Your admin will create your account and send your login email and temporary password.',
    },
    {
      number: '2',
      title: 'Sign in below',
      desc: 'Enter the email and password you received. If you have issues, contact your administrator — self-registration is disabled.',
    },
    {
      number: '3',
      title: 'Log your time',
      desc: 'Head to Timesheets → create your weekly timesheet → add time entries per project and task.',
    },
  ]

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--chronos-bg)' }}>
      {/* Left info panel */}
      <div
        className="hidden lg:flex flex-col"
        style={{
          width: '55%',
          background: 'linear-gradient(160deg, #0a0d16 0%, #111827 45%, #0f172a 100%)',
          borderRight: '1px solid var(--chronos-border)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background atmosphere */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', top: '18%', left: '10%',
            width: '480px', height: '480px',
            background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)',
            filter: 'blur(48px)',
          }} />
          <div style={{
            position: 'absolute', bottom: '20%', right: '5%',
            width: '320px', height: '320px',
            background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)',
            filter: 'blur(48px)',
          }} />
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.025 }}>
            <defs>
              <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Panel content */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '48px 56px' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 24px rgba(59,130,246,0.25)',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '21px', letterSpacing: '-0.04em' }}>
              <span className="gradient-text">NuAIg</span>
              <span style={{ color: 'var(--chronos-text)', marginLeft: '5px' }}>Chronos</span>
            </span>
          </div>

          {/* Hero content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: '420px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.18)',
              borderRadius: '100px', padding: '5px 14px', width: 'fit-content', marginBottom: '24px',
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 8px rgba(59,130,246,0.7)' }} />
              <span style={{ fontSize: '12px', color: 'var(--chronos-accent)', fontWeight: 500, letterSpacing: '0.02em' }}>Internal Tool — Staff Only</span>
            </div>

            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '38px', fontWeight: 800,
              lineHeight: 1.1, letterSpacing: '-0.04em', marginBottom: '16px',
            }}>
              NuAIg Internal<br />
              <span className="gradient-text">Time Tracker</span>
            </h2>

            <p style={{ fontSize: '14px', color: 'var(--chronos-text-muted)', lineHeight: 1.7, marginBottom: '40px', maxWidth: '360px' }}>
              This is an internal tool for NuAIg staff. Only authorised employees with admin-provisioned accounts can sign in. If you need access, contact your manager.
            </p>

            {/* How-to steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--chronos-text-muted)', textTransform: 'uppercase', marginBottom: '18px' }}>
                How to get started
              </p>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', position: 'relative', paddingBottom: i < steps.length - 1 ? '24px' : '0' }}>
                  {/* Connector line */}
                  {i < steps.length - 1 && (
                    <div style={{
                      position: 'absolute', left: '15px', top: '30px', bottom: '0',
                      width: '1px', background: 'rgba(255,255,255,0.07)',
                    }} />
                  )}
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
                    background: 'var(--chronos-surface-2)', border: '1px solid var(--chronos-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '13px',
                    color: 'var(--chronos-accent)',
                  }}>
                    {s.number}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--chronos-text)', marginBottom: '3px' }}>{s.title}</p>
                    <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', lineHeight: 1.6 }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', letterSpacing: '0.01em' }}>
            © {new Date().getFullYear()} NuAIg Technologies. Internal use only.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
        <div style={{ width: '100%', maxWidth: '380px' }} className="animate-fade-in">
          {/* Mobile logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '36px', justifyContent: 'center' }} className="lg:hidden">
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', letterSpacing: '-0.04em' }}>
              <span className="gradient-text">NuAIg</span>
              <span style={{ color: 'var(--chronos-text)', marginLeft: '4px' }}>Chronos</span>
            </span>
          </div>

          {/* Mobile steps (collapsed info) */}
          <div className="lg:hidden" style={{
            marginBottom: '28px', padding: '14px 16px', borderRadius: '12px',
            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
          }}>
            <p style={{ fontSize: '12px', color: 'var(--chronos-accent)', fontWeight: 600, marginBottom: '6px' }}>Internal staff tool</p>
            <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', lineHeight: 1.6 }}>
              Sign in with the credentials your admin provided. New accounts must be set up by your administrator — self-registration is not available.
            </p>
          </div>

          {/* Heading */}
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '6px' }}>
            Sign in
          </h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginBottom: '32px', lineHeight: 1.6 }}>
            Use your NuAIg work email and the password your admin provided.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text-subtle)', display: 'block', marginBottom: '8px' }}>
                Work email
              </label>
              <input
                type="email"
                className="input-base"
                placeholder="you@nuaig.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text-subtle)', display: 'block', marginBottom: '8px' }}>
                Password
              </label>
              <input
                type="password"
                className="input-base"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ justifyContent: 'center', padding: '13px 20px', marginTop: '4px', fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em' }}
              disabled={loading}
            >
              {loading && (
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3" />
                  <path d="M12 3a9 9 0 019 9" />
                </svg>
              )}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Help note */}
          <div style={{
            marginTop: '28px', padding: '14px 16px', borderRadius: '10px',
            background: 'var(--chronos-surface)', border: '1px solid var(--chronos-border)',
          }}>
            <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--chronos-text)', fontWeight: 600 }}>Can&apos;t sign in?</strong><br />
              Contact your manager or admin to reset your password or create an account. Accounts cannot be self-registered.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
