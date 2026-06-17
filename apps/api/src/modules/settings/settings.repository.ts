import { Injectable } from '@nestjs/common';
import { Prisma, SettingValueType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByKeys(keys: string[]) {
    return this.prisma.systemSetting.findMany({
      where: { key: { in: keys } },
      orderBy: { key: 'asc' },
    });
  }

  findWarehouseById(id: string) {
    return this.prisma.warehouse.findUnique({ where: { id } });
  }

  upsertMany(
    settings: Array<{
      key: string;
      value: Prisma.InputJsonValue;
      valueType: SettingValueType;
      description: string;
      updatedById?: string;
    }>,
  ) {
    return this.prisma.$transaction(
      settings.map((setting) =>
        this.prisma.systemSetting.upsert({
          where: { key: setting.key },
          update: {
            value: setting.value,
            valueType: setting.valueType,
            description: setting.description,
            updatedById: setting.updatedById,
          },
          create: {
            key: setting.key,
            value: setting.value,
            valueType: setting.valueType,
            description: setting.description,
            updatedById: setting.updatedById,
          },
        }),
      ),
    );
  }
}
