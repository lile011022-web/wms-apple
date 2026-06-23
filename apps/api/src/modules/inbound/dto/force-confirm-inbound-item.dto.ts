import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ForceConfirmInboundItemDto {
  @ApiProperty({
    example: 'Supervisor reviewed the package tracking exception and approved inbound.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason: string;
}
