import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class HandleExceptionDto {
  @ApiProperty({ example: 'Confirmed against package photo and linked to the correct record.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  resolutionNote!: string;
}
