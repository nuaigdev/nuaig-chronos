'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

// Abstract Chronos logo mark — three offset arcs + solid pill
// Represents flow, forward motion, and structure — not time-specific
function ChronosLogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path
        d="M 26 8 C 30 12 30 20 26 24"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M 22 4 C 30 8 30 24 22 28"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      <rect x="6" y="11" width="14" height="10" rx="5" fill="white" />
    </svg>
  )
}

// Full logo lockup used on the login panel
function ChronosFullLogo({ large = false }: { large?: boolean }) {
  const iconSize = large ? 52 : 36
  const iconRadius = large ? '16px' : '11px'
  const fontSize = large ? '28px' : '19px'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: large ? '14px' : '10px' }}>
      <div style={{
        width: `${iconSize}px`, height: `${iconSize}px`, borderRadius: iconRadius,
        background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: large ? '0 0 40px rgba(59,130,246,0.3)' : '0 0 16px rgba(59,130,246,0.2)',
      }}>
        <ChronosLogoMark size={large ? 30 : 22} />
      </div>
      <span style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize,
        letterSpacing: '-0.04em',
        background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Chronos
      </span>
    </div>
  )
}

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
      desc: 'Your admin will create your account and provide your login email and password.',
    },
    {
      number: '2',
      title: 'Sign in below',
      desc: 'Enter your email and password. Contact your administrator if you need access — self-registration is disabled.',
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
            position: 'absolute', top: '15%', left: '8%',
            width: '500px', height: '500px',
            background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }} />
          <div style={{
            position: 'absolute', bottom: '18%', right: '4%',
            width: '360px', height: '360px',
            background: 'radial-gradient(circle, rgba(124,58,237,0.09) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }} />
          {/* Subtle dot grid */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.018 }}>
            <defs>
              <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="1.5" cy="1.5" r="1.5" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>
        </div>

        {/* Panel content */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '48px 56px' }}>
          {/* Logo */}
          <ChronosFullLogo />

          {/* Hero content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: '420px' }}>

            {/* Large logo mark — decorative, centered above heading */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{
                width: '80px', height: '80px', borderRadius: '22px',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(124,58,237,0.15))',
                border: '1px solid rgba(99,102,241,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 60px rgba(59,130,246,0.12)',
              }}>
                <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
                  <path d="M 26 8 C 30 12 30 20 26 24" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
                  <path d="M 22 4 C 30 8 30 24 22 28" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
                  <rect x="6" y="11" width="14" height="10" rx="5" fill="url(#lg)" />
                  <defs>
                    <linearGradient id="lg" x1="6" y1="11" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#60a5fa" />
                      <stop offset="1" stopColor="#a78bfa" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '36px', fontWeight: 800,
              lineHeight: 1.1, letterSpacing: '-0.04em', marginBottom: '14px',
            }}>
              Workforce intelligence,<br />
              <span style={{
                background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>simplified.</span>
            </h2>

            <p style={{ fontSize: '14px', color: 'var(--chronos-text-muted)', lineHeight: 1.75, marginBottom: '40px', maxWidth: '360px' }}>
              Track time, manage projects, and understand how your team works — all in one place. Accounts are admin-provisioned.
            </p>

            {/* How-to steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--chronos-text-muted)', textTransform: 'uppercase', marginBottom: '18px' }}>
                How to get started
              </p>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', position: 'relative', paddingBottom: i < steps.length - 1 ? '24px' : '0' }}>
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
            © {new Date().getFullYear()} Chronos. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
        <div style={{ width: '100%', maxWidth: '380px' }} className="animate-fade-in">
          {/* Mobile logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '36px', justifyContent: 'center' }} className="lg:hidden">
            <ChronosFullLogo />
          </div>

          {/* Mobile info */}
          <div className="lg:hidden" style={{
            marginBottom: '28px', padding: '14px 16px', borderRadius: '12px',
            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
          }}>
            <p style={{ fontSize: '12px', color: 'var(--chronos-accent)', fontWeight: 600, marginBottom: '6px' }}>Account required</p>
            <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', lineHeight: 1.6 }}>
              Sign in with the credentials your admin provided. New accounts must be set up by your administrator.
            </p>
          </div>

          {/* Heading */}
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '6px' }}>
            Sign in
          </h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginBottom: '32px', lineHeight: 1.6 }}>
            Use your work email and the password your admin provided.
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
                placeholder="you@company.com"
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
              Contact your admin to reset your password or create an account. Self-registration is not available.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
