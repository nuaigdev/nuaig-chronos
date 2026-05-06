'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile, Company } from '@/types'

// Single stable client instance
const supabase = createClient()

interface UseProfileResult {
  user: { id: string; email?: string } | null
  profile: Profile | null
  company: Company | null
  loading: boolean
  isAdmin: boolean
  isManager: boolean
  isEmployee: boolean
  canManageProjects: boolean
  refreshProfile: () => void
}

/**
 * Simple per-component auth hook — no context, no provider.
 *
 * Each component that needs user/profile data calls this hook directly.
 * It calls getUser() + profiles query once on mount, derives role helpers,
 * and exposes them. If the session is invalid, middleware has already
 * redirected to /login before this code ever runs.
 *
 * This replaces the old AuthProvider/useAuth pattern that had eight layers
 * of defensive guards (watchdog, wake handler, retry loops, signOut-await,
 * isSessionGoneError, etc.) and still caused stuck spinners.
 */
export function useProfile(): UseProfileResult {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const refreshProfile = useCallback(() => {
    setTick(t => t + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (cancelled) return

        if (!currentUser) {
          // No session — middleware will redirect on protected routes.
          // On /login this is expected. Just clear state.
          setUser(null)
          setProfile(null)
          setCompany(null)
          return
        }

        setUser({ id: currentUser.id, email: currentUser.email })

        const { data } = await supabase
          .from('profiles')
          .select('*, company:companies(*)')
          .eq('id', currentUser.id)
          .single()

        if (cancelled) return

        if (data) {
          const p = data as unknown as Profile & { company: Company }
          setProfile(p)
          if (p.company) setCompany(p.company)
        }
      } catch (err) {
        console.error('[useProfile] load failed', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [tick])

  const role = profile?.role
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isEmployee = role === 'employee'
  const canManageProjects = isAdmin || isManager

  return {
    user,
    profile,
    company,
    loading,
    isAdmin,
    isManager,
    isEmployee,
    canManageProjects,
    refreshProfile,
  }
}
