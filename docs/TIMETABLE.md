# GridLearnia Timetable

> **Phases 5a–5d are implemented.** The school defines its own day, the readiness
> check proves a timetable is possible, the solver fills a dated draft you publish
> when happy, and it can be hand-edited (drag-and-drop) or adjusted via teacher
> swap requests. Builds on staff & teaching
> ([STAFF-TEACHING.md](STAFF-TEACHING.md)) and the academic engine
> ([ACADEMICS.md](ACADEMICS.md)).

## 1. Approach

School timetabling is **NP-hard** — a constraint satisfaction + optimisation
problem. No algorithm guarantees a perfect answer instantly, so GridLearnia uses
the approach proven by real timetabling engines (FET, UniTime):

1. **Pre-flight feasibility** — cheap arithmetic that proves a solution *cannot*
   exist and says exactly what to fix, before any search starts.
2. **Construction** — greedy placement, hardest lesson first (doubles, then
   room-restricted, then the busiest teachers), each into its lowest-penalty
   legal slot. Anything that won't fit gets an **ejection repair**: take the
   slot, evict what blocks it, re-home the evicted lessons, and roll the whole
   thing back if that fails.
3. **Improvement** — time-boxed simulated annealing that only ever considers
   legal positions, so the timetable is **valid at every instant**. Two things
   make it converge:
   - **Min-conflicts targeting** — 85% of moves pick a lesson that is actually
     causing a penalty. Choosing uniformly at random barely improves a full
     school, because most lessons are already fine.
   - **Swap moves** — in a saturated timetable (every class slot filled)
     relocation is *impossible*, so swapping two lessons is the only move that
     can improve anything. Relocation is used where there's space, swapping
     where there isn't.

   The search also reheats when it stalls, so a cooled run can still escape a
   local minimum instead of burning its remaining budget.

**Measured** on a synthetic 20-class school (600 periods, fully saturated,
labs + doubles + teacher unavailability): every lesson placed, all hard
constraints satisfied, and the soft-constraint penalty cut ~35–40% below the
constructed solution. A 6-class school reaches zero teacher gaps. Same seed
always produces the same timetable.

### Hard vs soft constraints

**Hard** (never violated): a teacher can't be in two places at once · a class
can't have two lessons at once · a room can't host two lessons at once · teacher
unavailability · per-day caps · every required period is placed.

**Soft** (weighted, optimised): double periods kept adjacent · core subjects in
morning slots · no idle gaps in a teacher's day · even daily load · subject
spread across the week · minimal teacher room-hopping.

## 2. The school defines its own day

Nothing about the daily shape is hardcoded. A school sets:

| Input | Where |
|---|---|
| Which weekdays are taught | `TimetableSettings.teachingDays` |
| When the day starts | `dayStartTime` |
| How long a lesson is | `lessonDurationMinutes` |
| How many lessons a day | `lessonsPerDay` |
| Where breaks fall and how long | schedule builder → `Period` rows with `isBreak` |
| Max lessons/day for a **teacher** | `maxPeriodsPerTeacherPerDay` (+ per-person `Staff.maxPeriodsPerDay`) |
| Max lessons/day for a **class** | `maxLessonsPerClassPerDay` |
| Which periods count as "morning" | `morningEndsAfterPeriod` |

`POST /timetable/periods/generate` builds the whole bell schedule from those
inputs. **`Period` rows remain the source of truth** — after generating, any
period can be hand-edited (different lengths, extra breaks, an irregular day),
so unusual layouts are fully supported.

> **v1 simplification:** one tenant-wide period grid. Sections with shorter days
> simply leave later periods unused — the standard trick, and it keeps the
> solver's slot space uniform. Per-section bell schedules can be added later
> without reshaping anything else.

Regenerating matches periods **by `order` and updates in place** rather than
delete-and-recreate, because `StaffUnavailability` cascades off `periodId` —
recreating would silently wipe every teacher's blocked slots.

## 3. Where the demand lives

The timetable's *demand* is stored on **`TeachingAssignment`** — which is already
exactly teacher × class × subject, so no parallel table is needed:

| Field | Meaning |
|---|---|
| `periodsPerWeek` | lessons a week; `0` = assigned but not timetabled |
| `doublePeriods` | how many are back-to-back pairs (each uses 2 periods) |
| `requiredRoomType` | restrict placement to e.g. a `LAB` |
| `preferMorning` | soft preference for earlier periods |

Validation refuses `doublePeriods * 2 > periodsPerWeek`.

## 4. A timetable is dated — it applies *from* a day

A timetable is never "the" timetable. Schools change them mid-year (a new term, a
revision after week 5), so each version records **when it is in force**:

| Field | Meaning |
|---|---|
| `effectiveFrom` | first day this version applies |
| `effectiveTo` | last day; `null` = **until superseded** |
| `status` | `DRAFT` (being built) → `PUBLISHED` (in force) → `ARCHIVED` |

