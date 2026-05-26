-- ============================================
-- Fix: auto-set company_id on holidays insert
-- The existing auto_set_company_id() trigger
-- uses NEW.user_id, but holidays uses created_by.
-- Add a dedicated trigger for holidays.
-- ============================================

CREATE OR REPLACE FUNCTION auto_set_holiday_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := get_user_company_id(NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_holidays_auto_company ON holidays;
CREATE TRIGGER trg_holidays_auto_company
  BEFORE INSERT ON holidays
  FOR EACH ROW EXECUTE FUNCTION auto_set_holiday_company_id();
