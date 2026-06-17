import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class BatchHandleExceptionsDto {
  @ApiProperty({ example: ['exc_01H...', 'exc_01J...'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ example: 'Reviewed selected exceptions and confirmed the handling decision.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  resolutionNote!: string;
}
