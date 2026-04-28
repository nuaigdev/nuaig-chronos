'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { StatCard, StatusBadge, ProgressBar, SectionHeader } from '@/components/ui'
import { formatHours, formatDate, getWeekRange, calculateCompletionPercentage } from '@/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock, FolderKanban, CheckSquare, Calendar, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const supabase = createClient()

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

export default function DashboardPage() {
  // Use profileReady — the authoritative signal that BOTH session and profile
  // row are available. Never gate fetches on profile?.id alone because that
  // can be non-null while the role fields are still resolving, which causes
  // incorrect canManageProjects=false on the first render for admins/managers.
  const { profile, profileReady, canManageProjects } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    // profileReady guarantees profile is non-null here — this guard is a
    // runtime safety net only, it should never fire in practice.
    if (!profile) return
    setLoading(true)

    try {
      const { start: weekStart, end: weekEnd } = getWeekRange()
      const today = formatDate(new Date(), 'yyyy-MM-dd')

      // Hours this week
      const { data: weekLogs } = await supabase
        .from('time_logs')
        .select('hours, log_date')
        .eq('user_id', profile.id)
        .gte('log_date', formatDate(weekStart, 'yyyy-MM-dd'))
        .lte('log_date', formatDate(weekEnd, 'yyyy-MM-dd'))

      // Hours today
      const todayLogs = weekLogs?.filter(l => l.log_date === today) || []
      const hoursToday = todayLogs.reduce((s, l) => s + l.hours, 0)
      const totalHoursThisWeek = weekLogs?.reduce((s, l) => s + l.hours, 0) || 0

      // Active projects — run in parallel with admin queries below
      const projectsPromise = (async () => {
        let projectsQuery = supabase
          .from('projects')
          .select(`*, client:clients(name), time_logs(hours)`)
          .eq('status', 'active')

        if (!canManageProjects) {
          const { data: memberProjs } = await supabase
            .from('project_members')
            .select('project_id')
            .eq('user_id', profile.id)
          const projIds = memberProjs?.map(p => p.project_id) || []
          if (projIds.length > 0) projectsQuery = projectsQuery.in('id', projIds)
          else return []
        }

        const { data: projects } = await projectsQuery.limit(5)
        return (projects || []).map(p => ({
          id: p.id,
          name: p.name,
          client_name: (p.client as { name: string } | null)?.name || 'No Client',
          logged: (p.time_logs as { hours: number }[])?.reduce((s: number, l: { hours: number }) => s + l.hours, 0) || 0,
          estimated: p.estimated_hours || 0,
          status: p.status,
        }))
      })()

      // Admin / manager exclusive queries — run concurrently so the extra
      // latency doesn't block the spinner from clearing.
      const teamSizePromise = canManageProjects
        ? supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true)
        : Promise.resolve({ count: 0 })

      const pendingApprovalsPromise = canManageProjects
        ? supabase.from('timesheets').select('*', { count: 'exact', head: true }).eq('status', 'submitted')
        : Promise.resolve({ count: 0 })

      const pendingOwnPromise = supabase
        .from('timesheets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('status', 'draft')

      // Await all in parallel
      const [activeProjects, teamRes, approvalsRes, ownRes] = await Promise.all([
        projectsPromise,
        teamSizePromise,
        pendingApprovalsPromise,
        pendingOwnPromise,
      ])

      // Chart data — last 7 days derived from already-fetched weekLogs
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        return formatDate(d, 'yyyy-MM-dd')
      })
      const recentTimeLogs = last7.map(date => ({
        date: formatDate(new Date(date + 'T00:00:00'), 'EEE'),
        hours: weekLogs?.filter(l => l.log_date === date).reduce((s, l) => s + l.hours, 0) || 0,
      }))

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

  // Gate on profileReady — this fires only once the profile row (including the
  // role) has been fetched. Previously this used [profile?.id] which could fire
  // while profile was still null (race condition) causing an early return and
  // the loading spinner never clearing for admins and managers.
  useEffect(() => {
    if (!profileReady) return
    fetchStats()
  }, [profileReady, fetchStats])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em' }}>
            {greeting()}, <span className="gradient-text">{profile?.full_name?.split(' ')[0]}</span> 👋
          </h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '14px', marginTop: '4px' }}>
            {formatDate(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        {stats && stats.pendingApprovals > 0 && canManageProjects && (
          <Link href="/dashboard/approvals">
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)',
              borderRadius: '10px', padding: '8px 14px', cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <AlertCircle size={14} style={{ color: 'var(--chronos-warning)' }} />
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-warning)' }}>
                {stats.pendingApprovals} timesheet{stats.pendingApprovals > 1 ? 's' : ''} pending approval
              </span>
            </div>
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <StatCard
          label="Hours This Week"
          value={formatHours(stats?.totalHoursThisWeek || 0)}
          icon={<Clock size={18} />}
          trend={{ value: 5, label: 'vs last week' }}
          accent="#3b82f6"
        />
        <StatCard
          label="Hours Today"
          value={formatHours(stats?.hoursToday || 0)}
          icon={<Calendar size={18} />}
          accent="#8b5cf6"
        />
        <StatCard
          label="Active Projects"
          value={stats?.totalProjectsActive || 0}
          icon={<FolderKanban size={18} />}
          accent="#34d399"
        />
        {canManageProjects ? (
          <StatCard
            label="Pending Approvals"
            value={stats?.pendingApprovals || 0}
            icon={<CheckSquare size={18} />}
            accent="#fbbf24"
          />
        ) : (
          <StatCard
            label="Draft Timesheets"
            value={stats?.pendingTimesheets || 0}
            icon={<CheckSquare size={18} />}
            accent="#fbbf24"
          />
        )}
      </div>

      {/* Chart + Projects */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Hours Chart */}
        <div className="card-base" style={{ padding: '20px' }}>
          <SectionHeader title="Hours This Week" subtitle="Daily time logged" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats?.recentTimeLogs || []} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chronos-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'var(--chronos-text-muted)', fontSize: 12, fontFamily: 'DM Sans, sans-serif' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--chronos-text-muted)', fontSize: 12, fontFamily: 'DM Sans, sans-serif' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--chronos-surface)', border: '1px solid var(--chronos-border)', borderRadius: '10px', fontFamily: 'DM Sans, sans-serif', fontSize: '13px' }}
                labelStyle={{ color: 'var(--chronos-text)' }}
                itemStyle={{ color: 'var(--chronos-accent)' }}
                formatter={(val: number) => [`${val}h`, 'Hours']}
              />
              <Bar dataKey="hours" fill="var(--chronos-accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Active Projects */}
        <div className="card-base" style={{ padding: '20px' }}>
          <SectionHeader
            title="Active Projects"
            action={
              <Link href="/dashboard/projects">
                <span style={{ fontSize: '13px', color: 'var(--chronos-accent)', cursor: 'pointer' }}>View all →</span>
              </Link>
            }
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stats?.activeProjects.length === 0 ? (
              <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No active projects</p>
            ) : (
              stats?.activeProjects.map(p => (
                <Link href={`/dashboard/projects/${p.id}`} key={p.id} style={{ textDecoration: 'none' }}>
                  <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--chronos-surface-2)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--chronos-border)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--chronos-surface-2)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--chronos-text)' }}>{p.name}</span>
                      <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }}>
                        {formatHours(p.logged)} / {p.estimated ? formatHours(p.estimated) : '—'}
                      </span>
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
    </div>
  )
}
