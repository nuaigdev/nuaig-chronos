'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Project, Task, TimeLog, Profile } from '@/types'
import { StatusBadge, Modal, FormField, Select, ProgressBar, EmptyState } from '@/components/ui'
import { formatDate, formatHours, getInitials } from '@/utils'
import { ArrowLeft, Plus, Clock, Users, CheckSquare, Calendar, Edit2, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const supabase = createClient()

type EnrichedLog = TimeLog & { userName: string }

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile, profileReady, canManageProjects } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [recentLogs, setRecentLogs] = useState<EnrichedLog[]>([])
  const [isMemberOfProject, setIsMemberOfProject] = useState(false)
  const [loggedHours, setLoggedHours] = useState(0)
  const [loading, setLoading] = useState(true)

  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [taskForm, setTaskForm] = useState({ name: '', description: '', estimated_hours: '', assigned_to: '', due_date: '', status: 'todo' })

  // Gate on profileReady so canManageProjects is accurate before fetching
  // project details and member permissions.
  useEffect(() => {
    if (!id || !profileReady || !profile) return
    loadAll()
  }, [id, profileReady, profile?.id])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([fetchProject(), fetchTasks(), fetchMembers(), fetchLogs()])
    setLoading(false)
  }

  const fetchProject = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*, client:clients(id, name)')
      .eq('id', id)
      .single()
    setProject(data as unknown as Project)
  }

  const fetchTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*, assignee:profiles!tasks_assigned_to_fkey(id, full_name)')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    setTasks((data || []) as unknown as Task[])
  }

  const fetchMembers = async () => {
    const { data: rows } = await supabase.from('project_members').select('user_id').eq('project_id', id)
    const ids = rows?.map(r => r.user_id) || []
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

  const handleDeleteTask = async (task: Task) => {
    if (!confirm(`Delete task "${task.name}"? This cannot be undone.`)) return
    setDeletingTaskId(task.id)
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id)
      if (error) throw error
      toast.success('Task deleted')
      fetchTasks()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete task')
    } finally {
      setDeletingTaskId(null)
    }
  }

  const canEditTaskInProject = (task: Task) => {
    if (!profile) return false
    if (canManageProjects) return true
    return isMemberOfProject
  }

  const canDeleteTaskInProject = (task: Task) => {
    if (!profile) return false
    if (canManageProjects) return true
    return task.created_by === profile.id
  }

  const updateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
    if (error) { toast.error('Failed to update status'); return }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
  }

  const openCreate = () => {
    setEditTask(null)
    setTaskForm({ name: '', description: '', estimated_hours: '', assigned_to: '', due_date: '', status: 'todo' })
    setShowTaskModal(true)
  }

  const openEdit = (task: Task) => {
    setEditTask(task)
    setTaskForm({
      name: task.name,
      description: task.description || '',
      estimated_hours: task.estimated_hours?.toString() || '',
      assigned_to: task.assigned_to || '',
      due_date: task.due_date || '',
      status: task.status,
    })
    setShowTaskModal(true)
  }

  const handleSaveTask = async () => {
    if (!taskForm.name.trim()) { toast.error('Task name is required'); return }
    setSaving(true)
    try {
      const payload = {
        project_id: id,
        name: taskForm.name,
        description: taskForm.description || null,
        estimated_hours: taskForm.estimated_hours ? parseFloat(taskForm.estimated_hours) : null,
        assigned_to: taskForm.assigned_to || null,
        due_date: taskForm.due_date || null,
        status: taskForm.status as Task['status'],
      }
      if (editTask) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', editTask.id)
        if (error) throw error
        toast.success('Task updated!')
      } else {
        const { error } = await supabase.from('tasks').insert({ ...payload, created_by: profile!.id })
        if (error) throw error
        toast.success('Task created!')
      }
      setShowTaskModal(false)
      fetchTasks()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error saving task')
    } finally {
      setSaving(false)
    }
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
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.status === 'completed').length
  const taskPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const grouped = {
    todo: tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    completed: tasks.filter(t => t.status === 'completed'),
  }

  const statusConfig: Record<string, { label: string; color: string }> = {
    todo: { label: 'To Do', color: '#fbbf24' },
    in_progress: { label: 'In Progress', color: '#60a5fa' },
    completed: { label: 'Completed', color: '#34d399' },
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
        <button className="btn-primary" onClick={openCreate}><Plus size={14} />Add Task</button>
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

      {/* Task completion bar */}
      {totalTasks > 0 && (
        <div className="card-base" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
            <span style={{ fontWeight: 600 }}>Task Completion</span>
            <span style={{ color: 'var(--chronos-text-muted)' }}>{completedTasks} of {totalTasks} completed ({taskPct}%)</span>
          </div>
          <ProgressBar value={completedTasks} max={totalTasks} />
        </div>
      )}

      {/* Main content: Tasks + Sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>
        {/* Tasks kanban */}
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>Tasks</h2>
          {tasks.length === 0 ? (
            <EmptyState
              icon={<CheckSquare size={24} />}
              title="No tasks yet"
              description="Add tasks to start tracking work on this project."
              action={<button className="btn-primary" onClick={openCreate}><Plus size={14} />Add Task</button>}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {(Object.entries(grouped) as [string, Task[]][]).map(([status, statusTasks]) => (
                <div key={status} className="card-base" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--chronos-border)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusConfig[status].color, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px' }}>{statusConfig[status].label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--chronos-text-muted)', background: 'var(--chronos-surface-2)', padding: '1px 7px', borderRadius: '100px' }}>{statusTasks.length}</span>
                  </div>
                  <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {statusTasks.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--chronos-text-muted)' }}>Empty</div>
                    ) : (
                      statusTasks.map(task => {
                        const assignee = task.assignee as { full_name: string } | undefined
                        return (
                          <div key={task.id} style={{ padding: '10px', borderRadius: '8px', background: 'var(--chronos-surface-2)', border: '1px solid transparent', transition: 'border-color 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--chronos-border)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, flex: 1 }}>{task.name}</span>
                              <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                                {canEditTaskInProject(task) && (
                                  <button onClick={() => openEdit(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '1px' }}
                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-text)'}
                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                                    title="Edit task"
                                  ><Edit2 size={10} /></button>
                                )}
                                {canDeleteTaskInProject(task) && (
                                  <button
                                    onClick={() => handleDeleteTask(task)}
                                    disabled={deletingTaskId === task.id}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '1px' }}
                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-danger, #ef4444)'}
                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                                    title="Delete task"
                                  ><Trash2 size={10} /></button>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
                              {assignee && <span style={{ fontSize: '10px', color: 'var(--chronos-text-muted)', background: 'var(--chronos-surface)', padding: '1px 6px', borderRadius: '100px' }}>{assignee.full_name}</span>}
                              {task.estimated_hours && <span style={{ fontSize: '10px', color: 'var(--chronos-text-muted)', display: 'flex', alignItems: 'center', gap: '2px' }}><Clock size={8} />{task.estimated_hours}h</span>}
                              {task.due_date && <span style={{ fontSize: '10px', color: 'var(--chronos-text-muted)' }}>{format(new Date(task.due_date + 'T00:00:00'), 'MMM d')}</span>}
                            </div>
                            {/* Status advance — all users can change status */}
                            {status !== 'completed' && (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {status === 'todo' && (
                                  <button onClick={() => updateTaskStatus(task.id, 'in_progress')} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '5px', border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', cursor: 'pointer' }}>
                                    → In Progress
                                  </button>
                                )}
                                {status === 'in_progress' && (
                                  <button onClick={() => updateTaskStatus(task.id, 'completed')} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '5px', border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.08)', color: '#34d399', cursor: 'pointer' }}>
                                    ✓ Complete
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
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

      {/* Add / Edit Task Modal */}
      <Modal isOpen={showTaskModal} onClose={() => setShowTaskModal(false)} title={editTask ? 'Edit Task' : 'Add Task'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormField label="Task Name" required>
            <input className="input-base" placeholder="e.g. Design login screen" value={taskForm.name} onChange={e => setTaskForm(f => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <textarea className="input-base" placeholder="Task details..." rows={2} style={{ resize: 'vertical' }} value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Estimated Hours">
              <input type="number" min="0" step="0.5" className="input-base" placeholder="e.g. 8" value={taskForm.estimated_hours} onChange={e => setTaskForm(f => ({ ...f, estimated_hours: e.target.value }))} />
            </FormField>
            <FormField label="Due Date">
              <input type="date" className="input-base" value={taskForm.due_date} onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))} />
            </FormField>
          </div>
          {members.length > 0 && (
            <FormField label="Assign To">
              <Select
                value={taskForm.assigned_to}
                onChange={v => setTaskForm(f => ({ ...f, assigned_to: v }))}
                options={members.map(m => ({ value: m.id, label: m.full_name }))}
                placeholder="Select team member"
              />
            </FormField>
          )}
          <FormField label="Status">
            <Select
              value={taskForm.status}
              onChange={v => setTaskForm(f => ({ ...f, status: v }))}
              options={[
                { value: 'todo', label: 'To Do' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowTaskModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSaveTask} disabled={saving}>
              {saving ? 'Saving...' : editTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
