# GridLearnia Academic Engine — Data Model Reference

> **Status: implemented.** The precise schema behind the academic engine —
> models, fields, keys, and constraints. For the *concepts* (two axes, template
> pattern, provisioning), the *API*, and the *UI*, read
> [ACADEMICS.md](ACADEMICS.md). Source of truth is always
> [`../prisma/schema.prisma`](../prisma/schema.prisma).

Delivered in two increments:

| Phase | Migration | Adds |
|---|---|---|
| Phase 0 — structural | `20260719000005_campuses_and_modules` | `Campus`, `TenantModule`, `Tenant` localization columns |
| Phase 1 — academic | `20260719000006_academic_engine` | `Curriculum`, `Subject`, `GradingScheme`, `GradingBand`, `AcademicYear`, `AcademicTerm`, `Section`, `Grade`, `Class` |
| Phase 1 — onboarding | `20260719000007_school_request_sections` | `SchoolRequest.sections` |

## Hierarchy at a glance

```
Tenant ──1:N── Campus ──1:N── Section ──1:N── Grade ──1:N── Class ──N:1── AcademicYear
   │                              │                                          │
   │                              ├── curriculumId?  ─────► Curriculum ──1:N── Subject
   │                              └── gradingSchemeId? ───► GradingScheme ─1:N─ GradingBand
   └──1:N── AcademicYear ──1:N── AcademicTerm
```

`Curriculum` and `GradingScheme` are **templates**: `tenantId = null` rows are
shared system templates; a tenant-owned row (same `key`) is an editable clone.

---

## Phase 0 — structural

### `Tenant` (localization columns added)

| Column | Type | Notes |
|---|---|---|
| `country` | `VarChar(2)` | ISO 3166-1 alpha-2, default `KE` |
| `currency` | `VarChar(3)` | ISO 4217, default `KES` |
| `timezone` | `VarChar(60)` | IANA tz, default `Africa/Nairobi` |
| `locale` | `VarChar(10)` | BCP-47, default `en` |
| `dateFormat` | `VarChar(20)` | default `DD/MM/YYYY` |

Inherited by campuses unless overridden.

### `Campus` — physical site (`campuses`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid` FK→tenants | cascade delete |
| `name` | `VarChar(255)` | |
| `code` | `VarChar(50)` | short handle (e.g. `MAIN`) |
| `isMain` | `bool` | one main per tenant (service-enforced) |
| `status` | `CampusStatus` | `ACTIVE` \| `INACTIVE` |
| `address` / `phone` / `timezone` | nullable | optional overrides |
| `createdAt`/`updatedAt`/`deletedAt` | | soft-delete |

Constraints: `@@unique([tenantId, code])` (spans soft-deleted rows — the service
treats a deleted code as reserved), `@@index([tenantId])`.

### `TenantModule` — feature flags (`tenant_modules`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid` FK→tenants | cascade |
| `moduleKey` | `VarChar(50)` | matches `Permission.module` |
| `enabled` | `bool` | default `true` |
| `limits` | `Json` | per-module quotas/config |

Constraints: `@@unique([tenantId, moduleKey])`, `@@index([tenantId])`. Core
modules (`school-settings`, `user-management`) can never be disabled.

---

## Phase 1 — academic

### `Curriculum` (`curricula`) · template

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid?` FK→tenants | **null = system template**; set = tenant-owned |
| `key` | `VarChar(50)` | e.g. `CBC`, `8-4-4`, `IGCSE`, `IB` |
| `name` | `VarChar(150)` | |
| `country` | `VarChar(2)?` | optional origin |
| `isSystem` | `bool` | |

Constraints: `@@unique([tenantId, key])` **plus** partial unique index
`curricula_system_key_unique ON (key) WHERE tenantId IS NULL`, `@@index([tenantId])`.

### `Subject` (`subjects`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid?` | null for system subjects |
| `curriculumId` | `uuid` FK→curricula | cascade |
| `code` | `VarChar(30)` | e.g. `MATH` |
| `name` | `VarChar(150)` | |

Constraints: `@@unique([curriculumId, code])`, indexes on `curriculumId`, `tenantId`.

