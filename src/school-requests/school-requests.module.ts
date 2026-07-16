import { Module } from '@nestjs/common';
import { PlatformSchoolRequestsController } from './platform-school-requests.controller';
import { SchoolRequestsController } from './school-requests.controller';
import { SchoolRequestsService } from './school-requests.service';

@Module({
  controllers: [SchoolRequestsController, PlatformSchoolRequestsController],
  providers: [SchoolRequestsService],
})
export class SchoolRequestsModule {}
