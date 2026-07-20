import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  controllers: [InvitationsController],
  providers: [InvitationsService],
  // StaffModule reuses this to invite a staff member to the portal.
  exports: [InvitationsService],
})
export class InvitationsModule {}
