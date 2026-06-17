import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check API health status' })
  @ApiOkResponse({
    description: 'The API process is running.',
    schema: {
      example: {
        success: true,
        data: {
          status: 'ok',
          service: 'wms-scan-api',
        },
        requestId: 'request-id',
      },
    },
  })
  check() {
    return {
      status: 'ok',
      service: 'wms-scan-api',
    };
  }
}
