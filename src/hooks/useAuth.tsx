'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import type { User, AuthError, PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { Profile, Company } from '@/types'

// Single stable client instance — never recreate inside a component
const supabase = createClient()

interface AuthContextType {
  user: User | null
  profile: Profile | null
  company: Company | null
  loading: boolean
  /**
   * True only after both the session AND the profile row have been fetched.
   */
  profileReady: boolean
  isAdmin: boolean
  isManager: boolean
  isEmployee: boolean
  canManageProjects: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  company: null,
  loading: true,
  profileReady: false,
  isAdmin: false,
  isManager: false,
  isEmployee: false,
  canManageProjects: false,
  refreshProfile: async () => {},
})

function isAuthError(err: PostgrestError | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST301') return true
  const msg = (err.message || '').toLowerCase()
  return msg.includes('jwt') || msg.includes('expired') || msg.includes('invalid token')
}

/**
 * Detect a dead/stale Supabase session from a getUser() error.
 *
 * When this returns true, the refresh token itself is invalid or the session
 * has been revoked server-side — there is no recovery path other than signing
 * out and forcing the user back to /login. Quietly clearing React state (the
 * old behaviour) leaves the user on a frozen dashboard with no way out except
 * a manual hard refresh or cookie clear.
 */
function isSessionGoneError(err: AuthError | null | undefined): boolean {
  if (!err) return false
  const msg = (err.message || '').toLowerCase()
  // 403 status from /auth/v1/user — the canonical session_not_found signal
  if ((err as { status?: number }).status === 403) return true
  // Common server-side messages for invalid/missing session or refresh token
  return (
    msg.includes('session_not_found') ||
    msg.includes('session not found') ||
    msg.includes("session id") && msg.includes("doesn't exist") ||
    msg.includes('auth session missing') ||
    msg.includes('refresh token not found') ||
    msg.includes('invalid refresh token') ||
    msg.includes('token_revoked') ||
    msg.includes('token revoked') ||
    msg.includes('jwt expired') && msg.includes('refresh')
  )
}

/**
 * Hard reset: clear all client auth state and force a full navigation to
 * /login. This is the ONLY recovery path when the session is irrecoverable.
 *
 * - signOut() clears localStorage and cookies on the Supabase client side
 * - window.location.href forces a full HTTP request through the middleware,
 *   which will see the cleared cookies and serve /login cleanly
 *
 * Using router.push here would NOT work — it's a client-side nav, middleware
 * doesn't run, and the broken auth state would persist into the next render.
 */
