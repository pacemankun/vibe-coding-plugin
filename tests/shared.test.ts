import { describe, expect, it } from 'vitest';
import { formatBadgePrice, formatPrice, formatChange, isStale } from '../src/shared/format';

describe('price display regression boundaries', () => {
  it('preserves nonzero tiny coin magnitude instead of displaying .000', () => {
    expect(formatBadgePrice('0.00001234')).toBe('1e-5');
    expect(formatBadgePrice('0.00000012')).toBe('1e-7');
    expect(formatPrice('0.000012340000')).toBe('0.00001234');
  });
  it.each(['62800', '123456', '999999', '0.044', '9.9999', '999.9', '0.000000000012', '100000000000000000000'])('keeps %s readable within four badge characters', (price) => {
    const result = formatBadgePrice(price);
    expect(result.length).toBeLessThanOrEqual(4);
    expect(result).not.toMatch(/^(?:--|0|\.0+|0\.0+)$/);
  });
  it('does not invent a zero change for missing or malformed values', () => {
    expect(formatChange(null)).toBe('--');
    expect(formatChange(NaN)).toBe('--');
    expect(formatChange(2.15)).toBe('+2.15%');
    expect(formatChange(-1.5)).toBe('-1.50%');
    expect(formatBadgePrice('NaN')).toBe('--');
  });
  it('detects stale quotes using time received, including missing quotes', () => {
    const quote = {symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',price:'60000',changePercent:1,receivedAt:1000,eventTime:900,source:'rest' as const};
    expect(isStale(quote, 2000)).toBe(false);
    expect(isStale(quote, 61001)).toBe(true);
    expect(isStale(undefined, 2000)).toBe(true);
  });
});
