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

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // ── 1. Unauthenticated: redirect to login ──────────────────────────────────
  if (!user && !pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
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
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

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
