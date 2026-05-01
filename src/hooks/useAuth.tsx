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

  const lastFetchedUserId = useRef<string | null>(null)
  const profileReadyRef = useRef(false)
  useEffect(() => {
    profileReadyRef.current = profileReady
  }, [profileReady])

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const delays = [0, 100, 300]
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
        // eslint-disable-next-line no-console
        console.error('[useAuth] fetchProfile failed (non-auth)', error)
      }
      return null
    }

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

    const init = async () => {
      try {
        const { data: { user: currentUser }, error } = await supabase.auth.getUser()

        if (cancelled) return

        if (error || !currentUser) {
          setUser(null)
          setProfile(null)
          setCompany(null)
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
          if (!cancelled) {
            setLoading(false)
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[useAuth] init failed', e as AuthError)
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return

        const sessionUser = session?.user ?? null

        if (event === 'SIGNED_OUT' || !sessionUser) {
          lastFetchedUserId.current = null
          setUser(null)
          setProfile(null)
          setCompany(null)
          setProfileReady(false)
          setLoading(false)
          return
        }

        setUser(sessionUser)

        const userChanged = sessionUser.id !== lastFetchedUserId.current
        const needsHealing = !profileReadyRef.current
        const shouldRefetch = userChanged || needsHealing || event === 'USER_UPDATED'

        if (!shouldRefetch) {
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
          if (!cancelled) setLoading(false)
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
      user, profile, company, loading, profileReady,
      isAdmin, isManager, isEmployee,
      canManageProjects, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
