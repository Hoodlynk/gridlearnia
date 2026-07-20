# GridLearnia Staff & Teaching (Phase 4)

> **Status: implemented.** The staff side of a school — teachers, departments,
> and who teaches what. Schema reference at the end. Complements the SIS roster
> ([SIS.md](SIS.md)) and academic engine ([ACADEMICS.md](ACADEMICS.md));
> multi-tenancy basics in [../ARCHITECTURE.md](../ARCHITECTURE.md); roles in
> [RBAC.md](RBAC.md).

Roles (`TEACHER`, `CLASS_TEACHER`, `HOD`, …) grant *permissions*. This phase adds
the *data* that says which real person is a teacher, which department they belong
to, who leads it, and which subjects they teach in which classes.

```
Staff ──> Department (member, via Staff.departmentId)
  │           │
  │           ├── head  (Department.headId → the HOD)
  │           └── subjects (DepartmentSubject → the subjects it covers)
  │
  ├──> Class (Class.classTeacherId → the CLASS_TEACHER of a stream)
  └──> TeachingAssignment ── Class × Subject × AcademicYear (what they teach)
```

## 1. The pieces

- **Staff** — an employee (teacher or admin), with a staff number unique per
  tenant, a home campus, employment type + status, and an **optional link to a
  login `User`** (mirroring how a Student can have an account). Belongs to at most
  one **primary department**. Soft-deleted.
- **Department** — a grouping with a **Head of Department** (`headId → Staff`), a
  set of member staff (`Staff.departmentId`), and a set of covered **subjects**
  (`DepartmentSubject`). The HOD is effectively the "head of subjects" for those.
- **Class teacher** — `Class.classTeacherId` names the CLASS_TEACHER responsible
  for a stream (set/cleared via a dedicated endpoint; also surfaced on the class
  list so the academics/attendance UIs can show it).
- **TeachingAssignment** — one teacher teaching **one subject in one class for one
  academic year** (unique per `(staff, class, subject, year)`). The class fixes
  the year, mirroring enrollment/assessment rules.

## 2. Rules enforced in services

- Every referenced id (campus, department, staff, class, subject) is validated to
  belong to the caller's tenant; subjects may be tenant-owned **or** shared system
  subjects.
- **Protective deletes**: a staff member can't be deleted while they head a
  department, are a class teacher, or hold teaching assignments — reassign first.
  A department can't be deleted while it still has members.
- Two `Staff ↔ Department` relations (membership + headship) are both nullable
  with `SetNull`, so neither side deadlocks on create/delete and a removed HOD/
  member simply clears rather than cascading.

## 3. How a teacher gets onto the platform

There are **two distinct things**, and they are joined explicitly:

| | What it is | How it's created |
|---|---|---|
| **Staff profile** | the teaching record — staff number, department, assignments | created in `Dashboard → Teachers → Staff` (`POST /staff/members`) |
| **Login account** | a `User` with `tenantId` + roles, able to sign in | created by the **invitation flow** ([ONBOARDING.md](ONBOARDING.md)) |

A staff profile **does not require an account** — a school can record every
teacher, assign classes and subjects, and run attendance/exams against them
before anyone logs in. Portal access is opt-in, per person.

**The recommended flow — invite from the staff record:**

```
Add staff (Teachers → Staff)          → Staff row, userId = null
      │
      └─ "Invite"  POST /staff/members/:id/invite { email?, roleKeys }
             │       (creates a normal Invitation, tagged with this staffId)
             │
             └─ invitee registers / signs in → POST /invitations/accept
                    → gets tenantId + roles  AND  Staff.userId is set to them
```

The invitee gets a **branded invitation email** naming the school and the roles,
linking to `/onboarding?invitation=<token>` with the code pre-filled. The raw
token never appears in an API response.

Because the invitation carries `staffId`, **accepting it links the account back
to the staff profile in the same transaction** — no manual reconciliation. The
link is only ever set when the profile has no account yet, so an invite can
never steal an existing link (`Staff.userId` is unique).

**Alternatives:**
- **Link an existing user** — for accounts created before the profile (e.g.
  invited through plain user-management): `PUT /staff/members/:id/user
  { userId }`. Unlink with `{ userId: null }` to revoke the association.
- **No account at all** — leave `userId` null; everything except signing in works.

Both portal endpoints require **`staff-management:update` *and*
`user-management:manage`** (the guard ANDs required permissions), since issuing a
login invitation is a user-management action.

Note the same login rules apply as for any user: email is globally unique, a user
belongs to one school, and sign-in is the two-step email-2FA flow.

## 4. RBAC — one module

