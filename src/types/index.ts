// ============================================
// Chronos - TypeScript Types
// ============================================

export type UserRole = 'admin' | 'manager' | 'employee'
export type ProjectStatus = 'active' | 'archived' | 'completed'
export type TaskStatus = 'todo' | 'in_progress' | 'completed'
export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

// Work Board — the three kanban lanes.
// Deliberately distinct from TaskStatus, which belongs to the
// legacy `tasks` table and is not used by the board.
export type WorkItemStatus = 'not_started' | 'in_progress' | 'done'
export type WorkItemPriority = 'low' | 'medium' | 'high'

export type NotificationType =
  | 'timesheet_submitted'
  | 'timesheet_approved'
  | 'timesheet_rejected'
  | 'time_log_reminder'
  | 'timesheet_reminder'
  | 'pending_approval_alert'
  | 'work_item_assigned'
  | 'work_item_status_changed'
  | 'work_item_due_soon'

// Department is now a free-text string (migration 009 dropped the enum).
// The six seed values are kept as a convenience constant but the type is open.
export type Department = string

export const DEPARTMENT_LABELS: Record<string, string> = {
  COE: 'Centre of Excellence',
  Project: 'Project',
  HR: 'Human Resources',
  Marketing: 'Marketing',
  BA: 'Business Analysts',
  Data: 'Data',
}

export const DEPARTMENTS: string[] = ['COE', 'Project', 'HR', 'Marketing', 'BA', 'Data']

// ============================================
// DATABASE TYPES
// ============================================

export interface Company {
  id: string
  name: string
  slug: string
  logo_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  role: UserRole
  department?: string
  manager_id?: string
  company_id: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined
  manager?: Profile
  reports?: Profile[]
  company?: Company
}

export interface DeptRow {
  id: string
  name: string
  display_name: string
  description: string | null
  manager_id: string | null
  company_id: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined
  manager?: Profile
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
  company_id: string
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
  company_id: string
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

// Legacy task (read-only / admin only after migration 007)
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

// ============================================
// WORK BOARD
// ============================================

/**
 * A card on the Work Board.
 *
 * Note there is no `department` field: projects can span
 * departments, so an item has no single owning department.
 * The team board is derived from the departments of the
 * item's assignees instead.
 */
export interface WorkItem {
  id: string
  title: string
  description?: string
  status: WorkItemStatus
  priority: WorkItemPriority
  project_id: string
  due_date?: string
  position: number
  completed_at?: string
  company_id: string
  created_by: string
  created_at: string
  updated_at: string
  // Joined
  project?: Project
  creator?: Profile
  assignees?: WorkItemAssignee[]
}

export interface WorkItemAssignee {
  id: string
  work_item_id: string
  user_id: string
  assigned_by?: string
  assigned_at: string
  // Joined
  user?: Profile
  assigner?: Profile   // who assigned this person (work_item_assignees.assigned_by)
}

export interface WorkItemComment {
  id: string
  work_item_id: string
  user_id: string
  body: string
  edited_at?: string
  company_id: string
  created_at: string
  updated_at: string
  // Joined
  user?: Profile
}

export const WORK_ITEM_STATUS_LABELS: Record<WorkItemStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  done: 'Done',
}

// Lane order, left to right.
export const WORK_ITEM_LANES: WorkItemStatus[] = ['not_started', 'in_progress', 'done']

// Master task type row (department-scoped)
export interface TaskType {
  id: string
  department: string
  name: string
  description?: string
  is_active: boolean
  sort_order: number
  company_id: string
  created_at: string
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
  company_id: string
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
  task_id?: string          // legacy
  task_type_id?: string     // new
  log_date: string
  hours: number
  description?: string
  company_id: string
  created_at: string
  updated_at: string
  // Joined
  project?: Project
  task?: Task               // legacy
  task_type?: TaskType      // new
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
  company_id: string
  created_by: string
  created_at: string
}

