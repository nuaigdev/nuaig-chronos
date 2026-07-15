-- ============================================
-- Chronos — Migration 027
-- Assignees can extend a work item to other people
--
-- Run AFTER 023 (which last defined this policy).
--
-- Until now only admins, managers, and the creator could
-- change a work item's assignees. But the work_items
-- UPDATE policy (019) also lets a plain ASSIGNEE edit the
-- item — so an assignee could open the assignee picker,
-- add someone, and have the insert silently rejected while
-- the "assigned" notification still fired. That asymmetry
-- is the "notified but not added" bug.
--
-- Fix the asymmetry the way the product wants it: an
-- assignee may also manage assignees (extend the task to
-- other people). Now everyone who can edit the item can
-- also change who it's assigned to — the two policies
-- agree, so there is no silent-reject path.
--
-- The assignee must still be a member of the item's
-- project (unchanged from 023).
-- ============================================

DROP POLICY IF EXISTS "Managers and creators manage assignees" ON work_item_assignees;

CREATE POLICY "Editors manage assignees"
  ON work_item_assignees FOR ALL
  USING (
    get_work_item_company(work_item_id) = get_user_company_id(auth.uid())
    AND (
      get_user_role(auth.uid()) IN ('admin', 'manager')
      OR get_work_item_creator(work_item_id) = auth.uid()
      -- NEW: an existing assignee may manage assignees too.
      -- is_work_item_assignee is SECURITY DEFINER, so reading
      -- work_item_assignees from this policy does not recurse.
      OR is_work_item_assignee(work_item_id, auth.uid())
    )
  )
  WITH CHECK (
    get_work_item_company(work_item_id) = get_user_company_id(auth.uid())
    AND (
      get_user_role(auth.uid()) IN ('admin', 'manager')
      OR get_work_item_creator(work_item_id) = auth.uid()
      OR is_work_item_assignee(work_item_id, auth.uid())
    )
    -- The assignee must be a member of the item's project.
    AND is_project_member(get_work_item_project(work_item_id), user_id)
  );
