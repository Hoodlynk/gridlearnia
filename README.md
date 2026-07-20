# GridLearnia Backend API

Production-ready multi-tenancy Backend REST API built with NestJS (Fastify), TypeScript, and Supabase PostgreSQL.

> Architecture overview: [ARCHITECTURE.md](ARCHITECTURE.md) · deep dives:
> [docs/RBAC.md](docs/RBAC.md), [docs/ONBOARDING.md](docs/ONBOARDING.md),
> [docs/ACADEMICS.md](docs/ACADEMICS.md).

## Features

- ✅ Multi-tenant architecture, single database (`tenantId` isolation)
- ✅ Organization model: Tenant → Campus → Section → Grade → Class; per-tenant
  localization; `TenantModule` feature flags (with non-disableable core modules)
- ✅ **Two-factor login** — email 6-digit code after password, for both the
  school app and the admin console
- ✅ JWT auth (15m access + 7d refresh, separate secrets; derived secret for 2FA
  challenge tokens); email verification & password reset
- ✅ Permission-based RBAC (`module:action`, multi-role) via `PermissionsGuard`
  + `@RequirePermissions()`; global auth guard (opt out with `@Public()`)
- ✅ Academic engine — curricula/subjects & grading/bands as system templates
  with per-tenant clone-and-customize; academic years/terms; sections/grades/classes
- ✅ Student Information System — students, guardians (many-to-many with primary
  contact), and enrollment of students into classes per academic year
- ✅ Attendance & assessment — daily class registers, scored exams/tests, and
  report cards banded by each section's grading scheme (bands computed, not stored)
- ✅ Staff & teaching — staff profiles, departments (with HOD + subjects), class
  teachers, and teaching assignments (teacher × class × subject per year)
- ✅ Timetable — school-defined day, rooms, per-subject loads, teacher
  availability, readiness check, dated versions, a **one-click solver** (pure
  deterministic engine; clashes impossible by DB constraint), plus drag-and-drop
  editing and teacher swap requests
- ✅ Onboarding with KYC (documents to DigitalOcean Spaces) + structure-picker;
  approval provisions campus, modules, academic year, and sections in one transaction
- ✅ Transactional email via Mailgun; audit log + alert webhook
- ✅ Prisma ORM with Supabase PostgreSQL (pgBouncer-aware connection setup)
- ✅ Consistent response envelope + error format; per-IP/per-route rate limiting
- ✅ Swagger docs at `/docs`; Heroku deployment ready

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: NestJS 11 on Fastify
- **Language**: TypeScript
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Authentication**: JWT (@nestjs/jwt)
- **Validation**: class-validator / class-transformer
- **Docs**: Swagger (OpenAPI) at `/docs`

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Supabase account (for PostgreSQL database)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Update the following variables:
- `DATABASE_URL`: Supabase **pooled** connection string (pgBouncer, port 6543) — used at runtime
- `DIRECT_URL`: Supabase **direct** connection string (port 5432) — used by Prisma migrations
- `JWT_SECRET` / `JWT_REFRESH_SECRET`: strong random secrets

### 3. Run database migrations

```bash
npm run prisma:migrate
```

### 4. Seed the database (optional)

```bash
npm run prisma:seed
```

This seeds the RBAC system data (roles, permissions, access matrix), the platform
super admin (`superadmin@gridlearnia.dev` in dev, or `SEED_SUPERADMIN_EMAIL/PASSWORD`),
and — outside production — a demo school. All demo passwords are `password123`:
`orgadmin@demo.com`, `director@demo.com`, `principal@demo.com`, `bursar@demo.com`,
`teacher@demo.com`, `parent@demo.com`, `student@demo.com`.

### 5. Start the development server

```bash
npm run dev
```

The API will be available at `http://localhost:8080`, Swagger docs at `http://localhost:8080/docs`.

## Project Structure

```
src/
├── auth/            # Register, login (+2FA), verify-email, password reset, refresh, me
├── academics/       # Years/terms, sections, grades, classes, catalog, curricula, grading
├── sis/             # Students, guardians, enrollment (Student Information System)
├── attendance/      # Daily class registers + summaries
├── assessment/      # Exams/tests, score sheets, report cards
├── staff/           # Staff, departments (+ HOD/subjects), teaching assignments
├── timetable/       # School day, rooms, lesson loads, readiness, versions
│   └── engine/      # Pure deterministic scheduling solver (no I/O)
├── school-requests/ # School applications (KYC), review, approval/rejection
├── invitations/     # Invite/accept/revoke (role-carrying tokens)
├── tenants/         # Tenant overview/settings; campuses + module flags (tenant + platform)
├── users/           # Tenant-scoped user management + role assignment
├── rbac/            # Permission catalog, roles, PermissionsGuard, RbacService
├── mail/            # Mailgun MailService + branded templates
├── storage/         # DigitalOcean Spaces (KYC uploads, presigned downloads)
├── audit/           # AuditService (audit_logs + alert webhook)
├── rate-limit/      # Token-bucket guard + @RateLimit()
├── health/          # Liveness + DB check
├── prisma/          # Global PrismaService
├── common/          # decorators, guards, filters, interceptors, types, utils
├── config/          # Environment configuration
├── app.module.ts    # Root module (global guards/filter/interceptor)
└── main.ts          # Fastify bootstrap, helmet, CORS, Swagger
```

## API Endpoints

All routes are prefixed with `/api/v1`.

