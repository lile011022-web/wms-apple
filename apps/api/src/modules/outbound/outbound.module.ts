import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OutboundController } from './outbound.controller';
import { OutboundRepository } from './outbound.repository';
import { OutboundService } from './outbound.service';

@Module({
  imports: [DatabaseModule, InventoryModule],
  controllers: [OutboundController],
  providers: [OutboundRepository, OutboundService],
  exports: [OutboundService],
})
export class OutboundModule {}
