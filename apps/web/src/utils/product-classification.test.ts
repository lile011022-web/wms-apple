import { describe, expect, it } from 'vitest';
import {
  getProductConditionFromText,
  isLikelyRefurbishedText,
} from './product-classification';

describe('product classification', () => {
  it('recognizes normal refurbished keywords', () => {
    expect(getProductConditionFromText('iPad WI-FI 128GB Blue (Refurbished)')).toBe(
      'REFURBISHED',
    );
    expect(getProductConditionFromText('iPhone 15 RFB')).toBe('REFURBISHED');
    expect(getProductConditionFromText('iPhone 14 官翻')).toBe('REFURBISHED');
  });

  it('recognizes common misspellings of refurbished', () => {
    expect(isLikelyRefurbishedText('iPhone 16pro max 256gb(Reurbished)')).toBe(true);
    expect(isLikelyRefurbishedText('iPhone 16 Pro Refurbrshed')).toBe(true);
    expect(isLikelyRefurbishedText('iPad Refubished Silver')).toBe(true);
  });

  it('keeps ordinary product text as new', () => {
    expect(getProductConditionFromText('iPhone 17 Pro Max 512GB Silver')).toBe('NEW');
    expect(getProductConditionFromText('iPad Air 256GB Blue')).toBe('NEW');
  });
});
