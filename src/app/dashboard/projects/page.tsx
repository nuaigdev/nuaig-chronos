'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Project, Profile } from '@/types'
import { StatusBadge, EmptyState, Modal, FormField, Select, ProgressBar } from '@/components/ui'
import { formatDate, formatHours, getInitials } from '@/utils'
import { FolderKanban, Plus, Search, Archive, Edit2, Clock, Users, UserPlus, X, Trash2 } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'

const supabase = createClient()

export default function ProjectsPage() {
  const { profile, profileReady, canManageProjects, isAdmin } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [showModal, setShowModal] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [form, setForm] = useState({ name: '', description: '', client_id: '', start_date: '', end_date: '', estimated_hours: '', budget: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Member management
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [membersProjectId, setMembersProjectId] = useState('')
  const [membersProjectName, setMembersProjectName] = useState('')
  const [membersProjectCreatedBy, setMembersProjectCreatedBy] = useState('')
  const [projectMembers, setProjectMembers] = useState<Profile[]>([])
  const [availableToAdd, setAvailableToAdd] = useState<Profile[]>([])
  const [memberToAdd, setMemberToAdd] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Gate on profileReady so canManageProjects is accurate before fetching.
  // Previously [profile?.id] fired while profile was null, causing an early
  // return and an infinite loading spinner for managers and admins.
  useEffect(() => {
    if (!profileReady || !profile) return
    fetchProjects(profile.id, canManageProjects)
    fetchClients()
  }, [profileReady, statusFilter, profile?.id, canManageProjects])

  const fetchProjects = async (profileId: string, canManage: boolean) => {
    setLoading(true)
    let query = supabase
      .from('projects')
      .select(`*, client:clients(id, name), project_members(user_id), created_by`)
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

    // Batch-fetch member profiles
    const seen = new Set<string>()
    const allUserIds: string[] = []
    for (const p of projectData) for (const m of (p.project_members || [])) {
      if (!seen.has(m.user_id)) { seen.add(m.user_id); allUserIds.push(m.user_id) }
    }
    const profileMap: Record<string, { full_name: string; avatar_url: string | null }> = {}
    if (allUserIds.length > 0) {
      const { data: memberProfiles } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', allUserIds)
      for (const p of (memberProfiles || [])) {
        profileMap[p.id as string] = { full_name: p.full_name as string, avatar_url: p.avatar_url as string | null }
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
        const { data: newProject, error } = await supabase
          .from('projects')
          .insert({ ...payload, created_by: profile!.id })
          .select('id')
          .single()
        if (error) throw error
        // Auto-add creator as a member
        await supabase.from('project_members').insert({
          project_id: newProject.id,
          user_id: profile!.id,
          assigned_by: profile!.id,
        })
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

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete project "${name}"? This will also delete all associated tasks. This cannot be undone.`)) return
    setDeletingId(id)
    try {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
      toast.success('Project deleted')
      if (profile) fetchProjects(profile.id, canManageProjects)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Member management ──────────────────────────────────────

  const openMembersModal = async (projectId: string, projectName: string, projectCreatedBy: string) => {
    setMembersProjectId(projectId)
    setMembersProjectName(projectName)
    setMembersProjectCreatedBy(projectCreatedBy)
    setMemberToAdd('')
    setShowMembersModal(true)
    setLoadingMembers(true)
    await Promise.all([
      fetchProjectMembersForModal(projectId),
      fetchAvailableMembers(projectId),
    ])
    setLoadingMembers(false)
  }

  const fetchProjectMembersForModal = async (projectId: string) => {
    const { data: rows } = await supabase.from('project_members').select('user_id').eq('project_id', projectId)
    const ids = rows?.map(r => r.user_id) || []
    if (ids.length === 0) { setProjectMembers([]); return }
    const { data } = await supabase.from('profiles').select('id, full_name, role, manager_id').in('id', ids)
    setProjectMembers((data || []) as unknown as Profile[])
  }

  const fetchAvailableMembers = async (projectId: string) => {
    // Get current member IDs to exclude from the add-dropdown
    const { data: rows } = await supabase.from('project_members').select('user_id').eq('project_id', projectId)
    const existingIds = new Set((rows || []).map(r => r.user_id))

    // Admins: all active users
    // Managers: their direct reports + themselves (so they can add themselves)
    let data: { id: string; full_name: string }[] = []
    if (isAdmin) {
      const res = await supabase.from('profiles').select('id, full_name').eq('is_active', true)
      data = (res.data || []) as { id: string; full_name: string }[]
    } else {
      // Direct reports
      const res = await supabase.from('profiles').select('id, full_name').eq('manager_id', profile!.id).eq('is_active', true)
      data = (res.data || []) as { id: string; full_name: string }[]
      // Add self if not already included
      if (profile && !data.find(m => m.id === profile.id)) {
        data = [{ id: profile.id, full_name: profile.full_name }, ...data]
      }
    }

    const available = (data as unknown as Profile[]).filter(m => !existingIds.has(m.id))
    setAvailableToAdd(available)
  }

  const addMember = async () => {
    if (!memberToAdd) return
    const { error } = await supabase.from('project_members').insert({
      project_id: membersProjectId,
      user_id: memberToAdd,
      assigned_by: profile!.id,
    })
    if (error) { toast.error('Failed to add member'); return }
    toast.success('Member added!')
    setMemberToAdd('')
    setLoadingMembers(true)
    await Promise.all([fetchProjectMembersForModal(membersProjectId), fetchAvailableMembers(membersProjectId)])
    setLoadingMembers(false)
    if (profile) fetchProjects(profile.id, canManageProjects)
  }

  const removeMember = async (userId: string, memberManagerId?: string | null) => {
    // Prevent removing the project owner
    if (membersProjectCreatedBy === userId) {
      toast.error('Cannot remove the project owner from the project.')
      return
    }
    // Managers can only remove their own direct reports (or themselves)
    if (!isAdmin && userId !== profile?.id && memberManagerId !== profile?.id) {
      toast.error('You can only remove your own direct reports from a project.')
      return
    }
    const { error } = await supabase.from('project_members').delete()
      .eq('project_id', membersProjectId)
      .eq('user_id', userId)
    if (error) { toast.error('Failed to remove member'); return }
    toast.success('Member removed')
    setLoadingMembers(true)
    await Promise.all([fetchProjectMembersForModal(membersProjectId), fetchAvailableMembers(membersProjectId)])
    setLoadingMembers(false)
    if (profile) fetchProjects(profile.id, canManageProjects)
  }

  // ────────────────────────────────────────────────────────────

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client as { name: string } | undefined)?.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Projects</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>{filtered.length} project{filtered.length !== 1 ? 's' : ''}</p>
        </div>

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

      {/* Projects grid */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={28} />}
          title="No projects found"
          description={canManageProjects ? 'Create your first project to start tracking time.' : "You haven't been assigned to any projects yet."}
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
                      <h3
                        style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--chronos-text)', marginBottom: '4px', cursor: 'pointer', transition: 'color 0.15s' }}
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
                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          disabled={deletingId === p.id}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '6px' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-danger, #ef4444)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          title="Delete project"
                        ><Trash2 size={13} /></button>
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
                  {/* Member avatars — click to manage (managers) or view (employees) */}
                  <button
                    onClick={() => openMembersModal(p.id, p.name, p.created_by)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: '6px' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--chronos-surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    title={canManageProjects ? 'Manage members' : 'View members'}
                  >
                    {members.slice(0, 4).map((m, i) => (
                      <div key={i} style={{
                        width: '24px', height: '24px', borderRadius: '6px',
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '9px', fontWeight: 700, color: 'white',
                        marginLeft: i > 0 ? '-6px' : '0',
                        border: '2px solid var(--chronos-surface)',
                        fontFamily: 'var(--font-display)',
                      }}>
                        {getInitials(m.user.full_name)}
                      </div>
                    ))}
                    {members.length > 4 && (
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'var(--chronos-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--chronos-text-muted)', marginLeft: '-6px', border: '2px solid var(--chronos-surface)' }}>
                        +{members.length - 4}
                      </div>
                    )}
                    {members.length === 0 && (
                      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={12} />{canManageProjects ? 'Add members' : 'No members'}
                      </span>
                    )}
                  </button>
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

      {/* Create / Edit Project Modal */}
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

      {/* Members Modal */}
      <Modal isOpen={showMembersModal} onClose={() => setShowMembersModal(false)} title={`${membersProjectName} — Team Members`} size="sm">
        {loadingMembers ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
            <div style={{ width: '24px', height: '24px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Current members list */}
            <div>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text-subtle)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Current Members ({projectMembers.length})
              </p>
              {projectMembers.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', padding: '12px', textAlign: 'center' }}>No members assigned yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {projectMembers.map(m => {
                    const isOwner = membersProjectCreatedBy === m.id
                    return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', background: 'var(--chronos-surface-2)' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {getInitials(m.full_name)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600 }}>{m.full_name}</p>
                        <p style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', textTransform: 'capitalize' }}>{m.role}</p>
                      </div>
                      {isOwner && (
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: 'rgba(167,139,250,0.15)', color: 'var(--chronos-accent)', border: '1px solid rgba(167,139,250,0.3)', flexShrink: 0 }}>OWNER</span>
                      )}
                      {canManageProjects && !isOwner && (isAdmin || m.manager_id === profile?.id || m.id === profile?.id) && (
                        <button onClick={() => removeMember(m.id, m.manager_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '4px' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-danger)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          title="Remove member"
                        ><X size={14} /></button>
                      )}
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Add member (managers only) */}
            {canManageProjects && (
              <div style={{ borderTop: '1px solid var(--chronos-border)', paddingTop: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text-subtle)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Add Member
                </p>
                {availableToAdd.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>
                    {isAdmin ? 'All active users are already members.' : 'All your direct reports are already members.'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Select
                      value={memberToAdd}
                      onChange={setMemberToAdd}
                      options={availableToAdd.map(m => ({ value: m.id, label: m.full_name }))}
                      placeholder="Select person to add"
                    />
                    <button className="btn-primary" onClick={addMember} disabled={!memberToAdd} style={{ flexShrink: 0 }}>
                      <UserPlus size={14} />Add
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
