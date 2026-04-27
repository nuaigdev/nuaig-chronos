-- ============================================
-- NuAIg Chronos — Migration 004
-- Fix: handle_new_user trigger + RLS policies
-- causing HTTP 500 on login
-- ============================================

-- ============================================
-- 1. FIX handle_new_user TRIGGER
--
-- Problem: The original function had no ON CONFLICT
-- handling. When auth.users already has rows (from
-- direct seed inserts) and a login triggers any
-- internal re-evaluation, or if the function is
-- called twice, it throws a unique-violation and
-- Supabase Auth returns a 500.
--
-- Fix: Use INSERT ... ON CONFLICT DO UPDATE so it
-- is fully idempotent.
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'employee')
  )
  ON CONFLICT (id) DO UPDATE SET
    email     = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================
-- 2. FIX PROFILES RLS — allow the trigger to
--    insert without needing an authenticated
--    admin session.
--
-- Problem: "Admin can insert profiles" policy
-- calls get_user_role(auth.uid()), but during
-- the auth trigger auth.uid() is NULL (the user
-- doesn't have a session yet). So even though the
-- function is SECURITY DEFINER, the WITH CHECK
-- on the INSERT policy was blocking it in some
-- Supabase versions.
--
-- Fix: Drop the overly-restrictive INSERT policy
-- and replace it with one that allows the service
-- role / trigger path through, while keeping admin
-- UI inserts working too.
-- ============================================

-- Drop old insert policy
DROP POLICY IF EXISTS "Admin can insert profiles" ON profiles;

-- New policy: allow insert when called by the
-- trigger (auth.uid() IS NULL = service/trigger
-- context) OR by an authenticated admin.
CREATE POLICY "Allow profile creation"
  ON profiles FOR INSERT
  WITH CHECK (
    auth.uid() IS NULL  -- called from trigger / service role
    OR get_user_role(auth.uid()) = 'admin'
  );


-- ============================================
-- 3. BACKFILL: ensure every auth.users row has
--    a matching profile (safe to run any time).
-- ============================================

INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  COALESCE((u.raw_user_meta_data->>'role')::user_role, 'employee')
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);


-- ============================================
-- 4. FIX admin_settings seed — make it
--    idempotent so re-running migrations doesn't
--    break anything.
-- ============================================

INSERT INTO admin_settings (key, value) VALUES
  ('working_hours_per_day',  '{"value": 8}'),
  ('timesheet_reminder_day', '{"value": "friday", "time": "17:00"}'),
  ('approval_reminder_hours','{"value": 48}')
ON CONFLICT (key) DO NOTHING;
