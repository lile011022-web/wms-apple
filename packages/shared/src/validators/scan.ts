import { ScanCodeType } from '../enums/scan-code-type';
import type { ScanValidationResult } from '../types/scan';
import { isValidImei } from './imei';
import { isValidSerial } from './serial';
import { isValidUpc } from './upc';
import { isValidUpsTracking } from './ups';

const SCAN_ORDER = [
  ScanCodeType.UPS,
  ScanCodeType.UPC,
  ScanCodeType.IMEI,
  ScanCodeType.SERIAL,
] as const;

const validators: Record<ScanCodeType, (input: string) => boolean> = {
  [ScanCodeType.UPS]: isValidUpsTracking,
  [ScanCodeType.UPC]: isValidUpc,
  [ScanCodeType.IMEI]: isValidImei,
  [ScanCodeType.SERIAL]: isValidSerial,
};

export function validateScanCode(type: ScanCodeType, value: string): ScanValidationResult {
  const normalizedValue = value.trim();

  if (validators[type](normalizedValue)) {
    return {
      valid: true,
      type,
      value: normalizedValue,
    };
  }

  return {
    valid: false,
    type,
    value: normalizedValue,
    reason: `Invalid ${type} format`,
  };
}

export function parseBarcode(value: string): ScanValidationResult {
  const normalizedValue = value.trim();

  for (const type of SCAN_ORDER) {
    if (validators[type](normalizedValue)) {
      return {
        valid: true,
        type,
        value: normalizedValue,
      };
    }
  }

  return {
    valid: false,
    value: normalizedValue,
    reason: 'Unsupported barcode format',
  };
}
