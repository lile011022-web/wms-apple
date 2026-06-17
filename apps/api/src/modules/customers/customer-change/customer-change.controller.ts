import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CommitCustomerChangeDto } from './dto/commit-customer-change.dto';
import { ListCustomerChangeCandidatesQueryDto } from './dto/list-customer-change-candidates-query.dto';
import { ListCustomerChangeLogsQueryDto } from './dto/list-customer-change-logs-query.dto';
import { PreviewCustomerChangeDto } from './dto/preview-customer-change.dto';
import { CustomerChangeService } from './customer-change.service';

@ApiTags('Customer Changes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('customers.manage')
@Controller('customer-changes')
export class CustomerChangeController {
  constructor(private readonly customerChangeService: CustomerChangeService) {}

  @Get('candidates')
  listCandidates(@Query() query: ListCustomerChangeCandidatesQueryDto) {
    return this.customerChangeService.listCandidates(query);
  }

  @Post('preview')
  preview(@Body() dto: PreviewCustomerChangeDto) {
    return this.customerChangeService.preview(dto);
  }

  @Post('commit')
  commit(@Body() dto: CommitCustomerChangeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customerChangeService.commit(dto, user);
  }

  @Get('logs')
  listLogs(@Query() query: ListCustomerChangeLogsQueryDto) {
    return this.customerChangeService.listLogs(query);
  }
}
