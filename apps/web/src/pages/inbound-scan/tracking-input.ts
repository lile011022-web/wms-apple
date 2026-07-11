import {
  isAutoAcceptedPackageTracking,
  isValidPackageTracking,
  isWarehouseCompensationTracking,
  normalizePackageTracking,
} from '@wms-scan/shared';

export type TrackingAdvanceTrigger = 'AUTO' | 'EXPLICIT';
export type TrackingAdvanceDecision = 'INVALID' | 'WAIT_FOR_EXPLICIT_REVIEW' | 'REVIEW_AND_ADVANCE';

export type TrackingScanResult = {
  upsTrackingNo: string;
  /** Legacy alias retained by the API. It means auto-accepted, not format-valid. */
  valid: boolean;
  formatValid?: boolean;
  autoAccepted?: boolean;
  duplicate: boolean;
  duplicateCount: number;
  currentDraftDuplicate?: boolean;
  currentDraftDuplicateCount?: number;
};

export const trackingFormatErrorMessage = '物流单号格式不正确，请检查是否少输、多输或输错字符';
export const trackingManualReviewMessage = '该物流单号格式合法，但不在自动放行规则内，需要人工确认';

export function getTrackingAdvanceDecision(
  value: string,
  trigger: TrackingAdvanceTrigger,
): TrackingAdvanceDecision {
  const normalized = normalizePackageTracking(value);
  if (!normalized || !isValidPackageTracking(normalized)) {
    return 'INVALID';
  }

  if (
    trigger === 'AUTO' &&
    (!isAutoAcceptedPackageTracking(normalized) || isWarehouseCompensationTracking(normalized))
  ) {
    return 'WAIT_FOR_EXPLICIT_REVIEW';
  }

  return 'REVIEW_AND_ADVANCE';
}

export function isTrackingScanFormatValid(result: TrackingScanResult) {
  return result.formatValid ?? isValidPackageTracking(result.upsTrackingNo);
}

export function isTrackingScanAutoAccepted(result: TrackingScanResult) {
  return result.autoAccepted ?? result.valid;
}

export function buildTrackingWarningReasons(result: TrackingScanResult) {
  const reasons: string[] = [];
  const formatValid = isTrackingScanFormatValid(result);

  if (!formatValid) {
    reasons.push(trackingFormatErrorMessage);
  } else if (!isTrackingScanAutoAccepted(result)) {
    reasons.push(trackingManualReviewMessage);
  }
  if (result.duplicate) {
    reasons.push(`该物流单号已有 ${result.duplicateCount} 条确认入库记录`);
  }
  if (result.currentDraftDuplicate) {
    reasons.push(`当前入库单已扫过该物流单号 ${result.currentDraftDuplicateCount ?? 1} 次`);
  }
  return reasons;
}
