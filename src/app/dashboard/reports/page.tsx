'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import {
  format,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  addWeeks, subWeeks,
  addMonths, subMonths,
  addYears, subYears,
} from 'date-fns'
import { Download, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react'
import toast from 'react-hot-toast'

const supabase = createClient()
const ACCENT = '#a78bfa'

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'clients' | 'resource'
type PeriodTab = 'week' | 'month' | 'annual'

interface RawLog {
  id: string
  hours: number
  log_date: string
  project_id: string
  user_id: string
  description?: string | null
}

interface EnrichedLog extends RawLog {
  projectName: string
  clientId: string | null
  clientName: string
  userName: string
  department: string
}

interface ProjectDetail { id: string; name: string; client_id: string | null }
interface ClientDetail { id: string; name: string }
interface ProfileDetail { id: string; full_name: string; department: string; manager_id: string | null }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function h(v: number) { return `${v.toFixed(1)}h` }
function sumH(ls: EnrichedLog[]) { return ls.reduce((s, l) => s + l.hours, 0) }

function getPeriodRange(tab: PeriodTab, nav: number): { start: Date; end: Date; label: string } {
  const base = new Date()
  if (tab === 'week') {
    const anchor = nav >= 0 ? addWeeks(base, nav) : subWeeks(base, -nav)
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    const end = endOfWeek(anchor, { weekStartsOn: 1 })
    return { start, end, label: `Week of ${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}` }
  }
  if (tab === 'month') {
    const anchor = nav >= 0 ? addMonths(base, nav) : subMonths(base, -nav)
    const start = startOfMonth(anchor)
    const end = endOfMonth(anchor)
    return { start, end, label: format(start, 'MMMM yyyy') }
  }
  // annual
  const anchor = nav >= 0 ? addYears(base, nav) : subYears(base, -nav)
  const start = startOfYear(anchor)
  const end = endOfYear(anchor)
  return { start, end, label: `Year ${format(start, 'yyyy')}` }
}

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const lines = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { profile, profileReady } = useAuth()

  const [mainTab, setMainTab] = useState<MainTab>('clients')
  const [periodTab, setPeriodTab] = useState<PeriodTab>('month')
  const [navOffset, setNavOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const [logs, setLogs] = useState<EnrichedLog[]>([])
  const [clients, setClients] = useState<ClientDetail[]>([])
  const [allProfiles, setAllProfiles] = useState<ProfileDetail[]>([])

  // Client tab
  const [selectedClient, setSelectedClient] = useState('')

  // Resource tab
  const [selectedDept, setSelectedDept] = useState('')
  const [selectedResource, setSelectedResource] = useState('')
  const [expandedResource, setExpandedResource] = useState<string | null>(null)

  useEffect(() => { setNavOffset(0) }, [periodTab])
  useEffect(() => {
    setSelectedClient(''); setSelectedDept(''); setSelectedResource(''); setExpandedResource(null)
  }, [mainTab])

  const { start: pStart, end: pEnd, label: pLabel } = useMemo(
    () => getPeriodRange(periodTab, navOffset),
    [periodTab, navOffset]
  )
  const startStr = format(pStart, 'yyyy-MM-dd')
  const endStr = format(pEnd, 'yyyy-MM-dd')

  const fetchData = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    try {
      const role = profile.role
      let allowedUserIds: string[] | null = null

      if (role === 'admin') {
        allowedUserIds = null
      } else if (role === 'manager') {
        const { data: reps } = await supabase.from('profiles').select('id').eq('manager_id', profile.id).eq('is_active', true)
        allowedUserIds = (reps || []).map((r: { id: string }) => r.id)
        if (allowedUserIds.length === 0) {
          setLogs([]); setClients([]); setAllProfiles([]); setLoading(false); return
        }
      } else {
        allowedUserIds = [profile.id]
      }

      // Fetch profiles for filter dropdowns
      let profQ = supabase.from('profiles').select('id,full_name,department,manager_id').eq('is_active', true)
      if (allowedUserIds !== null) profQ = profQ.in('id', allowedUserIds)
      const { data: profData } = await profQ
      const profArr = (profData || []) as ProfileDetail[]
      setAllProfiles(profArr)

      // Fetch time logs
      let logsQ = supabase.from('time_logs').select('id,hours,log_date,project_id,user_id,description')
        .gte('log_date', startStr).lte('log_date', endStr)
      if (allowedUserIds !== null) logsQ = logsQ.in('user_id', allowedUserIds)
      const { data: rawLogs } = await logsQ
      const raw = (rawLogs || []) as RawLog[]

      if (raw.length === 0) {
        setLogs([]); setClients([]); setLoading(false); return
      }

      const projIds = Array.from(new Set(raw.map(l => l.project_id)))
      const userIds = Array.from(new Set(raw.map(l => l.user_id)))

      const [projRes, userRes] = await Promise.all([
        supabase.from('projects').select('id,name,client_id').in('id', projIds),
        supabase.from('profiles').select('id,full_name,department,manager_id').in('id', userIds),
      ])

      const projArr = (projRes.data || []) as ProjectDetail[]
      const userArr = (userRes.data || []) as ProfileDetail[]

      const projMap: Record<string, ProjectDetail> = {}
      for (const p of projArr) projMap[p.id] = p
      const profMap: Record<string, ProfileDetail> = {}
      for (const p of userArr) profMap[p.id] = p

      const clientIds = Array.from(new Set(projArr.map(p => p.client_id).filter(Boolean))) as string[]
      let clientArr: ClientDetail[] = []
      if (clientIds.length) {
        const { data: cd } = await supabase.from('clients').select('id,name').in('id', clientIds)
        clientArr = (cd || []) as ClientDetail[]
      }
      setClients(clientArr)
      const clientMap: Record<string, ClientDetail> = {}
      for (const c of clientArr) clientMap[c.id] = c

      const enriched: EnrichedLog[] = raw.map(l => {
        const proj = projMap[l.project_id]
        const prof = profMap[l.user_id]
        const client = proj?.client_id ? clientMap[proj.client_id] : null
        return {
          ...l,
          projectName: proj?.name || 'Unknown Project',
          clientId: proj?.client_id ?? null,
          clientName: client?.name || 'No Client',
          userName: prof?.full_name || 'Unknown',
          department: prof?.department || 'Unassigned',
        }
      })
      setLogs(enriched)
    } catch (e) {
      console.error(e); toast.error('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }, [profile, startStr, endStr])

  useEffect(() => { if (profileReady) fetchData() }, [profileReady, fetchData])

  // ─── Derived ──────────────────────────────────────────────────────────────

  const departments = useMemo(() =>
    Array.from(new Set(allProfiles.map(p => p.department).filter(Boolean))).sort()
    , [allProfiles])

  const resourcesInDept = useMemo(() =>
    selectedDept ? allProfiles.filter(p => p.department === selectedDept) : allProfiles
    , [allProfiles, selectedDept])

  // Clients tab: group logs → client → project → resource
  const clientsData = useMemo(() => {
    const filtered = selectedClient ? logs.filter(l => l.clientId === selectedClient) : logs
    const map: Record<string, {
      clientId: string; clientName: string;
      projects: Record<string, {
        projectId: string; projectName: string;
        resources: Record<string, { userId: string; userName: string; department: string; hours: number }>
      }>
    }> = {}
    for (const log of filtered) {
      const cid = log.clientId || 'no-client'
      if (!map[cid]) map[cid] = { clientId: cid, clientName: log.clientName, projects: {} }
      const cm = map[cid]
      if (!cm.projects[log.project_id]) cm.projects[log.project_id] = { projectId: log.project_id, projectName: log.projectName, resources: {} }
      const pm = cm.projects[log.project_id]
      if (!pm.resources[log.user_id]) pm.resources[log.user_id] = { userId: log.user_id, userName: log.userName, department: log.department, hours: 0 }
      pm.resources[log.user_id].hours += log.hours
    }
    return Object.values(map).sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [logs, selectedClient])

  // Resource tab: group logs → resource → project → individual logs
  const resourceData = useMemo(() => {
    let filtered = logs
    if (selectedDept) filtered = filtered.filter(l => l.department === selectedDept)
    if (selectedResource) filtered = filtered.filter(l => l.user_id === selectedResource)

    const map: Record<string, {
      userId: string; userName: string; department: string; totalHours: number;
      projects: Record<string, { projectId: string; projectName: string; hours: number; logs: EnrichedLog[] }>
    }> = {}

    for (const log of filtered) {
      if (!map[log.user_id]) map[log.user_id] = { userId: log.user_id, userName: log.userName, department: log.department, totalHours: 0, projects: {} }
      const rm = map[log.user_id]
      rm.totalHours += log.hours
      if (!rm.projects[log.project_id]) rm.projects[log.project_id] = { projectId: log.project_id, projectName: log.projectName, hours: 0, logs: [] }
      rm.projects[log.project_id].hours += log.hours
      rm.projects[log.project_id].logs.push(log)
    }
    return Object.values(map).sort((a, b) => a.userName.localeCompare(b.userName))
  }, [logs, selectedDept, selectedResource])

  // ─── Export ───────────────────────────────────────────────────────────────

  const exportCSV = () => {
    if (mainTab === 'clients') {
      const rows: string[][] = []
      for (const client of clientsData) {
        const clientTotal = Object.values(client.projects).reduce((s, p) => s + Object.values(p.resources).reduce((ss, r) => ss + r.hours, 0), 0)
        for (const project of Object.values(client.projects).sort((a, b) => a.projectName.localeCompare(b.projectName))) {
          const projectTotal = Object.values(project.resources).reduce((s, r) => s + r.hours, 0)
          for (const res of Object.values(project.resources).sort((a, b) => a.userName.localeCompare(b.userName))) {
            rows.push([client.clientName, project.projectName, res.department, res.userName, res.hours.toFixed(1)])
          }
          rows.push([client.clientName, project.projectName, '', 'PROJECT TOTAL', projectTotal.toFixed(1)])
        }
        rows.push([client.clientName, '', '', 'CLIENT TOTAL', clientTotal.toFixed(1)])
        rows.push(['', '', '', '', ''])
      }
      downloadCSV(`clients_report_${startStr}_${endStr}.csv`, rows, ['Client', 'Project', 'Department', 'Resource', 'Time (h)'])
      toast.success('CSV downloaded')
    } else {
      const rows: string[][] = []
      for (const res of resourceData) {
        for (const proj of Object.values(res.projects).sort((a, b) => a.projectName.localeCompare(b.projectName))) {
          rows.push([res.userName, res.department, proj.projectName, proj.hours.toFixed(1)])
          for (const log of proj.logs.sort((a, b) => a.log_date.localeCompare(b.log_date))) {
            rows.push([res.userName, res.department, `  ${proj.projectName} — ${format(new Date(log.log_date + 'T00:00:00'), 'MMM d, yyyy')}${log.description ? ' — ' + log.description : ''}`, log.hours.toFixed(1)])
          }
        }
        rows.push([res.userName, res.department, 'RESOURCE TOTAL', res.totalHours.toFixed(1)])
        rows.push(['', '', '', ''])
      }
      downloadCSV(`resource_report_${startStr}_${endStr}.csv`, rows, ['Resource', 'Department', 'Project', 'Time (h)'])
      toast.success('CSV downloaded')
    }
  }

  // ─── Styles ───────────────────────────────────────────────────────────────

  const tabBtn = (t: MainTab): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
    fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-display)',
    background: mainTab === t ? ACCENT : 'transparent',
    color: mainTab === t ? '#0f0f17' : 'var(--chronos-text-muted)',
    transition: 'all 0.15s',
  })

  const periodBtn = (p: PeriodTab): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: '6px',
    border: `1px solid ${periodTab === p ? ACCENT : 'var(--chronos-border)'}`,
    cursor: 'pointer', fontSize: '12px', fontWeight: 600,
    background: periodTab === p ? 'rgba(167,139,250,0.12)' : 'transparent',
    color: periodTab === p ? ACCENT : 'var(--chronos-text-muted)',
    transition: 'all 0.15s',
  })

  const navBtn: React.CSSProperties = {
    padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--chronos-border)',
    background: 'transparent', cursor: 'pointer', color: 'var(--chronos-text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Reports</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>{pLabel}</p>
        </div>
        <button className="btn-primary" onClick={exportCSV} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {/* Main tabs */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--chronos-surface-2)', borderRadius: '10px', padding: '4px' }}>
          <button style={tabBtn('clients')} onClick={() => setMainTab('clients')}>Clients</button>
          <button style={tabBtn('resource')} onClick={() => setMainTab('resource')}>Resource</button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Period tabs */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['week', 'month', 'annual'] as PeriodTab[]).map(p => (
            <button key={p} style={periodBtn(p)} onClick={() => setPeriodTab(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button style={navBtn} onClick={() => setNavOffset(n => n - 1)}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', minWidth: '56px', textAlign: 'center' }}>
            {navOffset === 0 ? 'Current' : navOffset > 0 ? `+${navOffset}` : `${navOffset}`}
          </span>
          <button style={navBtn} onClick={() => setNavOffset(n => n + 1)}><ChevronRight size={14} /></button>
          {navOffset !== 0 && (
            <button style={{ ...navBtn, fontSize: '11px', padding: '5px 10px' }} onClick={() => setNavOffset(0)}>Today</button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : mainTab === 'clients' ? (
        /* ─── Clients Tab ─────────────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', flexShrink: 0 }}>Client:</label>
            <select className="input-base" style={{ maxWidth: '280px' }} value={selectedClient}
              onChange={e => setSelectedClient(e.target.value)}>
              <option value="">All Clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {clientsData.length === 0 ? (
            <div className="card-base" style={{ padding: '60px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '14px' }}>
              No time logs found for this period.
            </div>
          ) : (
            clientsData.map(client => {
              const clientTotal = Object.values(client.projects).reduce((s, p) =>
                s + Object.values(p.resources).reduce((ss, r) => ss + r.hours, 0), 0)
              const sortedProjects = Object.values(client.projects).sort((a, b) => a.projectName.localeCompare(b.projectName))

              return (
                <div key={client.clientId} className="card-base" style={{ overflow: 'hidden' }}>
                  {/* Client header */}
                  <div style={{
                    padding: '12px 16px', background: 'var(--chronos-surface-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid var(--chronos-border)',
                  }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px' }}>{client.clientName}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 800, color: ACCENT }}>
                      {h(clientTotal)} total
                    </span>
                  </div>

                  {/* Column headers */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 100px',
                    padding: '8px 16px', borderBottom: '1px solid var(--chronos-border)',
                    background: 'rgba(0,0,0,0.12)',
                  }}>
                    {['Client', 'Project', 'Department', 'Resource', 'Time'].map(col => (
                      <span key={col} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col}</span>
                    ))}
                  </div>

                  {sortedProjects.map(project => {
                    const projectTotal = Object.values(project.resources).reduce((s, r) => s + r.hours, 0)
                    const sortedResources = Object.values(project.resources).sort((a, b) => a.userName.localeCompare(b.userName))

                    return (
                      <div key={project.projectId}>
                        {sortedResources.map((res, ri) => (
                          <div key={res.userId} style={{
                            display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 100px',
                            padding: '10px 16px', borderBottom: '1px solid var(--chronos-border)',
                            alignItems: 'center',
                          }}>
                            <span style={{ fontSize: '13px', color: ri === 0 ? 'var(--chronos-text)' : 'var(--chronos-text-muted)' }}>{ri === 0 ? client.clientName : ''}</span>
                            <span style={{ fontSize: '13px', color: ri === 0 ? 'var(--chronos-text)' : 'var(--chronos-text-muted)' }}>{ri === 0 ? project.projectName : ''}</span>
                            <span style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{res.department}</span>
                            <span style={{ fontSize: '13px' }}>{res.userName}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: ACCENT }}>{h(res.hours)}</span>
                          </div>
                        ))}
                        {/* Project total */}
                        <div style={{
                          display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 100px',
                          padding: '7px 16px', borderBottom: '1px solid var(--chronos-border)',
                          alignItems: 'center', background: 'rgba(167,139,250,0.06)',
                        }}>
                          <span /><span style={{ fontSize: '11px', fontWeight: 700, color: ACCENT }}>{project.projectName} Total</span>
                          <span /><span />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 800, color: ACCENT }}>{h(projectTotal)}</span>
                        </div>
                      </div>
                    )
                  })}

                  {/* Client total */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 100px',
                    padding: '10px 16px', alignItems: 'center',
                    background: 'rgba(167,139,250,0.12)', borderTop: '1px solid rgba(167,139,250,0.25)',
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: ACCENT }}>{client.clientName} Total</span>
                    <span /><span /><span />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 800, color: ACCENT }}>{h(clientTotal)}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : (
        /* ─── Resource Tab ────────────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', flexShrink: 0 }}>Department:</label>
              <select className="input-base" style={{ maxWidth: '220px' }} value={selectedDept}
                onChange={e => { setSelectedDept(e.target.value); setSelectedResource('') }}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', flexShrink: 0 }}>Resource:</label>
              <select className="input-base" style={{ maxWidth: '240px' }} value={selectedResource}
                onChange={e => { setSelectedResource(e.target.value); setExpandedResource(e.target.value || null) }}>
                <option value="">All Resources</option>
                {resourcesInDept.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          </div>

          {resourceData.length === 0 ? (
            <div className="card-base" style={{ padding: '60px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '14px' }}>
              No time logs found for this period.
            </div>
          ) : (() => {
            // Group by department
            const byDept: Record<string, typeof resourceData> = {}
            for (const res of resourceData) {
              if (!byDept[res.department]) byDept[res.department] = []
              byDept[res.department].push(res)
            }
            const deptEntries = Object.entries(byDept).sort(([a], [b]) => a.localeCompare(b))
            const showDeptHeaders = deptEntries.length > 1

            return (
              <div className="card-base" style={{ overflow: 'hidden' }}>
                {/* Column headers */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 100px',
                  padding: '8px 16px', borderBottom: '1px solid var(--chronos-border)',
                  background: 'var(--chronos-surface-2)',
                }}>
                  {['Resource', 'Department', 'Project', 'Time'].map(col => (
                    <span key={col} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col}</span>
                  ))}
                </div>

                {deptEntries.map(([dept, resources]) => {
                  const deptTotal = resources.reduce((s, r) => s + r.totalHours, 0)

                  return (
                    <div key={dept}>
                      {showDeptHeaders && (
                        <div style={{
                          padding: '8px 16px', background: 'rgba(0,0,0,0.2)',
                          borderBottom: '1px solid var(--chronos-border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{dept}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{h(deptTotal)}</span>
                        </div>
                      )}

                      {resources.map(res => {
                        const isExpanded = expandedResource === res.userId
                        const sortedProjects = Object.values(res.projects).sort((a, b) => a.projectName.localeCompare(b.projectName))

                        return (
                          <div key={res.userId}>
                            {sortedProjects.map((proj, pi) => (
                              <div key={proj.projectId}>
                                <div
                                  onClick={() => setExpandedResource(isExpanded ? null : res.userId)}
                                  style={{
                                    display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 100px',
                                    padding: '10px 16px', borderBottom: '1px solid var(--chronos-border)',
                                    alignItems: 'center', cursor: 'pointer',
                                    background: isExpanded ? 'rgba(167,139,250,0.03)' : 'transparent',
                                    transition: 'background 0.1s',
                                  }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--chronos-surface-2)'}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isExpanded ? 'rgba(167,139,250,0.03)' : 'transparent'}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {pi === 0 && (
                                      <>
                                        <span style={{ color: 'var(--chronos-text-muted)', flexShrink: 0, display: 'flex' }}>
                                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRightIcon size={13} />}
                                        </span>
                                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{res.userName}</span>
                                      </>
                                    )}
                                  </div>
                                  <span style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{pi === 0 ? res.department : ''}</span>
                                  <span style={{ fontSize: '13px' }}>{proj.projectName}</span>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: ACCENT }}>{h(proj.hours)}</span>
                                </div>

                                {/* Expanded individual logs */}
                                {isExpanded && proj.logs
                                  .sort((a, b) => a.log_date.localeCompare(b.log_date))
                                  .map(log => (
                                    <div key={log.id} style={{
                                      display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 100px',
                                      padding: '7px 16px 7px 52px', borderBottom: '1px solid var(--chronos-border)',
                                      alignItems: 'center', background: 'rgba(0,0,0,0.14)',
                                    }}>
                                      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>
                                        {format(new Date(log.log_date + 'T00:00:00'), 'EEE, MMM d')}
                                        {log.description && (
                                          <span style={{ marginLeft: '8px', fontStyle: 'italic', opacity: 0.7 }}>— {log.description}</span>
                                        )}
                                      </span>
                                      <span />
                                      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{proj.projectName}</span>
                                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text)' }}>{h(log.hours)}</span>
                                    </div>
                                  ))}
                              </div>
                            ))}

                            {/* Resource total */}
                            <div style={{
                              display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 100px',
                              padding: '8px 16px', borderBottom: '1px solid var(--chronos-border)',
                              alignItems: 'center', background: 'rgba(167,139,250,0.08)',
                            }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: ACCENT }}>{res.userName} Total</span>
                              <span /><span />
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 800, color: ACCENT }}>{h(res.totalHours)}</span>
                            </div>
                          </div>
                        )
                      })}

                      {/* Dept total (only when showing multiple depts) */}
                      {showDeptHeaders && (
                        <div style={{
                          display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 100px',
                          padding: '10px 16px', borderBottom: '1px solid var(--chronos-border)',
                          alignItems: 'center', background: 'rgba(96,165,250,0.08)',
                        }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#60a5fa' }}>{dept} Department Total</span>
                          <span /><span />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 800, color: '#60a5fa' }}>{h(deptTotal)}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
