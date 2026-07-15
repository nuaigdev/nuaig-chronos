'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/hooks/useProfile'
import { useIsMobile } from '@/hooks/useIsMobile'
import {
  useWorkItems, useBoardSettings, useCompanyPeople, BoardScope,
} from '@/hooks/useWorkItems'
import { WorkItem, WorkItemStatus, Project, DeptRow, WORK_ITEM_LANES, WORK_ITEM_STATUS_LABELS } from '@/types'
import { Select, EmptyState, Skeleton } from '@/components/ui'
import KanbanLanes from '@/components/board/KanbanLanes'
import WorkItemList from '@/components/board/WorkItemList'
import WorkItemModal from '@/components/board/WorkItemModal'
import { getWorkItemLaneColor } from '@/utils'
import {
  KanbanSquare, List, Plus, Users, FolderKanban, AlertTriangle, UserX, X,
} from 'lucide-react'

// Single stable client instance — never recreate inside a component
const supabase = createClient()

type ViewMode = 'board' | 'list'
type ScopeType = 'team' | 'project'

const ALL_DEPARTMENTS = 'all'

export default function WorkBoardPage() {
  const { user, profile, isAdmin, isManager, loading: profileLoading } = useProfile()
  const isMobile = useIsMobile()
  const { settings, loading: settingsLoading } = useBoardSettings()
  const { people } = useCompanyPeople()

  const [scopeType, setScopeType] = useState<ScopeType>('team')
  const [department, setDepartment] = useState('')
  const [projectId, setProjectId] = useState('')
  const [view, setView] = useState<ViewMode>('board')

  const [departments, setDepartments] = useState<DeptRow[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [refLoading, setRefLoading] = useState(true)

  const [mineOnly, setMineOnly] = useState(false)
  const [overdueOnly, setOverdueOnly] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const canManage = isAdmin || isManager

  // ── Reference data: departments + the projects this user may file work under
  useEffect(() => {
    if (!profile) return
    let cancelled = false

    const load = async () => {
      const { data: deptData } = await supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .order('display_name')

      const depts = (deptData || []) as unknown as DeptRow[]

      // Employees can only file work under projects they belong to — mirror
      // that in the picker rather than letting RLS reject the insert later.
      let projectQuery = supabase
        .from('projects')
        .select('id, name, client_id, client:clients(id, name)')
        .eq('status', 'active')
        .order('name')

      if (!canManage) {
        const { data: memberRows } = await supabase
          .from('project_members')
          .select('project_id')
          .eq('user_id', profile.id)

        const ids = ((memberRows || []) as { project_id: string }[]).map(r => r.project_id)
        if (ids.length === 0) {
          if (!cancelled) {
            setDepartments(depts)
            setProjects([])
            setRefLoading(false)
          }
          return
        }
        projectQuery = projectQuery.in('id', ids)
      }

      const { data: projData } = await projectQuery
      if (cancelled) return

      setDepartments(depts)
      setProjects((projData || []) as unknown as Project[])
      setRefLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [profile, canManage])

  // Land people on a sensible board: their own department, or the first one.
  // Employees are pinned to their own department and cannot leave it.
  useEffect(() => {
    if (department || departments.length === 0 || !profile) return
    const own = departments.find(d => d.name === profile.department)
    if (!canManage) {
      // No fallback to departments[0] here — dropping an employee onto some
      // other team's board is exactly what this restriction exists to prevent.
      if (own) setDepartment(own.name)
      return
    }
    setDepartment(own?.name || departments[0].name)
  }, [departments, profile, department, canManage])

  const scope: BoardScope = useMemo(
    () => (scopeType === 'project'
      ? { type: 'project', projectId }
      : { type: 'team', department }),
    [scopeType, projectId, department],
  )

  const scopeReady = scopeType === 'team' ? Boolean(department) : Boolean(projectId)

  const {
    items, loading: itemsLoading,
    createWorkItem, updateWorkItem, moveWorkItem, deleteWorkItem,
    bulkSetStatus, bulkDelete,
  } = useWorkItems(scope, settings.archiveDoneDays)

  // ── Filters
  const visibleItems = useMemo(() => {
    let out = items
    if (mineOnly && user) {
      out = out.filter(i => (i.assignees || []).some(a => a.user_id === user.id))
    }
    if (overdueOnly) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      out = out.filter(i => i.due_date && i.status !== 'done' && new Date(i.due_date) < today)
    }
    return out
  }, [items, mineOnly, overdueOnly, user])

  // ── Team view: one swimlane per project, in stable name order.
  const projectGroups = useMemo(() => {
    const groups = new Map<string, { project: Project | undefined; items: WorkItem[] }>()
    for (const item of visibleItems) {
      const key = item.project_id
      if (!groups.has(key)) groups.set(key, { project: item.project, items: [] })
      groups.get(key)!.items.push(item)
    }
    return Array.from(groups.entries())
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => (a.project?.name || '').localeCompare(b.project?.name || ''))
  }, [visibleItems])

  // ── Stats
  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return {
      lanes: WORK_ITEM_LANES.map(lane => ({
        lane,
        count: visibleItems.filter(i => i.status === lane).length,
      })),
      overdue: visibleItems.filter(
        i => i.due_date && i.status !== 'done' && new Date(i.due_date) < today
      ).length,
      unassigned: visibleItems.filter(i => (i.assignees || []).length === 0).length,
    }
  }, [visibleItems])

  // ── Permissions, per item
  const canEditItem = (item: WorkItem) =>
    canManage ||
    item.created_by === user?.id ||
    (item.assignees || []).some(a => a.user_id === user?.id)

  const canDeleteItem = (item: WorkItem) =>
    canManage || item.created_by === user?.id

  const canCreate = canManage || (settings.employeeCanCreate && projects.length > 0)

  const toggleSelect = (id: string) =>
    setSelectedIds(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]))

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this work item? This cannot be undone.')) return
    await deleteWorkItem(id)
    setSelectedIds(cur => cur.filter(x => x !== id))
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} work item(s)? This cannot be undone.`)) return
    await bulkDelete(selectedIds)
    setSelectedIds([])
  }

  const openCreate = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (item: WorkItem) => { setEditing(item); setModalOpen(true) }

  const loading = profileLoading || settingsLoading || refLoading

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Skeleton height="40px" />
        <Skeleton height="80px" />
        <Skeleton height="300px" />
      </div>
    )
  }

  // Managers and admins roam every department. Employees see only their own,
  // so the picker collapses to a single locked option.
  const deptOptions = canManage
    ? [
        { value: ALL_DEPARTMENTS, label: 'All Departments' },
        ...departments.map(d => ({ value: d.name, label: d.display_name || d.name })),
      ]
    : departments
        .filter(d => d.name === profile?.department)
        .map(d => ({ value: d.name, label: d.display_name || d.name }))

  const renderItems = (list: WorkItem[]) =>
    view === 'board' ? (
      <KanbanLanes
        items={list}
        showPriority={settings.showPriority}
        isMobile={isMobile}
        selectable={canManage}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        canEditItem={canEditItem}
        canDeleteItem={canDeleteItem}
        onEdit={openEdit}
        onDelete={handleDelete}
        onMove={moveWorkItem}
      />
    ) : (
      <WorkItemList
        items={list}
        showPriority={settings.showPriority}
        selectable={canManage}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        canEditItem={canEditItem}
        canDeleteItem={canDeleteItem}
        onEdit={openEdit}
        onDelete={handleDelete}
        onMove={moveWorkItem}
      />
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, letterSpacing: '-0.04em' }}>
            Work Board
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>
            {scopeType === 'team'
              ? 'Everything the team is working on, separated by project'
              : 'Everything happening on one project'}
          </p>
        </div>

        {canCreate && (
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={15} />
            New Work Item
          </button>
        )}
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        padding: '12px', borderRadius: '12px',
        background: 'var(--chronos-surface)', border: '1px solid var(--chronos-border)',
      }}>
        {/* Scope toggle */}
        <div style={{ display: 'flex', background: 'var(--chronos-surface-2)', borderRadius: '9px', padding: '3px', gap: '2px' }}>
          {([
            { key: 'team' as ScopeType, label: 'Team', icon: Users },
            { key: 'project' as ScopeType, label: 'Project', icon: FolderKanban },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setScopeType(key); setSelectedIds([]) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                background: scopeType === key ? 'var(--chronos-accent)' : 'transparent',
                color: scopeType === key ? 'white' : 'var(--chronos-text-muted)',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Scope target */}
        <div style={{ minWidth: '200px' }}>
          {scopeType === 'team' ? (
            <Select
              value={department}
              onChange={v => { setDepartment(v); setSelectedIds([]) }}
              options={deptOptions}
              disabled={!canManage}
              placeholder="Select a department"
            />
          ) : (
            <Select
              value={projectId}
              onChange={v => { setProjectId(v); setSelectedIds([]) }}
              options={projects.map(p => ({
                value: p.id,
                label: p.client?.name ? `${p.name} — ${p.client.name}` : p.name,
              }))}
              placeholder="Select a project"
            />
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Filters */}
        <button
          onClick={() => setMineOnly(v => !v)}
          style={filterChipStyle(mineOnly)}
        >
          Assigned to me
        </button>
        <button
          onClick={() => setOverdueOnly(v => !v)}
          style={filterChipStyle(overdueOnly)}
        >
          Overdue
        </button>

        {/* View toggle */}
        <div style={{ display: 'flex', background: 'var(--chronos-surface-2)', borderRadius: '9px', padding: '3px', gap: '2px' }}>
          {([
            { key: 'board' as ViewMode, icon: KanbanSquare, label: 'Board' },
            { key: 'list' as ViewMode, icon: List, label: 'List' },
          ]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              title={label}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '7px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                background: view === key ? 'var(--chronos-accent)' : 'transparent',
                color: view === key ? 'white' : 'var(--chronos-text-muted)',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      {scopeReady && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {stats.lanes.map(({ lane, count }) => (
            <StatChip
              key={lane}
              label={WORK_ITEM_STATUS_LABELS[lane]}
              value={count}
              color={getWorkItemLaneColor(lane)}
            />
          ))}
          <StatChip
            label="Overdue"
            value={stats.overdue}
            color="var(--chronos-danger)"
            icon={<AlertTriangle size={13} />}
          />
          {/* Items with no assignee belong to no department, so they show on
              no team board. Surfacing the count keeps them from disappearing. */}
          <StatChip
            label="Unassigned"
            value={stats.unassigned}
            color="var(--chronos-text-muted)"
            icon={<UserX size={13} />}
          />
        </div>
      )}

      {/* Bulk action bar */}
      {canManage && selectedIds.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          padding: '10px 14px', borderRadius: '10px',
          background: 'var(--chronos-surface-2)',
          border: '1px solid var(--chronos-accent)',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>
            {selectedIds.length} selected
          </span>
          <div style={{ flex: 1 }} />
          {WORK_ITEM_LANES.map(lane => (
            <button
              key={lane}
              className="btn-secondary"
              onClick={async () => { await bulkSetStatus(selectedIds, lane as WorkItemStatus); setSelectedIds([]) }}
              style={{ fontSize: '12px', padding: '6px 10px' }}
            >
              Move to {WORK_ITEM_STATUS_LABELS[lane]}
            </button>
          ))}
          <button
            className="btn-secondary"
            onClick={handleBulkDelete}
            style={{ fontSize: '12px', padding: '6px 10px', color: 'var(--chronos-danger)' }}
          >
            Delete
          </button>
          <button
            onClick={() => setSelectedIds([])}
            title="Clear selection"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', display: 'flex', padding: '4px' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Content */}
      {scopeType === 'team' && !canManage && !profile?.department ? (
        // Dead end: an employee with no department has no team board to land on,
        // and cannot pick another one. Say so rather than showing an empty picker.
        <EmptyState
          icon={<Users size={22} />}
          title="You're not in a department yet"
          description="Ask an admin to add you to one, and your team's board will show up here. In the meantime you can still use the Project view."
        />
      ) : !scopeReady ? (
        <EmptyState
          icon={<KanbanSquare size={22} />}
          title={scopeType === 'team' ? 'Pick a department' : 'Pick a project'}
          description={
            scopeType === 'team'
              ? 'Choose a department to see everything its members are working on.'
              : 'Choose a project to see its board.'
          }
        />
      ) : itemsLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Skeleton height="200px" />
          <Skeleton height="200px" />
        </div>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={<KanbanSquare size={22} />}
          title="No work items"
          description={
            mineOnly || overdueOnly
              ? 'Nothing matches the filters you have on. Try clearing them.'
              : scopeType === 'team'
                ? 'Nobody in this department has been assigned any work yet.'
                : 'This project has no work items yet.'
          }
          action={canCreate ? (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={15} />
              New Work Item
            </button>
          ) : undefined}
        />
      ) : scopeType === 'project' ? (
        renderItems(visibleItems)
      ) : (
        // Team view — one horizontally separated section per project.
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {projectGroups.map((group, idx) => (
            <div key={group.id}>
              {idx > 0 && (
                <div style={{ height: '1px', background: 'var(--chronos-border)', margin: '18px 0' }} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{
                  width: '30px', height: '30px', borderRadius: '8px',
                  background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FolderKanban size={15} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                    {group.project?.name || 'Unknown project'}
                  </div>
                  {group.project?.client?.name && (
                    <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>
                      {group.project.client.name}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 600, color: 'var(--chronos-text-muted)',
                  background: 'var(--chronos-surface-2)', borderRadius: '100px', padding: '2px 9px',
                }}>
                  {group.items.length}
                </span>
              </div>

              {renderItems(group.items)}
            </div>
          ))}
        </div>
      )}

      <WorkItemModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        editing={editing}
        projects={projects}
        people={people}
        showPriority={settings.showPriority}
        lockedProjectId={scopeType === 'project' && !editing ? projectId : undefined}
        // Employees pick from the project's members (cross-department included);
        // managers/admins from everyone. Enforced in RLS too (migration 023).
        restrictToProjectMembers={!canManage}
        onCreate={createWorkItem}
        onUpdate={updateWorkItem}
      />
    </div>
  )
}

// ============================
// STAT CHIP
// ============================
function StatChip({
  label, value, color, icon,
}: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 14px', borderRadius: '10px',
      background: 'var(--chronos-surface)',
      border: '1px solid var(--chronos-border)',
    }}>
      {icon ? (
        <span style={{ color, display: 'flex' }}>{icon}</span>
      ) : (
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} />
      )}
      <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--chronos-text)' }}>
        {value}
      </span>
      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{label}</span>
    </div>
  )
}

const filterChipStyle = (active: boolean): React.CSSProperties => ({
  padding: '7px 12px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'inherit',
  background: active ? 'rgba(167,139,250,0.12)' : 'var(--chronos-surface-2)',
  border: `1px solid ${active ? 'var(--chronos-accent)' : 'var(--chronos-border)'}`,
  color: active ? 'var(--chronos-accent)' : 'var(--chronos-text-muted)',
  transition: 'all 0.15s',
})
