import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * POST /api/admin/change-password
 *
 * Two modes:
 *
 * 1. Admin changing ANOTHER user's password:
 *    Body: { target_user_id: string, new_password: string }
 *    Caller must be an admin.
 *
 * 2. Any user changing THEIR OWN password:
 *    Body: { new_password: string }          (no target_user_id)
 *    Uses the service client to update auth.users directly so the
 *    browser session doesn't get invalidated / spin forever waiting
 *    for the Supabase auth.updateUser response to round-trip.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server misconfiguration: missing service role key' },
        { status: 500 },
      )
    }

    const adminClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const body = await req.json()
    const { target_user_id, new_password } = body as {
      target_user_id?: string
      new_password: string
    }

    if (!new_password || new_password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 },
      )
    }

    // ── Mode 1: admin changing someone else's password ──────────────────────
    if (target_user_id && target_user_id !== user.id) {
      // Verify caller is admin
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('role, company_id')
        .eq('id', user.id)
        .single()

      if (!callerProfile || callerProfile.role !== 'admin') {
        return NextResponse.json(
          { error: 'Only admins can change other users\' passwords' },
          { status: 403 },
        )
      }

      // Verify target is in the same company
      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('role, company_id')
        .eq('id', target_user_id)
        .single()

      if (!targetProfile || targetProfile.company_id !== callerProfile.company_id) {
        return NextResponse.json(
          { error: 'Target user not found in your company' },
          { status: 404 },
        )
      }

      // Admins cannot change another admin's password
      if (targetProfile.role === 'admin') {
        return NextResponse.json(
          { error: 'Cannot change another admin\'s password' },
          { status: 403 },
        )
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        target_user_id,
        { password: new_password },
      )

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 })
      }

      return NextResponse.json({ success: true })
    }

    // ── Mode 2: user changing their own password ─────────────────────────────
    // Use admin API so we don't trigger a session refresh / infinite spin
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { password: new_password },
    )

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('change-password API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
