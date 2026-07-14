-- ============================================
-- Chronos — Migration 020
-- Work Board: department scoping for employees
--
-- Employees are confined to their own department:
--   * they see work items their own department is on
--     (plus items in projects they belong to, and items
--     they raised themselves)
--   * they may only assign their own departmental
--     teammates
--
-- Pulling in another team is therefore a deliberate act
-- by a manager or an admin, who are unrestricted and can
-- see every department's board.
--
-- Project scope stays cross-department on purpose: projects
-- span departments by design, so a project board that hid
-- co-workers from other teams would be useless. An employee
-- still only reaches projects they are a member of.
-- ============================================


-- ============================================
-- 1. HELPERS
--    SECURITY DEFINER so the policies below can read
--    profiles / work_item_assignees without tripping
--    those tables' own RLS (which would recurse: the
--    assignees policy reads work_items, and the
--    work_items policy would read assignees).
-- ============================================

CREATE OR REPLACE FUNCTION get_user_department(p_user_id UUID)
RETURNS TEXT AS $$
  SELECT department FROM profiles WHERE id = p_user_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


CREATE OR REPLACE FUNCTION work_item_has_assignee_in_department(
  p_work_item_id UUID,
  p_department   TEXT
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM work_item_assignees wia
    JOIN profiles p ON p.id = wia.user_id
    WHERE wia.work_item_id = p_work_item_id
      AND p.department IS NOT NULL
      AND p.department = p_department
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================
-- 2. work_items — SELECT
--    Was: anyone in the company sees everything.
--    Now: admins and managers still do; employees see
--    only what their own department, their projects, or
--    they themselves are attached to.
-- ============================================

DROP POLICY IF EXISTS "Company members can view work items" ON work_items;

CREATE POLICY "Company members can view work items"
  ON work_items FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = get_user_company_id(auth.uid())
    AND (
      get_user_role(auth.uid()) IN ('admin', 'manager')

      -- Their own department is on the item.
      OR work_item_has_assignee_in_department(id, get_user_department(auth.uid()))

      -- Project scope: a member of the project sees the whole
      -- project board, cross-department co-workers included.
      OR is_project_member(project_id, auth.uid())

      -- Never lose sight of something you raised yourself —
      -- e.g. an item you created but have not assigned to anyone.
      OR created_by = auth.uid()
    )
  );


-- ============================================
-- 3. work_item_assignees — who may be assigned
--
--    NOTE: SELECT on this table stays company-wide, and
--    that is deliberate. A card must render its FULL
--    assignee list from whichever board it is viewed on,
--    otherwise a task shared between two departments shows
--    a half-empty avatar row. Visibility of the underlying
--    work item is already gated by the policy above.
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
      -- This is the ONLY way another team gets pulled onto an item.
      get_user_role(auth.uid()) IN ('admin', 'manager')

      -- An employee may only assign their own departmental teammates,
      -- and only on an item they raised.
      OR (
        get_work_item_creator(work_item_id) = auth.uid()
        AND get_user_department(user_id) IS NOT NULL
        AND get_user_department(user_id) = get_user_department(auth.uid())
      )
    )
  );
