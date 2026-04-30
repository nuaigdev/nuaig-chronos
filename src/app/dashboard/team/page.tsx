'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Profile, Department, DEPARTMENTS, DEPARTMENT_LABELS } from '@/types'
import { EmptyState, Modal, FormField, Select } from '@/components/ui'
import { getRoleColor, getInitials } from '@/utils'
import { Users, Search, Edit2, UserCheck, UserX, UserPlus, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'

const supabase = createClient()

const DEPARTMENT_OPTIONS = [
  { value: '', label: 'No department' },
  ...DEPARTMENTS.map(d => ({ value: d, label: `${d} — ${DEPARTMENT_LABELS[d]}` })),
]

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'employee', label: 'Employee' },
]

type ModalMode = 'edit' | 'add' | 'password'

export default function TeamPage() {
  const { profile, isAdmin } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode | null>(null)
  const [editMember, setEditMember] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)

  const [editForm, setEditForm] = useState({ full_name: '', role: 'employee', department: '' })
  const [addForm, setAddForm] = useState({ full_name: '', email: '', password: '', role: 'employee', department: '' })
  const [pwForm, setPwForm] = useState({ password: '', confirm: '' })

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('profiles').select('*').order('full_name')
    if (roleFilter) query = query.eq('role', roleFilter)
    const { data } = await query
    setMembers((data || []) as unknown as Profile[])
    setLoading(false)
  }, [roleFilter])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  // ── Edit member ─────────────────────────────────────────────────────────

  const openEdit = (m: Profile) => {
    setEditMember(m)
    setEditForm({ full_name: m.full_name, role: m.role, department: m.department || '' })
    setModalMode('edit')
  }

  const handleEdit = async () => {
    if (!editMember) return
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: editForm.full_name,
        role: editForm.role as Profile['role'],
        department: (editForm.department as Department) || null,
      }).eq('id', editMember.id)
      if (error) throw error
      toast.success('Member updated!')
      setModalMode(null)
      fetchMembers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  // ── Add member ──────────────────────────────────────────────────────────

  const openAdd = () => {
    setAddForm({ full_name: '', email: '', password: '', role: 'employee', department: '' })
    setModalMode('add')
  }

  const handleAdd = async () => {
    if (!addForm.full_name.trim()) { toast.error('Enter full name'); return }
    if (!addForm.email.trim() || !addForm.email.includes('@')) { toast.error('Enter a valid email'); return }
    if (!addForm.password || addForm.password.length < 6) { toast.error('Password must be at least 6 characters'); return }

    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('admin_create_user', {
        user_email: addForm.email.trim().toLowerCase(),
        user_password: addForm.password,
        user_name: addForm.full_name.trim(),
        user_role: addForm.role,
        user_dept: (addForm.department as Department) || null,
      })

      if (error) throw error
      if (data && !data.success) throw new Error(data.error)

      toast.success(`${addForm.full_name} added successfully!`)
      setModalMode(null)
      fetchMembers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  // ── Password reset ──────────────────────────────────────────────────────

  const openPasswordReset = (m: Profile) => {
    setEditMember(m)
    setPwForm({ password: '', confirm: '' })
    setModalMode('password')
  }

  const handlePasswordReset = async () => {
    if (!editMember) return
    if (!pwForm.password || pwForm.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (pwForm.password !== pwForm.confirm) { toast.error('Passwords do not match'); return }

    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('admin_reset_user_password', {
        target_user_id: editMember.id,
        new_password: pwForm.password,
      })
      if (error) throw error
      if (data && !data.success) throw new Error(data.error)
      toast.success(`Password reset for ${editMember.full_name}`)
      setModalMode(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ───────────────────────────────────────────────────────

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('profiles').update({ is_active: !current }).eq('id', id)
    toast.success(`Member ${!current ? 'activated' : 'deactivated'}`)
    fetchMembers()
  }

  // ── Derived ─────────────────────────────────────────────────────────────

  const filtered = members.filter(m =>
    m.full_name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.department?.toLowerCase().includes(search.toLowerCase())
  )

  const byRole = {
    admin: filtered.filter(m => m.role === 'admin'),
    manager: filtered.filter(m => m.role === 'manager'),
    employee: filtered.filter(m => m.role === 'employee'),
  }

  const managers = members.filter(m => m.role === 'manager' || m.role === 'admin')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Team</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>{filtered.length} member{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserPlus size={14} />Add Member
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Admins', count: byRole.admin.length, color: '#a78bfa' },
          { label: 'Managers', count: byRole.manager.length, color: '#60a5fa' },
          { label: 'Employees', count: byRole.employee.length, color: '#34d399' },
        ].map(s => (
          <div key={s.label} className="card-base" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--chronos-text-muted)' }} />
          <input className="input-base" style={{ paddingLeft: '36px' }} placeholder="Search members..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-base" style={{ width: 'auto' }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="employee">Employee</option>
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users size={28} />} title="No team members found" description="Adjust your search or filters." />
      ) : (
        <div className="card-base" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--chronos-border)' }}>
                {['Member', 'Role', 'Department', 'Manager', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text-muted)', fontFamily: 'DM Sans, sans-serif' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const manager = members.find(x => x.id === m.manager_id)
                const deptLabel = m.department ? `${m.department} — ${DEPARTMENT_LABELS[m.department as Department] || m.department}` : '—'
                return (
                  <tr key={m.id} className="table-row">
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'white', fontFamily: 'Syne, sans-serif', flexShrink: 0 }}>
                          {getInitials(m.full_name)}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--chronos-text)' }}>{m.full_name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={`status-badge ${getRoleColor(m.role)}`} style={{ textTransform: 'capitalize' }}>{m.role}</span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{deptLabel}</td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{manager?.full_name || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: '12px', color: m.is_active ? 'var(--chronos-success)' : 'var(--chronos-text-muted)' }}>
                        {m.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {isAdmin && m.id !== profile?.id && (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => openEdit(m)}
                            title="Edit member"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-text)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          ><Edit2 size={13} /></button>
                          <button
                            onClick={() => openPasswordReset(m)}
                            title="Reset password"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-warning)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          ><KeyRound size={13} /></button>
                          <button
                            onClick={() => toggleActive(m.id, m.is_active)}
                            title={m.is_active ? 'Deactivate' : 'Activate'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: m.is_active ? 'var(--chronos-text-muted)' : 'var(--chronos-success)' }}
                            onMouseEnter={e => e.currentTarget.style.color = m.is_active ? 'var(--chronos-danger)' : 'var(--chronos-success)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          >
                            {m.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Modal ── */}
      <Modal isOpen={modalMode === 'edit'} onClose={() => setModalMode(null)} title="Edit Member" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Full Name">
            <input className="input-base" value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
          </FormField>
          <FormField label="Role">
            <Select value={editForm.role} onChange={v => setEditForm(f => ({ ...f, role: v }))} options={ROLE_OPTIONS} />
          </FormField>
          <FormField label="Department">
            <Select
              value={editForm.department}
              onChange={v => setEditForm(f => ({ ...f, department: v }))}
              options={DEPARTMENT_OPTIONS}
              placeholder="Select department…"
            />
          </FormField>
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', fontSize: '12px', color: 'var(--chronos-warning)' }}>
            Manager assignment is controlled via the Departments page.
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
            <button className="btn-primary" onClick={handleEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Add Member Modal ── */}
      <Modal isOpen={modalMode === 'add'} onClose={() => setModalMode(null)} title="Add Team Member" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Full Name *">
            <input className="input-base" placeholder="Jane Smith" value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))} />
          </FormField>
          <FormField label="Email *">
            <input className="input-base" type="email" placeholder="jane@company.com" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
          </FormField>
          <FormField label="Password *">
            <input className="input-base" type="password" placeholder="Min 6 characters" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
          </FormField>
          <FormField label="Role">
            <Select value={addForm.role} onChange={v => setAddForm(f => ({ ...f, role: v }))} options={ROLE_OPTIONS} />
          </FormField>
          <FormField label="Department">
            <Select
              value={addForm.department}
              onChange={v => setAddForm(f => ({ ...f, department: v }))}
              options={DEPARTMENT_OPTIONS}
              placeholder="Select department…"
            />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
            <button className="btn-primary" onClick={handleAdd} disabled={saving}>{saving ? 'Creating…' : 'Create Member'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Password Reset Modal ── */}
      <Modal isOpen={modalMode === 'password'} onClose={() => setModalMode(null)} title={`Reset Password — ${editMember?.full_name}`} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', fontSize: '12px', color: 'var(--chronos-danger)' }}>
            This will immediately change the user's password. They will need to use the new password on their next login.
          </div>
          <FormField label="New Password *">
            <input className="input-base" type="password" placeholder="Min 6 characters" value={pwForm.password} onChange={e => setPwForm(f => ({ ...f, password: e.target.value }))} />
          </FormField>
          <FormField label="Confirm Password *">
            <input className="input-base" type="password" placeholder="Re-enter password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
            <button
              className="btn-primary"
              style={{ background: 'linear-gradient(135deg, #f87171, #ef4444)' }}
              onClick={handlePasswordReset}
              disabled={saving}
            >
              {saving ? 'Resetting…' : 'Reset Password'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
