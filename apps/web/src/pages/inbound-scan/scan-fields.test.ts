import { describe, expect, it } from 'vitest';
import {
  getInboundScanFieldIssue,
  getInboundScanFocusIssue,
  inferInboundScanErrorField,
} from './scan-fields';

const validInput = {
  scanMode: 'STANDARD' as const,
  upsTrackingNo: '1Z999AA10123456784',
  upc: '194253149189',
  imei: '490154203237518',
  trackingWarningConfirmed: false,
};

describe('inbound scan field hard stops', () => {
  it('blocks a UPS tracking number scanned into the IMEI field', () => {
    expect(getInboundScanFieldIssue({ ...validInput, imei: '1Z9265F30352351025' })).toMatchObject({
      field: 'imei',
      message: expect.stringContaining('物流单号'),
    });
  });

  it('blocks duplicated values across scan fields', () => {
    expect(
      getInboundScanFieldIssue({ ...validInput, imei: validInput.upsTrackingNo }),
    ).toMatchObject({ field: 'imei' });
    expect(
      getInboundScanFieldIssue({
        ...validInput,
        scanMode: 'TRACKING_UPC',
        upsTrackingNo: '9622123456789012345678',
        upc: '962212345678',
        imei: '',
      }),
    ).toBeNull();
  });

  it('keeps valid numeric and alphanumeric Apple identifiers available', () => {
    expect(getInboundScanFieldIssue(validInput)).toBeNull();
    expect(getInboundScanFieldIssue({ ...validInput, imei: 'SH9LRL91YFC' })).toBeNull();
  });

  it('keeps focus on every earlier invalid scan field before the next field can be used', () => {
    expect(
      getInboundScanFocusIssue({ ...validInput, upsTrackingNo: 'BAD', upc: '', imei: '' }, 'upc'),
    ).toMatchObject({ field: 'tracking' });
    expect(
      getInboundScanFocusIssue({ ...validInput, upc: '358903505192909', imei: '' }, 'imei'),
    ).toMatchObject({ field: 'upc' });
    expect(getInboundScanFocusIssue({ ...validInput, upc: '', imei: '' }, 'imei')).toMatchObject({
      field: 'upc',
    });
    expect(getInboundScanFocusIssue(validInput, 'imei')).toBeNull();
  });

  it('routes API errors back to the field that must be fixed', () => {
    expect(inferInboundScanErrorField('UPC 未匹配商品库')).toBe('upc');
    expect(inferInboundScanErrorField('IMEI 已存在库存记录')).toBe('imei');
    expect(inferInboundScanErrorField('Invalid package tracking number format.')).toBe('tracking');
  });
});
