'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Timesheet, Profile, TimeLog } from '@/types'
import { StatusBadge, EmptyState, Modal, FormField } from '@/components/ui'
import { formatDate, formatHours, getInitials } from '@/utils'
import { CheckSquare, Check, X, ChevronRight, Clock, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const supabase = createClient()

type TimesheetWithUser = Timesheet & { user: Profile }

export default function ApprovalsPage() {
  const { profile, profileReady, canManageProjects } = useAuth()
  const [timesheets, setTimesheets] = useState<TimesheetWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, TimeLog[]>>({})
  const [statusFilter, setStatusFilter] = useState<'submitted' | 'approved' | 'rejected' | 'all'>('submitted')
  const [reviewModal, setReviewModal] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTimesheets = useCallback(async () => {
    if (!profile || !canManageProjects) return
    setLoading(true)
    let query = supabase
      .from('timesheets')
      .select('*, user:profiles!timesheets_user_id_fkey(id, full_name, email, role, department, avatar_url, is_active, created_at, updated_at)')
      .order('submitted_at', { ascending: true })
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    const { data } = await query
    setTimesheets((data || []) as unknown as TimesheetWithUser[])
    setLoading(false)
  }, [profile, canManageProjects, statusFilter])

  // Gate on profileReady so canManageProjects is accurate before we decide
  // whether to fetch or show empty. Previously this used [profile?.id] which
  // fired while profile was still null, causing fetchTimesheets to bail early
  // and leave loading=true forever for managers and admins.
  useEffect(() => {
    if (!profileReady) return
    fetchTimesheets()
  }, [profileReady, fetchTimesheets])

  const fetchLogs = async (timesheetId: string) => {
    if (logs[timesheetId]) return
    const { data } = await supabase
      .from('time_logs')
      .select('*, project:projects(name), task:tasks(name)')
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
        .update({
          status,
          reviewed_by: profile!.id,
          reviewed_at: new Date().toISOString(),
          review_comment: comment || null,
        })
        .eq('id', reviewModal.id)
      if (error) throw error

      // Notify employee
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Approvals</h1>
        <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>
          Review and approve team timesheets
        </p>
      </div>

      {pendingCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderRadius: '12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <AlertCircle size={16} style={{ color: 'var(--chronos-warning)', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--chronos-warning)', fontWeight: 500 }}>
            {pendingCount} timesheet{pendingCount > 1 ? 's' : ''} waiting for your review
          </span>
        </div>
      )}

      {/* Filters */}
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
                  {/* Avatar */}
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
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>Loading...</div>
                    ) : logs[ts.id].length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--chronos-text-muted)', fontSize: '13px' }}>No time logs</div>
                    ) : (
                      <>
                        {Object.entries(
                          logs[ts.id].reduce((acc, log) => {
                            const proj = (log.project as { name: string } | undefined)?.name || 'Unknown'
                            if (!acc[proj]) acc[proj] = []
                            acc[proj].push(log)
                            return acc
                          }, {} as Record<string, TimeLog[]>)
                        ).map(([projName, projLogs]) => (
                          <div key={projName}>
                            <div style={{ padding: '8px 20px', background: 'var(--chronos-surface-2)', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--chronos-border)' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text-subtle)' }}>{projName}</span>
                              <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--chronos-accent)' }}>{formatHours(projLogs.reduce((s, l) => s + l.hours, 0))}</span>
                            </div>
                            {projLogs.map(log => (
                              <div key={log.id} className="table-row" style={{ padding: '10px 20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <div style={{ width: '90px', fontSize: '12px', color: 'var(--chronos-text-muted)', flexShrink: 0 }}>
                                  {formatDate(log.log_date + 'T00:00:00', 'EEE, MMM d')}
                                </div>
                                <div style={{ flex: 1, fontSize: '13px', color: 'var(--chronos-text)' }}>
                                  {(log.task as { name: string } | undefined)?.name || log.description || '—'}
                                </div>
                                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600 }}>{log.hours}h</div>
                              </div>
                            ))}
                          </div>
                        ))}
                        <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--chronos-border)', background: 'var(--chronos-surface-2)' }}>
                          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '14px' }}>
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
