import { describe, expect, it } from 'vitest';
import { ScanCodeType } from '../enums/scan-code-type.js';
import { UserRole } from '../enums/user-role.js';
import { isValidImei } from './imei.js';
import { parseBarcode, validateScanCode } from './scan.js';
import { isValidUpc } from './upc.js';
import { isValidUpsTracking } from './ups.js';

describe('shared scan validators', () => {
  it('validates IMEI values', () => {
    expect(isValidImei('490154203237518')).toBe(true);
    expect(isValidImei('49015420323751')).toBe(false);
  });

  it('validates UPC values', () => {
    expect(isValidUpc('194253149189')).toBe(true);
    expect(isValidUpc('ABC194253149189')).toBe(false);
  });

  it('validates UPS tracking values', () => {
    expect(isValidUpsTracking('1Z999AA10123456784')).toBe(true);
    expect(isValidUpsTracking('9999AA10123456784')).toBe(false);
  });

  it('parses known barcode formats in a stable order', () => {
    expect(parseBarcode('1Z999AA10123456784')).toMatchObject({
      valid: true,
      type: ScanCodeType.UPS,
    });
    expect(parseBarcode('194253149189')).toMatchObject({
      valid: true,
      type: ScanCodeType.UPC,
    });
    expect(parseBarcode('490154203237518')).toMatchObject({
      valid: true,
      type: ScanCodeType.IMEI,
    });
  });

  it('returns a typed invalid result for unsupported barcodes', () => {
    expect(parseBarcode('not-a-barcode')).toEqual({
      valid: false,
      value: 'not-a-barcode',
      reason: 'Unsupported barcode format',
    });
  });

  it('keeps explicit type validation available', () => {
    expect(validateScanCode(ScanCodeType.UPS, '1Z999AA10123456784')).toMatchObject({
      valid: true,
      type: ScanCodeType.UPS,
    });
    expect(UserRole.OPERATOR).toBe('OPERATOR');
  });
});
