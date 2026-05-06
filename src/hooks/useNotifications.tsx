'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AppNotification } from '@/types'
import { useAuth } from './useAuth'
import { handleAuthError } from '@/utils/auth-error'

// Single stable client instance
const supabase = createClient()

interface NotificationsContextType {
  notifications: AppNotification[]
  unreadCount: number
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  refresh: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextType>({
  notifications: [],
  unreadCount: 0,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  refresh: async () => {},
})

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const { user } = useAuth()

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (handleAuthError(error)) return

    if (data) {
      const typed = data as unknown as AppNotification[]
      setNotifications(typed)
      setUnreadCount(typed.filter((n) => !n.is_read).length)
    }
  }, [user?.id])

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const markAllAsRead = async () => {
    if (!user) return
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  useEffect(() => {
    if (!user) return

    fetchNotifications()

    const channelName = `notifications:${user.id}`

    // Remove any stale channel — handles React StrictMode double-invoke
    supabase.getChannels().forEach((ch) => {
      if (ch.topic === `realtime:${channelName}`) {
        supabase.removeChannel(ch)
      }
    })

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchNotifications()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // fetchNotifications is intentionally omitted: it is stable for the lifetime of a user session
  // (useCallback deps = [user?.id]). Using [user?.id] instead of [user] prevents channel
  // teardown/rebuild on every navigation when middleware re-fires onAuthStateChange with same user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, refresh: fetchNotifications }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
