-- ============================================
-- Chronos — Migration 022
-- Work Item comments + shared visibility helper
--
-- Run AFTER 021 (the notification enum value).
--
-- Two things happen here, and they are linked:
--
-- 1. The employee-visibility predicate that migration
--    020 wrote inline into the work_items SELECT policy
--    is extracted into can_view_work_item(). The policy
--    is repointed at it.
--
-- 2. Comments are added, and their SELECT policy calls
--    the SAME function. This is the whole point of the
--    extraction: if comments got their own copy of the
--    rule, the two would drift the first time the access
--    rules change, and an employee could read the
--    discussion on an item they cannot see — silently
--    undoing the department restriction from 020.
-- ============================================


-- ============================================
-- 1. can_view_work_item() — the single source of truth
--
--    SECURITY DEFINER so it can read work_items /
--    work_item_assignees / profiles without tripping
--    their RLS (which would recurse: it is itself called
--    FROM the work_items SELECT policy).
--
--    This is exactly the predicate migration 020 had
--    inline, verbatim — company scoping stays in the
--    policies that call it.
-- ============================================

-- Small helper first: a SQL-language function validates its body at creation
-- time, so anything can_view_work_item calls must already exist. This one is
-- also reused by the assignee policy in migration 023.
CREATE OR REPLACE FUNCTION get_work_item_project(p_work_item_id UUID)
RETURNS UUID AS $$
  SELECT project_id FROM work_items WHERE id = p_work_item_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


CREATE OR REPLACE FUNCTION can_view_work_item(p_work_item_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    -- Admins and managers are unrestricted.
    get_user_role(p_user_id) IN ('admin', 'manager')

    -- The viewer's own department is on the item.
    OR work_item_has_assignee_in_department(p_work_item_id, get_user_department(p_user_id))

    -- Project scope: a member of the item's project sees it,
    -- cross-department co-workers included.
    OR is_project_member(get_work_item_project(p_work_item_id), p_user_id)

    -- Never lose sight of something you raised yourself.
    OR get_work_item_creator(p_work_item_id) = p_user_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- Repoint the work_items SELECT policy at the extracted function.
-- Behaviour is identical to migration 020; only the location of the rule
-- changes, so comments can share it.
DROP POLICY IF EXISTS "Company members can view work items" ON work_items;

CREATE POLICY "Company members can view work items"
  ON work_items FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
    AND can_view_work_item(id, auth.uid())
  );


-- ============================================
-- 2. work_item_comments
-- ============================================

CREATE TABLE IF NOT EXISTS work_item_comments (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  work_item_id  UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (length(trim(body)) > 0),
  edited_at     TIMESTAMPTZ,           -- NULL until edited; drives an "edited" tag
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_item_comments_work_item_id ON work_item_comments(work_item_id);
CREATE INDEX IF NOT EXISTS idx_work_item_comments_company_id   ON work_item_comments(company_id);


-- updated_at (function exists from 001)
DROP TRIGGER IF EXISTS update_work_item_comments_updated_at ON work_item_comments;
CREATE TRIGGER update_work_item_comments_updated_at
  BEFORE UPDATE ON work_item_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- company_id auto-fill. Unlike work_items, this table HAS user_id, so it can
-- reuse the original auto_set_company_id() (which reads NEW.user_id) rather
-- than the created_by variant.
DROP TRIGGER IF EXISTS trg_work_item_comments_auto_company ON work_item_comments;
CREATE TRIGGER trg_work_item_comments_auto_company
  BEFORE INSERT ON work_item_comments
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();


-- Stamp edited_at whenever the body actually changes.
CREATE OR REPLACE FUNCTION set_comment_edited_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.edited_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_item_comments_edited_at ON work_item_comments;
CREATE TRIGGER trg_work_item_comments_edited_at
  BEFORE UPDATE OF body ON work_item_comments
  FOR EACH ROW EXECUTE FUNCTION set_comment_edited_at();


-- ============================================
-- 3. RLS — comments follow the item's visibility
-- ============================================

ALTER TABLE work_item_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View comments on visible work items"   ON work_item_comments;
DROP POLICY IF EXISTS "Comment on visible work items"         ON work_item_comments;
DROP POLICY IF EXISTS "Authors can edit own comments"         ON work_item_comments;
DROP POLICY IF EXISTS "Authors and moderators delete comments" ON work_item_comments;

-- Read: anyone who can see the underlying work item.
CREATE POLICY "View comments on visible work items"
  ON work_item_comments FOR SELECT
  USING (
    company_id = get_user_company_id(auth.uid())
    AND can_view_work_item(work_item_id, auth.uid())
  );

-- Write: same, and you can only speak as yourself.
CREATE POLICY "Comment on visible work items"
  ON work_item_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = get_user_company_id(auth.uid())
    AND can_view_work_item(work_item_id, auth.uid())
  );

-- Edit: author only.
CREATE POLICY "Authors can edit own comments"
  ON work_item_comments FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Delete: author, or an admin/manager moderating.
CREATE POLICY "Authors and moderators delete comments"
  ON work_item_comments FOR DELETE
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      user_id = auth.uid()
      OR get_user_role(auth.uid()) IN ('admin', 'manager')
    )
  );


-- ============================================
-- 4. GRANTS + REALTIME
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON work_item_comments TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE work_item_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
