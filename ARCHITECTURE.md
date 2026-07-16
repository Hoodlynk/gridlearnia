# Multi-Tenancy Backend API Architecture

## Overview
This document outlines the production-ready architecture for a scalable multi-tenancy **Backend REST API** built with Node.js/Express and PostgreSQL, designed for enterprise-grade applications.

**Project Scope:**
- ✅ Backend REST API only (no frontend)
- ✅ Deployed on Heroku
- ✅ Separate frontend project will consume this API
- ✅ PostgreSQL database (Supabase)
- ✅ RESTful API with JWT authentication

## Table of Contents
1. [Architecture Principles](#architecture-principles)
2. [Multi-Tenancy Strategy](#multi-tenancy-strategy)
3. [Project Structure](#project-structure)
4. [Technology Stack](#technology-stack)
5. [Core Components](#core-components)
6. [Data Isolation Strategies](#data-isolation-strategies)
7. [Security Architecture](#security-architecture)
8. [Scalability & Performance](#scalability--performance)
9. [Monitoring & Observability](#monitoring--observability)
10. [Deployment Strategy](#deployment-strategy)

---

## Architecture Principles

### Clean Architecture
- **Separation of Concerns**: Clear boundaries between layers
- **Dependency Inversion**: High-level modules don't depend on low-level modules
- **Domain-Driven Design**: Business logic isolated from infrastructure
- **SOLID Principles**: Maintainable and testable code

### Key Design Patterns
- **Repository Pattern**: Abstract data access layer
- **Factory Pattern**: Tenant-specific resource creation
- **Strategy Pattern**: Pluggable tenant isolation strategies
- **Middleware Pattern**: Request processing pipeline
- **Dependency Injection**: Loose coupling and testability

---

## Multi-Tenancy Strategy

### Tenant Identification Methods
1. **Subdomain-based**: `tenant1.app.com`, `tenant2.app.com`
2. **Header-based**: `X-Tenant-ID` header
3. **JWT-based**: Tenant ID embedded in authentication token
4. **Path-based**: `/api/v1/tenants/:tenantId/...`

### Data Isolation Strategy: Shared Schema with Tenant Column

This architecture uses a **single PostgreSQL database** with a **shared schema** where every table includes a `tenant_id` column for data isolation.

#### Why This Approach?

**Advantages:**
- ✅ **Cost-Effective**: Single database instance for all tenants
- ✅ **Simple to Implement**: Standard SQL queries with tenant_id filtering
- ✅ **Easy Maintenance**: Single schema to migrate and maintain
- ✅ **Cross-Tenant Analytics**: Simple queries across all tenants for reporting
- ✅ **Resource Efficient**: Shared connection pools and resources
- ✅ **Scalable**: PostgreSQL can handle millions of rows per table with proper indexing

**Security Measures:**
- 🔒 **Row-Level Security (RLS)**: PostgreSQL automatically filters rows by tenant_id
- 🔒 **Application-Level Guards**: Middleware ensures tenant context on every request
- 🔒 **Database Constraints**: Foreign keys enforce tenant_id consistency
- 🔒 **Audit Logging**: All queries logged with tenant context
- 🔒 **Index Strategy**: Composite indexes on (tenant_id, ...) for performance

**Mitigating Risks:**
- **Data Leakage Prevention**: RLS policies + middleware guards + comprehensive testing
- **Performance at Scale**: Table partitioning by tenant_id for large datasets
- **Tenant Isolation**: Every query MUST include tenant_id filter (enforced by RLS)

---

## Project Structure

```
gridlearnia-backend/
│
├── src/
│   ├── controllers/                  # Request handlers
│   │   ├── auth.controller.ts
│   │   ├── tenant.controller.ts
│   │   ├── user.controller.ts
│   │   └── health.controller.ts
│   │
│   ├── models/                       # Database models (Prisma)
│   │   ├── tenant.model.ts
│   │   ├── user.model.ts
│   │   └── project.model.ts
│   │
│   ├── routes/                       # Route definitions
│   │   ├── auth.routes.ts
│   │   ├── tenant.routes.ts
│   │   ├── user.routes.ts
│   │   └── index.ts
│   │
│   ├── services/                     # Business logic
│   │   ├── auth.service.ts
│   │   ├── tenant.service.ts
│   │   ├── user.service.ts
│   │   ├── jwt.service.ts
│   │   └── email.service.ts
│   │
│   ├── middlewares/                  # Express middlewares
│   │   ├── auth.middleware.ts
│   │   ├── tenant.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── validation.middleware.ts
│   │   └── rateLimit.middleware.ts
│   │
│   ├── config/                       # Configuration
│   │   ├── database.ts
│   │   ├── app.ts
│   │   └── index.ts
│   │
│   ├── utils/                        # Utility functions
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   ├── response.ts
│   │   └── validators.ts
│   │
│   ├── types/                        # TypeScript types
│   │   ├── express.d.ts
│   │   └── index.ts
│   │
│   ├── app.ts                        # Express app setup
│   └── server.ts                     # Server entry point
│
├── prisma/                           # Prisma ORM
│   ├── schema.prisma                 # Database schema
│   ├── migrations/                   # Migration files
│   └── seed.ts                       # Seed data
│
├── tests/                            # Tests
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example                      # Environment variables template
├── .gitignore
├── tsconfig.json                     # TypeScript config
├── package.json                      # Dependencies
├── Procfile                          # Heroku process file
└── README.md
```

---

## Technology Stack

### Core Technologies
- **Runtime**: Node.js 20+ (LTS)
- **Framework**: Express.js 4.x
- **Language**: TypeScript 5.x
- **Package Manager**: pnpm (faster, more efficient)

### Database & Storage
- **Primary Database**: PostgreSQL (Supabase)
  - **ORM**: Prisma (type-safe, works seamlessly with Supabase)
  - **Connection**: Direct connection via DATABASE_URL
  - **Connection Pool**: Supabase connection pooler (pgBouncer)
  - **Migration Tool**: Prisma Migrate
  - **Row-Level Security**: Supabase RLS policies
- **Search**: PostgreSQL Full-Text Search (built-in)
- **File Storage**: DigitalOcean Spaces (S3-compatible, accessed via AWS S3 SDK; tenant-scoped key prefixes)

### Background Jobs
- **Scheduler**: node-cron (for scheduled tasks)

### Authentication & Security
- **JWT**: jsonwebtoken
- **Password Hashing**: bcrypt / argon2
- **Rate Limiting**: express-rate-limit (in-memory)
- **Helmet**: Security headers
- **CORS**: cors middleware

### Validation & Documentation
- **Validation**: Zod / Joi
- **API Documentation**: Swagger/OpenAPI 3.0
- **Schema Generation**: TypeScript to OpenAPI

### Monitoring & Logging
- **Logger**: Winston / Pino
- **APM**: New Relic / Datadog / Elastic APM
- **Metrics**: Prometheus + Grafana
- **Tracing**: OpenTelemetry
- **Error Tracking**: Sentry

### Testing
- **Test Framework**: Jest
- **E2E Testing**: Supertest
- **Mocking**: jest-mock
- **Coverage**: Istanbul (built into Jest)

### DevOps & Deployment
- **Platform**: Heroku (PaaS)
- **CI/CD**: GitHub Actions → Heroku
- **Process Management**: Heroku Dynos
- **Add-ons**: 
  - Heroku Scheduler (cron jobs)
  - Papertrail (logging)
  - New Relic / Scout APM (monitoring)

---

## Core Components

### 1. Tenant Context Manager
```typescript
// Manages tenant context throughout request lifecycle
class TenantContext {
  - getCurrentTenant(): Tenant
  - setTenant(tenant: Tenant): void
  - getTenantDatabase(): DatabaseConnection
  - clearContext(): void
}
```

### 2. Multi-Tenant Database Manager
```typescript
// Handles database connections per tenant
class DatabaseManager {
  - getConnection(tenantId: string): Connection
  - createTenantDatabase(tenant: Tenant): Promise<void>
  - runMigrations(tenantId: string): Promise<void>
  - healthCheck(tenantId: string): Promise<boolean>
}
```

### 3. Tenant Provisioning Service
```typescript
// Automates tenant onboarding
class TenantProvisioningService {
  - createTenant(data: TenantData): Promise<Tenant>
  - provisionDatabase(tenant: Tenant): Promise<void>
  - setupDefaultData(tenant: Tenant): Promise<void>
  - configureDomain(tenant: Tenant): Promise<void>
  - sendWelcomeEmail(tenant: Tenant): Promise<void>
}
```

### 4. Authentication Service
```typescript
// Multi-tenant aware authentication
class AuthService {
  - login(credentials: Credentials, tenantId: string): Promise<AuthToken>
  - validateToken(token: string): Promise<TokenPayload>
  - refreshToken(refreshToken: string): Promise<AuthToken>
  - logout(token: string): Promise<void>
}
```

### 5. Authorization Service
```typescript
// Role-based access control per tenant
class AuthorizationService {
  - checkPermission(userId: string, resource: string, action: string): Promise<boolean>
  - assignRole(userId: string, role: Role): Promise<void>
  - getTenantRoles(tenantId: string): Promise<Role[]>
}
```

---

## PostgreSQL Multi-Tenancy Architecture

### Why PostgreSQL for Multi-Tenancy?

PostgreSQL offers superior multi-tenancy capabilities:

1. **Row-Level Security (RLS)**: Automatic tenant isolation at database level
2. **Schema Isolation**: Create separate schemas per tenant within one database
3. **JSONB Support**: Flexible tenant-specific configurations
4. **Advanced Indexing**: Partial indexes, GIN, GiST for optimized tenant queries
5. **Table Partitioning**: Partition by tenant_id for massive scale
6. **Foreign Data Wrappers**: Connect to external tenant databases if needed
7. **Connection Pooling**: Efficient multi-tenant connection management
8. **ACID Guarantees**: Critical for billing, payments, and transactional data

### PostgreSQL Extensions for Multi-Tenancy

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Encryption functions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- Multi-column indexes
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query performance monitoring
```

### Supabase Database Configuration

#### Connection Setup

Supabase provides two connection strings:

1. **Direct Connection** (Port 5432) - For long-running servers
   ```
   postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
   ```

2. **Connection Pooler** (Port 6543) - For serverless/short-lived connections
   ```
   postgresql://postgres:[password]@db.[project-ref].supabase.co:6543/postgres?pgbouncer=true
   ```

**Recommendation for Heroku:** Use **Direct Connection** since Heroku dynos are long-running processes.

#### Prisma Configuration with Supabase

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // For connection pooling (optional)
  directUrl = env("DATABASE_POOL_URL")
}

generator client {
  provider = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}
```

#### Connection Pool Strategy

```typescript
// src/config/database.ts
import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma client
let prisma: PrismaClient;

export const getPrismaClient = () => {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }
  return prisma;
};

// Graceful shutdown
export const disconnectDatabase = async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
};
```

#### Supabase Row-Level Security (RLS) Integration

```sql
-- Enable RLS on tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create policies for tenant isolation
CREATE POLICY tenant_isolation_policy ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_policy ON projects
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
```

#### Middleware for Tenant Context

```typescript
// Prisma middleware to set tenant context
prisma.$use(async (params, next) => {
  // Set tenant context before query
  if (params.model && tenantId) {
    await prisma.$executeRaw`SET app.current_tenant_id = ${tenantId}`;
  }
  
  return next(params);
});
```

---

## Data Isolation Implementation

### Single Database with Shared Schema & Tenant Column

#### Database Schema Design

```sql
-- ============================================
-- CORE TENANT MANAGEMENT SCHEMA
-- ============================================

-- Tenants table (master tenant registry)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL,
  tier VARCHAR(50) NOT NULL CHECK (tier IN ('standard', 'professional', 'enterprise')),
  status VARCHAR(50) NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  
  -- Tenant configuration stored as JSONB
  settings JSONB DEFAULT '{}'::JSONB,
  
  -- Resource limits per tier
  max_users INTEGER NOT NULL DEFAULT 10,
  max_storage_gb INTEGER NOT NULL DEFAULT 5,
  max_api_calls_per_day INTEGER NOT NULL DEFAULT 10000,
  
  -- Billing information
  subscription_start_date TIMESTAMP,
  subscription_end_date TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL -- Soft delete support
);

-- Indexes for tenant lookups
CREATE INDEX idx_tenants_subdomain ON tenants(subdomain) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_tier ON tenants(tier);

-- GIN index for JSONB settings queries
CREATE INDEX idx_tenants_settings ON tenants USING GIN(settings);

-- ============================================
-- USERS TABLE WITH TENANT ISOLATION
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- User credentials
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  
  -- User profile
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  
  -- Role and permissions
  role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'manager', 'user', 'guest')),
  permissions JSONB DEFAULT '[]'::JSONB,
  
  -- Account status
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMP,
  
  -- Security
  last_login_at TIMESTAMP,
  last_login_ip INET,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  
  -- Composite unique constraint: email must be unique per tenant
  CONSTRAINT unique_tenant_email UNIQUE(tenant_id, email)
);

-- Strategic indexes for performance
CREATE INDEX idx_users_tenant_id ON users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(tenant_id, role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active ON users(tenant_id, is_active) WHERE deleted_at IS NULL;

-- Partial index for active users only (most common query)
CREATE INDEX idx_users_tenant_active ON users(tenant_id) 
  WHERE is_active = true AND deleted_at IS NULL;

-- ============================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access data from their tenant
CREATE POLICY tenant_isolation_policy ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Policy: Bypass RLS for superuser operations (migrations, admin)
CREATE POLICY bypass_rls_for_superuser ON users
  USING (current_setting('app.bypass_rls', true) = 'true');

-- ============================================
-- TABLE PARTITIONING (For Scale)
-- ============================================

-- Example: Partition audit logs by tenant_id for massive scale
CREATE TABLE audit_logs (
  id BIGSERIAL,
  tenant_id UUID NOT NULL,
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY HASH (tenant_id);

-- Create partitions (example: 16 partitions)
CREATE TABLE audit_logs_p0 PARTITION OF audit_logs FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE audit_logs_p1 PARTITION OF audit_logs FOR VALUES WITH (MODULUS 16, REMAINDER 1);
-- ... continue for p2 through p15

-- Index on each partition
CREATE INDEX idx_audit_logs_p0_tenant ON audit_logs_p0(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_p1_tenant ON audit_logs_p1(tenant_id, created_at DESC);
-- ... continue for all partitions

-- ============================================
-- TENANT-SPECIFIC RESOURCES EXAMPLE
-- ============================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  
  -- Project-specific data as JSONB for flexibility
  metadata JSONB DEFAULT '{}'::JSONB,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

-- Indexes
CREATE INDEX idx_projects_tenant ON projects(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_owner ON projects(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_status ON projects(tenant_id, status) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON projects
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to validate tenant resource limits
CREATE OR REPLACE FUNCTION check_tenant_user_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_user_count INTEGER;
  max_allowed INTEGER;
BEGIN
  SELECT COUNT(*), t.max_users INTO current_user_count, max_allowed
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE u.tenant_id = NEW.tenant_id AND u.deleted_at IS NULL
  GROUP BY t.max_users;
  
  IF current_user_count >= max_allowed THEN
    RAISE EXCEPTION 'Tenant has reached maximum user limit of %', max_allowed;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_user_limit BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION check_tenant_user_limit();

-- ============================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================

-- Tenant usage statistics (refreshed periodically)
CREATE MATERIALIZED VIEW tenant_usage_stats AS
SELECT 
  t.id as tenant_id,
  t.name,
  t.tier,
  t.status,
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT u.id) FILTER (WHERE u.last_login_at > NOW() - INTERVAL '30 days') as active_users_30d,
  COUNT(DISTINCT p.id) as total_projects,
  t.max_users,
  t.max_storage_gb,
  t.created_at
FROM tenants t
LEFT JOIN users u ON u.tenant_id = t.id AND u.deleted_at IS NULL
LEFT JOIN projects p ON p.tenant_id = t.id AND p.deleted_at IS NULL
WHERE t.deleted_at IS NULL
GROUP BY t.id;

-- Index for fast lookups
CREATE UNIQUE INDEX idx_tenant_usage_stats_tenant_id ON tenant_usage_stats(tenant_id);

-- Refresh command (run via cron job)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY tenant_usage_stats;
```

#### Middleware Implementation
```typescript
// Automatic tenant filtering on all queries
app.use(async (req, res, next) => {
  const tenant = await resolveTenant(req);
  
  // Set tenant context for current request
  await db.query('SET app.current_tenant_id = $1', [tenant.id]);
  
  req.tenant = tenant;
  next();
});
```

---

## Security Architecture

### 1. Authentication Flow
```
1. Client sends credentials + tenant identifier
2. Validate tenant exists and is active
3. Verify credentials against tenant's user database
4. Generate JWT with tenant_id embedded
5. Return access token + refresh token
6. Client includes token in subsequent requests
```

### 2. Authorization Layers
- **Tenant-level**: Ensure user belongs to tenant
- **Role-level**: Check user role permissions
- **Resource-level**: Verify ownership of resources
- **Action-level**: Validate specific action permissions

### 3. Security Measures
- **Input Validation**: Zod schemas on all inputs
- **SQL Injection**: Parameterized queries only
- **XSS Protection**: Helmet middleware
- **CSRF Protection**: CSRF tokens for state-changing operations
- **Rate Limiting**: Per-tenant and per-user limits
- **Encryption**: 
  - Data at rest: Database encryption
  - Data in transit: TLS 1.3
  - Sensitive fields: Application-level encryption
- **Secrets Management**: AWS Secrets Manager / HashiCorp Vault
- **Audit Logging**: All critical operations logged

### 4. Multi-Tenant Security Considerations
- **Tenant Isolation**: Strict data separation
- **Subdomain Validation**: Prevent subdomain hijacking
- **Cross-Tenant Prevention**: Middleware guards
- **Resource Quotas**: Per-tenant limits
- **DDoS Protection**: Cloudflare / AWS Shield

---

## Scalability & Performance

### Horizontal Scaling
```
Load Balancer (Nginx/ALB)
    ↓
[API Server 1] [API Server 2] [API Server 3] ... [API Server N]
    ↓
[PostgreSQL Primary + Replicas]
```

### Performance Strategy
1. **Database Optimization**
   - Strategic indexing on tenant_id columns
   - Read replicas for read-heavy operations
   - Query optimization and prepared statements

2. **CDN for Static Assets**
   - Static file delivery
   - API response caching at CDN level (if needed)

### PostgreSQL-Specific Optimizations

#### 1. Connection Pooling Strategy
```typescript
// PgBouncer configuration for multi-tenancy
// pgbouncer.ini
[databases]
* = host=postgres-primary port=5432 pool_mode=transaction

[pgbouncer]
pool_mode = transaction
max_client_conn = 10000
default_pool_size = 25
reserve_pool_size = 5
reserve_pool_timeout = 3
```

#### 2. Query Optimization Patterns
```typescript
// GOOD: Use prepared statements with tenant_id
const query = {
  text: 'SELECT * FROM users WHERE tenant_id = $1 AND email = $2',
  values: [tenantId, email]
};

// GOOD: Leverage partial indexes
const activeUsers = await db.query(
  'SELECT * FROM users WHERE tenant_id = $1 AND is_active = true',
  [tenantId]
); // Uses idx_users_tenant_active

// GOOD: Use JSONB operators efficiently
const settings = await db.query(
  "SELECT * FROM tenants WHERE settings @> $1",
  [JSON.stringify({ feature_x: true })]
);

// BAD: Avoid N+1 queries
// Use JOINs or batch queries instead
```

#### 3. Read Replicas Configuration
```typescript
// Primary for writes
const primaryPool = new Pool({
  host: process.env.DB_PRIMARY_HOST,
  database: process.env.DB_NAME,
  max: 20
});

// Replica for reads
const replicaPool = new Pool({
  host: process.env.DB_REPLICA_HOST,
  database: process.env.DB_NAME,
  max: 50 // More connections for read-heavy workload
});

// Smart routing
export const getDbPool = (operation: 'read' | 'write') => {
  return operation === 'write' ? primaryPool : replicaPool;
};
```

#### 4. Table Partitioning for Scale
```sql
-- Partition large tables by tenant_id hash
-- Distributes data evenly across partitions
-- Improves query performance for single-tenant queries

-- Already shown in schema: audit_logs partitioned by HASH(tenant_id)
-- For time-series data, use RANGE partitioning:

CREATE TABLE events (
  id BIGSERIAL,
  tenant_id UUID NOT NULL,
  event_type VARCHAR(100),
  data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE events_2026_01 PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
  
CREATE TABLE events_2026_02 PARTITION OF events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

#### 5. Index Strategies
- **Composite Indexes**: `(tenant_id, frequently_queried_column)`
- **Partial Indexes**: Filter out soft-deleted or inactive records
- **GIN Indexes**: For JSONB columns and full-text search
- **Covering Indexes**: Include columns to avoid table lookups

#### 6. Query Performance Monitoring
```sql
-- Enable pg_stat_statements
CREATE EXTENSION pg_stat_statements;

-- Find slow queries per tenant
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%tenant_id%'
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Analyze table statistics
ANALYZE users;
ANALYZE tenants;
ANALYZE projects;
```

### Performance Targets
- **API Response Time**: < 200ms (p95)
- **Database Query Time**: < 50ms (p95)
- **Throughput**: 10,000+ requests/second
- **Concurrent Users**: 100,000+ per instance

---

## Monitoring & Observability

### Metrics to Track
1. **Application Metrics**
   - Request rate per tenant
   - Response times per endpoint
   - Error rates
   - Active users per tenant

2. **Infrastructure Metrics**
   - CPU/Memory usage
   - Database connections
   - Response times
   - Error rates

3. **Business Metrics**
   - Tenant signups
   - API usage per tenant
   - Feature adoption
   - Churn indicators

### Logging Strategy
```typescript
// Structured logging with tenant context
logger.info('User login', {
  tenantId: tenant.id,
  userId: user.id,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  timestamp: new Date().toISOString()
});
```

### Alerting Rules
- API error rate > 5%
- Response time > 1 second (p95)
- Database connection pool exhausted
- Tenant-specific anomalies
- Security incidents

---

## Deployment Strategy

### Environment Setup
```
Development → Staging → Production
```

### Heroku Deployment Configuration

#### Procfile
```
web: node dist/server.js
worker: node dist/infrastructure/queue/worker.js
release: npx prisma migrate deploy
```

#### Heroku Add-ons Required
```bash
# Note: Supabase PostgreSQL is external, not a Heroku add-on

# Scheduler for cron jobs
heroku addons:create scheduler:standard

# Logging
heroku addons:create papertrail:choklad

# APM monitoring (optional)
heroku addons:create newrelic:wayne
```

#### Environment Variables
```bash
# App configuration
NODE_ENV=production
PORT=8080

# Supabase Database
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
# For connection pooling (recommended for serverless)
DATABASE_POOL_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:6543/postgres?pgbouncer=true

# Supabase (optional - if using Supabase Auth/Storage)
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT secrets
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# CORS
ALLOWED_ORIGINS=https://yourfrontend.com,https://app.yourfrontend.com

# File storage (Supabase Storage or AWS S3)
# Option 1: Supabase Storage (uses SUPABASE_URL and keys above)
STORAGE_PROVIDER=supabase

# Option 2: AWS S3
# STORAGE_PROVIDER=s3
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# AWS_S3_BUCKET=...
# AWS_REGION=us-east-1

# Email service
SENDGRID_API_KEY=...
EMAIL_FROM=noreply@yourdomain.com
```

#### Deployment Methods
1. **GitHub Integration** (Recommended)
   - Connect GitHub repository to Heroku
   - Enable automatic deploys from main branch
   - Enable review apps for PRs

2. **Manual Deployment**
   ```bash
   git push heroku main
   ```

3. **CI/CD with GitHub Actions**
   - Run tests on PR
   - Deploy to staging on merge to develop
   - Deploy to production on merge to main

### Database Migrations
```bash
# Run migrations for all tenants
npm run migrate:all

# Run migration for specific tenant
npm run migrate:tenant -- --tenant-id=<uuid>

# Rollback migration
npm run migrate:rollback -- --tenant-id=<uuid>
```

### Health Checks
```typescript
// Kubernetes liveness probe
GET /health/live

// Kubernetes readiness probe
GET /health/ready

// Detailed health check
GET /health/detailed
{
  "status": "healthy",
  "database": "connected",
  "tenants": {
    "total": 150,
    "active": 148,
    "suspended": 2
  }
}
```

### PostgreSQL Backup & Migration Strategy

#### Backup Strategy
```bash
# Automated daily backups using pg_dump
# Backup entire database
pg_dump -h localhost -U postgres -Fc gridlearnia > backup_$(date +%Y%m%d).dump

# Backup specific tenant data (for tenant-specific restore)
pg_dump -h localhost -U postgres \
  --table='tenants' \
  --table='users' \
  --table='projects' \
  -Fc gridlearnia > tenant_backup_$(date +%Y%m%d).dump

# Point-in-time recovery setup
# Enable WAL archiving in postgresql.conf:
# wal_level = replica
# archive_mode = on
# archive_command = 'cp %p /backup/wal/%f'
```

#### Tenant-Specific Migrations
```typescript
// Migration runner for multi-tenant system
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

interface Migration {
  id: string;
  name: string;
  up: string;
  down: string;
}

class MigrationRunner {
  async runMigration(migration: Migration, tenantId?: string) {
    const pool = new Pool();
    
    try {
      await pool.query('BEGIN');
      
      // Set tenant context if specified
      if (tenantId) {
        await pool.query('SET app.current_tenant_id = $1', [tenantId]);
      }
      
      // Run migration
      await pool.query(migration.up);
      
      // Record migration
      await pool.query(
        'INSERT INTO schema_migrations (id, name, executed_at) VALUES ($1, $2, NOW())',
        [migration.id, migration.name]
      );
      
      await pool.query('COMMIT');
      console.log(`Migration ${migration.name} completed successfully`);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    } finally {
      await pool.end();
    }
  }
  
  async runAllMigrations(tenantId?: string) {
    const migrations = this.loadMigrations();
    
    for (const migration of migrations) {
      await this.runMigration(migration, tenantId);
    }
  }
  
  private loadMigrations(): Migration[] {
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir).sort();
    
    return files.map(file => {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      return JSON.parse(content);
    });
  }
}
```

#### Disaster Recovery
- **Backup Strategy**: 
  - Daily full backups using pg_dump
  - Continuous WAL archiving for point-in-time recovery
  - Tenant-specific backup capability
  - Automated backup to S3/cloud storage
- **Recovery Time Objective (RTO)**: < 4 hours
- **Recovery Point Objective (RPO)**: < 15 minutes (with WAL archiving)
- **Backup Retention**: 
  - Daily backups: 30 days
  - Weekly backups: 12 weeks
  - Monthly backups: 12 months
- **Testing**: Monthly disaster recovery drills

---

## API Design Principles

### RESTful API Structure
```
/api/v1/tenants                    # Tenant management (admin)
/api/v1/auth/login                 # Authentication
/api/v1/auth/refresh               # Token refresh
/api/v1/users                      # User management
/api/v1/users/:id                  # Specific user
/api/v1/resources                  # Tenant-scoped resources
```

### Response Format
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-03T19:36:00Z",
    "requestId": "uuid",
    "tenantId": "uuid"
  }
}
```

### Error Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-02-03T19:36:00Z",
    "requestId": "uuid"
  }
}
```

---

## Development Workflow

### Local Development
```bash
# Install dependencies
pnpm install

# Setup local database
docker-compose up -d postgres

# Run migrations
pnpm run migrate:up

# Seed data
pnpm run seed

# Start development server
pnpm run dev
```

### Code Quality
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier
- **Pre-commit Hooks**: Husky + lint-staged
- **Type Checking**: TypeScript strict mode
- **Code Review**: Required for all PRs

### Testing Strategy
```bash
# Unit tests
pnpm run test:unit

# Integration tests
pnpm run test:integration

# E2E tests
pnpm run test:e2e

# Coverage report
pnpm run test:coverage
```

---

## PostgreSQL Monitoring & Health

### Database-Specific Metrics

```sql
-- Monitor connection pool usage
SELECT 
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active_connections,
  count(*) FILTER (WHERE state = 'idle') as idle_connections
FROM pg_stat_activity;

-- Monitor table bloat
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  n_live_tup as live_tuples,
  n_dead_tup as dead_tuples
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- Monitor index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Monitor buffer cache hit ratio (should be > 99%)
SELECT 
  sum(heap_blks_read) as heap_read,
  sum(heap_blks_hit) as heap_hit,
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as buffer_cache_hit_ratio
FROM pg_statio_user_tables;
```

### Automated Maintenance

```sql
-- Vacuum and analyze schedule (via cron or pg_cron extension)
CREATE EXTENSION pg_cron;

-- Daily vacuum analyze on all tables
SELECT cron.schedule('vacuum-analyze', '0 2 * * *', 'VACUUM ANALYZE');

-- Weekly full vacuum on specific tables
SELECT cron.schedule('vacuum-full-users', '0 3 * * 0', 'VACUUM FULL users');

-- Refresh materialized views
SELECT cron.schedule('refresh-stats', '*/30 * * * *', 
  'REFRESH MATERIALIZED VIEW CONCURRENTLY tenant_usage_stats');
```

---

## Conclusion

This **PostgreSQL-focused multi-tenancy architecture** provides:

### Core Strengths
- ✅ **PostgreSQL-Native Multi-Tenancy**: Leverages Row-Level Security and partitioning
- ✅ **Single Database Architecture**: All tenants in one database with tenant_id column isolation
- ✅ **Scalability**: Horizontal scaling with connection pooling and read replicas
- ✅ **Data Isolation**: Row-Level Security (RLS) + application-level guards + tenant_id filtering
- ✅ **Performance**: Advanced indexing, query optimization, and database tuning
- ✅ **Security**: Multi-layered security with database-level isolation
- ✅ **Maintainability**: Clean architecture with clear separation of concerns
- ✅ **Observability**: Comprehensive monitoring using PostgreSQL native tools
- ✅ **Reliability**: ACID guarantees, automated backups, and disaster recovery
- ✅ **Developer Experience**: Type-safe TypeScript, clear structure, and tooling

### PostgreSQL-Specific Benefits
- **Row-Level Security**: Automatic tenant filtering at database level
- **JSONB Support**: Flexible tenant configurations without schema changes
- **Advanced Indexing**: GIN, GiST, partial, and composite indexes for optimal performance
- **Table Partitioning**: Scale to billions of rows with hash/range partitioning
- **Materialized Views**: Pre-computed analytics for tenant dashboards
- **Full-Text Search**: Built-in search without external dependencies
- **Triggers & Functions**: Business logic enforcement at database level
- **Connection Pooling**: Efficient resource management with PgBouncer
- **Point-in-Time Recovery**: WAL archiving for minimal data loss

### Production-Ready Features
- **Backend REST API** with versioning (v1, v2, etc.)
- Multi-tier tenant support (Standard, Professional, Enterprise)
- Automated tenant provisioning and deprovisioning
- Resource quotas and limits per tenant
- Comprehensive audit logging with partitioning
- Soft deletes for data recovery
- Automated Prisma migrations
- Health checks and monitoring endpoints
- **Heroku-optimized deployment** with Procfile
- CI/CD pipeline with GitHub Actions
- CORS configured for frontend integration
- Swagger/OpenAPI documentation

### Scale Targets
- **Tenants**: 10,000+ active tenants
- **Users**: Millions of users across all tenants
- **Throughput**: 10,000+ requests/second
- **Response Time**: < 200ms (p95)
- **Database Query Time**: < 50ms (p95)
- **Uptime**: 99.9% SLA

This architecture is battle-tested for SaaS applications and provides a solid foundation for building a production-ready multi-tenant system with PostgreSQL at its core.
