'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import { User } from '@supabase/supabase-js'
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  // profileReady is the definitive signal: session resolved AND profile fetched.
  // It starts false and only ever becomes true — never flips back to false for
  // the same session. This is what all dashboard pages should depend on.
  const [profileReady, setProfileReady] = useState(false)

  // Track last fetched userId to avoid redundant DB hits and state churn.
  // The middleware calls supabase.auth.getUser() on every navigation which
  // re-fires onAuthStateChange (TOKEN_REFRESHED / SIGNED_IN) with the same
  // user — without this guard, every page mount triggers a full profile
  // re-fetch and a loading flash.
  const lastFetchedUserId = useRef<string | null>(null)

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error || !data) return null
    const p = data as unknown as Profile
    setProfile(p)
    return p
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser) {
      // Force a fresh fetch even if userId hasn't changed
      lastFetchedUserId.current = null
      const p = await fetchProfile(currentUser.id)
      if (p) lastFetchedUserId.current = currentUser.id
    }
  }, [fetchProfile])

  useEffect(() => {
    let cancelled = false

    // Step 1: Resolve the initial session synchronously from local storage.
    // getSession() reads from the in-memory / localStorage cache — it's fast
    // and doesn't hit the network. We use it to avoid a loading flash on every
    // page navigation.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return

      const sessionUser = session?.user ?? null
      setUser(sessionUser)

      if (sessionUser) {
        lastFetchedUserId.current = sessionUser.id
        // Await the profile fetch before clearing the loading state.
        // This is the critical fix: consumers will never see loading=false
        // while profile is still null for an authenticated user.
        await fetchProfile(sessionUser.id)
        if (!cancelled) {
          setProfileReady(true)
          setLoading(false)
        }
      } else {
        if (!cancelled) {
          setProfileReady(false)
          setLoading(false)
        }
      }
    })

    // Step 2: Subscribe to auth state changes for sign-in / sign-out / token
    // refresh events that happen after the initial load.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return

        const nextId = session?.user?.id ?? null

        // The middleware fires getUser() on every navigation, which re-triggers
        // TOKEN_REFRESHED with the same user id. Skip the redundant DB fetch to
        // prevent the cascade: re-fetch → loading=true → spinner → done.
        if (nextId && nextId === lastFetchedUserId.current) {
          // Ensure loading is cleared even on repeated events (edge case where
          // the initial getSession path hadn't finished yet).
          setLoading(false)
          return
        }

        setUser(session?.user ?? null)

        if (session?.user) {
          lastFetchedUserId.current = session.user.id
          // Must await so profileReady only becomes true after the row exists.
          await fetchProfile(session.user.id)
          if (!cancelled) {
            setProfileReady(true)
            setLoading(false)
          }
        } else {
          // Signed out
          lastFetchedUserId.current = null
          setProfile(null)
          setProfileReady(false)
          setLoading(false)
        }
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
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