### Authentication (see ARCHITECTURE.md §4)
- `POST /api/v1/auth/register` - Platform registration: email + password, no school (public)
- `POST /api/v1/auth/login` - Step 1: verify credentials, email a 2FA code, return a challenge (public, throttled)
- `POST /api/v1/auth/admin/login` - Same, admin console (SUPER_ADMIN only)
- `POST /api/v1/auth/2fa/verify` - Step 2: exchange challenge + code for tokens (public, throttled)
- `POST /api/v1/auth/2fa/resend` - Re-send the 2FA code (public, throttled)
- `POST /api/v1/auth/refresh` - Refresh access token (public, throttled)
- `POST /api/v1/auth/verify-email` · `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/forgot-password` · `POST /api/v1/auth/reset-password`
- `GET /api/v1/auth/me` - Current user, tenant (nullable), roles, permissions

### Onboarding (see docs/ONBOARDING.md)
- `POST /api/v1/school-requests` - Apply to create a school (KYC + sections; tenantless users)
- `PUT /api/v1/school-requests/draft` · `POST /api/v1/school-requests/draft/submit`
- `GET /api/v1/school-requests/mine` - My requests
- `GET/POST /api/v1/platform/school-requests[...]` - SUPER_ADMIN review/approve/reject/request-changes
- `POST /api/v1/invitations` / `GET` / `DELETE /:id` / `POST /accept` - invite / list / revoke / redeem

### Academics (tenant-scoped; see docs/ACADEMICS.md)
- `.../academics/years`, `.../sections`, `.../grades`, `.../classes` - CRUD
- `.../academics/catalog/{curricula,grading-schemes}` - available templates (read)
- `.../academics/curricula` + `.../grading-schemes` - clone/create/customize own templates
- `GET /api/v1/campuses` - the school's own campuses

### Student Information System (tenant-scoped; see docs/SIS.md)
- `.../sis/students` - CRUD + `/:id/guardians[/new|/:guardianId]` guardian links
- `.../sis/guardians` - guardian directory CRUD
- `.../sis/enrollments` - enroll/transfer/withdraw students by class & year

### Attendance & assessment (tenant-scoped; see docs/ATTENDANCE-ASSESSMENT.md)
- `.../attendance` - class register (GET by class+date, PUT to mark) + `/summary`
- `.../assessment/assessments` - CRUD + `/:id/scores` (GET/PUT the score sheet)
- `.../assessment/report-card/:enrollmentId` - a student's banded report card

### Staff & teaching (tenant-scoped; see docs/STAFF-TEACHING.md)
- `.../staff/members` - staff CRUD (+ `/:id/invite` and `/:id/user` for portal access)
- `.../staff/departments` - department CRUD + `/:id/subjects` links (HOD via PATCH)
- `.../staff/teaching-assignments` - teacher×class×subject + `/class-teacher` (PUT)

### Timetable (tenant-scoped; see docs/TIMETABLE.md)
- `.../timetable/settings` · `.../timetable/periods` (+ `/generate` from your layout)
- `.../timetable/rooms` · `.../timetable/requirements` · `.../timetable/unavailability/:staffId`
- `.../timetable/readiness?academicYearId=` - pre-flight feasibility check
- `.../timetable/timetables` - dated versions (+ `/:id/publish`, `/:id/archive`)
- `.../timetable/timetables/active?date=` - the version in force on a date
- `.../timetable/timetables/:id/generate` - solve a draft (returns a run to poll)
- `.../timetable/timetables/:id/entries` - placed lessons by class/teacher/room
- `.../timetable/entries/:id/{legal-moves,move,swap}` - manual editing (5c)
- `.../timetable/swap-requests` (+ `/:id/{approve,reject,cancel}`) - swap requests (5d)

### Tenants & platform admin (SUPER_ADMIN)
- `GET/PATCH /api/v1/tenants/me` - Current tenant overview / settings
- `GET /api/v1/platform/tenants` + `PATCH/DELETE /:id` - schools management
- `.../platform/tenants/:id/campuses` + `.../modules/:moduleKey` - campuses / feature flags

### Users (tenant-scoped) & Health
- `GET/PATCH/DELETE /api/v1/users[/:id]` + `POST/DELETE /:id/roles[/:roleKey]`
- `GET /api/v1/health` - Health check (public)

## Response Format

Success:
```json
{ "success": true, "data": { } }
```

Error:
```json
{ "success": false, "message": "Invalid email or password" }
```

Validation error:
```json
{ "success": false, "message": "Invalid input data", "errors": ["email must be an email"] }
```

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Deployment (Heroku)

1. Create the app and set environment variables:
```bash
heroku create your-app-name
heroku config:set DATABASE_URL=... DIRECT_URL=... JWT_SECRET=... JWT_REFRESH_SECRET=... ALLOWED_ORIGINS=https://yourfrontend.com
```

2. Deploy:
```bash
git push heroku main
```

The `Procfile` runs `prisma migrate deploy` on release and starts `dist/main.js`.

### Scaling notes

- `DATABASE_URL` must point at the Supabase **pooler** (port 6543) with a per-instance `connection_limit`, or multiple dynos will exhaust Supabase's direct connection cap.
- Rate limiting and the RBAC permission cache are in-memory per process. Before scaling past one dyno, swap the `TokenBucketStore` / RBAC cache for Redis (both are behind abstractions — see ARCHITECTURE.md §10).

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Environment Variables

See `.env.example` for all available environment variables.

## License

ISC
