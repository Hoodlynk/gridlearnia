import { Lesson, Placement, Problem, Solution, WEIGHTS } from './types';

/** Deterministic PRNG (mulberry32) — same seed, same timetable. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const busyKey = (id: string, day: number, periodId: string) =>
  `${id}|${day}|${periodId}`;
const dayKey = (id: string, day: number) => `${id}|${day}`;

interface Candidate {
  day: number;
  /** Index into problem.periods of the first occupied period. */
  startIndex: number;
  roomId: string | null;
}

/**
 * Mutable search state.
 *
 * Two jobs: occupancy maps enforce the *hard* constraints (nothing that would
 * clash is ever written), and an **incremental soft-constraint score** is kept
 * live — every place/remove adjusts only the penalty groups it touches, so the
 * search never rescans the whole timetable to know a move's cost. That is the
 * difference between ~50k and ~500k iterations in the same time budget.
 */
class State {
  readonly classBusy = new Map<string, string>();
  readonly staffBusy = new Map<string, string>();
  readonly roomBusy = new Map<string, string>();
  readonly classDay = new Map<string, number>();
  readonly staffDay = new Map<string, number>();
  readonly placements = new Map<string, Placement>();

  // ── Incremental scoring aggregates ──────────────────────────────────────
  private readonly orderOf: Map<string, number>;
  private readonly teachableOrders: Set<number>;
  private readonly subjCount = new Map<string, number>(); // class|day|subj → n
  private readonly teacherList = new Map<
    string,
    { order: number; room: string | null; lid: string }[]
  >(); // staff|day → occupied slots
  private readonly teacherPen = new Map<string, number>(); // staff|day → gap+room
  private readonly classPerDay = new Map<string, Map<number, number>>();
  private readonly classPen = new Map<string, number>(); // classId → spread
  private readonly morningPen = new Map<string, number>(); // lessonId → penalty
  /** Running soft-constraint total (unrounded). */
  private soft = 0;

  constructor(private readonly p: Problem) {
    this.orderOf = new Map(p.periods.map((x) => [x.id, x.order]));
    this.teachableOrders = new Set(p.periods.map((x) => x.order));
  }

  /** Current soft-constraint score (unrounded — use for search decisions). */
  get scoreExact(): number {
    return this.soft;
  }

  /** Overwrite the running total (used to resync away float drift). */
  resetScore(exact: number): void {
    this.soft = exact;
  }

  place(lesson: Lesson, c: Candidate): void {
    const periodIds = this.periodsFor(c, lesson.length);
    for (const pid of periodIds) {
      this.classBusy.set(busyKey(lesson.classId, c.day, pid), lesson.id);
      this.staffBusy.set(busyKey(lesson.staffId, c.day, pid), lesson.id);
      if (c.roomId) {
        this.roomBusy.set(busyKey(c.roomId, c.day, pid), lesson.id);
      }
    }
    this.bump(this.classDay, dayKey(lesson.classId, c.day), lesson.length);
    this.bump(this.staffDay, dayKey(lesson.staffId, c.day), lesson.length);
    const placement: Placement = {
      lessonId: lesson.id,
      classId: lesson.classId,
      subjectId: lesson.subjectId,
      staffId: lesson.staffId,
      roomId: c.roomId,
      day: c.day,
      periodIds,
    };
    this.placements.set(lesson.id, placement);
    this.addScore(placement, lesson);
  }

  /** Put a lesson back exactly where it was (used to undo a rejected move). */
  restore(lesson: Lesson, placement: Placement): void {
    for (const pid of placement.periodIds) {
      this.classBusy.set(busyKey(lesson.classId, placement.day, pid), lesson.id);
      this.staffBusy.set(busyKey(lesson.staffId, placement.day, pid), lesson.id);
      if (placement.roomId) {
        this.roomBusy.set(busyKey(placement.roomId, placement.day, pid), lesson.id);
      }
    }
    this.bump(this.classDay, dayKey(lesson.classId, placement.day), lesson.length);
    this.bump(this.staffDay, dayKey(lesson.staffId, placement.day), lesson.length);
    this.placements.set(lesson.id, placement);
    this.addScore(placement, lesson);
  }

