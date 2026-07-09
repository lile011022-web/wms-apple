import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { GoogleSheetsClient } from './google-sheets.client';
import { PackagePrealertSheetsSyncService } from './package-prealert-sheets-sync.service';
import { PackagePrealertsEnabledGuard } from './package-prealerts-enabled.guard';
import { PackagePrealertsController } from './package-prealerts.controller';
import { PackagePrealertsService } from './package-prealerts.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [PackagePrealertsController],
  providers: [
    GoogleSheetsClient,
    PackagePrealertsEnabledGuard,
    PackagePrealertSheetsSyncService,
    PackagePrealertsService,
  ],
  exports: [PackagePrealertsService],
})
export class PackagePrealertsModule {}
