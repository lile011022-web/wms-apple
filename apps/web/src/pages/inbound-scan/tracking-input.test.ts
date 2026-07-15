import { describe, expect, it } from 'vitest';
import {
  buildTrackingWarningReasons,
  getTrackingAdvanceDecision,
  isTrackingScanAutoAccepted,
  isTrackingScanFormatValid,
  type TrackingScanResult,
} from './tracking-input';

describe('inbound tracking focus decisions', () => {
  it('auto-advances only complete fixed-boundary auto-accepted values', () => {
    expect(getTrackingAdvanceDecision('1Z999AA10123456784', 'AUTO')).toBe('REVIEW_AND_ADVANCE');
    expect(getTrackingAdvanceDecision('9622123456789012345678', 'AUTO')).toBe('REVIEW_AND_ADVANCE');
    expect(getTrackingAdvanceDecision('9632080400867523570500482328409684', 'AUTO')).toBe(
      'REVIEW_AND_ADVANCE',
    );
    expect(getTrackingAdvanceDecision('1119212621960001972000533804475274', 'AUTO')).toBe(
      'REVIEW_AND_ADVANCE',
    );
  });

  it.each([
    ['UPS missing one character', '1Z999AA1012345678'],
    ['UPS with one extra character', '1Z999AA101234567849'],
    ['random eight characters', 'ABCDEFGH'],
    ['empty Enter', ''],
  ])('keeps invalid input in the tracking field: %s', (_label, value) => {
    expect(getTrackingAdvanceDecision(value, 'AUTO')).toBe('INVALID');
    expect(getTrackingAdvanceDecision(value, 'EXPLICIT')).toBe('INVALID');
  });

  it.each([
    ['USPS', '9400111899223857000000'],
    ['non-9622 FedEx', '9611020987654312345672'],
    ['12-digit UPC-like value', '195950637151'],
    ['15-digit IMEI-like value', '358015864089780'],
  ])('requires explicit review without auto-advancing: %s', (_label, value) => {
    expect(getTrackingAdvanceDecision(value, 'AUTO')).toBe('WAIT_FOR_EXPLICIT_REVIEW');
    expect(getTrackingAdvanceDecision(value, 'EXPLICIT')).toBe('REVIEW_AND_ADVANCE');
  });

  it.each(['BB0000', 'BB0000JH05'])(
    'waits for Enter or scanner completion for warehouse compensation value %s',
    (value) => {
      expect(getTrackingAdvanceDecision(value, 'AUTO')).toBe('WAIT_FOR_EXPLICIT_REVIEW');
      expect(getTrackingAdvanceDecision(value, 'EXPLICIT')).toBe('REVIEW_AND_ADVANCE');
    },
  );

  it('uses the explicit API contract while retaining the legacy valid alias', () => {
    const manualReview: TrackingScanResult = {
      upsTrackingNo: '9400111899223857000000',
      valid: false,
      formatValid: true,
      autoAccepted: false,
      duplicate: false,
      duplicateCount: 0,
    };
    const invalid: TrackingScanResult = {
      upsTrackingNo: 'NOT-A-TRACKING-NUMBER',
      valid: false,
      formatValid: false,
      autoAccepted: false,
      duplicate: false,
      duplicateCount: 0,
    };

    expect(isTrackingScanFormatValid(manualReview)).toBe(true);
    expect(isTrackingScanAutoAccepted(manualReview)).toBe(false);
    expect(buildTrackingWarningReasons(manualReview)).toEqual([
      '该物流单号格式合法，但不在自动放行规则内，需要人工确认',
    ]);
    expect(buildTrackingWarningReasons(invalid)).toEqual([
      '物流单号格式不正确，请检查是否少输、多输或输错字符',
    ]);

    expect(
      isTrackingScanFormatValid({
        ...manualReview,
        formatValid: undefined,
        autoAccepted: undefined,
      }),
    ).toBe(true);
  });
});
