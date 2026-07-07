import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class MatchPackagePrealertQueryDto {
  @ApiProperty({ example: '1Z999AA10123456784' })
  @IsString()
  @MinLength(6)
  @MaxLength(120)
  trackingNo!: string;
}
