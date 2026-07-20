# GridLearnia — System Architecture

> **Status: describes the implemented system** (last updated 2026-07-20;
> includes SIS — Phase 2, Attendance & Assessment — Phase 3, Staff & Teaching —
> Phase 4, and Timetable setup — Phase 5a).
> Deep dives live in [docs/RBAC.md](docs/RBAC.md) (roles & permissions),
> [docs/ONBOARDING.md](docs/ONBOARDING.md) (users, schools, invitations),
> [docs/ACADEMICS.md](docs/ACADEMICS.md) (campuses, curricula, structure — concepts,
> API & UI), [docs/ACADEMIC-ENGINE.md](docs/ACADEMIC-ENGINE.md) (the academic
> data-model reference), [docs/SIS.md](docs/SIS.md) (students, guardians,
> enrollment — concepts, API & UI), [docs/SIS-ENGINE.md](docs/SIS-ENGINE.md)
> (the SIS data-model reference), and
> [docs/ATTENDANCE-ASSESSMENT.md](docs/ATTENDANCE-ASSESSMENT.md) (attendance,
> exams, scores & report cards), and
> [docs/STAFF-TEACHING.md](docs/STAFF-TEACHING.md) (staff, departments, HODs &
> teaching assignments), and [docs/TIMETABLE.md](docs/TIMETABLE.md) (school day,
> rooms, lesson loads, readiness & the scheduling engine's design).

GridLearnia is a **multi-tenant School Management platform**. Each tenant is an
education organization (a school); platform staff operate across schools through
a separate admin console. The design goal is a *configurable platform*, not a
single-country/single-curriculum system: education levels, curricula, grading,
calendars, fees, and modules are all data, not hardcoded.

## Repositories

| Repo | What it is |
|---|---|
| `gridlearnia` | Backend REST API — NestJS 11 on Fastify, Prisma, Supabase PostgreSQL |
| `gridlearnia-frontend` | School app (tenant-facing) — Next.js 16 **Pages Router**, Redux Toolkit Query |
| `gridlearnia-commandcenter-frontend` | Platform admin console — Next.js 16 **App Router**, Redux Toolkit Query |

Both frontends use the **BFF pattern**: Next.js routes proxy to the backend and
own the httpOnly auth cookies; the browser never sees `API_URL` or the tokens.

---

## 1. Technology Stack

**Backend**
- **NestJS 11 + Fastify** — modular DI framework on the faster HTTP adapter
- **Prisma 5** ORM → **Supabase PostgreSQL** (eu-west-1)
- **JWT auth** (`@nestjs/jwt`): 15m access + 7d refresh, HS256, separate secrets;
  a third **derived** secret (`jwt.secret + ".2fa"`) signs short-lived login
  challenge tokens so they can never pass as access/refresh tokens
- **class-validator** DTOs behind a global `ValidationPipe` (whitelist + forbid unknown)
- **Mailgun HTTP API** for transactional email (`MailService`, fire-and-forget)
- **DigitalOcean Spaces** (S3-compatible) for KYC document storage — private
  bucket, server-side upload, short-lived presigned download URLs
- **Swagger** at `/docs`
- Deploy target: **Heroku** (`Procfile`: release runs `prisma migrate deploy`) — use the **EU region** to sit near the database

**Frontends**
- **Next.js 16**, React 19, Tailwind v4 (charcoal + lime tokens; the command
  center runs a dark theme)
- **Redux Toolkit + RTK Query** for all data fetching (tag-based cache invalidation)
- **BFF**: Next routes proxy to the backend, attach the bearer token server-side,
  perform a one-shot refresh on 401, and forward the real client IP
- School app uses the **Pages Router** (`src/pages`, `pages/api/*` proxies);
  command center uses the **App Router** (`src/app`, Route Handlers)
- Feature-based structure blended with Atomic Design (see §8)

---

## 2. Multi-Tenancy & Organization Model

**Shared schema, tenant column.** One PostgreSQL database; every tenant-owned
row carries `tenantId` (uuid, indexed). Rationale: thousands of schools on one
operationally simple database; per-tenant cost ≈ zero; cross-tenant analytics
possible; isolation enforced in the service layer (RLS remains available as a
future defense-in-depth backstop).

**Organization hierarchy** (two independent axes — location vs. academic band):

```
Tenant (organization)        the school as a business/legal entity
  └── Campus                 a physical site; a "Main Campus" is auto-created
        └── Section          an academic band: Pre-Primary / Primary / Secondary …
              └── Grade       a year level: Grade 1, Form 2, PP1 …
                    └── Class  a stream of students for one academic year
```

Campus answers "*which site?*"; Section answers "*which stage of schooling?*" —
primary vs. secondary is a **Section**, never a campus. The same tables cover a
one-compound combined school, a multi-site school, and separate primary/secondary
schools — the only difference is how many Campus/Section rows exist. See
[docs/ACADEMICS.md](docs/ACADEMICS.md).

**Localization** lives as flat columns on `Tenant` (`country`, `currency`,
`timezone`, `locale`, `dateFormat`; Kenya-first defaults), inherited by campuses
unless overridden — everything downstream reads these instead of hardcoding.

**Feature flags** are a table, `TenantModule` (one row per tenant × module,
`enabled` + `limits`). `moduleKey` matches `Permission.module`, so a permission
is only *live* when its module is enabled. A short **core set**
(`school-settings`, `user-management`) is non-disableable, enforced in the
service and shown as a locked toggle in the console.

Key identity decisions:
- **Emails are globally unique** — login is platform-level (`email + password`, no subdomain)
- **`User.tenantId` is nullable** — a registered user with no school yet is a
  *platform-level user* with zero roles ⇒ zero permissions
- One school per user (multi-school membership deliberately deferred; would
  become a `memberships` join table)

Tenant context is resolved **server-side from the JWT subject on every
request** — never from client input — and attached to the request by the auth
guard. Services scope every query with it.

---

## 3. Request Pipeline

Global guard chain (order matters), then envelope shaping:

```
IpRateLimitGuard   token bucket per IP — rejects abuse before any auth/DB work
      ↓
JwtAuthGuard       verifies bearer token, loads user (+tenant), blocks
                   inactive accounts and suspended/cancelled tenants;
                   @Public() routes skip
      ↓
EmailVerifiedGuard @RequireVerifiedEmail() routes 403 until the email is confirmed
      ↓
TenantGuard        @RequireTenant() routes 403 for platform-level users
      ↓
SuperAdminGuard    @RequireSuperAdmin() routes require the SUPER_ADMIN role
      ↓
PermissionsGuard   @RequirePermissions('module:action') — resolves the user's
                   flattened permission set (60s in-process cache, invalidated
                   on role change); `module:manage` implies every action
      ↓
handler → TransformInterceptor        → { success: true, data }
        ↘ AllExceptionsFilter (errors) → { success: false, message, errors? }
```

**Response envelope** (all endpoints):
```json
{ "success": true,  "data": { } }
{ "success": false, "message": "Invalid email or password" }
{ "success": false, "message": "Invalid input data", "errors": ["email must be an email"] }
```

**Request IDs**: every response carries `x-request-id` (reused from Heroku's
router header when valid, otherwise a fresh UUID; inbound values are validated
so log injection isn't possible). Error logs include the ID, method, path,
status, user, tenant, and IP.

---

## 4. Authentication & Two-Factor Login

Login is a **two-step, email-second-factor** flow (both the school app and the
admin console):

1. `POST /auth/login` (or `/auth/admin/login`) verifies credentials, resets the
   brute-force counter, emails a **6-digit code**, and returns a
   `{ twoFactorRequired, challengeToken, email (masked), expiresInMinutes }`
   challenge — **no tokens yet**. The challenge JWT carries the `portal`
   (`school` / `admin`) and is signed with the derived 2FA secret.
2. `POST /auth/2fa/verify` exchanges `challengeToken + code` for the real
   access/refresh tokens. It re-runs the account/tenant/role gates and
   re-enforces the console split (a school challenge can never mint an admin
   session). Codes: **10-minute TTL, single-use, 5 attempts**, SHA-256-hashed
   at rest (`login_two_factor_codes`). `POST /auth/2fa/resend` issues a new one.

Other auth endpoints: `register`, `refresh`, `verify-email`, `resend-verification`,
`forgot-password`, `reset-password`, `me`. Verification and reset use single-use,
SHA-256-hashed, time-boxed tokens delivered by email; the reset response is
generic to avoid account enumeration.

Full identity/onboarding + RBAC: [docs/ONBOARDING.md](docs/ONBOARDING.md) ·
[docs/RBAC.md](docs/RBAC.md).

- **Onboarding**: registration creates a platform user (no school, no roles).
  A school is created only when **SUPER_ADMIN approves a school request** — one
  transaction that creates the tenant, its **Main Campus**, the module
  catalogue, a default **academic year + terms**, the applicant's chosen
  **sections**, and binds the requester as **ORGANIZATION_ADMIN**. Existing
  schools grow via **invitations** (single-use, 7-day, SHA-256-hashed tokens
  carrying pre-assigned roles).
- **RBAC**: permissions are `module:action` strings; roles are seeded bundles
  (17 system roles); users hold **multiple roles** (union of permissions).
  Tokens are slim (`sub`, `tenantId`, `email`) — permissions resolve
  server-side, so revocation is effectively immediate.

---

## 5. Academic Engine

The configurable core (details: [docs/ACADEMICS.md](docs/ACADEMICS.md)):

- **Curriculum + Subject** and **GradingScheme + GradingBand** use the same
  **template pattern as Roles**: a system row (`tenantId = null`) is shared by
  every school; a school that customizes gets a tenant-owned copy with the same
  key. A partial unique index keeps system keys globally unique (Postgres treats
  NULLs as distinct). Seeded system templates: **CBC, 8-4-4, IGCSE, IB** and
  grading schemes **Percentage, CBC-Competency, KCSE 12-point, 4.0 GPA**.
- **AcademicYear + AcademicTerm** — the calendar. Term count is data (2
  semesters / 3 terms / 4 quarters all fit), not a hardcoded assumption; one
  year is `isCurrent` per tenant.
- **Section → Grade → Class** — the school's structure; a Section carries its
  own curriculum + default grading scheme (primary and secondary commonly
  differ). A Class is a stream in a grade for a given academic year; its campus
  is derived from the grade's section, never taken from the client.
- **Tenant-facing API** (`/academics/*`, gated by `school-settings` permissions):
  years/terms, sections, grades, classes, a read-only **catalog** (system + own
  templates) for the pickers, and **adopt-clone-customize** of curricula
  (+subjects) and grading (+bands). All references are validated to belong to the
  caller's tenant (or be a shared system template); deletes are refused while
  children/assignments exist, rather than cascading silently.

---

## 6. Student Information System (SIS)

The roster layer on top of the academic engine (details:
[docs/SIS.md](docs/SIS.md), schema: [docs/SIS-ENGINE.md](docs/SIS-ENGINE.md)):

- **Student** — a person admitted to a school, with an admission number unique
  per tenant, a home campus, and an optional link to a login `User`. Soft-deleted.
- **Guardian + StudentGuardian** — parents/guardians and the many-to-many that
  ties them to students, each link carrying a `relationship` label and an
  `isPrimary` flag (exactly one primary is enforced in the service).
- **Enrollment** — a student joined to a Class for one academic year (unique per
  `(student, year)`). The class fixes both the year and the campus — neither is
  taken from the client — so an enrollment can't drift to the wrong site or year;
  a transfer stays within the same year.
- **Tenant-facing API** (`/sis/*`): students gate under `student-records`,
  guardians under `student-records`, and enrollment under `admissions` (admitting
  a student *is* an admission). Deletes are refused while a student is actively
  enrolled or a guardian is still linked, mirroring the academic engine's rules.

---

## 7. Attendance & Assessment

Record-keeping on top of the roster (details:
[docs/ATTENDANCE-ASSESSMENT.md](docs/ATTENDANCE-ASSESSMENT.md)):

- **AttendanceRecord** — one enrolled student's `PRESENT|ABSENT|LATE|EXCUSED`
  status on a date, keyed to the enrollment (unique per `(enrollment, date)`).
  Marking a class register is an idempotent bulk-upsert; a summary endpoint gives
  per-student counts over a range. Gated by `attendance`.
- **Assessment + AssessmentScore** — a scored exam/test for a class + subject in
  a term (the class fixes the year), and each enrolled student's raw score
  (unique per `(assessment, enrollment)`, capped at `maxScore`). Gated by `exams`.
- **Bands are computed at read time**, never stored: a percentage is mapped to a
  band in the **section's grading scheme** (Class → Section → GradingScheme), so
  re-banding or cloning a scheme never leaves stale grades. The **report card**
  (`report-cards`) aggregates a student's scores by subject → subject averages →
  overall, banding each level — purely derived.

---

## 8. Staff & Teaching

The staff side of a school (details:
[docs/STAFF-TEACHING.md](docs/STAFF-TEACHING.md)):

- **Staff** — an employee (teacher/admin), staff number unique per tenant, home
  campus, optional link to a login `User`; belongs to at most one primary
  **Department**.
- **Department** — a grouping with a **Head of Department** (`headId`), member
  staff (`Staff.departmentId`), and covered **subjects** (`DepartmentSubject`).
- **Class teacher** — `Class.classTeacherId` names the CLASS_TEACHER of a stream.
- **TeachingAssignment** — a teacher teaching one subject in one class for one
  year (unique per `(staff, class, subject, year)`; the class fixes the year).
- All gated by `staff-management`. Deletes are protective (a staff member can't be
  removed while an HOD, class teacher, or holding assignments). This phase also
  makes the `UserRole.classId`/`departmentId` scope anchors meaningful, since
  `Class` and `Department` are now first-class.

---

## 9. Timetable (Phases 5a–5d)

The scheduling problem's inputs (details: [docs/TIMETABLE.md](docs/TIMETABLE.md)):

- **The school defines its own day** — teaching days, day start, lesson length,
  lessons per day, and where breaks fall. `POST /timetable/periods/generate`
  builds the bell schedule from those inputs; the resulting `Period` rows stay
  the source of truth and remain hand-editable for irregular days.
- **`Room`** (with `RoomType`) makes space a first-class scheduling constraint;
  **`StaffUnavailability`** blocks (staff, day, period) outright.
- **Demand lives on `TeachingAssignment`** — `periodsPerWeek`, `doublePeriods`,
  `requiredRoomType`, `preferMorning` — since that row is already exactly
  teacher × class × subject.
- **Readiness** (`GET /timetable/readiness`) is a pre-flight feasibility check:
  cheap arithmetic that proves a timetable *cannot* exist and says what to fix,
  so the solver never grinds on an impossible problem.
- **A timetable is dated**: `Timetable` carries `effectiveFrom`/`effectiveTo`
  and a DRAFT→PUBLISHED→ARCHIVED status, so next term's version can be built now
  and published *ahead* to take over automatically. Publishing auto-closes the
  outgoing version the day before, refuses overlapping live versions (checked
  inside the transaction), and rejects past start dates unless explicitly
  backdated.
- **The solver** (`src/timetable/engine/`) is pure, dependency-free and
  deterministic per seed: greedy construction with ejection repair, then
  time-boxed simulated annealing using **min-conflicts targeting** and **swap
  moves** (essential — in a saturated timetable relocation is impossible).
  Hard constraints are never violated during the search, so the timetable is
  valid at every instant. **Incremental scoring** (only the penalty groups a move
  touches are recomputed) gives ~500k iterations in 5 s on a saturated 20-class
  school; the full recompute is retained to resync drift and self-check the
  incremental total.
- **Generation is asynchronous and off-thread**: `POST …/generate` returns a
  `TimetableRun` the client polls; the solve runs in a **`worker_thread`** so it
  never blocks the event loop (inline fallback if the worker can't start). It
  re-checks readiness first and only ever fills a DRAFT.
- **`TimetableEntry` carries three unique indexes** — class, staff and (partial)
  room per slot — so a clash is impossible to *persist*, not merely unlikely.
- **Editing & swaps** (5c–5d) share one validator that re-checks every hard
  constraint against live rows: drag-and-drop move/swap in the grid, and
  teacher-initiated swap requests whose **approval re-validates then applies** (or
  refuses with a reason if the timetable has since shifted). Requesting needs only
  `timetable:view`; editing needs `timetable:update`.
- The solve runs in a `worker_thread` with incremental scoring (both done); the
  next scale lever, if ever needed, is a shared job queue so runs survive a dyno
  restart and can be distributed.

---

## 10. Security Architecture

- **Passwords**: bcrypt (cost 10, 72-byte cap enforced in DTOs); account
  lockout — 5 failed attempts → 15 minutes; identical "Invalid email or
  password" for unknown email vs wrong password (no user enumeration).
- **Two-factor login** (§4): every successful password check still requires the
  emailed code before tokens are issued.
- **Rate limiting**: token buckets (lazy refill, O(1) per key). Default per-IP
  bucket from `RATE_LIMIT_*` env; per-route overrides via `@RateLimit()` — login
  and 2FA-verify `perMinute(5)`, code-sending routes `perMinute(2)`, each keyed
  separately. 429s carry `Retry-After`; every response carries
  `x-ratelimit-remaining`. Store is an abstraction (`TokenBucketStore`) —
  in-memory now, Redis later without touching guards.
- **KYC document storage**: uploads go browser → API → DO Spaces (so the shared
  private bucket needs no CORS); only the storage key is persisted; keys are
  namespaced per user and validated against that namespace; reviewers read via
  short-lived presigned URLs.
- **Audit + alerts** (`AuditService`): role grants/revokes, school
  approval/rejection/changes, campus + module changes, invitation acceptance,
  and super-admin creation write to `audit_logs` (nullable `tenantId` for
  platform events). Critical events also fire a Slack/Discord-compatible webhook
  (`ALERT_WEBHOOK_URL`). Audit writes are fire-and-forget — they never block a request.
- **Frontend token handling**: access/refresh JWTs live in **httpOnly cookies**
  set by the BFF; browser JS (and any XSS) can never read them. The BFF proxies
  every call, attaches the bearer token server-side, refreshes once on 401, and
  forwards `X-Forwarded-For`. The two apps use distinct cookie names
  (`gl_*` school app, `cc_*` console).
- **Secrets posture**: production secrets live only in Heroku config vars; super
  admins in production are created via `heroku run npm run admin:create`
  (timing-safe compare against `PLATFORM_ADMIN_SECRET`, hidden input).

---

## 11. Database Strategy

```prisma
datasource db {
  url       = env("DATABASE_URL")   // runtime — pooled
  directUrl = env("DIRECT_URL")     // migrations
}
```

- **Production**: `DATABASE_URL` → Supabase **transaction pooler** (pgBouncer,
  port 6543, `?pgbouncer=true&connection_limit=10`) so N dynos share the
  connection budget.
- **Local dev**: session pooler (port 5432), or local Postgres via
  `docker compose up -d` (see `.env.example`).
- **Boot**: `PrismaService` verifies connectivity with a real query, logs the
  host + latency, and pre-warms pool connections in the background.
- The Supabase **direct host is IPv6-only** — on IPv4 networks use the session
  pooler for `DIRECT_URL`.

**Template-pattern tables** (`roles`, `curricula`, `grading_schemes`) carry a
regular `@@unique([tenantId, key])` **plus** a partial unique index
`... (key) WHERE tenantId IS NULL` added in raw migration SQL, so a shared
system row and a tenant's shadowing copy of the same key can coexist while
system keys stay globally unique.

---

## 12. Frontend Architecture

Both apps: feature-based slices + Atomic Design; imports flow downward only
(`app/pages → widgets → features → entities/shared`); features never import each
other; all data access goes through RTK Query hooks (no fetch in components);
mutations invalidate tags so lists/counts refetch automatically.

```
src/
├── app/ | pages/   routes, layouts, BFF proxies/handlers only
├── entities/       domain types (academics, school-request, user, tenant, …)
├── features/       vertical slices (auth, onboarding, academics, tenants, …)
├── shared/         design system (ui/atoms, ui/molecules), lib, config
├── widgets/        page chrome (sidebar, top bar, dashboard shell)
└── redux/          store, typed hooks, slices, services/ (RTK Query per feature)
```

- **School app** (`gridlearnia-frontend`): login (2FA step), onboarding wizard
  (with the section structure-picker), and the **Academics** area — a tabbed
  workspace for Academic Years, Structure (sections → grades → classes), and
  Templates (adopt/customize curricula & grading).
- **Command center** (`gridlearnia-commandcenter-frontend`): school-request
  review (shows chosen sections), schools management (tier/status/delete),
  per-school **campus management** and **module toggles** (core modules locked),
  and roles.

---

## 13. Operational Notes

**Environments** — see `.env.example`. Critical: `DATABASE_URL`, `DIRECT_URL`,
`JWT_SECRET`, `JWT_REFRESH_SECRET`, `PLATFORM_ADMIN_SECRET`, the `MAILGUN_*` and
`SPACES_*` groups, `ALERT_WEBHOOK_URL` (optional), and
`SEED_SUPERADMIN_EMAIL/PASSWORD` (first seed in production). Unconfigured mail /
storage degrade gracefully (mail logs instead of sending; document existence
checks are skipped).

**Seeding** (`npm run prisma:seed`, idempotent): permission catalog
(19 modules × 8 actions), 17 system roles synced to the RBAC matrix (retired
modules/roles purged automatically), the **academic templates** (4 curricula +
their subjects, 4 grading schemes + their bands), super-admin bootstrap, and —
outside production — a fully-provisioned demo school (campus, module flags,
sections, current academic year + terms, grades, and a class per grade).

**Deployment order**: migrate (release phase) → seed once per environment →
boot. Heroku app in **EU** to match Supabase.

## 14. Scaling Roadmap (deliberate single-instance shortcuts)

| Trigger | Change |
|---|---|
| 2+ dynos | Redis: token-bucket store, RBAC permission cache, auth-guard user cache — one addon, three swaps behind existing abstractions |
| Route-level entitlements | A `ModuleEnabledGuard` that 403s disabled modules (today enablement gates the UI + permission liveness, not the route directly) |
| Before broad launch | Automated tests on the auth/RBAC/academics layer; CI |
| Product decision | Multi-school membership (`memberships` table); role clone-on-write editing API |
| Next major phase | **Finance** (fee structures, invoicing, payments); parent/student & staff portals via the `User` links |
| Solver at scale | ✅ worker-thread + incremental scoring done; a durable job queue is the next lever if load ever needs it |
| After that | **Finance** (fee structures, invoicing, payments); parent/student portals via the `User` links on Student/Guardian/Staff |
| Scoped permissions | Wire `UserRole.classId`/`departmentId` (now that Class/Department exist, §8) so e.g. a class teacher edits only their own class |
| Hundreds of schools | Read replicas for reporting; `audit_logs` partitioning/retention; RLS as defense-in-depth; APM keyed on request IDs |
