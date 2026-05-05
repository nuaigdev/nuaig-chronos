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
      // AUTH_TOKEN_FAILED after retries — unblock UI; middleware will redirect
      // on next navigation if the session is truly broken.
      if (!isCancelled()) setProfileReady(true)
    } finally {
      if (fetchingRef.current === sessionUser.id) fetchingRef.current = null
      if (!isCancelled()) setLoading(false)
    }
  }, [fetchProfile])

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

        if (error || !currentUser) {
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

        // ── Signed out ──
        if (event === 'SIGNED_OUT' || !sessionUser) {
          lastFetchedUserId.current = null
          fetchingRef.current = null
          setUser(null); setProfile(null); setCompany(null)
          setProfileReady(false); setLoading(false)
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

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

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
