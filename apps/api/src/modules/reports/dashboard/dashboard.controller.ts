import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('dashboard.read')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getSummary(query);
  }

  @Get('trends')
  getTrends(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getTrends(query);
  }

  @Get('exception-distribution')
  getExceptionDistribution(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getExceptionDistribution(query);
  }

  @Get('top-inbound-customers')
  getTopInboundCustomers(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getTopInboundCustomers(query);
  }
}
