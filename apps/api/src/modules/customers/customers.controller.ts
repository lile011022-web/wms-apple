import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateCustomerAliasDto } from './dto/create-customer-alias.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomerAliasOptionsQueryDto } from './dto/list-customer-alias-options-query.dto';
import { ListCustomerOptionsQueryDto } from './dto/list-customer-options-query.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateCustomerAliasDto } from './dto/update-customer-alias.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('customers.manage')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(@Query() query: ListCustomersQueryDto) {
    return this.customersService.list(query);
  }

  @Get('options')
  options(@Query() query: ListCustomerOptionsQueryDto) {
    return this.customersService.options(query);
  }

  @Get('alias-options')
  aliasOptions(@Query() query: ListCustomerAliasOptionsQueryDto) {
    return this.customersService.aliasOptions(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.customersService.getById(id);
  }

  @Get(':id/summary')
  getSummary(@Param('id') id: string) {
    return this.customersService.getSummary(id);
  }

  @Get(':id/aliases')
  listAliases(@Param('id') id: string) {
    return this.customersService.listAliases(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.update(id, dto, user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.updateStatus(id, dto, user);
  }

  @Post(':id/aliases')
  createAlias(
    @Param('id') id: string,
    @Body() dto: CreateCustomerAliasDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.createAlias(id, dto, user);
  }

  @Patch(':id/aliases/:aliasId')
  updateAlias(
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
    @Body() dto: UpdateCustomerAliasDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.updateAlias(id, aliasId, dto, user);
  }

  @Patch(':id/aliases/:aliasId/status')
  updateAliasStatus(
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
    @Body() dto: UpdateCustomerStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.updateAliasStatus(id, aliasId, dto, user);
  }
}
