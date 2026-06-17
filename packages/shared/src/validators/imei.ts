export function isValidImei(value: string): boolean {
  return /^\d{15}$/.test(value.trim());
}
