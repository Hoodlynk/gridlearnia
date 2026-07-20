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

// Modules switched ON for a new/demo school. Keep in sync with
// src/tenants/tenant-modules.constants.ts (seed is intentionally standalone).
const DEFAULT_ENABLED_MODULES: ModuleName[] = [
  'school-settings',
  'user-management',
  'admissions',
  'student-records',
  'staff-management',
  'attendance',
  'timetable',
  'exams',
  'report-cards',
  'finance',
  'communication',
  'reports-analytics',
];

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

async function assignSystemRole(userId: string, key: string) {
  const role = await prisma.role.findFirst({ where: { key, tenantId: null } });
  if (!role) throw new Error(`System role ${key} not seeded`);
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
}

/**
 * Bootstrap the platform SUPER_ADMIN (a tenantless user). In production,
 * requires SEED_SUPERADMIN_EMAIL + SEED_SUPERADMIN_PASSWORD env vars; in
 * development, falls back to superadmin@gridlearnia.dev / password123.
 */
async function seedSuperAdmin() {
  const isProd = process.env.NODE_ENV === 'production';
  const email =
    process.env.SEED_SUPERADMIN_EMAIL ??
    (isProd ? undefined : 'superadmin@gridlearnia.dev');
  const password =
    process.env.SEED_SUPERADMIN_PASSWORD ?? (isProd ? undefined : 'password123');

  if (!email || !password) {
    console.log(
      '⏭️  Skipping SUPER_ADMIN bootstrap (set SEED_SUPERADMIN_EMAIL/PASSWORD)',
    );
    return;
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      firstName: 'Platform',
      lastName: 'Admin',
      isActive: true,
      emailVerified: true,
    },
  });
  await assignSystemRole(user.id, 'SUPER_ADMIN');
  console.log(`👑 SUPER_ADMIN: ${email}`);
}

// Give the demo school a full, browsable academic tree — the same shape the
// approval flow provisions, plus grades and a sample class so Phase 1b UI has
// real data to render. Idempotent: re-running never duplicates rows.
const DEMO_STRUCTURE: { name: string; order: number; grades: string[] }[] = [
  { name: 'Junior Secondary', order: 0, grades: ['Grade 7', 'Grade 8', 'Grade 9'] },
  { name: 'Senior Secondary', order: 1, grades: ['Grade 10', 'Grade 11', 'Grade 12'] },
];

async function seedDemoAcademicStructure(tenantId: string, campusId: string) {
  const year = new Date().getUTCFullYear();

  const academicYear = await prisma.academicYear.upsert({
    where: { tenantId_name: { tenantId, name: String(year) } },
    update: {},
    create: {
      tenantId,
      name: String(year),
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 11, 31)),
      isCurrent: true,
      terms: {
        create: [
          { name: 'Term 1', order: 1, startDate: new Date(Date.UTC(year, 0, 1)), endDate: new Date(Date.UTC(year, 3, 30)) },
          { name: 'Term 2', order: 2, startDate: new Date(Date.UTC(year, 4, 1)), endDate: new Date(Date.UTC(year, 7, 31)) },
          { name: 'Term 3', order: 3, startDate: new Date(Date.UTC(year, 8, 1)), endDate: new Date(Date.UTC(year, 11, 31)) },
        ],
      },
    },
  });

  // Attach the seeded CBC curriculum + competency grading to each section.
  const curriculum = await prisma.curriculum.findFirst({
    where: { tenantId: null, key: 'CBC' },
  });
  const gradingScheme = await prisma.gradingScheme.findFirst({
    where: { tenantId: null, key: 'CBC-COMPETENCY' },
  });

  for (const sec of DEMO_STRUCTURE) {
    let section = await prisma.section.findFirst({
      where: { tenantId, campusId, name: sec.name },
    });
    if (!section) {
      section = await prisma.section.create({
        data: {
          tenantId,
          campusId,
          name: sec.name,
          order: sec.order,
          curriculumId: curriculum?.id ?? null,
          gradingSchemeId: gradingScheme?.id ?? null,
        },
      });
    }

    for (let i = 0; i < sec.grades.length; i++) {
      const gradeName = sec.grades[i];
      let grade = await prisma.grade.findFirst({
        where: { tenantId, sectionId: section.id, name: gradeName },
      });
      if (!grade) {
        grade = await prisma.grade.create({
          data: { tenantId, sectionId: section.id, name: gradeName, order: i },
        });
      }

      const existingClass = await prisma.class.findFirst({
        where: {
          tenantId,
          gradeId: grade.id,
          academicYearId: academicYear.id,
          name: 'East',
        },
      });
      if (!existingClass) {
        await prisma.class.create({
          data: {
            tenantId,
            campusId,
            gradeId: grade.id,
            academicYearId: academicYear.id,
            name: 'East',
          },
        });
      }
    }
  }

  console.log(
    `   academic tree: ${DEMO_STRUCTURE.length} sections, ${DEMO_STRUCTURE.reduce((n, s) => n + s.grades.length, 0)} grades (year ${year})`,
  );
}

