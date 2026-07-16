/**
 * Seeds the RBAC system data (permission catalog, system roles, access matrix)
 * and — outside production — a demo school.
 *
 * Idempotent: safe to re-run. System role permissions are re-synced to the
 * matrix below on every run (tenant-cloned roles are never touched).
 *
 * Matrix source: docs/RBAC.md §5.
 *   M   = manage (implies every action on the module)
 *   V   = view only
 *   FNA = full but no approve (separation of duties, e.g. Accountant)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const MODULES = [
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

const ACTIONS = [
  'create',
  'view',
  'update',
  'delete',
  'approve',
  'export',
  'print',
  'manage',
] as const;

type ModuleName = (typeof MODULES)[number];
type Grant = 'M' | 'V' | 'FNA';
type Matrix = Record<string, Partial<Record<ModuleName, Grant>>>;

const FNA_ACTIONS = ['create', 'view', 'update', 'delete', 'export', 'print'];

// Roles granted `manage` on every module (no MATRIX entry needed).
// SUPER_ADMIN is platform staff; ORGANIZATION_ADMIN is full control within one tenant.
const FULL_ACCESS_ROLE_KEYS = ['SUPER_ADMIN', 'ORGANIZATION_ADMIN'];

const ROLES: { key: string; name: string }[] = [
  { key: 'SUPER_ADMIN', name: 'Super Admin (Platform)' },
  { key: 'ORGANIZATION_ADMIN', name: 'Organization Admin' },
  { key: 'DIRECTOR', name: 'Director' },
  { key: 'PRINCIPAL', name: 'Principal' },
  { key: 'DEPUTY_PRINCIPAL', name: 'Deputy Principal' },
  { key: 'BURSAR', name: 'Bursar' },
  { key: 'ACCOUNTANT', name: 'Accountant' },
  { key: 'HOD', name: 'Head of Department' },
  { key: 'TEACHER', name: 'Teacher' },
  { key: 'CLASS_TEACHER', name: 'Class Teacher' },
  { key: 'LIBRARIAN', name: 'Librarian' },
  { key: 'NURSE', name: 'Nurse' },
  { key: 'STOREKEEPER', name: 'Storekeeper' },
  { key: 'TRANSPORT_COORDINATOR', name: 'Transport Coordinator' },
  { key: 'HOSTEL_WARDEN', name: 'Hostel Warden' },
  { key: 'PARENT', name: 'Parent / Guardian' },
  { key: 'STUDENT', name: 'Student' },
];

// docs/RBAC.md §5 — SUPER_ADMIN handled separately (manage on all modules).
const MATRIX: Matrix = {
  DIRECTOR: {
    'school-settings': 'M',
    'user-management': 'M',
    admissions: 'M',
    'student-records': 'M',
    'staff-management': 'M',
    attendance: 'V',
    timetable: 'M',
    exams: 'M',
    'report-cards': 'M',
    homework: 'V',
    finance: 'V',
    library: 'V',
    inventory: 'V',
    procurement: 'V',
    hostel: 'V',
    transport: 'V',
    medical: 'V',
    communication: 'M',
    'reports-analytics': 'M',
  },
  PRINCIPAL: {
    'school-settings': 'V',
    'user-management': 'V',
    admissions: 'M',
    'student-records': 'M',
    'staff-management': 'V',
    attendance: 'M',
    timetable: 'M',
    exams: 'M',
    'report-cards': 'M',
    homework: 'V',
    finance: 'V',
    hostel: 'V',
    transport: 'V',
    medical: 'V',
    communication: 'M',
    'reports-analytics': 'M',
  },
  DEPUTY_PRINCIPAL: {
    admissions: 'M',
    'student-records': 'M',
    attendance: 'V',
    timetable: 'V',
    exams: 'V',
    'report-cards': 'V',
    communication: 'M',
    'reports-analytics': 'V',
  },
  BURSAR: {
    admissions: 'V',
    'student-records': 'V',
    finance: 'M',
    inventory: 'V',
    procurement: 'M',
    communication: 'V',
    'reports-analytics': 'M',
  },
  ACCOUNTANT: {
    admissions: 'V',
    'student-records': 'V',
    finance: 'FNA',
    inventory: 'V',
    procurement: 'FNA',
    communication: 'V',
    'reports-analytics': 'M',
  },
  HOD: {
    'student-records': 'V',
    attendance: 'V',
    timetable: 'M',
    exams: 'M',
    'report-cards': 'M',
    homework: 'V',
    communication: 'V',
    'reports-analytics': 'V',
  },
  TEACHER: {
    'student-records': 'V',
    'staff-management': 'V',
    attendance: 'M',
    timetable: 'V',
    exams: 'M',
    'report-cards': 'M',
    homework: 'M',
    library: 'V',
    hostel: 'V',
    medical: 'V',
    communication: 'M',
    'reports-analytics': 'V',
  },
  CLASS_TEACHER: {
    'student-records': 'M',
    'staff-management': 'V',
    attendance: 'M',
    timetable: 'V',
    exams: 'M',
    'report-cards': 'M',
    homework: 'M',
    library: 'V',
    hostel: 'V',
    medical: 'V',
    communication: 'M',
    'reports-analytics': 'V',
  },
  LIBRARIAN: {
    library: 'M',
  },
  NURSE: {
    'student-records': 'V',
    hostel: 'V',
    medical: 'M',
  },
  STOREKEEPER: {
    inventory: 'M',
    procurement: 'M',
    'reports-analytics': 'V',
  },
  TRANSPORT_COORDINATOR: {
    transport: 'M',
    'reports-analytics': 'V',
  },
  HOSTEL_WARDEN: {
    'student-records': 'V',
    attendance: 'M',
    hostel: 'M',
    medical: 'V',
    'reports-analytics': 'V',
  },
  PARENT: {
    'student-records': 'V',
    attendance: 'V',
    timetable: 'V',
    exams: 'V',
    'report-cards': 'V',
    homework: 'V',
    finance: 'V',
    library: 'V',
    hostel: 'V',
    transport: 'V',
    medical: 'V',
    communication: 'V',
  },
  STUDENT: {
    'student-records': 'V',
    attendance: 'V',
    timetable: 'V',
    exams: 'V',
    'report-cards': 'V',
    homework: 'V',
    finance: 'V',
    library: 'V',
    hostel: 'V',
    transport: 'V',
    medical: 'V',
    communication: 'V',
  },
};

function grantToActions(grant: Grant): string[] {
  switch (grant) {
    case 'M':
      return ['manage'];
    case 'V':
      return ['view'];
    case 'FNA':
      return FNA_ACTIONS;
  }
}

async function seedRbac() {
  // Purge permissions for modules that were removed from the catalog
  // (cascades to role_permissions, including tenant-cloned roles).
  const removed = await prisma.permission.deleteMany({
    where: { module: { notIn: [...MODULES] } },
  });
  if (removed.count > 0) {
    console.log(`🧹 Removed ${removed.count} permissions from retired modules`);
  }

  // Purge retired SYSTEM roles (cascades role_permissions + user_roles).
  // Tenant-owned custom roles are never touched.
  const retiredRoles = await prisma.role.deleteMany({
    where: { tenantId: null, key: { notIn: ROLES.map((r) => r.key) } },
  });
  if (retiredRoles.count > 0) {
    console.log(`🧹 Removed ${retiredRoles.count} retired system roles`);
  }

  console.log('🔐 Seeding permission catalog...');
  for (const module of MODULES) {
    for (const action of ACTIONS) {
      await prisma.permission.upsert({
        where: { module_action: { module, action } },
        update: {},
        create: { module, action },
      });
    }
  }

  const permissions = await prisma.permission.findMany();
  const permissionId = (module: string, action: string): string => {
    const found = permissions.find(
      (p) => p.module === module && p.action === action,
    );
    if (!found) throw new Error(`Missing permission ${module}:${action}`);
    return found.id;
  };

  console.log('🔐 Seeding system roles + access matrix...');
  for (const { key, name } of ROLES) {
    let role = await prisma.role.findFirst({ where: { key, tenantId: null } });
    if (!role) {
      role = await prisma.role.create({
        data: { key, name, isSystem: true, tenantId: null },
      });
    }
    const roleId = role.id;

    const grants: { module: string; actions: string[] }[] =
      FULL_ACCESS_ROLE_KEYS.includes(key)
        ? MODULES.map((m) => ({ module: m, actions: ['manage'] }))
        : Object.entries(MATRIX[key] ?? {}).map(([module, grant]) => ({
            module,
            actions: grantToActions(grant as Grant),
          }));

    // Re-sync to the matrix: this seed is the source of truth for system roles.
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: grants.flatMap(({ module, actions }) =>
        actions.map((action) => ({
          roleId,
          permissionId: permissionId(module, action),
        })),
      ),
    });
    console.log(`   ${key}: ${grants.length} module grants`);
  }
}

async function seedDemoSchool() {
  console.log('🏫 Seeding demo school...');

  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      name: 'Demo High School',
      subdomain: 'demo',
      tier: 'PROFESSIONAL',
      status: 'ACTIVE',
      maxUsers: 500,
      maxStorageGb: 100,
      maxApiCallsPerDay: 50000,
    },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  const demoUsers: { email: string; firstName: string; roles: string[] }[] = [
    { email: 'director@demo.com', firstName: 'Dan', roles: ['DIRECTOR'] },
    { email: 'principal@demo.com', firstName: 'Pat', roles: ['PRINCIPAL'] },
    { email: 'bursar@demo.com', firstName: 'Bea', roles: ['BURSAR'] },
    {
      email: 'teacher@demo.com',
      firstName: 'Tess',
      roles: ['TEACHER', 'CLASS_TEACHER'],
    },
    { email: 'parent@demo.com', firstName: 'Paula', roles: ['PARENT'] },
    { email: 'student@demo.com', firstName: 'Sam', roles: ['STUDENT'] },
  ];

  for (const { email, firstName, roles } of demoUsers) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: {},
      create: {
        tenantId: tenant.id,
        email,
        passwordHash,
        firstName,
        lastName: 'Demo',
        isActive: true,
        emailVerified: true,
      },
    });

    for (const key of roles) {
      const role = await prisma.role.findFirst({
        where: { key, tenantId: null },
      });
      if (!role) throw new Error(`System role ${key} not seeded`);
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }
    console.log(`   ${email} → ${roles.join(' + ')}`);
  }
}

async function main() {
  console.log('🌱 Starting seed...');
  await seedRbac();

  if (process.env.NODE_ENV !== 'production') {
    await seedDemoSchool();
    console.log('\n🔑 Demo logins (tenant "demo", password "password123"):');
    console.log('   director@demo.com, principal@demo.com, bursar@demo.com,');
    console.log('   teacher@demo.com, parent@demo.com, student@demo.com');
  }

  console.log('✅ Seed completed');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
