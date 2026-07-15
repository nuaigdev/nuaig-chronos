-- ============================================
-- Chronos — Migration 026
-- @-mentions on comments
--
-- Run AFTER 025 (the notification enum value).
--
-- Adds mentioned_user_ids to work_item_comments and a
-- trigger that strips any id that isn't a member of the
-- work item's project. That enforces "mentions are
-- restricted to people in the project" at the database —
-- the composer only offers project members, but the
-- trigger makes it true even for a crafted request.
-- ============================================

ALTER TABLE work_item_comments
  ADD COLUMN IF NOT EXISTS mentioned_user_ids UUID[] NOT NULL DEFAULT '{}';


-- Keep only mentioned ids that are members of the item's project.
-- SECURITY DEFINER so it can read work_items / project_members.
CREATE OR REPLACE FUNCTION filter_comment_mentions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mentioned_user_ids IS NULL THEN
    NEW.mentioned_user_ids := '{}';
    RETURN NEW;
  END IF;

  NEW.mentioned_user_ids := ARRAY(
    SELECT DISTINCT m
    FROM unnest(NEW.mentioned_user_ids) AS m
    WHERE is_project_member(
      (SELECT project_id FROM work_items WHERE id = NEW.work_item_id),
      m
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_filter_comment_mentions ON work_item_comments;
CREATE TRIGGER trg_filter_comment_mentions
  BEFORE INSERT OR UPDATE OF mentioned_user_ids ON work_item_comments
  FOR EACH ROW EXECUTE FUNCTION filter_comment_mentions();
