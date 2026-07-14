'use client'

import { WorkItem, WorkItemStatus, WORK_ITEM_LANES, WORK_ITEM_STATUS_LABELS } from '@/types'
import { formatDate, getInitials, getPriorityColor, getWorkItemLaneColor, isOverdue } from '@/utils'
import { StatusBadge } from '@/components/ui'
import { Pencil, Trash2, AlertTriangle } from 'lucide-react'

interface WorkItemListProps {
  items: WorkItem[]
  showPriority: boolean
  selectable: boolean
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  canEditItem: (item: WorkItem) => boolean
  canDeleteItem: (item: WorkItem) => boolean
  onEdit: (item: WorkItem) => void
  onDelete: (id: string) => void
  onMove: (item: WorkItem, status: WorkItemStatus) => void
}

export default function WorkItemList({
  items,
  showPriority,
  selectable,
  selectedIds,
  onToggleSelect,
  canEditItem,
  canDeleteItem,
  onEdit,
  onDelete,
  onMove,
}: WorkItemListProps) {
  if (items.length === 0) {
    return (
      <div style={{
        padding: '28px', textAlign: 'center',
        fontSize: '13px', color: 'var(--chronos-text-muted)',
        background: 'var(--chronos-surface-2)',
        border: '1px solid var(--chronos-border)',
        borderRadius: '12px',
      }}>
        No work items here yet
      </div>
    )
  }

  // Group by lane so the list reads in the same order as the board.
  const ordered = WORK_ITEM_LANES.flatMap(lane => items.filter(i => i.status === lane))

  return (
    <div style={{
      border: '1px solid var(--chronos-border)',
      borderRadius: '12px',
      overflow: 'hidden',
      background: 'var(--chronos-surface)',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
          <thead>
            <tr style={{ background: 'var(--chronos-surface-2)' }}>
              {selectable && <th style={{ width: '36px', padding: '10px 12px' }} />}
              <th style={thStyle}>Work Item</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Assignees</th>
              <th style={thStyle}>Due</th>
              <th style={{ ...thStyle, width: '80px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(item => {
              const overdue = isOverdue(item.due_date, item.status)
              const assignees = item.assignees || []
              const canEdit = canEditItem(item)

              return (
                <tr
                  key={item.id}
                  style={{
                    borderTop: '1px solid var(--chronos-border)',
                    background: selectedIds.includes(item.id) ? 'var(--chronos-surface-2)' : 'transparent',
                  }}
                >
                  {selectable && (
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => onToggleSelect(item.id)}
                        style={{ cursor: 'pointer', accentColor: 'var(--chronos-accent)' }}
                      />
                    </td>
                  )}

                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {showPriority && (
                        <span
                          title={`${item.priority} priority`}
                          style={{
                            width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                            background: getPriorityColor(item.priority),
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px', fontWeight: 600, color: 'var(--chronos-text)',
                          textDecoration: item.status === 'done' ? 'line-through' : 'none',
                          opacity: item.status === 'done' ? 0.65 : 1,
                        }}>
                          {item.title}
                        </div>
                        {item.description && (
                          <div style={{
                            fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '2px',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '360px',
                          }}>
                            {item.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td style={tdStyle}>
                    {canEdit ? (
                      <select
                        className="input-base"
                        value={item.status}
                        onChange={e => onMove(item, e.target.value as WorkItemStatus)}
                        style={{
                          fontSize: '12px', padding: '4px 8px', cursor: 'pointer',
                          borderColor: getWorkItemLaneColor(item.status),
                        }}
                      >
                        {WORK_ITEM_LANES.map(s => (
                          <option key={s} value={s}>{WORK_ITEM_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    ) : (
                      <StatusBadge status={item.status} />
                    )}
                  </td>

                  <td style={tdStyle}>
                    {assignees.length === 0 ? (
                      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', fontStyle: 'italic' }}>
                        Unassigned
                      </span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {assignees.slice(0, 4).map((a, i) => (
                          <div
                            key={a.id}
                            title={a.user?.full_name || 'Unknown'}
                            style={{
                              width: '24px', height: '24px', borderRadius: '50%',
                              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '9px', fontWeight: 700, color: 'white',
                              fontFamily: 'var(--font-display)',
                              border: '2px solid var(--chronos-surface)',
                              marginLeft: i === 0 ? 0 : '-7px', flexShrink: 0,
                            }}
                          >
                            {getInitials(a.user?.full_name || 'U')}
                          </div>
                        ))}
                        {assignees.length > 4 && (
                          <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', marginLeft: '6px' }}>
                            +{assignees.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  <td style={tdStyle}>
                    {item.due_date ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontSize: '12px', fontWeight: 500,
                        color: overdue ? 'var(--chronos-danger)' : 'var(--chronos-text-muted)',
                      }}>
                        {overdue && <AlertTriangle size={11} />}
                        {formatDate(item.due_date, 'MMM d, yyyy')}
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>—</span>
                    )}
                  </td>

                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '2px' }}>
                      {canEdit && (
                        <button
                          onClick={() => onEdit(item)}
                          title="Edit"
                          style={iconBtnStyle}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-accent)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {canDeleteItem(item) && (
                        <button
                          onClick={() => onDelete(item.id)}
                          title="Delete"
                          style={iconBtnStyle}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-danger)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--chronos-text-muted)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'middle',
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--chronos-text-muted)',
  padding: '4px',
  borderRadius: '5px',
  display: 'flex',
}