This is what makes changes stress-free: a school can build next term's timetable
now, publish it dated **ahead**, and it takes over automatically on the day —
today's timetable is untouched until then.

**Rules enforced on publish**

- **No two `PUBLISHED` versions may cover the same day.** Ranges are compared
  with `null` treated as open-ended, and the check runs *inside* the publish
  transaction, so a clash rolls the whole thing back.
- **Auto-supersede** (default): publishing a version starting on *D* closes the
  current open-ended one at *D − 1*. One click moves the school cleanly from one
  timetable to the next.
- **Future-dated by default**: publishing with a past `effectiveFrom` is
  refused unless `allowBackdate: true` — so correcting history is possible but
  never accidental.
- Dates must fall inside the academic year, and `effectiveTo` cannot precede
  `effectiveFrom`.
- A `PUBLISHED` version can't be deleted (archive it); an `ARCHIVED` one can't be
  re-published (duplicate it).

**Resolution**: `GET /timetable/timetables/active?date=` returns the version in
force on any date — the lookup every downstream feature (daily view, attendance,
teacher schedules) will use.

## 5. Readiness (pre-flight)

`GET /timetable/readiness?academicYearId=` returns capacity vs demand for every
class, teacher and room type, plus actionable issues:

> "Grade 7 East needs 42 periods but the week only has 30."
> "Mr Njoroge is assigned 34 periods but is only available for 28."
> "Lessons require a LAB room but the school has none."

`ready: true` means no blocking problems — generation can be attempted. This is
the single most important anti-frustration feature: the solver never grinds on an
impossible problem.

## 6. API (`/timetable/*`, gated by `timetable`)

| Area | Endpoints |
|---|---|
| Settings | `GET/PATCH /timetable/settings` |
| Bell schedule | `GET /timetable/periods`, `PUT /timetable/periods`, `POST /timetable/periods/generate` |
| Rooms | `GET/POST /timetable/rooms`, `PATCH/DELETE /timetable/rooms/:id` |
| Requirements | `GET /timetable/requirements`, `PATCH /timetable/requirements/:id` |
| Availability | `GET/PUT /timetable/unavailability/:staffId` |
| Readiness | `GET /timetable/readiness?academicYearId=` |
| Versions | `GET/POST /timetable/timetables`, `PATCH/DELETE /timetable/timetables/:id`, `POST /timetable/timetables/:id/{publish,archive}` |
| Active version | `GET /timetable/timetables/active?date=` |
| Generation | `POST /timetable/timetables/:id/generate`, `GET /timetable/timetables/:id/run`, `GET /timetable/runs/:runId` |
| Placed lessons | `GET /timetable/timetables/:id/entries?classId=&staffId=&roomId=` |
| Editing (5c) | `GET /timetable/entries/:id/legal-moves`, `POST …/entries/:id/move`, `POST …/entries/:id/swap` |
| Swap requests (5d) | `GET/POST /timetable/swap-requests`, `POST …/:id/{approve,reject,cancel}` |

## 7. School-app UI

`Dashboard → Timetable` is a tabbed setup workspace:
- **School day** — teaching days, load ceilings, the schedule builder (lesson
  length / count / breaks), and a hand-editable period grid.
- **Rooms** — the spaces lessons can be placed in, with types.
- **Lessons** — per class: periods/week, doubles, room type, morning preference,
  with a live "N / M periods allocated" counter.
- **Availability** — a day × period grid per teacher, plus their daily cap.
- **Readiness** — the pre-flight report.
- **Timetables** — the dated versions: what's in force today, drafts with their
  start dates, and **Generate** with live progress and quality metrics.
- **Grid** — the generated timetable rendered by class, teacher or room.

## 8. Data model

| Model | Purpose |
|---|---|
| `TimetableSettings` | one row per tenant — week shape, layout defaults, ceilings |
| `Period` | a slot in the daily bell schedule (`isBreak` = not teachable) |
| `Room` | schedulable space, with `RoomType` and capacity |
| `StaffUnavailability` | (staff, day, period) a teacher cannot teach |
| `TeachingAssignment` (extended) | the per-class-subject demand |
| `Timetable` | a dated version: status + `effectiveFrom`/`effectiveTo` |
| `TimetableEntry` | one placed lesson; carries the three clash-guard indexes |
| `TimetableRun` | an async generation job: status, progress, metrics |
| `TimetableSwapRequest` | a teacher-proposed move/swap awaiting approval |

```prisma
enum RoomType        { CLASSROOM  LAB  HALL  LIBRARY  SPORTS  OTHER }
enum TimetableStatus    { DRAFT  PUBLISHED  ARCHIVED }
enum TimetableRunStatus { QUEUED  RUNNING  SUCCEEDED  FAILED }
enum SwapRequestStatus  { PENDING  APPROVED  REJECTED  CANCELLED }
```

Delivered in `20260720000012_timetable_setup`, `20260720000013_timetable_engine`
and `20260720000014_timetable_swaps`.

## 9. Generating (5b)

