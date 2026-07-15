# Plan: Work Item detail page + comments

**Status:** ✅ Implemented (migrations 021–023). Detail page at
`/dashboard/board/[id]`, comments in `work_item_comments`. The decisions below
resolved as: edit stays in `WorkItemModal` (page is view + discuss); no activity
trail yet; comments editable by author with an "edited" tag. The
`can_view_work_item` extraction was done as specified.
**Depends on:** Work Board (migrations 018–020), already live.

Clicking a card on the Work Board opens a page for that item, where the team can
discuss it. Two deliverables: the page itself, and a comment thread on it.

---

## Where things stand today

Facts worth knowing before starting, so nobody re-derives them:

- The board lives at `/dashboard/board` (`src/app/dashboard/board/page.tsx`), with
  the project-scoped board also embedded on `/dashboard/projects/[id]`.
- Cards (`src/components/board/WorkItemCard.tsx`) currently have **no click
  handler on the card body**. The only actions are a pencil (opens
  `WorkItemModal`) and a trash icon. The card *is* `draggable`.
- All data access goes through `src/hooks/useWorkItems.tsx`.
- **Every Work Board notification already stores `related_id` = the work item's
  id** — but `src/app/dashboard/notifications/page.tsx` contains **no links at
  all**. Nothing in it is clickable. So "You were assigned to X" is currently a
  dead end: the user has to go find X themselves.
- There is no comments table, and no audit/activity table, anywhere in the schema.

That last notification point is the quiet win here. A work item page makes every
existing Work Board notification actionable, with **zero schema change**. It is
arguably worth as much as the comments feature.

---

## 1. Schema — one new table

```sql
work_item_comments
  id            UUID PK
  work_item_id  UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE
  user_id       UUID NOT NULL REFERENCES profiles(id)
  body          TEXT NOT NULL CHECK (length(trim(body)) > 0)
  edited_at     TIMESTAMPTZ          -- NULL until edited; drives an "edited" tag
  company_id    UUID NOT NULL REFERENCES companies(id)
  created_at    TIMESTAMPTZ
  updated_at    TIMESTAMPTZ
```

Plumbing, all of which has an existing precedent in migration 019:

- Index on `work_item_id` (the hot path — fetching a thread).
- `update_updated_at_column` trigger.
- A `company_id` auto-fill trigger. Note `auto_set_company_id()` reads
  `NEW.user_id`, which this table **does** have — so unlike `work_items` (which
  has `created_by` and needed the `auto_set_company_id_from_creator` variant),
  this table can reuse the original function directly.
- Add to the `supabase_realtime` publication, so an open thread streams live.

---

## 2. The important bit: do NOT copy the visibility rule

Migration 020 put a non-trivial predicate in the `work_items` SELECT policy. An
employee may see an item if **any** of these hold:

- they are an admin or manager (unrestricted), **or**
- their own department is on the item
  (`work_item_has_assignee_in_department`), **or**
- they are a member of its project (`is_project_member`), **or**
- they created it.

Comments must obey **exactly** that rule. If an employee can read the discussion
on an item they cannot see, the department restriction added in 020 is quietly
undone — the content just leaks through the comments instead of the board.

**So: extract that predicate into a `can_view_work_item(p_work_item_id, p_user_id)`
`SECURITY DEFINER STABLE` function, and have BOTH the `work_items` SELECT policy
and the new `work_item_comments` SELECT policy call it.**

Do this refactor **as part of this feature, not after**. If the predicate is
instead copy-pasted into the comments policy, the two copies will drift the first
time the access rules change, and the drift will be silent — no error, just an
employee reading something they should not.

(All the RLS helpers are `SECURITY DEFINER` on purpose: the
`work_item_assignees` policy reads `work_items` and vice versa, so a plain
`EXISTS` subquery between them would recurse. Keep that up.)

### Comment policies

| Action | Who |
|---|---|
| SELECT | anyone where `can_view_work_item(work_item_id, auth.uid())` |
| INSERT | same, and `user_id = auth.uid()` |
| UPDATE | author only (sets `edited_at`) |
| DELETE | author, or any admin/manager (moderation) |

---

## 3. The page

