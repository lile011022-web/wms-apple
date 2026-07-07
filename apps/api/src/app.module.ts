import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { envSchema } from './config/env.schema';
import { jwtConfig } from './config/jwt.config';
import { redisConfig } from './config/redis.config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ExceptionsModule } from './modules/exceptions/exceptions.module';
import { InboundModule } from './modules/inbound/inbound.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OutboundModule } from './modules/outbound/outbound.module';
import { PackagePrealertsModule } from './modules/package-prealerts/package-prealerts.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { ProductsModule } from './modules/products/products.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, jwtConfig],
      envFilePath: ['.env', '../../.env'],
      validate: (config) => envSchema.parse(config),
    }),
    JwtModule.register({ global: true }),
    HealthModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    WarehousesModule,
    CustomersModule,
    ProductsModule,
    InboundModule,
    InventoryModule,
    OutboundModule,
    PackagePrealertsModule,
    ExceptionsModule,
    ReportsModule,
    AuditLogsModule,
    SettingsModule,
  ],
})
export class AppModule {}