  remove(lesson: Lesson): Placement | undefined {
    const placement = this.placements.get(lesson.id);
    if (!placement) return undefined;
    this.subScore(placement, lesson);
    for (const pid of placement.periodIds) {
      this.classBusy.delete(busyKey(lesson.classId, placement.day, pid));
      this.staffBusy.delete(busyKey(lesson.staffId, placement.day, pid));
      if (placement.roomId) {
        this.roomBusy.delete(busyKey(placement.roomId, placement.day, pid));
      }
    }
    this.bump(this.classDay, dayKey(lesson.classId, placement.day), -lesson.length);
    this.bump(this.staffDay, dayKey(lesson.staffId, placement.day), -lesson.length);
    this.placements.delete(lesson.id);
    return placement;
  }

  periodsFor(c: Candidate, length: number): string[] {
    const ids: string[] = [];
    for (let i = 0; i < length; i++) {
      ids.push(this.p.periods[c.startIndex + i].id);
    }
    return ids;
  }

  private bump(map: Map<string, number>, key: string, by: number): void {
    const next = (map.get(key) ?? 0) + by;
    if (next <= 0) map.delete(key);
    else map.set(key, next);
  }

  // ── scoring: only the groups a placement touches are recomputed ──────────

  private addScore(pl: Placement, lesson: Lesson): void {
    // Subject repeated in a day (per class).
    const sk = `${pl.classId}|${pl.day}|${pl.subjectId}`;
    const before = this.subjCount.get(sk) ?? 0;
    this.soft += (repeat(before + 1) - repeat(before)) * WEIGHTS.subjectRepeatedInDay;
    this.subjCount.set(sk, before + 1);

    // Morning preference (depends only on this placement).
    if (this.p.morningEndsAfterPeriod != null && lesson.preferMorning) {
      let missed = 0;
      for (const pid of pl.periodIds) {
        if ((this.orderOf.get(pid) ?? 0) > this.p.morningEndsAfterPeriod) missed++;
      }
      const pen = missed * WEIGHTS.morningPreferenceMissed;
      if (pen) {
        this.morningPen.set(pl.lessonId, pen);
        this.soft += pen;
      }
    }

    // Teacher gaps + room changes for the affected teacher-day.
    const tk = dayKey(pl.staffId, pl.day);
    const list = this.teacherList.get(tk) ?? [];
    for (const pid of pl.periodIds) {
      list.push({
        order: this.orderOf.get(pid) ?? 0,
        room: pl.roomId,
        lid: pl.lessonId,
      });
    }
    this.teacherList.set(tk, list);
    this.recomputeTeacher(tk);

    // Even class spread across the week.
    this.bumpClassDay(pl.classId, pl.day, pl.periodIds.length);
    this.recomputeClass(pl.classId);
  }

  private subScore(pl: Placement, lesson: Lesson): void {
    const sk = `${pl.classId}|${pl.day}|${pl.subjectId}`;
    const before = this.subjCount.get(sk) ?? 0;
    this.soft += (repeat(before - 1) - repeat(before)) * WEIGHTS.subjectRepeatedInDay;
    if (before - 1 <= 0) this.subjCount.delete(sk);
    else this.subjCount.set(sk, before - 1);

    if (this.p.morningEndsAfterPeriod != null && lesson.preferMorning) {
      const pen = this.morningPen.get(pl.lessonId) ?? 0;
      this.soft -= pen;
      this.morningPen.delete(pl.lessonId);
    }

    const tk = dayKey(pl.staffId, pl.day);
    const list = (this.teacherList.get(tk) ?? []).filter(
      (e) => e.lid !== pl.lessonId,
    );
    if (list.length) this.teacherList.set(tk, list);
    else this.teacherList.delete(tk);
    this.recomputeTeacher(tk);

    this.bumpClassDay(pl.classId, pl.day, -pl.periodIds.length);
    this.recomputeClass(pl.classId);
  }

