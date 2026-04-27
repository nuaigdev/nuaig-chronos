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
          // Provide a friendlier message for the database/unexpected error
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

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'var(--chronos-bg)' }}>
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)', filter: 'blur(60px)' }} />
        {/* Grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="w-full max-w-md mx-4 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '22px', letterSpacing: '-0.03em' }}>
                <span className="gradient-text">NuAIg</span>
                <span style={{ color: 'var(--chronos-text)', marginLeft: '4px' }}>Chronos</span>
              </span>
            </div>
          </div>
          <p style={{ color: 'var(--chronos-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: '14px' }}>
            Time Intelligence Platform
          </p>
        </div>

        {/* Card */}
        <div className="card-base p-8" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '14px', marginBottom: '28px' }}>
            {mode === 'login' ? 'Sign in to your workspace' : 'Join your team on Chronos'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {mode === 'signup' && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text-subtle)', display: 'block', marginBottom: '6px' }}>Full Name</label>
                <input
                  type="text"
                  className="input-base"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text-subtle)', display: 'block', marginBottom: '6px' }}>Email</label>
              <input
                type="email"
                className="input-base"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text-subtle)', display: 'block', marginBottom: '6px' }}>Password</label>
              <input
                type="password"
                className="input-base"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              style={{ justifyContent: 'center', marginTop: '4px', padding: '13px' }}
              disabled={loading}
            >
              {loading ? (
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3"/>
                  <path d="M12 3a9 9 0 019 9"/>
                </svg>
              ) : null}
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: 'var(--chronos-text-muted)' }}>
            {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              style={{ color: 'var(--chronos-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'var(--chronos-text-muted)' }}>
          © {new Date().getFullYear()} NuAIg. All rights reserved.
        </p>
      </div>
    </div>
  )
}
