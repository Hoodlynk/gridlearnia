# GridLearnia SIS — Data Model Reference

> **Status: implemented.** The precise schema behind the Student Information
> System — models, fields, keys, and constraints. For the *concepts*, the *API*,
> and the *UI*, read [SIS.md](SIS.md). The academic models it builds on are in
> [ACADEMIC-ENGINE.md](ACADEMIC-ENGINE.md). Source of truth is always
> [`../prisma/schema.prisma`](../prisma/schema.prisma).

Delivered in one migration:

| Phase | Migration | Adds |
|---|---|---|
| Phase 2 — SIS | `20260719000008_sis` | `Student`, `Guardian`, `StudentGuardian`, `Enrollment` + enums `Gender`, `StudentStatus`, `EnrollmentStatus` |

## Hierarchy at a glance

```
Tenant ──1:N── Student ──N:M (StudentGuardian)── Guardian
   │              │
   │              └──1:N── Enrollment ──N:1── Class ──N:1── AcademicYear
   │                            └──────────── Campus (denormalized from Class)
   └──1:N── Guardian
```

`Student.userId` / `Guardian.userId` optionally link a login `User` (both unique,
`onDelete: SetNull`). `campusId` is denormalized onto `Student` and `Enrollment`
so campus-scoped queries never walk the whole hierarchy.

---

## `Student` (`students`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid` FK→tenants | cascade delete |
| `campusId` | `uuid` FK→campuses | cascade; home campus |
| `userId` | `uuid?` FK→users | `onDelete: SetNull`; optional login account |
| `admissionNumber` | `VarChar(50)` | unique within the tenant |
| `firstName` / `lastName` | `VarChar(100)` | |
| `middleName` | `VarChar(100)?` | |
| `gender` | `Gender?` | |
| `dateOfBirth` | `date?` | |
| `status` | `StudentStatus` | default `ACTIVE` |
| `email` / `phone` / `address` | nullable | contact |
| `photoKey` | `VarChar(500)?` | storage key in Spaces |
| `admittedOn` | `date?` | |
| `createdAt`/`updatedAt`/`deletedAt` | | soft-delete |

Constraints: `@@unique([tenantId, admissionNumber])`, `@@unique([userId])`,
indexes on `tenantId`, `campusId`.

## `Guardian` (`guardians`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid` FK→tenants | cascade |
| `userId` | `uuid?` FK→users | `onDelete: SetNull`; optional login account |
| `firstName` / `lastName` | `VarChar(100)` | |
| `phone` | `VarChar(30)` | required |
| `email` | `VarChar(255)?` | |
| `occupation` | `VarChar(120)?` | |
| `address` | `Text?` | |
| `createdAt`/`updatedAt`/`deletedAt` | | soft-delete |

Constraints: `@@unique([userId])`, `@@index([tenantId])`.

## `StudentGuardian` (`student_guardians`) — join

| Column | Type | Notes |
|---|---|---|
| `studentId` | `uuid` FK→students | cascade |
| `guardianId` | `uuid` FK→guardians | cascade |
| `relationship` | `VarChar(50)` | "Mother", "Father", "Uncle" |
| `isPrimary` | `bool` | default false; one primary/student (service-enforced) |
| `createdAt` | | |

Primary key: `@@id([studentId, guardianId])`; indexes on both FKs.

## `Enrollment` (`enrollments`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenantId` | `uuid` FK→tenants | cascade |
| `studentId` | `uuid` FK→students | cascade |
| `classId` | `uuid` FK→classes | cascade |
| `academicYearId` | `uuid` FK→academic_years | cascade; must equal the class's year |
| `campusId` | `uuid` FK→campuses | derived from `class → grade → section → campus` |
| `rollNumber` | `VarChar(20)?` | position/number in the class |
| `status` | `EnrollmentStatus` | default `ENROLLED` |
| `enrolledOn` | `timestamp` | default now |
| `exitedOn` | `timestamp?` | set on withdraw/transfer |
| `createdAt`/`updatedAt` | | |

Constraints: `@@unique([studentId, academicYearId])` (one enrollment per student
per year), indexes on `tenantId`, `classId`, `academicYearId`.

---

## Enums

```prisma
enum Gender { MALE  FEMALE  OTHER }
enum StudentStatus { ACTIVE  INACTIVE  GRADUATED  TRANSFERRED  WITHDRAWN }
enum EnrollmentStatus { ENROLLED  COMPLETED  TRANSFERRED  WITHDRAWN }
```

## Code map

| Concern | Location |
|---|---|
| Schema | `prisma/schema.prisma` |
| Demo roster seed | `prisma/seed.ts` → `seedDemoRoster()` |
| Students service/controller | `src/sis/students.{service,controller}.ts` |
| Guardians service/controller | `src/sis/guardians.{service,controller}.ts` |
| Enrollment service/controller | `src/sis/enrollments.{service,controller}.ts` |
| Module wiring | `src/sis/sis.module.ts` (registered in `src/app.module.ts`) |
| DTOs | `src/sis/dto/*` |
