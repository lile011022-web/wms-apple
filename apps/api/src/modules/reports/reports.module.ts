import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardRepository } from './dashboard/dashboard.repository';
import { DashboardService } from './dashboard/dashboard.service';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController, DashboardController],
  providers: [ReportsService, ReportsRepository, DashboardService, DashboardRepository],
  exports: [ReportsService],
})
export class ReportsModule {}
