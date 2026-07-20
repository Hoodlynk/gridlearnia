# GridLearnia SIS — Students, Guardians & Enrollment

> **Status: implemented.** The Student Information System (Phase 2) — concepts,
> API & UI. The precise schema (models, fields, constraints) is in
> [SIS-ENGINE.md](SIS-ENGINE.md). It sits directly on the academic engine
> ([ACADEMICS.md](ACADEMICS.md)); multi-tenancy basics live in
> [../ARCHITECTURE.md](../ARCHITECTURE.md); roles in [RBAC.md](RBAC.md).

The academic engine builds the *structure* (Section → Grade → Class per year).
The SIS puts *people* into it: students, their guardians, and the enrollment that
places a student in a class for one academic year.

## 1. The three pieces

```
Student ──< StudentGuardian >── Guardian      (who they are + who to contact)
   │
   └──< Enrollment >── Class ── AcademicYear   (where they sit, per year)
```

- **Student** — a person admitted to the school. Carries an **admission number**
  (unique within the tenant), a **home campus**, name/gender/DOB/contact, a
  `status` (`ACTIVE` / `INACTIVE` / `GRADUATED` / `TRANSFERRED` / `WITHDRAWN`),
  and an **optional link to a login `User`** (for a future student portal). Soft-deleted.
- **Guardian** — a parent/guardian, also optionally a login account. A guardian
  exists once and can be linked to several students (siblings).
- **StudentGuardian** — the link, carrying a **relationship** label ("Mother",
  "Uncle") and an **`isPrimary`** flag. Exactly one primary per student is kept
  (setting a new primary clears the others, in one transaction).
- **Enrollment** — a student in a **Class** for one **AcademicYear**, unique per
  `(student, year)`. Status tracks `ENROLLED` / `COMPLETED` / `TRANSFERRED` /
  `WITHDRAWN` with an optional roll number and exit date.

## 2. Rules enforced in services

- **The class fixes the year and the campus.** Enrollment never takes
  `campusId`/`academicYearId` from the client for placement — they're read off
  the chosen class (`grade → section → campus`, and the class's own year). The
  request's `academicYearId` must match the class's year, or it's rejected.
- **One enrollment per student per year** (DB unique). A second attempt returns a
  clear 409 rather than a raw constraint error.
- **A transfer stays within the year** — moving to a class in a different year is
  refused; a new year is a new enrollment, not an edit.
- **Tenant ownership is validated** on every referenced id (campus, class,
  guardian, student).
- **Deletes are protective**, mirroring the academic engine: a student can't be
  deleted while actively enrolled (withdraw first); a guardian can't be deleted
  while still linked to any student (unlink first).

## 3. RBAC — which module gates what

| Area | Permission module | Why |
|---|---|---|
| Students (CRUD, guardian links) | `student-records` | the student's own record |
| Guardians (directory CRUD) | `student-records` | part of the student record |
| Enrollment (enroll / transfer / withdraw) | `admissions` | admitting a student *is* an admission |

Both modules are on by default for a new school. Routes are `@RequireTenant()`
and use `student-records:{view|create|update|delete}` /
`admissions:{view|create|update|delete}`.

## 4. Tenant-facing API (`/sis/*`)

| Area | Endpoints |
|---|---|
| Students | `GET /sis/students` (`?search=&campusId=&status=`), `GET /sis/students/:id`, `POST /sis/students`, `PATCH/DELETE /sis/students/:id` |
| Guardian links | `POST /sis/students/:id/guardians` (link existing), `POST /sis/students/:id/guardians/new` (create + link), `DELETE /sis/students/:id/guardians/:guardianId` |
| Guardians | `GET /sis/guardians` (`?search=`), `POST /sis/guardians`, `PATCH/DELETE /sis/guardians/:id` |
| Enrollment | `GET /sis/enrollments` (`?academicYearId=&classId=&studentId=`), `POST /sis/enrollments`, `PATCH/DELETE /sis/enrollments/:id` |

`GET /sis/students/:id` returns the student with their guardian links (primary
first) and current (`ENROLLED`) enrollment, so the detail view is one request.

## 5. School-app UI

`Dashboard → Students` is a tabbed workspace:
- **Students** — searchable directory; admit a student (inline form); click a row
  to open the **detail view**, which edits the profile, manages **guardians**
  (create-and-link, unlink, mark primary), and shows/handles **enrollment**
  (enroll into a class for a chosen year, withdraw).
- **Guardians** — the guardian directory: search, create, edit, delete (with a
  count of how many students each is linked to).
- **Enrollment** — a **class roster**: pick a year + class and see who's enrolled;
  withdraw or remove records.

The class pickers reuse the academic-engine queries (`academics/years`,
`academics/classes`), so a school's real structure drives enrollment directly.

## 6. Provisioning & demo data

Nothing SIS-specific is created on approval — a new school starts with an empty
roster and adds students itself. The **demo school** seed (`prisma/seed.ts` →
`seedDemoRoster`) adds a handful of students, one guardian each, and enrollments
into the seeded classes of the current year, so the UI has data out of the box.

## 7. Built on top of this — Attendance & Assessment (Phase 3)

Attendance and assessment read this roster: daily registers, exams/scores, and
report cards that band against each section's grading scheme — see
[ATTENDANCE-ASSESSMENT.md](ATTENDANCE-ASSESSMENT.md). The `User` links on
`Student`/`Guardian` remain the hook for student/parent portals later.
