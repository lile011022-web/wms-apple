import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AddOutboundBoxItemDto } from './dto/add-outbound-box-item.dto';
import { CreateOutboundBoxDto } from './dto/create-outbound-box.dto';
import { ListOutboundAvailableItemsQueryDto } from './dto/list-outbound-available-items-query.dto';
import { ListOutboundBoxItemsQueryDto } from './dto/list-outbound-box-items-query.dto';
import { ListOutboundBoxesQueryDto } from './dto/list-outbound-boxes-query.dto';
import { UpdateOutboundBoxDto } from './dto/update-outbound-box.dto';
import { OutboundService, UploadedOutboundBoxPhotoFile } from './outbound.service';

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

  @Get('boxes/:id/items')
  listBoxItems(@Param('id') id: string, @Query() query: ListOutboundBoxItemsQueryDto) {
    return this.outboundService.listBoxItems(id, query);
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

  @Post('boxes/:id/photos')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 100 * 1024 * 1024 } }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: UploadedOutboundBoxPhotoFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.outboundService.uploadPhoto(id, file, user);
  }

  @Delete('boxes/:id/photos/:photoId')
  deletePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.outboundService.deletePhoto(id, photoId, user);
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
