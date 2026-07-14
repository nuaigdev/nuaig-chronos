'use client'

import { useState } from 'react'
import { WorkItem, WorkItemStatus, WORK_ITEM_LANES, WORK_ITEM_STATUS_LABELS } from '@/types'
import { getWorkItemLaneColor } from '@/utils'
import WorkItemCard from './WorkItemCard'
import toast from 'react-hot-toast'

interface KanbanLanesProps {
  items: WorkItem[]
  showPriority: boolean
  isMobile: boolean
  selectable: boolean
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  canEditItem: (item: WorkItem) => boolean
  canDeleteItem: (item: WorkItem) => boolean
  onEdit: (item: WorkItem) => void
  onDelete: (id: string) => void
  onMove: (item: WorkItem, status: WorkItemStatus) => void
}

export default function KanbanLanes({
  items,
  showPriority,
  isMobile,
  selectable,
  selectedIds,
  onToggleSelect,
  canEditItem,
  canDeleteItem,
  onEdit,
  onDelete,
  onMove,
}: KanbanLanesProps) {
  const [dragged, setDragged] = useState<WorkItem | null>(null)
  const [dragOverLane, setDragOverLane] = useState<WorkItemStatus | null>(null)

  const handleDrop = (status: WorkItemStatus) => {
    setDragOverLane(null)
    const item = dragged
    setDragged(null)
    if (!item) return

    // In the team view each project is its own swimlane. Dragging a card
    // across swimlanes would silently reparent it to a different project,
    // which is never what someone means by "move this to In Progress".
    if (!items.some(i => i.id === item.id)) {
      toast.error('Cards can only move between lanes of their own project')
      return
    }

    onMove(item, status)
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
      gap: '12px',
      alignItems: 'start',
    }}>
      {WORK_ITEM_LANES.map(status => {
        const laneItems = items.filter(i => i.status === status)
        const laneColor = getWorkItemLaneColor(status)
        const isTarget = dragOverLane === status

        return (
          <div
            key={status}
            onDragOver={e => {
              if (!dragged) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragOverLane(status)
            }}
            onDragLeave={() => setDragOverLane(cur => (cur === status ? null : cur))}
            onDrop={e => { e.preventDefault(); handleDrop(status) }}
            style={{
              background: isTarget ? `${laneColor}10` : 'var(--chronos-surface-2)',
              border: `1px ${isTarget ? 'dashed' : 'solid'} ${isTarget ? laneColor : 'var(--chronos-border)'}`,
              borderRadius: '12px',
              padding: '10px',
              minHeight: '120px',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {/* Lane header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '2px 4px 10px',
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: laneColor, flexShrink: 0 }} />
              <span style={{
                fontSize: '12px', fontWeight: 700, color: 'var(--chronos-text)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {WORK_ITEM_STATUS_LABELS[status]}
              </span>
              <span style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--chronos-text-muted)',
                background: 'var(--chronos-surface)', borderRadius: '100px', padding: '1px 7px',
              }}>
                {laneItems.length}
              </span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {laneItems.length === 0 ? (
                <div style={{
                  padding: '18px 8px', textAlign: 'center',
                  fontSize: '12px', color: 'var(--chronos-text-muted)',
                }}>
                  Nothing here
                </div>
              ) : (
                laneItems.map(item => (
                  <WorkItemCard
                    key={item.id}
                    item={item}
                    showPriority={showPriority}
                    canEdit={canEditItem(item)}
                    canDelete={canDeleteItem(item)}
                    isMobile={isMobile}
                    selectable={selectable}
                    selected={selectedIds.includes(item.id)}
                    onToggleSelect={onToggleSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onMove={onMove}
                    onDragStart={setDragged}
                    onDragEnd={() => { setDragged(null); setDragOverLane(null) }}
                    dragging={dragged?.id === item.id}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
