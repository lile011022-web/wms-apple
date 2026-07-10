export const outboundBoxNameMaxLength = 120;

const forbiddenBoxNameCharacters = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const boxNameSpaces = /\p{Zs}+/gu;

export type OutboundBoxNameValidationError = 'EMPTY' | 'FORBIDDEN_CHARACTERS' | 'TOO_LONG';

export type NormalizedOutboundBoxName =
  | { value: string; key: string; error?: never }
  | { value?: never; key?: never; error: OutboundBoxNameValidationError };

export function normalizeOutboundBoxName(value: string): NormalizedOutboundBoxName {
  const normalizedUnicode = value.normalize('NFKC');
  if (forbiddenBoxNameCharacters.test(normalizedUnicode)) {
    return { error: 'FORBIDDEN_CHARACTERS' };
  }
  const normalized = normalizeOutboundBoxNameText(normalizedUnicode, false);
  if (!normalized) {
    return { error: 'EMPTY' };
  }
  if ([...normalized].length > outboundBoxNameMaxLength) {
    return { error: 'TOO_LONG' };
  }
  return {
    value: normalized,
    key: normalized.toLocaleLowerCase('en-US'),
  };
}

export function toOutboundBoxNameKey(value: string) {
  return normalizeOutboundBoxNameText(value).toLocaleLowerCase('en-US');
}

function normalizeOutboundBoxNameText(value: string, normalizeUnicode = true) {
  const normalized = normalizeUnicode ? value.normalize('NFKC') : value;
  return normalized.replace(boxNameSpaces, ' ').trim();
}
