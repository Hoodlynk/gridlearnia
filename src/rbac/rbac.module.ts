import { Global, Module } from '@nestjs/common';
import { PlatformRolesController } from './platform-roles.controller';
import { RbacService } from './rbac.service';
import { RolesController } from './roles.controller';

@Global()
@Module({
  controllers: [RolesController, PlatformRolesController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
