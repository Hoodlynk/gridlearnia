# GridLearnia Attendance & Assessment (Phase 3)

> **Status: implemented.** Two record-keeping layers on top of the SIS roster
> ([SIS.md](SIS.md)) and the academic engine ([ACADEMICS.md](ACADEMICS.md)).
> Schema reference at the end of this file; multi-tenancy basics in
> [../ARCHITECTURE.md](../ARCHITECTURE.md); roles in [RBAC.md](RBAC.md).

The roster (enrollments) says *who is in which class*. This phase records *what
happens* to them: daily attendance, and scored assessments that roll up into a
report card.

```
Enrollment ──1:N── AttendanceRecord            (present/absent per day)
    │
    └──1:N── AssessmentScore ──N:1── Assessment ── Subject
                                         │
                              banded by  └─ Class → Section → GradingScheme
```

## 1. Attendance

- **AttendanceRecord** — one enrolled student's status on a date. Keyed to the
  **enrollment** (which already fixes student + class + year); `classId` is
  denormalized so a class's day can be queried directly. Unique per
  `(enrollment, date)`, so marking a register twice updates rather than duplicates.
- **Status** ∈ `PRESENT | ABSENT | LATE | EXCUSED`.
- **Marking is idempotent bulk-upsert**: the client sends the whole register for
  a class + date; the service validates every enrollment belongs to that class,
  then upserts each row in one transaction.

**API** (gated by `attendance`):

| Endpoint | Purpose |
|---|---|
| `GET /attendance?classId=&date=` | the register: every enrolled student + their status that day (null if unmarked) |
| `PUT /attendance` | mark/replace the register (`{ classId, date, records: [{ enrollmentId, status, note? }] }`) |
| `GET /attendance/summary?classId=&from=&to=` | per-student counts by status over a date range |

## 2. Assessment

- **Assessment** — a scored exam/test for one **class + subject**, optionally in
  a **term**, with a `maxScore` (default 100). The class fixes the academic year
  (never taken from the client), mirroring the enrollment/class rules. Soft-deleted.
- **AssessmentScore** — one enrolled student's raw score for an assessment,
  unique per `(assessment, enrollment)`. Entering scores is the same bulk-upsert
  pattern as attendance, and a score above `maxScore` is rejected.
- **Bands are computed, never stored.** A student's percentage
  (`score / maxScore × 100`) is mapped at read time to a band in the **section's
  grading scheme** (Class → Grade → Section → GradingScheme → GradingBand). This
  means re-banding a scheme, or cloning/customizing it, never leaves stale letter
  grades behind — the same reason grading is a template in the academic engine.

**API** (assessments gated by `exams`, report card by `report-cards`):

| Endpoint | Purpose |
|---|---|
| `GET /assessment/assessments?classId=&academicYearId=&subjectId=&termId=` | list assessments |
| `POST /assessment/assessments` | create one for a class + subject |
| `PATCH/DELETE /assessment/assessments/:id` | update / soft-delete |
| `GET /assessment/assessments/:id/scores` | the score sheet: each student, score, %, and banded grade |
| `PUT /assessment/assessments/:id/scores` | enter/replace scores (`{ entries: [{ enrollmentId, score, remark? }] }`) |
| `GET /assessment/report-card/:enrollmentId?termId=` | a student's report card for the year (or a term) |

### Report card

`reportCard` gathers a student's scores across every (non-deleted) assessment in
the year — optionally filtered to a term — groups them **by subject**, averages
each subject's percentages, bands each subject average, then averages those into
an **overall** percentage + band. Purely derived, so it's always consistent with
the current scores and grading scheme.

## 3. RBAC — which module gates what

| Area | Permission module |
|---|---|
| Attendance (view/mark) | `attendance` |
| Assessments + scores | `exams` |
| Report card (read) | `report-cards` |

All three are on by default for a new school. Routes are `@RequireTenant()` and
use `<module>:{view|create|update|delete}`.

## 4. School-app UI

- **`Dashboard → Attendance`** — pick year + class + date, then mark each
  student **P/A/L/E** and save. Everyone defaults to present, so a register is
  one click for a normal day.
- **`Dashboard → Exams`** — a tabbed workspace:
  - **Assessments** — filter by year/class, create an assessment (class, subject,
    name, max score), and open a **score sheet** to enter marks; each row shows
    the live percentage and banded grade.
  - **Report cards** — pick a class → student and view the per-subject breakdown
    with averages and grades, plus an overall.

## 5. Demo data

`prisma/seed.ts` → `seedDemoAttendanceAndAssessment` marks one day's register for
every demo class (first student late, rest present) and creates a **Mid-Term** in
the first two subjects of each section's curriculum with a spread of scores, so
the register, score sheet and report card all render with data.

## 6. Schema reference

Delivered in `20260719000009_attendance_assessment`.

### `attendance_records`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenantId` | uuid FK→tenants | cascade |
| `enrollmentId` | uuid FK→enrollments | cascade |
| `classId` | uuid FK→classes | cascade; denormalized from enrollment |
| `date` | date | |
| `status` | `AttendanceStatus` | default `PRESENT` |
| `note` | VarChar(255)? | |
| Unique | `(enrollmentId, date)` | · index `(classId, date)`, `tenantId` |

### `assessments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenantId` | uuid FK→tenants | cascade |
| `classId` | uuid FK→classes | cascade |
| `subjectId` | uuid FK→subjects | cascade |
| `academicYearId` | uuid FK→academic_years | cascade; = the class's year |
| `termId` | uuid? FK→academic_terms | `onDelete: SetNull` |
| `name` | VarChar(100) | |
| `maxScore` | Decimal(6,2) | default 100 |
| `date` | date? | |
| `deletedAt` | timestamp? | soft-delete |

### `assessment_scores`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenantId` | uuid FK→tenants | cascade |
| `assessmentId` | uuid FK→assessments | cascade |
| `enrollmentId` | uuid FK→enrollments | cascade |
| `score` | Decimal(6,2) | raw, out of the assessment's maxScore |
| `remark` | VarChar(255)? | |
| Unique | `(assessmentId, enrollmentId)` | · index `enrollmentId`, `tenantId` |

### Enum

```prisma
enum AttendanceStatus { PRESENT  ABSENT  LATE  EXCUSED }
```

### Code map

| Concern | Location |
|---|---|
| Schema | `prisma/schema.prisma` |
| Attendance service/controller | `src/attendance/*` |
| Assessment service/controller | `src/assessment/*` |
| Band computation | `src/assessment/grading.util.ts` |
| Demo seed | `prisma/seed.ts` → `seedDemoAttendanceAndAssessment()` |
