'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Profile } from '@/types'
import { EmptyState, Modal, FormField, Select } from '@/components/ui'
import { getRoleColor, getInitials } from '@/utils'
import { Users, Plus, Search, Edit2, UserCheck, UserX } from 'lucide-react'
import toast from 'react-hot-toast'

const supabase = createClient()

export default function TeamPage() {
  const { profile, isAdmin } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editMember, setEditMember] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'employee', department: '', manager_id: '' })

  useEffect(() => { fetchMembers() }, [roleFilter])

  const fetchMembers = async () => {
    setLoading(true)
    let query = supabase.from('profiles').select('*').order('full_name')
    if (roleFilter) query = query.eq('role', roleFilter)
    const { data } = await query
    setMembers((data || []) as unknown as Profile[])
    setLoading(false)
  }

  const openEdit = (m: Profile) => {
    setEditMember(m)
    setForm({ full_name: m.full_name, email: m.email, role: m.role, department: m.department || '', manager_id: m.manager_id || '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!editMember) return
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: form.full_name,
        role: form.role as Profile['role'],
        department: form.department || null,
        manager_id: form.manager_id || null,
      }).eq('id', editMember.id)
      if (error) throw error
      toast.success('Member updated!')
      setShowModal(false)
      fetchMembers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('profiles').update({ is_active: !current }).eq('id', id)
    toast.success(`Member ${!current ? 'activated' : 'deactivated'}`)
    fetchMembers()
  }

  const managers = members.filter(m => m.role === 'manager' || m.role === 'admin')

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Team</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>{filtered.length} member{filtered.length !== 1 ? 's' : ''}</p>
        </div>
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
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{m.department || '—'}</td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{manager?.full_name || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: '12px', color: m.is_active ? 'var(--chronos-success)' : 'var(--chronos-text-muted)' }}>
                        {m.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {isAdmin && m.id !== profile?.id && (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button onClick={() => openEdit(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-text)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          ><Edit2 size={13} /></button>
                          <button onClick={() => toggleActive(m.id, m.is_active)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: m.is_active ? 'var(--chronos-text-muted)' : 'var(--chronos-success)' }}
                            onMouseEnter={e => e.currentTarget.style.color = m.is_active ? 'var(--chronos-danger)' : 'var(--chronos-success)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                            title={m.is_active ? 'Deactivate' : 'Activate'}
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

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Edit Member" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Full Name">
            <input className="input-base" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </FormField>
          <FormField label="Role">
            <Select value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} options={[{ value: 'admin', label: 'Admin' }, { value: 'manager', label: 'Manager' }, { value: 'employee', label: 'Employee' }]} />
          </FormField>
          <FormField label="Department">
            <input className="input-base" placeholder="e.g. Engineering" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
          </FormField>
          <FormField label="Manager">
            <Select value={form.manager_id} onChange={v => setForm(f => ({ ...f, manager_id: v }))} options={managers.filter(m => m.id !== editMember?.id).map(m => ({ value: m.id, label: m.full_name }))} placeholder="No manager" />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>Save Changes</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
