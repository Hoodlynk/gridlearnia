# GridLearnia — System Architecture

> **Status: describes the implemented system** (last updated 2026-07-16).
> Deep dives live in [docs/RBAC.md](docs/RBAC.md) (roles & permissions) and
> [docs/ONBOARDING.md](docs/ONBOARDING.md) (users, schools, invitations).

GridLearnia is a **multi-tenant School Management System**. Each tenant is a
school; platform staff operate across schools through a separate admin console.

## Repositories

| Repo | What it is |
|---|---|
| `gridlearnia` | Backend REST API — NestJS 11 on Fastify, Prisma, Supabase PostgreSQL |
| `gridlearnia-commandcenter-frontend` | Platform admin console — Next.js 16 (App Router), Redux Toolkit Query |

---

## 1. Technology Stack

**Backend**
- **NestJS 11 + Fastify** — modular DI framework on the faster HTTP adapter
- **Prisma 5** ORM → **Supabase PostgreSQL** (eu-west-1)
- **JWT auth** (`@nestjs/jwt`): 15m access + 7d refresh, HS256, separate secrets
- **class-validator** DTOs behind a global `ValidationPipe` (whitelist + forbid unknown)
- **Swagger** at `/docs`
- Deploy target: **Heroku** (`Procfile`: release runs `prisma migrate deploy`) — use the **EU region** to sit near the database

**Frontend (command center)**
- **Next.js 16 App Router**, React 19, Tailwind v4 (ChatGPT-style dark theme tokens)
- **Redux Toolkit + RTK Query** for all data fetching (tag-based cache invalidation)
- **BFF pattern**: Next Route Handlers proxy to the backend and own the httpOnly auth cookies
- Feature-based structure blended with Atomic Design (see §7)

**Storage** (planned): DigitalOcean Spaces (S3-compatible), tenant-scoped key
prefixes, presigned-URL uploads.

---

## 2. Multi-Tenancy Model

**Shared schema, tenant column.** One PostgreSQL database; every tenant-owned
row carries `tenantId` (uuid, indexed). Rationale: thousands of schools on one
operationally simple database; per-tenant cost ≈ zero; cross-tenant analytics
possible; isolation enforced in the service layer (RLS remains available as a
future defense-in-depth backstop).

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
status, user, tenant, and IP — the response body stays minimal; diagnostics
live in logs, correlated by the header.

---

## 4. Identity, Onboarding & RBAC (summaries)

Full details: [docs/ONBOARDING.md](docs/ONBOARDING.md) · [docs/RBAC.md](docs/RBAC.md)

- **Registration** creates a platform user (no school, no roles). Schools are
  created only by **SUPER_ADMIN approving a school request**, which creates the
  tenant and binds the requester as its **ORGANIZATION_ADMIN** (tenant root) in
  one transaction. Existing schools grow via **invitations** (single-use,
  7-day, SHA-256-hashed tokens carrying pre-assigned roles).
- **RBAC**: permissions are `module:action` strings; roles are seeded bundles
  (17 system roles from the access matrix); users hold **multiple roles**
  (union of permissions). Tokens are slim (`sub`, `tenantId`, `email`) —
  permissions resolve server-side, so revocation is effectively immediate.
- **Guard rails**: SUPER_ADMIN is never assignable via API (bootstrap via seed
  or `npm run admin:create`, gated by `PLATFORM_ADMIN_SECRET`); the last
  ORGANIZATION_ADMIN of a school can't be removed/deactivated; org-admin
  grant/revoke requires an existing org admin or platform staff, checked
  uncached.

---

## 5. Security Architecture

- **Passwords**: bcrypt (cost 10, 72-byte cap enforced in DTOs); account
  lockout — 5 failed attempts → 15 minutes; identical "Invalid email or
  password" for unknown email vs wrong password (no user enumeration).
- **Rate limiting**: token buckets (lazy refill, O(1) per key).
  Default per-IP bucket from `RATE_LIMIT_*` env; per-route overrides via
  `@RateLimit()` — login `perMinute(5)`, refresh `perMinute(10)`, each keyed
  separately so hammering one route can't starve another. 429s carry
  `Retry-After`; every response carries `x-ratelimit-remaining`.
  Store is an abstraction (`TokenBucketStore`) — in-memory now, Redis later
  without touching guards.
