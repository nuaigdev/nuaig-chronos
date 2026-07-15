'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WorkItem, WorkItemStatus, WorkItemPriority, Profile } from '@/types'
import { createNotification } from '@/utils'
import toast from 'react-hot-toast'

// Single stable client instance — never recreate inside a component
const supabase = createClient()

export type BoardScope =
  | { type: 'team'; department: string } // 'all' = every department (admin)
  | { type: 'project'; projectId: string }

export interface CreateWorkItemInput {
  title: string
  description?: string
  project_id: string
  status: WorkItemStatus
  priority: WorkItemPriority
  due_date?: string | null
  assignee_ids: string[]
}

// work_item_assignees has TWO foreign keys to profiles (user_id and
// assigned_by), so a bare `profiles(...)` embed is ambiguous and PostgREST
// rejects the entire query with PGRST201. The FK must be named explicitly.
const SELECT_WITH_JOINS = `
  *,
  project:projects(id, name, client_id, client:clients(id, name)),
  creator:profiles!work_items_created_by_fkey(id, full_name),
  assignees:work_item_assignees(
    id, work_item_id, user_id, assigned_by, assigned_at,
    user:profiles!work_item_assignees_user_id_fkey(id, full_name, department, role),
    assigner:profiles!work_item_assignees_assigned_by_fkey(id, full_name)
  )
`

interface UseWorkItemsResult {
  items: WorkItem[]
  loading: boolean
  refetch: () => void
  createWorkItem: (input: CreateWorkItemInput) => Promise<boolean>
  updateWorkItem: (id: string, patch: Partial<WorkItem>, assigneeIds?: string[]) => Promise<boolean>
  moveWorkItem: (item: WorkItem, status: WorkItemStatus) => Promise<void>
  deleteWorkItem: (id: string) => Promise<void>
  bulkSetStatus: (ids: string[], status: WorkItemStatus) => Promise<void>
  bulkDelete: (ids: string[]) => Promise<void>
}

/**
 * Work Board data layer.
 *
 * Team scope is resolved in two steps rather than one filtered join.
 * A single `work_item_assignees!inner(...)` query filtered by user_id
 * would return ONLY the matching assignees on each card, so a task
 * shared between Engineering and Design would show a half-empty
 * avatar list on the Engineering board. Resolving the item IDs first,
 * then fetching those items with their full assignee list, keeps every
 * card complete regardless of which board it is viewed from.
 */
