'use client'

import { useEffect, useState } from 'react'
import {
  WorkItem, WorkItemStatus, WorkItemPriority, Profile, Project,
  WORK_ITEM_LANES, WORK_ITEM_STATUS_LABELS,
} from '@/types'
import { Modal, FormField, Select } from '@/components/ui'
import { CreateWorkItemInput } from '@/hooks/useWorkItems'
import { createClient } from '@/lib/supabase/client'
import { getInitials, getPriorityColor } from '@/utils'
import { Check, Search } from 'lucide-react'
import toast from 'react-hot-toast'

// Single stable client instance — never recreate inside a component
const supabase = createClient()

interface WorkItemModalProps {
  isOpen: boolean
  onClose: () => void
  /** null = create mode */
  editing: WorkItem | null
  projects: Project[]
  people: Profile[]
  showPriority: boolean
  /** Locked when the board is scoped to a single project. */
  lockedProjectId?: string
  /**
   * When true, the assignee list is narrowed to members of the selected
   * project (cross-department included, but not arbitrary company staff).
   * Passed true for everyone — admins and managers included — since work is
   * assigned to people on the project. Enforced in RLS too (migration 023).
   */
  restrictToProjectMembers?: boolean
  onCreate: (input: CreateWorkItemInput) => Promise<boolean>
  onUpdate: (id: string, patch: Partial<WorkItem>, assigneeIds: string[]) => Promise<boolean>
}

const PRIORITIES: WorkItemPriority[] = ['low', 'medium', 'high']

