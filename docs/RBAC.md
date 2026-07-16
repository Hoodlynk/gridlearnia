# GridLearnia RBAC — Role & Permission Structure

School Management System role-based access control design. Each **tenant is a school**; roles below are scoped to a tenant unless marked platform-level.

> **Status: implemented** (migration `20260715223646_rbac`). Roles/permissions live in the database, seeded from the matrix in `prisma/seed.ts`; enforcement is the global `PermissionsGuard` + `@RequirePermissions()`. Not yet built: row-level scope rules (§6), clone-on-write customization (§10), audit writes.

---

## 1. Design Principles

1. **Permissions, not role checks.** Code never asks "is this user a Teacher?" — it asks "can this user `exams:update`?". Roles are just named bundles of permissions. This lets schools customize roles later without code changes.
2. **Permission = `module:action`.** e.g. `attendance:create`, `finance:approve`, `report-cards:export`.
3. **Users can hold multiple roles.** A Teacher is often also a Class Teacher and an HOD. Effective permissions = union of all their roles.
4. **Roles gate modules; scopes gate rows.** RBAC answers "can they touch Attendance at all?" Scope rules answer "which attendance records?" (a Class Teacher sees *their class*, a Parent sees *their children*). Both are enforced server-side.
5. **Tenant isolation is above RBAC.** Every query is already filtered by `tenantId`; RBAC operates inside that boundary. No role except platform Super Admin ever crosses tenants.

---

## 2. Role Catalog

### Layer 0 — Platform (GridLearnia staff, not school users)

| Role | Purpose |
|---|---|
| **SUPER_ADMIN** | Platform operator. Tenant provisioning, billing tiers, suspensions, cross-tenant support. Never appears inside a school's own user list. |

### Layer 1 — School Leadership

| Role | Purpose |
|---|---|
| **ORGANIZATION_ADMIN** | Full `manage` on **every module** within the school — the tenant-level superuser. Only a DIRECTOR can grant or revoke it (an org admin holds `user-management:manage` and could otherwise mint more org admins). |
| **DIRECTOR** (Owner) | School proprietor. Full control incl. school settings, finance visibility, user management. Maps to today's `OWNER`. |
| **PRINCIPAL** | Head of school. Full academic + operational control; view-only on settings and money movement. |
| **DEPUTY_PRINCIPAL** | Academic operations: admissions, student records, communication. View-only elsewhere. |

### Layer 2 — Administrative Staff

| Role | Purpose |
|---|---|
| **BURSAR** | Head of finance: fees, invoicing, procurement approvals. |
| **ACCOUNTANT** | Day-to-day finance entries under the Bursar. Same modules, but `approve` stays Bursar-only. |

### Layer 3 — Academic Staff

| Role | Purpose |
|---|---|
| **HOD** | Head of Department. Teacher permissions + timetable/exams management and department-wide visibility. |
| **TEACHER** | Marks attendance, enters exam scores, assigns homework, views own classes' records. |
| **CLASS_TEACHER** | Additive role on top of Teacher for one class: full student records and report cards for that class. |

### Layer 4 — Support Staff (module specialists)

| Role | Owns module |
|---|---|
| **LIBRARIAN** | Library (catalog, lending) |
| **NURSE** | Medical (health records, incidents) |
| **STOREKEEPER** | Inventory + procurement requests |
| **TRANSPORT_COORDINATOR** | Transport (routes, vehicles, assignments) |
| **HOSTEL_WARDEN** | Hostel (boarding, hostel attendance) |

### Layer 5 — Community (self-service, scope-limited)

| Role | Purpose |
|---|---|
| **PARENT** | Views own children only: records, attendance, report cards, fees, homework. Receives communication. |
| **STUDENT** | Views self only: timetable, homework, report cards, library account. |

### Suggested additions (not in the original matrix — recommend for v2)

| Role | Why |
|---|---|
| **RECEPTIONIST** | Front desk: admissions intake, visitor log, communication — without leadership access. |
| **EXAM_OFFICER** | Schools with exam departments separate exam administration (setting, moderation, publishing) from teaching. |
| **COUNSELOR** | Student welfare notes with a medical-adjacent view; keeps sensitive notes out of general teacher view. |
| **AUDITOR** | Time-boxed read-only + export over Finance for external audits. |

---

## 3. Permission Actions

Reusable actions combined with any module:

| Action | Description |
|---|---|
| `create` | Create records |
| `view` | Read records (scope rules still apply) |
| `update` | Edit records |
| `delete` | Delete/archive records |
| `approve` | Approve workflows (fee waivers, admissions, leave, procurement) |
| `export` | Export to PDF/Excel |
| `print` | Print documents |
| `manage` | Full control incl. module configuration (implies all of the above) |

