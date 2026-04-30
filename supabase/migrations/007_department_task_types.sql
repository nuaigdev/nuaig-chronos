-- ============================================
-- NuAIg Chronos — Migration 007
-- Department-based task types (master table)
-- + Remove old project-specific tasks model
-- + Update time_logs to reference task_type
-- + Add strict future-date guard on time_logs
-- ============================================


-- ============================================
-- 1. DEPARTMENTS ENUM
--    Fixed set — code and DB must stay in sync.
--
--    Drop the dependent view first, alter the
--    column, then recreate the view below.
--
--    Any existing department value that is NOT
--    in the enum (e.g. "Management", free-text
--    entries) is set to NULL rather than
--    aborting the migration.
-- ============================================

CREATE TYPE department_type AS ENUM (
  'COE',
  'Project',
  'HR',
  'Marketing',
  'BA',
  'Data'
);

-- Drop view that depends on profiles.department
DROP VIEW IF EXISTS employee_weekly_hours;

-- Alter profiles to use the enum.
-- The USING expression maps only known values;
-- everything else (e.g. "Management") becomes NULL.
ALTER TABLE profiles
  ALTER COLUMN department TYPE department_type
  USING (
    CASE department
      WHEN 'COE'       THEN 'COE'::department_type
      WHEN 'Project'   THEN 'Project'::department_type
      WHEN 'HR'        THEN 'HR'::department_type
      WHEN 'Marketing' THEN 'Marketing'::department_type
      WHEN 'BA'        THEN 'BA'::department_type
      WHEN 'Data'      THEN 'Data'::department_type
      ELSE NULL
    END
  );

-- Recreate the view with the same definition
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

GRANT SELECT ON employee_weekly_hours TO authenticated;


-- ============================================
-- 2. TASK TYPES MASTER TABLE
--    One row per (department, task_name).
--    Seeded below — no user creation allowed.
-- ============================================

CREATE TABLE task_types (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  department  department_type NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (department, name)
);

-- RLS
ALTER TABLE task_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view task_types"
  ON task_types FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage task_types"
  ON task_types FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE task_types;

-- Index
CREATE INDEX idx_task_types_department ON task_types(department);


-- ============================================
-- 3. SEED TASK TYPES
-- ============================================

-- COE (Centre of Excellence — engineering, R&D, research)
INSERT INTO task_types (department, name, description, sort_order) VALUES
  ('COE', 'Development',          'Feature development and coding',                    1),
  ('COE', 'Code Review',          'Reviewing code and pull requests',                  2),
  ('COE', 'Testing & QA',         'Writing and executing tests',                       3),
  ('COE', 'R&D',                  'Research and development of new technologies',      4),
  ('COE', 'Research',             'Technical research and feasibility studies',        5),
  ('COE', 'Documentation',        'Technical documentation and knowledge base',        6),
  ('COE', 'Deployment',           'Deployment, CI/CD and release management',          7),
  ('COE', 'Architecture',         'System design and architecture decisions',          8),
  ('COE', 'Bug Fixing',           'Debugging and fixing defects',                      9),
  ('COE', 'Meetings',             'Stand-ups, planning and team ceremonies',          10);

-- Project (client-facing development)
INSERT INTO task_types (department, name, description, sort_order) VALUES
  ('Project', 'Development',          'Client project feature development',            1),
  ('Project', 'Testing & QA',         'Testing and quality assurance for client work', 2),
  ('Project', 'Deployment',           'Deploying client project releases',             3),
  ('Project', 'Code Review',          'Peer code review on project work',              4),
  ('Project', 'Documentation',        'Project documentation and handover docs',       5),
  ('Project', 'Client Meeting',       'Calls and meetings with the client',            6),
  ('Project', 'Bug Fixing',           'Resolving bugs reported by client',             7),
  ('Project', 'Requirement Analysis', 'Analysing and clarifying requirements',         8),
  ('Project', 'Design',               'UI/UX and solution design',                     9),
  ('Project', 'Reporting',            'Progress reports and status updates',          10);

-- HR
INSERT INTO task_types (department, name, description, sort_order) VALUES
  ('HR', 'Recruitment',           'Job postings, screening and interviews',            1),
  ('HR', 'Onboarding',            'New employee onboarding activities',                2),
  ('HR', 'Offboarding',           'Employee exit and offboarding processes',           3),
  ('HR', 'Policy & Compliance',   'HR policy drafting and compliance work',            4),
  ('HR', 'Payroll & Benefits',    'Payroll processing and benefits management',        5),
  ('HR', 'Training & Development','Learning programmes and L&D coordination',          6),
  ('HR', 'Performance Review',    'Appraisals and performance management',             7),
  ('HR', 'Employee Relations',    'Grievances, counselling and engagement',            8),
  ('HR', 'HR Administration',     'General HR admin, records and filing',              9),
  ('HR', 'Meetings',              'HR team meetings and cross-functional calls',       10);

