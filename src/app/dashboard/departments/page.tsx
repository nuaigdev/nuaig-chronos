'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/hooks/useProfile'
import { Profile, DeptRow, TaskType } from '@/types'
import { EmptyState, Modal, FormField, Select } from '@/components/ui'
import { getInitials } from '@/utils'
import { Building2, Users, ChevronDown, ChevronRight, UserCog, Plus, Tag, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

const supabase = createClient()

export default function DepartmentsPage() {
  const { isAdmin, isManager, loading: authLoading, profile } = useProfile()
  const router = useRouter()

  const [departments, setDepartments] = useState<DeptRow[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Create department modal (admin only)
  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', display_name: '', description: '' })
  const [creating, setCreating] = useState(false)

  // Edit department modal (admin only)
  const [editModal, setEditModal] = useState<DeptRow | null>(null)
  const [editForm, setEditForm] = useState({ name: '', display_name: '', description: '' })
  const [editing, setEditing] = useState(false)

  // Manager modal (admin only)
  const [managerModal, setManagerModal] = useState<DeptRow | null>(null)
  const [selectedManager, setSelectedManager] = useState('')
  const [savingManager, setSavingManager] = useState(false)

  // Add task type modal (admin: any dept; manager: their own dept only)
  const [taskTypeModal, setTaskTypeModal] = useState<DeptRow | null>(null)
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [savingTask, setSavingTask] = useState(false)

  // Edit task type modal
  const [editTaskTypeModal, setEditTaskTypeModal] = useState<TaskType | null>(null)
  const [editTaskName, setEditTaskName] = useState('')
  const [editTaskDesc, setEditTaskDesc] = useState('')
  const [savingEditTask, setSavingEditTask] = useState(false)

  // Redirect users who are neither admin nor manager
  useEffect(() => {
    if (!authLoading && !isAdmin && !isManager) router.replace('/dashboard')
  }, [authLoading, isAdmin, isManager, router])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [deptsRes, profsRes, ttRes] = await Promise.all([
      supabase
        .from('departments')
        .select('*, manager:profiles!departments_manager_id_fkey(id, full_name, email, role, department, is_active, created_at, updated_at)')
        .order('name'),
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('task_types').select('*').order('department').order('sort_order'),
    ])
    if (deptsRes.error || profsRes.error || ttRes.error) {
      setLoading(false); return
    }
    setDepartments((deptsRes.data || []) as unknown as DeptRow[])
    setMembers((profsRes.data || []) as unknown as Profile[])
    setTaskTypes((ttRes.data || []) as unknown as TaskType[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (authLoading || (!isAdmin && !isManager)) return
    fetchData()
  }, [authLoading, isAdmin, isManager, fetchData])

  // ── Determine what this manager can edit ─────────────────────────────────
  // A manager can only edit/delete task types for departments where they are
  // the designated manager_id.
  const managedDeptNames: string[] = isAdmin
    ? [] // not used for admins
    : departments
        .filter(d => d.manager_id === profile?.id)
        .map(d => d.name)

  const canEditTaskTypesFor = (deptName: string): boolean => {
    if (isAdmin) return true
    return managedDeptNames.includes(deptName)
  }

  // ── Create department (admin only) ────────────────────────────────────────

  const openCreateModal = () => {
    setCreateForm({ name: '', display_name: '', description: '' })
    setCreateModal(true)
  }

  const handleCreate = async () => {
    if (!createForm.name.trim()) { toast.error('Department code/name is required'); return }
    if (!createForm.display_name.trim()) { toast.error('Display name is required'); return }
    if (!/^[A-Za-z0-9_-]+$/.test(createForm.name.trim())) {
      toast.error('Department code must be alphanumeric (letters, numbers, _ or -)')
      return
    }
    setCreating(true)
    try {
      const { error } = await supabase.from('departments').insert({
        name: createForm.name.trim().toUpperCase(),
        display_name: createForm.display_name.trim(),
        description: createForm.description.trim() || null,
        company_id: profile!.company_id,
      })
      if (error) throw error
      toast.success(`Department "${createForm.display_name}" created`)
      setCreateModal(false)
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error creating department')
    } finally {
      setCreating(false)
    }
  }

  // ── Edit department (admin only) ──────────────────────────────────────────

  const openEditModal = (dept: DeptRow) => {
    setEditModal(dept)
    setEditForm({ name: dept.name, display_name: dept.display_name, description: dept.description || '' })
  }

  const handleEdit = async () => {
    if (!editModal) return
    if (!editForm.name.trim()) { toast.error('Department code is required'); return }
    if (!editForm.display_name.trim()) { toast.error('Display name is required'); return }
    if (!/^[A-Za-z0-9_-]+$/.test(editForm.name.trim())) {
      toast.error('Department code must be alphanumeric (letters, numbers, _ or -)')
      return
    }
    const newName = editForm.name.trim().toUpperCase()
    const oldName = editModal.name
    setEditing(true)
    try {
      const { error } = await supabase.from('departments').update({
        name: newName,
        display_name: editForm.display_name.trim(),
        description: editForm.description.trim() || null,
      }).eq('id', editModal.id)
      if (error) throw error
      if (newName !== oldName) {
        const [{ error: profError }, { error: ttError }] = await Promise.all([
          supabase.from('profiles').update({ department: newName }).eq('department', oldName),
          supabase.from('task_types').update({ department: newName }).eq('department', oldName),
        ])
        if (profError) console.error('Profile cascade error:', profError)
        if (ttError) console.error('Task type cascade error:', ttError)
      }
      toast.success('Department updated')
      setEditModal(null)
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error updating department')
    } finally {
      setEditing(false)
    }
  }

  // ── Manager assignment (admin only) ───────────────────────────────────────

  const openManagerModal = (dept: DeptRow) => {
    setManagerModal(dept)
    setSelectedManager(dept.manager_id || '')
  }

  const saveManager = async () => {
    if (!managerModal) return
    setSavingManager(true)
    try {
      const { error } = await supabase
        .from('departments')
        .update({ manager_id: selectedManager || null })
        .eq('id', managerModal.id)
      if (error) throw error
      toast.success('Department manager updated')
      setManagerModal(null)
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSavingManager(false)
    }
  }

  // ── Add task type ─────────────────────────────────────────────────────────

  const openTaskTypeModal = (dept: DeptRow) => {
    setTaskTypeModal(dept)
    setNewTaskName('')
    setNewTaskDesc('')
  }

  const saveTaskType = async () => {
    if (!taskTypeModal) return
    if (!newTaskName.trim()) { toast.error('Enter a task type name'); return }
    setSavingTask(true)
    try {
      const deptTaskTypes = taskTypes.filter(t => t.department === taskTypeModal.name)
      const { error } = await supabase.from('task_types').insert({
        department: taskTypeModal.name,
        name: newTaskName.trim(),
        description: newTaskDesc.trim() || null,
        sort_order: deptTaskTypes.length + 1,
        is_active: true,
        company_id: profile!.company_id,
      })
      if (error) throw error
      toast.success('Task type added')
      setTaskTypeModal(null)
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSavingTask(false)
    }
  }

  // ── Edit task type name ───────────────────────────────────────────────────

  const openEditTaskType = (tt: TaskType) => {
    setEditTaskTypeModal(tt)
    setEditTaskName(tt.name)
    setEditTaskDesc(tt.description || '')
  }

  const saveEditTaskType = async () => {
    if (!editTaskTypeModal) return
    if (!editTaskName.trim()) { toast.error('Task type name is required'); return }
    setSavingEditTask(true)
    try {
      const { error } = await supabase
        .from('task_types')
        .update({ name: editTaskName.trim(), description: editTaskDesc.trim() || null })
        .eq('id', editTaskTypeModal.id)
      if (error) throw error
      toast.success('Task type updated')
      setEditTaskTypeModal(null)
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error updating task type')
    } finally {
      setSavingEditTask(false)
    }
  }

  // ── Delete task type ──────────────────────────────────────────────────────

  const deleteTaskType = async (id: string, name: string, deptName: string) => {
    if (!canEditTaskTypesFor(deptName)) {
      toast.error('You can only manage task types for your own department')
      return
    }
    if (!confirm(`Delete task type "${name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('task_types').delete().eq('id', id)
    if (error) { toast.error('Failed to delete task type'); return }
    toast.success(`"${name}" deleted`)
    fetchData()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const managerOptions = [
    { value: '', label: 'No manager' },
    ...members
      .filter(m => m.role === 'manager' || m.role === 'admin')
      .map(m => ({ value: m.id, label: `${m.full_name} (${m.role})` })),
  ]

  const getDeptMembers = (deptName: string): Profile[] =>
    members.filter(m => m.department === deptName)

  const getDeptTaskTypes = (deptName: string): TaskType[] =>
    taskTypes.filter(t => t.department === deptName)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
        <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Departments</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>
            {isAdmin
              ? 'Manage department structure, managers, members and task types'
              : 'View departments and manage task types for your department'}
          </p>
        </div>
        {isAdmin && (
          <button
            className="btn-primary"
            onClick={openCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
          >
            <Plus size={14} />New Department
          </button>
        )}
      </div>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        <div className="card-base" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#60a5fa' }}>{departments.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>Departments</div>
        </div>
        <div className="card-base" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#34d399' }}>{members.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>Active Members</div>
        </div>
        <div className="card-base" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#a78bfa' }}>{taskTypes.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>Task Types</div>
        </div>
      </div>

      {/* Manager notice banner */}
      {isManager && !isAdmin && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '13px', color: 'var(--chronos-accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Tag size={14} />
          {managedDeptNames.length > 0
            ? `You can add, edit, and delete task types for: ${managedDeptNames.join(', ')}`
            : 'You are not set as the manager of any department yet. Contact an admin to be assigned.'}
        </div>
      )}

      {departments.length === 0 ? (
        <EmptyState icon={<Building2 size={28} />} title="No departments found" description="Create your first department using the button above." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {departments.map(dept => {
            const deptMembers = getDeptMembers(dept.name)
            const deptTaskTypes = getDeptTaskTypes(dept.name)
            const isExpanded = expanded === dept.id
            const canEditTasks = canEditTaskTypesFor(dept.name)

            return (
              <div key={dept.id} className="card-base" style={{ overflow: 'hidden' }}>
                {/* Department header */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : dept.id)}
                  style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--chronos-surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={18} color="white" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '15px' }}>{dept.name}</span>
                      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>— {dept.display_name}</span>
                      {isManager && !isAdmin && managedDeptNames.includes(dept.name) && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '100px', background: 'rgba(99,102,241,0.12)', color: 'var(--chronos-accent)', fontWeight: 600 }}>
                          Your Department
                        </span>
                      )}
                    </div>
                    {dept.description && (
                      <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '2px' }}>{dept.description}</div>
                    )}
                    <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '3px', display: 'flex', gap: '14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={11} />{deptMembers.length} member{deptMembers.length !== 1 ? 's' : ''}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Tag size={11} />{deptTaskTypes.length} task type{deptTaskTypes.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
                    {dept.manager ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '8px', background: 'var(--chronos-surface-2)', border: '1px solid var(--chronos-border)', fontSize: '12px' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: 'linear-gradient(135deg, #60a5fa, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'white' }}>
                          {getInitials(dept.manager.full_name)}
                        </div>
                        <span style={{ color: 'var(--chronos-text)', fontWeight: 500 }}>{dept.manager.full_name}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', fontStyle: 'italic' }}>No manager</span>
                    )}

                    {isAdmin && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); openEditModal(dept) }}
                          title="Edit department"
                          style={{ background: 'none', border: '1px solid var(--chronos-border)', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#34d399'; e.currentTarget.style.borderColor = '#34d399' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--chronos-text-muted)'; e.currentTarget.style.borderColor = 'var(--chronos-border)' }}
                        >
                          <Pencil size={11} />Edit
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); openManagerModal(dept) }}
                          title="Change manager"
                          style={{ background: 'none', border: '1px solid var(--chronos-border)', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--chronos-accent)'; e.currentTarget.style.borderColor = 'var(--chronos-accent)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--chronos-text-muted)'; e.currentTarget.style.borderColor = 'var(--chronos-border)' }}
                        >
                          <UserCog size={12} />Manager
                        </button>
                      </>
                    )}
                  </div>

                  {isExpanded
                    ? <ChevronDown size={14} style={{ color: 'var(--chronos-text-muted)', flexShrink: 0 }} />
                    : <ChevronRight size={14} style={{ color: 'var(--chronos-text-muted)', flexShrink: 0 }} />}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--chronos-border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderBottom: '1px solid var(--chronos-border)' }}>

                      {/* Members */}
                      <div style={{ padding: '16px 20px', borderRight: '1px solid var(--chronos-border)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--chronos-text-muted)', letterSpacing: '0.06em', marginBottom: '12px', textTransform: 'uppercase' }}>
                          Members ({deptMembers.length})
                        </div>
                        {deptMembers.length === 0 ? (
                          <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', fontStyle: 'italic' }}>No members assigned. Assign via Team page.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {deptMembers.map(m => (
                              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                                  {getInitials(m.full_name)}
                                </div>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text)' }}>{m.full_name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', textTransform: 'capitalize' }}>{m.role}</div>
                                </div>
                                {m.manager_id && (() => {
                                  const mgr = members.find(x => x.id === m.manager_id)
                                  return mgr ? (
                                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--chronos-text-muted)' }}>
                                      → {mgr.full_name}
                                    </span>
                                  ) : null
                                })()}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Task Types */}
                      <div style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--chronos-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            Task Types ({deptTaskTypes.length})
                          </div>
                          {canEditTasks && (
                            <button
                              onClick={() => openTaskTypeModal(dept)}
                              style={{ background: 'none', border: '1px solid var(--chronos-border)', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '3px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--chronos-accent)'; e.currentTarget.style.borderColor = 'var(--chronos-accent)' }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--chronos-text-muted)'; e.currentTarget.style.borderColor = 'var(--chronos-border)' }}
                            >
                              <Plus size={11} />Add
                            </button>
                          )}
                        </div>
                        {deptTaskTypes.length === 0 ? (
                          <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', fontStyle: 'italic' }}>No task types.{canEditTasks ? ' Add one above.' : ''}</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {deptTaskTypes.map(tt => (
                              <div
                                key={tt.id}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                              >
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--chronos-accent)', flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', color: 'var(--chronos-text)', flex: 1 }}>{tt.name}</span>
                                {canEditTasks && (
                                  <div style={{ display: 'flex', gap: '2px' }}>
                                    <button
                                      onClick={() => openEditTaskType(tt)}
                                      title="Edit task type"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '3px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                                      onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-accent)'}
                                      onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                                    >
                                      <Pencil size={11} />
                                    </button>
                                    <button
                                      onClick={() => deleteTaskType(tt.id, tt.name, dept.name)}
                                      title="Delete task type"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '3px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                                      onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-danger)'}
                                      onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create Department Modal (admin only) ── */}
      <Modal isOpen={createModal} onClose={() => setCreateModal(false)} title="Create Department" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Department Code *">
            <input className="input-base" placeholder="e.g. DESIGN" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
            <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>Short identifier, e.g. DESIGN or FINANCE. Will be uppercased.</p>
          </FormField>
          <FormField label="Display Name *">
            <input className="input-base" placeholder="e.g. Design & UX" value={createForm.display_name} onChange={e => setCreateForm(f => ({ ...f, display_name: e.target.value }))} />
            <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>Full readable name shown throughout the app.</p>
          </FormField>
          <FormField label="Description">
            <input className="input-base" placeholder="Optional — what this department does" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} />
          </FormField>
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '12px', color: 'var(--chronos-accent)' }}>
            After creating a department you can assign a manager and add task types by expanding the row.
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setCreateModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>{creating ? 'Creating…' : 'Create Department'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Department Modal (admin only) ── */}
      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)} title={`Edit Department — ${editModal?.name}`} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Department Code *">
            <input className="input-base" placeholder="e.g. DESIGN" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>Changing this code will update it everywhere it is used (profiles, task types).</p>
          </FormField>
          <FormField label="Display Name *">
            <input className="input-base" placeholder="e.g. Design & UX" value={editForm.display_name} onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <input className="input-base" placeholder="Optional — what this department does" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
          </FormField>
          {editForm.name.toUpperCase() !== editModal?.name && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.3)', fontSize: '12px', color: '#fbbf24' }}>
              ⚠ Renaming the department code from <strong>{editModal?.name}</strong> to <strong>{editForm.name.toUpperCase()}</strong> will cascade to all profiles and task types that use this department.
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={handleEdit} disabled={editing}>{editing ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Manager Modal (admin only) ── */}
      <Modal isOpen={!!managerModal} onClose={() => setManagerModal(null)} title={`Set Manager — ${managerModal?.name}`} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>
            Select the manager for the <strong>{managerModal?.name}</strong> department. Only users with Manager or Admin role are listed. A single person can manage multiple departments.
          </p>
          <FormField label="Department Manager">
            <Select value={selectedManager} onChange={v => setSelectedManager(v)} options={managerOptions} placeholder="Select manager…" />
          </FormField>
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '12px', color: 'var(--chronos-accent)' }}>
            Note: This sets the department's responsible manager. Individual employees' direct line managers are managed separately on the Team page.
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setManagerModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={saveManager} disabled={savingManager}>{savingManager ? 'Saving…' : 'Set Manager'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Add Task Type Modal ── */}
      <Modal isOpen={!!taskTypeModal} onClose={() => setTaskTypeModal(null)} title={`Add Task Type — ${taskTypeModal?.name}`} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Task Type Name *">
            <input className="input-base" placeholder="e.g. Client Workshops" value={newTaskName} onChange={e => setNewTaskName(e.target.value)} autoFocus />
          </FormField>
          <FormField label="Description">
            <input className="input-base" placeholder="Optional description" value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setTaskTypeModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={saveTaskType} disabled={savingTask}>{savingTask ? 'Adding…' : 'Add Task Type'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Task Type Modal ── */}
      <Modal isOpen={!!editTaskTypeModal} onClose={() => setEditTaskTypeModal(null)} title="Edit Task Type" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Task Type Name *">
            <input className="input-base" placeholder="e.g. Client Workshops" value={editTaskName} onChange={e => setEditTaskName(e.target.value)} autoFocus />
          </FormField>
          <FormField label="Description">
            <input className="input-base" placeholder="Optional description" value={editTaskDesc} onChange={e => setEditTaskDesc(e.target.value)} />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setEditTaskTypeModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={saveEditTaskType} disabled={savingEditTask}>{savingEditTask ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
