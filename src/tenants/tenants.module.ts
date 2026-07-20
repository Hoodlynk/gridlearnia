import { Module } from '@nestjs/common';
import { CampusesController } from './campuses.controller';
import { CampusesService } from './campuses.service';
import { PlatformCampusesController } from './platform-campuses.controller';
import { PlatformTenantModulesController } from './platform-tenant-modules.controller';
import { PlatformTenantsController } from './platform-tenants.controller';
import { TenantModulesService } from './tenant-modules.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [
    TenantsController,
    CampusesController,
    PlatformTenantsController,
    PlatformCampusesController,
    PlatformTenantModulesController,
  ],
  providers: [TenantsService, CampusesService, TenantModulesService],
})
export class TenantsModule {}
