import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that only admin or manager can access
const ADMIN_MANAGER_ROUTES = [
  '/dashboard/clients',
  '/dashboard/approvals',
  '/dashboard/reports',
  '/dashboard/team',
  '/dashboard/departments',
]

// Routes that only admin can access
const ADMIN_ONLY_ROUTES = [
  '/dashboard/settings',
]

function routeIsRestricted(pathname: string, routes: string[]): boolean {
  return routes.some(route => pathname === route || pathname.startsWith(route + '/'))
}

/**
 * Build a response that redirects to /login AND clears every Supabase auth
 * cookie. Used when getUser() returns an error indicating the refresh token
 * is invalid/expired/missing — letting the request through with broken auth
 * cookies is what causes the "shell loads, no data" symptom because every
 * downstream client query fails with 401.
 */
function redirectToLoginAndClearAuth(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  const response = NextResponse.redirect(url)
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')) {
      response.cookies.set({ name: cookie.name, value: '', maxAge: 0, path: '/' })
    }
  }
  return response
}

export async function middleware(request: NextRequest) {
  // ── Supabase SSR client setup ─────────────────────────────────────────────
  //
  // IMPORTANT: We hold a single mutable `response` reference. The `setAll`
  // callback MUST mutate this same object — not create a new one — because
  // the role-check profile query later in this function must run against the
  // same response that carries the freshly-written token cookies.
  //
  // Creating a new NextResponse.next() inside setAll (the previous pattern)
  // broke chunked-token propagation: the second Supabase query (profile fetch)
  // ran before the new response object was assigned, so it used the old stale
  // token, causing role lookups to fail silently for admin/manager routes after
  // a token refresh.
  //
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Write cookies into both the request (so subsequent server reads in
          // this middleware invocation see them) and the response (so the
          // browser receives the refreshed token).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Mutate the existing response rather than replacing it, so that any
          // cookies already set on it (e.g. from a previous setAll call for
          // chunked tokens) are preserved.
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() validates the access token with the auth server and refreshes
  // it (writing new cookies via setAll above) when expired.
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const isPublicPath = pathname.startsWith('/login') || pathname.startsWith('/auth')

  // ── Broken/expired session: redirect and clear cookies ───────────────────
  if (authError && !isPublicPath) {
    return redirectToLoginAndClearAuth(request)
  }

  // ── 1. Unauthenticated: redirect to login ─────────────────────────────────
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── 2. Authenticated on login page: redirect to dashboard ─────────────────
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // ── 3. Role-based route protection ────────────────────────────────────────
  if (user && pathname.startsWith('/dashboard')) {
    const isAdminManagerRoute = routeIsRestricted(pathname, ADMIN_MANAGER_ROUTES)
    const isAdminOnlyRoute = routeIsRestricted(pathname, ADMIN_ONLY_ROUTES)

    if (isAdminManagerRoute || isAdminOnlyRoute) {
      // This query now runs after getUser() has already refreshed the token
      // and written the new cookies into `request.cookies` (via setAll above),
      // so PostgREST sees the valid access token even on the first request
      // after a long idle period.
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profileError && !profile) {
        // Query failed (likely a transient error right after token refresh).
        // Pass through — the page-level guard will re-evaluate with a fully
        // resolved client. Do not redirect, as that would wrongly lock out
        // admins/managers whose token refresh just completed.
        return response
      }

      const role = profile?.role ?? 'employee'

      if (isAdminOnlyRoute && role !== 'admin') {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }

      if (isAdminManagerRoute && role !== 'admin' && role !== 'manager') {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
