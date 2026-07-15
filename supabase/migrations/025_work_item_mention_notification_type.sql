-- ============================================
-- Chronos — Migration 025
-- New notification_type values: mention + generic edit
--
-- ⚠️ RUN THIS FILE ON ITS OWN, BEFORE 026/027.
--
-- Same rule as 018/021: ALTER TYPE ... ADD VALUE makes
-- the label visible only to subsequent transactions, so
-- these live in their own migration.
--
--  * work_item_mentioned — "X mentioned you on …"
--  * work_item_updated    — "X updated …" (field edits)
-- ============================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'work_item_mentioned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'work_item_updated';
