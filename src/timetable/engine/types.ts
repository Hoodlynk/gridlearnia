/**
 * Pure types for the scheduling engine.
 *
 * The engine deliberately knows nothing about Prisma, NestJS or HTTP: it takes a
 * plain {@link Problem}, returns a plain {@link Solution}, and is deterministic
 * given the same seed. That makes it unit-testable and safe to move into a
 * worker thread later without touching the algorithm.
 */

export type RoomTypeKey =
  | 'CLASSROOM'
  | 'LAB'
  | 'HALL'
  | 'LIBRARY'
  | 'SPORTS'
  | 'OTHER';

export interface EnginePeriod {
  id: string;
  /** Position in the day, including breaks — adjacency is judged on this. */
  order: number;
}

export interface EngineRoom {
  id: string;
  type: RoomTypeKey;
}

/**
 * One unit the solver places. A double period is a single lesson of length 2
 * that must occupy two adjacent periods on the same day.
 */
export interface Lesson {
  id: string;
  assignmentId: string;
  classId: string;
  subjectId: string;
  staffId: string;
  length: 1 | 2;
  requiredRoomType: RoomTypeKey | null;
  preferMorning: boolean;
}

export interface Problem {
  /** ISO weekdays that are taught, ascending. */
  days: number[];
  /** Teachable periods only, ascending by order. */
  periods: EnginePeriod[];
  lessons: Lesson[];
  rooms: EngineRoom[];
  /** Keys of `${staffId}|${day}|${periodId}` a teacher cannot teach. */
  staffUnavailable: Set<string>;
  /** Per-teacher daily ceiling; missing = no limit. */
  maxPerTeacherPerDay: Map<string, number>;
  /** Ceiling on lessons a class may have in one day; null = no limit. */
  maxPerClassPerDay: number | null;
  /** Periods with order <= this are "morning"; null disables the preference. */
  morningEndsAfterPeriod: number | null;
  /** Deterministic runs. */
  seed: number;
  /** Milliseconds the improvement phase may spend. */
  timeBudgetMs: number;
}

export interface Placement {
  lessonId: string;
  classId: string;
  subjectId: string;
  staffId: string;
  roomId: string | null;
  day: number;
  /** One entry per occupied period (2 for a double). */
  periodIds: string[];
}

export interface Solution {
  placements: Placement[];
  /** Lessons the construction phase could not place. */
  unplaced: Lesson[];
  /** Weighted soft-constraint penalty; lower is better. */
  score: number;
  breakdown: Record<string, number>;
  iterations: number;
  elapsedMs: number;
}

/** Weights for the soft constraints, highest first by importance. */
export const WEIGHTS = {
  /** A class studying the same subject more than once in a day. */
  subjectRepeatedInDay: 12,
  /** A `preferMorning` lesson placed in the afternoon. */
  morningPreferenceMissed: 8,
  /** An idle period between a teacher's lessons on a day. */
  teacherGap: 5,
  /** Spread: deviation from an even daily load for a class. */
  unevenClassLoad: 3,
  /** A teacher moving rooms between consecutive lessons. */
  teacherRoomChange: 1,
} as const;
