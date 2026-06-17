export function isValidUpsTracking(value: string): boolean {
  return /^1Z[0-9A-Z]{16}$/i.test(value.trim());
}

export const isValidUpsTrackingNumber = isValidUpsTracking;
