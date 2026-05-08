'use client'

import { useNotifications } from '@/hooks/useNotifications'
import { AppNotification } from '@/types'
import { formatDate } from '@/utils'
import { Bell, Check, CheckCheck, Clock, FileText, AlertCircle } from 'lucide-react'
import { EmptyState } from '@/components/ui'

const ICONS: Record<string, React.ReactNode> = {
  timesheet_submitted: <FileText size={16} style={{ color: 'var(--chronos-info)' }} />,
  timesheet_approved: <Check size={16} style={{ color: 'var(--chronos-success)' }} />,
  timesheet_rejected: <AlertCircle size={16} style={{ color: 'var(--chronos-danger)' }} />,
  time_log_reminder: <Clock size={16} style={{ color: 'var(--chronos-warning)' }} />,
  timesheet_reminder: <Clock size={16} style={{ color: 'var(--chronos-warning)' }} />,
  pending_approval_alert: <AlertCircle size={16} style={{ color: 'var(--chronos-danger)' }} />,
}

export default function NotificationsPage() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Notifications</h1>
          <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button className="btn-secondary" onClick={markAllAsRead} style={{ fontSize: '13px', padding: '8px 14px' }}>
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={<Bell size={28} />} title="No notifications" description="You're all caught up! Notifications about timesheets and approvals will appear here." />
      ) : (
        <div className="card-base" style={{ overflow: 'hidden' }}>
          {notifications.map((n, i) => (
            <div
              key={n.id}
              onClick={() => !n.is_read && markAsRead(n.id)}
              style={{
                padding: '16px 20px',
                display: 'flex',
                gap: '14px',
                alignItems: 'flex-start',
                borderBottom: i < notifications.length - 1 ? '1px solid var(--chronos-border)' : 'none',
                background: n.is_read ? 'transparent' : 'var(--chronos-accent-glow)',
                cursor: n.is_read ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!n.is_read) e.currentTarget.style.background = 'rgba(59,130,246,0.08)' }}
              onMouseLeave={e => { if (!n.is_read) e.currentTarget.style.background = 'var(--chronos-accent-glow)' }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--chronos-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {ICONS[n.type] || <Bell size={16} style={{ color: 'var(--chronos-text-muted)' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '14px', fontWeight: n.is_read ? 400 : 600, color: 'var(--chronos-text)' }}>{n.title}</span>
                  <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', flexShrink: 0 }}>{formatDate(n.created_at, 'MMM d, h:mm a')}</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', marginTop: '4px', lineHeight: 1.5 }}>{n.message}</p>
              </div>
              {!n.is_read && (
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--chronos-accent)', flexShrink: 0, marginTop: '6px' }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
