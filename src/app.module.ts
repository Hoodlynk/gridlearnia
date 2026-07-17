import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EmailVerifiedGuard } from './common/guards/email-verified.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { MailModule } from './mail/mail.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import configuration from './config/configuration';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { PrismaModule } from './prisma/prisma.module';
import { IpRateLimitGuard } from './rate-limit/guards/ip-rate-limit.guard';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { PermissionsGuard } from './rbac/guards/permissions.guard';
import { SuperAdminGuard } from './rbac/guards/super-admin.guard';
import { RbacModule } from './rbac/rbac.module';
import { SchoolRequestsModule } from './school-requests/school-requests.module';
import { StorageModule } from './storage/storage.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    StorageModule,
    MailModule,
    RateLimitModule,
    AuditModule,
    RbacModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    SchoolRequestsModule,
    InvitationsModule,
    HealthModule,
  ],
  providers: [
    // Order matters: IP rate limit (pre-auth, cheap rejection) →
    // authentication → tenant context/quota → authorization
    { provide: APP_GUARD, useClass: IpRateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EmailVerifiedGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: SuperAdminGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
