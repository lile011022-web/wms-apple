export type ProductCondition = 'NEW' | 'REFURBISHED';

export type ProductClassificationSource = {
  upc?: string | null;
  productSku?: string | null;
  productName?: string | null;
  productModel?: string | null;
  productCategory?: string | null;
};

const refurbishedKeywordPattern =
  /(refurb|renewed|翻新|官翻|整备|rfb|certified\s+pre[-\s]?owned)/i;

const refurbishedWords = ['refurbished', 'refurbish', 'refurb'];

export function getProductClassificationText(item: ProductClassificationSource) {
  return [
    item.upc,
    item.productSku,
    item.productName,
    item.productModel,
    item.productCategory,
  ]
    .filter(Boolean)
    .join(' ');
}

export function getProductConditionFromText(text: string): ProductCondition {
  if (isLikelyRefurbishedText(text)) {
    return 'REFURBISHED';
  }

  return 'NEW';
}

export function isLikelyRefurbishedText(text: string) {
  if (refurbishedKeywordPattern.test(text)) {
    return true;
  }

  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  return tokens.some((token) => isLikelyRefurbishedToken(token));
}

function isLikelyRefurbishedToken(token: string) {
  if (token.length < 6 || (!token.includes('r') && !token.includes('b'))) {
    return false;
  }

  return refurbishedWords.some((word) => {
    const allowedDistance = word === 'refurb' ? 1 : 2;
    return Math.abs(token.length - word.length) <= allowedDistance
      && getLevenshteinDistance(token, word) <= allowedDistance;
  });
}

function getLevenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const deletion = (previous[rightIndex] ?? Number.MAX_SAFE_INTEGER) + 1;
      const insertion = (current[rightIndex - 1] ?? Number.MAX_SAFE_INTEGER) + 1;
      const substitution =
        (previous[rightIndex - 1] ?? Number.MAX_SAFE_INTEGER) + substitutionCost;
      current[rightIndex] = Math.min(
        deletion,
        insertion,
        substitution,
      );
    }

    for (let index = 0; index <= right.length; index += 1) {
      previous[index] = current[index] ?? Number.MAX_SAFE_INTEGER;
    }
  }

  return previous[right.length] ?? Number.MAX_SAFE_INTEGER;
}
