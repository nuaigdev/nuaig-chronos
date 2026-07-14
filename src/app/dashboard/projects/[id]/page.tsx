'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/hooks/useProfile'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useWorkItems, useBoardSettings, useCompanyPeople } from '@/hooks/useWorkItems'
import { Project, TimeLog, Profile, WorkItem } from '@/types'
import { StatusBadge, ProgressBar, EmptyState } from '@/components/ui'
import KanbanLanes from '@/components/board/KanbanLanes'
import WorkItemModal from '@/components/board/WorkItemModal'
import { formatDate, formatHours, getInitials } from '@/utils'
import { ArrowLeft, Clock, Users, CheckSquare, Calendar, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

const supabase = createClient()

type EnrichedLog = TimeLog & { userName: string }

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile, loading: authLoading, canManageProjects } = useProfile()
  const isMobile = useIsMobile()
  const { settings } = useBoardSettings()
  const { people } = useCompanyPeople()

  const [project, setProject] = useState<Project | null>(null)
  const [members, setMembers] = useState<Profile[]>([])
  const [recentLogs, setRecentLogs] = useState<EnrichedLog[]>([])
  const [isMemberOfProject, setIsMemberOfProject] = useState(false)
  const [loggedHours, setLoggedHours] = useState(0)
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WorkItem | null>(null)

  // The project's Work Board. Replaces the legacy `tasks` table, which is
  // dormant (admin-only RLS, single assignee) and stays untouched.
  const {
    items, createWorkItem, updateWorkItem, moveWorkItem, deleteWorkItem,
  } = useWorkItems({ type: 'project', projectId: id }, settings.archiveDoneDays)

  useEffect(() => {
    if (!id || authLoading || !profile) return
    loadAll()
  }, [id, authLoading, profile?.id])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([fetchProject(), fetchMembers(), fetchLogs()])
    setLoading(false)
  }

  const fetchProject = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*, client:clients(id, name)')
      .eq('id', id)
      .single()
    if (error) return
    setProject(data as unknown as Project)
  }

  const fetchMembers = async () => {
    const { data: rows } = await supabase.from('project_members').select('user_id').eq('project_id', id)
    const ids = rows?.map(r => r.user_id) || []
    setIsMemberOfProject(profile ? ids.includes(profile.id) : false)
    if (ids.length === 0) { setMembers([]); return }
    const { data } = await supabase.from('profiles').select('id, full_name, role, department').in('id', ids)
    setMembers((data || []) as unknown as Profile[])
  }

  const fetchLogs = async () => {
    // Fetch all logs for total hours
    const { data: allLogs } = await supabase.from('time_logs').select('hours').eq('project_id', id)
    setLoggedHours(((allLogs || []) as { hours: number }[]).reduce((s, l) => s + l.hours, 0))

    // Fetch recent logs
    const { data: logData } = await supabase
      .from('time_logs')
      .select('*')
      .eq('project_id', id)
      .order('log_date', { ascending: false })
      .limit(8)

    // Batch-fetch user names for the logs
    const seen = new Set<string>()
    const userIds: string[] = []
    for (const l of logData || []) { if (!seen.has(l.user_id as string)) { seen.add(l.user_id as string); userIds.push(l.user_id as string) } }
    const nameMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
      for (const p of profiles || []) nameMap[p.id as string] = p.full_name as string
    }

    setRecentLogs(
      ((logData || []) as unknown as TimeLog[]).map(l => ({ ...l, userName: nameMap[l.user_id] || 'Unknown' }))
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: '80px' }}>
        <p style={{ color: 'var(--chronos-text-muted)', marginBottom: '16px' }}>Project not found or you don&apos;t have access.</p>
        <Link href="/dashboard/projects"><button className="btn-secondary">Back to Projects</button></Link>
      </div>
    )
  }

  const client = project.client as { name: string } | undefined
  const totalTasks = items.length
  const completedTasks = items.filter(i => i.status === 'done').length

  // Board permissions, mirroring /dashboard/board.
  const canEditItem = (item: WorkItem) =>
    canManageProjects ||
    item.created_by === user?.id ||
    (item.assignees || []).some(a => a.user_id === user?.id)

  const canDeleteItem = (item: WorkItem) =>
    canManageProjects || item.created_by === user?.id

  const canCreate = canManageProjects || (settings.employeeCanCreate && isMemberOfProject)

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Delete this work item? This cannot be undone.')) return
    await deleteWorkItem(itemId)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Back link */}
      <Link
        href="/dashboard/projects"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--chronos-text-muted)', textDecoration: 'none', width: 'fit-content' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
      >
        <ArrowLeft size={13} /> Back to Projects
      </Link>

      {/* Project header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, letterSpacing: '-0.04em' }}>{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          {client && <p style={{ fontSize: '14px', color: 'var(--chronos-text-muted)', marginBottom: '4px' }}>{client.name}</p>}
          {project.description && <p style={{ fontSize: '14px', color: 'var(--chronos-text-muted)', lineHeight: 1.6, maxWidth: '640px' }}>{project.description}</p>}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {[
          { icon: <Users size={16} />, label: 'Team Members', value: members.length.toString(), color: '#3b82f6' },
          { icon: <CheckSquare size={16} />, label: 'Tasks', value: `${completedTasks}/${totalTasks}`, color: '#34d399' },
          { icon: <Clock size={16} />, label: 'Hours Logged', value: formatHours(loggedHours), color: '#8b5cf6' },
          { icon: <Calendar size={16} />, label: 'Due Date', value: project.end_date ? formatDate(project.end_date + 'T00:00:00', 'MMM d, yyyy') : '—', color: '#fbbf24' },
        ].map(stat => (
          <div key={stat.label} className="card-base" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${stat.color}18`, color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {stat.icon}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{stat.label}</span>
            </div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--chronos-text)' }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Work completion bar */}
      {totalTasks > 0 && (
        <div className="card-base" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
            <span style={{ fontWeight: 600 }}>Work Completion</span>
            <span style={{ color: 'var(--chronos-text-muted)' }}>
              {completedTasks} of {totalTasks} done ({Math.round((completedTasks / totalTasks) * 100)}%)
            </span>
          </div>
          <ProgressBar value={completedTasks} max={totalTasks} />
        </div>
      )}

      {/* Main content: Tasks + Sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>
        {/* Project Work Board */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '12px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700 }}>Work Board</h2>
            {canCreate && (
              <button className="btn-secondary" onClick={() => { setEditing(null); setModalOpen(true) }} style={{ fontSize: '12px', padding: '6px 10px' }}>
                <Plus size={13} />
                New Work Item
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={<CheckSquare size={24} />}
              title="No work items yet"
              description="Add the first piece of work for this project."
              action={canCreate ? (
                <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
                  <Plus size={15} />
                  New Work Item
                </button>
              ) : undefined}
            />
          ) : (
            <KanbanLanes
              items={items}
              showPriority={settings.showPriority}
              isMobile={isMobile}
              selectable={false}
              selectedIds={[]}
              onToggleSelect={() => {}}
              canEditItem={canEditItem}
              canDeleteItem={canDeleteItem}
              onEdit={item => { setEditing(item); setModalOpen(true) }}
              onDelete={handleDeleteItem}
              onMove={moveWorkItem}
            />
          )}
        </div>

        {/* Right sidebar: Members + Recent Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Team Members */}
          <div className="card-base" style={{ padding: '16px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={14} /> Team ({members.length})
            </h2>
            {members.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', textAlign: 'center', padding: '12px' }}>No members yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {members.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {getInitials(m.full_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name}</p>
                      <p style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', textTransform: 'capitalize' }}>{m.role}{m.department ? ` · ${m.department}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Time Logs */}
          <div className="card-base" style={{ padding: '16px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={14} /> Recent Logs
            </h2>
            {recentLogs.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', textAlign: 'center', padding: '12px' }}>No time logged yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentLogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ width: '36px', height: '28px', borderRadius: '6px', background: 'var(--chronos-accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--chronos-accent)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                      {log.hours}h
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.userName}</p>
                      <p style={{ fontSize: '11px', color: 'var(--chronos-text-muted)' }}>{formatDate(log.log_date + 'T00:00:00', 'MMM d')}{log.description ? ` · ${log.description}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Project meta */}
          {(project.start_date || project.end_date || project.estimated_hours || project.budget) && (
            <div className="card-base" style={{ padding: '16px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Details</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {project.start_date && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--chronos-text-muted)' }}>Start date</span>
                    <span>{formatDate(project.start_date + 'T00:00:00', 'MMM d, yyyy')}</span>
                  </div>
                )}
                {project.end_date && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--chronos-text-muted)' }}>End date</span>
                    <span>{formatDate(project.end_date + 'T00:00:00', 'MMM d, yyyy')}</span>
                  </div>
                )}
                {project.estimated_hours && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--chronos-text-muted)' }}>Estimated hours</span>
                    <span>{formatHours(project.estimated_hours)}</span>
                  </div>
                )}
                {project.budget && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--chronos-text-muted)' }}>Budget</span>
                    <span>${project.budget.toLocaleString()}</span>
                  </div>
                )}
                {project.estimated_hours && (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--chronos-text-muted)', marginBottom: '5px' }}>
                      <span>Hours used</span>
                      <span>{formatHours(loggedHours)} / {formatHours(project.estimated_hours)}</span>
                    </div>
                    <ProgressBar value={loggedHours} max={project.estimated_hours} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Project is fixed here — you are already inside it. */}
      <WorkItemModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        editing={editing}
        projects={project ? [project] : []}
        people={people}
        showPriority={settings.showPriority}
        lockedProjectId={id}
        onCreate={createWorkItem}
        onUpdate={updateWorkItem}
      />
    </div>
  )
}
