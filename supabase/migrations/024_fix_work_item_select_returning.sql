-- ============================================
-- Chronos — Migration 024
-- Fix: employees can't create work items (403)
--
-- Run AFTER 022 (which introduced the regression).
--
-- THE BUG
-- -------
-- Migration 022 repointed the work_items SELECT policy at
-- can_view_work_item(work_item_id, user_id), which re-fetches
-- the row *by id* inside SECURITY DEFINER functions
-- (get_work_item_project, get_work_item_creator).
--
-- The app creates an item with `INSERT ... RETURNING id`
-- (PostgREST `?select=id`). RETURNING re-checks the SELECT
-- policy against the new row — but a sub-select on work_items
-- from within the same command does NOT see the just-inserted,
-- uncommitted row. So get_work_item_project()/creator() return
-- NULL, every branch fails, and the row is hidden → 403.
--
-- Admins/managers were unaffected: their branch short-circuits
-- before the blind sub-selects run.
--
-- Migration 020's policy referenced the row's COLUMNS directly
-- (project_id, created_by), which ARE visible during RETURNING.
-- That is why creation worked before 022.
--
-- THE FIX
-- -------
-- Split the rule from the lookup:
--   * core can_view_work_item(project_id, created_by, work_item_id, user_id)
--     — the actual predicate, fed values directly.
--   * wrapper can_view_work_item_by_id(work_item_id, user_id)
--     — fetches the columns then calls the core, for callers that
--       only have an id AND whose row is already committed (comments).
--
-- The work_items SELECT policy calls the CORE with the row's own
-- columns (RETURNING-safe). Comments call the WRAPPER. One rule,
-- two entry points — no drift, and no self-referential re-fetch
-- on the work_items policy.
-- ============================================


-- ============================================
-- 1. Core predicate — values passed in directly
-- ============================================

CREATE OR REPLACE FUNCTION can_view_work_item(
  p_project_id   UUID,
  p_created_by   UUID,
  p_work_item_id UUID,
  p_user_id      UUID
)
RETURNS BOOLEAN AS $$
  SELECT
    -- Admins and managers are unrestricted.
    get_user_role(p_user_id) IN ('admin', 'manager')

    -- Project scope: a member of the item's project sees it.
    OR is_project_member(p_project_id, p_user_id)

    -- You always see what you raised.
    OR p_created_by = p_user_id

    -- The viewer's own department is on the item. (Queries
    -- work_item_assignees — a different table — so it is safe to
    -- reference by id even during the work_items RETURNING check;
    -- it simply returns false there, as a new item has no
    -- assignees yet, and the branches above cover creation.)
    OR work_item_has_assignee_in_department(p_work_item_id, get_user_department(p_user_id));
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================
-- 2. Wrapper — fetch columns, then call the core
--    For callers with only an id, on a COMMITTED row
--    (i.e. comment policies). Never used by the
--    work_items policy, so no self-referential fetch.
-- ============================================

CREATE OR REPLACE FUNCTION can_view_work_item_by_id(p_work_item_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT can_view_work_item(project_id, created_by, id, p_user_id)
  FROM work_items
  WHERE id = p_work_item_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================
-- 3. Repoint work_items SELECT at the core, using the
--    row's own columns — visible during RETURNING.
-- ============================================

DROP POLICY IF EXISTS "Company members can view work items" ON work_items;

CREATE POLICY "Company members can view work items"
  ON work_items FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
    AND can_view_work_item(project_id, created_by, id, auth.uid())
  );


-- ============================================
-- 4. Repoint the comment policies at the wrapper.
--    (Comments always reference an existing, committed
--    work item, so the fetch is safe there.)
-- ============================================

DROP POLICY IF EXISTS "View comments on visible work items" ON work_item_comments;
CREATE POLICY "View comments on visible work items"
  ON work_item_comments FOR SELECT
  USING (
    company_id = get_user_company_id(auth.uid())
    AND can_view_work_item_by_id(work_item_id, auth.uid())
  );

DROP POLICY IF EXISTS "Comment on visible work items" ON work_item_comments;
CREATE POLICY "Comment on visible work items"
  ON work_item_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = get_user_company_id(auth.uid())
    AND can_view_work_item_by_id(work_item_id, auth.uid())
  );


-- ============================================
-- 5. Drop the old 2-arg predicate now nothing uses it.
-- ============================================

DROP FUNCTION IF EXISTS can_view_work_item(UUID, UUID);
