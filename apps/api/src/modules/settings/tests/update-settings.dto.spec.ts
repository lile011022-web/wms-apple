import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSettingsDto } from '../dto/update-settings.dto';

describe('UpdateSettingsDto', () => {
  it('rejects invalid data retention values', async () => {
    const dto = plainToInstance(UpdateSettingsDto, {
      retention: {
        auditLogRetentionDays: 0,
        reportExportRetentionDays: 3651,
        exceptionRecordRetentionDays: 1.5,
      },
    });

    const errors = await validate(dto);
    const retentionError = errors[0]!;

    expect(errors).toHaveLength(1);
    expect(retentionError).toBeDefined();
    expect(retentionError.property).toBe('retention');
    expect(retentionError.children?.map((error) => error.property).sort()).toEqual([
      'auditLogRetentionDays',
      'exceptionRecordRetentionDays',
      'reportExportRetentionDays',
    ]);
  });
});
