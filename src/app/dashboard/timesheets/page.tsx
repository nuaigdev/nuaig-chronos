'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Timesheet, TimeLog } from '@/types'
import { StatusBadge, EmptyState, ProgressBar } from '@/components/ui'
import { formatDate, formatHours, getWeekRange } from '@/utils'
import { FileText, ChevronRight, Send, RefreshCw } from 'lucide-react'
import { format, subWeeks } from 'date-fns'
import toast from 'react-hot-toast'

const supabase = createClient()

export default function TimesheetsPage() {
  const { profile } = useAuth()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, TimeLog[]>>({})

  useEffect(() => { fetchTimesheets() }, [profile])

  const fetchTimesheets = async () => {
    if (!profile) return
    setLoading(true)
    const { data } = await supabase
      .from('timesheets')
      .select('*, reviewer:profiles!timesheets_reviewed_by_fkey(full_name)')
      .eq('user_id', profile.id)
      .order('week_start_date', { ascending: false })
    setTimesheets((data || []) as Timesheet[])
    setLoading(false)
  }

  const fetchLogs = async (timesheetId: string) => {
    if (logs[timesheetId]) return
    const { data } = await supabase
      .from('time_logs')
      .select('*, project:projects(name), task:tasks(name)')
      .eq('timesheet_id', timesheetId)
      .order('log_date')
    setLogs(prev => ({ ...prev, [timesheetId]: (data || []) as TimeLog[] }))
  }

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    fetchLogs(id)
  }

  const submitTimesheet = async (id: string) => {
    if (!confirm('Submit this timesheet for approval?')) return
    const { error } = await supabase
      .from('timesheets')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { toast.error('Failed to submit'); return }

    // Notify managers
    const { data: managers } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'manager'])
    if (managers) {
      const notifications = managers.map(m => ({
        user_id: m.id,
        type: 'timesheet_submitted' as const,
        title: 'Timesheet Submitted',
        message: `${profile?.full_name} submitted a timesheet for review.`,
        related_id: id,
      }))
      await supabase.from('notifications').insert(notifications)
    }

    toast.success('Timesheet submitted for approval!')
    fetchTimesheets()
  }

  const ensureCurrentWeekTimesheet = async () => {
    const { start: weekStart, end: weekEnd } = getWeekRange()
    const weekStartStr = format(weekStart, 'yyyy-MM-dd')
    const existing = timesheets.find(t => t.week_start_date === weekStartStr)
    if (existing) { toast('Current week timesheet already exists'); return }

    const { error } = await supabase.from('timesheets').insert({
      user_id: profile!.id,
      week_start_date: weekStartStr,
      week_end_date: format(weekEnd, 'yyyy-MM-dd'),
      status: 'draft',
    })
    if (error) toast.error('Failed to create timesheet')
    else { toast.success('Timesheet created'); fetchTimesheets() }
  }

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      draft: '#64748b', submitted: '#fbbf24', approved: '#34d399', rejected: '#f87171'
    }
    return map[status] || '#64748b'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Timesheets</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>Weekly timesheet submissions and status</p>
        </div>
        <button className="btn-secondary" onClick={ensureCurrentWeekTimesheet}>
          <RefreshCw size={14} /> New Timesheet
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--chronos-border)', borderTopColor: 'var(--chronos-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : timesheets.length === 0 ? (
        <EmptyState icon={<FileText size={28} />} title="No timesheets yet" description="Log time first, or create a timesheet for the current week." action={<button className="btn-primary" onClick={ensureCurrentWeekTimesheet}><RefreshCw size={14} />Create Timesheet</button>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {timesheets.map(ts => {
            const isExpanded = expanded === ts.id
            const canSubmit = ts.status === 'draft' || ts.status === 'rejected'
            const reviewer = (ts as Timesheet & { reviewer?: { full_name: string } }).reviewer
            return (
              <div key={ts.id} className="card-base" style={{ overflow: 'hidden' }}>
                {/* Header row */}
                <div
                  onClick={() => toggleExpand(ts.id)}
                  style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--chronos-surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getStatusColor(ts.status), flexShrink: 0, boxShadow: `0 0 8px ${getStatusColor(ts.status)}60` }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '15px' }}>
                      {formatDate(ts.week_start_date + 'T00:00:00', 'MMM d')} – {formatDate(ts.week_end_date + 'T00:00:00', 'MMM d, yyyy')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--chronos-text-muted)', marginTop: '3px', display: 'flex', gap: '12px' }}>
                      <span>{formatHours(ts.total_hours)} logged</span>
                      {ts.submitted_at && <span>Submitted {formatDate(ts.submitted_at, 'MMM d')}</span>}
                      {reviewer && <span>Reviewed by {reviewer.full_name}</span>}
                    </div>
                  </div>
                  <StatusBadge status={ts.status} />
                  {canSubmit && ts.total_hours > 0 && (
                    <button
                      className="btn-primary"
                      style={{ padding: '7px 14px', fontSize: '12px' }}
                      onClick={e => { e.stopPropagation(); submitTimesheet(ts.id) }}
                    >
                      <Send size={12} />
                      {ts.status === 'rejected' ? 'Resubmit' : 'Submit'}
                    </button>
                  )}
                  <ChevronRight size={14} style={{ color: 'var(--chronos-text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                </div>

                {/* Rejection comment */}
                {ts.status === 'rejected' && ts.review_comment && (
                  <div style={{ margin: '0 20px 12px', padding: '12px', borderRadius: '8px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--chronos-danger)', marginBottom: '4px' }}>REJECTION REASON</div>
                    <div style={{ fontSize: '13px', color: 'var(--chronos-text-subtle)' }}>{ts.review_comment}</div>
                  </div>
                )}

                {/* Expanded logs */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--chronos-border)' }}>
                    {!logs[ts.id] ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>Loading...</div>
                    ) : logs[ts.id].length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>No time logs in this timesheet</div>
                    ) : (
                      <>
                        {/* Group by project */}
                        {Object.entries(
                          logs[ts.id].reduce((acc, log) => {
                            const proj = (log.project as { name: string } | undefined)?.name || 'Unknown'
                            if (!acc[proj]) acc[proj] = []
                            acc[proj].push(log)
                            return acc
                          }, {} as Record<string, TimeLog[]>)
                        ).map(([projName, projLogs]) => (
                          <div key={projName}>
                            <div style={{ padding: '10px 20px', background: 'var(--chronos-surface-2)', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--chronos-border)' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text-subtle)' }}>{projName}</span>
                              <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--chronos-accent)' }}>
                                {formatHours(projLogs.reduce((s, l) => s + l.hours, 0))}
                              </span>
                            </div>
                            {projLogs.map(log => (
                              <div key={log.id} className="table-row" style={{ padding: '10px 20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <div style={{ width: '70px', fontSize: '12px', color: 'var(--chronos-text-muted)', flexShrink: 0 }}>
                                  {formatDate(log.log_date + 'T00:00:00', 'EEE, MMM d')}
                                </div>
                                <div style={{ flex: 1, fontSize: '13px', color: 'var(--chronos-text)' }}>
                                  {(log.task as { name: string } | undefined)?.name || log.description || '—'}
                                </div>
                                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--chronos-text)', flexShrink: 0 }}>
                                  {log.hours}h
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                        <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--chronos-border)', background: 'var(--chronos-surface-2)' }}>
                          <span style={{ fontSize: '14px', fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--chronos-text)' }}>
                            Total: <span style={{ color: 'var(--chronos-accent)' }}>{formatHours(ts.total_hours)}</span>
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
