'use client'

import { ReactNode } from 'react'
import { cn, getStatusColor } from '@/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ============================
// STAT CARD
// ============================
interface StatCardProps {
  label: string
  value: string | number
  icon: ReactNode
  trend?: { value: number; label: string }
  accent?: string
  suffix?: string
}

export function StatCard({ label, value, icon, trend, accent = '#3b82f6', suffix }: StatCardProps) {
  return (
    <div className="card-base card-hover p-5 animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${accent}15`, color: accent
        }}>
          {icon}
        </div>
        {trend && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '12px', fontWeight: 500,
            color: trend.value > 0 ? 'var(--chronos-success)' : trend.value < 0 ? 'var(--chronos-danger)' : 'var(--chronos-text-muted)'
          }}>
            {trend.value > 0 ? <TrendingUp size={12} /> : trend.value < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <div style={{ fontSize: '26px', fontFamily: 'Syne, sans-serif', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--chronos-text)', lineHeight: 1 }}>
        {value}{suffix && <span style={{ fontSize: '14px', color: 'var(--chronos-text-muted)', marginLeft: '4px' }}>{suffix}</span>}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', marginTop: '6px' }}>{label}</div>
      {trend && (
        <div style={{ fontSize: '11px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>{trend.label}</div>
      )}
    </div>
  )
}

// ============================
// STATUS BADGE
// ============================
export function StatusBadge({ status }: { status: string }) {
  const colorClass = getStatusColor(status)
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <span className={`status-badge ${colorClass}`}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
      {label}
    </span>
  )
}

// ============================
// EMPTY STATE
// ============================
interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--chronos-text-muted)' }}>
      <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '16px', background: 'var(--chronos-surface-2)', marginBottom: '16px', color: 'var(--chronos-text-muted)' }}>
        {icon}
      </div>
      <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '16px', fontWeight: 700, color: 'var(--chronos-text)', marginBottom: '8px' }}>
        {title}
      </h3>
      <p style={{ fontSize: '14px', maxWidth: '320px', margin: '0 auto 20px', lineHeight: 1.6 }}>{description}</p>
      {action}
    </div>
  )
}

// ============================
// LOADING SKELETON
// ============================
export function Skeleton({ width = '100%', height = '16px', borderRadius = '8px' }: { width?: string; height?: string; borderRadius?: string }) {
  return (
    <div style={{
      width, height, borderRadius,
      background: 'linear-gradient(90deg, var(--chronos-surface-2) 25%, var(--chronos-border) 50%, var(--chronos-surface-2) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite'
    }} />
  )
}

// ============================
// SECTION HEADER
// ============================
export function SectionHeader({
  title, subtitle, action
}: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
      <div>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h2>
        {subtitle && <p style={{ fontSize: '13px', color: 'var(--chronos-text-muted)', marginTop: '4px' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ============================
// PROGRESS BAR
// ============================
export function ProgressBar({ value, max = 100, color = 'var(--chronos-accent)' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100)
  const dynamicColor = pct >= 100 ? 'var(--chronos-danger)' : pct >= 80 ? 'var(--chronos-warning)' : color

  return (
    <div style={{ height: '6px', background: 'var(--chronos-surface-2)', borderRadius: '100px', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        background: dynamicColor,
        borderRadius: '100px',
        transition: 'width 0.5s ease',
      }} />
    </div>
  )
}

// ============================
// MODAL
// ============================
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  if (!isOpen) return null

  const widths = { sm: '400px', md: '560px', lg: '760px' }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card-base animate-fade-in"
        style={{ width: '100%', maxWidth: widths[size], maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--chronos-border)' }}>
          <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '16px', fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chronos-text-muted)', display: 'flex', padding: '4px', borderRadius: '6px' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--chronos-text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--chronos-text-muted)'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ============================
// FORM FIELD
// ============================
interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
}

export function FormField({ label, required, error, children }: FormFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--chronos-text-subtle)' }}>
        {label}{required && <span style={{ color: 'var(--chronos-danger)', marginLeft: '3px' }}>*</span>}
      </label>
      {children}
      {error && <span style={{ fontSize: '12px', color: 'var(--chronos-danger)' }}>{error}</span>}
    </div>
  )
}

// ============================
// SELECT INPUT
// ============================
interface SelectProps {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
}

export function Select({ value, onChange, options, placeholder, disabled }: SelectProps) {
  return (
    <select
      className="input-base"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