---

## 4. Modules

`school-settings`, `user-management`, `admissions`, `student-records`, `staff-management`, `attendance`, `timetable`, `exams`, `report-cards`, `homework`, `finance`, `library`, `inventory`, `procurement`, `hostel`, `transport`, `medical`, `communication`, `reports-analytics`

---

## 5. Access Matrix

✅ Full (create/read/update/delete) · 👁️ Read-only or limited · ❌ None

**ORGANIZATION_ADMIN** is not shown as a column: it holds `manage` on every row.

| Module | Super Admin | Director | Principal | Deputy | Bursar | Accountant | HOD | Teacher | Class Teacher | Parent | Student | Librarian | Nurse | Storekeeper | Transport | Hostel |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| School Settings | ✅ | ✅ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| User Management | ✅ | ✅ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Admissions | ✅ | ✅ | ✅ | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Student Records | ✅ | ✅ | ✅ | ✅ | 👁️ | 👁️ | 👁️ | 👁️ | ✅ | 👁️ | 👁️ | ❌ | 👁️ | ❌ | ❌ | 👁️ |
| Staff Management | ✅ | ✅ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Attendance | ✅ | 👁️ | ✅ | 👁️ | ❌ | ❌ | 👁️ | ✅ | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Timetable | ✅ | ✅ | ✅ | 👁️ | ❌ | ❌ | ✅ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Exams | ✅ | ✅ | ✅ | 👁️ | ❌ | ❌ | ✅ | ✅ | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Report Cards | ✅ | ✅ | ✅ | 👁️ | ❌ | ❌ | ✅ | ✅ | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Homework | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | 👁️ | ✅ | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Finance | ✅ | 👁️ | 👁️ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Library | ✅ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | 👁️ | 👁️ | 👁️ | 👁️ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Inventory | ✅ | 👁️ | ❌ | ❌ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Procurement | ✅ | 👁️ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Hostel | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | 👁️ | ❌ | ❌ | ✅ |
| Transport | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Medical | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ✅ | ❌ | ❌ | 👁️ |
| Communication | ✅ | ✅ | ✅ | ✅ | 👁️ | 👁️ | 👁️ | ✅ | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Reports & Analytics | ✅ | ✅ | ✅ | 👁️ | ✅ | ✅ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ | 👁️ | 👁️ |

**Matrix refinements:**
- ✔ **Finance/procurement `approve` is Bursar-only** (implemented): Accountant's ✅ seeds as full-minus-`approve` — separation of duties: the person entering a payment shouldn't approve it.
- ☐ **Medical details should be Nurse + Counselor only** — teachers seeing full medical history is a privacy risk; give teachers an "allergy/emergency flags" view instead of `medical:view` when the module is built.

**How the matrix becomes data** (`prisma/seed.ts`): ✅ seeds as the single `manage` permission (which implies every action), 👁️ seeds as `view`, and the Accountant exception seeds as `create/view/update/delete/export/print`. Re-running the seed re-syncs system roles to the matrix and purges retired modules/roles — the seed file is the source of truth.

---

## 6. Scope Rules (row-level, applied after RBAC) — *designed, not yet implemented*

These require the academic schema (`teacher_assignments`, `guardian_links`, classes, departments). The `user_roles` table already carries optional `classId`/`departmentId` anchors for when they land.

| Role | Scope filter |
|---|---|
| Teacher | Own assigned classes/subjects (via `teacher_assignments`) |
| Class Teacher | Full access only for their assigned class |
| HOD | Own department's teachers/subjects |
| Parent | Only students linked via `guardian_links` |
| Student | Only `self` |
| Hostel Warden | Only assigned hostel(s) |
| Everyone | Only own tenant (enforced globally, before any of the above) |

A ✅ in the matrix means "full CRUD **within scope**" — a Class Teacher's ✅ on Student Records is their class, not the school.

---

## 7. Data Model — *implemented*

See `prisma/schema.prisma` (RBAC section) — the old `role` enum on users is gone, replaced by:

- **`roles`** — `tenantId NULL` = seeded system role shared by all schools; `tenantId` set = tenant-owned custom/cloned role. `@@unique([tenantId, key])` plus a **partial unique index** (`roles_system_key_unique ON (key) WHERE tenantId IS NULL`, added in raw migration SQL) — needed because Postgres treats NULLs as distinct, so the composite unique alone would allow duplicate system roles.
- **`permissions`** — the platform catalog, one row per `module` × `action`, unique on the pair.
- **`role_permissions`** — role ↔ permission join, cascade-deleted from either side.
- **`user_roles`** — user ↔ role join (**multi-role**), with optional `classId`/`departmentId` scope anchors reserved for §6.

