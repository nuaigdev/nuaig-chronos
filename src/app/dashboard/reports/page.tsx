'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/hooks/useProfile'
import {
  format,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  addWeeks, subWeeks,
  addMonths, subMonths,
  addYears, subYears,
} from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { Download, ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon } from 'lucide-react'
import toast from 'react-hot-toast'

const supabase = createClient()
const ACCENT = '#a78bfa'
const DEPT_COLORS = [
  '#3b82f6', '#8b5cf6', '#34d399', '#f59e0b',
  '#ef4444', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#6366f1',
]

const BULK_GRID = '2fr 1.5fr 2fr 2fr 100px'
const SINGLE_DATE_COL = '1.4fr'
const SINGLE_NOTE_COL = '2fr'
const SINGLE_CLIENT_COL = '1.5fr'
const SINGLE_PROJECT_COL = '1.5fr'
const SINGLE_TIME_COL = '100px'

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'clients' | 'resource' | 'utilization'
type PeriodTab = 'week' | 'month' | 'annual'

interface RawLog {
  id: string; hours: number; log_date: string; project_id: string; user_id: string
  description?: string | null; task_type_id?: string | null
}

interface EnrichedLog extends RawLog {
  projectName: string; clientId: string | null; clientName: string
  userName: string; department: string; managerId: string | null; taskTypeName: string
}