// A small demo roster on top of the academic tree: a handful of students, one
// guardian each, and an enrollment into a real class of the current year.
const DEMO_STUDENTS: {
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender: 'MALE' | 'FEMALE';
  gradeName: string;
  guardian: { firstName: string; relationship: string };
}[] = [
  { admissionNumber: 'ADM-001', firstName: 'Amina', lastName: 'Yusuf', gender: 'FEMALE', gradeName: 'Grade 7', guardian: { firstName: 'Halima', relationship: 'Mother' } },
  { admissionNumber: 'ADM-002', firstName: 'Brian', lastName: 'Kamau', gender: 'MALE', gradeName: 'Grade 7', guardian: { firstName: 'Joseph', relationship: 'Father' } },
  { admissionNumber: 'ADM-003', firstName: 'Chelsea', lastName: 'Achieng', gender: 'FEMALE', gradeName: 'Grade 8', guardian: { firstName: 'Grace', relationship: 'Mother' } },
  { admissionNumber: 'ADM-004', firstName: 'David', lastName: 'Mwangi', gender: 'MALE', gradeName: 'Grade 10', guardian: { firstName: 'Peter', relationship: 'Father' } },
];

async function seedDemoRoster(tenantId: string, campusId: string) {
  const year = new Date().getUTCFullYear();
  const academicYear = await prisma.academicYear.findFirst({
    where: { tenantId, name: String(year) },
    select: { id: true },
  });
  if (!academicYear) return;

  let enrolled = 0;
  for (const s of DEMO_STUDENTS) {
    const student = await prisma.student.upsert({
      where: {
        tenantId_admissionNumber: { tenantId, admissionNumber: s.admissionNumber },
      },
      update: {},
      create: {
        tenantId,
        campusId,
        admissionNumber: s.admissionNumber,
        firstName: s.firstName,
        lastName: s.lastName,
        gender: s.gender,
        status: 'ACTIVE',
        admittedOn: new Date(Date.UTC(year, 0, 8)),
      },
    });

    // One guardian per student (idempotent: skip if the student already has one).
    const existingLink = await prisma.studentGuardian.findFirst({
      where: { studentId: student.id },
      select: { studentId: true },
    });
    if (!existingLink) {
      const guardian = await prisma.guardian.create({
        data: {
          tenantId,
          firstName: s.guardian.firstName,
          lastName: s.lastName,
          phone: '+254700000000',
        },
      });
      await prisma.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardian.id,
          relationship: s.guardian.relationship,
          isPrimary: true,
        },
      });
    }

    // Enroll into the "East" class of the matching grade for the current year.
    const cls = await prisma.class.findFirst({
      where: {
        tenantId,
        academicYearId: academicYear.id,
        name: 'East',
        grade: { name: s.gradeName },
      },
      select: { id: true, campusId: true },
    });
    if (cls) {
      const existing = await prisma.enrollment.findFirst({
        where: { studentId: student.id, academicYearId: academicYear.id },
        select: { id: true },
      });
      if (!existing) {
        await prisma.enrollment.create({
          data: {
            tenantId,
            studentId: student.id,
            classId: cls.id,
            academicYearId: academicYear.id,
            campusId: cls.campusId,
          },
        });
        enrolled++;
      }
    }
  }
  console.log(
    `   roster: ${DEMO_STUDENTS.length} students, ${enrolled} new enrollments (year ${year})`,
  );
}

