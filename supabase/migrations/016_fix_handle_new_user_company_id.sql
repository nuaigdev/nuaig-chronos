-- ============================================
-- NuAIg Chronos — Migration 016
-- Fix: handle_new_user trigger loses company_id
--
-- Root cause:
--   Migration 013 correctly added company_id to
--   the handle_new_user INSERT (reading it from
--   raw_user_meta_data, falling back to 'nuaig').
--
--   Migration 014 rewrote handle_new_user to fix
--   manager_id resolution, but accidentally dropped
--   company_id from the INSERT column list and from
--   the ON CONFLICT DO UPDATE block.
--
--   Result: when the admin calls
--   auth.admin.createUser() (which passes company_id
--   in user_metadata), the trigger fires first and
--   inserts a profile row with company_id = NULL.
--   This violates the NOT NULL constraint added in
--   migration 013, aborts the transaction, and the
--   subsequent upsert from the API route never runs
--   (SQLSTATE 25P02 → 23502).
--
-- Fix:
--   Restore the full handle_new_user function that
--   combines BOTH fixes:
--     • company_id  — from metadata, fallback to
--                     'nuaig' slug (migration 013)
--     • manager_id  — resolved from department for
--                     employees (migration 014)
--     • ON CONFLICT  DO UPDATE preserves existing
--                     company_id (never nulls it)
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id    UUID;
  v_manager_id    UUID;
  meta_role       TEXT;
  meta_dept       TEXT;
BEGIN
  -- ── 1. Resolve company_id ─────────────────────
  -- Prefer whatever the caller passed in metadata
  -- (the create-user API always sets this).
  -- Fall back to the NuAIg seed company so that
  -- direct Supabase dashboard invites still work.
  IF NEW.raw_user_meta_data->>'company_id' IS NOT NULL THEN
    v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  ELSE
    SELECT id INTO v_company_id
    FROM companies
    WHERE slug = 'nuaig'
    LIMIT 1;
  END IF;

  -- ── 2. Resolve manager_id ─────────────────────
  -- Only employees get their manager auto-assigned
  -- from the department. Managers/admins keep NULL
  -- here and have it set explicitly by the API route
  -- upsert that follows.
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
  meta_dept := NEW.raw_user_meta_data->>'department';

  v_manager_id := NULL;
  IF meta_role = 'employee' AND meta_dept IS NOT NULL THEN
    SELECT manager_id INTO v_manager_id
    FROM departments
    WHERE name = meta_dept
    LIMIT 1;
  END IF;

  -- ── 3. Insert profile row ─────────────────────
  -- ON CONFLICT handles the case where the API
  -- route's upsert races with the trigger, or when
  -- migrations are re-run.
  -- We never overwrite an already-set company_id
  -- (COALESCE keeps the existing value if present).
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    company_id,
    manager_id
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(meta_role::user_role, 'employee'),
    v_company_id,
    v_manager_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    full_name  = COALESCE(EXCLUDED.full_name,  profiles.full_name),
    company_id = COALESCE(profiles.company_id, EXCLUDED.company_id),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
