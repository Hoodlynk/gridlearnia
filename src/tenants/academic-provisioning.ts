/**
 * Defaults used when a newly approved school is provisioned with its academic
 * structure. The applicant picks which sections (education bands) the school
 * offers during onboarding; approval turns that choice into Section rows and
 * gives the school a ready-to-edit academic calendar.
 */

/** Education bands an applicant can choose from during onboarding. */
export const SECTION_OPTIONS = [
  'Pre-Primary',
  'Primary',
  'Junior Secondary',
  'Senior Secondary',
] as const;

export type SectionOption = (typeof SECTION_OPTIONS)[number];

// Default calendar seeded on approval: a three-term year (Kenya-first, matching
// the default localization). It's a starting point — the school edits terms,
// dates, and adds more years afterwards.
const DEFAULT_TERMS: { name: string; startMonth: number; endMonth: number }[] = [
  { name: 'Term 1', startMonth: 0, endMonth: 3 }, // Jan – Apr
  { name: 'Term 2', startMonth: 4, endMonth: 7 }, // May – Aug
  { name: 'Term 3', startMonth: 8, endMonth: 11 }, // Sep – Dec
];

export interface DefaultAcademicYear {
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  terms: { name: string; order: number; startDate: Date; endDate: Date }[];
}

/** Build the current calendar year with its default terms. */
export function buildDefaultAcademicYear(now = new Date()): DefaultAcademicYear {
  const year = now.getUTCFullYear();
  return {
    name: String(year),
    startDate: new Date(Date.UTC(year, 0, 1)),
    endDate: new Date(Date.UTC(year, 11, 31)),
    isCurrent: true,
    terms: DEFAULT_TERMS.map((term, index) => ({
      name: term.name,
      order: index + 1,
      startDate: new Date(Date.UTC(year, term.startMonth, 1)),
      // Day 0 of the next month = last day of endMonth.
      endDate: new Date(Date.UTC(year, term.endMonth + 1, 0)),
    })),
  };
}

/**
 * De-duplicate the chosen section names and order them by their canonical
 * position (Pre-Primary → Senior Secondary), assigning a 0-based `order`.
 * Unknown names sort to the end (they're rejected by the DTO, so this is
 * just defensive).
 */
export function orderedSections(
  names: string[],
): { name: string; order: number }[] {
  const rank = (name: string) => {
    const i = (SECTION_OPTIONS as readonly string[]).indexOf(name);
    return i === -1 ? SECTION_OPTIONS.length : i;
  };
  return [...new Set(names)]
    .sort((a, b) => rank(a) - rank(b))
    .map((name, index) => ({ name, order: index }));
}
