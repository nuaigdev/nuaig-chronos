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
 * Detect a STALE session (one that existed but is now invalid).
 *
 * IMPORTANT: This must NOT match "no session at all" cases like a fresh
 * /login visit where the user has never signed in. Matching those would
 * cause an infinite redirect loop on the login page.
 *
 * Stale = had cookies/tokens that the server has now rejected.
 * No-session = never had any tokens to begin with.
 */
function isSessionGoneError(err: AuthError | null | undefined): boolean {
  if (!err) return false
  const msg = (err.message || '').toLowerCase()

  // "Auth session missing" is the no-cookies-at-all case — NOT stale.
  // Returning false here is what prevents the /login redirect loop.
  if (msg.includes('auth session missing')) return false

  if ((err as { status?: number }).status === 403) return true

  return (
    msg.includes('session_not_found') ||
    msg.includes('session not found') ||
    (msg.includes("session id") && msg.includes("doesn't exist")) ||
    msg.includes('refresh token not found') ||
    msg.includes('invalid refresh token') ||
    msg.includes('token_revoked') ||
    msg.includes('token revoked')
  )
}

/**
 * True if the user is currently sitting on /login (or any /auth/* page).
 * We must never trigger a redirect-to-login while already on login —
 * that's an infinite loop.
 */
function isOnPublicAuthPage(): boolean {
  if (typeof window === 'undefined') return true
  const path = window.location.pathname
  return path.startsWith('/login') || path.startsWith('/auth')
}

