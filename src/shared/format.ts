import type { Quote } from './types';

export const STALE_AFTER_MS = 60_000;
export function validPrice(price: unknown): price is string {
  return typeof price === 'string' && /^\d+(?:\.\d+)?$/.test(price) && Number.isFinite(Number(price)) && Number(price) > 0;
}

/** Exact decimal rendering: never round a small quote down to zero. */
export function formatPrice(price: string): string {
  if (!validPrice(price)) return '--';
  const [integer, fraction = ''] = price.split('.');
  const digits = fraction.replace(/0+$/, '');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (digits ? `.${digits}` : '');
}

export function formatBadgePrice(price: string): string {
  if (!validPrice(price)) return '--';
  const n = Number(price);
  if (n < 0.001) {
    const notation = n.toExponential(0).replace('e+', 'e');
    return notation.length <= 4 ? notation : 'TINY';
  }
  if (n < 1) return n.toFixed(3).replace(/^0/, '').replace(/0+$/, '').replace(/\.$/, '');
  const units = ['', 'k', 'M', 'B', 'T'];
  for (let unit = 0; unit < units.length; unit++) {
    const scaled = n / 1000 ** unit;
    if (scaled >= 1000) continue;
    const budget = 4 - units[unit].length;
    for (let decimals = 2; decimals >= 0; decimals--) {
      const value = scaled.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      if (value.length <= budget && Number(value) < 1000) return value + units[unit];
    }
  }
  return 'HUGE';
}

export function formatChange(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return '--';
  return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
}

export function formatBadgeChange(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return '--';
  if (Math.abs(change) >= 100) return change >= 0 ? '+99+' : '-99+';
  const signed = `${change > 0 ? '+' : ''}${change.toFixed(1)}`;
  return signed.length <= 4 ? signed : `${change > 0 ? '+' : ''}${Math.round(change)}`;
}

export function isStale(quote: Quote | undefined, now = Date.now()): boolean {
  return !quote || now - quote.receivedAt > STALE_AFTER_MS || quote.receivedAt > now + 5000;
}