// Attendance for one day + a couple of graded assessments per demo class, so the
// register, score sheet and report card all have data out of the box.
async function seedDemoAttendanceAndAssessment(tenantId: string) {
  const year = new Date().getUTCFullYear();
  const academicYear = await prisma.academicYear.findFirst({
    where: { tenantId, name: String(year) },
    select: { id: true },
  });
  if (!academicYear) return;

  const classes = await prisma.class.findMany({
    where: { tenantId, academicYearId: academicYear.id, deletedAt: null },
    select: {
      id: true,
      grade: {
        select: { section: { select: { curriculumId: true } } },
      },
      enrollments: {
        where: { status: 'ENROLLED' },
        select: { id: true },
      },
    },
  });

  const today = new Date();
  const date = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  let attendanceMarked = 0;
  let assessmentsCreated = 0;

  for (const cls of classes) {
    if (cls.enrollments.length === 0) continue;

    // Attendance: everyone present, first student late (idempotent per day).
    for (let i = 0; i < cls.enrollments.length; i++) {
      const enrollmentId = cls.enrollments[i].id;
      await prisma.attendanceRecord.upsert({
        where: { enrollmentId_date: { enrollmentId, date } },
        update: {},
        create: {
          tenantId,
          classId: cls.id,
          enrollmentId,
          date,
          status: i === 0 ? 'LATE' : 'PRESENT',
        },
      });
      attendanceMarked++;
    }

    // Assessment: a Mid-Term in the first two subjects of the section's curriculum.
    const curriculumId = cls.grade.section.curriculumId;
    if (!curriculumId) continue;
    const subjects = await prisma.subject.findMany({
      where: { curriculumId },
      select: { id: true },
      orderBy: { code: 'asc' },
      take: 2,
    });

    for (const subject of subjects) {
      const existing = await prisma.assessment.findFirst({
        where: {
          tenantId,
          classId: cls.id,
          subjectId: subject.id,
          name: 'Mid-Term',
        },
        select: { id: true },
      });
      if (existing) continue;

      const assessment = await prisma.assessment.create({
        data: {
          tenantId,
          classId: cls.id,
          subjectId: subject.id,
          academicYearId: academicYear.id,
          name: 'Mid-Term',
          maxScore: 100,
          date,
        },
      });
      assessmentsCreated++;

      await prisma.assessmentScore.createMany({
        data: cls.enrollments.map((e, i) => ({
          tenantId,
          assessmentId: assessment.id,
          enrollmentId: e.id,
          // Spread of pseudo scores 55–95 for a realistic-looking sheet.
          score: 55 + ((i * 13) % 40),
        })),
      });
    }
  }

  console.log(
    `   attendance/assessment: ${attendanceMarked} records marked, ${assessmentsCreated} assessments scored (year ${year})`,
  );
}

// A small teaching staff: two departments (each with an HOD + subjects), a few
// teachers, a class teacher per class, and some teaching assignments.
const DEMO_STAFF: {
  staffNumber: string;
  title: string;
  firstName: string;
  lastName: string;
}[] = [
  { staffNumber: 'TSC-001', title: 'Mr', firstName: 'Samuel', lastName: 'Njoroge' },
  { staffNumber: 'TSC-002', title: 'Ms', firstName: 'Faith', lastName: 'Wambui' },
  { staffNumber: 'TSC-003', title: 'Mr', firstName: 'Peter', lastName: 'Omondi' },
];

const DEMO_DEPARTMENTS: { name: string; code: string; subjectCodes: string[] }[] = [
  { name: 'Sciences', code: 'SCI', subjectCodes: ['MAT', 'SCI', 'MATH', 'BIO'] },
  { name: 'Languages', code: 'LNG', subjectCodes: ['ENG', 'KIS'] },
];

