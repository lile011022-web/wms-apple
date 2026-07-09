import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { BulkDeletePackagePrealertsDto } from './dto/bulk-delete-package-prealerts.dto';
import { CreatePackagePrealertBatchDto } from './dto/create-package-prealert-batch.dto';
import { HandlePackageAlertDto } from './dto/handle-package-alert.dto';
import {
  ListPackageAlertsQueryDto,
  ListPackagePrealertsQueryDto,
} from './dto/list-package-prealerts-query.dto';
import { MatchPackagePrealertQueryDto } from './dto/match-package-prealert-query.dto';
import { PackagePrealertSheetsSyncService } from './package-prealert-sheets-sync.service';
import { PackagePrealertsEnabledGuard } from './package-prealerts-enabled.guard';
import { UpdatePackagePrealertStatusDto } from './dto/update-package-prealert-status.dto';
import { PackagePrealertsService } from './package-prealerts.service';

@ApiTags('Package Prealerts')
@ApiBearerAuth('access-token')
@UseGuards(PackagePrealertsEnabledGuard, JwtAuthGuard, PermissionsGuard)
@Controller('package-prealerts')
export class PackagePrealertsController {
  constructor(
    private readonly packagePrealertsService: PackagePrealertsService,
    private readonly sheetsSyncService: PackagePrealertSheetsSyncService,
  ) {}

  @Get('summary')
  @Permissions('package-prealerts.read')
  summary() {
    return this.packagePrealertsService.summary();
  }

  @Get('match')
  @Permissions('package-prealerts.read')
  match(@Query() query: MatchPackagePrealertQueryDto) {
    return this.packagePrealertsService.matchTracking(query.trackingNo);
  }

  @Get()
  @Permissions('package-prealerts.read')
  list(@Query() query: ListPackagePrealertsQueryDto) {
    return this.packagePrealertsService.list(query);
  }

  @Get('alerts')
  @Permissions('package-prealerts.read')
  listAlerts(@Query() query: ListPackageAlertsQueryDto) {
    return this.packagePrealertsService.listAlerts(query);
  }

  @Get('integrations/sheets/template')
  @Permissions('package-prealerts.read')
  sheetsTemplate() {
    return this.sheetsSyncService.template();
  }

  @Post('integrations/sheets/push')
  @Permissions('package-prealerts.manage')
  pushSheetsPrealerts() {
    return this.sheetsSyncService.pushPendingPrealerts();
  }

  @Post('integrations/sheets/pull')
  @Permissions('package-prealerts.manage')
  pullSheetsReturns() {
    return this.sheetsSyncService.pullWarehouseReturns();
  }

  @Post('integrations/sheets/sync')
  @Permissions('package-prealerts.manage')
  syncSheetsExchange() {
    return this.sheetsSyncService.syncExchange();
  }

  @Post()
  @Permissions('package-prealerts.manage')
  create(@Body() dto: CreatePackagePrealertBatchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.packagePrealertsService.createBatch(dto, user);
  }

  @Post('bulk-delete')
  @Permissions('package-prealerts.manage')
  bulkDelete(@Body() dto: BulkDeletePackagePrealertsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.packagePrealertsService.deleteItems(dto.ids, user);
  }

  @Delete(':id')
  @Permissions('package-prealerts.manage')
  delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.packagePrealertsService.deleteItem(id, user);
  }

  @Patch(':id/status')
  @Permissions('package-prealerts.manage')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePackagePrealertStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.packagePrealertsService.updateStatus(id, dto, user);
  }

  @Patch('alerts/:id')
  @Permissions('package-prealerts.manage')
  handleAlert(
    @Param('id') id: string,
    @Body() dto: HandlePackageAlertDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.packagePrealertsService.handleAlert(id, dto, user);
  }
}
