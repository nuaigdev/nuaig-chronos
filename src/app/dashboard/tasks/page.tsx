'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Task, Project, Profile } from '@/types'
import { EmptyState, Modal, FormField, Select } from '@/components/ui'
import { formatDate } from '@/utils'
import { CheckSquare, Plus, Search, Edit2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

const supabase = createClient()

export default function TasksPage() {
  const { profile, canManageProjects } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ project_id: '', name: '', description: '', estimated_hours: '', assigned_to: '', due_date: '', status: 'todo' })

  useEffect(() => { if (profile) { fetchTasks(); fetchProjects() } }, [profile?.id, projectFilter, statusFilter])

  const fetchTasks = async () => {
    if (!profile) return
    setLoading(true)
    let query = supabase
      .from('tasks')
      .select('*, project:projects(id, name), assignee:profiles!tasks_assigned_to_fkey(id, full_name)')
      .order('created_at', { ascending: false })
    if (projectFilter) query = query.eq('project_id', projectFilter)
    if (statusFilter) query = query.eq('status', statusFilter)
    if (!canManageProjects) {
      // Employees see all tasks in their assigned projects
      const { data: mp } = await supabase.from('project_members').select('project_id').eq('user_id', profile.id)
      const projectIds = mp?.map(p => p.project_id) || []
      if (projectIds.length === 0) { setTasks([]); setLoading(false); return }
      query = query.in('project_id', projectIds)
    }
    const { data } = await query
    setTasks((data || []) as unknown as Task[])
    setLoading(false)
  }

  const fetchProjects = async () => {
    if (!profile) return
    let query = supabase.from('projects').select('id, name').eq('status', 'active').order('name')
    if (!canManageProjects) {
      const { data: mp } = await supabase.from('project_members').select('project_id').eq('user_id', profile.id)
      const ids = mp?.map(p => p.project_id) || []
      if (ids.length > 0) query = query.in('id', ids)
    }
    const { data } = await query
    setProjects((data || []) as unknown as Project[])
  }

  const fetchProjectMembers = async (projectId: string) => {
    if (!projectId) { setMembers([]); return }
    const { data: memberRows } = await supabase.from('project_members').select('user_id').eq('project_id', projectId)
    const ids = memberRows?.map(m => m.user_id) || []
    if (ids.length === 0) { setMembers([]); return }
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids)
    setMembers((data || []) as unknown as Profile[])
  }

  const openCreate = () => {
    setEditTask(null)
    setForm({ project_id: '', name: '', description: '', estimated_hours: '', assigned_to: '', due_date: '', status: 'todo' })
    setMembers([])
    setShowModal(true)
  }

  const openEdit = (t: Task) => {
    setEditTask(t)
    setForm({
      project_id: t.project_id,
      name: t.name,
      description: t.description || '',
      estimated_hours: t.estimated_hours?.toString() || '',
      assigned_to: t.assigned_to || '',
      due_date: t.due_date || '',
      status: t.status,
    })
    fetchProjectMembers(t.project_id)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.project_id || !form.name.trim()) { toast.error('Project and task name required'); return }
    setSaving(true)
    try {
      const payload = {
        project_id: form.project_id,
        name: form.name,
        description: form.description || null,
        estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
        assigned_to: form.assigned_to || null,
        due_date: form.due_date || null,
        status: form.status as Task['status'],
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
      setShowModal(false)
      fetchTasks()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (id: string, status: Task['status']) => {
    const { error } = await supabase.from('tasks').update({ status }).eq('id', id)
    if (error) { toast.error('Failed to update status'); return }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  const filtered = tasks.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.project as { name: string } | undefined)?.name.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = {
    todo: filtered.filter(t => t.status === 'todo'),
    in_progress: filtered.filter(t => t.status === 'in_progress'),
    completed: filtered.filter(t => t.status === 'completed'),
  }

  const statusConfig = {
    todo: { label: 'To Do', color: '#fbbf24' },
    in_progress: { label: 'In Progress', color: '#60a5fa' },
    completed: { label: 'Completed', color: '#34d399' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Tasks</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {/* All users can create tasks */}
        <button className="btn-primary" onClick={openCreate}><Plus size={14} />New Task</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--chronos-text-muted)' }} />
          <input className="input-base" style={{ paddingLeft: '36px' }} placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-base" style={{ width: 'auto' }} value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input-base" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CheckSquare size={28} />}
          title="No tasks found"
          description="Create a task to start tracking work."
          action={<button className="btn-primary" onClick={openCreate}><Plus size={14} />New Task</button>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', alignItems: 'start' }}>
          {(Object.entries(grouped) as [keyof typeof grouped, Task[]][]).map(([status, statusTasks]) => (
            <div key={status} className="card-base" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--chronos-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusConfig[status].color }} />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px' }}>{statusConfig[status].label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--chronos-text-muted)', background: 'var(--chronos-surface-2)', padding: '2px 8px', borderRadius: '100px' }}>
                  {statusTasks.length}
                </span>
              </div>
              <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {statusTasks.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--chronos-text-muted)' }}>No tasks</div>
                ) : (
                  statusTasks.map(task => {
                    const proj = task.project as { name: string } | undefined
                    const assignee = task.assignee as { full_name: string } | undefined
                    return (
                      <div key={task.id} style={{ padding: '12px', borderRadius: '10px', background: 'var(--chronos-surface-2)', border: '1px solid transparent', transition: 'all 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--chronos-border)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--chronos-text)', flex: 1 }}>{task.name}</span>
                          {canManageProjects && (
                            <button onClick={() => openEdit(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '2px', flexShrink: 0 }}
                              onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-text)'}
                              onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                            ><Edit2 size={11} /></button>
                          )}
                        </div>
                        {proj && <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', marginBottom: '8px' }}>{proj.name}</div>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {assignee && <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', background: 'var(--chronos-surface)', padding: '2px 8px', borderRadius: '100px' }}>{assignee.full_name}</span>}
                          {task.estimated_hours && <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}><Clock size={9} />{task.estimated_hours}h</span>}
                          {task.due_date && <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)' }}>{formatDate(task.due_date + 'T00:00:00', 'MMM d')}</span>}
                        </div>
                        {/* Status advance buttons — visible to all users */}
                        {status !== 'completed' && (
                          <div style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
                            {status === 'todo' && (
                              <button onClick={() => updateStatus(task.id, 'in_progress')} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', cursor: 'pointer' }}>
                                → In Progress
                              </button>
                            )}
                            {status === 'in_progress' && (
                              <button onClick={() => updateStatus(task.id, 'completed')} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.08)', color: '#34d399', cursor: 'pointer' }}>
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

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editTask ? 'Edit Task' : 'New Task'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormField label="Project" required>
            <Select
              value={form.project_id}
              onChange={v => { setForm(f => ({ ...f, project_id: v, assigned_to: '' })); fetchProjectMembers(v) }}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              placeholder="Select project"
            />
          </FormField>
          <FormField label="Task Name" required>
            <input className="input-base" placeholder="e.g. Design homepage mockup" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <textarea className="input-base" placeholder="Task details..." rows={2} style={{ resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Estimated Hours">
              <input type="number" min="0" step="0.5" className="input-base" placeholder="e.g. 8" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))} />
            </FormField>
            <FormField label="Due Date">
              <input type="date" className="input-base" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </FormField>
          </div>
          {members.length > 0 && (
            <FormField label="Assign To">
              <Select value={form.assigned_to} onChange={v => setForm(f => ({ ...f, assigned_to: v }))} options={members.map(m => ({ value: m.id, label: m.full_name }))} placeholder="Select team member" />
            </FormField>
          )}
          <FormField label="Status">
            <Select value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={[{ value: 'todo', label: 'To Do' }, { value: 'in_progress', label: 'In Progress' }, { value: 'completed', label: 'Completed' }]} />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editTask ? 'Save Changes' : 'Create Task'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
