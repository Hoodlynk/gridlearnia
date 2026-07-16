export const MODULES = [
  'school-settings',
  'user-management',
  'admissions',
  'student-records',
  'staff-management',
  'attendance',
  'timetable',
  'exams',
  'report-cards',
  'homework',
  'finance',
  'library',
  'inventory',
  'procurement',
  'hostel',
  'transport',
  'medical',
  'communication',
  'reports-analytics',
] as const;

export const ACTIONS = [
  'create',
  'view',
  'update',
  'delete',
  'approve',
  'export',
  'print',
  'manage',
] as const;

export type Module = (typeof MODULES)[number];
export type Action = (typeof ACTIONS)[number];

/** `module:action` string, e.g. "exams:update" */
export type PermissionKey = `${Module}:${Action}`;

export const ROLE_KEYS = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ORGANIZATION_ADMIN: 'ORGANIZATION_ADMIN',
  DIRECTOR: 'DIRECTOR',
  PRINCIPAL: 'PRINCIPAL',
  DEPUTY_PRINCIPAL: 'DEPUTY_PRINCIPAL',
  BURSAR: 'BURSAR',
  ACCOUNTANT: 'ACCOUNTANT',
  HOD: 'HOD',
  TEACHER: 'TEACHER',
  CLASS_TEACHER: 'CLASS_TEACHER',
  LIBRARIAN: 'LIBRARIAN',
  NURSE: 'NURSE',
  STOREKEEPER: 'STOREKEEPER',
  TRANSPORT_COORDINATOR: 'TRANSPORT_COORDINATOR',
  HOSTEL_WARDEN: 'HOSTEL_WARDEN',
  PARENT: 'PARENT',
  STUDENT: 'STUDENT',
} as const;

/** Roles that can never be assigned through the tenant-facing API. */
export const UNASSIGNABLE_ROLE_KEYS: string[] = [ROLE_KEYS.SUPER_ADMIN];

/**
 * The tenant-root role, bound to the school creator on approval.
 * A school must always keep at least one holder: the last one cannot be
 * removed, deactivated, or deleted. Granting/revoking it requires an
 * existing ORGANIZATION_ADMIN of the school (or platform SUPER_ADMIN).
 */
export const TENANT_ROOT_ROLE = ROLE_KEYS.ORGANIZATION_ADMIN;

/** Roles that cannot be handed out via invitations. */
export const UNINVITABLE_ROLE_KEYS: string[] = [
  ROLE_KEYS.SUPER_ADMIN,
  ROLE_KEYS.ORGANIZATION_ADMIN,
];
