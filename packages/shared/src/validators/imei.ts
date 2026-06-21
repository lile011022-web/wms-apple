export function isValidImei(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return /^\d{15}$/.test(normalized) || /^(?=.*[A-Z])[A-Z0-9]{10,18}$/.test(normalized);
}