Supporting scope tables (future, with the academic schema): `teacher_assignments` (teacher ↔ class/subject), `guardian_links` (parent ↔ student).

---

## 8. Enforcement in NestJS — *implemented*

Global guard chain: `ThrottlerGuard → JwtAuthGuard → PermissionsGuard` (registered in `app.module.ts`).

```ts
// controller (src/rbac/decorators/require-permissions.decorator.ts)
@RequirePermissions('exams:update')
@Patch('exams/:id')
updateExam(...) {}
```

- **`PermissionsGuard`** (`src/rbac/guards/permissions.guard.ts`): reads `@RequirePermissions()` metadata (all listed permissions required), resolves the user's roles → flattened permission set via `RbacService`, and checks each. `module:manage` satisfies any action on that module. Routes without the decorator only require authentication; `@Public()` routes skip auth entirely.
- **`RbacService`** (`src/rbac/rbac.service.ts`): resolution is cached in-process for **60s per user** and invalidated immediately on role assign/remove. *TODO: move the cache to Redis when scaling past one instance so revocation propagates across dynos within the TTL.*
- **JWT stays slim**: the token carries `sub` + `tenantId` + `email` only — no roles or permissions — so role changes take effect on the next request, not at token expiry. `GET /auth/me` returns the resolved `roles` and `permissions` arrays for the frontend to drive menus/buttons.
- **Registration**: `POST /auth/register` creates the school and assigns the first user DIRECTOR (requires system roles to be seeded).
- **Scope enforcement lives in services** (with §6): every service method adds the resolved scope (e.g. allowed `classIds`) to the Prisma `where` — same pattern as `tenantId` today.
- ☐ **Audit** (not yet built): every `approve`, `delete`, and `export` on Finance/Student Records should write to `audit_logs` (table already exists).

## 9. Role Administration API & Guard Rails — *implemented*

| Endpoint | Permission required |
|---|---|
| `GET /api/v1/roles` — roles visible to the school, with permissions + assignment counts | `user-management:view` |
| `GET /api/v1/roles/permissions` — platform catalog grouped by module | `user-management:view` |
| `POST /api/v1/users/:id/roles` `{ roleKey }` — assign (additive, multi-role) | `user-management:manage` |
| `DELETE /api/v1/users/:id/roles/:roleKey` — revoke | `user-management:manage` |

Guard rails, strictest first:

| Role | Rule |
|---|---|
| SUPER_ADMIN | Never assignable through the tenant API; hidden from `GET /roles`. |
| DIRECTOR | Cannot be removed from a user; DIRECTOR accounts cannot be deactivated or deleted. |
| ORGANIZATION_ADMIN | Grant **and** revoke require the acting user to hold DIRECTOR (checked uncached, so a just-revoked director can't ride the permission cache). Prevents org admins minting or stripping other org admins. |
| everything else | Anyone with `user-management:manage`. |

Seeding: `npm run prisma:seed` — idempotent; in production it seeds only roles/permissions (no demo school). Run once per environment after migrations.

## 10. Per-Tenant Customization (clone-on-write) — *designed, not yet implemented*

The schema already supports this (`Role.tenantId` + the shadowing lookup in `RbacService.resolveRole`); what's missing is the clone/edit API. Schools will be able to adjust roles **and their permissions** without affecting other tenants:

- **System roles** (`tenantId = null`) are the seeded defaults shared by all schools. They are never edited in place.
- **Editing a role clones it**: the first time a school modifies e.g. TEACHER, the role row + its `role_permissions` are copied with their `tenantId`. Edits apply to the clone only.
- **Resolution order**: a tenant-owned role with a given `key` shadows the system role with the same `key` (enforced by `@@unique([tenantId, key])`).
- **Custom roles**: schools can create new roles (e.g. "Chaplain") by assembling permissions from the platform catalog.

Fixed platform-wide, never tenant-editable:
1. The **permission catalog** (`module:action` pairs) — each permission maps to enforced code paths.
2. **Tenant isolation** — no custom role crosses `tenantId`.
3. **Grant ceiling** — a custom role may only include permissions that at least one seeded staff role holds, preventing e.g. `finance:view` being granted beyond its intended audience by accident.

(An allow/deny override table was considered instead of cloning; rejected because resolved permissions become non-literal — harder to audit and display. With clones, a role's `role_permissions` rows are exactly what it can do.)