- **Audit + alerts** (`AuditService`): every role grant/revoke, school
  approval/rejection, invitation acceptance, and super-admin creation writes
  to `audit_logs` (nullable `tenantId` for platform events). Critical events
  (org-admin changes, school approvals, super-admin creation) also fire a
  Slack/Discord-compatible webhook (`ALERT_WEBHOOK_URL`) and WARN logs.
  Audit writes are fire-and-forget — they never block or fail a request.
- **Frontend token handling**: access/refresh JWTs live in **httpOnly cookies**
  set by Next Route Handlers — browser JS (and any XSS) can never read them.
  The BFF proxies every call, attaches the bearer token server-side, performs
  a one-shot refresh on 401, and forwards the real client IP
  (`X-Forwarded-For`). Backend records `lastLoginIp`.
- **Secrets posture**: production secrets live only in Heroku config vars;
  super admins in production are created via `heroku run npm run admin:create`
  so credentials never sit on laptops. The admin script requires the platform
  password interactively (timing-safe compare, hidden input).

---

## 6. Database Strategy

```prisma
datasource db {
  url       = env("DATABASE_URL")   // runtime — pooled
  directUrl = env("DIRECT_URL")     // migrations
}
```

- **Production**: `DATABASE_URL` → Supabase **transaction pooler** (pgBouncer,
  port 6543, `?pgbouncer=true&connection_limit=10`) so N dynos share the
  connection budget. Inside AWS the pooler's extra round-trips cost ~nothing.
- **Local dev**: session pooler (port 5432) — pgBouncer transaction mode
  multiplies Prisma round-trips ~5× on high-latency links. Fastest option:
  local Postgres via `docker compose up -d` (see commented URLs in `.env.example`).
- **Boot**: `PrismaService` verifies connectivity with a real query, logs the
  host + latency, and pre-warms 4 pool connections in the background
  (connection setup to a remote DB costs seconds; Prisma grows the pool lazily).
- The Supabase **direct host is IPv6-only** — on IPv4 networks use the session
  pooler for `DIRECT_URL`.

---

## 7. Frontend Architecture (command center)

Feature-based architecture + Atomic Design, with the App Router owning routing:

```
src/
├── app/          routes, layouts, BFF route handlers only
├── entities/     domain types (school-request, user)
├── features/     vertical slices: auth, school-requests (components + hooks)
├── shared/       design system (ui/atoms, ui/molecules), lib, config
├── widgets/      page-level chrome: dashboard-shell (collapsible sidebar,
│                 top bar with profile menu)
└── redux/        store, typed hooks, slices, services/ (RTK Query,
                  injectEndpoints per feature)
```

Rules that keep it scalable:
- Imports flow downward only (`app → widgets → features → entities/shared`);
  features never import each other.
- **`'use client'` appears only at boundary files** (shell, panels, forms,
  provider, `error.tsx`) — components below a boundary carry no directive.
- All data access goes through RTK Query hooks
  (`useSchoolRequestsQuery`, `useApproveSchoolRequestMutation`, …); mutations
  invalidate tags, so lists/counts refetch automatically. No fetch calls in
  components.
- Server Components handle auth checks and static chrome; the BFF keeps
  `API_URL` server-only (no CORS, no exposed backend URL).

---

## 8. Operational Notes

**Environments** — see `.env.example` for the full list. Critical:
`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`PLATFORM_ADMIN_SECRET`, `ALERT_WEBHOOK_URL` (optional),
`SEED_SUPERADMIN_EMAIL/PASSWORD` (first seed in production).

**Seeding** (`npm run prisma:seed`, idempotent): permission catalog
(19 modules × 8 actions), 17 system roles synced to the RBAC matrix (retired
modules/roles are purged automatically), super-admin bootstrap, and — outside
production — a demo school.

**Deployment order**: migrate (release phase) → seed once per environment →
boot. Heroku app in **EU** to match Supabase.

## 9. Scaling Roadmap (deliberate single-instance shortcuts)

| Trigger | Change |
|---|---|
| 2+ dynos | Redis: token-bucket store, RBAC permission cache, auth-guard user cache — one addon, three swaps behind existing abstractions |
| Real onboarding | Email delivery for invitations (tokens currently returned in API responses) |
| Before broad launch | Automated tests on the auth/RBAC layer; CI |
| Product decision | Multi-school membership (`memberships` table) — cheapest before invite volume grows |
| Hundreds of schools | Read replicas for reporting; `audit_logs` partitioning/retention; RLS as defense-in-depth; APM keyed on request IDs |