-- Marketing
INSERT INTO task_types (department, name, description, sort_order) VALUES
  ('Marketing', 'Content Creation',      'Blog posts, videos and creative assets',        1),
  ('Marketing', 'Social Media',          'Social media management and scheduling',        2),
  ('Marketing', 'Campaign Management',   'Planning and running marketing campaigns',      3),
  ('Marketing', 'SEO / SEM',             'Search engine optimisation and paid search',    4),
  ('Marketing', 'Market Research',       'Competitive analysis and market research',      5),
  ('Marketing', 'Design',                'Graphic design and brand assets',               6),
  ('Marketing', 'Email Marketing',       'Email campaigns and newsletter management',     7),
  ('Marketing', 'Events',                'Events planning and coordination',              8),
  ('Marketing', 'Analytics & Reporting', 'Marketing analytics and performance reports',   9),
  ('Marketing', 'Meetings',              'Internal and external marketing meetings',     10);

-- BA (Business Analysts — client communication & project management)
INSERT INTO task_types (department, name, description, sort_order) VALUES
  ('BA', 'Requirement Gathering',  'Eliciting and documenting requirements',            1),
  ('BA', 'Client Communication',   'Calls, emails and meetings with clients',           2),
  ('BA', 'Documentation',          'BRD, FRD and process documentation',                3),
  ('BA', 'Project Management',     'Sprint planning, tracking and coordination',        4),
  ('BA', 'Stakeholder Management', 'Managing stakeholder expectations',                 5),
  ('BA', 'UAT Support',            'Supporting user acceptance testing',                6),
  ('BA', 'Process Analysis',       'As-is / to-be process mapping',                    7),
  ('BA', 'Risk Management',        'Identifying and mitigating project risks',          8),
  ('BA', 'Reporting',              'Status reports and dashboards for stakeholders',    9),
  ('BA', 'Meetings',               'Internal stand-ups and review meetings',           10);

-- Data
INSERT INTO task_types (department, name, description, sort_order) VALUES
  ('Data', 'Data Analysis',        'Exploratory analysis and insights generation',      1),
  ('Data', 'Data Engineering',     'Pipelines, ETL and data infrastructure',            2),
  ('Data', 'Modelling',            'Statistical and machine learning model work',       3),
  ('Data', 'Dashboard & Reporting','Building dashboards and data reports',              4),
  ('Data', 'Data Quality',         'Data cleansing, validation and governance',         5),
  ('Data', 'Research',             'Data-driven research and experimentation',          6),
  ('Data', 'Documentation',        'Data dictionaries and technical documentation',     7),
  ('Data', 'Deployment',           'Deploying models and data products',                8),
  ('Data', 'Code Review',          'Reviewing data science / engineering code',         9),
  ('Data', 'Meetings',             'Team meetings and cross-functional syncs',         10);


-- ============================================
-- 4. UPDATE time_logs
--    Add task_type_id (FK -> task_types).
--    The legacy task_id column is kept as-is
--    for backward-compat; new code uses
--    task_type_id only.
-- ============================================

ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS task_type_id UUID REFERENCES task_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_logs_task_type_id ON time_logs(task_type_id);


-- ============================================
-- 5. FUTURE-DATE GUARD on time_logs
--    Reject any log_date > today at the DB level.
-- ============================================

ALTER TABLE time_logs
  DROP CONSTRAINT IF EXISTS no_future_log_date;

ALTER TABLE time_logs
  ADD CONSTRAINT no_future_log_date
  CHECK (log_date <= CURRENT_DATE);


-- ============================================
-- 6. TIMESHEET EDITABILITY FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION timesheet_is_editable(ts_id UUID, requesting_user UUID)
RETURNS BOOLEAN AS $$
DECLARE
  ts_status TEXT;
  ts_user   UUID;
BEGIN
  SELECT status, user_id INTO ts_status, ts_user
  FROM timesheets WHERE id = ts_id;

  IF ts_user <> requesting_user THEN
    RETURN FALSE;
  END IF;

  RETURN ts_status IN ('draft', 'rejected');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 7. CLEAN UP old task RLS policies
-- ============================================

DROP POLICY IF EXISTS "Employees can insert tasks on their projects"  ON tasks;
DROP POLICY IF EXISTS "Employees can update tasks on their projects"  ON tasks;
DROP POLICY IF EXISTS "Admin Manager can insert tasks"                ON tasks;
DROP POLICY IF EXISTS "Admin Manager can update tasks"                ON tasks;
DROP POLICY IF EXISTS "Admin Manager Creator can delete tasks"        ON tasks;
DROP POLICY IF EXISTS "All authenticated can view tasks"              ON tasks;

-- Keep read-all for legacy data visibility
CREATE POLICY "All authenticated can view tasks"
  ON tasks FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can touch the legacy tasks table now
CREATE POLICY "Admin only manage legacy tasks"
  ON tasks FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');


-- ============================================
-- 8. GRANT access on new table
-- ============================================

GRANT SELECT ON task_types TO authenticated;