async function seedDemoStaff(tenantId: string, campusId: string) {
  const year = new Date().getUTCFullYear();
  const academicYear = await prisma.academicYear.findFirst({
    where: { tenantId, name: String(year) },
    select: { id: true },
  });

  // Staff (idempotent on staffNumber).
  const staff = [];
  for (const s of DEMO_STAFF) {
    const row = await prisma.staff.upsert({
      where: {
        tenantId_staffNumber: { tenantId, staffNumber: s.staffNumber },
      },
      update: {},
      create: {
        tenantId,
        campusId,
        staffNumber: s.staffNumber,
        title: s.title,
        firstName: s.firstName,
        lastName: s.lastName,
        employmentType: 'FULL_TIME',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    staff.push(row.id);
  }

  // Departments with an HOD + subject links.
  const curriculum = await prisma.curriculum.findFirst({
    where: { tenantId: null, key: 'CBC' },
    select: { id: true },
  });
  for (let i = 0; i < DEMO_DEPARTMENTS.length; i++) {
    const d = DEMO_DEPARTMENTS[i];
    const dept = await prisma.department.upsert({
      where: { tenantId_name: { tenantId, name: d.name } },
      update: {},
      create: {
        tenantId,
        name: d.name,
        code: d.code,
        headId: staff[i] ?? null,
      },
      select: { id: true },
    });
    // Make the HOD (and a second teacher) members of the department.
    await prisma.staff.updateMany({
      where: { id: { in: [staff[i], staff[i + 1]].filter(Boolean) as string[] } },
      data: { departmentId: dept.id },
    });
    if (curriculum) {
      const subjects = await prisma.subject.findMany({
        where: { curriculumId: curriculum.id, code: { in: d.subjectCodes } },
        select: { id: true },
      });
      for (const subject of subjects) {
        await prisma.departmentSubject.upsert({
          where: {
            departmentId_subjectId: {
              departmentId: dept.id,
              subjectId: subject.id,
            },
          },
          update: {},
          create: { departmentId: dept.id, subjectId: subject.id },
        });
      }
    }
  }

  if (!academicYear) {
    console.log(`   staff: ${staff.length} staff, ${DEMO_DEPARTMENTS.length} departments`);
    return;
  }

  // Class teacher + a couple of teaching assignments per class.
  const classes = await prisma.class.findMany({
    where: { tenantId, academicYearId: academicYear.id, deletedAt: null },
    select: {
      id: true,
      grade: { select: { section: { select: { curriculumId: true } } } },
    },
  });
  let assignments = 0;
  for (let c = 0; c < classes.length; c++) {
    const cls = classes[c];
    // Rotate the class teacher across the demo staff.
    await prisma.class.update({
      where: { id: cls.id },
      data: { classTeacherId: staff[c % staff.length] },
    });

    const curriculumId = cls.grade.section.curriculumId;
    if (!curriculumId) continue;
    const subjects = await prisma.subject.findMany({
      where: { curriculumId },
      select: { id: true },
      orderBy: { code: 'asc' },
      take: 2,
    });
    for (let s = 0; s < subjects.length; s++) {
      try {
        await prisma.teachingAssignment.create({
          data: {
            tenantId,
            staffId: staff[s % staff.length],
            classId: cls.id,
            subjectId: subjects[s].id,
            academicYearId: academicYear.id,
          },
        });
        assignments++;
      } catch {
        // unique (staff, class, subject, year) — already seeded, skip.
      }
    }
  }

  console.log(
    `   staff: ${staff.length} staff, ${DEMO_DEPARTMENTS.length} departments, ${assignments} teaching assignments (year ${year})`,
  );
}

// Timetable setup: a standard 6-teachable-period day, a few rooms, and lesson
// requirements on the demo teaching assignments, so the readiness check and
// (in 5b) the solver have a realistic problem to work with.
const DEMO_PERIODS: {
  name: string;
  order: number;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
}[] = [
  { name: 'Period 1', order: 1, startTime: '08:00', endTime: '08:40' },
  { name: 'Period 2', order: 2, startTime: '08:40', endTime: '09:20' },
  { name: 'Break', order: 3, startTime: '09:20', endTime: '09:40', isBreak: true },
  { name: 'Period 3', order: 4, startTime: '09:40', endTime: '10:20' },
  { name: 'Period 4', order: 5, startTime: '10:20', endTime: '11:00' },
  { name: 'Lunch', order: 6, startTime: '11:00', endTime: '11:40', isBreak: true },
  { name: 'Period 5', order: 7, startTime: '11:40', endTime: '12:20' },
  { name: 'Period 6', order: 8, startTime: '12:20', endTime: '13:00' },
];

const DEMO_ROOMS: { name: string; code: string; type: 'CLASSROOM' | 'LAB'; capacity: number }[] = [
  { name: 'Room 1', code: 'R1', type: 'CLASSROOM', capacity: 40 },
  { name: 'Room 2', code: 'R2', type: 'CLASSROOM', capacity: 40 },
  { name: 'Room 3', code: 'R3', type: 'CLASSROOM', capacity: 40 },
  { name: 'Room 4', code: 'R4', type: 'CLASSROOM', capacity: 40 },
  { name: 'Room 5', code: 'R5', type: 'CLASSROOM', capacity: 40 },
  { name: 'Room 6', code: 'R6', type: 'CLASSROOM', capacity: 40 },
  { name: 'Science Lab', code: 'LAB1', type: 'LAB', capacity: 32 },
];

async function seedDemoTimetableSetup(tenantId: string, campusId: string) {
  await prisma.timetableSettings.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      teachingDays: [1, 2, 3, 4, 5],
      // The layout this demo grid was built from — a school edits these freely.
      dayStartTime: '08:00',
      lessonDurationMinutes: 40,
      lessonsPerDay: 6,
      maxPeriodsPerTeacherPerDay: 6,
      maxLessonsPerClassPerDay: 6,
      // Periods 1–4 (orders 1,2,4,5) are the "morning" half.
      morningEndsAfterPeriod: 5,
    },
  });

  for (const p of DEMO_PERIODS) {
    await prisma.period.upsert({
      where: { tenantId_order: { tenantId, order: p.order } },
      update: {},
      create: {
        tenantId,
        name: p.name,
        order: p.order,
        startTime: p.startTime,
        endTime: p.endTime,
        isBreak: p.isBreak ?? false,
      },
    });
  }

  for (const r of DEMO_ROOMS) {
    await prisma.room.upsert({
      where: { tenantId_code: { tenantId, code: r.code } },
      update: {},
      create: {
        tenantId,
        campusId,
        name: r.name,
        code: r.code,
        type: r.type,
        capacity: r.capacity,
      },
    });
  }

  // Give every demo assignment a weekly load. The first subject in each class
  // gets a lab double period, so doubles + room types are exercised.
  const year = new Date().getUTCFullYear();
  const academicYear = await prisma.academicYear.findFirst({
    where: { tenantId, name: String(year) },
    select: { id: true },
  });
  if (!academicYear) return;

  const assignments = await prisma.teachingAssignment.findMany({
    where: { tenantId, academicYearId: academicYear.id },
    select: { id: true, classId: true },
    orderBy: { createdAt: 'asc' },
  });

  const seenClass = new Set<string>();
  let configured = 0;
  for (const a of assignments) {
    const isFirstForClass = !seenClass.has(a.classId);
    seenClass.add(a.classId);
    await prisma.teachingAssignment.update({
      where: { id: a.id },
      data: {
        periodsPerWeek: 5,
        doublePeriods: isFirstForClass ? 1 : 0,
        requiredRoomType: isFirstForClass ? 'LAB' : null,
        preferMorning: isFirstForClass,
      },
    });
    configured++;
  }

  const teachable = DEMO_PERIODS.filter((p) => !p.isBreak).length;
  console.log(
    `   timetable setup: ${teachable} teachable periods × 5 days = ${teachable * 5} slots, ${DEMO_ROOMS.length} rooms, ${configured} requirements`,
  );
}

