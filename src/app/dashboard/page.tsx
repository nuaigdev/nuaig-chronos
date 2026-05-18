'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/hooks/useProfile'
import { useIsMobile } from '@/hooks/useIsMobile'
import { StatCard, ProgressBar, SectionHeader } from '@/components/ui'
import { formatHours, formatDate, getWeekRange } from '@/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { Clock, FolderKanban, CheckSquare, Calendar, AlertCircle, Users, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react'
import Link from 'next/link'

const supabase = createClient()

const DEPT_COLORS = [
  '#3b82f6', '#8b5cf6', '#34d399', '#f59e0b',
  '#ef4444', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#6366f1',
]
const STATUS_COLORS: Record<string, string> = {
  draft: '#64748b',
  submitted: '#f59e0b',
  approved: '#34d399',
  rejected: '#ef4444',
}

interface DashboardStats {
  totalHoursThisWeek: number
  totalProjectsActive: number
  pendingTimesheets: number
  teamSize: number
  recentTimeLogs: Array<{ date: string; hours: number }>
  activeProjects: Array<{ id: string; name: string; client_name: string; logged: number; estimated: number; status: string }>
  pendingApprovals: number
  hoursToday: number
}

interface TeamMember {
  id: string
  name: string
  department: string
}

interface BarKey {
  key: string
  color: string
}

interface UtilizationEntry {
  id: string
  name: string
  department: string
  color: string
  hoursThisWeek: number
  utilization: number
  capacityHours: number
}

interface TeamStats {
  avgUtilization: number
  teamMembersCount: number
  activeMembersCount: number
  teamPendingApprovals: number
  dailyHours: Record<string, string | number>[]
  barKeys: BarKey[]
  chartSubtitle: string
  utilizationData: UtilizationEntry[]
  timesheetStatus: { status: string; count: number }[]
  members: TeamMember[]
  deptColorMap: Record<string, string>
  legendKeys: { label: string; color: string }[]
}

function HistogramTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const total = (payload as Array<{ value: number }>).reduce((sum, p) => sum + (Number(p.value) || 0), 0)
  return (
    <div style={{ background: 'var(--chronos-surface)', border: '1px solid var(--chronos-border)', borderRadius: '10px', padding: '8px 12px', fontFamily: 'DM Sans, sans-serif', fontSize: '12px' }}>
      <div style={{ color: 'var(--chronos-text-muted)', marginBottom: '4px' }}>Day {label}</div>
      <div style={{ fontWeight: 700, color: 'var(--chronos-text)', fontSize: '14px' }}>{total}h total</div>
    </div>
  )
}

