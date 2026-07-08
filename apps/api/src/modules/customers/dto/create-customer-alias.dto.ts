import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerAliasDto {
  @ApiProperty({ example: 'A1' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'A customer alternate recipient name' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ enum: CustomerStatus })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({ example: 'Used by packages addressed to A1.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
