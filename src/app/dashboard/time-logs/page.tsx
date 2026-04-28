'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { TimeLog, Project, Task } from '@/types'
import { Modal, FormField, Select, EmptyState } from '@/components/ui'
import { formatDate, formatHours, getWeekRange, getWeekDays } from '@/utils'
import { Clock, Plus, ChevronLeft, ChevronRight, Trash2, Edit2 } from 'lucide-react'
import { addWeeks, subWeeks, format } from 'date-fns'
import toast from 'react-hot-toast'

const supabase = createClient()

type TimeLogWithTimesheet = TimeLog & { timesheet?: { id: string; status: string } | null }

export default function TimeLogsPage() {
  const { profile, profileReady } = useAuth()
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [timeLogs, setTimeLogs] = useState<TimeLogWithTimesheet[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editLog, setEditLog] = useState<TimeLogWithTimesheet | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ project_id: '', task_id: '', log_date: formatDate(new Date(), 'yyyy-MM-dd'), hours: '', description: '' })

  const { start: weekStart, end: weekEnd } = getWeekRange(currentWeek)
  const weekDays = getWeekDays(weekStart)

  const fetchTimeLogs = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data } = await supabase
      .from('time_logs')
      .select('*, project:projects(id, name), task:tasks(id, name), timesheet:timesheets(id, status)')
      .eq('user_id', profile.id)
      .gte('log_date', formatDate(weekStart, 'yyyy-MM-dd'))
      .lte('log_date', formatDate(weekEnd, 'yyyy-MM-dd'))
      .order('log_date', { ascending: true })
    setTimeLogs((data || []) as unknown as TimeLogWithTimesheet[])
    setLoading(false)
  }, [profile, weekStart, weekEnd])

  const fetchProjects = useCallback(async () => {
    if (!profile) return
    const { data: memberProjs } = await supabase.from('project_members').select('project_id').eq('user_id', profile.id)
    const ids = memberProjs?.map(p => p.project_id) || []
    if (ids.length === 0) { setProjects([]); return }
    const { data } = await supabase.from('projects').select('id, name').in('id', ids).eq('status', 'active')
    setProjects((data || []) as unknown as Project[])
  }, [profile])

  // Gate both effects on profileReady to guarantee profile is non-null
  // before either fetch runs.
  useEffect(() => {
    if (!profileReady) return
    fetchTimeLogs()
  }, [profileReady, fetchTimeLogs, currentWeek])

  useEffect(() => {
    if (!profileReady) return
    fetchProjects()
  }, [profileReady, fetchProjects])

  useEffect(() => {
    if (form.project_id) fetchTasks(form.project_id)
  }, [form.project_id])

  const fetchTasks = async (projectId: string) => {
    const { data } = await supabase.from('tasks').select('id, name').eq('project_id', projectId).neq('status', 'completed')
    setTasks((data || []) as unknown as Task[])
  }

  const openCreate = () => {
    setEditLog(null)
    setForm({ project_id: '', task_id: '', log_date: formatDate(new Date(), 'yyyy-MM-dd'), hours: '', description: '' })
    setTasks([])
    setShowModal(true)
  }

  const openEdit = (log: TimeLogWithTimesheet) => {
    const ts = log.timesheet
    if (ts?.status === 'submitted' || ts?.status === 'approved') {
      toast.error('Cannot edit logs from a submitted or approved timesheet')
      return
    }
    setEditLog(log)
    setForm({
      project_id: log.project_id,
      task_id: log.task_id || '',
      log_date: log.log_date,
      hours: log.hours.toString(),
      description: log.description || '',
    })
    if (log.project_id) fetchTasks(log.project_id)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.project_id || !form.hours || !form.log_date) { toast.error('Please fill in required fields'); return }
    const hrs = parseFloat(form.hours)
    if (isNaN(hrs) || hrs <= 0 || hrs > 24) { toast.error('Hours must be between 0.1 and 24'); return }

    setSaving(true)
    try {
      if (editLog) {
        const ts = editLog.timesheet
        if (ts?.status === 'submitted' || ts?.status === 'approved') {
          toast.error('Cannot modify a submitted or approved timesheet')
          return
        }
        const { error } = await supabase.from('time_logs').update({
          project_id: form.project_id,
          task_id: form.task_id || null,
          log_date: form.log_date,
          hours: hrs,
          description: form.description || null,
        }).eq('id', editLog.id)
        if (error) throw error
        toast.success('Time log updated!')
      } else {
        let timesheetId: string
        const weekStartStr = formatDate(weekStart, 'yyyy-MM-dd')
        const { data: ts } = await supabase
          .from('timesheets')
          .select('id, status')
          .eq('user_id', profile!.id)
          .eq('week_start_date', weekStartStr)
          .single()

        if (ts) {
          if (ts.status === 'submitted' || ts.status === 'approved') {
            toast.error('Cannot add logs to a submitted or approved timesheet')
            return
          }
          timesheetId = ts.id
        } else {
          const { data: newTs, error } = await supabase.from('timesheets').insert({
            user_id: profile!.id,
            week_start_date: weekStartStr,
            week_end_date: formatDate(weekEnd, 'yyyy-MM-dd'),
            status: 'draft',
          }).select('id').single()
          if (error) throw error
          timesheetId = newTs!.id
        }

        const { error } = await supabase.from('time_logs').insert({
          timesheet_id: timesheetId,
          user_id: profile!.id,
          project_id: form.project_id,
          task_id: form.task_id || null,
          log_date: form.log_date,
          hours: hrs,
          description: form.description || null,
        })
        if (error) throw error
        toast.success('Time logged!')
      }

      setShowModal(false)
      setEditLog(null)
      setForm({ project_id: '', task_id: '', log_date: formatDate(new Date(), 'yyyy-MM-dd'), hours: '', description: '' })
      fetchTimeLogs()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error saving time log')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (log: TimeLogWithTimesheet) => {
    const ts = log.timesheet
    if (ts?.status === 'submitted' || ts?.status === 'approved') {
      toast.error('Cannot delete logs from a submitted or approved timesheet')
      return
    }
    if (!confirm('Delete this time log?')) return
    await supabase.from('time_logs').delete().eq('id', log.id)
    toast.success('Time log deleted')
    fetchTimeLogs()
  }

  const totalHours = timeLogs.reduce((s, l) => s + l.hours, 0)
  const logsByDay = weekDays.reduce((acc, day) => {
    const dateStr = format(day, 'yyyy-MM-dd')
    acc[dateStr] = timeLogs.filter(l => l.log_date === dateStr)
    return acc
  }, {} as Record<string, TimeLogWithTimesheet[]>)

  const today = formatDate(new Date(), 'yyyy-MM-dd')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Time Logs</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Week of {formatDate(weekStart, 'MMM d')} – {formatDate(weekEnd, 'MMM d, yyyy')} · {formatHours(totalHours)} logged
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}><Plus size={14} />Log Time</button>
      </div>

      {/* Week navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className="btn-secondary" style={{ padding: '8px 12px' }} onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
          <ChevronLeft size={14} />
        </button>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
          {weekDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const dayLogs = logsByDay[dateStr] || []
            const dayHours = dayLogs.reduce((s, l) => s + l.hours, 0)
            const isToday = dateStr === today
            return (
              <div key={dateStr} style={{
                padding: '10px', borderRadius: '10px', textAlign: 'center',
                background: isToday ? 'rgba(59,130,246,0.1)' : 'var(--chronos-surface)',
                border: `1px solid ${isToday ? 'rgba(59,130,246,0.3)' : 'var(--chronos-border)'}`,
              }}>
                <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', marginBottom: '4px' }}>{format(day, 'EEE')}</div>
                <div style={{ fontSize: '14px', fontFamily: 'var(--font-display)', fontWeight: 700, color: isToday ? 'var(--chronos-accent)' : 'var(--chronos-text)' }}>{format(day, 'd')}</div>
                <div style={{ fontSize: '11px', color: dayHours > 0 ? 'var(--chronos-success)' : 'var(--chronos-text-muted)', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                  {dayHours > 0 ? `${dayHours}h` : '—'}
                </div>
              </div>
            )
          })}
        </div>
        <button className="btn-secondary" style={{ padding: '8px 12px' }} onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
          <ChevronRight size={14} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : timeLogs.length === 0 ? (
        <EmptyState
          icon={<Clock size={28} />}
          title="No time logged this week"
          description="Start logging your time to track your work."
          action={<button className="btn-primary" onClick={openCreate}><Plus size={14} />Log Time</button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {weekDays.filter(day => (logsByDay[format(day, 'yyyy-MM-dd')] || []).length > 0).map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const dayLogs = logsByDay[dateStr]
            const dayHours = dayLogs.reduce((s, l) => s + l.hours, 0)
            return (
              <div key={dateStr} className="card-base" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--chronos-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--chronos-surface-2)' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px' }}>{format(day, 'EEEE, MMMM d')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--chronos-accent)' }}>{formatHours(dayHours)}</span>
                </div>
                {dayLogs.map(log => {
                  const proj = log.project as { name: string } | undefined
                  const task = log.task as { name: string } | undefined
                  const ts = log.timesheet
                  const isLocked = ts?.status === 'submitted' || ts?.status === 'approved'
                  return (
                    <div key={log.id} className="table-row" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '48px', height: '36px', borderRadius: '8px', background: 'var(--chronos-accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--chronos-accent)', flexShrink: 0 }}>
                        {log.hours}h
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--chronos-text)' }}>{proj?.name}</div>
                        {task && <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '2px' }}>{task.name}</div>}
                        {log.description && <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '2px', fontStyle: 'italic' }}>{log.description}</div>}
                      </div>
                      {isLocked ? (
                        <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', padding: '2px 8px', borderRadius: '100px', background: 'var(--chronos-surface-2)' }}>
                          {ts?.status}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => openEdit(log)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '6px', borderRadius: '6px', display: 'flex' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-accent)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          ><Edit2 size={13} /></button>
                          <button onClick={() => handleDelete(log)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '6px', borderRadius: '6px', display: 'flex' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-danger)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                          ><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditLog(null) }} title={editLog ? 'Edit Time Log' : 'Log Time'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormField label="Date" required>
            <input type="date" className="input-base" value={form.log_date} onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))} />
          </FormField>
          <FormField label="Project" required>
            <Select
              value={form.project_id}
              onChange={v => { setForm(f => ({ ...f, project_id: v, task_id: '' })); setTasks([]) }}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              placeholder="Select project"
            />
          </FormField>
          {tasks.length > 0 && (
            <FormField label="Task">
              <Select value={form.task_id} onChange={v => setForm(f => ({ ...f, task_id: v }))} options={tasks.map(t => ({ value: t.id, label: t.name }))} placeholder="Select task (optional)" />
            </FormField>
          )}
          <FormField label="Hours" required>
            <input type="number" min="0.25" max="24" step="0.25" className="input-base" placeholder="e.g. 2.5" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <textarea className="input-base" placeholder="What did you work on?" rows={3} style={{ resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => { setShowModal(false); setEditLog(null) }}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editLog ? 'Update Log' : 'Log Time'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
