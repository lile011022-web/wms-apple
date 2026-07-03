import { Body, Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { DeleteInventoryItemsDto } from './dto/delete-inventory-items.dto';
import { DeleteInventoryProductsDto } from './dto/delete-inventory-products.dto';
import { InventoryCustomerSummaryQueryDto } from './dto/inventory-customer-summary-query.dto';
import { ListInventoryItemsQueryDto } from './dto/list-inventory-items-query.dto';
import { ListInventoryProductsQueryDto } from './dto/list-inventory-products-query.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('inventory.read')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('customer-summary')
  getCustomerSummary(@Query() query: InventoryCustomerSummaryQueryDto) {
    return this.inventoryService.getCustomerSummary(query);
  }

  @Get('products')
  listProducts(@Query() query: ListInventoryProductsQueryDto) {
    return this.inventoryService.listProducts(query);
  }

  @Delete('products')
  @Permissions('customers.manage')
  deleteProducts(@Body() dto: DeleteInventoryProductsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.deleteProducts(dto, user);
  }

  @Get('products/:productId/items')
  listProductItems(
    @Param('productId') productId: string,
    @Query() query: ListInventoryItemsQueryDto,
  ) {
    return this.inventoryService.listProductItems(productId, query);
  }

  @Get('items')
  listItems(@Query() query: ListInventoryItemsQueryDto) {
    return this.inventoryService.listItems(query);
  }

  @Delete('items')
  @Permissions('customers.manage')
  deleteItems(@Body() dto: DeleteInventoryItemsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.deleteItems(dto, user);
  }

  @Get('items/:id')
  getItem(@Param('id') id: string) {
    return this.inventoryService.getItem(id);
  }

  @Get('available-for-outbound')
  listAvailableForOutbound(@Query() query: ListInventoryItemsQueryDto) {
    return this.inventoryService.listAvailableForOutbound(query);
  }

  @Get('export-preview')
  createExportPreview(@Query() query: ListInventoryItemsQueryDto) {
    return this.inventoryService.createExportPreview(query);
  }
}
