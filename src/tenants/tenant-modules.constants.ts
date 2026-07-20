import { MODULES, Module } from '../rbac/rbac.constants';

/**
 * Core modules can never be turned off — a school runs on these, and
 * disabling them would lock an admin out of its own settings and people.
 * They're always seeded enabled and the toggle endpoint refuses to disable
 * them (the console renders their toggle locked).
 */
export const CORE_MODULES: readonly Module[] = [
  'school-settings',
  'user-management',
];

export const isCoreModule = (moduleKey: string): boolean =>
  (CORE_MODULES as readonly string[]).includes(moduleKey);

/**
 * Modules switched ON for a newly approved school. The rest of {@link MODULES}
 * are still seeded (so the console can list them with a toggle) but start
 * disabled — they're add-ons a school opts into.
 *
 * A permission only takes effect when its module is enabled here, so this set
 * is effectively "what a new school can do out of the box". Every
 * {@link CORE_MODULES} entry must appear here.
 */
export const DEFAULT_ENABLED_MODULES: readonly Module[] = [
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

/** The full catalogue with each module's default on/off state at provisioning. */
export const DEFAULT_MODULE_STATE: { moduleKey: Module; enabled: boolean }[] =
  MODULES.map((moduleKey) => ({
    moduleKey,
    enabled: DEFAULT_ENABLED_MODULES.includes(moduleKey),
  }));
