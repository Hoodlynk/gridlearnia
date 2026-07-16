import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString, Matches } from 'class-validator';

export class UpdateRolePermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['exams:view', 'exams:update', 'attendance:manage'],
    description: 'The complete "module:action" set the role should hold',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[a-z-]+:[a-z]+$/, {
    each: true,
    message: 'each permission must look like "module:action"',
  })
  permissions!: string[];
}
