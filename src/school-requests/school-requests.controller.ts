import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SafeUser } from '../common/types';
import { CreateSchoolRequestDto } from './dto/create-school-request.dto';
import { SchoolRequestsService } from './school-requests.service';

/** User-facing: any authenticated platform user (no tenant required). */
@ApiTags('school-requests')
@ApiBearerAuth()
@Controller('school-requests')
export class SchoolRequestsController {
  constructor(private readonly schoolRequestsService: SchoolRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Apply to create a school (requires no current school)' })
  create(@CurrentUser() user: SafeUser, @Body() dto: CreateSchoolRequestDto) {
    return this.schoolRequestsService.create(user.id, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List my school requests and their status' })
  findMine(@CurrentUser() user: SafeUser) {
    return this.schoolRequestsService.findMine(user.id);
  }
}
