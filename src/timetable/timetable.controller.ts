import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { SafeUser } from '../common/types';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CapacityService } from './capacity.service';
import {
  CreateTimetableDto,
  GenerateTimetableDto,
  MoveEntryDto,
  PublishTimetableDto,
  SwapEntriesDto,
  UpdateTimetableDto,
} from './dto/timetable.dto';
import {
  CreateSwapRequestDto,
  DecideSwapRequestDto,
} from './dto/swap-request.dto';
import { EntryEditService } from './entry-edit.service';
import { GeneratorService } from './generator.service';
import { SwapRequestsService } from './swap-requests.service';
import { TimetablesService } from './timetables.service';
import {
  CreateRoomDto,
  GeneratePeriodsDto,
  ReplacePeriodsDto,
  ReplaceUnavailabilityDto,
  UpdateRequirementDto,
  UpdateRoomDto,
  UpdateTimetableSettingsDto,
} from './dto/setup.dto';
import { TimetableSetupService } from './timetable-setup.service';

@ApiTags('timetable')
@ApiBearerAuth()
@RequireTenant()
@Controller('timetable')
export class TimetableController {
  constructor(
    private readonly setup: TimetableSetupService,
    private readonly capacity: CapacityService,
    private readonly timetables: TimetablesService,
    private readonly generator: GeneratorService,
    private readonly entryEdit: EntryEditService,
    private readonly swaps: SwapRequestsService,
  ) {}

  // ── Settings ──────────────────────────────────────────────────────────────

  @Get('settings')
  @RequirePermissions('timetable:view')
  @ApiOperation({ summary: 'Timetable settings (teaching days, load caps)' })
  getSettings(@CurrentTenant() tenant: Tenant) {
    return this.setup.getSettings(tenant.id);
  }

