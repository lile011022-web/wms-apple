import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CustomerChangeController } from './customer-change/customer-change.controller';
import { CustomerChangeRepository } from './customer-change/customer-change.repository';
import { CustomerChangeService } from './customer-change/customer-change.service';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [CustomersController, CustomerChangeController],
  providers: [
    CustomersService,
    CustomersRepository,
    CustomerChangeService,
    CustomerChangeRepository,
  ],
  exports: [CustomersService],
})
export class CustomersModule {}
