import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { ExceptionsController } from './exceptions.controller';
import { ExceptionsRepository } from './exceptions.repository';
import { ExceptionsService } from './exceptions.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ExceptionsController],
  providers: [ExceptionsRepository, ExceptionsService],
  exports: [ExceptionsService],
})
export class ExceptionsModule {}
