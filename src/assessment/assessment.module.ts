import { Module } from '@nestjs/common';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';

/** Assessment (Phase 3): exams/tests per class + subject, score sheets banded by
 *  the section's grading scheme, and per-student report cards. */
@Module({
  controllers: [AssessmentController],
  providers: [AssessmentService],
})
export class AssessmentModule {}
