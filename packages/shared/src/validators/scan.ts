import { ScanCodeType } from '../enums/scan-code-type';
import type { ScanValidationResult } from '../types/scan';
import { isValidImei } from './imei';
import { isValidSerial } from './serial';
import { isValidUpc } from './upc';
import { isValidUpsTrackingNumber } from './ups';

export function validateScanCode(type: ScanCodeType, value: string): ScanValidationResult {
  const normalizedValue = value.trim();
  const validators: Record<ScanCodeType, (input: string) => boolean> = {
    [ScanCodeType.UPS]: isValidUpsTrackingNumber,
    [ScanCodeType.UPC]: isValidUpc,
    [ScanCodeType.IMEI]: isValidImei,
    [ScanCodeType.SERIAL]: isValidSerial,
  };

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