### `GradingScheme` (`grading_schemes`) · template

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid?` | null = system template |
| `key` | `VarChar(50)` | e.g. `PERCENTAGE`, `CBC-COMPETENCY` |
| `name` | `VarChar(150)` | |
| `type` | `GradingSchemeType` | `PERCENTAGE`\|`LETTER`\|`POINTS`\|`COMPETENCY`\|`PASS_FAIL` |
| `isSystem` | `bool` | |

Constraints: `@@unique([tenantId, key])` **plus** partial index
`grading_schemes_system_key_unique ON (key) WHERE tenantId IS NULL`.

### `GradingBand` (`grading_bands`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `schemeId` | `uuid` FK→grading_schemes | cascade |
| `label` | `VarChar(30)` | e.g. `A`, `EE`, `Pass` |
| `order` | `int` | |
| `minScore` / `maxScore` | `Decimal(5,2)?` | score range |
| `points` | `Decimal(4,2)?` | GPA value |
| `remark` | `VarChar(100)?` | e.g. `Exceeding Expectation` |

Constraints: `@@unique([schemeId, order])`.

### `AcademicYear` (`academic_years`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid` FK→tenants | cascade |
| `name` | `VarChar(50)` | e.g. `2026` |
| `startDate` / `endDate` | `date` | |
| `isCurrent` | `bool` | at most one per tenant (service-enforced) |

Constraints: `@@unique([tenantId, name])`, `@@index([tenantId])`.

### `AcademicTerm` (`academic_terms`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `academicYearId` | `uuid` FK→academic_years | cascade |
| `name` | `VarChar(50)` | Term/Semester/Quarter — count is data |
| `order` | `int` | |
| `startDate` / `endDate` | `date` | |

Constraints: `@@unique([academicYearId, order])`.

### `Section` (`sections`) — academic band

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid` FK→tenants | cascade |
| `campusId` | `uuid` FK→campuses | cascade |
| `name` | `VarChar(100)` | e.g. `Primary` |
| `order` | `int` | default 0 |
| `curriculumId` | `uuid?` FK→curricula | `onDelete: SetNull` |
| `gradingSchemeId` | `uuid?` FK→grading_schemes | `onDelete: SetNull` |
| `createdAt`/`updatedAt`/`deletedAt` | | soft-delete |

Indexes on `tenantId`, `campusId`. The `SetNull` FKs mean deleting a template
doesn't cascade-delete sections (and the service refuses deleting an in-use one).

### `Grade` (`grades`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid` FK→tenants | cascade |
| `sectionId` | `uuid` FK→sections | cascade |
| `name` | `VarChar(50)` | e.g. `Grade 1`, `Form 2` |
| `order` | `int` | progression |
| soft-delete columns | | |

### `Class` (`classes`) — stream for one year

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid` FK→tenants | cascade |
| `campusId` | `uuid` FK→campuses | derived from `grade → section → campus` |
| `gradeId` | `uuid` FK→grades | cascade |
| `academicYearId` | `uuid` FK→academic_years | cascade |
| `name` | `VarChar(50)` | e.g. `East` |
| soft-delete columns | | |

Indexes on `tenantId`, `gradeId`, `academicYearId`.

### `SchoolRequest.sections`

`String[]` (`text[]`, default `{}`) — the education bands the applicant chose at
onboarding; turned into `Section` rows on approval.

---

## Enums

```prisma
enum CampusStatus { ACTIVE  INACTIVE }
enum GradingSchemeType { PERCENTAGE  LETTER  POINTS  COMPETENCY  PASS_FAIL }
```

## Code map

| Concern | Location |
|---|---|
| Schema | `prisma/schema.prisma` |
| System templates seed | `prisma/seed.ts` → `seedAcademicTemplates()` |
| Approval provisioning | `src/school-requests/school-requests.service.ts` + `src/tenants/academic-provisioning.ts` |
| Feature-flag defaults / core set | `src/tenants/tenant-modules.constants.ts` |
| Tenant-facing services/controllers | `src/academics/*` |
| Campus management | `src/tenants/{campuses,platform-campuses}.controller.ts`, `campuses.service.ts` |
| Module toggles | `src/tenants/platform-tenant-modules.controller.ts`, `tenant-modules.service.ts` |