Everything here gates under **`staff-management`**
(`staff-management:{view|create|update|delete}`), on by default for a new school.
Routes are `@RequireTenant()`.

This is also the phase that gives real meaning to the long-standing
`UserRole.classId` / `UserRole.departmentId` scope anchors: with `Class` and
`Department` now first-class, a future scoped-permission rule can say "a class
teacher edits only *their* class", keyed off `Class.classTeacherId` and these
anchors.

## 5. Tenant-facing API (`/staff/*`)

| Area | Endpoints |
|---|---|
| Staff | `GET /staff/members` (`?search=&departmentId=&status=`), `GET /staff/members/:id`, `POST /staff/members`, `PATCH/DELETE /staff/members/:id` |
| Departments | `GET /staff/departments`, `POST /staff/departments`, `PATCH/DELETE /staff/departments/:id` |
| Department subjects | `POST /staff/departments/:id/subjects`, `DELETE /staff/departments/:id/subjects/:subjectId` |
| Teaching assignments | `GET /staff/teaching-assignments` (`?classId=&staffId=&academicYearId=`), `POST /staff/teaching-assignments`, `DELETE /staff/teaching-assignments/:id` |
| Class teacher | `PUT /staff/teaching-assignments/class-teacher` (`{ classId, staffId | null }`) |
| Portal access | `POST /staff/members/:id/invite` (`{ email?, roleKeys }`), `PUT /staff/members/:id/user` (`{ userId | null }`) |

## 6. School-app UI

`Dashboard → Teachers` is a tabbed workspace:
- **Staff** — searchable directory; add/edit (staff number, name, employment type,
  primary department) and delete.
- **Departments** — cards per department: set the **HOD**, add/remove **subjects**
  (from the catalogue), see member count, create/delete.
- **Teaching** — pick a year + class, set its **class teacher**, and manage the
  **teaching assignments** (assign a teacher to a subject; remove).

## 7. Demo data

`prisma/seed.ts` → `seedDemoStaff` creates three teachers, two departments
(Sciences, Languages) each with an HOD + subjects, a class teacher per demo
class, and a couple of teaching assignments per class for the current year.

## 8. Schema reference

Delivered in `20260720000010_staff_teaching` (plus `classes.classTeacherId`).

### `staff`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenantId` | uuid FK→tenants | cascade |
| `campusId` | uuid FK→campuses | cascade; home campus |
| `userId` | uuid? FK→users | `SetNull`; optional login account; unique |
| `departmentId` | uuid? FK→departments | `SetNull`; primary department |
| `staffNumber` | VarChar(50) | unique per tenant |
| `title` | VarChar(20)? | |
| `firstName`/`lastName` | VarChar(100) | · `middleName` VarChar(100)? |
| `email`/`phone` | nullable | |
| `employmentType` | `EmploymentType` | default `FULL_TIME` |
| `status` | `StaffStatus` | default `ACTIVE` |
| `joinedOn` | date? | · soft-delete columns |

### `departments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenantId` | uuid FK→tenants | cascade |
| `name` | VarChar(100) | unique per tenant |
| `code` | VarChar(30)? | |
| `headId` | uuid? FK→staff | `SetNull`; the HOD · soft-delete |

### `department_subjects` (join)
| Column | Type | Notes |
|---|---|---|
| `departmentId` | uuid FK→departments | cascade |
| `subjectId` | uuid FK→subjects | cascade |
| PK | `(departmentId, subjectId)` | |

### `teaching_assignments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenantId` | uuid FK→tenants | cascade |
| `staffId` | uuid FK→staff | cascade |
| `classId` | uuid FK→classes | cascade |
| `subjectId` | uuid FK→subjects | cascade |
| `academicYearId` | uuid FK→academic_years | cascade; = the class's year |
| Unique | `(staffId, classId, subjectId, academicYearId)` | |

### `classes` (added)
`classTeacherId uuid? FK→staff` (`SetNull`), indexed.

### Enums

```prisma
enum EmploymentType { FULL_TIME  PART_TIME  CONTRACT  VOLUNTEER }
enum StaffStatus    { ACTIVE  INACTIVE  SUSPENDED  TERMINATED }
```

### Code map

| Concern | Location |
|---|---|
| Schema | `prisma/schema.prisma` |
| Staff | `src/staff/staff.{service,controller}.ts` |
| Departments (+ subjects) | `src/staff/departments.{service,controller}.ts` |
| Teaching assignments + class teacher | `src/staff/teaching-assignments.{service,controller}.ts` |
| Module wiring | `src/staff/staff.module.ts` |
| Demo seed | `prisma/seed.ts` → `seedDemoStaff()` |
