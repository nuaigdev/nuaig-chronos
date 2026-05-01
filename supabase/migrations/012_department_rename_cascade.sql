-- ============================================
-- NuAIg Chronos — Migration 012
-- Department rename cascade trigger
--
-- When departments.name (the code) is changed,
-- automatically cascade the rename to:
--   • profiles.department
--   • task_types.department
--
-- This keeps all denormalised department
-- references consistent when an admin renames
-- a department code via the Departments page.
-- ============================================


-- ============================================
-- 1. Function: cascade department rename
-- ============================================

CREATE OR REPLACE FUNCTION cascade_department_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when name actually changed
  IF NEW.name IS NOT DISTINCT FROM OLD.name THEN
    RETURN NEW;
  END IF;

  -- Update profiles that belong to the old dept name
  UPDATE profiles
  SET
    department = NEW.name,
    updated_at = NOW()
  WHERE department = OLD.name;

  -- Update task_types that belong to the old dept name
  UPDATE task_types
  SET department = NEW.name
  WHERE department = OLD.name;

  RETURN NEW;
END;
$$;


-- ============================================
-- 2. Trigger on departments AFTER UPDATE
-- ============================================

DROP TRIGGER IF EXISTS trg_cascade_department_rename ON departments;

CREATE TRIGGER trg_cascade_department_rename
  AFTER UPDATE OF name ON departments
  FOR EACH ROW
  EXECUTE FUNCTION cascade_department_rename();
