-- ============================================
-- NuAIg Chronos — Migration 006
-- Role-based Delete & Edit permissions
--
-- Clients  : Edit & Delete → admin, manager only
-- Projects : Edit & Delete → admin, manager only
-- Tasks    : Delete → admin, manager, or creator
--            Edit   → admin, manager, or any
--                     project member of that task's project
-- ============================================


-- ============================================
-- 1. CLIENTS
--    The existing "Admin and Manager can manage clients"
--    policy uses FOR ALL which covers INSERT, SELECT,
--    UPDATE, and DELETE together. We need to split it
--    into granular policies so we can add the extra
--    guard for employees on SELECT while keeping
--    admin/manager full control.
--
--    Current state:
--      "Authenticated can view clients" → SELECT
--      "Admin and Manager can manage clients" → ALL
--
--    New state:
--      Keep SELECT open to authenticated users.
--      Restrict UPDATE and DELETE to admin/manager only.
--      Keep INSERT open to admin/manager (same as before).
-- ============================================

-- Drop the broad ALL policy
DROP POLICY IF EXISTS "Admin and Manager can manage clients" ON clients;

-- Re-create as explicit per-operation policies
CREATE POLICY "Admin Manager can insert clients"
  ON clients FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "Admin Manager can update clients"
  ON clients FOR UPDATE
  USING (get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "Admin Manager can delete clients"
  ON clients FOR DELETE
  USING (get_user_role(auth.uid()) IN ('admin', 'manager'));


-- ============================================
-- 2. PROJECTS
--    Same situation as clients.
--    Current: "Admin and Manager can manage projects" → ALL
--    New: split into INSERT / UPDATE / DELETE
-- ============================================

DROP POLICY IF EXISTS "Admin and Manager can manage projects" ON projects;

CREATE POLICY "Admin Manager can insert projects"
  ON projects FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "Admin Manager can update projects"
  ON projects FOR UPDATE
  USING (get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "Admin Manager can delete projects"
  ON projects FOR DELETE
  USING (get_user_role(auth.uid()) IN ('admin', 'manager'));


-- ============================================
-- 3. TASKS — DELETE
--    Allowed: admin, manager, OR the employee who
--    created the task (created_by = auth.uid()).
-- ============================================

-- Drop any old blanket delete from the ALL policy
DROP POLICY IF EXISTS "Admin and Manager can manage tasks" ON tasks;

-- Recreate the admin/manager INSERT (was part of ALL)
CREATE POLICY "Admin Manager can insert tasks"
  ON tasks FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'manager'));

-- Admin / manager can update any task
CREATE POLICY "Admin Manager can update tasks"
  ON tasks FOR UPDATE
  USING (get_user_role(auth.uid()) IN ('admin', 'manager'));

-- Delete: admin, manager, or task creator
CREATE POLICY "Admin Manager Creator can delete tasks"
  ON tasks FOR DELETE
  USING (
    get_user_role(auth.uid()) IN ('admin', 'manager')
    OR created_by = auth.uid()
  );


-- ============================================
-- 4. TASKS — EDIT (UPDATE) for employees
--    Employees who are members of the task's project
--    may update the task.
--
--    Migration 005 already created:
--      "Employees can update tasks on their projects"
--    We keep that policy — it already satisfies the
--    requirement. No changes needed here.
--
--    For completeness, drop & recreate it cleanly
--    to avoid duplicates if 005 was applied.
-- ============================================

DROP POLICY IF EXISTS "Employees can update tasks on their projects" ON tasks;

CREATE POLICY "Employees can update tasks on their projects"
  ON tasks FOR UPDATE
  USING (
    get_user_role(auth.uid()) = 'employee'
    AND EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = tasks.project_id
        AND project_members.user_id = auth.uid()
    )
  );


-- ============================================
-- 5. TASKS — INSERT for employees
--    Keep the policy from migration 005 — employees
--    can create tasks on projects they belong to.
--    Drop & recreate to avoid duplicates.
-- ============================================

DROP POLICY IF EXISTS "Employees can insert tasks on their projects" ON tasks;

CREATE POLICY "Employees can insert tasks on their projects"
  ON tasks FOR INSERT
  WITH CHECK (
    get_user_role(auth.uid()) = 'employee'
    AND EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = tasks.project_id
        AND project_members.user_id = auth.uid()
    )
  );


-- ============================================
-- 6. TASKS — SELECT
--    Keep existing "All authenticated can view tasks"
--    untouched. No change needed.
-- ============================================
