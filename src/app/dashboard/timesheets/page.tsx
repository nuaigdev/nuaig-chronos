'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Timesheet, TimeLog, Project, TaskType, Department } from '@/types'
import { StatusBadge, EmptyState, Modal, FormField, Select } from '@/components/ui'
import { formatDate, formatHours, getWeekRange, getWeekDays } from '@/utils'
import {
  FileText, ChevronLeft, ChevronRight, Send, BellRing,
  Plus, Trash2, Edit2, Check, X, Clock
} from 'lucide-react'
import { addWeeks, subWeeks, format, isAfter, startOfDay, isSameDay } from 'date-fns'
import toast from 'react-hot-toast'

const supabase = createClient()

// ─── helpers ────────────────────────────────────────────────────────────────

function isFutureDate(date: Date): boolean {
  return isAfter(startOfDay(date), startOfDay(new Date()))
}

function isFutureWeek(weekStart: Date): boolean {
  return isAfter(startOfDay(weekStart), startOfDay(new Date()))
}

function timesheetEditable(status: string): boolean {
  return status === 'draft' || status === 'rejected'
}

// ─── types ───────────────────────────────────────────────────────────────────

type TimeLogFull = TimeLog & {
  task_type?: TaskType
  project?: Project
}

interface LogForm {
  project_id: string
  task_type_id: string
  log_date: string
  hours: string
  description: string
}

const EMPTY_FORM: LogForm = {
  project_id: '',
  task_type_id: '',
  log_date: '',
  hours: '',
  description: '',
}

// ─── component ───────────────────────────────────────────────────────────────

