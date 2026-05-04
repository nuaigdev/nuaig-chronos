-- ============================================
-- NuAIg Chronos — Migration 014
-- Fix 1: handle_new_user trigger now sets
--         manager_id from the employee's
--         department at row-creation time.
--         Previously this only happened when
--         departments.manager_id was edited
--         AFTER the employee was added.
--
-- Fix 2: Add a SECURITY DEFINER function that
--         the Next.js API route can call with
--         the service-role key to update any
--         user's password via auth.users.
--         This replaces the broken RPC approach
--         (which runs as the caller's JWT and
--         can't bypass RLS on auth.users).
-- ============================================


-- ============================================
-- 1. FIX handle_new_user TRIGGER
--    When a new profile row is inserted (via
--    auth trigger or the create-user API), look
--    up the matching department's manager_id and
--    write it onto the profile immediately.
--    Only applies to employees — managers and
--    admins set their own manager_id explicitly.
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  dept_manager_id UUID;
  meta_role       TEXT;
  meta_dept       TEXT;
BEGIN
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
  meta_dept := NEW.raw_user_meta_data->>'department';

  -- Resolve manager_id from the department if the new user is an employee
  dept_manager_id := NULL;
  IF meta_role = 'employee' AND meta_dept IS NOT NULL THEN
    SELECT manager_id INTO dept_manager_id
    FROM departments
    WHERE name = meta_dept
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, manager_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(meta_role::user_role, 'employee'),
    dept_manager_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    full_name  = COALESCE(EXCLUDED.full_name, profiles.full_name),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================
-- 2. ADD api_change_user_password FUNCTION
--    Called by the Next.js API route using the
--    service-role key (bypasses RLS completely).
--    The API route already validates that the
--    caller is an admin before invoking this.
--    We still add a hard safety check here.
-- ============================================

CREATE OR REPLACE FUNCTION api_change_user_password(
  target_user_id UUID,
  new_password    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_exists BOOLEAN;
BEGIN
  IF new_password IS NULL OR length(new_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters');
  END IF;

  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = target_user_id)
  INTO target_exists;

  IF NOT target_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = crypt(new_password, gen_salt('bf')),
    updated_at         = NOW()
  WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant to service_role only — this is called exclusively from the API route
-- with the service-role key, never from a browser session.
REVOKE ALL ON FUNCTION api_change_user_password(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION api_change_user_password(UUID, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION api_change_user_password(UUID, TEXT) TO service_role;


-- ============================================
-- 3. BACKFILL: set manager_id on existing
--    employee profiles that are missing it but
--    whose department already has a manager.
-- ============================================

UPDATE profiles p
SET
  manager_id = d.manager_id,
  updated_at = NOW()
FROM departments d
WHERE
  p.department  = d.name
  AND p.role    = 'employee'
  AND p.manager_id IS NULL
  AND d.manager_id IS NOT NULL;
