'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { WorkItem, WorkItemStatus, WORK_ITEM_LANES, WORK_ITEM_STATUS_LABELS } from '@/types'
import { formatDate, getInitials, getPriorityColor, isOverdue } from '@/utils'
import { Calendar, Pencil, Trash2, AlertTriangle, MessageSquare } from 'lucide-react'

interface WorkItemCardProps {
  item: WorkItem
  showPriority: boolean
  canEdit: boolean
  canDelete: boolean
  /** Touch devices get a lane dropdown — HTML5 drag events never fire on them. */
  isMobile: boolean
  selectable: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onEdit: (item: WorkItem) => void
  onDelete: (id: string) => void
  onMove: (item: WorkItem, status: WorkItemStatus) => void
  onDragStart: (item: WorkItem) => void
  onDragEnd: () => void
  dragging: boolean
}

export default function WorkItemCard({
  item,
  showPriority,
  canEdit,
  canDelete,
  isMobile,
  selectable,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
  dragging,
}: WorkItemCardProps) {
  const router = useRouter()
  const overdue = isOverdue(item.due_date, item.status)
  const assignees = item.assignees || []

  // Where the pointer went down, so we can tell a click from a drag. A card is
  // draggable, so without this a slightly sloppy drag would register as a click
  // and navigate away mid-move.
  const downPos = useRef<{ x: number; y: number } | null>(null)

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate when the click was really on a control (buttons, the
    // checkbox, the mobile status dropdown).
    if ((e.target as HTMLElement).closest('button, input, select, a, textarea')) return
    const start = downPos.current
    if (start) {
      const moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y)
      if (moved > 5) return // it was a drag, not a click
    }
    router.push(`/dashboard/board/${item.id}`)
  }

  return (
    <div
      draggable={canEdit && !isMobile}
      onMouseDown={e => { downPos.current = { x: e.clientX, y: e.clientY } }}
      onClick={handleClick}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', item.id)
        onDragStart(item)
      }}
      onDragEnd={onDragEnd}
      style={{
        background: 'var(--chronos-surface)',
        border: `1px solid ${selected ? 'var(--chronos-accent)' : 'var(--chronos-border)'}`,
        borderRadius: '10px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        cursor: canEdit && !isMobile ? 'grab' : 'pointer',
        opacity: dragging ? 0.4 : 1,
        transition: 'border-color 0.15s, opacity 0.15s, box-shadow 0.15s',
        boxShadow: selected ? '0 0 0 1px var(--chronos-accent)' : 'none',
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(item.id)}
            style={{ marginTop: '3px', cursor: 'pointer', flexShrink: 0, accentColor: 'var(--chronos-accent)' }}
          />
        )}

        {showPriority && (
          <span
            title={`${item.priority} priority`}
            style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '5px',
              background: getPriorityColor(item.priority),
            }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px', fontWeight: 600, color: 'var(--chronos-text)',
            lineHeight: 1.4, wordBreak: 'break-word',
            textDecoration: item.status === 'done' ? 'line-through' : 'none',
            opacity: item.status === 'done' ? 0.65 : 1,
          }}>
            {item.title}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
          {canEdit && (
            <button
              onClick={() => onEdit(item)}
              title="Edit"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '3px', borderRadius: '5px', display: 'flex' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
            >
              <Pencil size={13} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(item.id)}
              title="Delete"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '3px', borderRadius: '5px', display: 'flex' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-danger)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Footer: assignees + due date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        {/* Overlapping avatars — the multi-assignee signal */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {assignees.length === 0 ? (
            <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', fontStyle: 'italic' }}>
              Unassigned
            </span>
          ) : (
            <>
              {assignees.slice(0, 3).map((a, i) => (
                <div
                  key={a.id}
                  title={a.user?.full_name || 'Unknown'}
                  style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '9px', fontWeight: 700, color: 'white',
                    fontFamily: 'var(--font-display)',
                    border: '2px solid var(--chronos-surface)',
                    marginLeft: i === 0 ? 0 : '-7px',
                    flexShrink: 0,
                  }}
                >
                  {getInitials(a.user?.full_name || 'U')}
                </div>
              ))}
              {assignees.length > 3 && (
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: 'var(--chronos-surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', fontWeight: 700, color: 'var(--chronos-text-muted)',
                  border: '2px solid var(--chronos-surface)',
                  marginLeft: '-7px',
                }}>
                  +{assignees.length - 3}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {(item.comment_count ?? 0) > 0 && (
            <div
              title={`${item.comment_count} comment${item.comment_count === 1 ? '' : 's'}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                fontSize: '11px', fontWeight: 500, color: 'var(--chronos-text-muted)',
              }}
            >
              <MessageSquare size={11} />
              {item.comment_count}
            </div>
          )}

          {item.due_date && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', fontWeight: 500,
              color: overdue ? 'var(--chronos-danger)' : 'var(--chronos-text-muted)',
            }}>
              {overdue ? <AlertTriangle size={11} /> : <Calendar size={11} />}
              {formatDate(item.due_date, 'MMM d')}
            </div>
          )}
        </div>
      </div>

      {/* Touch fallback for lane changes */}
      {isMobile && canEdit && (
        <select
          className="input-base"
          value={item.status}
          onChange={e => onMove(item, e.target.value as WorkItemStatus)}
          style={{ fontSize: '12px', padding: '6px 8px', cursor: 'pointer' }}
        >
          {WORK_ITEM_LANES.map(s => (
            <option key={s} value={s}>{WORK_ITEM_STATUS_LABELS[s]}</option>
          ))}
        </select>
      )}
    </div>
  )
}
