'use client'

import { useState } from 'react'
import { useProfile } from '@/hooks/useProfile'
import { useWorkItemComments, CommentNotifyTarget } from '@/hooks/useWorkItemComments'
import { WorkItemComment } from '@/types'
import { formatDate, getInitials } from '@/utils'
import { Send, Pencil, Trash2, X, Check } from 'lucide-react'

interface WorkItemCommentsProps {
  workItemId: string
  notifyTarget: CommentNotifyTarget
}

export default function WorkItemComments({ workItemId, notifyTarget }: WorkItemCommentsProps) {
  const { user, isAdmin, isManager } = useProfile()
  const { comments, loading, postComment, editComment, deleteComment } = useWorkItemComments(workItemId)

  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const canModerate = isAdmin || isManager

  const handlePost = async () => {
    if (!draft.trim()) return
    setPosting(true)
    const ok = await postComment(draft, notifyTarget)
    setPosting(false)
    if (ok) setDraft('')
  }

  const startEdit = (c: WorkItemComment) => { setEditingId(c.id); setEditDraft(c.body) }
  const cancelEdit = () => { setEditingId(null); setEditDraft('') }

  const saveEdit = async (id: string) => {
    const ok = await editComment(id, editDraft)
    if (ok) cancelEdit()
  }

  return (
    <div className="card-base" style={{ padding: '20px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>
        Comments{comments.length > 0 ? ` (${comments.length})` : ''}
      </h2>

      {/* Composer */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: 'white', fontFamily: 'var(--font-display)',
        }}>
          {getInitials(user?.email?.split('@')[0] || 'U')}
        </div>
        <div style={{ flex: 1 }}>
          <textarea
            className="input-base"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write a comment…"
            rows={3}
            onKeyDown={e => {
              // Cmd/Ctrl+Enter to post, matching the usual convention.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePost()
            }}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button className="btn-primary" onClick={handlePost} disabled={posting || !draft.trim()} style={{ fontSize: '13px', padding: '7px 14px' }}>
              <Send size={13} />
              {posting ? 'Posting…' : 'Comment'}
            </button>
          </div>
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
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700, color: 'white', fontFamily: 'var(--font-display)',
                }}>
                  {getInitials(c.user?.full_name || 'U')}
                </div>

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
                    <div>
                      <textarea
                        className="input-base"
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        rows={3}
                        style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <button className="btn-primary" onClick={() => saveEdit(c.id)} disabled={!editDraft.trim()} style={{ fontSize: '12px', padding: '5px 10px' }}>
                          <Check size={12} /> Save
                        </button>
                        <button className="btn-secondary" onClick={cancelEdit} style={{ fontSize: '12px', padding: '5px 10px' }}>
                          <X size={12} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--chronos-text-subtle)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {c.body}
                    </p>
                  )}
                </div>

                {!isEditing && (mine || canModerate) && (
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    {mine && (
                      <button
                        onClick={() => startEdit(c)}
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
