import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { join } from 'path';
import { Worker } from 'worker_threads';
import { PrismaService } from '../prisma/prisma.service';
import { CapacityService } from './capacity.service';
import { Lesson, Problem, RoomTypeKey, Solution, solve } from './engine';

/** Solve time scales with the problem, within sane bounds. */
const MIN_BUDGET_MS = 3_000;
const MAX_BUDGET_MS = 30_000;
const MS_PER_LESSON = 25;

@Injectable()
export class GeneratorService {
  private readonly logger = new Logger(GeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: CapacityService,
  ) {}

  /**
   * Kick off generation. Returns a run immediately — solving takes seconds, so
   * the client polls the run rather than holding a request open.
   */
  async start(tenantId: string, timetableId: string, seed?: number) {
    const timetable = await this.prisma.timetable.findFirst({
      where: { id: timetableId, tenantId, deletedAt: null },
      select: { id: true, status: true, academicYearId: true },
    });
    if (!timetable) {
      throw new NotFoundException('Timetable not found');
    }
    if (timetable.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only a draft can be generated — published timetables are read-only. Create a new draft instead.',
      );
    }

    // Refuse impossible problems up front, with the same actionable messages
    // the readiness screen shows.
    const readiness = await this.capacity.readiness(
      tenantId,
      timetable.academicYearId,
    );
    if (!readiness.ready) {
      const blocking = readiness.issues
        .filter((i) => i.severity === 'ERROR')
        .map((i) => i.message);
      throw new BadRequestException(
        `This timetable cannot be generated yet: ${blocking.join(' ')}`,
      );
    }

    const busy = await this.prisma.timetableRun.findFirst({
      where: { timetableId, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true },
    });
    if (busy) {
      throw new BadRequestException('A generation run is already in progress');
    }

    const run = await this.prisma.timetableRun.create({
      data: { tenantId, timetableId, status: 'QUEUED' },
      select: { id: true, status: true, progress: true, createdAt: true },
    });

    // Fire-and-forget: the HTTP response returns now, solving continues.
    void this.execute(tenantId, timetableId, run.id, seed ?? Date.now());

