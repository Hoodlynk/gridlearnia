# GridLearnia Academics — Campuses, Curricula & Structure

> **Status: implemented.** The configurable academic core — concepts, API & UI.
> The precise schema (models, fields, constraints) is in
> [ACADEMIC-ENGINE.md](ACADEMIC-ENGINE.md). Multi-tenancy basics live in
> [../ARCHITECTURE.md](../ARCHITECTURE.md); onboarding in [ONBOARDING.md](ONBOARDING.md);
> roles in [RBAC.md](RBAC.md).

The platform is built to be **configurable, not Kenya/CBC-specific**. Education
levels, curricula, grading, and calendars are all data. This doc covers the two
axes (location vs. academic band) and the template engine.

## 1. Two axes, one hierarchy

```
Tenant (organization)        the school as a business/legal entity
  └── Campus                 a physical site  ("Nairobi Campus")   ← WHERE
        └── Section          an academic band ("Primary")          ← WHICH STAGE
              └── Grade       a year level     ("Grade 4")
                    └── Class  a stream        ("Grade 4 East", per academic year)
```

- **Campus = location.** Every tenant gets one auto-created **Main Campus** on
  approval; single-site schools never think about it, multi-site schools add
  more. Operational rows (class, and later enrollment/attendance) carry
  `campusId` so the split is never a painful retrofit.
- **Section = education band** (Pre-Primary / Primary / Junior Secondary /
  Senior Secondary / …). This is where "primary vs. secondary" is modeled — not
  as separate campuses. A campus can host several sections.

**The same schema covers every layout** — combined one-compound school,
multi-campus school, or separate primary/secondary schools — differing only in
how many Campus/Section rows exist. Nothing branches in code. A school that runs
primary + secondary as truly separate entities simply submits two school
requests (two tenants); a school group view over multiple tenants would be a thin
future `OrganizationGroup` parent.

## 2. Feature flags & localization (Phase 0)

- **`TenantModule`** — one row per (tenant, module) with `enabled` + `limits`
  JSON. `moduleKey` matches `Permission.module`, so a permission only takes
  effect while its module is enabled. Seeded for the full catalogue on approval;
  a curated default set is on, add-ons start off.
- **Core modules** — `school-settings`, `user-management` can never be disabled
  (enforced in `TenantModulesService`; the console renders their toggle locked
  and `list()` forces them enabled even if a stale row said otherwise).
- **Localization** — `country`, `currency`, `timezone`, `locale`, `dateFormat`
  are flat columns on `Tenant` (Kenya-first defaults), optionally overridden per
  campus.

Managed from the **command center**: per-school campus CRUD
(`/platform/tenants/:id/campuses`) and module toggles
(`/platform/tenants/:id/modules`).

## 3. Template engine — curricula & grading

Curriculum/Subject and GradingScheme/GradingBand reuse the **Role template
pattern**:

- A **system template** has `tenantId = null` and is shared by every school
  (read-only to tenants).
- A school **adopts** (clones) a template to get a tenant-owned, editable copy
  with the same `key`; `@@unique([tenantId, key])` plus a partial unique index
  (`... WHERE tenantId IS NULL`) lets the shared `CBC` and a tenant's `CBC` copy
  coexist while system keys stay globally unique.

Seeded system content (`prisma/seed.ts`, runs in production too):

| Curricula | Grading schemes |
|---|---|
| CBC, 8-4-4, IGCSE, IB (each with starter subjects) | Percentage, CBC-Competency (EE/ME/AE/BE), KCSE 12-point letter, 4.0 GPA (each with bands) |

`GradingScheme.type` ∈ `PERCENTAGE | LETTER | POINTS | COMPETENCY | PASS_FAIL`;
bands carry `label`, `order`, optional `minScore`/`maxScore`/`points`/`remark`.

## 4. Provisioning on approval

Approving a school request creates, in **one transaction**: the tenant, its
**Main Campus**, the **module catalogue** (default on/off), a **current
academic year + default terms**, the applicant's chosen **sections** (from the
onboarding structure-picker), and the ORGANIZATION_ADMIN binding. Sections are
created without a curriculum/grading assignment — the school sets those later.

## 5. Tenant-facing API (`/academics/*`)

All routes are `@RequireTenant()` and gated by `school-settings:{view|create|update|delete}`.

| Area | Endpoints |
|---|---|
| Academic years | `GET/POST /academics/years`, `PATCH/DELETE /academics/years/:id`, `PUT /academics/years/:id/terms`, `POST /academics/years/:id/set-current` |
| Sections | `GET/POST /academics/sections`, `PATCH/DELETE /academics/sections/:id` |
| Grades | `GET/POST /academics/grades` (`?sectionId=`), `PATCH/DELETE /academics/grades/:id` |
| Classes | `GET/POST /academics/classes` (`?academicYearId=&gradeId=`), `PATCH/DELETE /academics/classes/:id` |
| Catalog (read) | `GET /academics/catalog/curricula`, `GET /academics/catalog/grading-schemes` (system + own) |
| Curricula (write) | `POST /academics/curricula/clone`, `POST /academics/curricula`, `PATCH/DELETE /academics/curricula/:id`, `POST/PATCH/DELETE /academics/curricula/:id/subjects[/:subjectId]` |
| Grading (write) | `POST /academics/grading-schemes/clone`, `POST /academics/grading-schemes`, `PATCH/DELETE /academics/grading-schemes/:id`, `PUT /academics/grading-schemes/:id/bands` |
| Campuses (read) | `GET /campuses` — the school's own campuses (for the section picker) |

**Safety rules enforced in services**
- Every referenced id (campus, curriculum, grading, section, grade, year) is
  verified to belong to the caller's tenant, or to be a shared system template.
- A Class's campus is derived from `grade → section → campus`, never from the client.
- Writes to curricula/grading only match **tenant-owned** rows, so system
  templates are read-only to schools.
- Deletes are refused while children/assignments exist (a year with classes, a
  section with grades, a grade with classes, a curriculum/scheme assigned to a
  section) instead of cascading silently.

## 6. School-app UI

`Dashboard → Academics` is a tabbed workspace:
- **Academic years** — create (with terms), set current, delete.
- **Structure** — sections (create/edit/delete with campus + curriculum +
  grading pickers) → grades (add/rename/reorder/delete) → classes per selected
  year (add/rename/delete), as a lazy-loading drilldown.
- **Templates** — curricula & grading: adopt (clone), create from scratch,
  rename, delete; subjects add/rename/remove; a full bands editor. Anything
  created here appears in the Structure pickers (shared `Catalog` cache tag).

## 7. Built on top of this — the SIS (Phase 2)

`Student`, `Guardian`, and `Enrollment` (student ↔ class ↔ academic year) turn
this structure into a roster — see [SIS.md](SIS.md) (concepts, API & UI) and
[SIS-ENGINE.md](SIS-ENGINE.md) (schema). `UserRole` already carries optional
`classId`/`departmentId` scope anchors for the RBAC scope rules that will follow.
