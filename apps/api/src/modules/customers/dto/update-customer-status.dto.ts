import { ApiProperty } from '@nestjs/swagger';
import { CustomerStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateCustomerStatusDto {
  @ApiProperty({ enum: CustomerStatus, example: CustomerStatus.INACTIVE })
  @IsEnum(CustomerStatus)
  status: CustomerStatus;
}
