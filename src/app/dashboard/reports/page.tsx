'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatHours } from '@/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts'
import { BarChart3, TrendingUp, Users, FolderKanban, Clock } from 'lucide-react'
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'

const supabase = createClient()

const COLORS = ['#3b82f6', '#8b5cf6', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#6ee7b7']

type ReportPeriod = 'week' | 'month' | 'year'

export default function ReportsPage() {
  const { profile, isAdmin, canManageProjects } = useAuth()
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [loading, setLoading] = useState(true)
  const [reportTab, setReportTab] = useState<'company' | 'project' | 'timesheet'>('company')

  // Company level data
  const [totalHours, setTotalHours] = useState(0)
  const [hoursByProject, setHoursByProject] = useState<{ name: string; hours: number }[]>([])
  const [hoursByEmployee, setHoursByEmployee] = useState<{ name: string; hours: number }[]>([])
  const [hoursByDept, setHoursByDept] = useState<{ name: string; hours: number }[]>([])
  const [timesheetStats, setTimesheetStats] = useState({ pending: 0, approved: 0, rejected: 0, draft: 0 })
  const [weeklyTrend, setWeeklyTrend] = useState<{ week: string; hours: number }[]>([])

  useEffect(() => { fetchReports() }, [period])

  const getDateRange = () => {
    const now = new Date()
    if (period === 'week') return { start: subDays(now, 7), end: now }
    if (period === 'month') return { start: startOfMonth(now), end: endOfMonth(now) }
    return { start: subMonths(now, 12), end: now }
  }

  const fetchReports = async () => {
    setLoading(true)
    const { start, end } = getDateRange()
    const startStr = format(start, 'yyyy-MM-dd')
    const endStr = format(end, 'yyyy-MM-dd')

    // Time logs in period
    const { data: logs } = await supabase
      .from('time_logs')
      .select('hours, log_date, project:projects(name), user:profiles(full_name, department)')
      .gte('log_date', startStr)
      .lte('log_date', endStr)

    if (logs) {
      const total = logs.reduce((s, l) => s + l.hours, 0)
      setTotalHours(total)

      // By project
      const projMap: Record<string, number> = {}
      logs.forEach(l => {
        const name = (l.project as unknown as { name: string } | null)?.name || 'Unknown'
        projMap[name] = (projMap[name] || 0) + l.hours
      })
      setHoursByProject(Object.entries(projMap).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours).slice(0, 8))

      // By employee
      const empMap: Record<string, number> = {}
      logs.forEach(l => {
        const name = (l.user as unknown as { full_name: string } | null)?.full_name || 'Unknown'
        empMap[name] = (empMap[name] || 0) + l.hours
      })
      setHoursByEmployee(Object.entries(empMap).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours).slice(0, 10))

      // By department
      const deptMap: Record<string, number> = {}
      logs.forEach(l => {
        const dept = (l.user as { department?: string } | null)?.department || 'Unassigned'
        deptMap[dept] = (deptMap[dept] || 0) + l.hours
      })
      setHoursByDept(Object.entries(deptMap).map(([name, hours]) => ({ name, hours })))

      // Weekly trend (last 8 weeks)
      const weeks: { week: string; hours: number }[] = []
      for (let i = 7; i >= 0; i--) {
        const weekStart = subDays(new Date(), i * 7 + 6)
        const weekEnd = subDays(new Date(), i * 7)
        const weekLogs = logs.filter(l => {
          const d = new Date(l.log_date)
          return d >= weekStart && d <= weekEnd
        })
        weeks.push({ week: format(weekStart, 'MMM d'), hours: weekLogs.reduce((s, l) => s + l.hours, 0) })
      }
      setWeeklyTrend(weeks)
    }

    // Timesheet stats
    const { data: tsData } = await supabase
      .from('timesheets')
      .select('status')
      .gte('week_start_date', startStr)
    if (tsData) {
      setTimesheetStats({
        pending: tsData.filter(t => t.status === 'submitted').length,
        approved: tsData.filter(t => t.status === 'approved').length,
        rejected: tsData.filter(t => t.status === 'rejected').length,
        draft: tsData.filter(t => t.status === 'draft').length,
      })
    }

    setLoading(false)
  }

  const tooltipStyle = {
    contentStyle: { background: 'var(--chronos-surface)', border: '1px solid var(--chronos-border)', borderRadius: '10px', fontFamily: 'DM Sans, sans-serif', fontSize: '13px' },
    labelStyle: { color: 'var(--chronos-text)' },
    itemStyle: { color: 'var(--chronos-accent)' },
  }

  const tsTotal = Object.values(timesheetStats).reduce((a, b) => a + b, 0)
  const tsPieData = [
    { name: 'Approved', value: timesheetStats.approved, color: '#34d399' },
    { name: 'Pending', value: timesheetStats.pending, color: '#fbbf24' },
    { name: 'Rejected', value: timesheetStats.rejected, color: '#f87171' },
    { name: 'Draft', value: timesheetStats.draft, color: '#64748b' },
  ].filter(d => d.value > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Reports</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>Analytics and insights</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', background: 'var(--chronos-surface)', border: '1px solid var(--chronos-border)', borderRadius: '10px', padding: '4px' }}>
          {(['week', 'month', 'year'] as ReportPeriod[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '6px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none',
              background: period === p ? 'var(--chronos-accent)' : 'transparent',
              color: period === p ? 'white' : 'var(--chronos-text-muted)',
              transition: 'all 0.15s',
            }}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--chronos-border)', paddingBottom: '0' }}>
        {[
          { key: 'company', label: 'Company', icon: <BarChart3 size={14} /> },
          { key: 'project', label: 'Projects', icon: <FolderKanban size={14} /> },
          { key: 'timesheet', label: 'Timesheets', icon: <Clock size={14} /> },
        ].map(tab => (
          <button key={tab.key} onClick={() => setReportTab(tab.key as typeof reportTab)} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', border: 'none', cursor: 'pointer',
            background: 'transparent', fontSize: '13px', fontWeight: 500,
            color: reportTab === tab.key ? 'var(--chronos-accent)' : 'var(--chronos-text-muted)',
            borderBottom: reportTab === tab.key ? '2px solid var(--chronos-accent)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* Company Tab */}
          {reportTab === 'company' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                {[
                  { label: 'Total Hours', value: formatHours(totalHours), color: '#3b82f6', icon: <Clock size={18} /> },
                  { label: 'Projects', value: hoursByProject.length, color: '#8b5cf6', icon: <FolderKanban size={18} /> },
                  { label: 'Team Members', value: hoursByEmployee.length, color: '#34d399', icon: <Users size={18} /> },
                  { label: 'Timesheets', value: tsTotal, color: '#fbbf24', icon: <BarChart3 size={18} /> },
                ].map(kpi => (
                  <div key={kpi.label} className="card-base" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${kpi.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: kpi.color }}>{kpi.icon}</div>
                    </div>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>{kpi.value}</div>
                    <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Trend + by project */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="card-base" style={{ padding: '20px' }}>
                  <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Weekly Hours Trend</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={weeklyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chronos-border)" vertical={false} />
                      <XAxis dataKey="week" tick={{ fill: 'var(--chronos-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--chronos-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}h`, 'Hours']} />
                      <Line type="monotone" dataKey="hours" stroke="var(--chronos-accent)" strokeWidth={2.5} dot={{ fill: 'var(--chronos-accent)', r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="card-base" style={{ padding: '20px' }}>
                  <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Hours by Department</h3>
                  {hoursByDept.length === 0 ? (
                    <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={hoursByDept} dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={3}>
                          {hoursByDept.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}h`]} />
                        <Legend wrapperStyle={{ fontSize: '12px', fontFamily: 'DM Sans, sans-serif', color: 'var(--chronos-text-muted)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Employee hours */}
              <div className="card-base" style={{ padding: '20px' }}>
                <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Hours by Team Member</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={hoursByEmployee} layout="vertical" barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chronos-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'var(--chronos-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fill: 'var(--chronos-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}h`, 'Hours']} />
                    <Bar dataKey="hours" fill="var(--chronos-accent-2)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Project Tab */}
          {reportTab === 'project' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="card-base" style={{ padding: '20px' }}>
                <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Hours by Project</h3>
                {hoursByProject.length === 0 ? (
                  <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>No project hours in this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={hoursByProject} barSize={32}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chronos-border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: 'var(--chronos-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--chronos-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}h`, 'Hours']} />
                      <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                        {hoursByProject.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Project hours table */}
              <div className="card-base" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--chronos-border)' }}>
                  <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700 }}>Project Breakdown</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--chronos-border)', background: 'var(--chronos-surface-2)' }}>
                      {['Project', 'Hours Logged', '% of Total'].map(h => (
                        <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hoursByProject.map((p, i) => (
                      <tr key={p.name} className="table-row">
                        <td style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: 500 }}>{p.name}</span>
                        </td>
                        <td style={{ padding: '12px 20px', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', color: 'var(--chronos-text)' }}>{formatHours(p.hours)}</td>
                        <td style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--chronos-text-muted)' }}>
                          {totalHours ? Math.round((p.hours / totalHours) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Timesheet Tab */}
          {reportTab === 'timesheet' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                {[
                  { label: 'Pending', value: timesheetStats.pending, color: '#fbbf24' },
                  { label: 'Approved', value: timesheetStats.approved, color: '#34d399' },
                  { label: 'Rejected', value: timesheetStats.rejected, color: '#f87171' },
                  { label: 'Draft', value: timesheetStats.draft, color: '#64748b' },
                ].map(s => (
                  <div key={s.label} className="card-base" style={{ padding: '20px', textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
                    <div style={{ fontSize: '32px', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', marginTop: '6px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="card-base" style={{ padding: '20px' }}>
                <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Timesheet Status Distribution</h3>
                {tsPieData.length === 0 ? (
                  <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>No timesheets in this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={tsPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} paddingAngle={4} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
                        {tsPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: '13px', fontFamily: 'DM Sans, sans-serif' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
