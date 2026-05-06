'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Client } from '@/types'
import { EmptyState, Modal, FormField, SectionHeader } from '@/components/ui'
import { Building2, Plus, Search, Edit2, Globe, Phone, Mail, ToggleLeft, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { handleAuthError } from '@/utils/auth-error'

const supabase = createClient()

export default function ClientsPage() {
  const { profile, canManageProjects } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', website: '', industry: '', notes: '' })

  useEffect(() => { fetchClients() }, [])

  const fetchClients = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('clients').select('*').order('name')
    if (handleAuthError(error)) { setLoading(false); return }
    setClients((data || []) as unknown as Client[])
    setLoading(false)
  }

  const openCreate = () => {
    setEditClient(null)
    setForm({ name: '', email: '', phone: '', address: '', website: '', industry: '', notes: '' })
    setShowModal(true)
  }

  const openEdit = (c: Client) => {
    setEditClient(c)
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '', website: c.website || '', industry: c.industry || '', notes: c.notes || '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Client name is required'); return }
    setSaving(true)
    try {
      if (editClient) {
        const { error } = await supabase.from('clients').update({ ...form }).eq('id', editClient.id)
        if (error) throw error
        toast.success('Client updated!')
      } else {
        const { error } = await supabase.from('clients').insert({ ...form, created_by: profile!.id, company_id: profile!.company_id })
        if (error) throw error
        toast.success('Client created!')
      }
      setShowModal(false)
      fetchClients()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: Client) => {
    if (!confirm(`Delete client "${c.name}"? This cannot be undone.`)) return
    setDeletingId(c.id)
    try {
      const { error } = await supabase.from('clients').delete().eq('id', c.id)
      if (error) throw error
      toast.success('Client deleted')
      fetchClients()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete client')
    } finally {
      setDeletingId(null)
    }
  }

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('clients').update({ is_active: !current }).eq('id', id)
    toast.success(`Client ${!current ? 'activated' : 'deactivated'}`)
    fetchClients()
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.industry?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Clients</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>{filtered.length} client{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {canManageProjects && (
          <button className="btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <Plus size={14} />New Client
          </button>
        )}
      </div>

      <div style={{ position: 'relative', maxWidth: '360px' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--chronos-text-muted)' }} />
        <input className="input-base" style={{ paddingLeft: '36px' }} placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Building2 size={28} />} title="No clients yet" description="Add your first client to associate them with projects." action={canManageProjects ? <button className="btn-primary" onClick={openCreate}><Plus size={14} />New Client</button> : undefined} />
      ) : (
        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {filtered.map(c => (
            <div key={c.id} className="card-base card-hover" style={{ padding: '20px', opacity: c.is_active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 800, fontFamily: 'Syne, sans-serif', color: 'var(--chronos-accent)' }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '15px' }}>{c.name}</div>
                    {c.industry && <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{c.industry}</div>}
                  </div>
                </div>
                {/* Edit / Delete — admin & manager only */}
                {canManageProjects && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => openEdit(c)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-text)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                      title="Edit client"
                    ><Edit2 size={13} /></button>
                    <button
                      onClick={() => toggleActive(c.id, c.is_active)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.is_active ? 'var(--chronos-success)' : 'var(--chronos-text-muted)', padding: '4px' }}
                      title={c.is_active ? 'Deactivate' : 'Activate'}
                    ><ToggleLeft size={13} /></button>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={deletingId === c.id}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-danger, #ef4444)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                      title="Delete client"
                    ><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {c.email && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--chronos-text-muted)' }}><Mail size={12} />{c.email}</div>}
                {c.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--chronos-text-muted)' }}><Phone size={12} />{c.phone}</div>}
                {c.website && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--chronos-text-muted)' }}><Globe size={12} /><a href={c.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--chronos-accent)', textDecoration: 'none' }}>{c.website.replace('https://', '')}</a></div>}
              </div>
              {!c.is_active && <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--chronos-text-muted)', fontStyle: 'italic' }}>Inactive</div>}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editClient ? 'Edit Client' : 'New Client'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Client Name" required>
            <input className="input-base" placeholder="Acme Corporation" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Email">
              <input type="email" className="input-base" placeholder="contact@acme.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </FormField>
            <FormField label="Phone">
              <input className="input-base" placeholder="+1 555-000-0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Industry">
              <input className="input-base" placeholder="e.g. Technology" value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} />
            </FormField>
            <FormField label="Website">
              <input className="input-base" placeholder="https://acme.com" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Address">
            <input className="input-base" placeholder="123 Main St, City, State" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </FormField>
          <FormField label="Notes">
            <textarea className="input-base" rows={2} placeholder="Internal notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{editClient ? 'Save' : 'Create Client'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
