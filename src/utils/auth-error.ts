import toast from 'react-hot-toast'
import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Detect a Postgrest error caused by an expired/invalid JWT.
 *
 * RLS-protected queries return either:
 *   - error.code === 'PGRST301' (JWT expired)
 *   - HTTP status 401 (varies by Supabase version)
 *   - error.message containing 'jwt' / 'expired' / 'invalid token'
 *
 * Profile-row-not-found (PGRST116) and other application errors are NOT
 * auth errors and must NOT trigger a redirect.
 */
export function isPostgrestAuthError(err: PostgrestError | null | undefined): boolean {
  if (!err) return false
  if (err.code === 'PGRST301') return true
  // Postgrest sometimes surfaces 401s as the `code` field on newer @supabase/ssr.
  const codeStr = (err.code || '').toString()
  if (codeStr === '401') return true
  const msg = (err.message || '').toLowerCase()
  return msg.includes('jwt') || msg.includes('expired') || msg.includes('invalid token')
}

let redirectScheduled = false

/**
 * Call this from any page-level query handler when a Supabase error is
 * detected. If it's an auth error, shows a toast and redirects to /login
 * after a short delay (long enough for the toast to be visible, short
 * enough that the user doesn't sit on a broken page).
 *
 * Returns `true` if the error was handled as an auth error (caller should
 * stop further work), `false` otherwise.
 *
 * Idempotent: multiple concurrent failing queries (common — most pages
 * fan out 3+ queries) all call this, but only the first triggers the
 * toast + redirect.
 */
export function handleAuthError(err: PostgrestError | null | undefined): boolean {
  if (!isPostgrestAuthError(err)) return false
  if (redirectScheduled) return true
  redirectScheduled = true

  toast.error('Session expired. Redirecting to login…', { duration: 1500 })

  // 800ms is enough for the toast to register visually without leaving
  // the user on a broken page for long.
  setTimeout(() => {
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }, 800)

  return true
}
