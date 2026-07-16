import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SafeUser } from '../common/types';
import { RbacService } from '../rbac/rbac.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rbacService: RbacService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary:
      'Platform registration (no school). Join a school via invitation, or request one.',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  // Tight per-IP limit: login is the bcrypt-heavy, brute-forceable endpoint
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email + password' })
  login(@Body() dto: LoginDto, @Req() request: FastifyRequest) {
    // request.ip resolves X-Forwarded-For (trustProxy) → real client IP
    return this.authService.login(dto, request.ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for new tokens' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user, tenant, roles, and permissions' })
  async me(
    @CurrentUser() user: SafeUser,
    @CurrentTenant() tenant: Tenant | null,
  ) {
    const access = await this.rbacService.getAccess(user.id);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: access.roles,
      permissions: [...access.permissions].sort(),
      tenant: tenant
        ? { id: tenant.id, name: tenant.name, subdomain: tenant.subdomain }
        : null,
    };
  }
}
