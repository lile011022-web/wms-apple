import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import path from 'node:path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);

  app.setGlobalPrefix('api/v1');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  const webOrigin = configService.get<string>('app.webOrigin', 'http://localhost:5173');
  const allowedWebOrigins = Array.from(
    new Set([webOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173']),
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedWebOrigins.includes(origin) ||
        /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):5173$/.test(
          origin,
        )
      ) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('WMS Scan API')
    .setDescription('Apple product warehouse scanning API')
    .setVersion('0.1.0')
    .addTag('Health', 'API health checks and service readiness')
    .addTag('Auth', 'Authentication, logout, token refresh, and current user')
    .addTag('Users', 'User account management')
    .addTag('Roles', 'Role management and role permission assignment')
    .addTag('Permissions', 'Permission point metadata')
    .addTag('Warehouses', 'Warehouse records and warehouse settings')
    .addTag('Customers', 'Customer management and customer selection options')
    .addTag('Products', 'UPC product catalog and UPC lookup')
    .addTag('Inbound', 'Inbound scan drafts, confirmation, and inbound records')
    .addTag('Inventory', 'Customer inventory summary and item-level IMEI inventory')
    .addTag('Outbound', 'Outbound boxes, box items, and sealing')
    .addTag('Exceptions', 'Exception pool and exception handling')
    .addTag('Reports', 'Report exports and detail downloads')
    .addTag('Audit Logs', 'Critical operation audit logs')
    .addTag('Settings', 'System settings and scan rule configuration')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the access token returned by the login API.',
      },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
}

void bootstrap();
