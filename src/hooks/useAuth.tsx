'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import type { User, AuthError, PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/types'

// Single stable client instance — never recreate inside a component
const supabase = createClient()

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  /**
   * True only after both the session AND the profile row have been fetched.
   * Pages should gate data-fetching on `profileReady` rather than `!loading`
   * or `profile !== null` individually, because those can be true independently
   * during the async resolution window that causes the infinite-loading bug.
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
  loading: true,
  profileReady: false,
  isAdmin: false,
  isManager: false,
  isEmployee: false,
  canManageProjects: false,
  refreshProfile: async () => {},
})

// Tokens expired / refresh-token-not-found / JWT-expired all surface as
// PostgrestError code "PGRST301" or status 401. We retry these because a
// just-completed refresh inside getUser() may not yet have propagated to the
// in-memory client when the next query fires.
function isAuthError(err: PostgrestError | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST301') return true
  const msg = (err.message || '').toLowerCase()
  return msg.includes('jwt') || msg.includes('expired') || msg.includes('invalid token')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileReady, setProfileReady] = useState(false)

  // Track last fetched userId to avoid redundant DB hits and state churn.
  // Note: this is NOT used to skip TOKEN_REFRESHED events anymore — those
  // must always be allowed through so a refresh can heal a stale-token state.
  const lastFetchedUserId = useRef<string | null>(null)

  // Mirror of profileReady accessible from the onAuthStateChange closure.
  // The listener is registered once (we don't want to tear it down on every
  // render), so it would otherwise close over the initial profileReady value
  // and never see updates. The ref gives us up-to-date state without
  // triggering re-subscription.
  const profileReadyRef = useRef(false)
  useEffect(() => {
    profileReadyRef.current = profileReady
  }, [profileReady])

  /**
   * Fetch the profile row for `userId`. Returns the profile on success, or
   * `null` if the row genuinely does not exist. Throws on auth failures
   * (expired/invalid token) so the caller can decide whether to retry.
   *
   * Built-in retry: up to 3 attempts with backoff (100ms, 300ms) for auth
   * errors only. This bridges the small window between Supabase's automatic
   * token refresh completing and the new token being available on the
   * in-memory client for the next request.
   */
  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const delays = [0, 100, 300]
    let lastAuthError: PostgrestError | null = null

    for (const delay of delays) {
      if (delay > 0) await sleep(delay)

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (!error && data) {
        const p = data as unknown as Profile
        setProfile(p)
        return p
      }

      // Distinguish auth failures (worth retrying) from a missing row (not).
      if (error && isAuthError(error as PostgrestError)) {
        lastAuthError = error as PostgrestError
        continue
      }

      // Genuine "no row" — nothing to retry.
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[useAuth] fetchProfile failed (non-auth)', error)
      }
      return null
    }

    // All retries exhausted on auth errors — let the caller handle it.
    // eslint-disable-next-line no-console
    console.error('[useAuth] fetchProfile exhausted retries on auth error', lastAuthError)
    throw new Error('AUTH_TOKEN_FAILED')
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser) {
      lastFetchedUserId.current = null
      try {
        const p = await fetchProfile(currentUser.id)
        if (p) lastFetchedUserId.current = currentUser.id
      } catch {
        // Swallow — refreshProfile is fire-and-forget for callers
      }
    }
  }, [fetchProfile])

  useEffect(() => {
    let cancelled = false

    /**
     * Initial resolve.
     *
     * Use getUser() (NOT getSession()) here. getUser() validates the access
     * token against the auth server and, critically, triggers @supabase/ssr's
     * automatic refresh + storage-write if the token is expired. getSession()
     * just reads localStorage and returns whatever's there, even if it's
     * expired — which is the root of the "browser closed, came back, no data"
     * bug: middleware refreshes the cookie tokens server-side, but localStorage
     * stays stale until something forces a refresh on the client.
     */
    const init = async () => {
      try {
        const { data: { user: currentUser }, error } = await supabase.auth.getUser()

        if (cancelled) return

        if (error || !currentUser) {
          // No valid session — anonymous user.
          setUser(null)
          setProfile(null)
          setProfileReady(false)
          setLoading(false)
          return
        }

        setUser(currentUser)
        lastFetchedUserId.current = currentUser.id

        try {
          await fetchProfile(currentUser.id)
          if (!cancelled) {
            setProfileReady(true)
            setLoading(false)
          }
        } catch {
          // Auth-error path: fetch failed even after retries. Don't flip
          // profileReady — leave it false so pages stay in their loading
          // state. The onAuthStateChange listener below will re-fetch when
          // TOKEN_REFRESHED fires (which it will, shortly).
          if (!cancelled) {
            setLoading(false)
          }
        }
      } catch (e) {
        // Network failure or similar — fall back to unauthenticated state so
        // the UI doesn't hang on a spinner forever. Middleware will redirect.
        // eslint-disable-next-line no-console
        console.error('[useAuth] init failed', e as AuthError)
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    init()

    /**
     * Subscribe to auth state changes.
     *
     * We handle every event type explicitly rather than using a single
     * "fetch profile if user changed" guard, because TOKEN_REFRESHED is
     * exactly the event that should heal a previous failed fetch — skipping
     * it (as the previous implementation did) is what made the bug
     * unrecoverable without a hard refresh.
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return

        const sessionUser = session?.user ?? null

        if (event === 'SIGNED_OUT' || !sessionUser) {
          lastFetchedUserId.current = null
          setUser(null)
          setProfile(null)
          setProfileReady(false)
          setLoading(false)
          return
        }

        // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION
        setUser(sessionUser)

        // Re-fetch the profile when:
        //   1. The user id changed (sign-in or different user), OR
        //   2. We don't yet have a profile loaded (heals failed initial
        //      fetch — this is the critical recovery path), OR
        //   3. USER_UPDATED (profile fields may have changed server-side).
        const userChanged = sessionUser.id !== lastFetchedUserId.current
        const needsHealing = !profileReadyRef.current
        const shouldRefetch = userChanged || needsHealing || event === 'USER_UPDATED'

        if (!shouldRefetch) {
          // Same user, profile already loaded, just a token refresh — nothing
          // to do. Make sure loading is cleared in case the initial path is
          // still in flight on a slow connection.
          if (!cancelled) setLoading(false)
          return
        }

        lastFetchedUserId.current = sessionUser.id
        try {
          await fetchProfile(sessionUser.id)
          if (!cancelled) {
            setProfileReady(true)
            setLoading(false)
          }
        } catch {
          // Will retry on the next TOKEN_REFRESHED event.
          if (!cancelled) setLoading(false)
        }
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
    // fetchProfile is stable (empty deps via useCallback). profileReady is
    // read via profileReadyRef inside the listener so it stays current
    // without forcing a re-subscribe on every state change (which would tear
    // down and rebuild the realtime auth listener on every render).
  }, [fetchProfile])

  const role = profile?.role
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isEmployee = role === 'employee'
  const canManageProjects = isAdmin || isManager

  return (
    <AuthContext.Provider value={{
      user, profile, loading, profileReady,
      isAdmin, isManager, isEmployee,
      canManageProjects, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