async function seedDemoSchool() {
  console.log('🏫 Seeding demo school...');

  const demoName = 'Demo High School';
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      name: demoName,
      // Normalized name key (lowercase, alphanumerics only) — matches
      // schoolNameKey() in src/common/utils; required + unique on Tenant.
      nameKey: demoName.toLowerCase().replace(/[^a-z0-9]/g, ''),
      subdomain: 'demo',
      tier: 'PROFESSIONAL',
      status: 'ACTIVE',
      maxUsers: 500,
      maxStorageGb: 100,
      maxApiCallsPerDay: 50000,
    },
  });

  // Match the approval flow: one main campus + the module catalogue.
  const mainCampus = await prisma.campus.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Main Campus',
      code: 'MAIN',
      isMain: true,
    },
  });
  for (const moduleKey of MODULES) {
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId: tenant.id, moduleKey } },
      update: {},
      create: {
        tenantId: tenant.id,
        moduleKey,
        enabled: DEFAULT_ENABLED_MODULES.includes(moduleKey),
      },
    });
  }

  await seedDemoAcademicStructure(tenant.id, mainCampus.id);
  await seedDemoRoster(tenant.id, mainCampus.id);
  await seedDemoAttendanceAndAssessment(tenant.id);
  await seedDemoStaff(tenant.id, mainCampus.id);
  await seedDemoTimetableSetup(tenant.id, mainCampus.id);

  const passwordHash = await bcrypt.hash('password123', 10);

  const demoUsers: { email: string; firstName: string; roles: string[] }[] = [
    {
      email: 'orgadmin@demo.com',
      firstName: 'Olive',
      roles: ['ORGANIZATION_ADMIN'],
    },
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
      where: { email },
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
      await assignSystemRole(user.id, key);
    }
    console.log(`   ${email} → ${roles.join(' + ')}`);
  }
}

