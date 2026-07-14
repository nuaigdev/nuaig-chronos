-- ============================================
-- Chronos — Migration 018
-- Work Board: new notification_type enum values
--
-- ⚠️ RUN THIS FILE ON ITS OWN, BEFORE 019.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction block alongside statements that then
-- USE the new value. Postgres only makes a newly
-- added enum label visible to *subsequent*
-- transactions. Keeping these three statements in
-- their own migration guarantees 019 can reference
-- them safely.
-- ============================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'work_item_assigned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'work_item_status_changed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'work_item_due_soon';
