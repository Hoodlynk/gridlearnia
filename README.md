# GridLearnia Backend API

Production-ready multi-tenancy Backend REST API built with NestJS (Fastify), TypeScript, and Supabase PostgreSQL.

## Features

- ✅ Multi-tenant architecture with single database (tenant_id isolation)
- ✅ JWT-based authentication (access + refresh tokens)
- ✅ Role-based access control via `@Roles()` guard
- ✅ Global auth guard — routes are protected by default, opt out with `@Public()`
- ✅ Prisma ORM with Supabase PostgreSQL (pgBouncer-aware connection setup)
- ✅ Request validation with class-validator DTOs
- ✅ Consistent response envelope + error format (global interceptor/filter)
- ✅ Rate limiting (@nestjs/throttler, tight limits on login)
- ✅ Swagger docs at `/docs`
- ✅ Heroku deployment ready

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
├── auth/            # Register, login, refresh, me
├── users/           # Tenant-scoped user management
├── tenants/         # Current-tenant overview and settings
├── health/          # Liveness + DB check
├── prisma/          # Global PrismaService
├── config/          # Environment configuration
├── common/
│   ├── decorators/  # @Public, @Roles, @CurrentUser, @CurrentTenant
│   ├── guards/      # JwtAuthGuard, RolesGuard (registered globally)
│   ├── filters/     # Standard error envelope
│   ├── interceptors/# Standard success envelope
│   └── types/       # JwtPayload, AuthenticatedRequest
├── app.module.ts    # Root module (global guards/filter/interceptor)
└── main.ts          # Fastify bootstrap, helmet, CORS, Swagger
```

## API Endpoints

All routes are prefixed with `/api/v1`.

### Authentication
- `POST /api/v1/auth/register` - Platform registration: email + password, no school (public)
- `POST /api/v1/auth/login` - Login with email + password (public, throttled)
- `POST /api/v1/auth/refresh` - Refresh access token (public, throttled)
- `GET /api/v1/auth/me` - Current user, tenant (nullable), roles, permissions

### Onboarding (see docs/ONBOARDING.md)
- `POST /api/v1/school-requests` - Apply to create a school (tenantless users)
- `GET /api/v1/school-requests/mine` - My requests
- `GET/POST /api/v1/platform/school-requests[...]` - SUPER_ADMIN review/approve/reject
- `POST /api/v1/invitations` - Invite an email with roles (user-management:manage)
- `GET /api/v1/invitations` / `DELETE /api/v1/invitations/:id` - List / revoke
- `POST /api/v1/invitations/accept` - Redeem an invite token, join the school

### Users (tenant-scoped)
- `GET /api/v1/users` - List users (OWNER/ADMIN/MANAGER)
- `GET /api/v1/users/:id` - Get user by ID (OWNER/ADMIN/MANAGER)
- `PATCH /api/v1/users/:id` - Update user (OWNER/ADMIN)
- `DELETE /api/v1/users/:id` - Soft-delete user (OWNER/ADMIN)

### Tenants
- `GET /api/v1/tenants/me` - Current tenant with usage overview
- `PATCH /api/v1/tenants/me` - Update tenant name/settings (OWNER)

### Health
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
- Rate limiting is in-memory per process. Before scaling past one dyno, plug a Redis storage adapter into `ThrottlerModule` (see note in `app.module.ts`).

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