`POST /timetable/timetables/:id/generate` fills a **draft**. It returns a
`TimetableRun` immediately and solves in the background — the client polls
`GET /timetable/timetables/:id/run` for progress, so no request hangs for the
length of a solve.

- Only a **draft** can be generated; published timetables are read-only (make a
  new draft instead).
- Generation **re-runs readiness first** and refuses with the same actionable
  messages, so the solver never grinds on an impossible problem.
- One run at a time per timetable.
- A run **replaces the draft's entries wholesale**, and writes `metrics`
  (score, breakdown, placed/unplaced counts, iterations, seed) to both the run
  and the timetable.
- The **seed** is recorded and can be passed back in to reproduce a run exactly.
- Solve time scales with the problem — 3 s minimum, ~25 ms per period, 30 s cap.

### The clash guard

`TimetableEntry` carries three unique indexes — `(timetable, class, day, period)`,
`(timetable, staff, day, period)` and a partial `(timetable, room, day, period)
WHERE roomId IS NOT NULL`. The solver already refuses to create conflicts; these
make it **impossible to persist one**, so no future bug (or manual edit in 5c)
can put two lessons in the same place.

### Engine layout & performance

`src/timetable/engine/` is **pure**: no Prisma, no NestJS, no I/O. It takes a
plain `Problem` and returns a plain `Solution`, deterministic for a given seed —
which is exactly what lets it run off-thread and be unit-tested.

- **Runs in a `worker_thread`** (`solver.worker.js`), so a multi-second solve
  never blocks the Fastify event loop. `GeneratorService.runSolve` spawns the
  worker and falls back to solving inline only if the worker can't start (the
  engine is pure, so inline is always correct — it just occupies the loop).
- **Incremental scoring**: `State` keeps the soft-constraint total live, adjusting
  only the penalty groups a move touches instead of rescanning the whole
  timetable. The full recompute (`score()`) is kept as the source of truth — used
  for the final report, to find min-conflicts "culprits", and every 400
  iterations to resync away float drift (with an env-gated assertion,
  `TIMETABLE_VERIFY=1`, that the two never disagree). This lifts throughput on a
  saturated 20-class school from a few thousand iterations to **~500k in 5 s**.

## 10. Editing & swaps (5c–5d)

Once a timetable is generated, it can be adjusted by hand — and both paths reuse
**one validator** (`entry-edit.service.ts`) that re-checks every hard constraint
against the live rows, so no edit can introduce a clash. The three unique
indexes on `TimetableEntry` remain the final backstop.

**5c — direct editing.** In the **Grid** tab, toggle *Edit* and drag a lesson:
- `GET …/entries/:id/legal-moves` returns the free slots and swap targets for the
  dragged lesson; the UI highlights only those, so illegal drops are impossible
  to make, not just rejected.
- Drop on an empty highlighted slot → `POST …/entries/:id/move`.
- Drop on another highlighted lesson → `POST …/entries/:id/swap` (a swap goes
  through a scratch slot in one transaction so the unique indexes never trip
  mid-move).
- Archived timetables are read-only; DRAFT and PUBLISHED are editable.

**5d — teacher swap requests.** A teacher proposes a change instead of making it:
- `POST …/swap-requests` — move one of *their own* lessons to a free slot, or
  swap it with another. (A teacher may only request against their own lessons; a
  manager may act for anyone.)
- An approver reviews in the **Swap requests** tab. **Approval re-runs the full
  validator and applies the change**; if the timetable has shifted so the swap no
  longer fits, it's refused with the reason rather than corrupting anything.
- The requesting teacher is emailed the outcome (approved/rejected + note).
- Statuses: `PENDING → APPROVED | REJECTED | CANCELLED`.

> Direct editing needs `timetable:update`; requesting a swap needs only
> `timetable:view`, so teachers can propose without edit rights. The teacher-side
> "request from my timetable" screen ships with the parent/student & staff portal
> work; the API and review flow are complete now.

## 11. Still to build

- Teacher-facing "request a swap from my own timetable" screen (ships with the
  staff/parent portal; the API and admin review flow are done).
- Printable / exportable timetables.

## 12. Code map

| Concern | Location |
|---|---|
| Schema | `prisma/schema.prisma` |
| Setup service (settings, builder, rooms, requirements, availability) | `src/timetable/timetable-setup.service.ts` |
| Readiness | `src/timetable/capacity.service.ts` |
| Versions & effective periods | `src/timetable/timetables.service.ts` |
| Solver (pure, deterministic, incremental scoring) | `src/timetable/engine/{types,solver}.ts` |
| Solver worker thread | `src/timetable/engine/solver.worker.ts` |
| Generation runs (spawns the worker) | `src/timetable/generator.service.ts` |
| Manual editing (move/swap, legal moves) | `src/timetable/entry-edit.service.ts` |
| Swap requests | `src/timetable/swap-requests.service.ts` |
| Routes | `src/timetable/timetable.controller.ts` |
| Demo seed | `prisma/seed.ts` → `seedDemoTimetableSetup()` |