  @Patch('settings')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: 'Update timetable settings' })
  updateSettings(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: UpdateTimetableSettingsDto,
  ) {
    return this.setup.updateSettings(tenant.id, dto);
  }

  // ── Bell schedule ─────────────────────────────────────────────────────────

  @Get('periods')
  @RequirePermissions('timetable:view')
  @ApiOperation({ summary: 'The daily bell schedule' })
  listPeriods(@CurrentTenant() tenant: Tenant) {
    return this.setup.listPeriods(tenant.id);
  }

  @Put('periods')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: 'Replace the bell schedule (edited as a unit)' })
  replacePeriods(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: ReplacePeriodsDto,
  ) {
    return this.setup.replacePeriods(tenant.id, dto);
  }

  @Post('periods/generate')
  @RequirePermissions('timetable:update')
  @ApiOperation({
    summary:
      'Build the bell schedule from the school’s layout (lesson length, count, breaks)',
  })
  generatePeriods(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: GeneratePeriodsDto,
  ) {
    return this.setup.generatePeriods(tenant.id, dto);
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  @Get('rooms')
  @RequirePermissions('timetable:view')
  @ApiQuery({ name: 'campusId', required: false })
  @ApiOperation({ summary: 'List rooms' })
  listRooms(
    @CurrentTenant() tenant: Tenant,
    @Query('campusId') campusId?: string,
  ) {
    return this.setup.listRooms(tenant.id, campusId);
  }

  @Post('rooms')
  @RequirePermissions('timetable:create')
  @ApiOperation({ summary: 'Create a room' })
  createRoom(@CurrentTenant() tenant: Tenant, @Body() dto: CreateRoomDto) {
    return this.setup.createRoom(tenant.id, dto);
  }

  @Patch('rooms/:id')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: 'Update a room' })
  updateRoom(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.setup.updateRoom(tenant.id, id, dto);
  }

  @Delete('rooms/:id')
  @RequirePermissions('timetable:delete')
  @ApiOperation({ summary: 'Delete a room' })
  removeRoom(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.setup.removeRoom(tenant.id, id);
  }

  // ── Requirements (how many periods each subject needs) ────────────────────

  @Get('requirements')
  @RequirePermissions('timetable:view')
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiQuery({ name: 'classId', required: false })
  @ApiOperation({ summary: 'Lesson requirements per class + subject' })
  listRequirements(
    @CurrentTenant() tenant: Tenant,
    @Query('academicYearId') academicYearId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.setup.listRequirements(tenant.id, { academicYearId, classId });
  }

  @Patch('requirements/:id')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: 'Set periods/week, doubles, room type, morning preference' })
  updateRequirement(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequirementDto,
  ) {
    return this.setup.updateRequirement(tenant.id, id, dto);
  }

  // ── Staff unavailability ──────────────────────────────────────────────────

  @Get('unavailability/:staffId')
  @RequirePermissions('timetable:view')
  @ApiOperation({ summary: "A teacher's blocked slots and daily cap" })
  getUnavailability(
    @CurrentTenant() tenant: Tenant,
    @Param('staffId', ParseUUIDPipe) staffId: string,
  ) {
    return this.setup.getUnavailability(tenant.id, staffId);
  }

  @Put('unavailability/:staffId')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: "Replace a teacher's blocked slots" })
  replaceUnavailability(
    @CurrentTenant() tenant: Tenant,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: ReplaceUnavailabilityDto,
  ) {
    return this.setup.replaceUnavailability(tenant.id, staffId, dto);
  }

  // ── Timetable versions (effective periods) ────────────────────────────────

  @Get('timetables')
  @RequirePermissions('timetable:view')
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiOperation({ summary: 'List timetable versions and their date ranges' })
  listTimetables(
    @CurrentTenant() tenant: Tenant,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.timetables.list(tenant.id, academicYearId);
  }

  @Get('timetables/active')
  @RequirePermissions('timetable:view')
  @ApiQuery({ name: 'date', required: false, description: 'ISO date; defaults to today' })
  @ApiOperation({ summary: 'The timetable in force on a date' })
  activeTimetable(
    @CurrentTenant() tenant: Tenant,
    @Query('date') date?: string,
  ) {
    return this.timetables.activeOn(tenant.id, date);
  }

  @Post('timetables')
  @RequirePermissions('timetable:create')
  @ApiOperation({ summary: 'Create a timetable version (starts as a draft)' })
  createTimetable(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: CreateTimetableDto,
  ) {
    return this.timetables.create(tenant.id, dto);
  }

  @Patch('timetables/:id')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: 'Rename or re-date a timetable version' })
  updateTimetable(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTimetableDto,
  ) {
    return this.timetables.update(tenant.id, id, dto);
  }

  @Post('timetables/:id/publish')
  @RequirePermissions('timetable:update')
  @ApiOperation({
    summary: 'Put a draft into force (closes the current one the day before)',
  })
  publishTimetable(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishTimetableDto,
  ) {
    return this.timetables.publish(tenant.id, id, user.id, dto);
  }

  @Post('timetables/:id/archive')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: 'Retire a timetable version' })
  archiveTimetable(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.timetables.archive(tenant.id, id);
  }

  @Delete('timetables/:id')
  @RequirePermissions('timetable:delete')
  @ApiOperation({ summary: 'Delete a draft timetable' })
  removeTimetable(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.timetables.remove(tenant.id, id);
  }

  // ── Generation ────────────────────────────────────────────────────────────

  @Post('timetables/:id/generate')
  @RequirePermissions('timetable:update')
  @ApiOperation({
    summary: 'Generate the draft (returns a run to poll — solving takes seconds)',
  })
  generate(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateTimetableDto,
  ) {
    return this.generator.start(tenant.id, id, dto.seed);
  }

  @Get('timetables/:id/run')
  @RequirePermissions('timetable:view')
  @ApiOperation({ summary: 'The most recent generation run for a timetable' })
  latestRun(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.generator.latestRun(tenant.id, id);
  }

  @Get('runs/:runId')
  @RequirePermissions('timetable:view')
  @ApiOperation({ summary: 'Poll a generation run' })
  run(
    @CurrentTenant() tenant: Tenant,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.generator.getRun(tenant.id, runId);
  }

  @Get('timetables/:id/entries')
  @RequirePermissions('timetable:view')
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiQuery({ name: 'roomId', required: false })
  @ApiOperation({ summary: 'Placed lessons, for a class / teacher / room grid' })
  entries(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('classId') classId?: string,
    @Query('staffId') staffId?: string,
    @Query('roomId') roomId?: string,
  ) {
    return this.timetables.entries(tenant.id, id, { classId, staffId, roomId });
  }

  // ── Manual editing (5c) ───────────────────────────────────────────────────

  @Get('entries/:entryId/legal-moves')
  @RequirePermissions('timetable:view')
  @ApiOperation({ summary: 'Free slots and swap targets for one lesson' })
  legalMoves(
    @CurrentTenant() tenant: Tenant,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.entryEdit.legalMoves(tenant.id, entryId);
  }

  @Post('entries/:entryId/move')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: 'Move a lesson to a free slot' })
  moveEntry(
    @CurrentTenant() tenant: Tenant,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: MoveEntryDto,
  ) {
    return this.entryEdit.move(
      tenant.id,
      entryId,
      dto.day,
      dto.periodId,
      dto.roomId,
    );
  }

  @Post('entries/:entryId/swap')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: 'Swap two lessons’ slots' })
  swapEntries(
    @CurrentTenant() tenant: Tenant,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: SwapEntriesDto,
  ) {
    return this.entryEdit.swap(tenant.id, entryId, dto.targetEntryId);
  }

  // ── Swap requests (5d) ────────────────────────────────────────────────────

  @Get('swap-requests')
  @RequirePermissions('timetable:view')
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'timetableId', required: false })
  @ApiOperation({ summary: 'List swap requests' })
  listSwaps(
    @CurrentTenant() tenant: Tenant,
    @Query('status') status?: string,
    @Query('timetableId') timetableId?: string,
  ) {
    return this.swaps.list(tenant.id, { status, timetableId });
  }

  @Post('swap-requests')
  @RequirePermissions('timetable:view')
  @ApiOperation({ summary: 'Request a lesson be moved or swapped (teacher)' })
  createSwap(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SafeUser,
    @Body() dto: CreateSwapRequestDto,
  ) {
    return this.swaps.create(tenant.id, user.id, dto);
  }

  @Post('swap-requests/:id/approve')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: 'Approve a swap request (re-validates and applies)' })
  approveSwap(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideSwapRequestDto,
  ) {
    return this.swaps.approve(tenant.id, id, user.id, dto);
  }

  @Post('swap-requests/:id/reject')
  @RequirePermissions('timetable:update')
  @ApiOperation({ summary: 'Reject a swap request' })
  rejectSwap(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideSwapRequestDto,
  ) {
    return this.swaps.reject(tenant.id, id, user.id, dto);
  }

  @Post('swap-requests/:id/cancel')
  @RequirePermissions('timetable:view')
  @ApiOperation({ summary: 'Cancel your own pending swap request' })
  cancelSwap(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.swaps.cancel(tenant.id, id, user.id);
  }

  // ── Readiness ─────────────────────────────────────────────────────────────

  @Get('readiness')
  @RequirePermissions('timetable:view')
  @ApiQuery({ name: 'academicYearId', required: true })
  @ApiOperation({
    summary: 'Pre-flight feasibility check before generating a timetable',
  })
  readiness(
    @CurrentTenant() tenant: Tenant,
    @Query('academicYearId', ParseUUIDPipe) academicYearId: string,
  ) {
    return this.capacity.readiness(tenant.id, academicYearId);
  }
}
