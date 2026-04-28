'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [fullName, setFullName] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          if (error.message?.toLowerCase().includes('database') || error.status === 500) {
            throw new Error('A server error occurred. Please try again in a moment.')
          }
          throw error
        }
        if (data?.user) {
          router.push('/dashboard')
          router.refresh()
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }
        })
        if (error) throw error
        toast.success('Account created! Please check your email to verify.')
        setMode('login')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      title: 'Intelligent Time Tracking',
      desc: 'Log hours with full project and task context',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      title: 'Real-time Analytics',
      desc: 'Visual dashboards and team productivity insights',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      ),
      title: 'Approval Workflows',
      desc: 'Seamless timesheet review and sign-off process',
    },
  ]

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--chronos-bg)' }}>
      {/* Left brand panel */}
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
              <span style={{ fontSize: '12px', color: 'var(--chronos-accent)', fontWeight: 500, letterSpacing: '0.02em' }}>Time Intelligence Platform</span>
            </div>

            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '42px', fontWeight: 800,
              lineHeight: 1.1, letterSpacing: '-0.04em', marginBottom: '20px',
            }}>
              Work smarter,<br />
              <span className="gradient-text">track better.</span>
            </h2>

            <p style={{ fontSize: '15px', color: 'var(--chronos-text-muted)', lineHeight: 1.75, marginBottom: '44px', maxWidth: '360px' }}>
              Streamline time tracking, project management, and workforce analytics — unified in one platform built for modern teams.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {features.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '11px', flexShrink: 0,
                    background: 'var(--chronos-surface-2)', border: '1px solid var(--chronos-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--chronos-accent)',
                  }}>
                    {f.icon}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--chronos-text)', marginBottom: '3px' }}>{f.title}</p>
                    <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', lineHeight: 1.5 }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', letterSpacing: '0.01em' }}>
            © {new Date().getFullYear()} NuAIg Technologies. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }} className="animate-fade-in">
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

          {/* Heading */}
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '8px' }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '14px', marginBottom: '36px', lineHeight: 1.6 }}>
            {mode === 'login'
              ? 'Enter your credentials to access your workspace.'
              : 'Fill in the details below to join your team on Chronos.'}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {mode === 'signup' && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text-subtle)', display: 'block', marginBottom: '8px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  className="input-base"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text-subtle)', display: 'block', marginBottom: '8px' }}>
                Email address
              </label>
              <input
                type="email"
                className="input-base"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text-subtle)' }}>
                  Password
                </label>
              </div>
              <input
                type="password"
                className="input-base"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
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
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in to workspace' : 'Create Account'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', margin: '28px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--chronos-border)' }} />
            <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--chronos-border)' }} />
          </div>

          {/* Mode toggle */}
          <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--chronos-text-muted)' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              style={{
                color: 'var(--chronos-accent)', background: 'none', border: 'none',
                cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', fontSize: 'inherit',
              }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