interface TaskTypeDetail { id: string; name: string }
interface ProjectDetail { id: string; name: string; client_id: string | null }
interface ClientDetail { id: string; name: string }
interface ProfileDetail { id: string; full_name: string; department: string; manager_id: string | null; role: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function h(v: number) { return `${v.toFixed(1)}h` }
function sumH(ls: EnrichedLog[]) { return ls.reduce((s, l) => s + l.hours, 0) }

function countWeekdays(start: Date, end: Date, holidayDates: string[] = []): number {
  const holidaySet = new Set(holidayDates)
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getDay()
    const dateStr = format(cur, 'yyyy-MM-dd')
    if (dow !== 0 && dow !== 6 && !holidaySet.has(dateStr)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

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
  const anchor = nav >= 0 ? addYears(base, nav) : subYears(base, -nav)
  const start = startOfYear(anchor)
  const end = endOfYear(anchor)
  return { start, end, label: `Year ${format(start, 'yyyy')}` }
}

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const lines = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))]
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function sanitizeFilename(s: string): string {
  return (s || 'untitled')
    .replace(/[\\/:*?"<>|,]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'untitled'
}

function utilColor(pct: number) {
  if (pct > 100) return '#ef4444'
  if (pct >= 80) return '#34d399'
  if (pct >= 50) return '#f59e0b'
  return '#64748b'
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { profile, loading: authLoading } = useProfile()

  const [mainTab, setMainTab] = useState<MainTab>('clients')
  const [periodTab, setPeriodTab] = useState<PeriodTab>('month')
  const [navOffset, setNavOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const [logs, setLogs] = useState<EnrichedLog[]>([])
  const [clients, setClients] = useState<ClientDetail[]>([])
  const [allProfiles, setAllProfiles] = useState<ProfileDetail[]>([])
  const [mandatoryHolidays, setMandatoryHolidays] = useState<string[]>([])

  const [selectedClient, setSelectedClient] = useState('')
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

      let profQ = supabase.from('profiles').select('id,full_name,department,manager_id,role').eq('is_active', true)
      if (allowedUserIds !== null) profQ = profQ.in('id', allowedUserIds)
      const { data: profData, error: profError } = await profQ
      if (profError) { setLoading(false); return }
      setAllProfiles((profData || []) as ProfileDetail[])

      // Fetch mandatory holidays in this period
      const { data: holidayData } = await supabase
        .from('holidays')
        .select('date')
        .eq('is_optional', false)
        .gte('date', startStr)
        .lte('date', endStr)
      const holidayDates = (holidayData || []).map((h: { date: string }) => h.date)
      setMandatoryHolidays(holidayDates)

      let logsQ = supabase.from('time_logs').select('id,hours,log_date,project_id,user_id,description,task_type_id')
        .gte('log_date', startStr).lte('log_date', endStr)
      if (allowedUserIds !== null) logsQ = logsQ.in('user_id', allowedUserIds)
      const { data: rawLogs } = await logsQ
      const raw = (rawLogs || []) as RawLog[]

      if (raw.length === 0) {
        setLogs([]); setClients([]); setLoading(false); return
      }

      const projIds = Array.from(new Set(raw.map(l => l.project_id)))
      const userIds = Array.from(new Set(raw.map(l => l.user_id)))
      const taskTypeIds = Array.from(new Set(raw.map(l => l.task_type_id).filter(Boolean))) as string[]

      const [projRes, userRes] = await Promise.all([
        supabase.from('projects').select('id,name,client_id').in('id', projIds),
        supabase.from('profiles').select('id,full_name,department,manager_id,role').in('id', userIds),
      ])

      const projArr = (projRes.data || []) as ProjectDetail[]
      const userArr = (userRes.data || []) as ProfileDetail[]
      const projMap: Record<string, ProjectDetail> = {}
      for (const p of projArr) projMap[p.id] = p
      const profMap: Record<string, ProfileDetail> = {}
      for (const p of userArr) profMap[p.id] = p

      const taskTypeMap: Record<string, TaskTypeDetail> = {}
      if (taskTypeIds.length) {
        const { data: ttData } = await supabase.from('task_types').select('id,name').in('id', taskTypeIds)
        for (const tt of (ttData || []) as TaskTypeDetail[]) taskTypeMap[tt.id] = tt
      }

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
        const taskType = l.task_type_id ? taskTypeMap[l.task_type_id] : null
        return {
          ...l,
          projectName: proj?.name || 'Unknown Project',
          clientId: proj?.client_id ?? null,
          clientName: client?.name || 'No Client',
          userName: prof?.full_name || 'Unknown',
          department: prof?.department || 'Unassigned',
          managerId: prof?.manager_id ?? null,
          taskTypeName: taskType?.name || '—',
        }
      })
      setLogs(enriched)
    } catch (e) {
      console.error(e); toast.error('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }, [profile, startStr, endStr])

  useEffect(() => { if (!authLoading && profile) fetchData() }, [authLoading, profile?.id, fetchData])

  // ─── Derived ──────────────────────────────────────────────────────────────

  const departments = useMemo(() =>
    Array.from(new Set(allProfiles.map(p => p.department).filter(Boolean))).sort()
    , [allProfiles])

  const resourcesInDept = useMemo(() =>
    selectedDept ? allProfiles.filter(p => p.department === selectedDept) : allProfiles
    , [allProfiles, selectedDept])

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

  const resourceData = useMemo(() => {
    let filtered = logs
    if (selectedDept) filtered = filtered.filter(l => l.department === selectedDept)
    if (selectedResource) filtered = filtered.filter(l => l.user_id === selectedResource)

    const map: Record<string, {
      userId: string; userName: string; department: string; managerId: string | null; totalHours: number;
      clientProjects: Record<string, { clientId: string; clientName: string; projectId: string; projectName: string; hours: number }>
      allLogs: EnrichedLog[]
    }> = {}

    for (const log of filtered) {
      if (!map[log.user_id]) {
        map[log.user_id] = {
          userId: log.user_id, userName: log.userName, department: log.department,
          managerId: log.managerId, totalHours: 0, clientProjects: {}, allLogs: [],
        }
      }
      const rm = map[log.user_id]
      rm.totalHours += log.hours
      const cid = log.clientId || 'no-client'
      const key = `${cid}::${log.project_id}`
      if (!rm.clientProjects[key]) {
        rm.clientProjects[key] = { clientId: cid, clientName: log.clientName, projectId: log.project_id, projectName: log.projectName, hours: 0 }
      }
      rm.clientProjects[key].hours += log.hours
      rm.allLogs.push(log)
    }
    return Object.values(map).sort((a, b) => a.userName.localeCompare(b.userName))
  }, [logs, selectedDept, selectedResource])

  // ─── Utilization (admin only) ─────────────────────────────────────────────

  const utilizationData = useMemo(() => {
    if (profile?.role !== 'admin') return null
    const today = new Date()
    const effectiveEnd = pEnd <= today ? pEnd : today
    const weekdays = countWeekdays(pStart, effectiveEnd, mandatoryHolidays)
    const basePerPerson = weekdays * 8

    const employees = allProfiles.filter(p => p.role === 'employee')
    const logMap: Record<string, number> = {}
    for (const log of logs) logMap[log.user_id] = (logMap[log.user_id] || 0) + log.hours

    const resources = employees.map(emp => ({
      id: emp.id,
      name: emp.full_name,
      department: emp.department || 'Unassigned',
      loggedHours: logMap[emp.id] || 0,
      baseHours: basePerPerson,
      utilization: basePerPerson > 0 ? Math.round(((logMap[emp.id] || 0) / basePerPerson) * 100) : 0,
    }))

    const deptMap: Record<string, typeof resources> = {}
    for (const r of resources) {
      if (!deptMap[r.department]) deptMap[r.department] = []
      deptMap[r.department].push(r)
    }

    const deptList = Object.keys(deptMap).sort()
    const deptColorMap: Record<string, string> = {}
    deptList.forEach((d, i) => { deptColorMap[d] = DEPT_COLORS[i % DEPT_COLORS.length] })

    const departmentRows = deptList.map(name => {
      const res = [...deptMap[name]].sort((a, b) => b.utilization - a.utilization)
      const totalLogged = res.reduce((s, r) => s + r.loggedHours, 0)
      const totalBase = res.length * basePerPerson
      return {
        name, color: deptColorMap[name], resources: res,
        totalLogged, totalBase,
        avgUtilization: totalBase > 0 ? Math.round((totalLogged / totalBase) * 100) : 0,
      }
    })

    const totalLogged = resources.reduce((s, r) => s + r.loggedHours, 0)
    const totalBase = employees.length * basePerPerson
    const holidayCount = mandatoryHolidays.length
    return {
      departmentRows, totalLogged, totalBase,
      overallUtilization: totalBase > 0 ? Math.round((totalLogged / totalBase) * 100) : 0,
      weekdays, basePerPerson, employeeCount: employees.length, holidayCount,
    }
  }, [profile, allProfiles, logs, pStart, pEnd, mandatoryHolidays])

  // ─── Single-resource view ─────────────────────────────────────────────────

  const singleResourceId = selectedResource || expandedResource || null
  const singleResource = useMemo(
    () => singleResourceId ? resourceData.find(r => r.userId === singleResourceId) ?? null : null,
    [singleResourceId, resourceData]
  )

  const [singleResourceManagerName, setSingleResourceManagerName] = useState('—')
  useEffect(() => {
    if (!singleResource?.managerId) { setSingleResourceManagerName('—'); return }
    let cancelled = false
    supabase.from('profiles').select('full_name').eq('id', singleResource.managerId).single()
      .then(({ data }: { data: { full_name: string } | null }) => {
        if (!cancelled) setSingleResourceManagerName(data?.full_name || '—')
      })
    return () => { cancelled = true }
  }, [singleResource?.managerId])

  // ─── Export ───────────────────────────────────────────────────────────────

  const exportCSV = () => {
    if (mainTab === 'utilization' && utilizationData) {
      const rows: string[][] = []
      for (const dept of utilizationData.departmentRows) {
        for (const res of dept.resources) {
          rows.push([res.name, dept.name, res.loggedHours.toFixed(1), String(res.baseHours), `${res.utilization}%`])
        }
        rows.push([`— ${dept.name} Total —`, '', dept.totalLogged.toFixed(1), String(dept.totalBase), `${dept.avgUtilization}%`])
        rows.push(['', '', '', '', ''])
      }
      downloadCSV(`utilization_${startStr}_${endStr}.csv`, rows, ['Resource', 'Department', 'Logged (h)', 'Base (h)', 'Utilization'])
      toast.success('CSV downloaded')
      return
    }

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
      return
    }

    if (singleResource) {
      const rows: string[][] = []
      const sortedLogs = [...singleResource.allLogs].sort((a, b) => a.log_date.localeCompare(b.log_date))
      for (const log of sortedLogs) {
        rows.push([singleResource.userName, format(new Date(log.log_date + 'T00:00:00'), 'yyyy-MM-dd'), log.clientName, log.projectName, log.taskTypeName, log.description || '', log.hours.toFixed(1)])
      }
      const filename = `${sanitizeFilename(singleResource.userName)}_${sanitizeFilename(singleResource.department)}_${sanitizeFilename(pLabel)}.csv`
      downloadCSV(filename, rows, ['Resource Name', 'Date', 'Client', 'Project', 'Task Type', 'Description', 'Time (h)'])
      toast.success('CSV downloaded')
      return
    }

    const allLogs: EnrichedLog[] = []
    for (const res of resourceData) allLogs.push(...res.allLogs)
    allLogs.sort((a, b) => a.userName.localeCompare(b.userName) || a.log_date.localeCompare(b.log_date) || a.hours - b.hours)
    const rows: string[][] = []
    for (const log of allLogs) {
      rows.push([log.userName, format(new Date(log.log_date + 'T00:00:00'), 'yyyy-MM-dd'), log.clientName, log.projectName, log.taskTypeName, log.description || '', log.hours.toFixed(1)])
    }
    downloadCSV(`resource_report_${startStr}_${endStr}.csv`, rows, ['Resource Name', 'Date', 'Client', 'Project', 'Task Type', 'Description', 'Time (h)'])
    toast.success('CSV downloaded')
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

  const axisProps = {
    tick: { fill: 'var(--chronos-text-muted)', fontSize: 11, fontFamily: 'DM Sans, sans-serif' },
    axisLine: false as const,
    tickLine: false as const,
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
          <Download size={13} />
          {mainTab === 'resource' && singleResource ? `Export ${singleResource.userName.split(' ')[0]}` : 'Export CSV'}
        </button>
      </div>

      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--chronos-surface-2)', borderRadius: '10px', padding: '4px' }}>
          <button style={tabBtn('clients')} onClick={() => setMainTab('clients')}>Clients</button>
          <button style={tabBtn('resource')} onClick={() => setMainTab('resource')}>Resource</button>
          {profile?.role === 'admin' && (
            <button style={tabBtn('utilization')} onClick={() => setMainTab('utilization')}>Utilization</button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: '6px' }}>
          {(['week', 'month', 'annual'] as PeriodTab[]).map(p => (
            <button key={p} style={periodBtn(p)} onClick={() => setPeriodTab(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button style={navBtn} onClick={() => setNavOffset(n => n - 1)}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', minWidth: '120px', textAlign: 'center' }}>{pLabel}</span>
          <button style={navBtn} onClick={() => setNavOffset(n => n + 1)}><ChevronRight size={14} /></button>
          {navOffset !== 0 && (
            <button style={{ ...navBtn, fontSize: '11px', padding: '5px 10px' }} onClick={() => setNavOffset(0)}>Current</button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>

      ) : mainTab === 'utilization' && profile?.role === 'admin' ? (
        /* ─── Utilization Tab ─────────────────────────────────────────────── */
        !utilizationData || utilizationData.employeeCount === 0 ? (
          <div className="card-base" style={{ padding: '60px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '14px' }}>
            No employee data found for this period.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
              {([
                { label: 'Total Logged Hours', value: `${utilizationData.totalLogged.toFixed(1)}h`, sub: `across ${utilizationData.employeeCount} employees` },
                { label: 'Total Base Hours', value: `${utilizationData.totalBase}h`, sub: `${utilizationData.employeeCount} × ${utilizationData.basePerPerson}h` },
                { label: 'Overall Utilization', value: `${utilizationData.overallUtilization}%`, sub: pLabel, accent: true },
                { label: 'Working Days', value: String(utilizationData.weekdays), sub: utilizationData.holidayCount > 0 ? `excl. ${utilizationData.holidayCount} holiday${utilizationData.holidayCount > 1 ? 's' : ''} · 8h/day` : '5 days/wk · 8h/day' },
              ] as { label: string; value: string; sub: string; accent?: boolean }[]).map(({ label, value, sub, accent }) => (
                <div key={label} className="card-base" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 800, color: accent ? ACCENT : 'var(--chronos-text)' }}>{value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Department bar chart */}
            <div className="card-base" style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700 }}>Department Utilization</div>
                  <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '3px' }}>
                    {pLabel} · 8h/day Mon–Fri{utilizationData.holidayCount > 0 ? ` · ${utilizationData.holidayCount} mandatory holiday${utilizationData.holidayCount > 1 ? 's' : ''} excluded` : ''} · 100% = {utilizationData.basePerPerson}h per person
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {utilizationData.departmentRows.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: d.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)' }}>{d.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={utilizationData.departmentRows} barSize={56} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chronos-border)" vertical={false} />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={(v: number) => `${v}%`} domain={[0, 'auto']} />
                  <ReferenceLine
                    y={100}
                    stroke="rgba(255,255,255,0.2)"
                    strokeDasharray="5 4"
                    label={{ value: '100%', position: 'insideTopRight', fill: 'var(--chronos-text-muted)', fontSize: 10, dy: -6 }}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--chronos-surface)', border: '1px solid var(--chronos-border)', borderRadius: '10px', fontFamily: 'DM Sans, sans-serif', fontSize: '12px' }}
                    formatter={(value: number, _: string, props: any) => {
                      const d = props.payload
                      return [`${value}%  (${d.totalLogged.toFixed(1)}h / ${d.totalBase}h)`, 'Utilization']
                    }}
                  />
                  <Bar dataKey="avgUtilization" radius={[6, 6, 0, 0]}>
                    {utilizationData.departmentRows.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Resource table */}
            <div className="card-base" style={{ overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 1.5fr 110px 110px 110px 1fr',
                padding: '8px 16px', background: 'var(--chronos-surface-2)',
                borderBottom: '1px solid var(--chronos-border)',
              }}>
                {['Resource', 'Department', 'Logged', 'Base', 'Utilization', ''].map(col => (
                  <span key={col} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col}</span>
                ))}
              </div>

              {utilizationData.departmentRows.map(dept => (
                <div key={dept.name}>
                  {/* Department header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '2fr 1.5fr 110px 110px 110px 1fr',
                    padding: '9px 16px', background: 'rgba(0,0,0,0.18)',
                    borderBottom: '1px solid var(--chronos-border)', alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: dept.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{dept.name}</span>
                    </div>
                    <span />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{dept.totalLogged.toFixed(1)}h</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{dept.totalBase}h</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 800, color: dept.color }}>{dept.avgUtilization}%</span>
                    <span />
                  </div>

                  {/* Resource rows — sorted by decreasing utilization */}
                  {dept.resources.map(res => {
                    const col = utilColor(res.utilization)
                    return (
                      <div key={res.id} style={{
                        display: 'grid', gridTemplateColumns: '2fr 1.5fr 110px 110px 110px 1fr',
                        padding: '10px 16px', borderBottom: '1px solid var(--chronos-border)', alignItems: 'center',
                      }}>
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{res.name}</span>
                        <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{res.department}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{res.loggedHours.toFixed(1)}h</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{res.baseHours}h</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: col }}>{res.utilization}%</span>
                        <div style={{ paddingRight: '12px' }}>
                          <div style={{ height: '6px', borderRadius: '3px', background: 'var(--chronos-surface-2)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: '3px', width: `${Math.min(res.utilization, 100)}%`, background: col, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              {/* Grand total */}
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 1.5fr 110px 110px 110px 1fr',
                padding: '12px 16px', alignItems: 'center',
                background: 'rgba(167,139,250,0.12)', borderTop: '1px solid rgba(167,139,250,0.25)',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: ACCENT }}>All Employees</span>
                <span />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 800, color: ACCENT }}>{utilizationData.totalLogged.toFixed(1)}h</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 800, color: ACCENT }}>{utilizationData.totalBase}h</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 800, color: ACCENT }}>{utilizationData.overallUtilization}%</span>
                <span />
              </div>
            </div>
          </div>
        )

      ) : mainTab === 'clients' ? (
        /* ─── Clients Tab ─────────────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                  <div style={{ padding: '12px 16px', background: 'var(--chronos-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--chronos-border)' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px' }}>{client.clientName}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 800, color: ACCENT }}>{h(clientTotal)} total</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 100px', padding: '8px 16px', borderBottom: '1px solid var(--chronos-border)', background: 'rgba(0,0,0,0.12)' }}>
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
                          <div key={res.userId} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 100px', padding: '10px 16px', borderBottom: '1px solid var(--chronos-border)', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', color: ri === 0 ? 'var(--chronos-text)' : 'var(--chronos-text-muted)' }}>{ri === 0 ? client.clientName : ''}</span>
                            <span style={{ fontSize: '13px', color: ri === 0 ? 'var(--chronos-text)' : 'var(--chronos-text-muted)' }}>{ri === 0 ? project.projectName : ''}</span>
                            <span style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{res.department}</span>
                            <span style={{ fontSize: '13px' }}>{res.userName}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: ACCENT }}>{h(res.hours)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 100px', padding: '7px 16px', borderBottom: '1px solid var(--chronos-border)', alignItems: 'center', background: 'rgba(167,139,250,0.06)' }}>
                          <span /><span style={{ fontSize: '11px', fontWeight: 700, color: ACCENT }}>{project.projectName} Total</span>
                          <span /><span />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 800, color: ACCENT }}>{h(projectTotal)}</span>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 100px', padding: '10px 16px', alignItems: 'center', background: 'rgba(167,139,250,0.12)', borderTop: '1px solid rgba(167,139,250,0.25)' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', flexShrink: 0 }}>Department:</label>
              <select className="input-base" style={{ maxWidth: '220px' }} value={selectedDept}
                onChange={e => { setSelectedDept(e.target.value); setSelectedResource(''); setExpandedResource(null) }}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', flexShrink: 0 }}>Resource:</label>
              <select className="input-base" style={{ maxWidth: '240px' }} value={selectedResource}
                onChange={e => { setSelectedResource(e.target.value); setExpandedResource(null) }}>
                <option value="">All Resources</option>
                {resourcesInDept.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          </div>

          {resourceData.length === 0 ? (
            <div className="card-base" style={{ padding: '60px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '14px' }}>
              No time logs found for this period.
            </div>
          ) : singleResource ? (
            (() => {
              const sortedLogs = [...singleResource.allLogs].sort((a, b) => a.log_date.localeCompare(b.log_date))
              const employeeHeaderGrid = '2fr 1.5fr 2fr'
              const logGrid = `${SINGLE_DATE_COL} ${SINGLE_NOTE_COL} ${SINGLE_CLIENT_COL} ${SINGLE_PROJECT_COL} ${SINGLE_TIME_COL}`
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button onClick={() => { setExpandedResource(null); setSelectedResource('') }}
                    style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px solid var(--chronos-border)', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', color: 'var(--chronos-text-muted)' }}>
                    <ChevronLeft size={13} /> Back to all resources
                  </button>
                  <div className="card-base" style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: employeeHeaderGrid, padding: '8px 16px', borderBottom: '1px solid var(--chronos-border)', background: 'var(--chronos-surface-2)' }}>
                      {['Employee Name', 'Department', 'Manager'].map(col => (
                        <span key={col} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col}</span>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: employeeHeaderGrid, padding: '12px 16px', borderBottom: '1px solid var(--chronos-border)', alignItems: 'center', background: 'rgba(167,139,250,0.06)' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px' }}>{singleResource.userName}</span>
                      <span style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{singleResource.department}</span>
                      <span style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{singleResourceManagerName}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: logGrid, padding: '8px 16px', borderBottom: '1px solid var(--chronos-border)', background: 'rgba(0,0,0,0.12)' }}>
                      {['Date', 'Note', 'Client', 'Project', 'Time'].map(col => (
                        <span key={col} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col}</span>
                      ))}
                    </div>
                    {sortedLogs.length === 0 ? (
                      <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>No time logs in this period.</div>
                    ) : sortedLogs.map(log => (
                      <div key={log.id} style={{ display: 'grid', gridTemplateColumns: logGrid, padding: '9px 16px', borderBottom: '1px solid var(--chronos-border)', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{format(new Date(log.log_date + 'T00:00:00'), 'EEE, MMM d')}</span>
                        <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{log.description || '—'}</span>
                        <span style={{ fontSize: '13px' }}>{log.clientName}</span>
                        <span style={{ fontSize: '13px' }}>{log.projectName}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: ACCENT }}>{h(log.hours)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: logGrid, padding: '10px 16px', alignItems: 'center', background: 'rgba(167,139,250,0.12)', borderTop: '1px solid rgba(167,139,250,0.25)' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: ACCENT }}>Total</span>
                      <span /><span /><span />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 800, color: ACCENT }}>{h(singleResource.totalHours)}</span>
                    </div>
                  </div>
                </div>
              )
            })()
          ) : (() => {
            const byDept: Record<string, typeof resourceData> = {}
            for (const res of resourceData) {
              if (!byDept[res.department]) byDept[res.department] = []
              byDept[res.department].push(res)
            }
            const deptEntries = Object.entries(byDept).sort(([a], [b]) => a.localeCompare(b))
            const showDeptHeaders = deptEntries.length > 1
            return (
              <div className="card-base" style={{ overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: BULK_GRID, padding: '8px 16px', borderBottom: '1px solid var(--chronos-border)', background: 'var(--chronos-surface-2)' }}>
                  {['Resource', 'Department', 'Client', 'Project', 'Time'].map(col => (
                    <span key={col} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col}</span>
                  ))}
                </div>
                {deptEntries.map(([dept, resources]) => {
                  const deptTotal = resources.reduce((s, r) => s + r.totalHours, 0)
                  return (
                    <div key={dept}>
                      {showDeptHeaders && (
                        <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--chronos-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{dept}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{h(deptTotal)}</span>
                        </div>
                      )}
                      {resources.map(res => {
                        const sortedCP = Object.values(res.clientProjects).sort((a, b) => a.clientName.localeCompare(b.clientName) || a.projectName.localeCompare(b.projectName))
                        return (
                          <div key={res.userId}>
                            {sortedCP.map((cp, ri) => (
                              <div key={`${cp.clientId}::${cp.projectId}`} onClick={() => setExpandedResource(res.userId)}
                                style={{ display: 'grid', gridTemplateColumns: BULK_GRID, padding: '10px 16px', borderBottom: '1px solid var(--chronos-border)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--chronos-surface-2)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {ri === 0 && (<><span style={{ color: 'var(--chronos-text-muted)', flexShrink: 0, display: 'flex' }}><ChevronRightIcon size={13} /></span><span style={{ fontWeight: 600, fontSize: '13px' }}>{res.userName}</span></>)}
                                </div>
                                <span style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{ri === 0 ? res.department : ''}</span>
                                <span style={{ fontSize: '13px' }}>{cp.clientName}</span>
                                <span style={{ fontSize: '13px' }}>{cp.projectName}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: ACCENT }}>{h(cp.hours)}</span>
                              </div>
                            ))}
                            <div style={{ display: 'grid', gridTemplateColumns: BULK_GRID, padding: '8px 16px', borderBottom: '1px solid var(--chronos-border)', alignItems: 'center', background: 'rgba(167,139,250,0.08)' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: ACCENT }}>{res.userName} Total</span>
                              <span /><span /><span />
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 800, color: ACCENT }}>{h(res.totalHours)}</span>
                            </div>
                          </div>
                        )
                      })}
                      {showDeptHeaders && (
                        <div style={{ display: 'grid', gridTemplateColumns: BULK_GRID, padding: '10px 16px', borderBottom: '1px solid var(--chronos-border)', alignItems: 'center', background: 'rgba(96,165,250,0.08)' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#60a5fa' }}>{dept} Department Total</span>
                          <span /><span /><span />
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
