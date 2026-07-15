-- ============================================
-- Chronos — Migration 021
-- Work Item comments: new notification_type value
--
-- ⚠️ RUN THIS FILE ON ITS OWN, BEFORE 022/023.
--
-- Same rule as migration 018: ALTER TYPE ... ADD VALUE
-- makes the new label visible only to *subsequent*
-- transactions, so it lives in its own migration.
-- ============================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'work_item_commented';
