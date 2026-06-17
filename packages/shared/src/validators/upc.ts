export function isValidUpc(value: string): boolean {
  return /^\d{8,14}$/.test(value.trim());
}
