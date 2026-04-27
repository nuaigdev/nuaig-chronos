-- ============================================
-- NuAIg Chronos - Complete Database Schema
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'employee');
CREATE TYPE project_status AS ENUM ('active', 'archived', 'completed');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'completed');
CREATE TYPE timesheet_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');
CREATE TYPE notification_type AS ENUM (
  'timesheet_submitted', 'timesheet_approved', 'timesheet_rejected',
  'time_log_reminder', 'timesheet_reminder', 'pending_approval_alert'
);

-- ============================================
-- PROFILES (extends auth.users)
-- ============================================

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'employee',
  department TEXT,
  manager_id UUID REFERENCES profiles(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CLIENTS
-- ============================================

CREATE TABLE clients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  website TEXT,
  industry TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROJECTS
-- ============================================

CREATE TABLE projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id),
  status project_status DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  estimated_hours DECIMAL(10,2),
  budget DECIMAL(12,2),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROJECT MEMBERS
-- ============================================

CREATE TABLE project_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- ============================================
-- TASKS
-- ============================================

CREATE TABLE tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status task_status DEFAULT 'todo',
  estimated_hours DECIMAL(10,2),
  assigned_to UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TIMESHEETS
-- ============================================

CREATE TABLE timesheets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  status timesheet_status DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  total_hours DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start_date)
);

-- ============================================
-- TIME LOGS
-- ============================================

CREATE TABLE time_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  timesheet_id UUID REFERENCES timesheets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  log_date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  related_id UUID, -- references timesheets/projects etc
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ADMIN SETTINGS
-- ============================================

CREATE TABLE admin_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HOLIDAYS
-- ============================================

CREATE TABLE holidays (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL UNIQUE,
  is_optional BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timesheets_updated_at BEFORE UPDATE ON timesheets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_time_logs_updated_at BEFORE UPDATE ON time_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update timesheet total hours when time logs change
CREATE OR REPLACE FUNCTION update_timesheet_hours()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE timesheets
  SET total_hours = (
    SELECT COALESCE(SUM(hours), 0)
    FROM time_logs
    WHERE timesheet_id = COALESCE(NEW.timesheet_id, OLD.timesheet_id)
  )
  WHERE id = COALESCE(NEW.timesheet_id, OLD.timesheet_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_timesheet_hours_on_log_change
AFTER INSERT OR UPDATE OR DELETE ON time_logs
FOR EACH ROW EXECUTE FUNCTION update_timesheet_hours();

-- Auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'employee')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = user_id;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin can update any profile" ON profiles FOR UPDATE USING (get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admin can insert profiles" ON profiles FOR INSERT WITH CHECK (get_user_role(auth.uid()) = 'admin');

-- Clients policies
CREATE POLICY "Authenticated can view clients" ON clients FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and Manager can manage clients" ON clients FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'manager'));

-- Projects policies
CREATE POLICY "All authenticated can view active projects" ON projects FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and Manager can manage projects" ON projects FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'manager'));

-- Project members policies
CREATE POLICY "All can view project members" ON project_members FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and Manager can manage members" ON project_members FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'manager'));

-- Tasks policies
CREATE POLICY "All authenticated can view tasks" ON tasks FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and Manager can manage tasks" ON tasks FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'manager'));

-- Timesheets policies
CREATE POLICY "Users can view own timesheets" ON timesheets FOR SELECT USING (
  user_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'manager')
);
CREATE POLICY "Users can manage own draft timesheets" ON timesheets FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own timesheets" ON timesheets FOR UPDATE USING (
  user_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'manager')
);

-- Time logs policies
CREATE POLICY "Users can view own time logs" ON time_logs FOR SELECT USING (
  user_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'manager')
);
CREATE POLICY "Users can manage own time logs" ON time_logs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Admin Manager can view all logs" ON time_logs FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'manager'));

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);

-- Admin settings policies
CREATE POLICY "All can read settings" ON admin_settings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin can manage settings" ON admin_settings FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Holidays policies
CREATE POLICY "All can view holidays" ON holidays FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin can manage holidays" ON holidays FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- ============================================
-- SEED DEFAULT SETTINGS
-- ============================================

INSERT INTO admin_settings (key, value) VALUES
  ('working_hours_per_day', '{"value": 8}'),
  ('timesheet_reminder_day', '{"value": "friday", "time": "17:00"}'),
  ('approval_reminder_hours', '{"value": 48}');
