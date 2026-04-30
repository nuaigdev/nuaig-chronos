-- ============================================
-- NuAIg Chronos — Migration 009
-- 1. Convert department_type enum → TEXT
--    so new departments can be created freely
--    (profiles.department, task_types.department,
--     departments.name)
-- 2. Update admin_create_user to accept TEXT dept
-- 3. Manager self-reference already exists on
--    profiles.manager_id — no change needed there.
-- ============================================


-- ============================================
-- 1. DROP dependent views before altering columns
-- ============================================

DROP VIEW IF EXISTS employee_weekly_hours;


-- ============================================
-- 2. ALTER profiles.department: enum → TEXT
-- ============================================

ALTER TABLE profiles
  ALTER COLUMN department TYPE TEXT
  USING department::TEXT;


-- ============================================
-- 3. ALTER task_types.department: enum → TEXT
-- ============================================

ALTER TABLE task_types
  ALTER COLUMN department TYPE TEXT
  USING department::TEXT;

-- Update the unique constraint (still valid with TEXT)
-- No action needed — UNIQUE(department, name) stays intact.

-- Update index
DROP INDEX IF EXISTS idx_task_types_department;
CREATE INDEX idx_task_types_department ON task_types(department);


-- ============================================
-- 4. ALTER departments.name: enum → TEXT
-- ============================================

ALTER TABLE departments
  ALTER COLUMN name TYPE TEXT
  USING name::TEXT;

-- The UNIQUE constraint on departments.name is preserved automatically.


-- ============================================
-- 5. RECREATE employee_weekly_hours view
--    (same definition, column is now TEXT)
-- ============================================

CREATE OR REPLACE VIEW employee_weekly_hours AS
SELECT
  pr.id          AS user_id,
  pr.full_name,
  pr.department,
  pr.role,
  COALESCE(SUM(tl.hours), 0)           AS hours_this_week,
  DATE_TRUNC('week', NOW())::DATE      AS week_start
FROM profiles pr
LEFT JOIN time_logs tl
  ON  tl.user_id  = pr.id
  AND tl.log_date >= DATE_TRUNC('week', NOW())::DATE
  AND tl.log_date <  DATE_TRUNC('week', NOW())::DATE + 7
WHERE pr.is_active = true
GROUP BY pr.id, pr.full_name, pr.department, pr.role;

GRANT SELECT ON employee_weekly_hours TO authenticated;


-- ============================================
-- 6. REPLACE admin_create_user
--    department param is now TEXT (not enum)
-- ============================================

CREATE OR REPLACE FUNCTION admin_create_user(
  user_email    TEXT,
  user_password TEXT,
  user_name     TEXT,
  user_role     user_role DEFAULT 'employee',
  user_dept     TEXT      DEFAULT NULL
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

GRANT EXECUTE ON FUNCTION admin_create_user(TEXT, TEXT, TEXT, user_role, TEXT) TO authenticated;


-- ============================================
-- 7. Drop old enum-typed function overload first
--    (it depends on department_type), then drop
--    the enum itself.
-- ============================================

DROP FUNCTION IF EXISTS admin_create_user(TEXT, TEXT, TEXT, user_role, department_type);

DROP TYPE IF EXISTS department_type;
