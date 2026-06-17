export function isValidSerial(value: string): boolean {
  return /^[0-9A-Z]{8,20}$/i.test(value.trim());
}
