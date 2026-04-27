// ============================================
// NuAIg Chronos - TypeScript Types
// ============================================

export type UserRole = 'admin' | 'manager' | 'employee'
export type ProjectStatus = 'active' | 'archived' | 'completed'
export type TaskStatus = 'todo' | 'in_progress' | 'completed'
export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type NotificationType =
  | 'timesheet_submitted'
  | 'timesheet_approved'
  | 'timesheet_rejected'
  | 'time_log_reminder'
  | 'timesheet_reminder'
  | 'pending_approval_alert'

// ============================================
// DATABASE TYPES
// ============================================

export interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  role: UserRole
  department?: string
  manager_id?: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined
  manager?: Profile
  reports?: Profile[]
}

export interface Client {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  website?: string
  industry?: string
  notes?: string
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
  // Joined
  projects?: Project[]
  total_hours?: number
}

export interface Project {
  id: string
  name: string
  description?: string
  client_id?: string
  status: ProjectStatus
  start_date?: string
  end_date?: string
  estimated_hours?: number
  budget?: number
  created_by: string
  created_at: string
  updated_at: string
  // Joined
  client?: Client
  members?: ProjectMember[]
  project_members?: ProjectMember[]
  tasks?: Task[]
  total_logged_hours?: number
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  assigned_by: string
  assigned_at: string
  // Joined
  user?: Profile
  project?: Project
}

export interface Task {
  id: string
  project_id: string
  name: string
  description?: string
  status: TaskStatus
  estimated_hours?: number
  assigned_to?: string
  created_by: string
  due_date?: string
  created_at: string
  updated_at: string
  // Joined
  project?: Project
  assignee?: Profile
  logged_hours?: number
}

export interface Timesheet {
  id: string
  user_id: string
  week_start_date: string
  week_end_date: string
  status: TimesheetStatus
  submitted_at?: string
  reviewed_by?: string
  reviewed_at?: string
  review_comment?: string
  total_hours: number
  created_at: string
  updated_at: string
  // Joined
  user?: Profile
  reviewer?: Profile
  time_logs?: TimeLog[]
}

export interface TimeLog {
  id: string
  timesheet_id: string
  user_id: string
  project_id: string
  task_id?: string
  log_date: string
  hours: number
  description?: string
  created_at: string
  updated_at: string
  // Joined
  project?: Project
  task?: Task
  user?: Profile
}

export interface AppNotification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  is_read: boolean
  related_id?: string
  created_at: string
}

export interface Holiday {
  id: string
  name: string
  date: string
  is_optional: boolean
  created_by: string
  created_at: string
}

export interface AdminSetting {
  id: string
  key: string
  value: Record<string, unknown>
  updated_by?: string
  updated_at: string
}

// ============================================
// REPORT TYPES
// ============================================

export interface ProjectReport {
  project_id: string
  project_name: string
  client_name?: string
  estimated_hours: number
  logged_hours: number
  completion_percentage: number
  members: {
    user_id: string
    full_name: string
    hours: number
  }[]
  tasks: {
    task_id: string
    task_name: string
    status: TaskStatus
    estimated_hours: number
    logged_hours: number
  }[]
}

export interface CompanyReport {
  total_hours: number
  total_projects: number
  total_employees: number
  hours_by_project: {
    project_name: string
    hours: number
  }[]
  hours_by_employee: {
    full_name: string
    department?: string
    hours: number
  }[]
  hours_by_department: {
    department: string
    hours: number
  }[]
}

export interface TimesheetReport {
  pending: number
  approved: number
  rejected: number
  draft: number
  timesheets: (Timesheet & { user: Profile })[]
  late_submissions: number
}

// ============================================
// FORM TYPES
// ============================================

export interface CreateProjectForm {
  name: string
  description?: string
  client_id?: string
  start_date?: string
  end_date?: string
  estimated_hours?: number
  budget?: number
}

export interface CreateTaskForm {
  project_id: string
  name: string
  description?: string
  estimated_hours?: number
  assigned_to?: string
  due_date?: string
}

export interface LogTimeForm {
  project_id: string
  task_id?: string
  log_date: string
  hours: number
  description?: string
}

export interface CreateClientForm {
  name: string
  email?: string
  phone?: string
  address?: string
  website?: string
  industry?: string
  notes?: string
}