// ── Academic engine: system templates (tenantId = null, shared by all) ──────

interface SubjectSeed {
  code: string;
  name: string;
}

interface BandSeed {
  label: string;
  order: number;
  minScore?: number;
  maxScore?: number;
  points?: number;
  remark?: string;
}

type GradingType = 'PERCENTAGE' | 'LETTER' | 'POINTS' | 'COMPETENCY' | 'PASS_FAIL';

const SYSTEM_CURRICULA: {
  key: string;
  name: string;
  country: string | null;
  subjects: SubjectSeed[];
}[] = [
  {
    key: 'CBC',
    name: 'Competency-Based Curriculum',
    country: 'KE',
    subjects: [
      { code: 'ENG', name: 'English' },
      { code: 'KIS', name: 'Kiswahili' },
      { code: 'MATH', name: 'Mathematics' },
      { code: 'SCI', name: 'Science & Technology' },
      { code: 'SST', name: 'Social Studies' },
      { code: 'CRE', name: 'Religious Education' },
      { code: 'ARTS', name: 'Creative Arts' },
    ],
  },
  {
    key: '8-4-4',
    name: '8-4-4 System',
    country: 'KE',
    subjects: [
      { code: 'ENG', name: 'English' },
      { code: 'KIS', name: 'Kiswahili' },
      { code: 'MATH', name: 'Mathematics' },
      { code: 'BIO', name: 'Biology' },
      { code: 'CHEM', name: 'Chemistry' },
      { code: 'PHY', name: 'Physics' },
      { code: 'HIST', name: 'History & Government' },
      { code: 'GEO', name: 'Geography' },
      { code: 'CRE', name: 'Religious Education' },
    ],
  },
  {
    key: 'IGCSE',
    name: 'Cambridge IGCSE',
    country: 'GB',
    subjects: [
      { code: 'ENG', name: 'English Language' },
      { code: 'MATH', name: 'Mathematics' },
      { code: 'PHY', name: 'Physics' },
      { code: 'CHEM', name: 'Chemistry' },
      { code: 'BIO', name: 'Biology' },
      { code: 'ICT', name: 'Information & Communication Technology' },
      { code: 'BUS', name: 'Business Studies' },
    ],
  },
  {
    key: 'IB',
    name: 'International Baccalaureate',
    country: null,
    subjects: [
      { code: 'LANGA', name: 'Language A: Literature' },
      { code: 'LANGB', name: 'Language B' },
      { code: 'MATH', name: 'Mathematics' },
      { code: 'SCI', name: 'Sciences' },
      { code: 'IS', name: 'Individuals & Societies' },
      { code: 'ARTS', name: 'The Arts' },
    ],
  },
];