export default function DashboardPage() {
  const { profile, loading: authLoading, canManageProjects } = useProfile()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'personal' | 'team'>('personal')
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null)
  const [teamLoading, setTeamLoading] = useState(false)
  const isMobile = useIsMobile()

  // ─── Personal stats ──────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    try {
      const { start: weekStart, end: weekEnd } = getWeekRange()
      const today = formatDate(new Date(), 'yyyy-MM-dd')

      const { data: weekLogs } = await supabase
        .from('time_logs')
        .select('hours, log_date')
        .eq('user_id', profile.id)
        .gte('log_date', formatDate(weekStart, 'yyyy-MM-dd'))
        .lte('log_date', formatDate(weekEnd, 'yyyy-MM-dd'))

      const hoursToday = (weekLogs?.filter(l => l.log_date === today) || []).reduce((s, l) => s + l.hours, 0)
      const totalHoursThisWeek = weekLogs?.reduce((s, l) => s + l.hours, 0) || 0

      const projectsPromise = (async () => {
        let q = supabase.from('projects').select(`*, client:clients(name), time_logs(hours)`).eq('status', 'active')
        if (!canManageProjects) {
          const { data: mp } = await supabase.from('project_members').select('project_id').eq('user_id', profile.id)
          const ids = mp?.map(p => p.project_id) || []
          if (ids.length > 0) q = q.in('id', ids)
          else return []
        }
        const { data: projects } = await q.limit(5)
        return (projects || []).map(p => ({
          id: p.id,
          name: p.name,
          client_name: (p.client as { name: string } | null)?.name || 'No Client',
          logged: (p.time_logs as { hours: number }[])?.reduce((s: number, l: { hours: number }) => s + l.hours, 0) || 0,
          estimated: p.estimated_hours || 0,
          status: p.status,
        }))
      })()

      const [activeProjects, teamRes, approvalsRes, ownRes] = await Promise.all([
        projectsPromise,
        canManageProjects
          ? supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true)
          : Promise.resolve({ count: 0 }),
        canManageProjects
          ? supabase.from('timesheets').select('*', { count: 'exact', head: true }).eq('status', 'submitted')
          : Promise.resolve({ count: 0 }),
        supabase.from('timesheets').select('*', { count: 'exact', head: true }).eq('user_id', profile.id).eq('status', 'draft'),
      ])

      // Mon–Sun of the current week
      const recentTimeLogs = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        const dateStr = formatDate(d, 'yyyy-MM-dd')
        return {
          date: formatDate(d, 'EEE'),
          hours: weekLogs?.filter(l => l.log_date === dateStr).reduce((s, l) => s + l.hours, 0) || 0,
        }
      })

      setStats({
        totalHoursThisWeek,
        totalProjectsActive: activeProjects.length,
        pendingTimesheets: ownRes.count || 0,
        teamSize: teamRes.count || 0,
        recentTimeLogs,
        activeProjects,
        pendingApprovals: approvalsRes.count || 0,
        hoursToday,
      })
    } finally {
      setLoading(false)
    }
  }, [profile, canManageProjects])

  // ─── Team stats ───────────────────────────────────────────────────────────
  const fetchTeamStats = useCallback(async () => {
    if (!profile || !canManageProjects) return
    setTeamLoading(true)
    try {
      const now = new Date()
      const { start: weekStart } = getWeekRange()
      const weekStartStr = formatDate(weekStart, 'yyyy-MM-dd')
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      const weekEndStr = formatDate(weekEnd, 'yyyy-MM-dd')
      const todayStr = formatDate(now, 'yyyy-MM-dd')
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthStartStr = formatDate(monthStart, 'yyyy-MM-dd')

      // Weekdays elapsed in current week (Mon–today), used for utilization capacity
      const weekdaysElapsed = [0, 1, 2, 3, 4].filter(i => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        return d <= now
      }).length
      const capacityHours = Math.max(weekdaysElapsed * 8, 1)

      // Fetch team members — managers see their dept only, admins see all
      let membersQuery = supabase.from('profiles').select('id, full_name, department, role').eq('is_active', true)
      if (profile.role === 'manager') membersQuery = membersQuery.eq('manager_id', profile.id)

      const { data: membersRaw } = await membersQuery
      const members: TeamMember[] = (membersRaw || []).map(m => ({
        id: m.id,
        name: m.full_name,
        department: (m.department as string | null) || 'Unassigned',
      }))

      if (members.length === 0) {
        setTeamStats({
          avgUtilization: 0, teamMembersCount: 0, activeMembersCount: 0, teamPendingApprovals: 0,
          dailyHours: [], barKeys: [], chartSubtitle: '',
          utilizationData: [], timesheetStatus: [], members: [], deptColorMap: {}, legendKeys: [],
        })
        return
      }

      const memberIds = members.map(m => m.id)
      const departments = Array.from(new Set(members.map(m => m.department)))
      const deptColorMap: Record<string, string> = {}
      departments.forEach((dept, i) => { deptColorMap[dept] = DEPT_COLORS[i % DEPT_COLORS.length] })

      // Fetch time logs (month range) and timesheets in parallel
      const [{ data: timeLogs }, { data: timesheets }] = await Promise.all([
        supabase
          .from('time_logs')
          .select('user_id, log_date, hours')
          .in('user_id', memberIds)
          .gte('log_date', monthStartStr)
          .lte('log_date', todayStr),
        supabase
          .from('timesheets')
          .select('user_id, status')
          .in('user_id', memberIds)
          .eq('week_start_date', weekStartStr),
      ])

      // ── Timesheet status ──────────────────────────────────────
      const statusPriority: Record<string, number> = { draft: 0, submitted: 1, rejected: 2, approved: 3 }
      const userStatusMap: Record<string, string> = {}
      timesheets?.forEach(t => {
        const cur = userStatusMap[t.user_id]
        if (!cur || statusPriority[t.status] > statusPriority[cur]) userStatusMap[t.user_id] = t.status
      })
      const statusCount: Record<string, number> = {}
      Object.values(userStatusMap).forEach(s => { statusCount[s] = (statusCount[s] || 0) + 1 })
      const noSheet = memberIds.length - Object.keys(userStatusMap).length
      if (noSheet > 0) statusCount.draft = (statusCount.draft || 0) + noSheet
      const timesheetStatus = Object.entries(statusCount).map(([status, count]) => ({ status, count }))

      // ── Scorecards ────────────────────────────────────────────
      const weekLogsThisWeek = timeLogs?.filter(l => l.log_date >= weekStartStr && l.log_date <= weekEndStr) || []
      const activeMembersCount = new Set(weekLogsThisWeek.map(l => l.user_id)).size
      const teamPendingApprovals = Object.values(userStatusMap).filter(s => s === 'submitted').length

      // ── Utilization per member (40h/week, 8h/day) ────────────
      const utilizationData: UtilizationEntry[] = members.map(m => {
        const hoursThisWeek = weekLogsThisWeek.filter(l => l.user_id === m.id).reduce((s, l) => s + l.hours, 0)
        return {
          id: m.id,
          name: m.name,
          department: m.department,
          color: deptColorMap[m.department],
          hoursThisWeek,
          utilization: Math.round((hoursThisWeek / capacityHours) * 100),
          capacityHours,
        }
      })
      const avgUtilization = utilizationData.length > 0
        ? Math.round(utilizationData.reduce((s, u) => s + u.utilization, 0) / utilizationData.length)
        : 0

      // ── Month daily hours histogram (weekdays only, up to today) ──
      const weekdayDates: { label: string; dateStr: string }[] = []
      const curDate = new Date(monthStart)
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      while (curDate <= todayDate) {
        const dow = curDate.getDay()
        if (dow !== 0 && dow !== 6) {
          weekdayDates.push({ label: formatDate(curDate, 'd'), dateStr: formatDate(curDate, 'yyyy-MM-dd') })
        }
        curDate.setDate(curDate.getDate() + 1)
      }

      let dailyHours: Record<string, string | number>[]
      let barKeys: BarKey[]
      let chartSubtitle: string
      let legendKeys: { label: string; color: string }[]

      if (profile.role === 'admin') {
        // Admin: stacked by department
        dailyHours = weekdayDates.map(({ label, dateStr }) => {
          const row: Record<string, string | number> = { date: label }
          departments.forEach(dept => {
            const deptIds = members.filter(m => m.department === dept).map(m => m.id)
            row[dept] = timeLogs?.filter(l => deptIds.includes(l.user_id) && l.log_date === dateStr).reduce((s, l) => s + l.hours, 0) || 0
          })
          return row
        })
        barKeys = departments.map(dept => ({ key: dept, color: deptColorMap[dept] }))
        legendKeys = barKeys.map(b => ({ label: b.key, color: b.color }))
        chartSubtitle = 'All departments • Stacked by department'
      } else {
        // Manager: stacked by individual resource, each resource gets a distinct color
        dailyHours = weekdayDates.map(({ label, dateStr }) => {
          const row: Record<string, string | number> = { date: label }
          members.forEach(m => {
            row[m.name] = timeLogs?.filter(l => l.user_id === m.id && l.log_date === dateStr).reduce((s, l) => s + l.hours, 0) || 0
          })
          return row
        })
        barKeys = members.map((m, i) => ({ key: m.name, color: DEPT_COLORS[i % DEPT_COLORS.length] }))
        legendKeys = barKeys.map(b => ({ label: b.key, color: b.color }))
        chartSubtitle = 'Your direct reports • Stacked by resource'
      }

      setTeamStats({
        avgUtilization, teamMembersCount: members.length, activeMembersCount, teamPendingApprovals,
        dailyHours, barKeys, chartSubtitle,
        utilizationData, timesheetStatus, members, deptColorMap, legendKeys,
      })
    } finally {
      setTeamLoading(false)
    }
  }, [profile, canManageProjects])

  useEffect(() => {
    if (authLoading || !profile) return
    fetchStats()
  }, [authLoading, profile?.id, fetchStats])

  useEffect(() => {
    if (activeTab === 'team' && canManageProjects && !teamStats && !teamLoading) {
      fetchTeamStats()
    }
  }, [activeTab, canManageProjects, teamStats, teamLoading, fetchTeamStats])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  const chartTooltipStyle = {
    contentStyle: { background: 'var(--chronos-surface)', border: '1px solid var(--chronos-border)', borderRadius: '10px', fontFamily: 'DM Sans, sans-serif', fontSize: '12px' },
    labelStyle: { color: 'var(--chronos-text)' },
    itemStyle: { color: 'var(--chronos-text-muted)' },
  }
  const axisProps = {
    tick: { fill: 'var(--chronos-text-muted)', fontSize: 11, fontFamily: 'DM Sans, sans-serif' },
    axisLine: false as const,
    tickLine: false as const,
  }

  // ── Stat cards (switch based on active tab) ──────────────────────────────
  const renderStatCards = () => {
    if (activeTab === 'team' && canManageProjects) {
      if (teamLoading || !teamStats) {
        return [1, 2, 3, 4].map(i => (
          <div key={i} className="card-base" style={{ height: '100px', opacity: 0.4, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))
      }
      return (
        <>
          <StatCard
            label="Avg Utilization"
            value={`${teamStats.avgUtilization}%`}
            icon={<TrendingUp size={18} />}
            accent="#3b82f6"
          />
          <StatCard
            label="Team Members"
            value={teamStats.teamMembersCount}
            icon={<Users size={18} />}
            accent="#8b5cf6"
          />
          <StatCard
            label="Active This Week"
            value={`${teamStats.activeMembersCount}/${teamStats.teamMembersCount}`}
            icon={<TrendingUp size={18} />}
            accent="#34d399"
          />
          <StatCard
            label="Timesheets Pending"
            value={teamStats.teamPendingApprovals}
            icon={<CheckSquare size={18} />}
            accent="#fbbf24"
          />
        </>
      )
    }

    return (
      <>
        <StatCard label="Hours This Week" value={formatHours(stats?.totalHoursThisWeek || 0)} icon={<Clock size={18} />} trend={{ value: 5, label: 'vs last week' }} accent="#3b82f6" />
        <StatCard label="Hours Today" value={formatHours(stats?.hoursToday || 0)} icon={<Calendar size={18} />} accent="#8b5cf6" />
        <StatCard label="Active Projects" value={stats?.totalProjectsActive || 0} icon={<FolderKanban size={18} />} accent="#34d399" />
        {canManageProjects
          ? <StatCard label="Pending Approvals" value={stats?.pendingApprovals || 0} icon={<CheckSquare size={18} />} accent="#fbbf24" />
          : <StatCard label="Draft Timesheets" value={stats?.pendingTimesheets || 0} icon={<CheckSquare size={18} />} accent="#fbbf24" />
        }
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '12px' : '0' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: isMobile ? '20px' : '24px', fontWeight: 800, letterSpacing: '-0.03em' }}>
            {greeting()}, <span className="gradient-text">{profile?.full_name?.split(' ')[0]}</span> 👋
          </h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: isMobile ? '12px' : '14px', marginTop: '4px' }}>
            {formatDate(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {stats && stats.pendingApprovals > 0 && canManageProjects && (
            <Link href="/dashboard/approvals">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '10px', padding: '8px 14px', cursor: 'pointer', transition: 'all 0.2s' }}>
                <AlertCircle size={14} style={{ color: 'var(--chronos-warning)' }} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-warning)' }}>
                  {stats.pendingApprovals} timesheet{stats.pendingApprovals > 1 ? 's' : ''} pending approval
                </span>
              </div>
            </Link>
          )}
          {canManageProjects && (
            <div style={{ display: 'flex', gap: '4px', background: 'var(--chronos-surface-2)', borderRadius: '10px', padding: '4px' }}>
              {(['personal', 'team'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: activeTab === tab ? 'var(--chronos-surface)' : 'transparent',
                    color: activeTab === tab ? 'var(--chronos-text)' : 'var(--chronos-text-muted)',
                    fontSize: '13px', fontWeight: activeTab === tab ? 600 : 400,
                    fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                  }}
                >
                  {tab === 'team' && <Users size={14} />}
                  {tab === 'personal' ? 'My View' : 'My Team'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? '10px' : '16px' }}>
        {renderStatCards()}
      </div>

      {/* ── Personal tab ─────────────────────────────────────────────────── */}
      {activeTab === 'personal' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '16px' : '20px' }}>
          <div className="card-base" style={{ padding: isMobile ? '16px' : '20px' }}>
            <SectionHeader title="Hours This Week" subtitle="Mon – Sun • Current week" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats?.recentTimeLogs || []} barSize={isMobile ? 20 : 28}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chronos-border)" vertical={false} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip {...chartTooltipStyle} itemStyle={{ color: 'var(--chronos-accent)' }} formatter={(v: number) => [`${v}h`, 'Hours']} />
                <Bar dataKey="hours" fill="var(--chronos-accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card-base" style={{ padding: isMobile ? '16px' : '20px' }}>
            <SectionHeader
              title="Active Projects"
              action={<Link href="/dashboard/projects"><span style={{ fontSize: '13px', color: 'var(--chronos-accent)', cursor: 'pointer' }}>View all →</span></Link>}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats?.activeProjects.length === 0 ? (
                <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No active projects</p>
              ) : (
                stats?.activeProjects.map(p => (
                  <Link href={`/dashboard/projects/${p.id}`} key={p.id} style={{ textDecoration: 'none' }}>
                    <div
                      style={{ padding: '12px', borderRadius: '10px', background: 'var(--chronos-surface-2)', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--chronos-border)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--chronos-surface-2)')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--chronos-text)' }}>{p.name}</span>
                        <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{formatHours(p.logged)} / {p.estimated ? formatHours(p.estimated) : '—'}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', marginBottom: '8px' }}>{p.client_name}</div>
                      <ProgressBar value={p.logged} max={p.estimated || p.logged || 1} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Team tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'team' && canManageProjects && (
        teamLoading || !teamStats ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : teamStats.members.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '280px', gap: '12px', color: 'var(--chronos-text-muted)' }}>
            <Users size={36} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: '14px' }}>No team members found</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Colour legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', fontWeight: 500 }}>
                {profile?.role === 'admin' ? 'Departments:' : 'Resources:'}
              </span>
              {teamStats.legendKeys.map(({ label, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Daily hours histogram — full width */}
            <div className="card-base" style={{ padding: isMobile ? '16px' : '20px' }}>
              <SectionHeader
                title={`Daily Hours — ${formatDate(new Date(), 'MMMM yyyy')}`}
                subtitle={teamStats.chartSubtitle + ' • Weekdays only'}
              />
              {teamStats.dailyHours.length === 0 ? (
                <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>No data yet this month</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={teamStats.dailyHours} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chronos-border)" vertical={false} />
                    <XAxis dataKey="date" {...axisProps} interval="preserveStartEnd" />
                    <YAxis {...axisProps} />
                    <Tooltip content={<HistogramTooltip />} />
                    {teamStats.barKeys.map(({ key, color }, idx) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        stackId="stack"
                        fill={color}
                        radius={idx === teamStats.barKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Utilization ranking + Timesheet status */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>

              {/* Over / under utilization */}
              <div className="card-base" style={{ padding: isMobile ? '16px' : '20px' }}>
                <SectionHeader title="Resource Utilization" subtitle={`This week • ${teamStats.utilizationData[0]?.capacityHours ?? 0}h capacity per person`} />
                {(() => {
                  const sorted = [...teamStats.utilizationData].sort((a, b) => b.utilization - a.utilization)
                  const topIds = new Set(sorted.slice(0, 3).map(u => u.id))
                  const overList = sorted.slice(0, Math.min(3, sorted.length))
                  const underList = [...sorted].reverse().filter(u => !topIds.has(u.id)).slice(0, 3)

                  const renderRow = (u: UtilizationEntry, isOver: boolean) => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: u.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: 'var(--chronos-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', whiteSpace: 'nowrap' }}>{formatHours(u.hoursThisWeek)}</span>
                      <span style={{
                        fontSize: '12px', fontWeight: 700, minWidth: '42px', textAlign: 'right',
                        color: u.utilization > 100 ? '#ef4444' : u.utilization < 50 ? '#f59e0b' : 'var(--chronos-text)',
                      }}>{u.utilization}%</span>
                    </div>
                  )

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px' }}>
                          <ArrowUp size={12} style={{ color: '#ef4444' }} />
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Over-utilized</span>
                        </div>
                        {overList.map(u => renderRow(u, true))}
                      </div>
                      {underList.length > 0 && (
                        <div style={{ paddingTop: '4px', borderTop: '1px solid var(--chronos-border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px', marginTop: '12px' }}>
                            <ArrowDown size={12} style={{ color: '#f59e0b' }} />
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Under-utilized</span>
                          </div>
                          {underList.map(u => renderRow(u, false))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Timesheet status donut */}
              <div className="card-base" style={{ padding: isMobile ? '16px' : '20px' }}>
                <SectionHeader title="Timesheet Status" subtitle="Current week" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ flex: '0 0 160px' }}>
                    <PieChart width={160} height={160}>
                      <Pie data={teamStats.timesheetStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3}>
                        {teamStats.timesheetStatus.map((e, i) => <Cell key={i} fill={STATUS_COLORS[e.status] || '#64748b'} />)}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle.contentStyle} formatter={(v: number, name: string) => [v, name]} />
                    </PieChart>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                    {teamStats.timesheetStatus.map(s => (
                      <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: STATUS_COLORS[s.status] || '#64748b', flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', textTransform: 'capitalize', flex: 1 }}>{s.status}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--chronos-text)' }}>{s.count}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: '4px', paddingTop: '10px', borderTop: '1px solid var(--chronos-border)', fontSize: '11px', color: 'var(--chronos-text-muted)' }}>
                      {teamStats.teamMembersCount} member{teamStats.teamMembersCount !== 1 ? 's' : ''} total
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}
