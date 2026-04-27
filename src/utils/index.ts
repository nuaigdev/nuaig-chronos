import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, fmt = 'MMM d, yyyy') {
  return format(new Date(date), fmt)
}

export function getWeekRange(date: Date = new Date()) {
  const start = startOfWeek(date, { weekStartsOn: 1 }) // Monday
  const end = endOfWeek(date, { weekStartsOn: 1 })
  return { start, end }
}

export function getWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'text-emerald-400 bg-emerald-400/10',
    archived: 'text-slate-400 bg-slate-400/10',
    completed: 'text-blue-400 bg-blue-400/10',
    todo: 'text-amber-400 bg-amber-400/10',
    in_progress: 'text-blue-400 bg-blue-400/10',
    draft: 'text-slate-400 bg-slate-400/10',
    submitted: 'text-amber-400 bg-amber-400/10',
    approved: 'text-emerald-400 bg-emerald-400/10',
    rejected: 'text-red-400 bg-red-400/10',
  }
  return colors[status] || 'text-slate-400 bg-slate-400/10'
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function calculateCompletionPercentage(logged: number, estimated: number): number {
  if (!estimated) return 0
  return Math.min(Math.round((logged / estimated) * 100), 100)
}

export function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    admin: 'text-violet-400 bg-violet-400/10',
    manager: 'text-blue-400 bg-blue-400/10',
    employee: 'text-slate-400 bg-slate-400/10',
  }
  return colors[role] || 'text-slate-400 bg-slate-400/10'
}

export async function createNotification(
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>,
  {
    user_id,
    type,
    title,
    message,
    related_id,
  }: {
    user_id: string
    type: string
    title: string
    message: string
    related_id?: string
  }
) {
  await supabase.from('notifications').insert({
    user_id,
    type: type as never,
    title,
    message,
    related_id,
  })
}
