import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardRepository } from './dashboard/dashboard.repository';
import { DashboardService } from './dashboard/dashboard.service';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ReportsController, DashboardController],
  providers: [ReportsService, ReportsRepository, DashboardService, DashboardRepository],
  exports: [ReportsService],
})
export class ReportsModule {}
