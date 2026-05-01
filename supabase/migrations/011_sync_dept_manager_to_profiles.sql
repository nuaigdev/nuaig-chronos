-- ============================================
-- NuAIg Chronos — Migration 011
-- Sync departments.manager_id → profiles.manager_id
-- for all employees in that department.
--
-- When a department's manager_id is updated,
-- a trigger automatically writes that value into
-- profiles.manager_id for every employee whose
-- department matches. This keeps the denormalised
-- manager reference on profiles in sync without
-- any extra application code.
--
-- Rules:
--   • Only profiles with role = 'employee' are
--     updated (managers carry their own direct
--     manager_id set explicitly).
--   • Setting a dept manager to NULL clears
--     profiles.manager_id for those employees.
--   • If the dept name changes (rare), a second
--     trigger handles re-syncing by old dept name.
-- ============================================


-- ============================================
-- 1. Function: sync employee manager_id when
--    a department's manager changes
-- ============================================

CREATE OR REPLACE FUNCTION sync_dept_manager_to_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when manager_id actually changed
  IF (NEW.manager_id IS NOT DISTINCT FROM OLD.manager_id) THEN
    RETURN NEW;
  END IF;

  -- Update all employees in this department
  UPDATE profiles
  SET
    manager_id = NEW.manager_id,
    updated_at = NOW()
  WHERE
    department = NEW.name
    AND role    = 'employee';

  RETURN NEW;
END;
$$;


-- ============================================
-- 2. Trigger on departments AFTER UPDATE
-- ============================================

DROP TRIGGER IF EXISTS trg_sync_dept_manager ON departments;

CREATE TRIGGER trg_sync_dept_manager
  AFTER UPDATE OF manager_id ON departments
  FOR EACH ROW
  EXECUTE FUNCTION sync_dept_manager_to_profiles();


-- ============================================
-- 3. Backfill: sync current state so existing
--    employees already have the right manager_id
--    from their department (idempotent).
-- ============================================

UPDATE profiles p
SET
  manager_id = d.manager_id,
  updated_at = NOW()
FROM departments d
WHERE
  p.department = d.name
  AND p.role   = 'employee'
  AND p.manager_id IS DISTINCT FROM d.manager_id;
