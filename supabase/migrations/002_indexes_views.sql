-- ============================================
-- NuAIg Chronos - Migration 002
-- Additional indexes and helper views
-- ============================================

-- ============================================
-- PERFORMANCE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_project_id ON time_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_log_date ON time_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_time_logs_timesheet_id ON time_logs(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_user_id ON timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheets_week_start ON timesheets(week_start_date);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);

-- ============================================
-- USEFUL VIEWS
-- ============================================

-- View: Project hours summary
CREATE OR REPLACE VIEW project_hours_summary AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  p.estimated_hours,
  p.status,
  c.name AS client_name,
  COALESCE(SUM(tl.hours), 0) AS logged_hours,
  CASE
    WHEN p.estimated_hours > 0
    THEN ROUND((COALESCE(SUM(tl.hours), 0) / p.estimated_hours) * 100, 1)
    ELSE 0
  END AS completion_pct,
  COUNT(DISTINCT tl.user_id) AS active_members
FROM projects p
LEFT JOIN clients c ON p.client_id = c.id
LEFT JOIN time_logs tl ON tl.project_id = p.id
GROUP BY p.id, p.name, p.estimated_hours, p.status, c.name;

-- View: Employee hours this week
CREATE OR REPLACE VIEW employee_weekly_hours AS
SELECT
  pr.id AS user_id,
  pr.full_name,
  pr.department,
  pr.role,
  COALESCE(SUM(tl.hours), 0) AS hours_this_week,
  DATE_TRUNC('week', NOW())::DATE AS week_start
FROM profiles pr
LEFT JOIN time_logs tl ON tl.user_id = pr.id
  AND tl.log_date >= DATE_TRUNC('week', NOW())::DATE
  AND tl.log_date < DATE_TRUNC('week', NOW())::DATE + 7
WHERE pr.is_active = true
GROUP BY pr.id, pr.full_name, pr.department, pr.role;

-- View: Timesheet status summary per user
CREATE OR REPLACE VIEW user_timesheet_summary AS
SELECT
  pr.id AS user_id,
  pr.full_name,
  COUNT(*) FILTER (WHERE ts.status = 'draft') AS draft_count,
  COUNT(*) FILTER (WHERE ts.status = 'submitted') AS submitted_count,
  COUNT(*) FILTER (WHERE ts.status = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE ts.status = 'rejected') AS rejected_count,
  COALESCE(SUM(ts.total_hours) FILTER (WHERE ts.status = 'approved'), 0) AS total_approved_hours
FROM profiles pr
LEFT JOIN timesheets ts ON ts.user_id = pr.id
WHERE pr.is_active = true
GROUP BY pr.id, pr.full_name;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function: Get pending timesheets count for a manager's team
CREATE OR REPLACE FUNCTION get_pending_timesheets_for_manager(manager_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM timesheets ts
  JOIN profiles p ON p.id = ts.user_id
  WHERE ts.status = 'submitted'
  AND (p.manager_id = manager_uuid OR EXISTS (
    SELECT 1 FROM profiles WHERE id = manager_uuid AND role = 'admin'
  ));
$$ LANGUAGE SQL SECURITY DEFINER;

-- Function: Check if a user can edit a time log
CREATE OR REPLACE FUNCTION can_edit_time_log(log_id UUID, requesting_user UUID)
RETURNS BOOLEAN AS $$
DECLARE
  log_user UUID;
  log_ts_status TEXT;
BEGIN
  SELECT tl.user_id, ts.status
  INTO log_user, log_ts_status
  FROM time_logs tl
  JOIN timesheets ts ON ts.id = tl.timesheet_id
  WHERE tl.id = log_id;

  IF log_user = requesting_user AND log_ts_status IN ('draft', 'rejected') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANT VIEW ACCESS
-- ============================================

GRANT SELECT ON project_hours_summary TO authenticated;
GRANT SELECT ON employee_weekly_hours TO authenticated;
GRANT SELECT ON user_timesheet_summary TO authenticated;
