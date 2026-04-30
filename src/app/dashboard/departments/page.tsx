'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Profile, Department, DEPARTMENT_LABELS, TaskType } from '@/types'
import { EmptyState, Modal, FormField, Select } from '@/components/ui'
import { getInitials } from '@/utils'
import { Building2, Users, ChevronDown, ChevronRight, UserCog, Plus, Tag, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

const supabase = createClient()

interface DeptRow {
  id: string
  name: Department
  display_name: string
  description: string | null
  manager_id: string | null
  is_active: boolean
  manager?: Profile
}

interface DeptMember extends Profile {
  // member of this department
}

export default function DepartmentsPage() {
  const { isAdmin, profileReady } = useAuth()
  const router = useRouter()

  const [departments, setDepartments] = useState<DeptRow[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Manager modal
  const [managerModal, setManagerModal] = useState<DeptRow | null>(null)
  const [selectedManager, setSelectedManager] = useState('')
  const [savingManager, setSavingManager] = useState(false)

  // Add task type modal
  const [taskTypeModal, setTaskTypeModal] = useState<DeptRow | null>(null)
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [savingTask, setSavingTask] = useState(false)

  // Redirect non-admins
  useEffect(() => {
    if (profileReady && !isAdmin) router.replace('/dashboard')
  }, [profileReady, isAdmin, router])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: depts }, { data: profs }, { data: tt }] = await Promise.all([
      supabase
        .from('departments')
        .select('*, manager:profiles!departments_manager_id_fkey(id, full_name, email, role, department, is_active, created_at, updated_at)')
        .order('name'),
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('task_types').select('*').order('department').order('sort_order'),
    ])
    setDepartments((depts || []) as unknown as DeptRow[])
    setMembers((profs || []) as unknown as Profile[])
    setTaskTypes((tt || []) as unknown as TaskType[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!profileReady || !isAdmin) return
    fetchData()
  }, [profileReady, isAdmin, fetchData])

  // ── Manager assignment ────────────────────────────────────────────────────

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

  const toggleTaskType = async (id: string, current: boolean) => {
    await supabase.from('task_types').update({ is_active: !current }).eq('id', id)
    toast.success(current ? 'Task type deactivated' : 'Task type activated')
    fetchData()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const managerOptions = [
    { value: '', label: 'No manager' },
    ...members
      .filter(m => m.role === 'manager' || m.role === 'admin')
      .map(m => ({ value: m.id, label: `${m.full_name} (${m.role})` })),
  ]

  const getDeptMembers = (deptName: Department): DeptMember[] =>
    members.filter(m => m.department === deptName)

  const getDeptTaskTypes = (deptName: Department): TaskType[] =>
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
      <div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Departments</h1>
        <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>
          Manage department structure, managers, members and task types
        </p>
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
          <div style={{ fontSize: '24px', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#a78bfa' }}>{taskTypes.filter(t => t.is_active).length}</div>
          <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>Active Task Types</div>
        </div>
      </div>

      {departments.length === 0 ? (
        <EmptyState icon={<Building2 size={28} />} title="No departments found" description="Run migration 008 to seed department rows." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {departments.map(dept => {
            const deptMembers = getDeptMembers(dept.name)
            const deptTaskTypes = getDeptTaskTypes(dept.name)
            const isExpanded = expanded === dept.id

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
                      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>— {DEPARTMENT_LABELS[dept.name] || dept.display_name}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '3px', display: 'flex', gap: '14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={11} />{deptMembers.length} member{deptMembers.length !== 1 ? 's' : ''}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Tag size={11} />{deptTaskTypes.filter(t => t.is_active).length} task types
                      </span>
                    </div>
                  </div>

                  {/* Manager chip */}
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
                    <button
                      onClick={e => { e.stopPropagation(); openManagerModal(dept) }}
                      title="Change manager"
                      style={{ background: 'none', border: '1px solid var(--chronos-border)', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--chronos-accent)'; e.currentTarget.style.borderColor = 'var(--chronos-accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--chronos-text-muted)'; e.currentTarget.style.borderColor = 'var(--chronos-border)' }}
                    >
                      <UserCog size={12} />Manager
                    </button>
                  </div>

                  {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--chronos-text-muted)', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: 'var(--chronos-text-muted)', flexShrink: 0 }} />}
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
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Task Types */}
                      <div style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--chronos-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            Task Types ({deptTaskTypes.filter(t => t.is_active).length} active)
                          </div>
                          <button
                            onClick={() => openTaskTypeModal(dept)}
                            style={{ background: 'none', border: '1px solid var(--chronos-border)', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '3px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--chronos-accent)'; e.currentTarget.style.borderColor = 'var(--chronos-accent)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--chronos-text-muted)'; e.currentTarget.style.borderColor = 'var(--chronos-border)' }}
                          >
                            <Plus size={11} />Add
                          </button>
                        </div>
                        {deptTaskTypes.length === 0 ? (
                          <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', fontStyle: 'italic' }}>No task types. Add one above.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {deptTaskTypes.map(tt => (
                              <div key={tt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: tt.is_active ? 'var(--chronos-success)' : 'var(--chronos-text-muted)', flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', color: tt.is_active ? 'var(--chronos-text)' : 'var(--chronos-text-muted)', flex: 1, textDecoration: tt.is_active ? 'none' : 'line-through' }}>{tt.name}</span>
                                <button
                                  onClick={() => toggleTaskType(tt.id, tt.is_active)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '2px', fontSize: '11px' }}
                                  title={tt.is_active ? 'Deactivate' : 'Activate'}
                                  onMouseEnter={e => e.currentTarget.style.color = tt.is_active ? 'var(--chronos-danger)' : 'var(--chronos-success)'}
                                  onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                                >
                                  <Pencil size={11} />
                                </button>
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

      {/* ── Manager Modal ── */}
      <Modal isOpen={!!managerModal} onClose={() => setManagerModal(null)} title={`Set Manager — ${managerModal?.name}`} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>
            Select the manager for the <strong>{managerModal?.name}</strong> department. Only users with Manager or Admin role are listed.
          </p>
          <FormField label="Department Manager">
            <Select
              value={selectedManager}
              onChange={v => setSelectedManager(v)}
              options={managerOptions}
              placeholder="Select manager…"
            />
          </FormField>
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '12px', color: 'var(--chronos-accent)' }}>
            Note: This sets the department's manager. Individual employees' direct managers are managed separately on the Team page (manager_id on the profile).
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setManagerModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={saveManager} disabled={savingManager}>{savingManager ? 'Saving…' : 'Set Manager'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Task Type Modal ── */}
      <Modal isOpen={!!taskTypeModal} onClose={() => setTaskTypeModal(null)} title={`Add Task Type — ${taskTypeModal?.name}`} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Task Type Name *">
            <input
              className="input-base"
              placeholder="e.g. Client Workshops"
              value={newTaskName}
              onChange={e => setNewTaskName(e.target.value)}
            />
          </FormField>
          <FormField label="Description">
            <input
              className="input-base"
              placeholder="Optional description"
              value={newTaskDesc}
              onChange={e => setNewTaskDesc(e.target.value)}
            />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setTaskTypeModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={saveTaskType} disabled={savingTask}>{savingTask ? 'Adding…' : 'Add Task Type'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
