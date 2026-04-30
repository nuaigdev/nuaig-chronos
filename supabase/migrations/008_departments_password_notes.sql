-- ============================================
-- NuAIg Chronos — Migration 008 (FIXED)
-- 1. Proper departments table (manager, members)
-- 2. One department per employee enforced
-- 3. Description (notes) required on time_logs
--    FIXED: backfill nulls BEFORE adding NOT NULL
-- 4. Admin password-reset helper function
-- ============================================


-- ============================================
-- 1. DEPARTMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS departments (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name          department_type NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  description   TEXT,
  manager_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view departments"
  ON departments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage departments"
  ON departments FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

ALTER PUBLICATION supabase_realtime ADD TABLE departments;

INSERT INTO departments (name, display_name, description) VALUES
  ('COE',       'Centre of Excellence', 'Engineering, R&D and research'),
  ('Project',   'Project',              'Client-facing project delivery'),
  ('HR',        'Human Resources',      'People operations and talent'),
  ('Marketing', 'Marketing',            'Brand, content and growth'),
  ('BA',        'Business Analysts',    'Requirements, PM and client liaison'),
  ('Data',      'Data',                 'Analytics, ML and data engineering')
ON CONFLICT (name) DO NOTHING;

GRANT SELECT ON departments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON departments TO authenticated;


-- ============================================
-- 2. NOTES (description) REQUIRED on time_logs
--
--    CRITICAL ORDER:
--    Step A — backfill NULLs first
--    Step B — only then add NOT NULL + CHECK
-- ============================================

-- Step A: fill any existing null/empty descriptions
UPDATE time_logs
  SET description = 'No notes provided'
  WHERE description IS NULL OR trim(description) = '';

-- Step B: now safe to enforce NOT NULL
ALTER TABLE time_logs
  ALTER COLUMN description SET NOT NULL;

ALTER TABLE time_logs
  DROP CONSTRAINT IF EXISTS time_log_description_nonempty;

ALTER TABLE time_logs
  ADD CONSTRAINT time_log_description_nonempty
    CHECK (length(trim(description)) > 0);


-- ============================================
-- 3. ADMIN PASSWORD-RESET HELPER
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION admin_reset_user_password(
  target_user_id UUID,
  new_password    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role user_role;
  target_role user_role;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  IF caller_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only admins can reset passwords');
  END IF;

  SELECT role INTO target_role FROM profiles WHERE id = target_user_id;

  IF target_role = 'admin' AND target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot reset another admin''s password');
  END IF;

  IF new_password IS NULL OR length(new_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters');
  END IF;

  UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = NOW()
    WHERE id = target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found in auth.users');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_user_password(UUID, TEXT) TO authenticated;


-- ============================================
-- 4. ADMIN CREATE USER HELPER
-- ============================================

CREATE OR REPLACE FUNCTION admin_create_user(
  user_email    TEXT,
  user_password TEXT,
  user_name     TEXT,
  user_role     user_role DEFAULT 'employee',
  user_dept     department_type DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role user_role;
  new_user_id UUID;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  IF caller_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only admins can create users');
  END IF;

  IF user_password IS NULL OR length(user_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters');
  END IF;

  IF user_email IS NULL OR user_email NOT LIKE '%@%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email address');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(user_email)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A user with this email already exists');
  END IF;

  new_user_id := uuid_generate_v4();

  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    lower(user_email),
    crypt(user_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('full_name', user_name, 'role', user_role::text),
    NOW(), NOW(),
    '', '', '', ''
  );

  INSERT INTO profiles (id, email, full_name, role, department)
    VALUES (new_user_id, lower(user_email), user_name, user_role, user_dept)
  ON CONFLICT (id) DO UPDATE SET
    role       = EXCLUDED.role,
    department = EXCLUDED.department,
    full_name  = EXCLUDED.full_name;

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_user(TEXT, TEXT, TEXT, user_role, department_type) TO authenticated;
