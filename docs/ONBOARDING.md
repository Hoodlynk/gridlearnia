# GridLearnia Onboarding Flow

> **Status: implemented.** How users, schools, and roles come into existence. RBAC details live in [RBAC.md](RBAC.md); the academic structure it provisions in [ACADEMICS.md](ACADEMICS.md).

## The flow

```
register (public)  →  platform user: tenantId = null, zero roles, zero access
      │               (email verification link sent; login requires a 2FA code)
      │
      ├─ path A: create a school
      │    save a DRAFT, then submit a school request with KYC + structure:
      │      { name, subdomain, applicantFullName, idType, idNumber, phone,
      │        sections[], documents[] }   (ID + certificate uploaded to Spaces)
      │    SUPER_ADMIN approves → ONE transaction creates the tenant, its
      │    Main Campus, the module catalogue, a current academic year + terms,
      │    the chosen sections, and binds the requester as ORGANIZATION_ADMIN.
      │    (Reviewer can also REJECT or request CHANGES with comments.)
      │
      └─ path B: join a school
           an ORGANIZATION_ADMIN (or user-management:manage holder) sends an
           invitation { email, roleKeys } → user accepts the token →
           gains tenantId + roles atomically
```

## Rules

1. **Registration is platform-level.** `POST /auth/register` takes email + password only. Emails are **globally unique**. Login is two-step (`POST /auth/login` → emailed 6-digit code → `POST /auth/2fa/verify`); see ARCHITECTURE.md §4. A verification link is emailed on registration.
2. **Zero roles = zero access.** There is no "default role" row — a user with no role assignments has an empty permission set, and every `@RequirePermissions` route denies. Frontends can treat `roles.length === 0` as "pending onboarding".
3. **Tenantless users can only touch platform-safe routes**: `/auth/*`, `/school-requests` (create/draft/mine), `/invitations/accept`. Everything tenant-scoped is behind `@RequireTenant()` and returns 403 `You must belong to a school…`.
4. **KYC + structure at request time.** An application collects the applicant's legal name, ID type/number, phone, an ID document (national ID front+back, or passport photo page) and a school certificate — uploaded to DigitalOcean Spaces (only the storage key is persisted) — plus the **education bands** (sections) the school offers. Drafts save progress; accounts rejected 3× can no longer apply.
5. **Schools are created only via approval.** `SUPER_ADMIN` reviews `GET /platform/school-requests?status=PENDING` and approves / rejects / requests changes. **Approval is one transaction** that creates the tenant, its Main Campus, the module catalogue, a current academic year + default terms, the chosen sections, and binds the requester as **ORGANIZATION_ADMIN** — the org-admin grant never exists detached from a school. Outcome emails are sent (approved / rejected / changes-requested).
6. **Invitations carry roles, fixed at send time.** 7-day expiry, single-use, SHA-256 token hash stored — the **raw token is emailed to the invitee and never returned by the API**, the same as verification and password-reset tokens. The email links to `/onboarding?invitation=<token>`, which opens the join step with the code pre-filled. `SUPER_ADMIN` and `ORGANIZATION_ADMIN` can never be granted via invitation. The accepting account's email must match the invited email, and the acceptor must not already belong to a school.
7. **Staff invites link back to a staff profile.** An invitation may carry an optional `staffId` (issued via `POST /staff/members/:id/invite`). On acceptance, the new account is bound to that `Staff` row (`Staff.userId`) in the same transaction — so a teacher's login and their teaching record are one person. See [STAFF-TEACHING.md §3](STAFF-TEACHING.md). A staff profile never *requires* an account; portal access is opt-in per person.
8. **One school per user** (current model). A user's `tenantId` is single-valued; joining a second school requires leaving the first. Multi-school membership would need a memberships join table — deliberately deferred.

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
| `PUT /api/v1/school-requests/draft` · `POST /api/v1/school-requests/draft/submit` | draft save / submit |
| `POST /api/v1/school-requests/uploads` | KYC upload (→ Spaces) |
| `GET /api/v1/school-requests/mine` | authenticated |
| `GET /api/v1/platform/school-requests?status=` | SUPER_ADMIN |
| `POST /api/v1/platform/school-requests/:id/approve` | SUPER_ADMIN |
| `POST /api/v1/platform/school-requests/:id/reject` | SUPER_ADMIN |
| `POST /api/v1/platform/school-requests/:id/request-changes` | SUPER_ADMIN |
| `POST /api/v1/invitations` | `user-management:manage` in a school |
| `GET /api/v1/invitations` | `user-management:view` in a school |
| `DELETE /api/v1/invitations/:id` | `user-management:manage` in a school |
| `POST /api/v1/invitations/accept` | any tenantless authenticated user |
| `POST /api/v1/staff/members/:id/invite` | `staff-management:update` + `user-management:manage` |
| `PUT /api/v1/staff/members/:id/user` | `staff-management:update` + `user-management:manage` |

## Verified end-to-end (2026-07-16)

register → 403 on tenant routes → school request → self-approval blocked → super admin approves → requester is ORGANIZATION_ADMIN with 19 manage permissions → invites TEACHER → org-admin-via-invite blocked → teacher registers + accepts → teacher scoped correctly → teacher can't invite → last org admin can't remove own root role → token reuse rejected.
