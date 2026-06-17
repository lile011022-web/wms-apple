export function isValidUpsTrackingNumber(value: string): boolean {
  return /^1Z[0-9A-Z]{16}$/i.test(value.trim());
}
