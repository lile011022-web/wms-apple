import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'CUST-001' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code: string;

  @ApiProperty({ example: 'TechFlow Inc.' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'John Smith' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional({ example: 'john@techflow.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactInfo?: string;

  @ApiPropertyOptional({ example: CustomerStatus.ACTIVE, enum: CustomerStatus })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({ example: 'Preferred inbound customer for phone inventory.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
