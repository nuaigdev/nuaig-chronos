'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/hooks/useProfile'
import { Timesheet, Profile, TimeLog, DeptRow } from '@/types'
import { StatusBadge, EmptyState, Modal, FormField } from '@/components/ui'
import { formatDate, formatHours, getInitials, getWeekRange } from '@/utils'
import { CheckSquare, Check, X, ChevronRight, Clock, AlertCircle, BellRing, LayoutGrid, ChevronDown, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, addDays, startOfWeek, subWeeks } from 'date-fns'

const supabase = createClient()

type TimesheetWithUser = Timesheet & { user: Profile }
type Tab = 'approvals' | 'coverage'

// ── Weekly Coverage types ─────────────────────────────────────────────────────
interface DayLog {
  date: string        // yyyy-MM-dd
  hours: number
}
interface MemberRow {
  id: string
  full_name: string
  role: string
  days: Record<string, number>   // date → hours logged (0 = nothing logged)
}
interface DeptGroup {
  name: string
  display_name: string
  members: MemberRow[]
}

// Monday of current week
function getCurrentMonday(): Date {
  return startOfWeek(new Date(), { weekStartsOn: 1 })
}

function getWeekdays(monday: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i))
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { profile, loading: authLoading, canManageProjects, isAdmin, isManager } = useProfile()

  const [activeTab, setActiveTab] = useState<Tab>('approvals')

  // ── Approvals tab state ───────────────────────────────────────────────────
  const [timesheets, setTimesheets] = useState<TimesheetWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, TimeLog[]>>({})
  const [statusFilter, setStatusFilter] = useState<'submitted' | 'approved' | 'rejected' | 'all'>('submitted')
  const [reviewModal, setReviewModal] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Coverage tab state ────────────────────────────────────────────────────
  const [coverageWeek, setCoverageWeek] = useState<Date>(getCurrentMonday())
  const [deptGroups, setDeptGroups] = useState<DeptGroup[]>([])
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [expandedDept, setExpandedDept] = useState<string | null>(null)

  // ── Notify missing submissions state ─────────────────────────────────────
  const [notifying, setNotifying] = useState(false)

  const weekdays = useMemo(() => getWeekdays(coverageWeek), [coverageWeek])
  const weekdayStrs = useMemo(() => weekdays.map(d => format(d, 'yyyy-MM-dd')), [weekdays])

  // ── Fetch reportees (scoped: manager→own dept+direct; admin→everyone) ─────

  const fetchReporteeIds = useCallback(async (): Promise<string[]> => {
    if (isAdmin) {
      const { data } = await supabase.from('profiles').select('id').eq('is_active', true).neq('role', 'admin')
      return (data || []).map(r => r.id)
    }
    if (!profile) return []

    // Manager: employees in their managed departments OR anyone with manager_id = them
    const { data: depts } = await supabase.from('departments').select('name').eq('manager_id', profile.id)
    const deptNames = (depts || []).map(d => d.name)

    if (deptNames.length === 0) {
      const { data } = await supabase.from('profiles').select('id').eq('manager_id', profile.id).eq('is_active', true)
      return (data || []).map(r => r.id)
    }

    const { data } = await supabase
      .from('profiles')
      .select('id')
      .or(`department.in.(${deptNames.map(n => `"${n}"`).join(',')}),manager_id.eq.${profile.id}`)
      .eq('is_active', true)
      .neq('id', profile.id)
    return (data || []).map(r => r.id)
  }, [isAdmin, profile])

  // ── Approvals: fetch timesheets ───────────────────────────────────────────

  const fetchTimesheets = useCallback(async () => {
    if (!profile || !canManageProjects) return
    setLoading(true)

    const reporteeIds = await fetchReporteeIds()

    if (!isAdmin && reporteeIds.length === 0) {
      setTimesheets([])
      setLoading(false)
      return
    }

    let query = supabase
      .from('timesheets')
      .select('*, user:profiles!timesheets_user_id_fkey(id, full_name, email, role, department, avatar_url, is_active, created_at, updated_at)')
      .order('submitted_at', { ascending: true })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (!isAdmin) query = query.in('user_id', reporteeIds)

    const { data, error } = await query
    if (error) { setLoading(false); return }
    setTimesheets((data || []) as unknown as TimesheetWithUser[])
    setLoading(false)
  }, [profile, canManageProjects, isAdmin, statusFilter, fetchReporteeIds])

  useEffect(() => {
    if (authLoading || !profile) return
    fetchTimesheets()
  }, [authLoading, profile?.id, fetchTimesheets])

  // ── Coverage: fetch weekly time log grid ──────────────────────────────────

  const fetchCoverage = useCallback(async () => {
    if (!profile || !canManageProjects) return
    setCoverageLoading(true)

    const weekStart = weekdayStrs[0]
    const weekEnd = weekdayStrs[4]

    // 1. Get departments (scoped)
    let deptsQuery = supabase.from('departments').select('id, name, display_name').eq('is_active', true).order('name')
    if (!isAdmin && profile) {
      deptsQuery = supabase.from('departments').select('id, name, display_name').eq('manager_id', profile.id).eq('is_active', true).order('name')
    }
    const { data: depts } = await deptsQuery
    if (!depts?.length) { setDeptGroups([]); setCoverageLoading(false); return }

    const deptNames = depts.map(d => d.name)

    // 2. Get all relevant members
    let membersQuery = supabase
      .from('profiles')
      .select('id, full_name, role, department, manager_id')
      .eq('is_active', true)
      .in('role', ['employee', 'manager'])

    if (isAdmin) {
      membersQuery = membersQuery.in('department', deptNames)
    } else {
      // Manager: members in their departments OR direct reports
      membersQuery = membersQuery.or(
        `department.in.(${deptNames.map(n => `"${n}"`).join(',')}),manager_id.eq.${profile.id}`
      ).neq('id', profile.id)
    }

    const { data: members } = await membersQuery
    if (!members?.length) { setDeptGroups([]); setCoverageLoading(false); return }

    const memberIds = members.map(m => m.id)

    // 3. Get time logs for the week
    const { data: timeLogs } = await supabase
      .from('time_logs')
      .select('user_id, log_date, hours')
      .in('user_id', memberIds)
      .gte('log_date', weekStart)
      .lte('log_date', weekEnd)

    // Build lookup: userId → date → hours
    const logMap: Record<string, Record<string, number>> = {}
    for (const log of (timeLogs || [])) {
      if (!logMap[log.user_id]) logMap[log.user_id] = {}
      logMap[log.user_id][log.log_date] = (logMap[log.user_id][log.log_date] || 0) + log.hours
    }

    // 4. Build dept groups
    const groups: DeptGroup[] = depts.map(dept => {
      const deptMembers = members
        .filter(m => m.department === dept.name || (m.manager_id === profile?.id && !m.department))
        .map(m => ({
          id: m.id,
          full_name: m.full_name,
          role: m.role,
          days: Object.fromEntries(weekdayStrs.map(d => [d, logMap[m.id]?.[d] ?? 0])),
        }))
      return { name: dept.name, display_name: dept.display_name, members: deptMembers }
    }).filter(g => g.members.length > 0)

    setDeptGroups(groups)
    // Auto-expand first dept
    if (groups.length > 0 && !expandedDept) setExpandedDept(groups[0].name)
    setCoverageLoading(false)
  }, [profile, canManageProjects, isAdmin, weekdayStrs, expandedDept])

  useEffect(() => {
    if (authLoading || !profile || activeTab !== 'coverage') return
    fetchCoverage()
  }, [authLoading, profile?.id, activeTab, fetchCoverage])

  // ── Notify: send reminders to those who haven't submitted last week ────────

  const notifyMissingSubmissions = async () => {
    if (!profile || !canManageProjects) return
    setNotifying(true)
    try {
      const { start: prevStart } = getWeekRange(subWeeks(new Date(), 1))
      const prevWeekStartStr = format(prevStart, 'yyyy-MM-dd')
      const weekLabel = format(prevStart, 'MMM d, yyyy')

      // Get the scoped reportees (same logic as approvals)
      const reporteeIds = await fetchReporteeIds()

      if (!reporteeIds.length) {
        toast('No team members found under your account.')
        return
      }

      // Who already submitted or got approved last week?
      const { data: submitted } = await supabase
        .from('timesheets')
        .select('user_id')
        .in('user_id', reporteeIds)
        .eq('week_start_date', prevWeekStartStr)
        .in('status', ['submitted', 'approved'])

      const submittedSet = new Set((submitted || []).map(s => s.user_id))

      // Get names for those who haven't submitted
      const missingIds = reporteeIds.filter(id => !submittedSet.has(id))
      if (!missingIds.length) {
        toast.success('All team members submitted their timesheet last week!')
        return
      }

      const { data: missingProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', missingIds)

      const missing = missingProfiles || []
      const missedNames = missing.map(m => m.full_name).join(', ')

      // Notify the manager/admin themselves
      await supabase.from('notifications').insert({
        user_id: profile.id,
        type: 'pending_approval_alert' as const,
        title: 'Unsubmitted Timesheets — Last Week',
        message: `${missing.length} team member${missing.length > 1 ? 's have' : ' has'} not submitted their timesheet for the week of ${weekLabel}: ${missedNames}`,
      })

      // Notify each missing member
      await supabase.from('notifications').insert(
        missing.map(m => ({
          user_id: m.id,
          type: 'timesheet_reminder' as const,
          title: 'Timesheet Submission Overdue',
          message: `Your timesheet for the week of ${weekLabel} has not been submitted. Please submit it as soon as possible.`,
        }))
      )

      toast.success(`Reminder sent to ${missing.length} member${missing.length > 1 ? 's' : ''}`)
    } catch {
      toast.error('Failed to send reminders')
    } finally {
      setNotifying(false)
    }
  }

  // ── Approvals helpers ─────────────────────────────────────────────────────

  const fetchLogs = async (timesheetId: string) => {
    if (logs[timesheetId]) return
    const { data } = await supabase
      .from('time_logs')
      .select('*, project:projects(id,name,client:clients(name)), task_type:task_types(id,name)')
      .eq('timesheet_id', timesheetId)
      .order('log_date')
    setLogs(prev => ({ ...prev, [timesheetId]: (data || []) as unknown as TimeLog[] }))
  }

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    fetchLogs(id)
  }

  const handleReview = async () => {
    if (!reviewModal) return
    if (reviewModal.action === 'reject' && !comment.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }
    setSaving(true)
    try {
      const status = reviewModal.action === 'approve' ? 'approved' : 'rejected'
      const { error } = await supabase
        .from('timesheets')
        .update({ status, reviewed_by: profile!.id, reviewed_at: new Date().toISOString(), review_comment: comment || null })
        .eq('id', reviewModal.id)
      if (error) throw error

      const ts = timesheets.find(t => t.id === reviewModal.id)
      if (ts) {
        await supabase.from('notifications').insert({
          user_id: ts.user_id,
          type: status === 'approved' ? 'timesheet_approved' : 'timesheet_rejected',
          title: `Timesheet ${status === 'approved' ? 'Approved' : 'Rejected'}`,
          message: status === 'approved'
            ? `Your timesheet for ${formatDate(ts.week_start_date + 'T00:00:00', 'MMM d')}–${formatDate(ts.week_end_date + 'T00:00:00', 'MMM d')} was approved.`
            : `Your timesheet was rejected: ${comment}`,
          related_id: reviewModal.id,
        })
      }

      toast.success(`Timesheet ${status}!`)
      setReviewModal(null)
      setComment('')
      fetchTimesheets()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const pendingCount = timesheets.filter(t => t.status === 'submitted').length

  // ── Coverage helpers ──────────────────────────────────────────────────────

  const isToday = (dateStr: string) => dateStr === format(new Date(), 'yyyy-MM-dd')
  const isFuture = (dateStr: string) => dateStr > format(new Date(), 'yyyy-MM-dd')

  const cellBg = (hours: number, dateStr: string) => {
    if (isFuture(dateStr)) return 'var(--chronos-surface-2)'
    if (hours === 0) return 'rgba(248,113,113,0.08)'
    if (hours >= 8) return 'rgba(52,211,153,0.10)'
    return 'rgba(251,191,36,0.08)'
  }
  const cellColor = (hours: number, dateStr: string) => {
    if (isFuture(dateStr)) return 'var(--chronos-text-muted)'
    if (hours === 0) return 'var(--chronos-danger)'
    if (hours >= 8) return 'var(--chronos-success)'
    return '#fbbf24'
  }

  const goToPrevCoverageWeek = () => setCoverageWeek(w => addDays(w, -7))
  const goToNextCoverageWeek = () => {
    const next = addDays(coverageWeek, 7)
    if (next > getCurrentMonday()) { toast.error("Can't navigate to a future week"); return }
    setCoverageWeek(next)
  }
  const isCurrentCoverageWeek = format(coverageWeek, 'yyyy-MM-dd') === format(getCurrentMonday(), 'yyyy-MM-dd')

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Approvals</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Review timesheets and monitor your team's time log coverage
          </p>
        </div>

        {/* Notify missing — only for managers/admins, lives here not on timesheets page */}
        {canManageProjects && (
          <button
            className="btn-secondary"
            onClick={notifyMissingSubmissions}
            disabled={notifying}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
          >
            <BellRing size={14} />
            {notifying ? 'Sending…' : 'Remind Unsubmitted (Last Week)'}
          </button>
        )}
      </div>

      {/* Pending banner */}
      {pendingCount > 0 && activeTab === 'approvals' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderRadius: '12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <AlertCircle size={16} style={{ color: 'var(--chronos-warning)', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--chronos-warning)', fontWeight: 500 }}>
            {pendingCount} timesheet{pendingCount > 1 ? 's' : ''} waiting for your review
          </span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--chronos-border)' }}>
        {[
          { key: 'approvals' as Tab, label: 'Timesheet Approvals', icon: <CheckSquare size={14} /> },
          { key: 'coverage' as Tab, label: 'Weekly Time Log Coverage', icon: <LayoutGrid size={14} /> },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', border: 'none', cursor: 'pointer', background: 'transparent',
              fontSize: '13px', fontWeight: 500,
              color: activeTab === t.key ? 'var(--chronos-accent)' : 'var(--chronos-text-muted)',
              borderBottom: activeTab === t.key ? '2px solid var(--chronos-accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB: TIMESHEET APPROVALS                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'approvals' && (
        <>
          {/* Status filter */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['submitted', 'approved', 'rejected', 'all'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                border: statusFilter === s ? '1px solid var(--chronos-accent)' : '1px solid var(--chronos-border)',
                background: statusFilter === s ? 'var(--chronos-accent-glow)' : 'var(--chronos-surface)',
                color: statusFilter === s ? 'var(--chronos-accent)' : 'var(--chronos-text-muted)',
              }}>
                {s === 'submitted' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
              <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : timesheets.length === 0 ? (
            <EmptyState icon={<CheckSquare size={28} />} title="No timesheets to review" description="All caught up! No timesheets match the selected filter." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {timesheets.map(ts => {
                const isExpanded = expanded === ts.id
                return (
                  <div key={ts.id} className="card-base" style={{ overflow: 'hidden' }}>
                    <div
                      onClick={() => toggleExpand(ts.id)}
                      style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--chronos-surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: 'white', fontFamily: 'Syne, sans-serif', flexShrink: 0 }}>
                        {getInitials(ts.user?.full_name || 'U')}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '14px' }}>{ts.user?.full_name}</span>
                          <StatusBadge status={ts.status} />
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '3px', display: 'flex', gap: '12px' }}>
                          <span>{formatDate(ts.week_start_date + 'T00:00:00', 'MMM d')} – {formatDate(ts.week_end_date + 'T00:00:00', 'MMM d, yyyy')}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={10} />{formatHours(ts.total_hours)}</span>
                          {ts.submitted_at && <span>Submitted {formatDate(ts.submitted_at, 'MMM d, h:mm a')}</span>}
                        </div>
                      </div>
                      {ts.status === 'submitted' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn-primary"
                            style={{ padding: '7px 14px', fontSize: '12px', background: 'linear-gradient(135deg, #34d399, #10b981)' }}
                            onClick={e => { e.stopPropagation(); setReviewModal({ id: ts.id, action: 'approve' }); setComment('') }}
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ padding: '7px 14px', fontSize: '12px', color: 'var(--chronos-danger)', borderColor: 'rgba(248,113,113,0.3)' }}
                            onClick={e => { e.stopPropagation(); setReviewModal({ id: ts.id, action: 'reject' }); setComment('') }}
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                      <ChevronRight size={14} style={{ color: 'var(--chronos-text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                    </div>

                    {ts.review_comment && (
                      <div style={{ margin: '0 20px 12px', padding: '10px 14px', borderRadius: '8px', background: ts.status === 'rejected' ? 'rgba(248,113,113,0.06)' : 'rgba(52,211,153,0.06)', border: `1px solid ${ts.status === 'rejected' ? 'rgba(248,113,113,0.2)' : 'rgba(52,211,153,0.2)'}` }}>
                        <span style={{ fontSize: '12px', color: ts.status === 'rejected' ? 'var(--chronos-danger)' : 'var(--chronos-success)' }}>
                          {ts.status === 'rejected' ? 'Rejection reason: ' : 'Note: '}{ts.review_comment}
                        </span>
                      </div>
                    )}

                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--chronos-border)' }}>
                        {!logs[ts.id] ? (
                          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>Loading…</div>
                        ) : logs[ts.id].length === 0 ? (
                          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>No time logs</div>
                        ) : (() => {
                          const byDate: Record<string, TimeLog[]> = {}
                          for (const log of logs[ts.id]) {
                            if (!byDate[log.log_date]) byDate[log.log_date] = []
                            byDate[log.log_date].push(log)
                          }
                          return (
                            <>
                              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr 1fr 60px', gap: '0', padding: '8px 20px', background: 'var(--chronos-surface-2)', borderBottom: '1px solid var(--chronos-border)' }}>
                                {['Date', 'Client', 'Project', 'Task Type', 'Notes', 'Hours'].map(h => (
                                  <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</div>
                                ))}
                              </div>
                              {Object.entries(byDate).map(([date, dateLogs]) => {
                                const dateTotal = dateLogs.reduce((s, l) => s + l.hours, 0)
                                const d = new Date(date + 'T00:00:00')
                                const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                                return (
                                  <div key={date}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr 1fr 60px', gap: '0', padding: '10px 20px', background: 'rgba(99,102,241,0.05)', borderBottom: '1px solid var(--chronos-border)', borderTop: '1px solid var(--chronos-border)' }}>
                                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--chronos-text)', fontFamily: 'Syne, sans-serif' }}>{dateLabel}</div>
                                      <div /><div /><div /><div />
                                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 700, color: 'var(--chronos-accent)' }}>{dateTotal}h</div>
                                    </div>
                                    {dateLogs.map(log => {
                                      const project = (log.project as { name: string; client?: { name: string } } | undefined)
                                      const taskType = (log.task_type as { name: string } | undefined)
                                      return (
                                        <div key={log.id} className="table-row" style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr 1fr 60px', gap: '0', padding: '10px 20px', borderBottom: '1px solid var(--chronos-border)', alignItems: 'center' }}>
                                          <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)' }} />
                                          <div style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{project?.client?.name || '—'}</div>
                                          <div style={{ fontSize: '13px', color: 'var(--chronos-text)', fontWeight: 500 }}>{project?.name || '—'}</div>
                                          <div style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>{taskType?.name || '—'}</div>
                                          <div style={{ fontSize: '12px', color: 'var(--chronos-text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.description || '—'}</div>
                                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600 }}>{log.hours}h</div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })}
                              <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: '2px solid var(--chronos-border)', background: 'var(--chronos-surface-2)' }}>
                                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '14px' }}>
                                  Weekly Total: <span style={{ color: 'var(--chronos-accent)' }}>{formatHours(ts.total_hours)}</span>
                                </span>
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB: WEEKLY TIME LOG COVERAGE                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'coverage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Week nav + legend */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={goToPrevCoverageWeek}
                className="btn-secondary"
                style={{ padding: '6px 10px', fontSize: '12px' }}
              >
                ←
              </button>
              <div style={{ padding: '6px 16px', borderRadius: '8px', background: 'var(--chronos-surface-2)', border: '1px solid var(--chronos-border)', fontSize: '13px', fontWeight: 600, fontFamily: 'Syne, sans-serif', minWidth: '200px', textAlign: 'center' }}>
                {format(weekdays[0], 'MMM d')} – {format(weekdays[4], 'MMM d, yyyy')}
                {isCurrentCoverageWeek && (
                  <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--chronos-accent)', fontWeight: 500 }}>Current week</span>
                )}
              </div>
              <button
                onClick={goToNextCoverageWeek}
                className="btn-secondary"
                style={{ padding: '6px 10px', fontSize: '12px' }}
                disabled={isCurrentCoverageWeek}
              >
                →
              </button>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px', color: 'var(--chronos-text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(52,211,153,0.3)', display: 'inline-block' }} />
                8h+ logged
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(251,191,36,0.3)', display: 'inline-block' }} />
                Partial
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(248,113,113,0.25)', display: 'inline-block' }} />
                No log
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--chronos-surface-2)', border: '1px solid var(--chronos-border)', display: 'inline-block' }} />
                Future
              </span>
            </div>
          </div>

          {coverageLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
              <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : deptGroups.length === 0 ? (
            <EmptyState icon={<LayoutGrid size={28} />} title="No coverage data" description="No team members found for the selected scope." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {deptGroups.map(dept => {
                const isDeptExpanded = expandedDept === dept.name

                // Dept-level summary: for each day, total hours across all members
                const deptTotals = weekdayStrs.map(d => ({
                  date: d,
                  total: dept.members.reduce((sum, m) => sum + (m.days[d] || 0), 0),
                  logged: dept.members.filter(m => m.days[d] > 0).length,
                  total_members: dept.members.length,
                }))

                return (
                  <div key={dept.name} className="card-base" style={{ overflow: 'hidden' }}>

                    {/* ── Department header row ── */}
                    <div
                      onClick={() => setExpandedDept(isDeptExpanded ? null : dept.name)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `260px repeat(5, 1fr) 80px`,
                        alignItems: 'center',
                        padding: '0',
                        cursor: 'pointer',
                        background: 'var(--chronos-surface)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--chronos-surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--chronos-surface)'}
                    >
                      {/* Dept name cell */}
                      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px', borderRight: '1px solid var(--chronos-border)' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Building2 size={14} color="white" />
                        </div>
                        <div>
                          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '13px', color: 'var(--chronos-text)' }}>{dept.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', marginTop: '1px' }}>{dept.display_name} · {dept.members.length} member{dept.members.length !== 1 ? 's' : ''}</div>
                        </div>
                      </div>

                      {/* Day summary cells */}
                      {deptTotals.map(({ date, total, logged, total_members }) => (
                        <div key={date} style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          borderRight: '1px solid var(--chronos-border)',
                          background: isFuture(date) ? 'transparent' : logged === total_members ? 'rgba(52,211,153,0.06)' : logged > 0 ? 'rgba(251,191,36,0.06)' : 'rgba(248,113,113,0.06)',
                        }}>
                          <div style={{
                            fontSize: '13px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                            color: isFuture(date) ? 'var(--chronos-text-muted)' : logged === total_members ? 'var(--chronos-success)' : logged > 0 ? '#fbbf24' : 'var(--chronos-danger)',
                          }}>
                            {isFuture(date) ? '—' : `${total}h`}
                          </div>
                          {!isFuture(date) && (
                            <div style={{ fontSize: '10px', color: 'var(--chronos-text-muted)', marginTop: '2px' }}>
                              {logged}/{total_members}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Expand toggle */}
                      <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <ChevronDown size={14} style={{ color: 'var(--chronos-text-muted)', transform: isDeptExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      </div>
                    </div>

                    {/* ── Column headers (only when expanded, sticky-ish) ── */}
                    {isDeptExpanded && (
                      <>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: `260px repeat(5, 1fr) 80px`,
                          background: 'var(--chronos-surface-2)',
                          borderTop: '1px solid var(--chronos-border)',
                          borderBottom: '1px solid var(--chronos-border)',
                        }}>
                          <div style={{ padding: '8px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--chronos-border)' }}>
                            Team Member
                          </div>
                          {weekdays.map((day, i) => (
                            <div key={weekdayStrs[i]} style={{
                              padding: '8px 8px',
                              textAlign: 'center',
                              borderRight: '1px solid var(--chronos-border)',
                              background: isToday(weekdayStrs[i]) ? 'rgba(99,102,241,0.08)' : 'transparent',
                            }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: isToday(weekdayStrs[i]) ? 'var(--chronos-accent)' : 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {format(day, 'EEE')}
                              </div>
                              <div style={{ fontSize: '12px', color: isToday(weekdayStrs[i]) ? 'var(--chronos-accent)' : 'var(--chronos-text-muted)', marginTop: '1px', fontFamily: 'JetBrains Mono, monospace' }}>
                                {format(day, 'MMM d')}
                              </div>
                            </div>
                          ))}
                          <div style={{ padding: '8px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--chronos-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Total
                          </div>
                        </div>

                        {/* ── Member rows ── */}
                        {dept.members.map((member, idx) => {
                          const weekTotal = Object.values(member.days).reduce((s, h) => s + h, 0)
                          return (
                            <div key={member.id} style={{
                              display: 'grid',
                              gridTemplateColumns: `260px repeat(5, 1fr) 80px`,
                              borderTop: idx === 0 ? 'none' : '1px solid var(--chronos-border)',
                              background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                            }}>
                              {/* Name */}
                              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', borderRight: '1px solid var(--chronos-border)' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', fontFamily: 'Syne, sans-serif', flexShrink: 0 }}>
                                  {getInitials(member.full_name)}
                                </div>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--chronos-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>{member.full_name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', textTransform: 'capitalize' }}>{member.role}</div>
                                </div>
                              </div>

                              {/* Day cells */}
                              {weekdayStrs.map(dateStr => {
                                const h = member.days[dateStr] || 0
                                return (
                                  <div key={dateStr} style={{
                                    padding: '12px 8px',
                                    textAlign: 'center',
                                    borderRight: '1px solid var(--chronos-border)',
                                    background: cellBg(h, dateStr),
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    <span style={{
                                      fontFamily: 'JetBrains Mono, monospace',
                                      fontSize: '13px',
                                      fontWeight: 700,
                                      color: cellColor(h, dateStr),
                                    }}>
                                      {isFuture(dateStr) ? '—' : h > 0 ? `${h}h` : '✕'}
                                    </span>
                                  </div>
                                )
                              })}

                              {/* Week total */}
                              <div style={{ padding: '12px 8px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 700, color: weekTotal > 0 ? 'var(--chronos-text)' : 'var(--chronos-text-muted)' }}>
                                  {weekTotal > 0 ? `${weekTotal}h` : '0h'}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      <Modal isOpen={!!reviewModal} onClose={() => setReviewModal(null)} title={reviewModal?.action === 'approve' ? 'Approve Timesheet' : 'Reject Timesheet'} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)' }}>
            {reviewModal?.action === 'approve'
              ? 'Are you sure you want to approve this timesheet?'
              : 'Please provide a reason for rejection.'}
          </p>
          <FormField label={reviewModal?.action === 'approve' ? 'Optional comment' : 'Rejection reason'} required={reviewModal?.action === 'reject'}>
            <textarea
              className="input-base"
              placeholder={reviewModal?.action === 'approve' ? 'Great work!' : 'e.g. Missing entries for Tuesday...'}
              rows={3}
              style={{ resize: 'vertical' }}
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setReviewModal(null)}>Cancel</button>
            <button
              className="btn-primary"
              style={reviewModal?.action === 'approve' ? { background: 'linear-gradient(135deg, #34d399, #10b981)' } : { background: 'linear-gradient(135deg, #f87171, #ef4444)' }}
              onClick={handleReview}
              disabled={saving}
            >
              {saving ? 'Saving...' : reviewModal?.action === 'approve' ? <><Check size={14} /> Approve</> : <><X size={14} /> Reject</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
