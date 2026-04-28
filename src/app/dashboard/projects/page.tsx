'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Project } from '@/types'
import { StatusBadge, EmptyState, SectionHeader, Modal, FormField, Select, ProgressBar } from '@/components/ui'
import { formatDate, formatHours, getInitials } from '@/utils'
import { FolderKanban, Plus, Search, Archive, Edit2, Users, Clock } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'

const supabase = createClient()

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [showModal, setShowModal] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [form, setForm] = useState({ name: '', description: '', client_id: '', start_date: '', end_date: '', estimated_hours: '', budget: '' })
  const [saving, setSaving] = useState(false)
  const { profile, canManageProjects } = useAuth()

  useEffect(() => {
    if (!profile) return
    fetchProjects(profile.id, canManageProjects)
    fetchClients()
  }, [statusFilter, profile?.id, canManageProjects])

  const fetchProjects = async (profileId: string, canManage: boolean) => {
    setLoading(true)

    let query = supabase
      .from('projects')
      .select(`*, client:clients(id, name), project_members(user_id)`)
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)

    if (!canManage) {
      const { data: myProjs } = await supabase.from('project_members').select('project_id').eq('user_id', profileId)
      const ids = myProjs?.map(p => p.project_id) || []
      if (ids.length > 0) query = query.in('id', ids)
      else { setProjects([]); setLoading(false); return }
    }

    const { data, error } = await query
    if (error) { toast.error('Failed to load projects'); setLoading(false); return }

    const projectData = (data || []) as unknown as Array<Project & { project_members: { user_id: string }[] }>

    // Batch-fetch member profiles separately (no direct FK from project_members to profiles)
    const seen = new Set<string>()
    const allUserIds: string[] = []
    for (const p of projectData) for (const m of (p.project_members || [])) { if (!seen.has(m.user_id)) { seen.add(m.user_id); allUserIds.push(m.user_id) } }
    const profileMap: Record<string, { full_name: string; avatar_url: string | null }> = {}
    if (allUserIds.length > 0) {
      const { data: memberProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', allUserIds)
      for (const p of (memberProfiles || [])) {
        profileMap[p.id] = { full_name: p.full_name as string, avatar_url: p.avatar_url as string | null }
      }
    }

    const enriched = projectData.map(p => ({
      ...p,
      project_members: (p.project_members || []).map(m => ({
        ...m,
        user: profileMap[m.user_id] ?? { full_name: 'Unknown', avatar_url: null },
      })),
    }))

    setProjects(enriched as unknown as Project[])
    setLoading(false)
  }

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('id, name').eq('is_active', true).order('name')
    setClients(data || [])
  }

  const openCreate = () => {
    setEditProject(null)
    setForm({ name: '', description: '', client_id: '', start_date: '', end_date: '', estimated_hours: '', budget: '' })
    setShowModal(true)
  }

  const openEdit = (p: Project) => {
    setEditProject(p)
    setForm({
      name: p.name,
      description: p.description || '',
      client_id: p.client_id || '',
      start_date: p.start_date || '',
      end_date: p.end_date || '',
      estimated_hours: p.estimated_hours?.toString() || '',
      budget: p.budget?.toString() || '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Project name is required'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        client_id: form.client_id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
        budget: form.budget ? parseFloat(form.budget) : null,
      }
      if (editProject) {
        const { error } = await supabase.from('projects').update(payload).eq('id', editProject.id)
        if (error) throw error
        toast.success('Project updated!')
      } else {
        const { error } = await supabase.from('projects').insert({ ...payload, created_by: profile!.id })
        if (error) throw error
        toast.success('Project created!')
      }
      setShowModal(false)
      if (profile) fetchProjects(profile.id, canManageProjects)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error saving project')
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (id: string) => {
    if (!confirm('Archive this project?')) return
    await supabase.from('projects').update({ status: 'archived' }).eq('id', id)
    toast.success('Project archived')
    if (profile) fetchProjects(profile.id, canManageProjects)
  }

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client as { name: string } | undefined)?.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Projects</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>{filtered.length} project{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {canManageProjects && (
          <button className="btn-primary" onClick={openCreate}><Plus size={14} />New Project</button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '360px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--chronos-text-muted)' }} />
          <input className="input-base" style={{ paddingLeft: '36px' }} placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {(['all', 'active', 'completed', 'archived'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
            border: statusFilter === s ? '1px solid var(--chronos-accent)' : '1px solid var(--chronos-border)',
            background: statusFilter === s ? 'var(--chronos-accent-glow)' : 'var(--chronos-surface)',
            color: statusFilter === s ? 'var(--chronos-accent)' : 'var(--chronos-text-muted)',
            transition: 'all 0.15s'
          }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={28} />}
          title="No projects found"
          description={canManageProjects ? "Create your first project to start tracking time." : "You haven't been assigned to any projects yet."}
          action={canManageProjects ? <button className="btn-primary" onClick={openCreate}><Plus size={14} />Create Project</button> : undefined}
        />
      ) : (
        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filtered.map(p => {
            const members = (p.project_members as { user: { full_name: string } }[] | undefined) || []
            const client = p.client as { name: string } | undefined
            return (
              <div key={p.id} className="card-base card-hover" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/dashboard/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                      <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, color: 'var(--chronos-text)', marginBottom: '4px', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-accent)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text)'}
                      >{p.name}</h3>
                    </Link>
                    {client && <p style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{client.name}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                    <StatusBadge status={p.status} />
                    {canManageProjects && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '6px' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-text)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                        ><Edit2 size={13} /></button>
                        {p.status === 'active' && (
                          <button onClick={() => handleArchive(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '6px' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-warning)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          ><Archive size={13} /></button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {p.description && (
                  <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {p.description}
                  </p>
                )}

                {p.estimated_hours && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--chronos-text-muted)', marginBottom: '5px' }}>
                      <span>Progress</span>
                      <span>{formatHours(0)} / {formatHours(p.estimated_hours)}</span>
                    </div>
                    <ProgressBar value={0} max={p.estimated_hours} />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--chronos-border)', paddingTop: '10px' }}>
                  <div style={{ display: 'flex' }}>
                    {members.slice(0, 4).map((m, i) => (
                      <div key={i} style={{
                        width: '24px', height: '24px', borderRadius: '6px',
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '9px', fontWeight: 700, color: 'white',
                        marginLeft: i > 0 ? '-6px' : '0',
                        border: '2px solid var(--chronos-surface)',
                        fontFamily: 'Syne, sans-serif'
                      }}>
                        {getInitials(m.user.full_name)}
                      </div>
                    ))}
                    {members.length > 4 && (
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'var(--chronos-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--chronos-text-muted)', marginLeft: '-6px', border: '2px solid var(--chronos-surface)' }}>
                        +{members.length - 4}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--chronos-text-muted)' }}>
                    {p.end_date && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={11} />{formatDate(p.end_date)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editProject ? 'Edit Project' : 'New Project'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormField label="Project Name" required>
            <input className="input-base" placeholder="e.g. Website Redesign" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <textarea className="input-base" placeholder="Brief project description..." rows={3} style={{ resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </FormField>
          <FormField label="Client">
            <Select value={form.client_id} onChange={v => setForm(f => ({ ...f, client_id: v }))} options={clients.map(c => ({ value: c.id, label: c.name }))} placeholder="Select client" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Start Date">
              <input type="date" className="input-base" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </FormField>
            <FormField label="End Date">
              <input type="date" className="input-base" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Estimated Hours">
              <input type="number" min="0" step="0.5" className="input-base" placeholder="e.g. 200" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))} />
            </FormField>
            <FormField label="Budget ($)">
              <input type="number" min="0" className="input-base" placeholder="e.g. 50000" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} />
            </FormField>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving && <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3"/><path d="M12 3a9 9 0 019 9"/></svg>}
              {editProject ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
