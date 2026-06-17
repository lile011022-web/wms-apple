import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
