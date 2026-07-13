import { describe, expect, it } from 'vitest';
import { ScanCodeType } from '../enums/scan-code-type.js';
import { UserRole } from '../enums/user-role.js';
import { isValidImei } from './imei.js';
import { parseBarcode, validateScanCode } from './scan.js';
import { isValidUpc } from './upc.js';
import {
  isValidFedexTracking,
  isValidPackageTracking,
  isValidUpsTracking,
  isValidUspsTracking,
  isAutoAcceptedPackageTracking,
  isWarehouseCompensationTracking,
  normalizePackageTracking,
} from './ups.js';

describe('shared scan validators', () => {
  it('validates IMEI values', () => {
    expect(isValidImei('490154203237518')).toBe(true);
    expect(isValidImei('SH9LRL91YFC')).toBe(true);
    expect(isValidImei('49015420323751')).toBe(false);
    expect(isValidImei('SH9-LRL91-YFC')).toBe(false);
  });

  it('validates UPC values', () => {
    expect(isValidUpc('194253149189')).toBe(true);
    expect(isValidUpc('ABC194253149189')).toBe(false);
  });

  it('validates UPS tracking values', () => {
    expect(isValidUpsTracking('1Z999AA10123456784')).toBe(true);
    expect(isValidUpsTracking('9999AA10123456784')).toBe(false);
  });

  it('validates supported package tracking values for inbound package scans', () => {
    expect(isValidPackageTracking('1Z999AA10123456784')).toBe(true);
    expect(isValidUspsTracking('9400111899223857000000')).toBe(true);
    expect(isValidFedexTracking('9611020987654312345672')).toBe(true);
    expect(isValidFedexTracking('96320804008675235705004823280')).toBe(true);
    expect(isValidFedexTracking('9632080400867523570500482328409684')).toBe(true);
    expect(isWarehouseCompensationTracking('bb0000')).toBe(true);
    expect(isValidPackageTracking('bb0000jh05')).toBe(true);
    expect(normalizePackageTracking(' 9400 1118 9922 3857 0000 00 ')).toBe(
      '9400111899223857000000',
    );
    expect(normalizePackageTracking(' bb0000 ')).toBe('BB0000');
    expect(normalizePackageTracking(' bb0000 jh05 ')).toBe('BB0000JH05');
  });

  it('auto-accepts UPS, configured 9622/9632 FedEx, and warehouse compensation tracking before manual review', () => {
    expect(isAutoAcceptedPackageTracking('1Z999AA10123456784')).toBe(true);
    expect(isAutoAcceptedPackageTracking('9622123456789012345678')).toBe(true);
    expect(isAutoAcceptedPackageTracking('9622080430009579265100530689178')).toBe(true);
    expect(isAutoAcceptedPackageTracking('9632080400867523570500482328409684')).toBe(true);
    expect(isAutoAcceptedPackageTracking('bb0000')).toBe(true);
    expect(isAutoAcceptedPackageTracking('bb0000jh05')).toBe(true);
    expect(isAutoAcceptedPackageTracking('9400111899223857000000')).toBe(false);
    expect(isAutoAcceptedPackageTracking('9611020987654312345672')).toBe(false);
    expect(isAutoAcceptedPackageTracking('96320804008675235705004823280')).toBe(false);
    expect(isAutoAcceptedPackageTracking('963208040086752357050048232840968')).toBe(false);
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
    expect(parseBarcode('SH9LRL91YFC')).toMatchObject({
      valid: true,
      type: ScanCodeType.IMEI,
      value: 'SH9LRL91YFC',
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
