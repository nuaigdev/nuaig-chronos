-- ============================================
-- Chronos — Migration 023
-- Assign by project membership, not department;
-- backfill assigned_by on existing rows.
--
-- Run AFTER 022 (which creates get_work_item_project).
--
-- CHANGE 1 — assign by project membership, for EVERYONE.
--   Work is filed against a project, and a project can
--   span departments. So the person you assign must be a
--   *member of the item's project* — and that applies to
--   admins and managers too, not just employees. To assign
--   someone who isn't on the project, add them to the
--   project first.
--
--   (Migration 020 had let employees assign only their own
--   *department* teammates, and left admins/managers able
--   to assign anyone. Both of those are superseded here.)
--
--   Department confinement still governs BOARD VISIBILITY
--   (an employee's team board still shows their own
--   department) — only the assignment rule changes.
--
-- CHANGE 2 — backfill assigned_by.
--   Populate any NULL assigned_by with the work item's
--   creator, so "Assigned by" has a value on older rows.
-- ============================================


-- ============================================
-- 1. Assign by project membership (employees)
-- ============================================

DROP POLICY IF EXISTS "Managers and creators manage assignees" ON work_item_assignees;

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

    -- The actor must be authorised to manage this item's assignees:
    -- an admin, a manager, or the person who raised it.
    AND (
      get_user_role(auth.uid()) IN ('admin', 'manager')
      OR get_work_item_creator(work_item_id) = auth.uid()
    )

    -- AND the assignee must be a member of the item's project — for
    -- EVERYONE, admins and managers included. You assign work to people
    -- who are on the project; to add someone else, add them to the
    -- project first.
    AND is_project_member(get_work_item_project(work_item_id), user_id)
  );


-- ============================================
-- 2. Backfill assigned_by on existing rows
--    Older assignee rows with no assigned_by are
--    attributed to whoever created the work item.
-- ============================================

UPDATE work_item_assignees wia
SET assigned_by = wi.created_by
FROM work_items wi
WHERE wia.work_item_id = wi.id
  AND wia.assigned_by IS NULL;