  private recomputeTeacher(tk: string): void {
    const old = this.teacherPen.get(tk) ?? 0;
    const list = this.teacherList.get(tk);
    let pen = 0;
    if (list && list.length > 1) {
      const sorted = [...list].sort((a, b) => a.order - b.order);
      for (let i = 1; i < sorted.length; i++) {
        for (let o = sorted[i - 1].order + 1; o < sorted[i].order; o++) {
          if (this.teachableOrders.has(o)) pen += WEIGHTS.teacherGap;
        }
        if (
          sorted[i].room &&
          sorted[i - 1].room &&
          sorted[i].room !== sorted[i - 1].room
        ) {
          pen += WEIGHTS.teacherRoomChange;
        }
      }
    }
    if (pen) this.teacherPen.set(tk, pen);
    else this.teacherPen.delete(tk);
    this.soft += pen - old;
  }

  private recomputeClass(classId: string): void {
    const old = this.classPen.get(classId) ?? 0;
    const perDay = this.classPerDay.get(classId);
    let pen = 0;
    if (perDay && perDay.size > 0) {
      let total = 0;
      for (const d of this.p.days) total += perDay.get(d) ?? 0;
      const mean = total / this.p.days.length;
      for (const d of this.p.days) {
        pen += Math.abs((perDay.get(d) ?? 0) - mean) * WEIGHTS.unevenClassLoad;
      }
    }
    if (pen) this.classPen.set(classId, pen);
    else this.classPen.delete(classId);
    this.soft += pen - old;
  }

  private bumpClassDay(classId: string, day: number, by: number): void {
    const perDay = this.classPerDay.get(classId) ?? new Map<number, number>();
    const next = (perDay.get(day) ?? 0) + by;
    if (next <= 0) perDay.delete(day);
    else perDay.set(day, next);
    if (perDay.size > 0) this.classPerDay.set(classId, perDay);
    else this.classPerDay.delete(classId);
  }
}

/** Penalty contribution of `n` same-subject lessons in one class-day. */
const repeat = (n: number): number => (n > 1 ? n - 1 : 0);

/** Are the `length` periods starting at `startIndex` contiguous in the day? */
function contiguous(p: Problem, startIndex: number, length: number): boolean {
  if (startIndex + length > p.periods.length) return false;
  for (let i = 1; i < length; i++) {
    if (p.periods[startIndex + i].order !== p.periods[startIndex + i - 1].order + 1) {
      return false;
    }
  }
  return true;
}

/**
 * Every slot this lesson could legally occupy right now. `ignore` lets a move
 * evaluate positions as if the given lesson weren't placed (it is being moved).
 */