Route `/dashboard/board/[id]`, mirroring `/dashboard/projects/[id]`. Same shape as
that page: fetch by id, loading and not-found states, `useProfile()` for role.

Content: title, description, status, priority, due date, project + client (linking
back to the project), assignee list, who raised it and when — then the comment
thread.

Reuse the existing per-item permission helpers rather than reinventing them; they
already exist in both `board/page.tsx` and `projects/[id]/page.tsx`
(`canEditItem` = manager/admin, creator, or assignee; `canDeleteItem` =
manager/admin or creator). **Worth lifting those into a shared helper while here**,
since a third copy on this page is exactly how they start to disagree.

---

## 4. Notifications

- New `notification_type` enum value: `work_item_commented`. Remember the
  migration-018 lesson: **`ALTER TYPE ... ADD VALUE` must be in its own migration
  file**, run before anything that references the new value, because Postgres only
  makes a new label visible to *subsequent* transactions.
- On a new comment, notify the item's assignees and its creator, minus whoever
  wrote the comment. `createNotification` in `src/utils/index.ts` already does the
  insert; `notifyAssignees` in `useWorkItems.tsx` already does the
  "everyone except me" filter — copy that shape.
- **Make the notifications page clickable.** `related_id` is already populated for
  every Work Board notification. Link the Work Board types to
  `/dashboard/board/[related_id]`. This is a small edit to
  `notifications/page.tsx` and it is the highest value-per-line change in the
  whole plan.

---

## 5. Gotchas

**Card click fights with card drag.** Cards are `draggable`. Adding a
click-to-open handler to the card body means a slightly sloppy drag can register
as a click and navigate away mid-move — infuriating to hit, easy to prevent.
Record the pointer position on mousedown and only treat it as a click if it moved
less than ~5px. Must be deliberate; it will not fall out for free.

**Two places to edit the same fields.** The pencil currently opens `WorkItemModal`.
Once a real page exists, having both is the kind of duplication that rots.
Recommendation: **keep the modal for _create_** (it is a good quick-capture flow)
and **move _editing_ onto the page** as inline fields. Decide this before
building, not during.

**Mentions are a trap — leave them out of v1.** "Comment on a work item" is small.
"@mention a teammate and notify them" drags in autocomplete, a mention
storage/parse format, a notification type, and an awkward interaction with the
department rules (may an employee @mention someone from another team, when they
cannot even assign one?). Ship plain comments; notify assignees + creator on every
comment. That covers the actual need.

**Deleting a work item** cascades its comments (`ON DELETE CASCADE`). That is
intended, but it means deletion is now more destructive than it was — the confirm
dialog should probably say so once a thread can exist.

---

## 6. Optional: activity trail

An audit table was deliberately left out of the Work Board v1. This page is its
natural home if the "who moved this to Done, and when?" question turns out to
matter. A `work_item_events` table (actor, verb, from/to, timestamp) rendered
inline with the comments as a single chronological feed is the usual shape.

Not required for this feature. Decide separately — it is a real ongoing write cost
on every drag.

---

## 7. Build order

1. Migration: `can_view_work_item` extraction (repoint the `work_items` policy at
   it) + `work_item_comments` table, RLS, realtime.
2. Migration: the `work_item_commented` enum value (its own file, as above).
3. Types in `src/types/index.ts` (`WorkItemComment`, DB row, `Database` entry) —
   remember all Supabase results are cast `as unknown as T`.
4. `useWorkItemComments` hook: fetch, post, edit, delete, realtime.
5. The `/dashboard/board/[id]` page.
6. Make the card body navigate (with the drag-vs-click guard).
7. Make notifications clickable.
8. Fold the edit modal into the page per the decision above.

Roughly: 2 migrations, 1 route, 1 hook, 2–3 components, plus small edits to
`WorkItemCard.tsx` and `notifications/page.tsx`. Comparable in size to the
original board, but lower risk — the hard architectural calls are already made.

---

## Open decisions for the next session

1. Edit inline on the page, or keep the modal? (Recommendation: page.)
2. Activity trail — in or out? (Recommendation: out for now.)
3. Should a comment be editable at all, or append-only? (Recommendation: editable
   by the author, with an "edited" tag — hence `edited_at`.)
