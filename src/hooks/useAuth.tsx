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

  // Track last fetched userId to avoid redundant DB hits and state churn.
  // The middleware calls supabase.auth.getUser() on every navigation which
  // re-fires onAuthStateChange (TOKEN_REFRESHED / SIGNED_IN) with the same
  // user — causing every page that consumes profile/user to re-render and
  // re-fetch data on each route change.
  const lastFetchedUserId = useRef<string | null>(null)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) setProfile(data as unknown as Profile)
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser) {
      // Force a fresh fetch even if userId hasn't changed
      lastFetchedUserId.current = null
      await fetchProfile(currentUser.id)
      lastFetchedUserId.current = currentUser.id
    }
  }, [fetchProfile])

  useEffect(() => {
    // Get initial session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        lastFetchedUserId.current = session.user.id
        fetchProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Then listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const nextId = session?.user?.id ?? null

        // Middleware calls getUser() on every navigation which re-fires this
        // handler with the same user id. Skip redundant state updates to prevent
        // cascading re-renders and data re-fetches across all dashboard pages.
        if (nextId && nextId === lastFetchedUserId.current) {
          setLoading(false)
          return
        }

        setUser(session?.user ?? null)
        if (session?.user) {
          lastFetchedUserId.current = session.user.id
          await fetchProfile(session.user.id)
        } else {
          lastFetchedUserId.current = null
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const role = profile?.role
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isEmployee = role === 'employee'
  const canManageProjects = isAdmin || isManager

  return (
    <AuthContext.Provider value={{
      user, profile, loading, isAdmin, isManager, isEmployee,
      canManageProjects, refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
