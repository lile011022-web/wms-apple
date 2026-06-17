import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { BatchHandleExceptionsDto } from './dto/batch-handle-exceptions.dto';
import { HandleExceptionDto } from './dto/handle-exception.dto';
import { ListExceptionsQueryDto } from './dto/list-exceptions-query.dto';
import { ExceptionsService } from './exceptions.service';

@ApiTags('Exceptions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('exceptions.manage')
@Controller('exceptions')
export class ExceptionsController {
  constructor(private readonly exceptionsService: ExceptionsService) {}

  @Get()
  list(@Query() query: ListExceptionsQueryDto) {
    return this.exceptionsService.list(query);
  }

  @Get('summary')
  summary(@Query() query: ListExceptionsQueryDto) {
    return this.exceptionsService.summary(query);
  }

  @Post('batch-resolve')
  batchResolve(@Body() dto: BatchHandleExceptionsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.exceptionsService.batchResolve(dto, user);
  }

  @Post('batch-ignore')
  batchIgnore(@Body() dto: BatchHandleExceptionsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.exceptionsService.batchIgnore(dto, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.exceptionsService.get(id);
  }

  @Post(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() dto: HandleExceptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exceptionsService.resolve(id, dto, user);
  }

  @Post(':id/ignore')
  ignore(
    @Param('id') id: string,
    @Body() dto: HandleExceptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exceptionsService.ignore(id, dto, user);
  }

  @Post(':id/invalidate')
  invalidate(
    @Param('id') id: string,
    @Body() dto: HandleExceptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exceptionsService.invalidate(id, dto, user);
  }
}