export default function TimesheetsPage() {
  const { profile, profileReady, canManageProjects } = useAuth()

  // Week navigation — default to current week
  const [currentWeek, setCurrentWeek] = useState(new Date())

  const { weekStartStr, weekEndStr } = useMemo(() => {
    const { start, end } = getWeekRange(currentWeek)
    return {
      weekStartStr: format(start, 'yyyy-MM-dd'),
      weekEndStr: format(end, 'yyyy-MM-dd'),
    }
  }, [currentWeek])

  const weekStart = useMemo(() => new Date(weekStartStr + 'T00:00:00'), [weekStartStr])
  const weekEnd = useMemo(() => new Date(weekEndStr + 'T00:00:00'), [weekEndStr])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const isCurrentOrPastWeek = !isFutureWeek(weekStart)

  // Data
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null)
  const [timeLogs, setTimeLogs] = useState<TimeLogFull[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checkingMissed, setCheckingMissed] = useState(false)

  // Log form / modal
  const [showModal, setShowModal] = useState(false)
  const [editLog, setEditLog] = useState<TimeLogFull | null>(null)
  const [form, setForm] = useState<LogForm>(EMPTY_FORM)

  // ── fetch timesheet for current week ──────────────────────────────────────

  const fetchTimesheet = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('timesheets')
      .select('*, reviewer:profiles!timesheets_reviewed_by_fkey(full_name)')
      .eq('user_id', profile.id)
      .eq('week_start_date', weekStartStr)
      .maybeSingle()
    setTimesheet(data as unknown as Timesheet | null)
  }, [profile, weekStartStr])

  const fetchTimeLogs = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data } = await supabase
      .from('time_logs')
      .select('*, project:projects(id,name), task_type:task_types(id,department,name)')
      .eq('user_id', profile.id)
      .gte('log_date', weekStartStr)
      .lte('log_date', weekEndStr)
      .order('log_date', { ascending: true })
    setTimeLogs((data || []) as unknown as TimeLogFull[])
    setLoading(false)
  }, [profile, weekStartStr, weekEndStr])

  const fetchProjects = useCallback(async () => {
    if (!profile) return
    const { data: mp } = await supabase
      .from('project_members').select('project_id').eq('user_id', profile.id)
    const ids = mp?.map(p => p.project_id) || []
    if (!ids.length) { setProjects([]); return }
    const { data } = await supabase
      .from('projects').select('id,name').in('id', ids).eq('status', 'active').order('name')
    setProjects((data || []) as unknown as Project[])
  }, [profile])

  const fetchTaskTypes = useCallback(async () => {
    if (!profile?.department) { setTaskTypes([]); return }
    const { data } = await supabase
      .from('task_types')
      .select('*')
      .eq('department', profile.department as Department)
      .eq('is_active', true)
      .order('sort_order')
    setTaskTypes((data || []) as unknown as TaskType[])
  }, [profile?.department])

  useEffect(() => {
    if (!profileReady) return
    fetchTimesheet()
    fetchTimeLogs()
  }, [profileReady, fetchTimesheet, fetchTimeLogs])

  useEffect(() => {
    if (!profileReady) return
    fetchProjects()
    fetchTaskTypes()
  }, [profileReady, fetchProjects, fetchTaskTypes])

  // ── ensure timesheet row exists for current week when needed ───────────────

  const ensureTimesheet = async (): Promise<string | null> => {
    if (timesheet) return timesheet.id
    const { data, error } = await supabase
      .from('timesheets')
      .insert({
        user_id: profile!.id,
        week_start_date: weekStartStr,
        week_end_date: weekEndStr,
        status: 'draft',
      })
      .select()
      .single()
    if (error) { toast.error('Could not create timesheet row'); return null }
    await fetchTimesheet()
    return data.id
  }

  // ── week navigation ────────────────────────────────────────────────────────

  const goToPrevWeek = () => setCurrentWeek(w => subWeeks(w, 1))
  const goToNextWeek = () => {
    const next = addWeeks(currentWeek, 1)
    if (isFutureWeek(getWeekRange(next).start)) {
      toast.error("You can't navigate to a future week")
      return
    }
    setCurrentWeek(next)
  }
  const goToCurrentWeek = () => setCurrentWeek(new Date())

  // ── open log modal ─────────────────────────────────────────────────────────

  const openCreate = (date: Date) => {
    if (!isCurrentOrPastWeek) { toast.error("Can't log time for future weeks"); return }
    if (isFutureDate(date)) { toast.error("Can't log time for a future date"); return }
    if (timesheet && !timesheetEditable(timesheet.status)) {
      toast.error(
        timesheet.status === 'approved'
          ? 'This timesheet has been approved and cannot be edited'
          : 'This timesheet is under review and cannot be edited'
      )
      return
    }
    setEditLog(null)
    setForm({ ...EMPTY_FORM, log_date: format(date, 'yyyy-MM-dd') })
    setShowModal(true)
  }

  const openEdit = (log: TimeLogFull) => {
    if (timesheet && !timesheetEditable(timesheet.status)) {
      toast.error(
        timesheet.status === 'approved'
          ? 'This timesheet has been approved and cannot be edited'
          : 'This timesheet is under review and cannot be edited'
      )
      return
    }
    setEditLog(log)
    setForm({
      project_id: log.project_id,
      task_type_id: log.task_type_id || '',
      log_date: log.log_date,
      hours: String(log.hours),
      description: log.description || '',
    })
    setShowModal(true)
  }

  // ── save log ───────────────────────────────────────────────────────────────

  const saveLog = async () => {
    if (!form.project_id) { toast.error('Select a project'); return }
    if (!form.task_type_id) { toast.error('Select a task type'); return }
    if (!form.log_date) { toast.error('Select a date'); return }
    if (!form.hours || isNaN(Number(form.hours)) || Number(form.hours) <= 0) {
      toast.error('Enter valid hours (> 0)')
      return
    }
    if (Number(form.hours) > 24) { toast.error('Hours cannot exceed 24 in a day'); return }

    // Validate date within week
    const logDate = new Date(form.log_date + 'T00:00:00')
    if (isFutureDate(logDate)) { toast.error("Can't log time for a future date"); return }

    setSaving(true)
    try {
      const tsId = await ensureTimesheet()
      if (!tsId) return

      if (editLog) {
        const { error } = await supabase
          .from('time_logs')
          .update({
            project_id: form.project_id,
            task_type_id: form.task_type_id,
            log_date: form.log_date,
            hours: Number(form.hours),
            description: form.description || null,
          })
          .eq('id', editLog.id)
        if (error) throw error
        toast.success('Time log updated')
      } else {
        const { error } = await supabase
          .from('time_logs')
          .insert({
            timesheet_id: tsId,
            user_id: profile!.id,
            project_id: form.project_id,
            task_type_id: form.task_type_id,
            log_date: form.log_date,
            hours: Number(form.hours),
            description: form.description || null,
          })
        if (error) throw error
        toast.success('Time logged')
      }

      setShowModal(false)
      await Promise.all([fetchTimeLogs(), fetchTimesheet()])
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── delete log ─────────────────────────────────────────────────────────────

  const deleteLog = async (log: TimeLogFull) => {
    if (timesheet && !timesheetEditable(timesheet.status)) {
      toast.error('Cannot delete — timesheet is not editable')
      return
    }
    if (!confirm('Delete this time log?')) return
    const { error } = await supabase.from('time_logs').delete().eq('id', log.id)
    if (error) { toast.error('Failed to delete'); return }
    toast.success('Deleted')
    await Promise.all([fetchTimeLogs(), fetchTimesheet()])
  }

  // ── submit timesheet ───────────────────────────────────────────────────────

  const submitTimesheet = async () => {
    if (!timesheet) { toast.error('No timesheet to submit'); return }
    if (!confirm('Submit this timesheet for approval?')) return

    const { error } = await supabase
      .from('timesheets')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', timesheet.id)
    if (error) { toast.error('Failed to submit'); return }

    // Notify all managers/admins
    const { data: managers } = await supabase
      .from('profiles').select('id').in('role', ['admin', 'manager'])
    if (managers?.length) {
      await supabase.from('notifications').insert(
        managers.map(m => ({
          user_id: m.id,
          type: 'timesheet_submitted' as const,
          title: 'Timesheet Submitted',
          message: `${profile?.full_name} submitted a timesheet for the week of ${format(weekStart, 'MMM d, yyyy')}.`,
          related_id: timesheet.id,
        }))
      )
    }

    toast.success('Timesheet submitted!')
    await fetchTimesheet()
  }

  // ── check missed timesheets (manager) ─────────────────────────────────────

  const checkMissedTimesheets = async (silent = false) => {
    if (!profile || !canManageProjects) return
    setCheckingMissed(true)
    try {
      const { start: prevStart } = getWeekRange(subWeeks(new Date(), 1))
      const prevWeekStartStr = format(prevStart, 'yyyy-MM-dd')

      const { data: reports } = await supabase
        .from('profiles').select('id, full_name')
        .eq('manager_id', profile.id).eq('is_active', true)

      if (!reports?.length) {
        if (!silent) toast('No direct reports found under your account.')
        return
      }

      const reportIds = reports.map(r => r.id)
      const { data: submitted } = await supabase
        .from('timesheets').select('user_id')
        .in('user_id', reportIds)
        .eq('week_start_date', prevWeekStartStr)
        .in('status', ['submitted', 'approved'])

      const submittedIdSet = new Set((submitted || []).map(s => s.user_id))
      const missed = reports.filter(r => !submittedIdSet.has(r.id))

      if (missed.length === 0) {
        if (!silent) toast.success('All team members submitted last week!')
        return
      }

      const weekLabel = format(prevStart, 'MMM d, yyyy')
      const missedNames = missed.map(m => m.full_name).join(', ')

      await supabase.from('notifications').insert({
        user_id: profile.id,
        type: 'pending_approval_alert' as const,
        title: 'Missing Timesheet Submissions',
        message: `These team members have not submitted for the week of ${weekLabel}: ${missedNames}`,
      })

      await supabase.from('notifications').insert(
        missed.map(m => ({
          user_id: m.id,
          type: 'timesheet_reminder' as const,
          title: 'Timesheet Not Submitted',
          message: `You have not submitted your timesheet for the week of ${weekLabel}. Please submit it soon.`,
        }))
      )

      toast.success(`Notified ${missed.length} team member${missed.length > 1 ? 's' : ''}`)
    } catch {
      toast.error('Failed to check missed timesheets')
    } finally {
      setCheckingMissed(false)
    }
  }

  // ── derived ────────────────────────────────────────────────────────────────

  const canEdit = isCurrentOrPastWeek && (!timesheet || timesheetEditable(timesheet.status))
  const canSubmit = timesheet && (timesheet.status === 'draft' || timesheet.status === 'rejected') && timeLogs.length > 0
  const totalHours = timeLogs.reduce((s, l) => s + l.hours, 0)

  const logsByDay = useMemo(() => {
    const map: Record<string, TimeLogFull[]> = {}
    for (const log of timeLogs) {
      if (!map[log.log_date]) map[log.log_date] = []
      map[log.log_date].push(log)
    }
    return map
  }, [timeLogs])

  const tsStatus = timesheet?.status || 'draft'
  const reviewer = (timesheet as Timesheet & { reviewer?: { full_name: string } } | null)?.reviewer

  // ── status colour helpers ──────────────────────────────────────────────────

  const statusDot: Record<string, string> = {
    draft: '#64748b', submitted: '#fbbf24', approved: '#34d399', rejected: '#f87171',
  }

  // ── task-type options for select ───────────────────────────────────────────
  const taskTypeOptions = taskTypes.map(t => ({ value: t.id, label: t.name }))
  const projectOptions = projects.map(p => ({ value: p.id, label: p.name }))

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>
            Timesheets
          </h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Log time and submit weekly timesheets for approval
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {canManageProjects && (
            <button className="btn-secondary" onClick={() => checkMissedTimesheets(false)} disabled={checkingMissed}>
              <BellRing size={14} />{checkingMissed ? 'Checking...' : 'Check Missing'}
            </button>
          )}
          {canSubmit && (
            <button className="btn-primary" onClick={submitTimesheet}>
              <Send size={14} />{tsStatus === 'rejected' ? 'Resubmit' : 'Submit for Approval'}
            </button>
          )}
        </div>
      </div>

      {/* ── Week Navigator ── */}
      <div className="card-base" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button className="btn-secondary" onClick={goToPrevWeek} style={{ padding: '6px 10px' }}>
          <ChevronLeft size={14} />
        </button>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px' }}>
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', marginTop: '2px' }}>
            {format(weekStart, "'Week of' MMMM d, yyyy")}
          </div>
        </div>

        <button
          className="btn-secondary"
          onClick={goToNextWeek}
          disabled={isFutureWeek(getWeekRange(addWeeks(currentWeek, 1)).start)}
          style={{ padding: '6px 10px' }}
        >
          <ChevronRight size={14} />
        </button>

        <button className="btn-secondary" onClick={goToCurrentWeek} style={{ padding: '6px 12px', fontSize: '12px' }}>
          Today
        </button>

        {/* Timesheet status pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '100px', background: 'var(--chronos-surface-2)', border: '1px solid var(--chronos-border)' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusDot[tsStatus], boxShadow: `0 0 6px ${statusDot[tsStatus]}80`, flexShrink: 0 }} />
          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'capitalize', color: 'var(--chronos-text)' }}>{tsStatus}</span>
        </div>
      </div>

      {/* ── Rejection notice ── */}
      {timesheet?.status === 'rejected' && timesheet.review_comment && (
        <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--chronos-danger)', marginBottom: '4px', letterSpacing: '0.05em' }}>REJECTED — REASON</div>
          <div style={{ fontSize: '13px', color: 'var(--chronos-text-subtle)' }}>{timesheet.review_comment}</div>
          {reviewer && <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '6px' }}>Reviewed by {reviewer.full_name}</div>}
        </div>
      )}

      {/* ── No department warning ── */}
      {!profile?.department && (
        <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
          <div style={{ fontSize: '13px', color: 'var(--chronos-warning)' }}>
            Your profile doesn't have a department assigned. Task types are department-specific — please ask your admin to set your department.
          </div>
        </div>
      )}

      {/* ── Weekly Grid ── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {weekDays.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd')
            const dayLogs = logsByDay[dayStr] || []
            const dayHours = dayLogs.reduce((s, l) => s + l.hours, 0)
            const isFuture = isFutureDate(day)
            const isToday = isSameDay(day, new Date())

            return (
              <div
                key={dayStr}
                className="card-base"
                style={{
                  overflow: 'hidden',
                  opacity: isFuture ? 0.45 : 1,
                  border: isToday ? '1px solid var(--chronos-accent)' : undefined,
                }}
              >
                {/* Day header */}
                <div style={{
                  padding: '10px 16px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: 'var(--chronos-surface-2)',
                  borderBottom: dayLogs.length > 0 ? '1px solid var(--chronos-border)' : undefined,
                }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', fontFamily: 'var(--font-display)', color: isToday ? 'var(--chronos-accent)' : 'var(--chronos-text)' }}>
                      {format(day, 'EEEE')}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginLeft: '8px' }}>
                      {format(day, 'MMM d')}
                    </span>
                  </div>
                  {dayHours > 0 && (
                    <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--chronos-accent)' }}>
                      {formatHours(dayHours)}
                    </span>
                  )}
                  {canEdit && !isFuture && (
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => openCreate(day)}
                      disabled={!profile?.department || taskTypes.length === 0}
                    >
                      <Plus size={12} />Log Time
                    </button>
                  )}
                </div>

                {/* Day logs */}
                {dayLogs.map(log => (
                  <div
                    key={log.id}
                    className="table-row"
                    style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}
                  >
                    <div style={{ width: '140px', flexShrink: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text)' }}>
                        {(log.project as Project | undefined)?.name || '—'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', marginTop: '1px' }}>
                        {(log.task_type as TaskType | undefined)?.name || '—'}
                      </div>
                    </div>
                    <div style={{ flex: 1, fontSize: '13px', color: 'var(--chronos-text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.description || ''}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--chronos-text)', flexShrink: 0 }}>
                      {log.hours}h
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          onClick={() => openEdit(log)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '6px' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-accent)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          title="Edit"
                        ><Edit2 size={13} /></button>
                        <button
                          onClick={() => deleteLog(log)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px', borderRadius: '6px' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-danger)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          title="Delete"
                        ><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                ))}

                {dayLogs.length === 0 && !isFuture && (
                  <div style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--chronos-text-muted)', fontStyle: 'italic' }}>
                    No time logged
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Weekly Summary ── */}
      {!loading && timeLogs.length > 0 && (
        <div className="card-base" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Clock size={16} style={{ color: 'var(--chronos-text-muted)', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '13px', color: 'var(--chronos-text-muted)' }}>
            Weekly Total
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--chronos-accent)' }}>
            {formatHours(totalHours)}
          </div>
          {canSubmit && (
            <button className="btn-primary" onClick={submitTimesheet} style={{ padding: '7px 16px', fontSize: '12px' }}>
              <Send size={12} />{tsStatus === 'rejected' ? 'Resubmit' : 'Submit'}
            </button>
          )}
          {timesheet?.status === 'approved' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--chronos-success, #34d399)', fontWeight: 600 }}>
              <Check size={14} />Approved
              {reviewer && <span style={{ fontWeight: 400, color: 'var(--chronos-text-muted)' }}>by {reviewer.full_name}</span>}
            </div>
          )}
          {timesheet?.status === 'submitted' && (
            <div style={{ fontSize: '12px', color: 'var(--chronos-warning)', fontWeight: 600 }}>
              Pending Review
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && timeLogs.length === 0 && isCurrentOrPastWeek && (
        <EmptyState
          icon={<FileText size={28} />}
          title="No time logged this week"
          description="Click 'Log Time' on any day to get started."
          action={
            profile?.department && taskTypes.length > 0 && canEdit ? (
              <button className="btn-primary" onClick={() => openCreate(new Date())}>
                <Plus size={14} />Log Time Today
              </button>
            ) : undefined
          }
        />
      )}

      {/* ── Log Time Modal ── */}
      {showModal && (
        <Modal
          title={editLog ? 'Edit Time Log' : 'Log Time'}
          onClose={() => setShowModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <FormField label="Project *">
              <Select
                value={form.project_id}
                onChange={v => setForm(f => ({ ...f, project_id: v }))}
                options={projectOptions}
                placeholder="Select project…"
              />
            </FormField>

            <FormField label="Task Type *">
              <Select
                value={form.task_type_id}
                onChange={v => setForm(f => ({ ...f, task_type_id: v }))}
                options={taskTypeOptions}
                placeholder={profile?.department ? `Select ${profile.department} task…` : 'No department set'}
                disabled={taskTypes.length === 0}
              />
            </FormField>

            <FormField label="Date *">
              <input
                type="date"
                className="input-base"
                value={form.log_date}
                min={weekStartStr}
                max={weekEndStr > format(new Date(), 'yyyy-MM-dd') ? format(new Date(), 'yyyy-MM-dd') : weekEndStr}
                onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))}
                style={{ width: '100%' }}
              />
            </FormField>

            <FormField label="Hours *">
              <input
                type="number"
                className="input-base"
                placeholder="e.g. 2.5"
                value={form.hours}
                min="0.25"
                max="24"
                step="0.25"
                onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                style={{ width: '100%' }}
              />
            </FormField>

            <FormField label="Description">
              <textarea
                className="input-base"
                placeholder="Optional notes…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </FormField>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>
                <X size={14} />Cancel
              </button>
              <button className="btn-primary" onClick={saveLog} disabled={saving}>
                {saving
                  ? <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3"/><path d="M12 3a9 9 0 019 9"/></svg>
                  : <Check size={14} />
                }
                {saving ? 'Saving…' : editLog ? 'Update' : 'Save Log'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