    return run;
  }

  getRun(tenantId: string, runId: string) {
    return this.prisma.timetableRun.findFirst({
      where: { id: runId, tenantId },
      select: {
        id: true,
        status: true,
        progress: true,
        message: true,
        metrics: true,
        startedAt: true,
        finishedAt: true,
        timetableId: true,
      },
    });
  }

  latestRun(tenantId: string, timetableId: string) {
    return this.prisma.timetableRun.findFirst({
      where: { tenantId, timetableId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        progress: true,
        message: true,
        metrics: true,
        startedAt: true,
        finishedAt: true,
        timetableId: true,
      },
    });
  }

  // ── The run itself ────────────────────────────────────────────────────────

  private async execute(
    tenantId: string,
    timetableId: string,
    runId: string,
    seed: number,
  ): Promise<void> {
    try {
      await this.prisma.timetableRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', progress: 5, startedAt: new Date() },
      });

      const problem = await this.buildProblem(tenantId, timetableId, seed);
      await this.prisma.timetableRun.update({
        where: { id: runId },
        data: { progress: 20, message: `Placing ${problem.lessons.length} lessons` },
      });

      const solution = await this.runSolve(problem);

      await this.prisma.timetableRun.update({
        where: { id: runId },
        data: { progress: 70, message: 'Saving timetable' },
      });

      await this.prisma.$transaction(async (tx) => {
        // A run replaces the draft's contents wholesale.
        await tx.timetableEntry.deleteMany({ where: { timetableId } });

        const rows = solution.placements.flatMap((pl) =>
          pl.periodIds.map((periodId) => ({
            tenantId,
            timetableId,
            classId: pl.classId,
            subjectId: pl.subjectId,
            staffId: pl.staffId,
            roomId: pl.roomId,
            day: pl.day,
            periodId,
          })),
        );
        if (rows.length > 0) {
          await tx.timetableEntry.createMany({ data: rows });
        }

        const metrics = {
          score: solution.score,
          breakdown: solution.breakdown,
          placedLessons: solution.placements.length,
          placedPeriods: rows.length,
          unplacedLessons: solution.unplaced.length,
          unplaced: solution.unplaced.slice(0, 20).map((l) => ({
            classId: l.classId,
            subjectId: l.subjectId,
            staffId: l.staffId,
            length: l.length,
          })),
          iterations: solution.iterations,
          elapsedMs: solution.elapsedMs,
          seed,
        };
        await tx.timetable.update({
          where: { id: timetableId },
          data: { metrics },
        });
        await tx.timetableRun.update({
          where: { id: runId },
          data: {
            status: 'SUCCEEDED',
            progress: 100,
            finishedAt: new Date(),
            metrics,
            message:
              solution.unplaced.length === 0
                ? `Placed every lesson (score ${solution.score})`
                : `${solution.unplaced.length} lesson(s) could not be placed`,
          },
        });
      });

      this.logger.log(
        `Timetable ${timetableId} generated: ${solution.placements.length} lessons, score ${solution.score}, ${solution.elapsedMs}ms`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Generation failed';
      this.logger.error(`Timetable ${timetableId} generation failed: ${message}`);
      await this.prisma.timetableRun
        .update({
          where: { id: runId },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            message: message.slice(0, 500),
          },
        })
        .catch(() => undefined);
    }
  }

  /**
   * Run the CPU-bound solve in a worker thread so it never blocks the Fastify
   * event loop. Falls back to solving inline if the worker can't start (e.g. an
   * unexpected runtime layout) — the engine is pure, so inline is always safe,
   * it just occupies the loop for the solve.
   */
  private runSolve(problem: Problem): Promise<Solution> {
    return new Promise((resolve) => {
      const workerPath = join(__dirname, 'engine', 'solver.worker.js');
      let settled = false;
      const inline = (why: string) => {
        if (settled) return;
        settled = true;
        this.logger.warn(`solver worker unavailable (${why}); running inline`);
        resolve(solve(problem));
      };

      let worker: Worker;
      try {
        worker = new Worker(workerPath, { workerData: problem });
      } catch (err) {
        inline(err instanceof Error ? err.message : 'spawn failed');
        return;
      }
      worker.once('message', (solution: Solution) => {
        if (settled) return;
        settled = true;
        resolve(solution);
        void worker.terminate();
      });
      worker.once('error', (err) => {
        inline(err.message);
        void worker.terminate();
      });
      worker.once('exit', (code) => {
        if (code !== 0) inline(`exited with code ${code}`);
      });
    });
  }

  /** Turn the school's setup into the engine's plain problem object. */
  private async buildProblem(
    tenantId: string,
    timetableId: string,
    seed: number,
  ): Promise<Problem> {
    const timetable = await this.prisma.timetable.findFirstOrThrow({
      where: { id: timetableId, tenantId },
      select: { academicYearId: true },
    });

    const [settings, periods, rooms, assignments, unavailable, staff] =
      await Promise.all([
        this.prisma.timetableSettings.findUnique({ where: { tenantId } }),
        this.prisma.period.findMany({
          where: { tenantId },
          orderBy: { order: 'asc' },
        }),
        this.prisma.room.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, type: true },
          orderBy: { code: 'asc' },
        }),
        this.prisma.teachingAssignment.findMany({
          where: {
            tenantId,
            academicYearId: timetable.academicYearId,
            periodsPerWeek: { gt: 0 },
          },
          select: {
            id: true,
            classId: true,
            subjectId: true,
            staffId: true,
            periodsPerWeek: true,
            doublePeriods: true,
            requiredRoomType: true,
            preferMorning: true,
          },
        }),
        this.prisma.staffUnavailability.findMany({
          where: { tenantId },
          select: { staffId: true, day: true, periodId: true },
        }),
        this.prisma.staff.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, maxPeriodsPerDay: true },
        }),
      ]);

    const days = settings?.teachingDays?.length
      ? [...settings.teachingDays].sort((a, b) => a - b)
      : [1, 2, 3, 4, 5];

    // Expand each requirement into individual placeable lessons: `doublePeriods`
    // units of length 2, and the remainder as singles.
    const lessons: Lesson[] = [];
    for (const a of assignments) {
      const doubles = Math.min(a.doublePeriods, Math.floor(a.periodsPerWeek / 2));
      const singles = a.periodsPerWeek - doubles * 2;
      const base = {
        assignmentId: a.id,
        classId: a.classId,
        subjectId: a.subjectId,
        staffId: a.staffId,
        requiredRoomType: (a.requiredRoomType as RoomTypeKey | null) ?? null,
        preferMorning: a.preferMorning,
      };
      for (let i = 0; i < doubles; i++) {
        lessons.push({ ...base, id: `${a.id}:d${i}`, length: 2 });
      }
      for (let i = 0; i < singles; i++) {
        lessons.push({ ...base, id: `${a.id}:s${i}`, length: 1 });
      }
    }

    const maxPerTeacherPerDay = new Map<string, number>();
    for (const s of staff) {
      const cap = s.maxPeriodsPerDay ?? settings?.maxPeriodsPerTeacherPerDay;
      if (cap != null) maxPerTeacherPerDay.set(s.id, cap);
    }

    const totalPeriods = lessons.reduce((n, l) => n + l.length, 0);
    const timeBudgetMs = Math.min(
      MAX_BUDGET_MS,
      Math.max(MIN_BUDGET_MS, totalPeriods * MS_PER_LESSON),
    );

    return {
      days,
      periods: periods
        .filter((p) => !p.isBreak)
        .map((p) => ({ id: p.id, order: p.order })),
      lessons,
      rooms: rooms.map((r) => ({ id: r.id, type: r.type as RoomTypeKey })),
      staffUnavailable: new Set(
        unavailable.map((u) => `${u.staffId}|${u.day}|${u.periodId}`),
      ),
      maxPerTeacherPerDay,
      maxPerClassPerDay: settings?.maxLessonsPerClassPerDay ?? null,
      morningEndsAfterPeriod: settings?.morningEndsAfterPeriod ?? null,
      seed,
      timeBudgetMs,
    };
  }
}
