import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCustomerAliasDto {
  @ApiPropertyOptional({ example: 'A1' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ example: 'A customer alternate recipient name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Used by packages addressed to A1.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
