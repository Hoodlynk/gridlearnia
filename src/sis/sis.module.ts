import { Module } from '@nestjs/common';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { GuardiansController } from './guardians.controller';
import { GuardiansService } from './guardians.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

/** Student Information System (Phase 2): students, guardians, and the
 *  enrollment that joins a student to a class for one academic year. */
@Module({
  controllers: [StudentsController, GuardiansController, EnrollmentsController],
  providers: [StudentsService, GuardiansService, EnrollmentsService],
})
export class SisModule {}
