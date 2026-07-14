# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint + Next.js lint
npm run start    # Run production server
```

There is no test suite in this project.

## Environment Setup

Requires a `.env.local` file with:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Database is Supabase (PostgreSQL). Migrations live in `supabase/migrations/` and must be run in order in the Supabase SQL Editor.

## Architecture

**Next.js 14 App Router** with Supabase as the backend (auth + database + realtime).

### Auth & Roles

`src/hooks/useProfile.tsx` is the auth hook. It provides `user`, `profile`, `company`, and role helpers (`isAdmin`, `isManager`, `isEmployee`, `canManageProjects`). It is a **plain per-component hook — there is no context and no provider**. Each component that needs user data calls `useProfile()` directly. (It replaced an older `useAuth`/`AuthProvider` pattern whose defensive guards still caused stuck spinners; do not reintroduce a provider.)

Three roles defined as a PostgreSQL ENUM: `admin | manager | employee`. These drive all access control via RLS policies on the database and conditional rendering on the frontend.

`src/middleware.ts` redirects unauthenticated users to `/login` and sends authenticated users away from `/login` to `/dashboard`.

### Data Access Pattern

Pages follow a consistent shape:
1. Call `useProfile()` for user/role context
2. Fetch data in `useEffect` via the Supabase browser client (`src/lib/supabase/client.ts`)
3. Filter by role (managers/admins see all; employees see only their own or assigned records)
4. Show loading/empty states; use `toast.error()` for failures (react-hot-toast)

Use `src/lib/supabase/server.ts` for server-side data fetching (RSC or API routes).

### Database Schema (key tables)

- `profiles` — extends `auth.users`; holds `role`, `department`, `manager_id`
- `projects` + `project_members` — projects with team assignment (employees only see projects they're assigned to)
- `task_types` — the department-scoped master list used by **timesheets** ("Code Review", "Standup"). Not the Work Board.
- `tasks` — **legacy and dormant.** Admin-only RLS, single assignee, kept alive only because `time_logs.task_id` still references it. Do not build on it; use `work_items`.
- `work_items` + `work_item_assignees` — the Work Board (see below)
- `timesheets` — weekly timesheets with approval workflow: `draft → submitted → approved/rejected`
- `time_logs` — individual time entries linked to a project + optional task
- `notifications` — consumed via Supabase Realtime in `src/hooks/useNotifications.ts`
- `admin_settings` — key-value config. Value shape is always `{ "value": <primitive> }`; uniqueness is `(company_id, key)`.

### Work Board (`/dashboard/board`)

A simple kanban: three lanes (`not_started | in_progress | done`), multiple assignees per item, and two scopes crossed with two display modes (List / Board).

- **Team scope** — pick a department; every item any of its members is assigned to, horizontally separated into one section per project.
- **Project scope** — one project, no grouping. Also embedded on `/dashboard/projects/[id]`.

Two design decisions that are easy to get wrong:

1. **`work_items` has no `department` column, on purpose.** Projects span departments, so an item has no single owning department. The team board is derived from the departments of the item's *assignees*. The consequence is that an item with **zero assignees appears on no team board** — the board header surfaces an "Unassigned" count so those don't silently vanish.
2. **Team scope is fetched in two steps** (`useWorkItems`), not one filtered join. A single `work_item_assignees!inner(...)` filtered by `user_id` would return only the *matching* assignees on each card, so an item shared across two departments would render a half-empty avatar list. Resolve the item IDs first, then fetch those items with their full assignee list.

**Access (migration 020).** Admins and managers see every department's board and may assign anyone — reaching across teams is deliberately *their* act. Employees are confined to their own department: the department picker is locked to it, and the assignee picker only lists their own teammates. This is enforced in RLS, not just the UI — `work_items` SELECT lets an employee see only items their department is on, items in projects they belong to, or items they raised themselves.

Project scope stays cross-department on purpose (projects span departments by design, so hiding co-workers there would defeat the point); an employee still only reaches projects they're a member of. Note `work_item_assignees` SELECT stays company-wide **deliberately** — a card must render its full avatar row from whichever board it's viewed on. Visibility is gated on the work item, not on the assignee rows.

Employees may create items only inside projects they belong to, and only while `board_employee_can_create` allows it. Assignees can always move their own cards between lanes.

RLS helpers are all `SECURITY DEFINER` on purpose: the `work_item_assignees` policy reads `work_items` and vice versa, so a plain `EXISTS` subquery between them would recurse.

Board settings live in `admin_settings` (Settings → Work Board): `board_employee_can_create`, `board_show_priority`, `board_archive_done_days` (hides Done items older than N days; 0 = never, nothing is deleted).

Drag-and-drop is native HTML5 with no library. Those events never fire on touch, so `useIsMobile()` swaps in a status dropdown on small screens — keep both paths working.

### UI Conventions

- Dark theme defined in `tailwind.config.ts` with custom Chronos color palette; `src/app/globals.css` holds CSS variables
- Reusable primitives live in `src/components/ui/index.tsx`
- Layout: `Sidebar` (240px, role-aware nav) + `TopBar` — both in `src/components/layout/`
- All date math uses `date-fns` with Monday-based weeks (`weekStartsOn: 1`)
- Formatting helpers (`formatDate`, `formatHours`, `getWeekRange`, `getStatusColor`, `getRoleColor`) live in `src/utils/index.ts` — use these for consistent display

### TypeScript

Path alias `@/*` resolves to `src/*`. All shared interfaces are in `src/types/index.ts`; add new types there rather than co-locating in components.

### Supabase Client Typing

The Supabase clients in `src/lib/supabase/client.ts` and `src/lib/supabase/server.ts` are created **without** a `Database` generic. Do not add `<Database>` back.

**Why**: `SupabaseClient`'s `Schema` type parameter is constrained to `never` when the provided `Database` type doesn't fully satisfy the internal `GenericSchema` requirement (which mandates `Relationships: GenericRelationship[]` on every table plus `Views` and `Functions` on the schema). A hand-written `Database` type is hard to keep compatible; without the generic, `Schema = any` and all query operations type-check cleanly.

**Pattern**: All Supabase query results are cast explicitly — `(data || []) as unknown as SomeType[]`. When selecting joined relations (e.g. `project:projects(name)`), cast via `as unknown as T` not `as T` directly, because Postgrest's column-string parser infers join columns as arrays.

**Cookie callbacks**: `setAll` in both `server.ts` and `middleware.ts` requires an explicit parameter type: `cookiesToSet: { name: string; value: string; options: CookieOptions }[]` (import `CookieOptions` from `@supabase/ssr`). TypeScript's strict mode does not infer it contextually from the overloaded `createServerClient` signature.
