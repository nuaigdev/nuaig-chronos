'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WorkItemComment } from '@/types'
import { createNotification } from '@/utils'
import toast from 'react-hot-toast'

// Single stable client instance — never recreate inside a component
const supabase = createClient()

const COMMENT_SELECT = `
  *,
  user:profiles!work_item_comments_user_id_fkey(id, full_name, role)
`

/** Who to ping when a comment lands: the item's assignees and its creator. */
export interface CommentNotifyTarget {
  title: string
  recipientIds: string[]
}

interface UseWorkItemCommentsResult {
  comments: WorkItemComment[]
  loading: boolean
  postComment: (body: string, notify: CommentNotifyTarget) => Promise<boolean>
  editComment: (id: string, body: string) => Promise<boolean>
  deleteComment: (id: string) => Promise<void>
}

export function useWorkItemComments(workItemId: string | undefined): UseWorkItemCommentsResult {
  const [comments, setComments] = useState<WorkItemComment[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    if (!workItemId) { setComments([]); setLoading(false); return }
    let cancelled = false

    const load = async () => {
      const { data, error } = await supabase
        .from('work_item_comments')
        .select(COMMENT_SELECT)
        .eq('work_item_id', workItemId)
        .order('created_at', { ascending: true })

      if (cancelled) return
      if (error) {
        console.error('[useWorkItemComments]', error)
        toast.error('Failed to load comments')
      } else {
        setComments((data || []) as unknown as WorkItemComment[])
      }
      setLoading(false)
    }

    setLoading(true)
    load()
    return () => { cancelled = true }
  }, [workItemId, tick])

  // Realtime: an open thread updates as others post.
  useEffect(() => {
    if (!workItemId) return
    const channel = supabase
      .channel(`work-item-comments-${workItemId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_item_comments', filter: `work_item_id=eq.${workItemId}` },
        () => refetch(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [workItemId, refetch])

  const postComment = async (body: string, notify: CommentNotifyTarget): Promise<boolean> => {
    const trimmed = body.trim()
    if (!trimmed || !workItemId) return false

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('work_item_comments')
      .insert({ work_item_id: workItemId, user_id: user.id, body: trimmed })

    if (error) {
      toast.error(error.message || 'Could not post comment')
      return false
    }

    // Ping everyone attached to the item except the commenter.
    await Promise.all(
      Array.from(new Set(notify.recipientIds))
        .filter(uid => uid !== user.id)
        .map(uid => createNotification(supabase, {
          user_id: uid,
          type: 'work_item_commented',
          title: 'New comment',
          message: `New comment on "${notify.title}"`,
          related_id: workItemId,
        }))
    )

    refetch()
    return true
  }

  const editComment = async (id: string, body: string): Promise<boolean> => {
    const trimmed = body.trim()
    if (!trimmed) return false

    const { error } = await supabase
      .from('work_item_comments')
      .update({ body: trimmed } as never)
      .eq('id', id)

    if (error) {
      toast.error('Could not save the edit')
      return false
    }
    refetch()
    return true
  }

  const deleteComment = async (id: string) => {
    const previous = comments
    setComments(cur => cur.filter(c => c.id !== id))

    const { error } = await supabase.from('work_item_comments').delete().eq('id', id)
    if (error) {
      setComments(previous)
      toast.error('Could not delete the comment')
    }
  }

  return { comments, loading, postComment, editComment, deleteComment }
}
