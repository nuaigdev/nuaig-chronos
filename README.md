# ⏱️ NuAIg Chronos — Time Intelligence Platform

A professional, full-stack time tracking and project management platform built for NuAIg. Features real-time collaboration, role-based access, automated approval workflows, and rich analytics dashboards.

---

## 🧭 Table of Contents

1. [Tech Stack](#tech-stack)
2. [Features](#features)
3. [Prerequisites (Windows)](#prerequisites-windows)
4. [Step-by-Step Setup](#step-by-step-setup)
   - [Step 1: Install Prerequisites](#step-1-install-prerequisites)
   - [Step 2: Clone / Open the Project](#step-2-clone--open-the-project)
   - [Step 3: Create Supabase Project](#step-3-create-supabase-project)
   - [Step 4: Run Database Migrations](#step-4-run-database-migrations)
   - [Step 5: Configure Environment Variables](#step-5-configure-environment-variables)
   - [Step 6: Install Dependencies & Run](#step-6-install-dependencies--run)
5. [First Login & Setup](#first-login--setup)
6. [Folder Structure](#folder-structure)
7. [Role Permissions](#role-permissions)
8. [Troubleshooting](#troubleshooting)

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Styling | Tailwind CSS + CSS Variables |
| Charts | Recharts |
| Icons | Lucide React |
| Forms | React Hook Form + Zod |
| Notifications | react-hot-toast |
| Date Utils | date-fns |
| Language | TypeScript |

---

## ✨ Features

- 👤 **Role-Based Access** — Admin, Manager, Employee with full RLS
- 🏢 **Client Management** — Track clients linked to projects
- 📁 **Project Management** — Create, edit, archive with team assignment
- ✅ **Task Management** — Kanban-style board with status tracking
- ⏱️ **Time Logging** — Log hours by project & task with weekly view
- 📤 **Timesheet Submission** — Weekly timesheets with resubmit after rejection
- ✔️ **Approval Workflow** — Manager approve/reject with comments + notifications
- 📊 **Reports Dashboard** — Company, project, and timesheet analytics
- 🔔 **Real-time Notifications** — In-app with Supabase Realtime
- ⚙️ **Admin Settings** — Working hours, holiday calendar

---

## 💻 Prerequisites (Windows)

Before you start, you need the following installed on your Windows machine:

| Tool | Purpose | Required Version |
|------|---------|-----------------|
| Node.js | Runtime | 18.x or 20.x LTS |
| npm | Package manager | Comes with Node |
| Git | Version control | Any recent |
| VS Code | Code editor | Any recent |

---

## 📋 Step-by-Step Setup

### Step 1: Install Prerequisites

Open **PowerShell as Administrator** and run the following:

#### 1a. Install Node.js

Go to https://nodejs.org and download the **LTS** version (20.x recommended). Run the installer.

Verify it installed correctly:
```powershell
node --version
# Expected: v20.x.x

npm --version
# Expected: 10.x.x
```

#### 1b. Install Git

Go to https://git-scm.com/download/win and download + install Git for Windows.

Verify:
```powershell
git --version
# Expected: git version 2.x.x
```

#### 1c. Install VS Code

Go to https://code.visualstudio.com and install. Then install these recommended extensions:
- **ESLint** (dbaeumer.vscode-eslint)
- **Tailwind CSS IntelliSense** (bradlc.vscode-tailwindcss)
- **TypeScript Importer** (pmneo.tsimporter)

---

### Step 2: Clone / Open the Project

If you received this as a ZIP file, extract it. Then open PowerShell in the project folder:

```powershell
# Navigate to where you extracted the project
cd C:\Users\YourName\Downloads\nuaig-chronos

# Or open VS Code directly:
code .
```

In VS Code, open the integrated terminal with `` Ctrl+` `` (backtick).

Make sure you're in the project root (you should see `package.json`):
```powershell
ls
# Should show: package.json, src/, supabase/, etc.
```

---

### Step 3: Create Supabase Project

Supabase is your free PostgreSQL database + auth backend.

#### 3a. Create a Supabase account

1. Go to **https://supabase.com** and click **Start your project**
2. Sign up with GitHub or email
3. Click **New Project**
4. Fill in:
   - **Organization**: NuAIg (or your org)
   - **Project name**: `nuaig-chronos`
   - **Database Password**: Choose a strong password and **save it somewhere safe**
   - **Region**: Choose closest to your location (e.g., `ap-south-1` for India)
5. Click **Create new project** — wait ~2 minutes for provisioning

#### 3b. Get your API keys

1. In Supabase dashboard, go to **Settings** (gear icon) → **API**
2. Copy these two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public key** (a long JWT string starting with `eyJ...`)

Keep these handy for Step 5.

---

### Step 4: Run Database Migrations

This creates all the tables, indexes, RLS policies, and functions.

#### Method A: Supabase SQL Editor (Recommended — No CLI needed)

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New query**

**Run Migration 1** — Copy the entire contents of `supabase/migrations/001_initial_schema.sql` and paste it into the SQL editor. Click **Run** (or press `Ctrl+Enter`).

> ✅ You should see "Success. No rows returned"

**Run Migration 2** — Open a new query, copy `supabase/migrations/002_indexes_views.sql`, paste and run.

**Run Migration 3** — Open a new query, copy `supabase/migrations/003_realtime_storage.sql`, paste and run.

> 💡 If you see any errors about policies already existing, that's fine — just continue.

#### Method B: Supabase CLI (Optional, for advanced users)

```powershell
# Install Supabase CLI via npm
npm install -g supabase

# Login
supabase login

# Link to your project (get project-ref from your Supabase URL)
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

#### Verify migration success

In the Supabase dashboard, click **Table Editor** — you should see these tables:
- `profiles`
- `clients`
- `projects`
- `project_members`
- `tasks`
- `timesheets`
- `time_logs`
- `notifications`
- `holidays`
- `admin_settings`

---

### Step 5: Configure Environment Variables

In your project root, create a file called `.env.local`:

```powershell
# In PowerShell, from the project root:
Copy-Item .env.example .env.local
```

Now open `.env.local` in VS Code and fill in your values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Replace the placeholder values with your actual Supabase URL and anon key from Step 3b.

> ⚠️ **Never commit `.env.local` to Git.** It is already in `.gitignore`.

---

### Step 6: Install Dependencies & Run

```powershell
# From the project root in PowerShell:

# Install all npm packages
npm install

# Start the development server
npm run dev
```

Wait for the output:
```
▲ Next.js 14.x.x
- Local:   http://localhost:3000
- Ready in 2.1s
```

Open your browser and navigate to **http://localhost:3000**

---

## 🚀 First Login & Setup

### Create your first Admin user

1. Go to **http://localhost:3000/login**
2. Click **Sign up**
3. Enter your name, email, and password
4. Submit — you'll be redirected to the dashboard as an **employee** by default

### Promote yourself to Admin

1. In Supabase dashboard → **SQL Editor** → New query:

```sql
UPDATE profiles
SET role = 'admin'
WHERE email = 'your-email@company.com';
```

Click **Run**, then refresh your browser. You now have admin access.

### Invite Team Members

Team members can self-register at `http://localhost:3000/login` → Sign up.

After they sign up, you can change their roles in the **Team** page or via SQL:

```sql
-- Make someone a manager
UPDATE profiles SET role = 'manager', department = 'Engineering'
WHERE email = 'manager@company.com';

-- Set a manager for an employee
UPDATE profiles
SET manager_id = (SELECT id FROM profiles WHERE email = 'manager@company.com')
WHERE email = 'employee@company.com';
```

### Recommended First Steps

1. **Settings** → Configure working hours per day
2. **Settings → Holidays** → Add company holidays
3. **Clients** → Add your clients
4. **Projects** → Create projects, link to clients
5. **Tasks** → Add tasks to projects
6. **Team** → Assign roles, set manager relationships
7. **Projects** → Assign team members to projects

---

## 📁 Folder Structure

```
nuaig-chronos/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── layout.tsx                # Root layout with providers
│   │   ├── page.tsx                  # Redirects to /dashboard
│   │   ├── globals.css               # Design system & global styles
│   │   ├── login/
│   │   │   └── page.tsx              # Login/signup page
│   │   └── dashboard/
│   │       ├── layout.tsx            # Dashboard layout (sidebar + topbar)
│   │       ├── page.tsx              # Dashboard home
│   │       ├── clients/page.tsx      # Client management
│   │       ├── projects/page.tsx     # Project management
│   │       ├── tasks/page.tsx        # Task kanban board
│   │       ├── time-logs/page.tsx    # Time logging with weekly view
│   │       ├── timesheets/page.tsx   # Timesheet submission
│   │       ├── approvals/page.tsx    # Manager approval workflow
│   │       ├── team/page.tsx         # Team management
│   │       ├── reports/page.tsx      # Analytics & reports
│   │       ├── notifications/page.tsx# Notifications center
│   │       └── settings/page.tsx     # Admin settings
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   │   └── TopBar.tsx            # Top navigation bar
│   │   └── ui/
│   │       └── index.tsx             # Reusable UI components
│   ├── hooks/
│   │   ├── useAuth.tsx               # Auth context & role helpers
│   │   └── useNotifications.ts       # Real-time notifications hook
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts             # Browser Supabase client
│   │       └── server.ts             # Server Supabase client
│   ├── middleware.ts                  # Auth route protection
│   ├── types/
│   │   └── index.ts                  # All TypeScript types
│   └── utils/
│       └── index.ts                  # Helper functions
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql    # Tables, RLS, triggers
│       ├── 002_indexes_views.sql     # Indexes & SQL views
│       └── 003_realtime_storage.sql  # Realtime + storage
├── .env.example                      # Environment template
├── .env.local                        # YOUR secrets (not in git)
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🔐 Role Permissions

| Feature | Employee | Manager | Admin |
|---------|----------|---------|-------|
| View dashboard | ✅ | ✅ | ✅ |
| Log time | ✅ | ✅ | ✅ |
| Submit timesheets | ✅ | ✅ | ✅ |
| View own timesheets | ✅ | ✅ | ✅ |
| View clients | ❌ | ✅ | ✅ |
| Create/edit clients | ❌ | ✅ | ✅ |
| Create/edit projects | ❌ | ✅ | ✅ |
| Archive projects | ❌ | ✅ | ✅ |
| Create/edit tasks | ❌ | ✅ | ✅ |
| Approve timesheets | ❌ | ✅ | ✅ |
| View team | ❌ | ✅ | ✅ |
| Manage team roles | ❌ | ❌ | ✅ |
| View reports | ❌ | ✅ | ✅ |
| Admin settings | ❌ | ❌ | ✅ |
| Holiday calendar | ❌ | ❌ | ✅ |

---

## 🔧 Troubleshooting

### ❌ `npm install` fails with ERESOLVE

```powershell
npm install --legacy-peer-deps
```

### ❌ PowerShell says "execution of scripts is disabled"

Run PowerShell as Administrator and execute:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### ❌ Page shows blank / "Cannot read properties of null"

Make sure `.env.local` exists and has the correct values. Restart the dev server after editing it:
```powershell
# Stop with Ctrl+C, then:
npm run dev
```

### ❌ Supabase auth not working / "Invalid API key"

Double-check that you copied the **anon/public** key (not the service_role key) from Supabase Settings → API.

### ❌ Database migration errors

If you get "already exists" errors, that's usually safe to ignore. If a table is missing, re-run the specific migration that creates it.

### ❌ Port 3000 already in use

```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill it (replace PID with the number from above)
taskkill /PID <PID> /F

# Or run on a different port
npm run dev -- -p 3001
```

### ❌ "Module not found" errors

```powershell
# Delete node_modules and reinstall
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

---

## 🏗️ Building for Production

```powershell
# Build the production bundle
npm run build

# Start production server
npm run start
```

For deployment, consider **Vercel** (easiest for Next.js):
1. Push to GitHub
2. Go to https://vercel.com → Import project
3. Add environment variables in Vercel dashboard
4. Deploy!

---

## 📞 Support

For internal support, contact your NuAIg system administrator.

---

*Built with ❤️ for NuAIg · Powered by Next.js + Supabase*
