import { Module } from '@nestjs/common';
import { InboundService } from './inbound.service';

@Module({
  providers: [InboundService],
  exports: [InboundService],
})
export class InboundModule {}
