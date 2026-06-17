import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { InboundController } from './inbound.controller';
import { InboundRepository } from './inbound.repository';
import { InboundService } from './inbound.service';

@Module({
  imports: [DatabaseModule, SettingsModule],
  controllers: [InboundController],
  providers: [InboundService, InboundRepository],
  exports: [InboundService],
})
export class InboundModule {}
