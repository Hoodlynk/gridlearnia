import { Module } from '@nestjs/common';
import { InvitationsModule } from '../invitations/invitations.module';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { TeachingAssignmentsController } from './teaching-assignments.controller';
import { TeachingAssignmentsService } from './teaching-assignments.service';

/** Staff & teaching (Phase 4): staff profiles, departments (+ HOD & subjects),
 *  teaching assignments (teacher × class × subject), and class-teacher setting. */
@Module({
  imports: [InvitationsModule],
  controllers: [
    StaffController,
    DepartmentsController,
    TeachingAssignmentsController,
  ],
  providers: [StaffService, DepartmentsService, TeachingAssignmentsService],
})
export class StaffModule {}
