-- ============================================
-- Chronos — Migration 013
-- Multi-Company Support
--
-- ORDER MATTERS:
-- 1. Create companies table (simple policies only — no cross-table refs yet)
-- 2. Seed NuAIg
-- 3. Add company_id columns to ALL tables first
-- 4. Backfill existing records → NuAIg
-- 5. Enforce NOT NULL
-- 6. Add indexes
-- 7. Fix admin_settings unique constraint
-- 8. Add helper function get_user_company_id()
--    (profiles.company_id now exists — safe)
-- 9. Update handle_new_user trigger
-- 10. Add cross-table policy on companies table
--     (profiles.company_id now exists — safe)
-- 11. Replace all RLS policies (company-scoped)
-- 12. Update views
-- 13. Update helper functions
-- 14. Add auto-company_id triggers
-- ============================================


-- ============================================
-- 1. COMPANIES TABLE
--    Only a simple SELECT policy here.
--    The UPDATE policy references profiles.company_id
--    which doesn't exist yet — added in step 10.
-- ============================================

CREATE TABLE IF NOT EXISTS companies (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  logo_url     TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Simple open SELECT — a tighter policy is added in step 10
CREATE POLICY "Authenticated can view companies"
  ON companies FOR SELECT
  USING (auth.role() = 'authenticated');

-- NOTE: "Admin can update own company" policy is created in step 10
-- AFTER profiles.company_id column exists.

ALTER PUBLICATION supabase_realtime ADD TABLE companies;
GRANT SELECT ON companies TO authenticated;


-- ============================================
-- 2. SEED NuAIg AS THE FIRST COMPANY
-- ============================================

INSERT INTO companies (name, slug)
VALUES ('NuAIg', 'nuaig')
ON CONFLICT (slug) DO NOTHING;


-- ============================================
-- 3. ADD company_id TO ALL RELEVANT TABLES
-- ============================================

-- profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- departments
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- task_types
ALTER TABLE task_types
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- admin_settings
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- holidays
ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- timesheets (denormalised for fast RLS — derived from profiles.company_id)
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- time_logs (denormalised for fast RLS)
ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;


-- ============================================
-- 4. BACKFILL ALL EXISTING RECORDS → NuAIg
-- ============================================

DO $$
DECLARE
  nuaig_id UUID;
BEGIN
  SELECT id INTO nuaig_id FROM companies WHERE slug = 'nuaig';

  UPDATE profiles      SET company_id = nuaig_id WHERE company_id IS NULL;
  UPDATE clients       SET company_id = nuaig_id WHERE company_id IS NULL;
  UPDATE projects      SET company_id = nuaig_id WHERE company_id IS NULL;
  UPDATE departments   SET company_id = nuaig_id WHERE company_id IS NULL;
  UPDATE task_types    SET company_id = nuaig_id WHERE company_id IS NULL;
  UPDATE admin_settings SET company_id = nuaig_id WHERE company_id IS NULL;
  UPDATE holidays      SET company_id = nuaig_id WHERE company_id IS NULL;
  UPDATE timesheets    SET company_id = nuaig_id WHERE company_id IS NULL;
  UPDATE time_logs     SET company_id = nuaig_id WHERE company_id IS NULL;
END;
$$;


-- ============================================
-- 5. ENFORCE NOT NULL ON company_id COLUMNS
-- ============================================

ALTER TABLE profiles       ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE clients        ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE projects       ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE departments    ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE task_types     ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE admin_settings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE holidays       ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE timesheets     ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE time_logs      ALTER COLUMN company_id SET NOT NULL;


-- ============================================
-- 6. INDEXES ON company_id COLUMNS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_company_id      ON profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_id       ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_company_id      ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_departments_company_id   ON departments(company_id);
CREATE INDEX IF NOT EXISTS idx_task_types_company_id    ON task_types(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_settings_company_id ON admin_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_holidays_company_id      ON holidays(company_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_company_id    ON timesheets(company_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_company_id     ON time_logs(company_id);


-- ============================================
-- 7. FIX admin_settings UNIQUE CONSTRAINT
--    key was globally unique; now per-company
-- ============================================

ALTER TABLE admin_settings DROP CONSTRAINT IF EXISTS admin_settings_key_key;
ALTER TABLE admin_settings ADD CONSTRAINT admin_settings_company_key UNIQUE (company_id, key);


-- ============================================
-- 8. HELPER: get current user's company_id
-- ============================================

CREATE OR REPLACE FUNCTION get_user_company_id(user_id UUID)
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = user_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================
-- 9. UPDATE handle_new_user TRIGGER
--    Now reads company_id from user metadata
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Resolve company_id from metadata or fall back to NuAIg
  IF NEW.raw_user_meta_data->>'company_id' IS NOT NULL THEN
    v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  ELSE
    SELECT id INTO v_company_id FROM companies WHERE slug = 'nuaig' LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, company_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'employee'),
    v_company_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    full_name  = COALESCE(EXCLUDED.full_name, profiles.full_name),
    company_id = COALESCE(profiles.company_id, EXCLUDED.company_id),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================
-- 10. ADD CROSS-TABLE POLICY ON companies
--     profiles.company_id now exists — safe.
-- ============================================

CREATE POLICY "Admin can update own company"
  ON companies FOR UPDATE
  USING (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );


-- ============================================
-- 11. REPLACE ALL RLS POLICIES
--     All policies now scope to the calling
--     user's company_id automatically.
--     Admin sees ONLY their own company data.
-- ============================================

-- ── profiles ─────────────────────────────────

DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can update any profile" ON profiles;
DROP POLICY IF EXISTS "Allow profile creation" ON profiles;

CREATE POLICY "Company members can view profiles"
  ON profiles FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admin can update any profile in company"
  ON profiles FOR UPDATE
  USING (
    get_user_role(auth.uid()) = 'admin'
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Allow profile creation"
  ON profiles FOR INSERT
  WITH CHECK (
    auth.uid() IS NULL  -- trigger / service role
    OR get_user_role(auth.uid()) = 'admin'
  );


-- ── clients ──────────────────────────────────

DROP POLICY IF EXISTS "Authenticated can view clients" ON clients;
DROP POLICY IF EXISTS "Admin Manager can insert clients" ON clients;
DROP POLICY IF EXISTS "Admin Manager can update clients" ON clients;
DROP POLICY IF EXISTS "Admin Manager can delete clients" ON clients;

CREATE POLICY "Company members can view clients"
  ON clients FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin Manager can insert clients"
  ON clients FOR INSERT
  WITH CHECK (
    get_user_role(auth.uid()) IN ('admin', 'manager')
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin Manager can update clients"
  ON clients FOR UPDATE
  USING (
    get_user_role(auth.uid()) IN ('admin', 'manager')
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin Manager can delete clients"
  ON clients FOR DELETE
  USING (
    get_user_role(auth.uid()) IN ('admin', 'manager')
    AND company_id = get_user_company_id(auth.uid())
  );


-- ── projects ─────────────────────────────────

DROP POLICY IF EXISTS "All authenticated can view active projects" ON projects;
DROP POLICY IF EXISTS "Admin Manager can insert projects" ON projects;
DROP POLICY IF EXISTS "Admin Manager can update projects" ON projects;
DROP POLICY IF EXISTS "Admin Manager can delete projects" ON projects;

CREATE POLICY "Company members can view projects"
  ON projects FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin Manager can insert projects"
  ON projects FOR INSERT
  WITH CHECK (
    get_user_role(auth.uid()) IN ('admin', 'manager')
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin Manager can update projects"
  ON projects FOR UPDATE
  USING (
    get_user_role(auth.uid()) IN ('admin', 'manager')
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin Manager can delete projects"
  ON projects FOR DELETE
  USING (
    get_user_role(auth.uid()) IN ('admin', 'manager')
    AND company_id = get_user_company_id(auth.uid())
  );


-- ── project_members ───────────────────────────
-- Scoped via project's company_id (join)

DROP POLICY IF EXISTS "All can view project members" ON project_members;
DROP POLICY IF EXISTS "Admin and Manager can manage members" ON project_members;

CREATE POLICY "Company members can view project members"
  ON project_members FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_members.project_id
        AND projects.company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Admin Manager can manage project members"
  ON project_members FOR ALL
  USING (
    get_user_role(auth.uid()) IN ('admin', 'manager')
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_members.project_id
        AND projects.company_id = get_user_company_id(auth.uid())
    )
  );


-- ── tasks ────────────────────────────────────
-- Scoped via project's company_id (join)

DROP POLICY IF EXISTS "All authenticated can view tasks" ON tasks;
DROP POLICY IF EXISTS "Admin only manage legacy tasks" ON tasks;

CREATE POLICY "Company members can view tasks"
  ON tasks FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = tasks.project_id
        AND projects.company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Admin only manage legacy tasks"
  ON tasks FOR ALL
  USING (
    get_user_role(auth.uid()) = 'admin'
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = tasks.project_id
        AND projects.company_id = get_user_company_id(auth.uid())
    )
  );


-- ── timesheets ────────────────────────────────

DROP POLICY IF EXISTS "Users can view own timesheets" ON timesheets;
DROP POLICY IF EXISTS "Users can manage own draft timesheets" ON timesheets;
DROP POLICY IF EXISTS "Users can update own timesheets" ON timesheets;

CREATE POLICY "Company members can view timesheets"
  ON timesheets FOR SELECT
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      user_id = auth.uid()
      OR get_user_role(auth.uid()) IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can insert own timesheets"
  ON timesheets FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Users and managers can update timesheets"
  ON timesheets FOR UPDATE
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      user_id = auth.uid()
      OR get_user_role(auth.uid()) IN ('admin', 'manager')
    )
  );


-- ── time_logs ─────────────────────────────────

DROP POLICY IF EXISTS "Users can view own time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can manage own time logs" ON time_logs;
DROP POLICY IF EXISTS "Admin Manager can view all logs" ON time_logs;

CREATE POLICY "Company time logs visible to owner and managers"
  ON time_logs FOR SELECT
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      user_id = auth.uid()
      OR get_user_role(auth.uid()) IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can manage own time logs"
  ON time_logs FOR ALL
  USING (
    user_id = auth.uid()
    AND company_id = get_user_company_id(auth.uid())
  );


-- ── notifications ─────────────────────────────
-- Already user-scoped; no company_id column needed

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT WITH CHECK (true);


-- ── admin_settings ────────────────────────────

DROP POLICY IF EXISTS "All can read settings" ON admin_settings;
DROP POLICY IF EXISTS "Admin can manage settings" ON admin_settings;

CREATE POLICY "Company members can read settings"
  ON admin_settings FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin can manage company settings"
  ON admin_settings FOR ALL
  USING (
    get_user_role(auth.uid()) = 'admin'
    AND company_id = get_user_company_id(auth.uid())
  );


-- ── holidays ──────────────────────────────────

DROP POLICY IF EXISTS "All can view holidays" ON holidays;
DROP POLICY IF EXISTS "Admin can manage holidays" ON holidays;

CREATE POLICY "Company members can view holidays"
  ON holidays FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin can manage company holidays"
  ON holidays FOR ALL
  USING (
    get_user_role(auth.uid()) = 'admin'
    AND company_id = get_user_company_id(auth.uid())
  );


-- ── departments ───────────────────────────────

DROP POLICY IF EXISTS "All authenticated can view departments" ON departments;
DROP POLICY IF EXISTS "Admin can manage departments" ON departments;

CREATE POLICY "Company members can view departments"
  ON departments FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin can manage company departments"
  ON departments FOR ALL
  USING (
    get_user_role(auth.uid()) = 'admin'
    AND company_id = get_user_company_id(auth.uid())
  );


-- ── task_types ────────────────────────────────

DROP POLICY IF EXISTS "All authenticated can view task_types" ON task_types;
DROP POLICY IF EXISTS "Admin can manage task_types" ON task_types;

CREATE POLICY "Company members can view task_types"
  ON task_types FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin can manage company task_types"
  ON task_types FOR ALL
  USING (
    get_user_role(auth.uid()) = 'admin'
    AND company_id = get_user_company_id(auth.uid())
  );


-- ============================================
-- 11. UPDATE VIEWS TO INCLUDE company_id
-- ============================================

-- project_hours_summary
DROP VIEW IF EXISTS project_hours_summary;
CREATE OR REPLACE VIEW project_hours_summary AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  p.estimated_hours,
  p.status,
  p.company_id,
  c.name AS client_name,
  COALESCE(SUM(tl.hours), 0) AS logged_hours,
  CASE
    WHEN p.estimated_hours > 0
    THEN ROUND((COALESCE(SUM(tl.hours), 0) / p.estimated_hours) * 100, 1)
    ELSE 0
  END AS completion_pct,
  COUNT(DISTINCT tl.user_id) AS active_members
FROM projects p
LEFT JOIN clients c ON p.client_id = c.id
LEFT JOIN time_logs tl ON tl.project_id = p.id
GROUP BY p.id, p.name, p.estimated_hours, p.status, p.company_id, c.name;

GRANT SELECT ON project_hours_summary TO authenticated;


-- employee_weekly_hours
DROP VIEW IF EXISTS employee_weekly_hours;
CREATE OR REPLACE VIEW employee_weekly_hours AS
SELECT
  pr.id AS user_id,
  pr.full_name,
  pr.department,
  pr.role,
  pr.company_id,
  COALESCE(SUM(tl.hours), 0) AS hours_this_week,
  DATE_TRUNC('week', NOW())::DATE AS week_start
FROM profiles pr
LEFT JOIN time_logs tl ON tl.user_id = pr.id
  AND tl.log_date >= DATE_TRUNC('week', NOW())::DATE
  AND tl.log_date < DATE_TRUNC('week', NOW())::DATE + 7
WHERE pr.is_active = true
GROUP BY pr.id, pr.full_name, pr.department, pr.role, pr.company_id;

GRANT SELECT ON employee_weekly_hours TO authenticated;


-- user_timesheet_summary
DROP VIEW IF EXISTS user_timesheet_summary;
CREATE OR REPLACE VIEW user_timesheet_summary AS
SELECT
  pr.id AS user_id,
  pr.full_name,
  pr.company_id,
  COUNT(*) FILTER (WHERE ts.status = 'draft') AS draft_count,
  COUNT(*) FILTER (WHERE ts.status = 'submitted') AS submitted_count,
  COUNT(*) FILTER (WHERE ts.status = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE ts.status = 'rejected') AS rejected_count,
  COALESCE(SUM(ts.total_hours) FILTER (WHERE ts.status = 'approved'), 0) AS total_approved_hours
FROM profiles pr
LEFT JOIN timesheets ts ON ts.user_id = pr.id
WHERE pr.is_active = true
GROUP BY pr.id, pr.full_name, pr.company_id;

GRANT SELECT ON user_timesheet_summary TO authenticated;


-- ============================================
-- 12. UPDATE get_pending_timesheets_for_manager
--     to scope by company
-- ============================================

CREATE OR REPLACE FUNCTION get_pending_timesheets_for_manager(manager_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM timesheets ts
  JOIN profiles p ON p.id = ts.user_id
  WHERE ts.status = 'submitted'
    AND ts.company_id = get_user_company_id(manager_uuid)
    AND (p.manager_id = manager_uuid OR EXISTS (
      SELECT 1 FROM profiles WHERE id = manager_uuid AND role = 'admin'
    ));
$$ LANGUAGE SQL SECURITY DEFINER;


-- ============================================
-- 13. TRIGGER: auto-populate company_id
--     on timesheets and time_logs from the
--     user's profile (so app code doesn't need
--     to pass it manually)
-- ============================================

CREATE OR REPLACE FUNCTION auto_set_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := get_user_company_id(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_timesheets_auto_company ON timesheets;
CREATE TRIGGER trg_timesheets_auto_company
  BEFORE INSERT ON timesheets
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

DROP TRIGGER IF EXISTS trg_time_logs_auto_company ON time_logs;
CREATE TRIGGER trg_time_logs_auto_company
  BEFORE INSERT ON time_logs
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
