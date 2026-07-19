/**
 * Normalized school-name key: lowercase with every non-alphanumeric stripped,
 * so "Sunrise Academy", "SUNRISE-academy!" and "sun rise academy" all
 * collide. Must stay in sync with the SQL backfill in the school_name_key
 * migration.
 */
export function schoolNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
