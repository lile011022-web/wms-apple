import { ScanCodeType } from '../enums/scan-code-type.js';

export type ScanValidationResult =
  | {
      valid: true;
      type: ScanCodeType;
      value: string;
    }
  | {
      valid: false;
      type?: ScanCodeType;
      value: string;
      reason: string;
    };