export default function WorkItemModal({
  isOpen,
  onClose,
  editing,
  projects,
  people,
  showPriority,
  lockedProjectId,
  restrictToProjectMembers = false,
  onCreate,
  onUpdate,
}: WorkItemModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState<WorkItemStatus>('not_started')
  const [priority, setPriority] = useState<WorkItemPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [personSearch, setPersonSearch] = useState('')
  const [saving, setSaving] = useState(false)

  // null = no restriction in effect (either not restricted, or not yet loaded).
  const [memberIds, setMemberIds] = useState<string[] | null>(null)

  // When restricted, narrow the candidate pool to the selected project's
  // members. Re-runs when the project changes (it can change inside the modal
  // in team-scope create), so the list always matches the chosen project.
  useEffect(() => {
    if (!restrictToProjectMembers || !projectId) { setMemberIds(null); return }
    let cancelled = false

    ;(async () => {
      const { data } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', projectId)
      if (cancelled) return
      setMemberIds(((data || []) as { user_id: string }[]).map(r => r.user_id))
    })()

    return () => { cancelled = true }
  }, [restrictToProjectMembers, projectId])

  // Reset the form whenever the modal opens, so a previous edit never
  // bleeds into the next create.
  useEffect(() => {
    if (!isOpen) return

    if (editing) {
      setTitle(editing.title)
      setDescription(editing.description || '')
      setProjectId(editing.project_id)
      setStatus(editing.status)
      setPriority(editing.priority)
      setDueDate(editing.due_date || '')
      setAssigneeIds((editing.assignees || []).map(a => a.user_id))
    } else {
      setTitle('')
      setDescription('')
      setProjectId(lockedProjectId || '')
      setStatus('not_started')
      setPriority('medium')
      setDueDate('')
      setAssigneeIds([])
    }
    setPersonSearch('')
  }, [isOpen, editing, lockedProjectId])

  const toggleAssignee = (userId: string) => {
    setAssigneeIds(cur =>
      cur.includes(userId) ? cur.filter(id => id !== userId) : [...cur, userId]
    )
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Give the work item a title')
      return
    }
    if (!projectId) {
      toast.error('Pick a project')
      return
    }

    setSaving(true)
    const ok = editing
      ? await onUpdate(
          editing.id,
          {
            title: title.trim(),
            description: description.trim() || undefined,
            project_id: projectId,
            status,
            priority,
            due_date: dueDate || undefined,
          },
          assigneeIds,
        )
      : await onCreate({
          title,
          description,
          project_id: projectId,
          status,
          priority,
          due_date: dueDate || null,
          assignee_ids: assigneeIds,
        })
    setSaving(false)

    if (ok) onClose()
  }

  // The pool you may pick from. When restricted, it's the selected project's
  // members; otherwise the full list passed in.
  const candidatePool = restrictToProjectMembers && memberIds !== null
    ? people.filter(p => memberIds.includes(p.id))
    : people

  const filteredPeople = candidatePool.filter(p => {
    if (!personSearch.trim()) return true
    const q = personSearch.toLowerCase()
    return (
      p.full_name.toLowerCase().includes(q) ||
      (p.department || '').toLowerCase().includes(q)
    )
  })

  // Someone already assigned who isn't in the current candidate pool — e.g. a
  // manager pulled in a non-project-member. They stay assigned (the save diffs
  // against the current list rather than replacing it), but an unexplained
  // "Assignees (3)" over a list of 2 would just look broken.
  const hiddenAssigneeCount = assigneeIds.filter(
    id => !candidatePool.some(p => p.id === id)
  ).length

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Work Item' : 'New Work Item'}
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FormField label="Title" required>
          <input
            className="input-base"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
            style={{ width: '100%' }}
          />
        </FormField>

        <FormField label="Description">
          <textarea
            className="input-base"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Any detail worth capturing (optional)"
            rows={3}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: showPriority ? '1fr 1fr' : '1fr', gap: '14px' }}>
          <FormField label="Project" required>
            <Select
              value={projectId}
              onChange={setProjectId}
              disabled={Boolean(lockedProjectId)}
              placeholder="Select a project"
              options={projects.map(p => ({
                value: p.id,
                label: p.client?.name ? `${p.name} — ${p.client.name}` : p.name,
              }))}
            />
          </FormField>

          {showPriority && (
            <FormField label="Priority">
              <div style={{ display: 'flex', gap: '6px' }}>
                {PRIORITIES.map(p => {
                  const active = priority === p
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      style={{
                        flex: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        padding: '8px', borderRadius: '8px', cursor: 'pointer',
                        fontSize: '12px', fontWeight: 600, textTransform: 'capitalize',
                        background: active ? `${getPriorityColor(p)}18` : 'var(--chronos-surface-2)',
                        border: `1px solid ${active ? getPriorityColor(p) : 'var(--chronos-border)'}`,
                        color: active ? getPriorityColor(p) : 'var(--chronos-text-muted)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: getPriorityColor(p) }} />
                      {p}
                    </button>
                  )
                })}
              </div>
            </FormField>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <FormField label="Status">
            <Select
              value={status}
              onChange={v => setStatus(v as WorkItemStatus)}
              options={WORK_ITEM_LANES.map(s => ({ value: s, label: WORK_ITEM_STATUS_LABELS[s] }))}
            />
          </FormField>

          <FormField label="Due Date">
            <input
              type="date"
              className="input-base"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{ width: '100%' }}
            />
          </FormField>
        </div>

        {/* Multi-assignee picker */}
        <FormField label={`Assignees${assigneeIds.length > 0 ? ` (${assigneeIds.length})` : ''}`}>
          <div style={{
            border: '1px solid var(--chronos-border)',
            borderRadius: '10px',
            overflow: 'hidden',
            background: 'var(--chronos-surface-2)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 10px', borderBottom: '1px solid var(--chronos-border)',
            }}>
              <Search size={14} style={{ color: 'var(--chronos-text-muted)', flexShrink: 0 }} />
              <input
                value={personSearch}
                onChange={e => setPersonSearch(e.target.value)}
                placeholder="Search by name or department…"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  fontSize: '13px', color: 'var(--chronos-text)', fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {filteredPeople.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--chronos-text-muted)' }}>
                  Nobody matches that search
                </div>
              ) : (
                filteredPeople.map(person => {
                  const selected = assigneeIds.includes(person.id)
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => toggleAssignee(person.id)}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 10px',
                        background: selected ? 'var(--chronos-surface)' : 'transparent',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        borderBottom: '1px solid var(--chronos-border)',
                        transition: 'background 0.12s',
                      }}
                    >
                      <div style={{
                        width: '26px', height: '26px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 700, color: 'white',
                        fontFamily: 'var(--font-display)', flexShrink: 0,
                      }}>
                        {getInitials(person.full_name)}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text)' }}>
                          {person.full_name}
                        </div>
                        {person.department && (
                          <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)' }}>
                            {person.department}
                          </div>
                        )}
                      </div>

                      <div style={{
                        width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: selected ? 'var(--chronos-accent)' : 'transparent',
                        border: `1px solid ${selected ? 'var(--chronos-accent)' : 'var(--chronos-border)'}`,
                        color: 'white',
                      }}>
                        {selected && <Check size={12} strokeWidth={3} />}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {hiddenAssigneeCount > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '2px' }}>
              {hiddenAssigneeCount} {hiddenAssigneeCount === 1 ? 'person' : 'people'} already on this
              item {hiddenAssigneeCount === 1 ? 'is' : 'are'} outside your assignable list and will
              stay assigned. Only a manager or admin can change that.
            </p>
          )}
        </FormField>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !title.trim() || !projectId}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Work Item'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