const SYSTEM_GRADING_SCHEMES: {
  key: string;
  name: string;
  type: GradingType;
  bands: BandSeed[];
}[] = [
  {
    key: 'PERCENTAGE',
    name: 'Percentage (0–100)',
    type: 'PERCENTAGE',
    bands: [],
  },
  {
    key: 'CBC-COMPETENCY',
    name: 'CBC Competency Levels',
    type: 'COMPETENCY',
    bands: [
      { label: 'EE', order: 1, minScore: 80, maxScore: 100, remark: 'Exceeding Expectation' },
      { label: 'ME', order: 2, minScore: 50, maxScore: 79, remark: 'Meeting Expectation' },
      { label: 'AE', order: 3, minScore: 30, maxScore: 49, remark: 'Approaching Expectation' },
      { label: 'BE', order: 4, minScore: 0, maxScore: 29, remark: 'Below Expectation' },
    ],
  },
  {
    key: 'LETTER-KE',
    name: 'KCSE 12-Point Letter Grade',
    type: 'LETTER',
    bands: [
      { label: 'A', order: 1, minScore: 80, maxScore: 100, points: 12 },
      { label: 'A-', order: 2, minScore: 75, maxScore: 79, points: 11 },
      { label: 'B+', order: 3, minScore: 70, maxScore: 74, points: 10 },
      { label: 'B', order: 4, minScore: 65, maxScore: 69, points: 9 },
      { label: 'B-', order: 5, minScore: 60, maxScore: 64, points: 8 },
      { label: 'C+', order: 6, minScore: 55, maxScore: 59, points: 7 },
      { label: 'C', order: 7, minScore: 50, maxScore: 54, points: 6 },
      { label: 'C-', order: 8, minScore: 45, maxScore: 49, points: 5 },
      { label: 'D+', order: 9, minScore: 40, maxScore: 44, points: 4 },
      { label: 'D', order: 10, minScore: 35, maxScore: 39, points: 3 },
      { label: 'D-', order: 11, minScore: 30, maxScore: 34, points: 2 },
      { label: 'E', order: 12, minScore: 0, maxScore: 29, points: 1 },
    ],
  },
  {
    key: 'GPA-4',
    name: '4.0 GPA Scale',
    type: 'POINTS',
    bands: [
      { label: 'A', order: 1, minScore: 90, maxScore: 100, points: 4 },
      { label: 'B', order: 2, minScore: 80, maxScore: 89, points: 3 },
      { label: 'C', order: 3, minScore: 70, maxScore: 79, points: 2 },
      { label: 'D', order: 4, minScore: 60, maxScore: 69, points: 1 },
      { label: 'F', order: 5, minScore: 0, maxScore: 59, points: 0 },
    ],
  },
];

async function seedAcademicTemplates() {
  console.log('📚 Seeding academic templates (curricula, grading)...');

  for (const c of SYSTEM_CURRICULA) {
    // System rows are keyed on (tenantId = NULL, key); Postgres NULL semantics
    // make a compound-unique upsert unreliable, so findFirst-or-create.
    const existing = await prisma.curriculum.findFirst({
      where: { tenantId: null, key: c.key },
    });
    if (existing) continue;
    await prisma.curriculum.create({
      data: {
        tenantId: null,
        key: c.key,
        name: c.name,
        country: c.country,
        isSystem: true,
        subjects: {
          create: c.subjects.map((s) => ({ code: s.code, name: s.name })),
        },
      },
    });
    console.log(`   curriculum ${c.key}: ${c.subjects.length} subjects`);
  }

  for (const s of SYSTEM_GRADING_SCHEMES) {
    const existing = await prisma.gradingScheme.findFirst({
      where: { tenantId: null, key: s.key },
    });
    if (existing) continue;
    await prisma.gradingScheme.create({
      data: {
        tenantId: null,
        key: s.key,
        name: s.name,
        type: s.type,
        isSystem: true,
        bands: {
          create: s.bands.map((b) => ({
            label: b.label,
            order: b.order,
            minScore: b.minScore,
            maxScore: b.maxScore,
            points: b.points,
            remark: b.remark,
          })),
        },
      },
    });
    console.log(`   grading scheme ${s.key}: ${s.bands.length} bands`);
  }
}

async function main() {
  console.log('🌱 Starting seed...');
  await seedRbac();
  await seedSuperAdmin();
  await seedAcademicTemplates();

  if (process.env.NODE_ENV !== 'production') {
    await seedDemoSchool();
    console.log('\n🔑 Demo logins (password "password123"):');
    console.log('   superadmin@gridlearnia.dev (platform)');
    console.log('   orgadmin@demo.com, director@demo.com, principal@demo.com,');
    console.log('   bursar@demo.com, teacher@demo.com, parent@demo.com, student@demo.com');
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