export function useWorkItems(
  scope: BoardScope,
  archiveDoneDays: number,
): UseWorkItemsResult {
  const [items, setItems] = useState<WorkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick(t => t + 1), [])

  const scopeKey = scope.type === 'team' ? `team:${scope.department}` : `project:${scope.projectId}`

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        // Nothing picked yet. Querying anyway would send `project_id=eq.` to
        // Postgres, which rejects the empty string as an invalid UUID and
        // surfaces a spurious "failed to load" toast before the user has done
        // anything wrong.
        const ready = scope.type === 'project'
          ? Boolean(scope.projectId)
          : Boolean(scope.department)

        if (!ready) {
          if (!cancelled) { setItems([]); setLoading(false) }
          return
        }

        let query = supabase.from('work_items').select(SELECT_WITH_JOINS)

        if (scope.type === 'project') {
          query = query.eq('project_id', scope.projectId)
        } else if (scope.department !== 'all') {
          // Step 1: who is in this department?
          const { data: people } = await supabase
            .from('profiles')
            .select('id')
            .eq('department', scope.department)
            .eq('is_active', true)

          const userIds = ((people || []) as { id: string }[]).map(p => p.id)
          if (userIds.length === 0) {
            if (!cancelled) { setItems([]); setLoading(false) }
            return
          }

          // Step 2: which work items is anyone from that department on?
          const { data: links } = await supabase
            .from('work_item_assignees')
            .select('work_item_id')
            .in('user_id', userIds)

          const itemIds = Array.from(
            new Set(((links || []) as { work_item_id: string }[]).map(l => l.work_item_id))
          )
          if (itemIds.length === 0) {
            if (!cancelled) { setItems([]); setLoading(false) }
            return
          }

          // Step 3: fetch those items whole, with every assignee.
          query = query.in('id', itemIds)
        }

        // Drop stale Done cards so the lane doesn't become a graveyard.
        // 0 disables archiving entirely.
        //
        // The cutoff is a plain YYYY-MM-DD date, not a full ISO timestamp:
        // PostgREST's or() filter parses `column.operator.value` on dots, and
        // the milliseconds in an ISO string ("…00.000Z") make that ambiguous.
        if (archiveDoneDays > 0) {
          const cutoff = new Date()
          cutoff.setDate(cutoff.getDate() - archiveDoneDays)
          const cutoffDate = cutoff.toISOString().split('T')[0]
          query = query.or(`status.neq.done,completed_at.gte.${cutoffDate}`)
        }

        const { data, error } = await query
          .order('position', { ascending: true })
          .order('created_at', { ascending: false })

        if (cancelled) return
        if (error) {
          toast.error('Failed to load the board')
          console.error('[useWorkItems]', error)
          return
        }

        setItems((data || []) as unknown as WorkItem[])
      } catch (err) {
        console.error('[useWorkItems] load failed', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    setLoading(true)
    load()
    return () => { cancelled = true }
    // scopeKey collapses the scope object into a stable primitive so a new
    // object literal from the parent doesn't retrigger the fetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, archiveDoneDays, tick])

  // Realtime: a card dragged on one screen moves on everyone else's.
  useEffect(() => {
    const channel = supabase
      .channel('work-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_items' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_item_assignees' }, () => refetch())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [refetch])

  // ── Mutations ──────────────────────────────────────

  const notifyAssignees = async (
    userIds: string[],
    actorId: string,
    title: string,
    message: string,
    relatedId: string,
    type: string,
  ) => {
    await Promise.all(
      userIds
        .filter(uid => uid !== actorId) // don't notify yourself about your own action
        .map(uid => createNotification(supabase, {
          user_id: uid, type, title, message, related_id: relatedId,
        }))
    )
  }

  const createWorkItem = async (input: CreateWorkItemInput): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
      .from('work_items')
      .insert({
        title: input.title.trim(),
        description: input.description?.trim() || null,
        project_id: input.project_id,
        status: input.status,
        priority: input.priority,
        due_date: input.due_date || null,
        position: Date.now(), // append to the end of the lane
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error || !data) {
      toast.error(error?.message ?? 'Could not create the work item')
      return false
    }

    const itemId = (data as { id: string }).id

    if (input.assignee_ids.length > 0) {
      const { error: assignErr } = await supabase.from('work_item_assignees').insert(
        input.assignee_ids.map(uid => ({
          work_item_id: itemId,
          user_id: uid,
          assigned_by: user.id,
        }))
      )
      if (assignErr) {
        // The item exists but is unassigned — say so rather than
        // reporting a clean success the user can't act on.
        toast.error('Work item created, but assigning people failed')
      } else {
        await notifyAssignees(
          input.assignee_ids, user.id,
          'New work item assigned',
          `You were assigned to "${input.title.trim()}"`,
          itemId, 'work_item_assigned',
        )
      }
    }

    toast.success('Work item created')
    refetch()
    return true
  }

  const updateWorkItem = async (
    id: string,
    patch: Partial<WorkItem>,
    assigneeIds?: string[],
  ): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('work_items')
      .update(patch as never)
      .eq('id', id)

    if (error) {
      toast.error(error.message || 'Could not save changes')
      return false
    }

    // Reconcile the assignee list as a diff, so we don't churn rows
    // (and re-notify people) who were already on the item.
    if (assigneeIds) {
      const { data: existing } = await supabase
        .from('work_item_assignees')
        .select('user_id')
        .eq('work_item_id', id)

      const current = ((existing || []) as { user_id: string }[]).map(r => r.user_id)
      const added = assigneeIds.filter(uid => !current.includes(uid))
      const removed = current.filter(uid => !assigneeIds.includes(uid))

      if (added.length > 0) {
        await supabase.from('work_item_assignees').insert(
          added.map(uid => ({ work_item_id: id, user_id: uid, assigned_by: user.id }))
        )
        await notifyAssignees(
          added, user.id,
          'New work item assigned',
          `You were assigned to "${patch.title ?? 'a work item'}"`,
          id, 'work_item_assigned',
        )
      }
      if (removed.length > 0) {
        await supabase
          .from('work_item_assignees')
          .delete()
          .eq('work_item_id', id)
          .in('user_id', removed)
      }
    }

    toast.success('Work item updated')
    refetch()
    return true
  }

  /** Lane change — the core board interaction. Optimistic, so the card
   *  lands under the cursor instead of after a server round trip. */
  const moveWorkItem = async (item: WorkItem, status: WorkItemStatus) => {
    if (item.status === status) return

    const previous = items
    setItems(cur => cur.map(i => (i.id === item.id ? { ...i, status } : i)))

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('work_items')
      .update({ status } as never)
      .eq('id', item.id)

    if (error) {
      setItems(previous) // put it back where it was
      toast.error('Could not move that card')
      return
    }

    const others = (item.assignees || []).map(a => a.user_id)
    if (user && others.length > 0) {
      await notifyAssignees(
        others, user.id,
        'Work item updated',
        `"${item.title}" moved to ${status.replace(/_/g, ' ')}`,
        item.id, 'work_item_status_changed',
      )
    }
  }

  const deleteWorkItem = async (id: string) => {
    const previous = items
    setItems(cur => cur.filter(i => i.id !== id))

    const { error } = await supabase.from('work_items').delete().eq('id', id)
    if (error) {
      setItems(previous)
      toast.error('Could not delete that work item')
      return
    }
    toast.success('Work item deleted')
  }

  const bulkSetStatus = async (ids: string[], status: WorkItemStatus) => {
    if (ids.length === 0) return
    const { error } = await supabase
      .from('work_items')
      .update({ status } as never)
      .in('id', ids)

    if (error) {
      toast.error('Bulk update failed')
      return
    }
    toast.success(`${ids.length} item${ids.length === 1 ? '' : 's'} updated`)
    refetch()
  }

  const bulkDelete = async (ids: string[]) => {
    if (ids.length === 0) return
    const { error } = await supabase.from('work_items').delete().in('id', ids)
    if (error) {
      toast.error('Bulk delete failed')
      return
    }
    toast.success(`${ids.length} item${ids.length === 1 ? '' : 's'} deleted`)
    refetch()
  }

  return {
    items,
    loading,
    refetch,
    createWorkItem,
    updateWorkItem,
    moveWorkItem,
    deleteWorkItem,
    bulkSetStatus,
    bulkDelete,
  }
}

// ============================================
// SINGLE WORK ITEM (detail page)
// ============================================

interface UseWorkItemResult {
  item: WorkItem | null
  loading: boolean
  notFound: boolean
  refetch: () => void
  updateItem: (patch: Partial<WorkItem>, assigneeIds?: string[]) => Promise<boolean>
  moveItem: (status: WorkItemStatus) => Promise<void>
  deleteItem: () => Promise<boolean>
}

/**
 * Loads one work item with its joins for the detail page, and exposes the same
 * mutations the board offers. Kept separate from useWorkItems (which is scoped
 * to a whole board) rather than folded in, so the live board hook is untouched.
 */
export function useWorkItem(id: string | undefined): UseWorkItemResult {
  const [item, setItem] = useState<WorkItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    if (!id) { setLoading(false); setNotFound(true); return }
    let cancelled = false

    const load = async () => {
      const { data, error } = await supabase
        .from('work_items')
        .select(SELECT_WITH_JOINS)
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        console.error('[useWorkItem]', error)
        toast.error('Failed to load the work item')
        setLoading(false)
        return
      }
      if (!data) {
        setNotFound(true)
        setItem(null)
      } else {
        setItem(data as unknown as WorkItem)
      }
      setLoading(false)
    }

    setLoading(true)
    load()
    return () => { cancelled = true }
  }, [id, tick])

  // Realtime: reflect edits, moves and (re)assignments made elsewhere.
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`work-item-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_items', filter: `id=eq.${id}` }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_item_assignees', filter: `work_item_id=eq.${id}` }, () => refetch())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id, refetch])

  const notify = async (userIds: string[], actorId: string, title: string, message: string, type: string) => {
    await Promise.all(
      Array.from(new Set(userIds))
        .filter(uid => uid !== actorId)
        .map(uid => createNotification(supabase, { user_id: uid, type, title, message, related_id: id }))
    )
  }

  const updateItem = async (patch: Partial<WorkItem>, assigneeIds?: string[]): Promise<boolean> => {
    if (!id) return false
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase.from('work_items').update(patch as never).eq('id', id)
    if (error) {
      toast.error(error.message || 'Could not save changes')
      return false
    }

    if (assigneeIds) {
      const { data: existing } = await supabase
        .from('work_item_assignees')
        .select('user_id')
        .eq('work_item_id', id)

      const current = ((existing || []) as { user_id: string }[]).map(r => r.user_id)
      const added = assigneeIds.filter(uid => !current.includes(uid))
      const removed = current.filter(uid => !assigneeIds.includes(uid))

      if (added.length > 0) {
        await supabase.from('work_item_assignees').insert(
          added.map(uid => ({ work_item_id: id, user_id: uid, assigned_by: user.id }))
        )
        await notify(added, user.id, 'New work item assigned', `You were assigned to "${patch.title ?? item?.title ?? 'a work item'}"`, 'work_item_assigned')
      }
      if (removed.length > 0) {
        await supabase.from('work_item_assignees').delete().eq('work_item_id', id).in('user_id', removed)
      }
    }

    toast.success('Work item updated')
    refetch()
    return true
  }

  const moveItem = async (status: WorkItemStatus) => {
    if (!id || !item || item.status === status) return
    const previous = item
    setItem({ ...item, status })

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('work_items').update({ status } as never).eq('id', id)
    if (error) {
      setItem(previous)
      toast.error('Could not move that card')
      return
    }

    const others = (item.assignees || []).map(a => a.user_id)
    if (user && others.length > 0) {
      await notify(others, user.id, 'Work item updated', `"${item.title}" moved to ${status.replace(/_/g, ' ')}`, 'work_item_status_changed')
    }
  }

  const deleteItem = async (): Promise<boolean> => {
    if (!id) return false
    const { error } = await supabase.from('work_items').delete().eq('id', id)
    if (error) {
      toast.error('Could not delete that work item')
      return false
    }
    toast.success('Work item deleted')
    return true
  }

  return { item, loading, notFound, refetch, updateItem, moveItem, deleteItem }
}

// ============================================
// BOARD SETTINGS (admin_settings)
// ============================================

export interface BoardSettings {
  employeeCanCreate: boolean
  showPriority: boolean
  archiveDoneDays: number
}

const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  employeeCanCreate: true,
  showPriority: true,
  archiveDoneDays: 30,
}

export function useBoardSettings(): { settings: BoardSettings; loading: boolean } {
  const [settings, setSettings] = useState<BoardSettings>(DEFAULT_BOARD_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const { data } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ['board_employee_can_create', 'board_show_priority', 'board_archive_done_days'])

      if (cancelled) return

      const rows = (data || []) as { key: string; value: { value: unknown } }[]
      const get = <T,>(key: string, fallback: T): T => {
        const row = rows.find(r => r.key === key)
        return row ? (row.value.value as T) : fallback
      }

      setSettings({
        employeeCanCreate: get('board_employee_can_create', DEFAULT_BOARD_SETTINGS.employeeCanCreate),
        showPriority: get('board_show_priority', DEFAULT_BOARD_SETTINGS.showPriority),
        archiveDoneDays: get('board_archive_done_days', DEFAULT_BOARD_SETTINGS.archiveDoneDays),
      })
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { settings, loading }
}

// ============================================
// ASSIGNABLE PEOPLE
// ============================================

/** Everyone in the company, for the assignee picker. */
export function useCompanyPeople(): { people: Profile[]; loading: boolean } {
  const [people, setPeople] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, department, role')
        .eq('is_active', true)
        .order('full_name')

      if (cancelled) return
      setPeople((data || []) as unknown as Profile[])
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { people, loading }
}
