import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that only admin or manager can access
const ADMIN_MANAGER_ROUTES = [
  '/dashboard/clients',
  '/dashboard/approvals',
  '/dashboard/reports',
  '/dashboard/team',
]

// Routes that only admin can access
const ADMIN_ONLY_ROUTES = [
  '/dashboard/settings',
  '/dashboard/departments',
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
  // Supabase chunked cookie names: sb-<ref>-auth-token, sb-<ref>-auth-token.0,
  // sb-<ref>-auth-token.1, etc. Clear every cookie that looks like one of ours.
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')) {
      response.cookies.set({ name: cookie.name, value: '', maxAge: 0, path: '/' })
    }
  }
  return response
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() validates the access token with the auth server and refreshes
  // it (writing new cookies via setAll above) when expired. We must
  // distinguish three outcomes:
  //   1. user present, no error  → authenticated, proceed
  //   2. no user, no error       → genuinely anonymous, redirect to /login
  //   3. error returned          → token validation failed (most often a
  //      stale/invalid refresh token after an extended close). Treat as
  //      unauthenticated AND clear cookies so the client doesn't keep
  //      trying with broken state.
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const isPublicPath = pathname.startsWith('/login') || pathname.startsWith('/auth')

  if (authError && !isPublicPath) {
    return redirectToLoginAndClearAuth(request)
  }

  // ── 1. Unauthenticated: redirect to login ──────────────────────────────────
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
  //    We only check restricted routes to keep the hot path fast.
  if (user && pathname.startsWith('/dashboard')) {
    const isAdminManagerRoute = routeIsRestricted(pathname, ADMIN_MANAGER_ROUTES)
    const isAdminOnlyRoute = routeIsRestricted(pathname, ADMIN_ONLY_ROUTES)

    if (isAdminManagerRoute || isAdminOnlyRoute) {
      // Fetch the profile to get the role.
      // This is a server-side fetch using the anon key + user session,
      // so RLS "Users can view all profiles" policy covers it.
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      // If the role query itself failed with an auth error, the just-completed
      // refresh hasn't propagated to this query's context yet. Letting it
      // through and defaulting role to 'employee' would wrongly redirect
      // admins/managers off their own pages. Safer to let the request proceed
      // and have the page-level guards re-check from a freshly-resolved client.
      if (profileError && !profile) {
        return supabaseResponse
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

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