function hardResetToLogin(): void {
  // Don't redirect if we're already on a public auth page — that's the loop.
  if (isOnPublicAuthPage()) return

  // ── Fire-and-forget signOut, then redirect IMMEDIATELY ────────────────────
  // Previously this awaited signOut() before redirecting, which meant a hung
  // signOut (free Supabase 5xx, network blip) deadlocked the page on a spinner.
  // Now: kick off signOut in the background; redirect right away. The
  // middleware's redirectToLoginAndClearAuth() strips the auth cookies on the
  // /login request anyway, so cookie cleanup is guaranteed regardless of
  // whether the background signOut() succeeded.
  // Fire-and-forget signOut. Attach a noop catch so a rejection doesn't
  // bubble up as an unhandled promise rejection (which would log noise but
  // not block anything). The redirect below proceeds regardless.
  supabase.auth.signOut().catch(() => { /* ignored on purpose */ })
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
  const triggerHardReset = useCallback(() => {
    if (redirectingRef.current) return
    if (isOnPublicAuthPage()) return  // Never redirect while on /login
    redirectingRef.current = true
    hardResetToLogin()
  }, [])

  // ── fetchProfile ──────────────────────────────────────────────────────────
  // Each attempt is bounded by a 1.5s timeout. If the query hangs (free
  // Supabase blip, network stall), we treat it as an auth-style failure
  // and retry rather than waiting indefinitely. The whole bootstrap is
  // additionally bounded by the watchdog above so the spinner never sticks.
  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const delays = [0, 150, 400]
    const PER_ATTEMPT_MS = 1500
    let lastAuthError: PostgrestError | null = null

    const TIMEOUT_SENTINEL = Symbol('timeout')

    for (const delay of delays) {
      if (delay > 0) await sleep(delay)

      const queryPromise = supabase
        .from('profiles')
        .select('*, company:companies(*)')
        .eq('id', userId)
        .single()

      const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>(resolve =>
        setTimeout(() => resolve(TIMEOUT_SENTINEL), PER_ATTEMPT_MS)
      )

      const result = await Promise.race([queryPromise, timeoutPromise])

      if (result === TIMEOUT_SENTINEL) {
        console.warn('[useAuth] fetchProfile attempt timed out, retrying')
        continue
      }

      const { data, error } = result as { data: unknown; error: PostgrestError | null }

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

    console.error('[useAuth] fetchProfile exhausted retries on auth/timeout', lastAuthError)
    throw new Error('AUTH_TOKEN_FAILED')
  }, [])

  // ── loadProfile ───────────────────────────────────────────────────────────
  const loadProfile = useCallback(async (sessionUser: User, isCancelled: () => boolean) => {
    if (fetchingRef.current === sessionUser.id) return
    fetchingRef.current = sessionUser.id

    try {
      const p = await fetchProfile(sessionUser.id)
      if (isCancelled()) return
      lastFetchedUserId.current = sessionUser.id
      setProfileReady(true)
      if (!p) console.warn('[useAuth] profile row not found for user', sessionUser.id)
    } catch {
      // AUTH_TOKEN_FAILED after retries — session is dead. Force redirect.
      if (!isCancelled()) {
        triggerHardReset()
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

    // ── Watchdog: guarantee no infinite spinner ───────────────────────────
    // If anything in the auth bootstrap (getUser, profile fetch, network)
    // takes longer than this, give up. Two cases:
    //   1. User on /login: just clear loading. Login form is visible already.
    //   2. User on a protected page: profile never loaded → page would spin
    //      forever waiting on profileReady → hard-redirect to /login so they
    //      can sign in fresh. This is the user-visible "stuck app" fix.
    // Free Supabase under bursty load is the main reason this trips.
    // 3s is comfortably above p99 healthy latency.
    const WATCHDOG_MS = 3000
    const watchdog = setTimeout(() => {
      if (cancelled) return
      console.warn('[useAuth] bootstrap watchdog fired after', WATCHDOG_MS, 'ms')
      setLoading(false)
      // On a protected page with no profile resolved yet, the page is stuck
      // on its own spinner (it's gated on profileReady). Redirect to /login.
      if (!profileReadyRef.current && !isOnPublicAuthPage()) {
        triggerHardReset()
      }
    }, WATCHDOG_MS)

    const init = async () => {
      try {
        const { data: { user: currentUser }, error } = await supabase.auth.getUser()
        if (cancelled) return

        // Stale session (had cookies, server rejected them) → hard reset.
        // The isSessionGoneError() helper deliberately does NOT match
        // "Auth session missing" so a fresh /login visit doesn't loop.
        if (error && isSessionGoneError(error)) {
          triggerHardReset()
          return
        }

        if (error || !currentUser) {
          // No session at all — user is logged out / on /login. Just clear
          // state. Middleware will handle redirects on protected route nav.
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
        if (event === 'SIGNED_OUT' || !sessionUser) {
          lastFetchedUserId.current = null
          fetchingRef.current = null
          setUser(null); setProfile(null); setCompany(null)
          setProfileReady(false); setLoading(false)

          // If we're on a protected page, redirect to /login immediately.
          // We do NOT call signOut() again here — it has already happened
          // (that's why this event fired). Calling it again races with
          // the original signOut promise and breaks the redirect.
          // We also do NOT route through triggerHardReset() because it
          // calls signOut() internally, which is the same problem.
          if (typeof window !== 'undefined' && !isOnPublicAuthPage()) {
            redirectingRef.current = true
            window.location.href = '/login'
          }
          return
        }

        setUser(sessionUser)

        const userChanged = sessionUser.id !== lastFetchedUserId.current

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

        if (userChanged) {
          lastFetchedUserId.current = null
          fetchingRef.current = null
        } else {
          fetchingRef.current = null
        }

        await loadProfile(sessionUser, isCancelled)
      }
    )

    // ── Window focus / online wake handler ──────────────────────────────────
    // Fires when a hidden tab becomes visible again, or when the network
    // comes back online. We re-check the session — but ONLY if the user is
    // on a protected route. Otherwise the visibility event on /login would
    // re-trigger and loop.
    //
    // The wake check has its own short timeout: if getUser() doesn't return
    // within 2s, we treat it as a session problem and redirect. Free Supabase
    // can stall here, and we'd rather send the user to /login than leave
    // them looking at a stale page that will fail every subsequent query.
    const onWake = async () => {
      if (cancelled) return
      if (typeof document === 'undefined') return
      if (document.visibilityState !== 'visible') return
      // Skip on public auth pages — nothing to validate.
      if (isOnPublicAuthPage()) return

      const TIMEOUT_SENTINEL = Symbol('wake-timeout')

      try {
        const wakeTimeout = new Promise<typeof TIMEOUT_SENTINEL>(resolve =>
          setTimeout(() => resolve(TIMEOUT_SENTINEL), 2000)
        )
        const result = await Promise.race([supabase.auth.getUser(), wakeTimeout])

        if (result === TIMEOUT_SENTINEL) {
          console.warn('[useAuth] wake-check timed out → redirecting to /login')
          triggerHardReset()
          return
        }

        const { error } = result as { error: AuthError | null }
        if (error && isSessionGoneError(error)) {
          triggerHardReset()
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
      clearTimeout(watchdog)
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
