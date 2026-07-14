-- ============================================
-- Chronos — Migration 019
-- Work Board: work_items + work_item_assignees
--
-- Run AFTER 018 (which adds the notification_type
-- enum values this feature emits).
--
-- DESIGN NOTES
-- ------------
-- * This is a NEW feature, deliberately separate from
--   the legacy `tasks` table (admin-only RLS, single
--   assignee, still referenced by time_logs.task_id).
--   `tasks` is left untouched.
-- * There is intentionally NO department column here.
--   Projects can span departments, so a work item has
--   no single department. The "team board" is derived
--   at query time from the departments of the item's
--   ASSIGNEES (profiles.department).
--   Consequence: an item with zero assignees appears on
--   no team board. The UI surfaces an "Unassigned" count
--   so these don't get lost.
-- * Managers get company-wide write access, matching the
--   existing precedent set by the projects/clients
--   policies in migration 013 (which are company-scoped,
--   not department-scoped).
-- ============================================


-- ============================================
-- 1. ENUMS
-- ============================================

DO $$ BEGIN
  CREATE TYPE work_item_status AS ENUM ('not_started', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE work_item_priority AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================
-- 2. TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS work_items (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description  TEXT,
  status       work_item_status   NOT NULL DEFAULT 'not_started',
  priority     work_item_priority NOT NULL DEFAULT 'medium',

  -- Every work item belongs to a project. The client is
  -- reached through projects.client_id — no duplicate column.
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  due_date     DATE,

  -- Sort key within a lane. Float so an item can always be
  -- dropped between two others without renumbering the rest.
  position     DOUBLE PRECISION NOT NULL DEFAULT 0,

  completed_at TIMESTAMPTZ,

  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  created_by   UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Multiple users per work item.
CREATE TABLE IF NOT EXISTS work_item_assignees (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (work_item_id, user_id)
);


-- ============================================
-- 3. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_work_items_company_id  ON work_items(company_id);
CREATE INDEX IF NOT EXISTS idx_work_items_project_id  ON work_items(project_id);
CREATE INDEX IF NOT EXISTS idx_work_items_status      ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_due_date    ON work_items(due_date);
CREATE INDEX IF NOT EXISTS idx_work_items_created_by  ON work_items(created_by);

-- The team board walks assignees → work items, so user_id
-- is the hot lookup path.
CREATE INDEX IF NOT EXISTS idx_work_item_assignees_user_id      ON work_item_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_work_item_assignees_work_item_id ON work_item_assignees(work_item_id);


-- ============================================
-- 4. TRIGGERS
-- ============================================

-- updated_at (function already exists from 001)
DROP TRIGGER IF EXISTS update_work_items_updated_at ON work_items;
CREATE TRIGGER update_work_items_updated_at
  BEFORE UPDATE ON work_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- company_id auto-fill.
-- The existing auto_set_company_id() reads NEW.user_id, which
-- work_items does not have — it has created_by. Hence a variant.
CREATE OR REPLACE FUNCTION auto_set_company_id_from_creator()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := get_user_company_id(NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_work_items_auto_company ON work_items;
CREATE TRIGGER trg_work_items_auto_company
  BEFORE INSERT ON work_items
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id_from_creator();


-- completed_at follows status, in both directions, so an item
-- dragged back out of Done doesn't keep a stale completion date.
CREATE OR REPLACE FUNCTION sync_work_item_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := NOW();
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_items_completed_at ON work_items;
CREATE TRIGGER trg_work_items_completed_at
  BEFORE INSERT OR UPDATE OF status ON work_items
  FOR EACH ROW EXECUTE FUNCTION sync_work_item_completed_at();


-- ============================================
-- 5. RLS HELPER FUNCTIONS
--    SECURITY DEFINER so policies can read the
--    referenced tables without recursing into
--    their own RLS.
-- ============================================

CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id    = p_user_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


CREATE OR REPLACE FUNCTION is_work_item_assignee(p_work_item_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM work_item_assignees
    WHERE work_item_id = p_work_item_id
      AND user_id      = p_user_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


CREATE OR REPLACE FUNCTION get_work_item_creator(p_work_item_id UUID)
RETURNS UUID AS $$
  SELECT created_by FROM work_items WHERE id = p_work_item_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


CREATE OR REPLACE FUNCTION get_work_item_company(p_work_item_id UUID)
RETURNS UUID AS $$
  SELECT company_id FROM work_items WHERE id = p_work_item_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- Admin toggle: may employees create work items at all?
-- Defaults to TRUE when the setting row is absent.
CREATE OR REPLACE FUNCTION board_employee_can_create(p_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT (value->>'value')::BOOLEAN
       FROM admin_settings
      WHERE key = 'board_employee_can_create'
        AND company_id = p_company_id),
    TRUE
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================
-- 6. RLS — work_items
-- ============================================

ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view work items"   ON work_items;
DROP POLICY IF EXISTS "Company members can create work items" ON work_items;
DROP POLICY IF EXISTS "Editors can update work items"         ON work_items;
DROP POLICY IF EXISTS "Managers and creators can delete work items" ON work_items;

-- Read: anyone in the company. The board is filtered by
-- department/project in the UI; hiding rows at the DB level
-- would only make the project view inconsistent.
CREATE POLICY "Company members can view work items"
  ON work_items FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
  );

-- Create: admins and managers anywhere in the company.
-- Employees only inside projects they belong to, and only
-- while the admin toggle allows it.
CREATE POLICY "Company members can create work items"
  ON work_items FOR INSERT
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND created_by = auth.uid()
    AND (
      get_user_role(auth.uid()) IN ('admin', 'manager')
      OR (
        board_employee_can_create(company_id)
        AND is_project_member(project_id, auth.uid())
      )
    )
  );

-- Update: admins/managers, the creator, or anyone assigned to
-- it. Assignees need this to drag their own cards between lanes,
-- which is the core interaction of the board.
CREATE POLICY "Editors can update work items"
  ON work_items FOR UPDATE
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      get_user_role(auth.uid()) IN ('admin', 'manager')
      OR created_by = auth.uid()
      OR is_work_item_assignee(id, auth.uid())
    )
  )
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Managers and creators can delete work items"
  ON work_items FOR DELETE
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      get_user_role(auth.uid()) IN ('admin', 'manager')
      OR created_by = auth.uid()
    )
  );


