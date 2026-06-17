import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class UpdateRolePermissionsDto {
  @ApiProperty({ example: ['dashboard.read', 'settings.manage'] })
  @IsArray()
  @IsString({ each: true })
  permissionCodes: string[];
}
