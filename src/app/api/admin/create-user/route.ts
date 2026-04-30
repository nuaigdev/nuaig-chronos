import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    // 1. Verify the caller is an authenticated admin using the session cookie
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create users' }, { status: 403 })
    }

    // 2. Parse request body
    const body = await req.json()
    const { user_email, user_password, user_name, user_role, user_dept, manager_id } = body

    if (!user_email || !user_email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (!user_password || user_password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }
    if (!user_name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // 3. Use service role client to call auth.admin.createUser
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfiguration: missing service role key' }, { status: 500 })
    }

    const adminClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: user_email.trim().toLowerCase(),
      password: user_password,
      email_confirm: true,
      user_metadata: { full_name: user_name.trim(), role: user_role ?? 'employee' },
    })

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    if (!newUser?.user) {
      return NextResponse.json({ error: 'User creation failed' }, { status: 500 })
    }

    // 4. Upsert profile row with all fields
    //    (the handle_new_user trigger fires and creates a basic row;
    //     we upsert to add department, manager_id etc.)
    const profilePayload: Record<string, unknown> = {
      id: newUser.user.id,
      email: user_email.trim().toLowerCase(),
      full_name: user_name.trim(),
      role: user_role ?? 'employee',
      department: user_dept ?? null,
      manager_id: (user_role === 'manager' && manager_id) ? manager_id : null,
    }

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })

    if (profileError) {
      // User was created in auth but profile failed — still return success with warning
      console.error('Profile upsert error:', profileError)
      return NextResponse.json({
        success: true,
        user_id: newUser.user.id,
        warning: 'User created but profile update failed: ' + profileError.message,
      })
    }

    return NextResponse.json({ success: true, user_id: newUser.user.id })
  } catch (err) {
    console.error('create-user API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
