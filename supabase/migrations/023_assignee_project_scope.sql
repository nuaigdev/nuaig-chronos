-- ============================================
-- Chronos — Migration 023
-- Assign by project membership, not department;
-- backfill assigned_by on existing rows.
--
-- Run AFTER 022 (which creates get_work_item_project).
--
-- CHANGE 1 — who an employee may assign.
--   Migration 020 let an employee assign only their own
--   *department* teammates. But a project can span
--   departments, and work is filed against a project. So
--   an employee should be able to assign anyone who is a
--   *member of the item's project*, cross-department
--   included. That is this change.
--
--   Department confinement still governs BOARD VISIBILITY
--   (an employee's team board still shows their own
--   department) — only the assignment rule moves to
--   project membership. Admins/managers are unchanged:
--   they may assign anyone.
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
    AND (
      -- Managers and admins may assign anyone, in any department.
      get_user_role(auth.uid()) IN ('admin', 'manager')

      -- An employee may assign anyone who is a member of the item's
      -- project — cross-department included — on an item they raised.
      -- (Was: only same-department teammates, in migration 020.)
      OR (
        get_work_item_creator(work_item_id) = auth.uid()
        AND is_project_member(get_work_item_project(work_item_id), user_id)
      )
    )
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
