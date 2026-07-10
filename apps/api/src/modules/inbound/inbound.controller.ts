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
import { AddInboundItemDto } from './dto/add-inbound-item.dto';
import { CorrectInboundRecordUpcDto } from './dto/correct-inbound-record-upc.dto';
import { CreateInboundDraftDto } from './dto/create-inbound-draft.dto';
import { ForceConfirmInboundItemDto } from './dto/force-confirm-inbound-item.dto';
import { ImportInboundItemsDto } from './dto/import-inbound-items.dto';
import { ListInboundRecordsQueryDto } from './dto/list-inbound-records-query.dto';
import { ScanInboundUpsDto } from './dto/scan-inbound-ups.dto';
import { InboundService } from './inbound.service';

@ApiTags('Inbound')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('inbound.manage')
@Controller('inbound')
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @Post('drafts')
  createDraft(@Body() dto: CreateInboundDraftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inboundService.createDraft(dto, user);
  }

  @Get('drafts/by-batch/:batchNo')
  getDraftByBatchNo(@Param('batchNo') batchNo: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inboundService.getDraftByBatchNo(batchNo, user);
  }

  @Get('drafts/latest/my')
  getLatestDraft(@CurrentUser() user: AuthenticatedUser) {
    return this.inboundService.getLatestDraftForOperator(user);
  }

  @Get('drafts/:id')
  getDraft(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inboundService.getDraft(id, user);
  }

  @Post('drafts/:id/ups')
  scanUps(
    @Param('id') id: string,
    @Body() dto: ScanInboundUpsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.scanUps(id, dto, user);
  }

  @Post('drafts/:id/items')
  addItem(
    @Param('id') id: string,
    @Body() dto: AddInboundItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.addItem(id, dto, user);
  }

  @Patch('drafts/:id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: AddInboundItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.updateItem(id, itemId, dto, user);
  }

  @Post('drafts/:id/items/import')
  importItems(
    @Param('id') id: string,
    @Body() dto: ImportInboundItemsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.importItems(id, dto, user);
  }

  @Delete('drafts/:id/items/:itemId')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.removeItem(id, itemId, user);
  }

  @Delete('drafts/:id/items')
  clearDraftItems(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inboundService.clearDraftItems(id, user);
  }

  @Post('drafts/:id/confirm')
  confirmDraft(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inboundService.confirmDraft(id, user);
  }

  @Post('records/:id/force-confirm')
  forceConfirmRecord(
    @Param('id') id: string,
    @Body() dto: ForceConfirmInboundItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.forceConfirmRecord(id, dto, user);
  }

  @Patch('records/:id/upc')
  correctRecordUpc(
    @Param('id') id: string,
    @Body() dto: CorrectInboundRecordUpcDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.correctRecordUpc(id, dto, user);
  }

  @Patch('records/:id/correction')
  correctRecord(
    @Param('id') id: string,
    @Body() dto: CorrectInboundRecordUpcDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.correctRecordUpc(id, dto, user);
  }

  @Get('records')
  listRecords(@Query() query: ListInboundRecordsQueryDto) {
    return this.inboundService.listRecords(query);
  }

  @Post('records/export-preview')
  createExportPreview(@Body() dto: ListInboundRecordsQueryDto) {
    return this.inboundService.createExportPreview(dto);
  }

  @Get('records/:id/items')
  getRecordItems(@Param('id') id: string, @Query() query: ListInboundRecordsQueryDto) {
    return this.inboundService.getRecordItems(id, query);
  }

  @Get('records/:id')
  getRecord(@Param('id') id: string) {
    return this.inboundService.getRecord(id);
  }
}
