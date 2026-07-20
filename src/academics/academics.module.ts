import { Module } from '@nestjs/common';
import { AcademicYearsController } from './academic-years.controller';
import { AcademicYearsService } from './academic-years.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { CurriculaController } from './curricula.controller';
import { CurriculaService } from './curricula.service';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';
import { GradingSchemesController } from './grading-schemes.controller';
import { GradingSchemesService } from './grading-schemes.service';
import { SectionsController } from './sections.controller';
import { SectionsService } from './sections.service';

/** Tenant-facing academic engine: years/terms, sections, grades, classes,
 *  the read-only catalogue, and adopt-and-clone of curricula/grading. */
@Module({
  controllers: [
    AcademicYearsController,
    SectionsController,
    GradesController,
    ClassesController,
    CatalogController,
    CurriculaController,
    GradingSchemesController,
  ],
  providers: [
    AcademicYearsService,
    SectionsService,
    GradesService,
    ClassesService,
    CatalogService,
    CurriculaService,
    GradingSchemesService,
  ],
})
export class AcademicsModule {}
