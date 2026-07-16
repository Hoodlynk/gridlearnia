import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import configuration from './config/configuration';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { PrismaModule } from './prisma/prisma.module';
import { PermissionsGuard } from './rbac/guards/permissions.guard';
import { SuperAdminGuard } from './rbac/guards/super-admin.guard';
import { RbacModule } from './rbac/rbac.module';
import { SchoolRequestsModule } from './school-requests/school-requests.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // NOTE: in-memory throttling — swap in a Redis storage adapter
    // (e.g. @nest-lab/throttler-storage-redis) before scaling past one dyno.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('throttle.ttlMs'),
            limit: config.getOrThrow<number>('throttle.limit'),
          },
        ],
      }),
    }),
    PrismaModule,
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
    // Order matters: throttling → authentication → tenant context → authorization
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: SuperAdminGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
