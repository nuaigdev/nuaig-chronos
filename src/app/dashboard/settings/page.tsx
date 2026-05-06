'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/hooks/useProfile'
import { Holiday } from '@/types'
import { FormField, Modal, EmptyState } from '@/components/ui'
import { Settings, Plus, Trash2, Calendar, Clock } from 'lucide-react'
import { formatDate } from '@/utils'
import toast from 'react-hot-toast'

const supabase = createClient()

export default function SettingsPage() {
  const { profile, company, isAdmin } = useProfile()
  const [workingHours, setWorkingHours] = useState(8)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [saving, setSaving] = useState(false)
  const [showHolidayModal, setShowHolidayModal] = useState(false)
  const [holidayForm, setHolidayForm] = useState({ name: '', date: '', is_optional: false })
  const [activeTab, setActiveTab] = useState<'general' | 'holidays'>('general')

  useEffect(() => { fetchSettings(); fetchHolidays() }, [])

  const fetchSettings = async () => {
    // RLS automatically scopes to the user's company via company_id
    const { data } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('key', 'working_hours_per_day')
      .single()
    if (data) setWorkingHours((data.value as { value: number }).value)
  }

  const fetchHolidays = async () => {
    // RLS automatically scopes to the user's company via company_id
    const { data, error } = await supabase.from('holidays').select('*').order('date')
    if (error) return
    setHolidays((data || []) as unknown as Holiday[])
  }

  const saveSettings = async () => {
    if (!profile) return
    setSaving(true)
    // Update is RLS-scoped; the unique constraint is now (company_id, key)
    await supabase
      .from('admin_settings')
      .update({ value: { value: workingHours }, updated_by: profile.id })
      .eq('key', 'working_hours_per_day')
    toast.success('Settings saved!')
    setSaving(false)
  }

  const addHoliday = async () => {
    if (!profile) return
    if (!holidayForm.name || !holidayForm.date) { toast.error('Name and date required'); return }
    const { error } = await supabase.from('holidays').insert({
      ...holidayForm,
      created_by: profile.id,
      // company_id is automatically set by RLS / trigger from the user's profile
    })
    if (error) { toast.error('Error adding holiday'); return }
    toast.success('Holiday added!')
    setShowHolidayModal(false)
    setHolidayForm({ name: '', date: '', is_optional: false })
    fetchHolidays()
  }

  const deleteHoliday = async (id: string) => {
    if (!confirm('Remove this holiday?')) return
    await supabase.from('holidays').delete().eq('id', id)
    toast.success('Holiday removed')
    fetchHolidays()
  }

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
        <EmptyState icon={<Settings size={28} />} title="Admin Only" description="Only administrators can access settings." />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
      <div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Settings</h1>
        <p style={{ color: 'var(--chronos-text-muted)', fontSize: '13px', marginTop: '2px' }}>Configure workspace settings for {company?.name ?? 'your organisation'}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--chronos-border)' }}>
        {[{ key: 'general', label: 'General', icon: <Settings size={14} /> }, { key: 'holidays', label: 'Holiday Calendar', icon: <Calendar size={14} /> }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as typeof activeTab)} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', border: 'none', cursor: 'pointer', background: 'transparent',
            fontSize: '13px', fontWeight: 500,
            color: activeTab === t.key ? 'var(--chronos-accent)' : 'var(--chronos-text-muted)',
            borderBottom: activeTab === t.key ? '2px solid var(--chronos-accent)' : '2px solid transparent',
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="card-base" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} style={{ color: 'var(--chronos-accent)' }} />
              Working Hours
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', marginBottom: '14px' }}>Standard working hours per day for your organization.</p>
            <FormField label="Hours per day">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="range" min={4} max={12} step={0.5}
                  value={workingHours}
                  onChange={e => setWorkingHours(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--chronos-accent)' }}
                />
                <div style={{ width: '60px', textAlign: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--chronos-accent)' }}>
                  {workingHours}h
                </div>
              </div>
            </FormField>
          </div>

          <div style={{ borderTop: '1px solid var(--chronos-border)', paddingTop: '16px' }}>
            <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Organisation Info</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <FormField label="Company Name">
                <input className="input-base" value={company?.name ?? ''} disabled style={{ opacity: 0.6 }} />
              </FormField>
              <FormField label="Time Zone">
                <input className="input-base" value={Intl.DateTimeFormat().resolvedOptions().timeZone} disabled style={{ opacity: 0.6 }} />
              </FormField>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={saveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'holidays' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={() => setShowHolidayModal(true)}><Plus size={14} />Add Holiday</button>
          </div>

          {holidays.length === 0 ? (
            <EmptyState icon={<Calendar size={28} />} title="No holidays configured" description="Add company holidays to the calendar." action={<button className="btn-primary" onClick={() => setShowHolidayModal(true)}><Plus size={14} />Add Holiday</button>} />
          ) : (
            <div className="card-base" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--chronos-border)', background: 'var(--chronos-surface-2)' }}>
                    {['Holiday', 'Date', 'Type', ''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--chronos-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holidays.map(h => (
                    <tr key={h.id} className="table-row">
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 500 }}>{h.name}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--chronos-text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {formatDate(h.date + 'T00:00:00', 'EEEE, MMMM d, yyyy')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '100px', background: h.is_optional ? 'rgba(251,191,36,0.1)' : 'rgba(52,211,153,0.1)', color: h.is_optional ? '#fbbf24' : '#34d399' }}>
                          {h.is_optional ? 'Optional' : 'Mandatory'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button onClick={() => deleteHoliday(h.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', padding: '4px' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-danger)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
                        ><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showHolidayModal} onClose={() => setShowHolidayModal(false)} title="Add Holiday" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Holiday Name" required>
            <input className="input-base" placeholder="e.g. New Year's Day" value={holidayForm.name} onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Date" required>
            <input type="date" className="input-base" value={holidayForm.date} onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))} />
          </FormField>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', color: 'var(--chronos-text-subtle)' }}>
            <input type="checkbox" checked={holidayForm.is_optional} onChange={e => setHolidayForm(f => ({ ...f, is_optional: e.target.checked }))} style={{ accentColor: 'var(--chronos-accent)', width: '16px', height: '16px' }} />
            Optional holiday (employees can choose)
          </label>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowHolidayModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={addHoliday}>Add Holiday</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
