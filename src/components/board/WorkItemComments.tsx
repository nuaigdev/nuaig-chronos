'use client'

import { useRef, useState } from 'react'
import { useProfile } from '@/hooks/useProfile'
import { useWorkItemComments, CommentNotifyTarget } from '@/hooks/useWorkItemComments'
import { WorkItemComment, Profile } from '@/types'
import { formatDate, getInitials } from '@/utils'
import { Send, Pencil, Trash2, X, Check } from 'lucide-react'

interface WorkItemCommentsProps {
  workItemId: string
  notifyTarget: CommentNotifyTarget
  /** Project members — the only people who can be @-mentioned. */
  projectMembers: Profile[]
}

export default function WorkItemComments({ workItemId, notifyTarget, projectMembers }: WorkItemCommentsProps) {
  const { user, isAdmin, isManager } = useProfile()
  const { comments, loading, postComment, editComment, deleteComment } = useWorkItemComments(workItemId)

  const [editingId, setEditingId] = useState<string | null>(null)
  const canModerate = isAdmin || isManager

  return (
    <div className="card-base" style={{ padding: '20px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>
        Comments{comments.length > 0 ? ` (${comments.length})` : ''}
      </h2>

      {/* Composer */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <Avatar name={user?.email?.split('@')[0] || 'U'} />
        <div style={{ flex: 1 }}>
          <CommentComposer
            projectMembers={projectMembers}
            submitLabel="Comment"
            resetAfterSubmit
            onSubmit={(body, mentionedIds) => postComment(body, notifyTarget, mentionedIds)}
          />
        </div>
      </div>

      {/* Thread */}
      {loading ? (
        <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', textAlign: 'center', padding: '16px' }}>
          Loading comments…
        </p>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', textAlign: 'center', padding: '16px' }}>
          No comments yet. Start the conversation.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {comments.map(c => {
            const mine = c.user_id === user?.id
            const isEditing = editingId === c.id
            return (
              <div key={c.id} style={{ display: 'flex', gap: '10px' }}>
                <Avatar name={c.user?.full_name || 'U'} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--chronos-text)' }}>
                      {c.user?.full_name || 'Unknown'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)' }}>
                      {formatDate(c.created_at, 'MMM d, h:mm a')}
                    </span>
                    {c.edited_at && (
                      <span style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', fontStyle: 'italic' }}>edited</span>
                    )}
                  </div>

                  {isEditing ? (
                    <CommentComposer
                      projectMembers={projectMembers}
                      initialValue={c.body}
                      initialMentions={c.mentions || []}
                      submitLabel="Save"
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (body, mentionedIds) => {
                        const ok = await editComment(c.id, body, mentionedIds)
                        if (ok) setEditingId(null)
                        return ok
                      }}
                    />
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--chronos-text-subtle)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {renderBody(c.body, (c.mentions || []).map(m => m.full_name))}
                    </p>
                  )}
                </div>

                {!isEditing && (mine || canModerate) && (
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    {mine && (
                      <button
                        onClick={() => setEditingId(c.id)}
                        title="Edit"
                        style={iconBtn}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-accent)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm('Delete this comment?')) deleteComment(c.id) }}
                      title="Delete"
                      style={iconBtn}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--chronos-danger)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--chronos-text-muted)')}
                    >
                      <Trash2 size={13} />
                    </button>
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

// ============================================
// COMPOSER — textarea with @-mention autocomplete
// ============================================
interface CommentComposerProps {
  projectMembers: Profile[]
  initialValue?: string
  initialMentions?: Profile[]
  submitLabel: string
  resetAfterSubmit?: boolean
  onCancel?: () => void
  onSubmit: (body: string, mentionedIds: string[]) => Promise<boolean>
}

function CommentComposer({
  projectMembers,
  initialValue = '',
  initialMentions = [],
  submitLabel,
  resetAfterSubmit,
  onCancel,
  onSubmit,
}: CommentComposerProps) {
  const [text, setText] = useState(initialValue)
  const [mentions, setMentions] = useState<Profile[]>(initialMentions)
  // { query, start } — start is the index of the '@' being completed.
  const [trigger, setTrigger] = useState<{ query: string; start: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const detectTrigger = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    // '@' then any run of non-space, non-@ characters, anchored at the caret.
    const m = before.match(/@([^\s@]*)$/)
    if (m) setTrigger({ query: m[1], start: caret - m[1].length - 1 })
    else setTrigger(null)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    detectTrigger(e.target.value, e.target.selectionStart ?? e.target.value.length)
  }

  const pickMember = (p: Profile) => {
    if (!trigger) return
    const caret = taRef.current?.selectionStart ?? text.length
    const before = text.slice(0, trigger.start)
    const after = text.slice(caret)
    const inserted = `@${p.full_name} `
    const next = before + inserted + after
    setText(next)
    setMentions(cur => (cur.some(m => m.id === p.id) ? cur : [...cur, p]))
    setTrigger(null)
    requestAnimationFrame(() => {
      const pos = (before + inserted).length
      taRef.current?.focus()
      taRef.current?.setSelectionRange(pos, pos)
    })
  }

  const candidates = trigger
    ? projectMembers
        .filter(p => {
          const q = trigger.query.toLowerCase()
          return !q || p.full_name.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q)
        })
        .slice(0, 6)
    : []

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    // Keep only mentions whose "@name" survived any manual edits.
    const active = mentions.filter(m => text.includes(`@${m.full_name}`))
    setBusy(true)
    const ok = await onSubmit(trimmed, active.map(m => m.id))
    setBusy(false)
    if (ok && resetAfterSubmit) { setText(''); setMentions([]); setTrigger(null) }
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={taRef}
        className="input-base"
        value={text}
        onChange={handleChange}
        placeholder="Write a comment…  Use @ to mention someone on the project."
        rows={3}
        onKeyDown={e => {
          if (trigger && candidates.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
            // Let the dropdown claim Enter/Tab to accept the top match.
            e.preventDefault()
            pickMember(candidates[0])
            return
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          if (e.key === 'Escape') setTrigger(null)
        }}
        style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
      />

      {/* Mention dropdown */}
      {trigger && candidates.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: '2px',
          background: 'var(--chronos-surface)', border: '1px solid var(--chronos-border)',
          borderRadius: '10px', boxShadow: '0 12px 28px rgba(0,0,0,0.35)', overflow: 'hidden',
          maxHeight: '220px', overflowY: 'auto',
        }}>
          {candidates.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); pickMember(p) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left', borderBottom: '1px solid var(--chronos-border)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--chronos-surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Avatar name={p.full_name} size={24} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text)' }}>{p.full_name}</div>
                {p.department && <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)' }}>{p.department}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '8px' }}>
        {onCancel && (
          <button className="btn-secondary" onClick={onCancel} disabled={busy} style={{ fontSize: '12px', padding: '6px 12px' }}>
            <X size={12} /> Cancel
          </button>
        )}
        <button className="btn-primary" onClick={submit} disabled={busy || !text.trim()} style={{ fontSize: '13px', padding: '7px 14px' }}>
          {submitLabel === 'Save' ? <Check size={13} /> : <Send size={13} />}
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

// ============================================
// Helpers
// ============================================
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: `${Math.round(size * 0.34)}px`, fontWeight: 700, color: 'white', fontFamily: 'var(--font-display)',
    }}>
      {getInitials(name)}
    </div>
  )
}

/** Render a comment body, highlighting any `@Name` that matches a mention. */
function renderBody(body: string, mentionNames: string[]): React.ReactNode {
  if (mentionNames.length === 0) return body
  // Longest names first so "@Ann Marie" wins over "@Ann".
  const escaped = mentionNames
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`@(?:${escaped.join('|')})`, 'g')

  const parts: React.ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index))
    parts.push(
      <span key={key++} style={{ color: 'var(--chronos-accent)', fontWeight: 600 }}>{m[0]}</span>
    )
    last = m.index + m[0].length
  }
  if (last < body.length) parts.push(body.slice(last))
  return parts
}

const iconBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--chronos-text-muted)',
  padding: '4px',
  borderRadius: '5px',
  display: 'flex',
  height: 'fit-content',
}
