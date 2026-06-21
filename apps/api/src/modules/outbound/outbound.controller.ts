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
import { AddOutboundBoxItemDto } from './dto/add-outbound-box-item.dto';
import { CreateOutboundBoxDto } from './dto/create-outbound-box.dto';
import { ListOutboundAvailableItemsQueryDto } from './dto/list-outbound-available-items-query.dto';
import { ListOutboundBoxesQueryDto } from './dto/list-outbound-boxes-query.dto';
import { UpdateOutboundBoxDto } from './dto/update-outbound-box.dto';
import { OutboundService } from './outbound.service';

@ApiTags('Outbound')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('outbound.manage')
@Controller('outbound')
export class OutboundController {
  constructor(private readonly outboundService: OutboundService) {}

  @Post('boxes')
  createBox(@Body() dto: CreateOutboundBoxDto, @CurrentUser() user: AuthenticatedUser) {
    return this.outboundService.createBox(dto, user);
  }

  @Get('boxes')
  listBoxes(@Query() query: ListOutboundBoxesQueryDto) {
    return this.outboundService.listBoxes(query);
  }

  @Get('boxes/:id')
  getBox(@Param('id') id: string) {
    return this.outboundService.getBox(id);
  }

  @Patch('boxes/:id')
  updateBox(
    @Param('id') id: string,
    @Body() dto: UpdateOutboundBoxDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.outboundService.updateBox(id, dto, user);
  }

  @Get('available-items')
  listAvailableItems(@Query() query: ListOutboundAvailableItemsQueryDto) {
    return this.outboundService.listAvailableItems(query);
  }

  @Post('boxes/:id/items')
  addItem(
    @Param('id') id: string,
    @Body() dto: AddOutboundBoxItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.outboundService.addItem(id, dto, user);
  }

  @Delete('boxes/:id/items/:itemId')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.outboundService.removeItem(id, itemId, user);
  }

  @Delete('boxes/:id/items')
  clearItems(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.outboundService.clearItems(id, user);
  }

  @Post('boxes/:id/seal')
  sealBox(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.outboundService.sealBox(id, user);
  }

  @Post('boxes/:id/reopen')
  reopenBox(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.outboundService.reopenBox(id, user);
  }

  @Delete('boxes/:id')
  deleteBox(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.outboundService.deleteBox(id, user);
  }
}
