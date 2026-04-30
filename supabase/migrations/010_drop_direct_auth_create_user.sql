-- ============================================
-- NuAIg Chronos — Migration 010
-- Drop the admin_create_user RPC that inserted
-- directly into auth.users (blocked by Supabase
-- in hosted environments).
--
-- User creation is now handled server-side via
-- the Next.js API route /api/admin/create-user
-- which uses the service role key and the
-- supabase.auth.admin.createUser() SDK method.
-- ============================================

DROP FUNCTION IF EXISTS admin_create_user(TEXT, TEXT, TEXT, user_role, TEXT);
DROP FUNCTION IF EXISTS admin_create_user(TEXT, TEXT, TEXT, user_role, department_type);
