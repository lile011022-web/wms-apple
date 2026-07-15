export function isValidUpsTracking(value: string): boolean {
  return /^1Z[0-9A-Z]{16}$/i.test(value.trim());
}

export const isValidUpsTrackingNumber = isValidUpsTracking;

export function isValidUspsTracking(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, '');
  return /^(?:9[0-9]{19,21}|420[0-9]{27,31})$/.test(normalized);
}

export function isValidFedexTracking(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, '');
  return /^(?:[0-9]{12}|[0-9]{15}|[0-9]{20}|[0-9]{22}|96[0-9]{20,32}|[0-9]{34})$/.test(normalized);
}

export function isAutoAcceptedFedexTracking(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, '');
  return /^(?:9622[0-9]{18,30}|9632[0-9]{30}|[0-9]{34})$/.test(normalized);
}

export function isWarehouseCompensationTracking(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, '').toUpperCase();
  return /^BB0000[0-9A-Z]*$/.test(normalized);
}

export function normalizePackageTracking(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

export function isValidPackageTracking(value: string): boolean {
  const normalized = normalizePackageTracking(value);
  return (
    isValidUpsTracking(normalized) ||
    isValidUspsTracking(normalized) ||
    isValidFedexTracking(normalized) ||
    isWarehouseCompensationTracking(normalized)
  );
}

export function isAutoAcceptedPackageTracking(value: string): boolean {
  const normalized = normalizePackageTracking(value);
  return (
    isValidUpsTracking(normalized) ||
    isAutoAcceptedFedexTracking(normalized) ||
    isWarehouseCompensationTracking(normalized)
  );
}
