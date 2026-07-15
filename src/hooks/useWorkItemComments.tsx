'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WorkItemComment, Profile } from '@/types'
import { createNotification, getActorName } from '@/utils'
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
  postComment: (body: string, notify: CommentNotifyTarget, mentionedIds?: string[]) => Promise<boolean>
  editComment: (id: string, body: string, mentionedIds?: string[]) => Promise<boolean>
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
        setLoading(false)
        return
      }

      const rows = (data || []) as unknown as WorkItemComment[]

      // Resolve mentioned_user_ids → names so the body can highlight them.
      // mentioned_user_ids is an array column (not a FK), so it can't be
      // embedded — batch-fetch the profiles in one query and attach them.
      const allMentionIds = Array.from(new Set(rows.flatMap(c => c.mentioned_user_ids || [])))
      const nameMap: Record<string, Profile> = {}
      if (allMentionIds.length > 0) {
        const { data: people } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allMentionIds)
        for (const p of (people || []) as unknown as Profile[]) nameMap[p.id] = p
      }
      if (cancelled) return
      setComments(rows.map(c => ({
        ...c,
        mentions: (c.mentioned_user_ids || []).map(uid => nameMap[uid]).filter(Boolean) as Profile[],
      })))
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

  const postComment = async (
    body: string,
    notify: CommentNotifyTarget,
    mentionedIds: string[] = [],
  ): Promise<boolean> => {
    const trimmed = body.trim()
    if (!trimmed || !workItemId) return false

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const mentions = Array.from(new Set(mentionedIds))

    const { error } = await supabase
      .from('work_item_comments')
      .insert({ work_item_id: workItemId, user_id: user.id, body: trimmed, mentioned_user_ids: mentions })

    if (error) {
      toast.error(error.message || 'Could not post comment')
      return false
    }

    const actor = await getActorName(supabase)
    const mentionSet = new Set(mentions.filter(uid => uid !== user.id))

    // Mentioned people get the distinct "mentioned you" ping.
    await Promise.all(
      Array.from(mentionSet).map(uid => createNotification(supabase, {
        user_id: uid,
        type: 'work_item_mentioned',
        title: 'You were mentioned',
        message: `${actor} mentioned you on "${notify.title}"`,
        related_id: workItemId,
      }))
    )

    // Everyone else attached to the item gets the generic "commented" ping —
    // minus the commenter and minus anyone already pinged via a mention.
    await Promise.all(
      Array.from(new Set(notify.recipientIds))
        .filter(uid => uid !== user.id && !mentionSet.has(uid))
        .map(uid => createNotification(supabase, {
          user_id: uid,
          type: 'work_item_commented',
          title: 'New comment',
          message: `${actor} commented on "${notify.title}"`,
          related_id: workItemId,
        }))
    )

    refetch()
    return true
  }

  const editComment = async (
    id: string,
    body: string,
    mentionedIds: string[] = [],
  ): Promise<boolean> => {
    const trimmed = body.trim()
    if (!trimmed) return false

    const { data: { user } } = await supabase.auth.getUser()
    const mentions = Array.from(new Set(mentionedIds))

    // Mentions added by this edit — so we only notify newly-tagged people.
    const before = new Set(comments.find(c => c.id === id)?.mentioned_user_ids || [])

    const { error } = await supabase
      .from('work_item_comments')
      .update({ body: trimmed, mentioned_user_ids: mentions } as never)
      .eq('id', id)

    if (error) {
      toast.error('Could not save the edit')
      return false
    }

    if (user) {
      const newlyMentioned = mentions.filter(uid => uid !== user.id && !before.has(uid))
      if (newlyMentioned.length > 0) {
        const actor = await getActorName(supabase)
        const item = comments.find(c => c.id === id)
        await Promise.all(newlyMentioned.map(uid => createNotification(supabase, {
          user_id: uid,
          type: 'work_item_mentioned',
          title: 'You were mentioned',
          message: `${actor} mentioned you in a comment`,
          related_id: item?.work_item_id,
        })))
      }
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