function candidates(
  p: Problem,
  s: State,
  lesson: Lesson,
  ignore?: Lesson,
): Candidate[] {
  const out: Candidate[] = [];
  const ignoredId = ignore?.id;

  const free = (map: Map<string, string>, key: string) => {
    const holder = map.get(key);
    return holder === undefined || holder === ignoredId;
  };

  for (const day of p.days) {
    // The caller removes a lesson before asking where it could move, so these
    // counts already exclude it.
    const classCount = s.classDay.get(dayKey(lesson.classId, day)) ?? 0;
    const staffCount = s.staffDay.get(dayKey(lesson.staffId, day)) ?? 0;
    const classCap = p.maxPerClassPerDay;
    if (classCap != null && classCount + lesson.length > classCap) continue;
    const staffCap = p.maxPerTeacherPerDay.get(lesson.staffId);
    if (staffCap != null && staffCount + lesson.length > staffCap) continue;

    for (let i = 0; i < p.periods.length; i++) {
      if (!contiguous(p, i, lesson.length)) continue;

      let ok = true;
      for (let k = 0; k < lesson.length; k++) {
        const pid = p.periods[i + k].id;
        if (
          !free(s.classBusy, busyKey(lesson.classId, day, pid)) ||
          !free(s.staffBusy, busyKey(lesson.staffId, day, pid)) ||
          p.staffUnavailable.has(busyKey(lesson.staffId, day, pid))
        ) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const roomId = pickRoom(p, s, lesson, day, i, ignoredId);
      if (roomId === undefined) continue; // needed a room, none free
      out.push({ day, startIndex: i, roomId });
    }
  }
  return out;
}

/** Where a placement sits, as a candidate position. */
function toSlot(
  p: Problem,
  pl: Placement,
): { day: number; startIndex: number } | undefined {
  const startIndex = p.periods.findIndex((x) => x.id === pl.periodIds[0]);
  return startIndex < 0 ? undefined : { day: pl.day, startIndex };
}

/**
 * Can this lesson legally sit at (day, startIndex) right now? Returns the room
 * to use (`null` = unroomed) or `undefined` when the position is illegal.
 */
function canPlace(
  p: Problem,
  s: State,
  lesson: Lesson,
  day: number,
  startIndex: number,
): string | null | undefined {
  if (!contiguous(p, startIndex, lesson.length)) return undefined;

  const classCap = p.maxPerClassPerDay;
  if (
    classCap != null &&
    (s.classDay.get(dayKey(lesson.classId, day)) ?? 0) + lesson.length > classCap
  ) {
    return undefined;
  }
  const staffCap = p.maxPerTeacherPerDay.get(lesson.staffId);
  if (
    staffCap != null &&
    (s.staffDay.get(dayKey(lesson.staffId, day)) ?? 0) + lesson.length > staffCap
  ) {
    return undefined;
  }

  for (let k = 0; k < lesson.length; k++) {
    const pid = p.periods[startIndex + k].id;
    if (
      s.classBusy.has(busyKey(lesson.classId, day, pid)) ||
      s.staffBusy.has(busyKey(lesson.staffId, day, pid)) ||
      p.staffUnavailable.has(busyKey(lesson.staffId, day, pid))
    ) {
      return undefined;
    }
  }
  return pickRoom(p, s, lesson, day, startIndex);
}

/**
 * A free room for the run, or `undefined` when one is required but unavailable.
 * Returns `null` when the school has no rooms at all (rooms are optional).
 */
function pickRoom(
  p: Problem,
  s: State,
  lesson: Lesson,
  day: number,
  startIndex: number,
  ignoredId?: string,
): string | null | undefined {
  const pool = lesson.requiredRoomType
    ? p.rooms.filter((r) => r.type === lesson.requiredRoomType)
    : p.rooms;
  if (pool.length === 0) {
    // No rooms modelled at all → unroomed lessons are fine. But a lesson that
    // *requires* a type cannot be satisfied.
    return lesson.requiredRoomType ? undefined : null;
  }
  for (const room of pool) {
    let free = true;
    for (let k = 0; k < lesson.length; k++) {
      const pid = p.periods[startIndex + k].id;
      const holder = s.roomBusy.get(busyKey(room.id, day, pid));
      if (holder !== undefined && holder !== ignoredId) {
        free = false;
        break;
      }
    }
    if (free) return room.id;
  }
  return undefined;
}

// ── Scoring (full recompute) ──────────────────────────────────────────────────

/**
 * Full soft-constraint evaluation. The search keeps score incrementally in
 * {@link State}; this authoritative version is used for the final report, to
 * find the min-conflicts "culprits", and to periodically resync the incremental
 * total against float drift. Hard constraints are structurally enforced.
 */
export function score(
  p: Problem,
  placements: Placement[],
  lessonsById: Map<string, Lesson>,
): {
  total: number;
  /** Unrounded sum — used to resync the incremental total. */
  exact: number;
  breakdown: Record<string, number>;
  /** Lessons implicated in a penalty — the search targets these first. */
  culprits: string[];
} {
  const orderOf = new Map(p.periods.map((x) => [x.id, x.order]));
  const culprits = new Set<string>();
  const breakdown: Record<string, number> = {
    subjectRepeatedInDay: 0,
    morningPreferenceMissed: 0,
    teacherGap: 0,
    unevenClassLoad: 0,
    teacherRoomChange: 0,
  };

  const groups = new Map<string, string[]>();
  for (const pl of placements) {
    const k = `${pl.classId}|${pl.day}|${pl.subjectId}`;
    const list = groups.get(k) ?? [];
    list.push(pl.lessonId);
    groups.set(k, list);
  }
  for (const list of groups.values()) {
    if (list.length > 1) {
      breakdown.subjectRepeatedInDay +=
        (list.length - 1) * WEIGHTS.subjectRepeatedInDay;
      for (const id of list) culprits.add(id);
    }
  }

  if (p.morningEndsAfterPeriod != null) {
    for (const pl of placements) {
      const lesson = lessonsById.get(pl.lessonId);
      if (!lesson?.preferMorning) continue;
      for (const pid of pl.periodIds) {
        if ((orderOf.get(pid) ?? 0) > p.morningEndsAfterPeriod) {
          breakdown.morningPreferenceMissed += WEIGHTS.morningPreferenceMissed;
          culprits.add(pl.lessonId);
        }
      }
    }
  }

  const byTeacherDay = new Map<
    string,
    { order: number; roomId: string | null; lessonId: string }[]
  >();
  for (const pl of placements) {
    const k = dayKey(pl.staffId, pl.day);
    const list = byTeacherDay.get(k) ?? [];
    for (const pid of pl.periodIds) {
      list.push({
        order: orderOf.get(pid) ?? 0,
        roomId: pl.roomId,
        lessonId: pl.lessonId,
      });
    }
    byTeacherDay.set(k, list);
  }
  const teachableOrders = new Set(p.periods.map((x) => x.order));
  for (const list of byTeacherDay.values()) {
    list.sort((a, b) => a.order - b.order);
    for (let i = 1; i < list.length; i++) {
      for (let o = list[i - 1].order + 1; o < list[i].order; o++) {
        if (teachableOrders.has(o)) {
          breakdown.teacherGap += WEIGHTS.teacherGap;
          culprits.add(list[i].lessonId);
          culprits.add(list[i - 1].lessonId);
        }
      }
      if (
        list[i].roomId &&
        list[i - 1].roomId &&
        list[i].roomId !== list[i - 1].roomId
      ) {
        breakdown.teacherRoomChange += WEIGHTS.teacherRoomChange;
      }
    }
  }

  const byClassDay = new Map<string, number>();
  const classes = new Set<string>();
  for (const pl of placements) {
    classes.add(pl.classId);
    const k = dayKey(pl.classId, pl.day);
    byClassDay.set(k, (byClassDay.get(k) ?? 0) + pl.periodIds.length);
  }
  for (const classId of classes) {
    const counts = p.days.map((d) => byClassDay.get(dayKey(classId, d)) ?? 0);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    for (const c of counts) {
      breakdown.unevenClassLoad += Math.abs(c - mean) * WEIGHTS.unevenClassLoad;
    }
  }

  const exact = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { total: Math.round(exact), exact, breakdown, culprits: [...culprits] };
}

// ── Solve ───────────────────────────────────────────────────────────────────

/**
 * Two-phase solve:
 *  1. Greedy construction, most-constrained lesson first, with ejection repair
 *     for anything that won't fit.
 *  2. Time-boxed simulated annealing over relocate/swap moves, which only ever
 *     considers legal positions — so the timetable stays valid throughout.
 */
export function solve(p: Problem): Solution {
  const started = Date.now();
  const random = rng(p.seed);
  const lessonsById = new Map(p.lessons.map((l) => [l.id, l]));
  const state = new State(p);

  // Hardest first: doubles, then room-restricted, then busiest teachers.
  const load = new Map<string, number>();
  for (const l of p.lessons) {
    load.set(l.staffId, (load.get(l.staffId) ?? 0) + l.length);
  }
  const difficulty = (l: Lesson) =>
    l.length * 100 +
    (l.requiredRoomType ? 50 : 0) +
    (l.preferMorning ? 10 : 0) +
    (load.get(l.staffId) ?? 0);

  const ordered = [...p.lessons].sort(
    (a, b) => difficulty(b) - difficulty(a) || (random() < 0.5 ? -1 : 1),
  );

  const unplaced: Lesson[] = [];
  for (const lesson of ordered) {
    const options = candidates(p, state, lesson);
    if (options.length === 0) {
      unplaced.push(lesson);
      continue;
    }
    state.place(lesson, bestCandidate(state, lesson, options));
  }

  // Repair: free a slot by ejecting blockers, then re-place them elsewhere.
  for (let i = unplaced.length - 1; i >= 0; i--) {
    if (tryEject(p, state, unplaced[i], lessonsById)) {
      unplaced.splice(i, 1);
    }
  }

  const snapshot = () => [...state.placements.values()];
  let best = state.scoreExact;
  let bestSnapshot = snapshot();
  let iterations = 0;

  const pool = [...state.placements.keys()].map((id) => lessonsById.get(id)!);
  if (pool.length === 0) {
    const final = score(p, bestSnapshot, lessonsById);
    return {
      placements: bestSnapshot,
      unplaced,
      score: final.total,
      breakdown: final.breakdown,
      iterations: 0,
      elapsedMs: Date.now() - started,
    };
  }

  const deadline = started + p.timeBudgetMs;
  let temperature = 12;
  let sinceImprovement = 0;
  let culprits = score(p, bestSnapshot, lessonsById).culprits;

  while (Date.now() < deadline) {
    iterations++;

    // Min-conflicts: usually move a lesson that is actually in a violation.
    let lesson: Lesson;
    if (culprits.length > 0 && random() < 0.85) {
      const id = culprits[Math.floor(random() * culprits.length)];
      lesson = lessonsById.get(id) ?? pool[Math.floor(random() * pool.length)];
    } else {
      lesson = pool[Math.floor(random() * pool.length)];
    }

    const beforeScore = state.scoreExact;
    const beforeA = state.remove(lesson);
    if (!beforeA) continue;

    const options = candidates(p, state, lesson);
    const partners =
      options.length === 0 || random() < 0.3
        ? pool.filter(
            (l) =>
              l.id !== lesson.id &&
              l.length === lesson.length &&
              (l.classId === lesson.classId || l.staffId === lesson.staffId) &&
              state.placements.has(l.id),
          )
        : [];

    let undo: () => void;

    if (partners.length > 0) {
      const partner = partners[Math.floor(random() * partners.length)];
      const beforeB = state.remove(partner);
      if (!beforeB) {
        state.restore(lesson, beforeA);
        continue;
      }
      const slotA = toSlot(p, beforeA);
      const slotB = toSlot(p, beforeB);
      const roomA = slotB && canPlace(p, state, lesson, slotB.day, slotB.startIndex);
      const roomB = slotA && canPlace(p, state, partner, slotA.day, slotA.startIndex);

      if (!slotA || !slotB || roomA === undefined || roomB === undefined) {
        state.restore(lesson, beforeA);
        state.restore(partner, beforeB);
        continue;
      }
      state.place(lesson, { ...slotB, roomId: roomA });
      state.place(partner, { ...slotA, roomId: roomB });
      undo = () => {
        state.remove(lesson);
        state.remove(partner);
        state.restore(lesson, beforeA);
        state.restore(partner, beforeB);
      };
    } else if (options.length > 0) {
      state.place(lesson, options[Math.floor(random() * options.length)]);
      undo = () => {
        state.remove(lesson);
        state.restore(lesson, beforeA);
      };
    } else {
      state.restore(lesson, beforeA);
      continue;
    }

    const delta = state.scoreExact - beforeScore;
    // Accept improvements always, worsening moves with decaying probability.
    if (delta <= 0 || random() < Math.exp(-delta / Math.max(temperature, 0.5))) {
      if (state.scoreExact < best) {
        best = state.scoreExact;
        bestSnapshot = snapshot();
        sinceImprovement = 0;
      } else {
        sinceImprovement++;
      }
    } else {
      undo();
      sinceImprovement++;
    }

    if (iterations % 200 === 0) temperature *= 0.92;
    if (sinceImprovement > 1500) {
      temperature = 8;
      sinceImprovement = 0;
    }
    // Periodically refresh the culprit list and resync the running total, which
    // both keeps min-conflicts targeting current and erases any float drift.
    if (iterations % 400 === 0) {
      const full = score(p, snapshot(), lessonsById);
      // Guard the incremental scorer against divergence from the source of
      // truth (enable in tests). If these ever drift apart, the delta bookkeeping
      // has a bug — fail loudly rather than ship a mis-scored timetable.
      if (
        process.env.TIMETABLE_VERIFY === '1' &&
        Math.abs(full.exact - state.scoreExact) > 1e-6
      ) {
        throw new Error(
          `incremental score ${state.scoreExact} != full ${full.exact}`,
        );
      }
      culprits = full.culprits;
      state.resetScore(full.exact);
    }
  }

  const final = score(p, bestSnapshot, lessonsById);
  return {
    placements: bestSnapshot,
    unplaced,
    score: final.total,
    breakdown: final.breakdown,
    iterations,
    elapsedMs: Date.now() - started,
  };
}

/** Lowest resulting penalty (via the live incremental score), random tie-break. */
function bestCandidate(
  state: State,
  lesson: Lesson,
  options: Candidate[],
): Candidate {
  let bestOption = options[0];
  let bestScore = Infinity;
  for (const option of options) {
    state.place(lesson, option);
    const s = state.scoreExact;
    state.remove(lesson);
    if (s < bestScore) {
      bestScore = s;
      bestOption = option;
    }
  }
  return bestOption;
}

/**
 * Force a stubborn lesson in: take a slot, evict whatever blocks it, then find
 * the evicted lessons new homes. Bounded, and rolled back if it fails.
 */
function tryEject(
  p: Problem,
  state: State,
  lesson: Lesson,
  lessonsById: Map<string, Lesson>,
): boolean {
  for (const day of p.days) {
    for (let i = 0; i < p.periods.length; i++) {
      if (!contiguous(p, i, lesson.length)) continue;

      let blockedByRule = false;
      for (let k = 0; k < lesson.length; k++) {
        const pid = p.periods[i + k].id;
        if (p.staffUnavailable.has(busyKey(lesson.staffId, day, pid))) {
          blockedByRule = true;
          break;
        }
      }
      if (blockedByRule) continue;

      const blockers = new Set<string>();
      for (let k = 0; k < lesson.length; k++) {
        const pid = p.periods[i + k].id;
        const a = state.classBusy.get(busyKey(lesson.classId, day, pid));
        const b = state.staffBusy.get(busyKey(lesson.staffId, day, pid));
        if (a) blockers.add(a);
        if (b) blockers.add(b);
      }
      if (blockers.size === 0 || blockers.size > 2) continue;

      const evicted = [...blockers]
        .map((id) => lessonsById.get(id))
        .filter((l): l is Lesson => Boolean(l));
      const saved = evicted.map((l) => ({ lesson: l, at: state.remove(l)! }));

      const options = candidates(p, state, lesson);
      const fit = options.find((c) => c.day === day && c.startIndex === i);
      if (fit) {
        state.place(lesson, fit);
        const rehomed: Lesson[] = [];
        let ok = true;
        for (const { lesson: ev } of saved) {
          const opts = candidates(p, state, ev);
          if (opts.length === 0) {
            ok = false;
            break;
          }
          state.place(ev, bestCandidate(state, ev, opts));
          rehomed.push(ev);
        }
        if (ok) return true;
        for (const ev of rehomed) state.remove(ev);
        state.remove(lesson);
      }

      for (const { lesson: l, at } of saved) state.restore(l, at);
    }
  }
  return false;
}
