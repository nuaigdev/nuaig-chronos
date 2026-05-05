-- ============================================
-- NuAIg Chronos — Migration 015
-- Grant managers write access to task_types
-- for departments they manage.
--
-- Problem:
--   Migration 013 set the only write policy on
--   task_types to admin-only. Managers were
--   excluded at the DB level, so any INSERT /
--   UPDATE / DELETE attempted from the
--   Departments page was silently rejected by
--   Supabase RLS — even though the UI correctly
--   gates those actions to the manager's own
--   department.
--
-- Fix:
--   Add a scoped ALL policy for managers that
--   mirrors the app-level canEditTaskTypesFor()
--   check: the manager must be the designated
--   manager_id on the department row that matches
--   the task_type's department name.
-- ============================================

CREATE POLICY "Manager can manage own dept task_types"
  ON task_types FOR ALL
  USING (
    get_user_role(auth.uid()) = 'manager'
    AND company_id = get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM departments
      WHERE departments.name       = task_types.department
        AND departments.manager_id = auth.uid()
        AND departments.company_id = get_user_company_id(auth.uid())
    )
  )
  WITH CHECK (
    get_user_role(auth.uid()) = 'manager'
    AND company_id = get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM departments
      WHERE departments.name       = task_types.department
        AND departments.manager_id = auth.uid()
        AND departments.company_id = get_user_company_id(auth.uid())
    )
  );
