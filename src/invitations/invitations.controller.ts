import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { SafeUser } from '../common/types';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@ApiBearerAuth()
@RequireTenant()
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  @RequirePermissions('user-management:manage')
  @ApiOperation({ summary: 'Invite an email into the school with roles' })
  create(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SafeUser,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(tenant.id, user.id, dto);
  }

  @Get()
  @RequirePermissions('user-management:view')
  @ApiOperation({ summary: 'List invitations for the school' })
  findAll(@CurrentTenant() tenant: Tenant) {
    return this.invitationsService.findAll(tenant.id);
  }

  @Delete(':id')
  @RequirePermissions('user-management:manage')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  revoke(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invitationsService.revoke(tenant.id, id);
  }

  // Redeemed by a platform user who has no tenant yet — opt out of the
  // class-level @RequireTenant().
  @Post('accept')
  @RequireTenant(false)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation token and join the school' })
  accept(@CurrentUser() user: SafeUser, @Body() dto: AcceptInvitationDto) {
    return this.invitationsService.accept(user.id, dto.token);
  }
}