async function hardResetToLogin(): Promise<void> {
  try {
    await supabase.auth.signOut()
  } catch {
    // signOut can throw if there's no session to sign out from — that's fine,
    // we still want to redirect.
  }
  if (typeof window !== 'undefined') {
    window.location.href = '/login'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileReady, setProfileReady] = useState(false)

  // Track in-flight profile fetch to prevent duplicate concurrent fetches
  const fetchingRef = useRef<string | null>(null)
  const lastFetchedUserId = useRef<string | null>(null)
  const profileReadyRef = useRef(false)
  useEffect(() => { profileReadyRef.current = profileReady }, [profileReady])

  // Guard against firing multiple simultaneous redirects to /login
  const redirectingRef = useRef(false)
  const triggerHardReset = useCallback(async () => {
    if (redirectingRef.current) return
    redirectingRef.current = true
    await hardResetToLogin()
  }, [])

  // ── fetchProfile ──────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const delays = [0, 150, 400]
    let lastAuthError: PostgrestError | null = null

    for (const delay of delays) {
      if (delay > 0) await sleep(delay)

      const { data, error } = await supabase
        .from('profiles')
        .select('*, company:companies(*)')
        .eq('id', userId)
        .single()

      if (!error && data) {
        const p = data as unknown as Profile & { company: Company }
        setProfile(p)
        if (p.company) setCompany(p.company)
        return p
      }

      if (error && isAuthError(error as PostgrestError)) {
        lastAuthError = error as PostgrestError
        continue
      }

      if (error) {
        console.error('[useAuth] fetchProfile failed (non-auth)', error)
      }
      return null
    }

    console.error('[useAuth] fetchProfile exhausted retries on auth error', lastAuthError)
    throw new Error('AUTH_TOKEN_FAILED')
  }, [])

  // ── loadProfile ───────────────────────────────────────────────────────────
  // Single guarded entry point. On any failure it still sets profileReady so
  // the app never stays stuck in an infinite loading state.
  const loadProfile = useCallback(async (sessionUser: User, isCancelled: () => boolean) => {
    // Skip if another fetch for this exact user is already in-flight
    if (fetchingRef.current === sessionUser.id) return
    fetchingRef.current = sessionUser.id

    try {
      const p = await fetchProfile(sessionUser.id)
      if (isCancelled()) return
      lastFetchedUserId.current = sessionUser.id
      // Always set profileReady=true even if profile row was null — unblocks UI
      setProfileReady(true)
      if (!p) console.warn('[useAuth] profile row not found for user', sessionUser.id)
    } catch {
      // AUTH_TOKEN_FAILED after retries — the session is dead. Force the user
      // back to /login instead of leaving them on a frozen dashboard.
      if (!isCancelled()) {
        await triggerHardReset()
      }
    } finally {
      if (fetchingRef.current === sessionUser.id) fetchingRef.current = null
      if (!isCancelled()) setLoading(false)
    }
  }, [fetchProfile, triggerHardReset])

  // ── refreshProfile ────────────────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) return
    // Force a fresh fetch
    lastFetchedUserId.current = null
    fetchingRef.current = null
    let done = false
    await loadProfile(currentUser, () => done)
    done = true
  }, [loadProfile])

  // ── Bootstrap + auth state subscription ──────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled

    const init = async () => {
      try {
        const { data: { user: currentUser }, error } = await supabase.auth.getUser()
        if (cancelled) return

        // ── Stale/dead session detection ───────────────────────────────────
        // If getUser() returns an error that indicates the session is gone
        // (session_not_found, 403, refresh token invalid), we MUST force the
        // user back to /login. Anything else leaves them stuck on a frozen
        // page with no data and no way to recover except a manual hard
        // refresh — which is exactly the bug we are eliminating.
        if (error && isSessionGoneError(error)) {
          await triggerHardReset()
          return
        }

        if (error || !currentUser) {
          // No session at all (not logged in) OR an unrecognised auth error.
          // Public pages like /login don't need state; protected pages will
          // be caught by middleware on the next navigation.
          setUser(null); setProfile(null); setCompany(null)
          setProfileReady(false); setLoading(false)
          return
        }

        setUser(currentUser)
        await loadProfile(currentUser, isCancelled)
      } catch (e) {
        console.error('[useAuth] init failed', e as AuthError)
        if (!cancelled) setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return

        const sessionUser = session?.user ?? null

        // ── Signed out OR refresh failed silently ─────────────────────────
        // Two cases land here:
        //   1. Explicit SIGNED_OUT (user clicked sign out, or signOut() was
        //      called from anywhere in the app).
        //   2. TOKEN_REFRESHED fired but session is null — meaning the
        //      refresh token itself is no longer valid. The Supabase client
        //      cannot recover from this; only a fresh login can.
        // Either way, we hard-reset to /login. This is the linchpin fix
        // that makes the stale-session symptom impossible.
        if (event === 'SIGNED_OUT' || !sessionUser) {
          lastFetchedUserId.current = null
          fetchingRef.current = null
          setUser(null); setProfile(null); setCompany(null)
          setProfileReady(false); setLoading(false)

          // Don't redirect if we're already on /login — would cause a loop
          // and a flash of the page reloading itself.
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            await triggerHardReset()
          }
          return
        }

        setUser(sessionUser)

        const userChanged = sessionUser.id !== lastFetchedUserId.current

        // KEY FIX: TOKEN_REFRESHED must always trigger a re-fetch.
        // Without this, a tab that wakes after a long idle will have a new
        // access token but stale (or missing) profile state, leaving the app
        // stuck because profileReady never flips to true.
        const shouldRefetch =
          userChanged ||
          !profileReadyRef.current ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED' ||
          event === 'SIGNED_IN'

        if (!shouldRefetch) {
          if (!cancelled) setLoading(false)
          return
        }

        // Allow loadProfile to run fresh:
        // - user changed: reset both refs
        // - same user but TOKEN_REFRESHED/healing: only reset fetchingRef so
        //   loadProfile can issue a new query with the fresh token
        if (userChanged) {
          lastFetchedUserId.current = null
          fetchingRef.current = null
        } else {
          fetchingRef.current = null
        }

        await loadProfile(sessionUser, isCancelled)
      }
    )

    // ── Window focus / online event safety net ──────────────────────────────
    // When a tab is hidden for hours and the user returns, the visibilitychange
    // event fires before any user interaction. We proactively re-validate the
    // session — if it died while the tab was asleep, isSessionGoneError will
    // catch it and redirect to /login cleanly, instead of waiting for the next
    // data fetch to fail mysteriously.
    const onWake = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      try {
        const { error } = await supabase.auth.getUser()
        if (error && isSessionGoneError(error)) {
          await triggerHardReset()
        }
      } catch (e) {
        console.warn('[useAuth] wake-check failed', e)
      }
    }

    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', onWake)
      window.addEventListener('online', onWake)
    }

    return () => {
      cancelled = true
      subscription.unsubscribe()
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', onWake)
        window.removeEventListener('online', onWake)
      }
    }
  }, [loadProfile, triggerHardReset])

  const role = profile?.role
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isEmployee = role === 'employee'
  const canManageProjects = isAdmin || isManager

  return (
    <AuthContext.Provider value={{
      user, profile, company, loading, profileReady,
      isAdmin, isManager, isEmployee,
      canManageProjects, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
