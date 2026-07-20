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
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { AssessmentService } from './assessment.service';
import {
  CreateAssessmentDto,
  SaveScoresDto,
  UpdateAssessmentDto,
} from './dto/assessment.dto';

@ApiTags('assessment')
@ApiBearerAuth()
@RequireTenant()
@Controller('assessment')
export class AssessmentController {
  constructor(private readonly service: AssessmentService) {}

  // ── Assessments (exams/tests) — gated by `exams` ──────────────────────────
  @Get('assessments')
  @RequirePermissions('exams:view')
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'termId', required: false })
  @ApiOperation({ summary: 'List assessments' })
  list(
    @CurrentTenant() tenant: Tenant,
    @Query('classId') classId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('termId') termId?: string,
  ) {
    return this.service.list(tenant.id, {
      classId,
      academicYearId,
      subjectId,
      termId,
    });
  }

  @Post('assessments')
  @RequirePermissions('exams:create')
  @ApiOperation({ summary: 'Create an assessment for a class + subject' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateAssessmentDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch('assessments/:id')
  @RequirePermissions('exams:update')
  @ApiOperation({ summary: 'Update an assessment' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssessmentDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Delete('assessments/:id')
  @RequirePermissions('exams:delete')
  @ApiOperation({ summary: 'Delete an assessment' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }

  @Get('assessments/:id/scores')
  @RequirePermissions('exams:view')
  @ApiOperation({ summary: 'The score sheet for an assessment (with bands)' })
  scores(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.scores(tenant.id, id);
  }

  @Put('assessments/:id/scores')
  @RequirePermissions('exams:update')
  @ApiOperation({ summary: 'Enter/replace scores for an assessment' })
  saveScores(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveScoresDto,
  ) {
    return this.service.saveScores(tenant.id, id, dto);
  }

  // ── Report card — gated by `report-cards` ─────────────────────────────────
  @Get('report-card/:enrollmentId')
  @RequirePermissions('report-cards:view')
  @ApiQuery({ name: 'termId', required: false })
  @ApiOperation({ summary: "A student's report card for the year (or a term)" })
  reportCard(
    @CurrentTenant() tenant: Tenant,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Query('termId') termId?: string,
  ) {
    return this.service.reportCard(tenant.id, enrollmentId, termId);
  }
}
