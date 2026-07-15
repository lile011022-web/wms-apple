import {
  isAutoAcceptedPackageTracking,
  isValidImei,
  isValidPackageTracking,
  isValidUpc,
  isValidUpsTracking,
  isWarehouseCompensationTracking,
  normalizePackageTracking,
} from '@wms-scan/shared';
import { trackingFormatErrorMessage } from './tracking-input';

export type InboundScanField = 'tracking' | 'upc' | 'imei';

export type InboundScanFieldIssue = {
  field: InboundScanField;
  message: string;
};

export type InboundScanFieldInput = {
  scanMode: 'STANDARD' | 'TRACKING_UPC';
  upsTrackingNo: string;
  upc: string;
  imei: string;
  trackingWarningConfirmed: boolean;
};

export function getInboundScanFieldIssue(
  input: InboundScanFieldInput,
): InboundScanFieldIssue | null {
  const trackingValue = normalizePackageTracking(input.upsTrackingNo);
  const upcValue = input.upc.trim();
  const imeiValue = input.imei.trim().toUpperCase();

  if (!trackingValue) {
    return upcValue || imeiValue ? { field: 'tracking', message: '请先扫描物流单号。' } : null;
  }
  if (!isValidPackageTracking(trackingValue)) {
    return { field: 'tracking', message: `${trackingFormatErrorMessage}。` };
  }
  if (!isAutoAcceptedPackageTracking(trackingValue) && !input.trackingWarningConfirmed) {
    return {
      field: 'tracking',
      message: '该物流单号需要人工确认，请回到物流单号框按 Enter 完成检查。',
    };
  }
  if (!upcValue) {
    return imeiValue ? { field: 'upc', message: '请先扫描 UPC。' } : null;
  }
  if (!isValidUpc(upcValue)) {
    return { field: 'upc', message: 'UPC 格式不正确：请输入 8-14 位数字。' };
  }
  if (upcValue.toUpperCase() === trackingValue) {
    return { field: 'upc', message: 'UPC 不能与物流单号相同，请重新扫描 UPC。' };
  }
  if (input.scanMode === 'TRACKING_UPC') {
    return null;
  }
  if (!imeiValue) {
    return null;
  }
  if (
    imeiValue === trackingValue ||
    isValidUpsTracking(imeiValue) ||
    isWarehouseCompensationTracking(imeiValue)
  ) {
    return {
      field: 'imei',
      message: 'IMEI 位置扫入了物流单号，已暂停继续扫码，请重新扫描正确 IMEI。',
    };
  }
  if (imeiValue === upcValue) {
    return { field: 'imei', message: 'IMEI 不能与 UPC 相同，请重新扫描 IMEI。' };
  }
  if (!isValidImei(imeiValue)) {
    return {
      field: 'imei',
      message: 'IMEI 格式不正确：请输入 15 位数字 IMEI，或 10-18 位大写字母数字的 Apple 设备标识。',
    };
  }

  return null;
}

export function getInboundScanFocusIssue(
  input: InboundScanFieldInput,
  requestedField: InboundScanField,
): InboundScanFieldIssue | null {
  if (requestedField === 'tracking') {
    return null;
  }

  const trackingValue = normalizePackageTracking(input.upsTrackingNo);
  if (!trackingValue) {
    return { field: 'tracking', message: '请先扫描物流单号。' };
  }

  const issue = getInboundScanFieldIssue(input);
  if (issue?.field === 'tracking') {
    return issue;
  }
  if (requestedField === 'upc') {
    return null;
  }

  if (!input.upc.trim()) {
    return { field: 'upc', message: '请先扫描 UPC，正确后才能继续扫描 IMEI。' };
  }
  if (issue?.field === 'upc') {
    return issue;
  }

  return null;
}

export function inferInboundScanErrorField(message: string): InboundScanField | null {
  const normalized = message.toUpperCase();
  if (normalized.includes('IMEI') || normalized.includes('SERIAL')) return 'imei';
  if (normalized.includes('UPC') || normalized.includes('商品库')) return 'upc';
  if (normalized.includes('物流单号') || normalized.includes('TRACKING')) return 'tracking';
  return null;
}