// ============================================
// DB ROW TYPES (actual columns only, no joins, nullable as | null)
// Used exclusively in the Database interface below.
// ============================================

interface ProfileRow {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  role: UserRole
  department: string | null
  manager_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface ClientRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  website: string | null
  industry: string | null
  notes: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

interface ProjectRow {
  id: string
  name: string
  description: string | null
  client_id: string | null
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  estimated_hours: number | null
  budget: number | null
  created_by: string
  created_at: string
  updated_at: string
}

interface ProjectMemberRow {
  id: string
  project_id: string
  user_id: string
  assigned_by: string
  assigned_at: string
}

interface TaskRow {
  id: string
  project_id: string
  name: string
  description: string | null
  status: TaskStatus
  estimated_hours: number | null
  assigned_to: string | null
  created_by: string
  due_date: string | null
  created_at: string
  updated_at: string
}

interface TimesheetRow {
  id: string
  user_id: string
  week_start_date: string
  week_end_date: string
  status: TimesheetStatus
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_comment: string | null
  total_hours: number
  created_at: string
  updated_at: string
}

interface TimeLogRow {
  id: string
  timesheet_id: string
  user_id: string
  project_id: string
  task_id: string | null
  log_date: string
  hours: number
  description: string | null
  created_at: string
  updated_at: string
}

interface AppNotificationRow {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  is_read: boolean
  related_id: string | null
  created_at: string
}

interface HolidayRow {
  id: string
  name: string
  date: string
  is_optional: boolean
  created_by: string
  created_at: string
}

interface AdminSettingRow {
  id: string
  key: string
  value: Record<string, unknown>
  updated_by: string | null
  updated_at: string
}

// ============================================
// SUPABASE DATABASE TYPE
// ============================================

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: {
          id: string
          email: string
          full_name: string
          avatar_url?: string | null
          role?: UserRole
          department?: string | null
          manager_id?: string | null
          is_active?: boolean
        }
        Update: Partial<ProfileRow>
        Relationships: []
      }
      clients: {
        Row: ClientRow
        Insert: {
          name: string
          email?: string | null
          phone?: string | null
          address?: string | null
          website?: string | null
          industry?: string | null
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
        }
        Update: Partial<ClientRow>
        Relationships: []
      }
      projects: {
        Row: ProjectRow
        Insert: {
          name: string
          description?: string | null
          client_id?: string | null
          status?: ProjectStatus
          start_date?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          budget?: number | null
          created_by: string
        }
        Update: Partial<ProjectRow>
        Relationships: []
      }
      project_members: {
        Row: ProjectMemberRow
        Insert: {
          project_id: string
          user_id: string
          assigned_by: string
        }
        Update: Partial<ProjectMemberRow>
        Relationships: []
      }
      tasks: {
        Row: TaskRow
        Insert: {
          project_id: string
          name: string
          description?: string | null
          status?: TaskStatus
          estimated_hours?: number | null
          assigned_to?: string | null
          created_by: string
          due_date?: string | null
        }
        Update: Partial<TaskRow>
        Relationships: []
      }
      timesheets: {
        Row: TimesheetRow
        Insert: {
          user_id: string
          week_start_date: string
          week_end_date: string
          status?: TimesheetStatus
          submitted_at?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_comment?: string | null
          total_hours?: number
        }
        Update: Partial<TimesheetRow>
        Relationships: []
      }
      time_logs: {
        Row: TimeLogRow
        Insert: {
          timesheet_id: string
          user_id: string
          project_id: string
          task_id?: string | null
          log_date: string
          hours: number
          description?: string | null
        }
        Update: Partial<TimeLogRow>
        Relationships: []
      }
      notifications: {
        Row: AppNotificationRow
        Insert: {
          user_id: string
          type: NotificationType
          title: string
          message: string
          is_read?: boolean
          related_id?: string | null
        }
        Update: Partial<AppNotificationRow>
        Relationships: []
      }
      holidays: {
        Row: HolidayRow
        Insert: {
          name: string
          date: string
          is_optional?: boolean
          created_by: string
        }
        Update: Partial<HolidayRow>
        Relationships: []
      }
      admin_settings: {
        Row: AdminSettingRow
        Insert: {
          key: string
          value: Record<string, unknown>
          updated_by?: string | null
        }
        Update: Partial<AdminSettingRow>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
  }
}