-- ============================================
-- 7. RLS — work_item_assignees
-- ============================================

ALTER TABLE work_item_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view assignees"    ON work_item_assignees;
DROP POLICY IF EXISTS "Managers and creators manage assignees" ON work_item_assignees;
DROP POLICY IF EXISTS "Users can remove themselves"            ON work_item_assignees;

CREATE POLICY "Company members can view assignees"
  ON work_item_assignees FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND get_work_item_company(work_item_id) = get_user_company_id(auth.uid())
  );

-- Who the work goes to is a management decision: admins,
-- managers, and the person who raised the item.
CREATE POLICY "Managers and creators manage assignees"
  ON work_item_assignees FOR ALL
  USING (
    get_work_item_company(work_item_id) = get_user_company_id(auth.uid())
    AND (
      get_user_role(auth.uid()) IN ('admin', 'manager')
      OR get_work_item_creator(work_item_id) = auth.uid()
    )
  )
  WITH CHECK (
    get_work_item_company(work_item_id) = get_user_company_id(auth.uid())
    AND (
      get_user_role(auth.uid()) IN ('admin', 'manager')
      OR get_work_item_creator(work_item_id) = auth.uid()
    )
  );

-- An employee can always drop themselves off an item.
CREATE POLICY "Users can remove themselves"
  ON work_item_assignees FOR DELETE
  USING (user_id = auth.uid());


-- ============================================
-- 8. GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON work_items          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON work_item_assignees TO authenticated;


-- ============================================
-- 9. REALTIME
--    So a card dragged on one screen moves on
--    everyone else's.
-- ============================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE work_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE work_item_assignees;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================
-- 10. SEED BOARD SETTINGS (per company)
--     Value shape { "value": <primitive> } matches
--     the existing working_hours_per_day setting.
-- ============================================

INSERT INTO admin_settings (key, value, company_id)
SELECT 'board_employee_can_create', '{"value": true}'::JSONB, id FROM companies
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO admin_settings (key, value, company_id)
SELECT 'board_show_priority', '{"value": true}'::JSONB, id FROM companies
ON CONFLICT (company_id, key) DO NOTHING;

-- Done items older than this drop off the board so the Done
-- lane doesn't become a graveyard. 0 = never archive.
INSERT INTO admin_settings (key, value, company_id)
SELECT 'board_archive_done_days', '{"value": 30}'::JSONB, id FROM companies
ON CONFLICT (company_id, key) DO NOTHING;
