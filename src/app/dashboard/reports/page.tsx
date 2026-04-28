'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Download, RefreshCw, TrendingUp, Users, FolderKanban, Clock } from 'lucide-react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subWeeks, eachWeekOfInterval } from 'date-fns'
import toast from 'react-hot-toast'

const supabase = createClient()

type Tab = 'overview' | 'projects' | 'timesheets'
type Period = 'week' | 'month' | 'quarter' | 'year'

interface EnrichedLog {
  hours: number
  log_date: string
  project_id: string
  user_id: string
  projectName: string
  userName: string
  department: string
}

interface ProjectStat {
  id: string
  name: string
  status: string
  hours: number
  estimated_hours: number | null
  taskTotal: number
  taskDone: number
  taskPct: number
  hoursPct: number | null
}

interface EmployeeStat {
  id: string
  name: string
  department: string
  hours: number
}

interface TimesheetRow {
  id: string
  user_id: string
  week_start_date: string
  week_end_date: string
  status: string
  total_hours: number
  submitted_at: string | null
  userName: string
}

const COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#e879f9', '#2dd4bf']
const ACCENT = '#a78bfa'
const GRID = '#1e1e2e'

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date()
  switch (period) {
    case 'week': return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
    case 'month': return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'quarter': return { start: startOfQuarter(now), end: endOfQuarter(now) }
    case 'year': return { start: startOfYear(now), end: endOfYear(now) }
  }
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="card-base" style={{ padding: '20px 24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
      <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(167,139,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--chronos-text)', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '3px' }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const { profile, canManageProjects } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')
  const [period, setPeriod] = useState<Period>('month')
  const [loading, setLoading] = useState(true)

  const [enrichedLogs, setEnrichedLogs] = useState<EnrichedLog[]>([])
  const [projectStats, setProjectStats] = useState<ProjectStat[]>([])
  const [employeeStats, setEmployeeStats] = useState<EmployeeStat[]>([])
  const [timesheetRows, setTimesheetRows] = useState<TimesheetRow[]>([])
  const [weeklyTrend, setWeeklyTrend] = useState<{ week: string; hours: number }[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})

  const fetchData = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    try {
      const { start, end } = getPeriodRange(period)
      const startStr = format(start, 'yyyy-MM-dd')
      const endStr = format(end, 'yyyy-MM-dd')

      // TIME LOGS — raw, no joins to avoid auth.users FK issue
      let logsQuery = supabase
        .from('time_logs')
        .select('hours, log_date, project_id, user_id')
        .gte('log_date', startStr)
        .lte('log_date', endStr)
      if (!canManageProjects) {
        logsQuery = logsQuery.eq('user_id', profile.id)
      }
      const { data: rawLogs } = await logsQuery
      const logs = (rawLogs || []) as { hours: number; log_date: string; project_id: string; user_id: string }[]

      // Collect unique IDs via object keys (avoids Set spread TS issue)
      const projIdMap: Record<string, true> = {}
      const userIdMap: Record<string, true> = {}
      for (const l of logs) { projIdMap[l.project_id] = true; userIdMap[l.user_id] = true }
      const projIds = Object.keys(projIdMap)
      const userIds = Object.keys(userIdMap)

      // Batch fetch projects and profiles
      const [projRes, profRes] = await Promise.all([
        projIds.length > 0
          ? supabase.from('projects').select('id, name, status, estimated_hours').in('id', projIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? supabase.from('profiles').select('id, full_name, department').in('id', userIds)
          : Promise.resolve({ data: [] }),
      ])

      const projMap: Record<string, { name: string; status: string; estimated_hours: number | null }> = {}
      for (const p of (projRes.data || []) as { id: string; name: string; status: string; estimated_hours: number | null }[]) {
        projMap[p.id] = { name: p.name, status: p.status, estimated_hours: p.estimated_hours }
      }
      const profMap: Record<string, { full_name: string; department: string }> = {}
      for (const p of (profRes.data || []) as { id: string; full_name: string; department: string }[]) {
        profMap[p.id] = { full_name: p.full_name, department: p.department || '' }
      }

      const enriched: EnrichedLog[] = logs.map(l => ({
        ...l,
        projectName: projMap[l.project_id]?.name || 'Unknown',
        userName: profMap[l.user_id]?.full_name || 'Unknown',
        department: profMap[l.user_id]?.department || '',
      }))
      setEnrichedLogs(enriched)

      // PROJECT STATS — hours + tasks
      if (projIds.length > 0) {
        const { data: taskData } = await supabase.from('tasks').select('project_id, status').in('project_id', projIds)
        const taskMap: Record<string, { total: number; done: number }> = {}
        for (const t of (taskData || []) as { project_id: string; status: string }[]) {
          if (!taskMap[t.project_id]) taskMap[t.project_id] = { total: 0, done: 0 }
          taskMap[t.project_id].total++
          if (t.status === 'completed') taskMap[t.project_id].done++
        }
        const hoursPerProject: Record<string, number> = {}
        for (const l of enriched) hoursPerProject[l.project_id] = (hoursPerProject[l.project_id] || 0) + l.hours

        setProjectStats(
          projIds.map(pid => {
            const proj = projMap[pid]
            const tasks = taskMap[pid] || { total: 0, done: 0 }
            const hours = hoursPerProject[pid] || 0
            const est = proj?.estimated_hours ?? null
            return {
              id: pid, name: proj?.name || 'Unknown', status: proj?.status || 'unknown',
              hours, estimated_hours: est,
              taskTotal: tasks.total, taskDone: tasks.done,
              taskPct: tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0,
              hoursPct: est ? Math.round((hours / est) * 100) : null,
            }
          }).sort((a, b) => b.hours - a.hours)
        )
      } else {
        setProjectStats([])
      }

      // EMPLOYEE STATS
      const hoursPerUser: Record<string, number> = {}
      for (const l of enriched) hoursPerUser[l.user_id] = (hoursPerUser[l.user_id] || 0) + l.hours
      setEmployeeStats(
        Object.keys(hoursPerUser).map(uid => ({
          id: uid, name: profMap[uid]?.full_name || 'Unknown',
          department: profMap[uid]?.department || '', hours: hoursPerUser[uid],
        })).sort((a, b) => b.hours - a.hours)
      )

      // WEEKLY TREND (last 8 weeks)
      const trendEnd = end > new Date() ? new Date() : end
      const trendStart = subWeeks(trendEnd, 7)
      const weeks = eachWeekOfInterval({ start: trendStart, end: trendEnd }, { weekStartsOn: 1 })
      setWeeklyTrend(weeks.map(ws => {
        const wEnd = endOfWeek(ws, { weekStartsOn: 1 })
        const wStartStr = format(ws, 'yyyy-MM-dd')
        const wEndStr = format(wEnd, 'yyyy-MM-dd')
        const hours = enriched.filter(l => l.log_date >= wStartStr && l.log_date <= wEndStr).reduce((s, l) => s + l.hours, 0)
        return { week: format(ws, 'MMM d'), hours: parseFloat(hours.toFixed(1)) }
      }))

      // TIMESHEETS
      let tsQuery = supabase
        .from('timesheets')
        .select('id, user_id, week_start_date, week_end_date, status, total_hours, submitted_at')
        .gte('week_start_date', startStr)
        .lte('week_start_date', endStr)
        .order('week_start_date', { ascending: false })
      if (!canManageProjects) tsQuery = tsQuery.eq('user_id', profile.id)

      const { data: tsRaw } = await tsQuery
      const tsData = (tsRaw || []) as { id: string; user_id: string; week_start_date: string; week_end_date: string; status: string; total_hours: number; submitted_at: string | null }[]

      // Fetch names for timesheet user IDs
      const tsUserIdMap: Record<string, true> = {}
      for (const t of tsData) tsUserIdMap[t.user_id] = true
      const tsUserIds = Object.keys(tsUserIdMap)
      const tsProfileMap: Record<string, string> = {}
      if (tsUserIds.length > 0) {
        const { data: tsProfData } = await supabase.from('profiles').select('id, full_name').in('id', tsUserIds)
        for (const p of (tsProfData || []) as { id: string; full_name: string }[]) tsProfileMap[p.id] = p.full_name
      }

      setTimesheetRows(tsData.map(t => ({ ...t, userName: tsProfileMap[t.user_id] || 'Unknown' })))
      setStatusCounts(tsData.reduce((m, t) => { m[t.status] = (m[t.status] || 0) + 1; return m }, {} as Record<string, number>))
    } catch {
      toast.error('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }, [profile, period, canManageProjects])

  useEffect(() => { fetchData() }, [fetchData])

  const totalHours = enrichedLogs.reduce((s, l) => s + l.hours, 0)
  const uniqueProjectCount = Object.keys(enrichedLogs.reduce((m, l) => { m[l.project_id] = true; return m }, {} as Record<string, true>)).length
  const uniquePeopleCount = Object.keys(enrichedLogs.reduce((m, l) => { m[l.user_id] = true; return m }, {} as Record<string, true>)).length
  const activeDays = Object.keys(enrichedLogs.reduce((m, l) => { m[l.log_date] = true; return m }, {} as Record<string, true>)).length
  const avgPerDay = activeDays > 0 ? totalHours / activeDays : 0

  // Department pie data
  const deptMap: Record<string, number> = {}
  for (const l of enrichedLogs) {
    const key = l.department || 'Unassigned'
    deptMap[key] = (deptMap[key] || 0) + l.hours
  }
  const deptData = Object.entries(deptMap).map(([name, hours]) => ({ name, hours: parseFloat(hours.toFixed(1)) })).sort((a, b) => b.hours - a.hours)

  const tsStatusBadgeColor: Record<string, string> = { draft: '#64748b', submitted: '#fbbf24', approved: '#34d399', rejected: '#f87171' }

  const exportCSV = () => {
    let rows: Record<string, unknown>[] = []
    let filename = 'report'

    if (tab === 'overview') {
      filename = `overview_${period}_${format(new Date(), 'yyyy-MM-dd')}`
      rows = enrichedLogs.map(l => ({ Date: l.log_date, Project: l.projectName, Employee: l.userName, Department: l.department, Hours: l.hours }))
    } else if (tab === 'projects') {
      filename = `projects_${period}_${format(new Date(), 'yyyy-MM-dd')}`
      rows = projectStats.map(p => ({
        Project: p.name, Status: p.status, 'Hours Logged': p.hours,
        'Estimated Hours': p.estimated_hours ?? '', 'Budget Used %': p.hoursPct != null ? `${p.hoursPct}%` : '',
        'Total Tasks': p.taskTotal, 'Completed Tasks': p.taskDone, 'Completion %': `${p.taskPct}%`,
      }))
    } else {
      filename = `timesheets_${period}_${format(new Date(), 'yyyy-MM-dd')}`
      rows = timesheetRows.map(t => ({
        Employee: t.userName, 'Week Start': t.week_start_date, 'Week End': t.week_end_date,
        Status: t.status, 'Total Hours': t.total_hours,
        'Submitted At': t.submitted_at ? format(new Date(t.submitted_at), 'yyyy-MM-dd HH:mm') : '',
      }))
    }

    if (rows.length === 0) { toast('No data to export'); return }

    const headers = Object.keys(rows[0])
    const escape = (v: unknown) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
    fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-display)',
    background: tab === t ? ACCENT : 'transparent',
    color: tab === t ? '#0f0f17' : 'var(--chronos-text-muted)',
    transition: 'all 0.15s',
  })

  const periodStyle = (p: Period): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: '6px',
    border: `1px solid ${period === p ? ACCENT : 'var(--chronos-border)'}`,
    cursor: 'pointer', fontSize: '12px', fontWeight: 600,
    background: period === p ? 'rgba(167,139,250,0.12)' : 'transparent',
    color: period === p ? ACCENT : 'var(--chronos-text-muted)',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Reports</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>Analytics and insights across your team</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {(['week', 'month', 'quarter', 'year'] as Period[]).map(p => (
            <button key={p} style={periodStyle(p)} onClick={() => setPeriod(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          <button className="btn-secondary" onClick={fetchData} disabled={loading} style={{ marginLeft: '4px' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
          <button className="btn-primary" onClick={exportCSV} disabled={loading}>
            <Download size={13} />Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: 'var(--chronos-surface-2)', borderRadius: '10px', padding: '4px', width: 'fit-content' }}>
        {(['overview', 'projects', 'timesheets'] as Tab[]).map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                <StatCard icon={<Clock size={20} />} label="Total Hours" value={`${totalHours.toFixed(1)}h`} sub={`${period} to date`} />
                <StatCard icon={<FolderKanban size={20} />} label="Active Projects" value={uniqueProjectCount} sub="with logged time" />
                <StatCard icon={<Users size={20} />} label="Team Members" value={uniquePeopleCount} sub="contributing" />
                <StatCard icon={<TrendingUp size={20} />} label="Avg / Active Day" value={`${avgPerDay.toFixed(1)}h`} sub={`across ${activeDays} day${activeDays !== 1 ? 's' : ''}`} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '16px' }}>
                {/* Weekly trend area chart */}
                <div className="card-base" style={{ padding: '20px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Weekly Hours Trend</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={weeklyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                      <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '8px', fontSize: '12px' }}
                        labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                        itemStyle={{ color: ACCENT }}
                        formatter={(v: number) => [`${v}h`, 'Hours']}
                      />
                      <Area type="monotone" dataKey="hours" stroke={ACCENT} strokeWidth={2} fill="url(#areaGrad)" dot={{ fill: ACCENT, r: 3, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Department donut */}
                <div className="card-base" style={{ padding: '20px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>By Department</div>
                  {deptData.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px', paddingTop: '60px' }}>No data for this period</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={deptData} dataKey="hours" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3}>
                            {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '8px', fontSize: '12px' }}
                            formatter={(v: number) => [`${v}h`, 'Hours']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '8px' }}>
                        {deptData.map((d, i) => (
                          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', flex: 1 }}>{d.name}</span>
                            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--chronos-text)', fontWeight: 600 }}>{d.hours}h</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Employees bar chart — managers only */}
              {canManageProjects && employeeStats.length > 0 && (
                <div className="card-base" style={{ padding: '20px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Hours by Team Member</div>
                  <ResponsiveContainer width="100%" height={Math.max(200, Math.min(employeeStats.length, 10) * 44)}>
                    <BarChart data={employeeStats.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 84 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip
                        contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(v: number) => [`${v}h`, 'Hours']}
                        cursor={{ fill: 'rgba(167,139,250,0.06)' }}
                      />
                      <Bar dataKey="hours" radius={[0, 6, 6, 0]}>
                        {employeeStats.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* PROJECTS TAB */}
          {tab === 'projects' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {projectStats.length === 0 ? (
                <div className="card-base" style={{ padding: '60px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '14px' }}>
                  No project data for this period
                </div>
              ) : (
                <>
                  <div className="card-base" style={{ padding: '20px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Hours Logged per Project</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={projectStats.slice(0, 10)} margin={{ top: 4, right: 4, bottom: 24, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '8px', fontSize: '12px' }}
                          formatter={(v: number) => [`${v.toFixed(1)}h`, 'Hours']}
                          cursor={{ fill: 'rgba(167,139,250,0.06)' }}
                        />
                        <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                          {projectStats.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card-base" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--chronos-border)', display: 'grid', gridTemplateColumns: '1fr 80px 100px 130px 120px', gap: '12px' }}>
                      {['Project', 'Status', 'Hours', 'Budget Used', 'Task Progress'].map(h => (
                        <span key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                      ))}
                    </div>
                    {projectStats.map((p, i) => (
                      <div key={p.id} className="table-row" style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 80px 100px 130px 120px', gap: '12px', alignItems: 'center', borderBottom: i < projectStats.length - 1 ? '1px solid var(--chronos-border)' : 'none' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--chronos-text)' }}>{p.name}</span>
                        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '100px', background: 'var(--chronos-surface-2)', color: 'var(--chronos-text-muted)', width: 'fit-content', textTransform: 'capitalize' }}>{p.status}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: ACCENT }}>{p.hours.toFixed(1)}h</span>
                        <div>
                          {p.hoursPct != null ? (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)' }}>{p.hoursPct}% of {p.estimated_hours}h</span>
                              </div>
                              <div style={{ height: '4px', borderRadius: '2px', background: 'var(--chronos-surface-2)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: '2px', width: `${Math.min(p.hoursPct, 100)}%`, background: p.hoursPct > 100 ? '#f87171' : p.hoursPct > 80 ? '#fbbf24' : ACCENT }} />
                              </div>
                            </>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>No estimate</span>
                          )}
                        </div>
                        <div>
                          {p.taskTotal > 0 ? (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)' }}>{p.taskDone}/{p.taskTotal} ({p.taskPct}%)</span>
                              </div>
                              <div style={{ height: '4px', borderRadius: '2px', background: 'var(--chronos-surface-2)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: '2px', width: `${p.taskPct}%`, background: '#34d399' }} />
                              </div>
                            </>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>No tasks</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TIMESHEETS TAB */}
          {tab === 'timesheets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Status summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {(['draft', 'submitted', 'approved', 'rejected'] as const).map(s => {
                  const color = tsStatusBadgeColor[s]
                  return (
                    <div key={s} className="card-base" style={{ padding: '18px 20px' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}60` }} />
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', fontWeight: 600, textTransform: 'capitalize', marginBottom: '2px' }}>{s}</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 800, color: 'var(--chronos-text)', lineHeight: 1 }}>{statusCounts[s] || 0}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Timesheet table */}
              <div className="card-base" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--chronos-border)', display: 'grid', gridTemplateColumns: canManageProjects ? '1.4fr 1.2fr 1fr 100px 80px' : '1.4fr 1.2fr 100px 80px', gap: '12px' }}>
                  {[canManageProjects ? 'Employee' : null, 'Week', 'Submitted', 'Status', 'Hours'].filter(Boolean).map(h => (
                    <span key={h!} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                  ))}
                </div>
                {timesheetRows.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>No timesheets for this period</div>
                ) : (
                  timesheetRows.map((t, i) => (
                    <div key={t.id} className="table-row" style={{ padding: '13px 20px', display: 'grid', gridTemplateColumns: canManageProjects ? '1.4fr 1.2fr 1fr 100px 80px' : '1.4fr 1.2fr 100px 80px', gap: '12px', alignItems: 'center', borderBottom: i < timesheetRows.length - 1 ? '1px solid var(--chronos-border)' : 'none' }}>
                      {canManageProjects && <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--chronos-text)' }}>{t.userName}</span>}
                      <span style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>
                        {format(new Date(t.week_start_date + 'T00:00:00'), 'MMM d')} – {format(new Date(t.week_end_date + 'T00:00:00'), 'MMM d, yyyy')}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>
                        {t.submitted_at ? format(new Date(t.submitted_at), 'MMM d, HH:mm') : '—'}
                      </span>
                      <span style={{
                        fontSize: '11px', padding: '3px 9px', borderRadius: '100px',
                        border: `1px solid ${tsStatusBadgeColor[t.status]}40`,
                        color: tsStatusBadgeColor[t.status],
                        background: `${tsStatusBadgeColor[t.status]}15`,
                        width: 'fit-content', fontWeight: 600, textTransform: 'capitalize',
                      }}>
                        {t.status}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: ACCENT }}>{t.total_hours.toFixed(1)}h</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
