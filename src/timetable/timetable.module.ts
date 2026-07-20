import { Module } from '@nestjs/common';
import { CapacityService } from './capacity.service';
import { EntryEditService } from './entry-edit.service';
import { GeneratorService } from './generator.service';
import { SwapRequestsService } from './swap-requests.service';
import { TimetableController } from './timetable.controller';
import { TimetableSetupService } from './timetable-setup.service';
import { TimetablesService } from './timetables.service';

/**
 * Timetable.
 *  • 5a — setup: bell schedule, rooms, lesson requirements, staff
 *    unavailability, and the readiness check that proves a timetable is
 *    feasible before any search starts.
 *  • 5b — generation: dated timetable versions, and the solver that fills a
 *    draft (see `engine/`, which is pure and deterministic).
 */
@Module({
  controllers: [TimetableController],
  providers: [
    TimetableSetupService,
    CapacityService,
    TimetablesService,
    GeneratorService,
    EntryEditService,
    SwapRequestsService,
  ],
})
export class TimetableModule {}