export interface AdminSetting {
  id: string
  key: string
  value: Record<string, unknown>
  company_id: string
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
  task_types: {
    task_type_id: string
    task_type_name: string
    hours: number
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

export interface LogTimeForm {
  project_id: string
  task_type_id: string
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

export interface CreateDepartmentForm {
  name: string
  display_name: string
  description?: string
}

// ============================================
// DB ROW TYPES
// ============================================

interface ProfileRow {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  role: UserRole
  department: string | null
  manager_id: string | null
  company_id: string
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
  company_id: string
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
  company_id: string
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

interface TaskTypeRow {
  id: string
  department: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
  company_id: string
  created_at: string
}

interface WorkItemRow {
  id: string
  title: string
  description: string | null
  status: WorkItemStatus
  priority: WorkItemPriority
  project_id: string
  due_date: string | null
  position: number
  completed_at: string | null
  company_id: string
  created_by: string
  created_at: string
  updated_at: string
}

interface WorkItemAssigneeRow {
  id: string
  work_item_id: string
  user_id: string
  assigned_by: string | null
  assigned_at: string
}

interface WorkItemCommentRow {
  id: string
  work_item_id: string
  user_id: string
  body: string
  edited_at: string | null
  company_id: string
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
  company_id: string
  created_at: string
  updated_at: string
}

interface TimeLogRow {
  id: string
  timesheet_id: string
  user_id: string
  project_id: string
  task_id: string | null
  task_type_id: string | null
  log_date: string
  hours: number
  description: string | null
  company_id: string
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
  company_id: string
  created_by: string
  created_at: string
}

interface AdminSettingRow {
  id: string
  key: string
  value: Record<string, unknown>
  company_id: string
  updated_by: string | null
  updated_at: string
}

interface DepartmentRow {
  id: string
  name: string
  display_name: string
  description: string | null
  manager_id: string | null
  company_id: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface CompanyRow {
  id: string
  name: string
  slug: string
  logo_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================
// SUPABASE DATABASE TYPE
// ============================================

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: CompanyRow
        Insert: {
          name: string
          slug: string
          logo_url?: string | null
          is_active?: boolean
        }
        Update: Partial<CompanyRow>
        Relationships: []
      }
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
          company_id: string
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
          company_id: string
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
          company_id: string
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
      task_types: {
        Row: TaskTypeRow
        Insert: {
          department: string
          name: string
          description?: string | null
          is_active?: boolean
          sort_order?: number
          company_id: string
        }
        Update: Partial<TaskTypeRow>
        Relationships: []
      }
      work_items: {
        Row: WorkItemRow
        Insert: {
          title: string
          description?: string | null
          status?: WorkItemStatus
          priority?: WorkItemPriority
          project_id: string
          due_date?: string | null
          position?: number
          company_id?: string
          created_by: string
        }
        Update: Partial<WorkItemRow>
        Relationships: []
      }
      work_item_assignees: {
        Row: WorkItemAssigneeRow
        Insert: {
          work_item_id: string
          user_id: string
          assigned_by?: string | null
        }
        Update: Partial<WorkItemAssigneeRow>
        Relationships: []
      }
      work_item_comments: {
        Row: WorkItemCommentRow
        Insert: {
          work_item_id: string
          user_id: string
          body: string
          company_id?: string
        }
        Update: Partial<WorkItemCommentRow>
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
          company_id?: string
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
          task_type_id?: string | null
          log_date: string
          hours: number
          description?: string | null
          company_id?: string
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
          company_id: string
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
          company_id: string
          updated_by?: string | null
        }
        Update: Partial<AdminSettingRow>
        Relationships: []
      }
      departments: {
        Row: DepartmentRow
        Insert: {
          name: string
          display_name: string
          description?: string | null
          manager_id?: string | null
          company_id: string
          is_active?: boolean
        }
        Update: Partial<DepartmentRow>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
  }
}
