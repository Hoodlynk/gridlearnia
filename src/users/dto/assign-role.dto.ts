import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ example: 'TEACHER', description: 'Role key (see GET /roles)' })
  @IsString()
  @Matches(/^[A-Z][A-Z_]{1,49}$/, {
    message: 'roleKey must be an UPPER_SNAKE_CASE role key',
  })
  roleKey: string;
}
