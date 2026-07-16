# GridLearnia Onboarding Flow

> **Status: implemented.** How users, schools, and roles come into existence. RBAC details live in [RBAC.md](RBAC.md).

## The flow

```
register (public)          →  platform user: tenantId = null, zero roles, zero access
      │
      ├─ path A: create a school
      │    POST /school-requests { name, subdomain }
      │    SUPER_ADMIN approves → tenant created + requester becomes its
      │    ORGANIZATION_ADMIN (one transaction; no standing "creator" role)
      │
      └─ path B: join a school
           an ORGANIZATION_ADMIN (or user-management:manage holder) sends an
           invitation { email, roleKeys } → user accepts the token →
           gains tenantId + roles atomically
```

## Rules

1. **Registration is platform-level.** `POST /auth/register` takes email + password only. Emails are **globally unique**; login is `POST /auth/login` with email + password (no subdomain).
2. **Zero roles = zero access.** There is no "default role" row — a user with no role assignments has an empty permission set, and every `@RequirePermissions` route denies. Frontends can treat `roles.length === 0` as "pending onboarding".
3. **Tenantless users can only touch platform-safe routes**: `/auth/*`, `/school-requests` (create/mine), `/invitations/accept`. Everything tenant-scoped is behind `@RequireTenant()` and returns 403 `You must belong to a school…`.
4. **Schools are created only via approval.** `SUPER_ADMIN` reviews `GET /platform/school-requests?status=PENDING` and approves/rejects. Approval creates the tenant and binds the requester as **ORGANIZATION_ADMIN** in the same transaction — the org-admin grant never exists detached from a school.
5. **Invitations carry roles, fixed at send time.** 7-day expiry, single-use, SHA-256 token hash stored (raw token shown once — email delivery is a TODO). `SUPER_ADMIN` and `ORGANIZATION_ADMIN` can never be granted via invitation. The accepting account's email must match the invited email, and the acceptor must not already belong to a school.
6. **One school per user** (current model). A user's `tenantId` is single-valued; joining a second school requires leaving the first. Multi-school membership (e.g. a parent with children at two schools) would need a memberships join table — deliberately deferred.

## Bootstrap

The first `SUPER_ADMIN` is seeded, never created via API:

- Production: set `SEED_SUPERADMIN_EMAIL` + `SEED_SUPERADMIN_PASSWORD` and run `npm run prisma:seed`.
- Development: defaults to `superadmin@gridlearnia.dev` / `password123`.

## Endpoints

| Endpoint | Who |
|---|---|
| `POST /api/v1/auth/register` | public |
| `POST /api/v1/auth/login` | public (email + password) |
| `POST /api/v1/school-requests` | any tenantless authenticated user |
| `GET /api/v1/school-requests/mine` | authenticated |
| `GET /api/v1/platform/school-requests?status=` | SUPER_ADMIN |
| `POST /api/v1/platform/school-requests/:id/approve` | SUPER_ADMIN |
| `POST /api/v1/platform/school-requests/:id/reject` | SUPER_ADMIN |
| `POST /api/v1/invitations` | `user-management:manage` in a school |
| `GET /api/v1/invitations` | `user-management:view` in a school |
| `DELETE /api/v1/invitations/:id` | `user-management:manage` in a school |
| `POST /api/v1/invitations/accept` | any tenantless authenticated user |

## Verified end-to-end (2026-07-16)

register → 403 on tenant routes → school request → self-approval blocked → super admin approves → requester is ORGANIZATION_ADMIN with 19 manage permissions → invites TEACHER → org-admin-via-invite blocked → teacher registers + accepts → teacher scoped correctly → teacher can't invite → last org admin can't remove own root role → token reuse rejected.
