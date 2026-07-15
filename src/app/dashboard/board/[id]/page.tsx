'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useProfile } from '@/hooks/useProfile'
import { useWorkItem, useCompanyPeople, useBoardSettings } from '@/hooks/useWorkItems'
import { WorkItemStatus, WORK_ITEM_LANES, WORK_ITEM_STATUS_LABELS } from '@/types'
import { Select, EmptyState, Skeleton } from '@/components/ui'
import WorkItemModal from '@/components/board/WorkItemModal'
import WorkItemComments from '@/components/board/WorkItemComments'
import {
  formatDate, getInitials, getPriorityColor, getWorkItemLaneColor, isOverdue,
} from '@/utils'
import {
  ArrowLeft, Pencil, Trash2, Calendar, AlertTriangle, FolderKanban, KanbanSquare, UserPlus,
} from 'lucide-react'

export default function WorkItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, isAdmin, isManager } = useProfile()
  const { people } = useCompanyPeople()
  const { settings } = useBoardSettings()
  const { item, loading, notFound, updateItem, moveItem, deleteItem } = useWorkItem(id)

  const [modalOpen, setModalOpen] = useState(false)

  const canManage = isAdmin || isManager

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '820px' }}>
        <Skeleton height="30px" width="160px" />
        <Skeleton height="120px" />
        <Skeleton height="240px" />
      </div>
    )
  }

  if (notFound || !item) {
    return (
      <div style={{ maxWidth: '820px' }}>
        <EmptyState
          icon={<KanbanSquare size={22} />}
          title="Work item not found"
          description="It may have been deleted, or you don't have access to it."
          action={<Link href="/dashboard/board"><button className="btn-secondary">Back to Work Board</button></Link>}
        />
      </div>
    )
  }

  const assignees = item.assignees || []
  const overdue = isOverdue(item.due_date, item.status)

  const canEdit = canManage || item.created_by === user?.id || assignees.some(a => a.user_id === user?.id)
  const canDelete = canManage || item.created_by === user?.id

  // Ping everyone attached to the item when a comment lands.
  const notifyRecipients = Array.from(new Set([
    item.created_by,
    ...assignees.map(a => a.user_id),
  ]))

  const handleDelete = async () => {
    if (!confirm('Delete this work item? Its comments are deleted too. This cannot be undone.')) return
    const ok = await deleteItem()
    if (ok) router.push('/dashboard/board')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '820px' }}>
      {/* Back */}
      <Link
        href="/dashboard/board"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--chronos-text-muted)', textDecoration: 'none', width: 'fit-content' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-text)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
      >
        <ArrowLeft size={13} /> Back to Work Board
      </Link>

      {/* Header card */}
      <div className="card-base" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          {settings.showPriority && (
            <span
              title={`${item.priority} priority`}
              style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, marginTop: '8px', background: getPriorityColor(item.priority) }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.25, wordBreak: 'break-word' }}>
              {item.title}
            </h1>
            <Link
              href={`/dashboard/projects/${item.project_id}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--chronos-text-muted)', textDecoration: 'none', marginTop: '6px' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
            >
              <FolderKanban size={13} />
              {item.project?.name || 'Project'}
              {item.project?.client?.name ? ` · ${item.project.client.name}` : ''}
            </Link>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {canEdit && (
              <button className="btn-secondary" onClick={() => setModalOpen(true)} style={{ fontSize: '13px', padding: '7px 12px' }}>
                <Pencil size={13} /> Edit
              </button>
            )}
            {canDelete && (
              <button
                className="btn-secondary"
                onClick={handleDelete}
                style={{ fontSize: '13px', padding: '7px 12px', color: 'var(--chronos-danger)' }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {item.description && (
          <p style={{ fontSize: '14px', color: 'var(--chronos-text-subtle)', lineHeight: 1.6, marginTop: '16px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {item.description}
          </p>
        )}

        {/* Meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--chronos-border)' }}>
          {/* Status */}
          <div>
            <div style={metaLabel}>Status</div>
            {canEdit ? (
              <Select
                value={item.status}
                onChange={v => moveItem(v as WorkItemStatus)}
                options={WORK_ITEM_LANES.map(s => ({ value: s, label: WORK_ITEM_STATUS_LABELS[s] }))}
              />
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 600 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getWorkItemLaneColor(item.status) }} />
                {WORK_ITEM_STATUS_LABELS[item.status]}
              </div>
            )}
          </div>

          {/* Due date */}
          <div>
            <div style={metaLabel}>Due Date</div>
            {item.due_date ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: overdue ? 'var(--chronos-danger)' : 'var(--chronos-text)' }}>
                {overdue ? <AlertTriangle size={13} /> : <Calendar size={13} />}
                {formatDate(item.due_date, 'MMM d, yyyy')}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>—</div>
            )}
          </div>

          {/* Raised by */}
          <div>
            <div style={metaLabel}>Raised By</div>
            <div style={{ fontSize: '13px', color: 'var(--chronos-text)' }}>
              {item.creator?.full_name || 'Unknown'}
              <span style={{ color: 'var(--chronos-text-muted)' }}> · {formatDate(item.created_at, 'MMM d, yyyy')}</span>
            </div>
          </div>
        </div>

        {/* Assignees, with who assigned each */}
        <div style={{ marginTop: '20px' }}>
          <div style={metaLabel}>Assignees</div>
          {assignees.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--chronos-text-muted)', fontStyle: 'italic' }}>
              <UserPlus size={14} /> Unassigned — this item shows on no team board until someone is assigned.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {assignees.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 700, color: 'white', fontFamily: 'var(--font-display)',
                  }}>
                    {getInitials(a.user?.full_name || 'U')}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--chronos-text)' }}>
                      {a.user?.full_name || 'Unknown'}
                      {a.user?.department && (
                        <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--chronos-text-muted)' }}> · {a.user.department}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)' }}>
                      Assigned by {a.assigner?.full_name || 'Unknown'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Comments */}
      <WorkItemComments
        workItemId={item.id}
        notifyTarget={{ title: item.title, recipientIds: notifyRecipients }}
      />

      {/* Edit modal — reuses the board's create/edit form. */}
      <WorkItemModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={item}
        projects={item.project ? [item.project] : []}
        people={people}
        showPriority={settings.showPriority}
        lockedProjectId={item.project_id}
        restrictToProjectMembers={!canManage}
        onCreate={async () => false}
        onUpdate={(_, patch, assigneeIds) => updateItem(patch, assigneeIds)}
      />
    </div>
  )
}

const metaLabel: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--chronos-text-muted)',
  marginBottom: '7px',
}
