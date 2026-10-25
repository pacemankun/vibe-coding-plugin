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

/** Pad decimals on the right, integers after the sign on the left: never multiply the price. */
function padBadgeNumber(value: string, width: number): string {
  if (value.length >= width) return value;
  if (value.includes('.')) return value.padEnd(width, '0');
  if (width - value.length >= 2) return `${value}.`.padEnd(width, '0');
  const sign = /^[+-]/.test(value) ? value[0] : '';
  return sign + value.slice(sign.length).padStart(width - sign.length, '0');
}

/** Round the short retained digit sequence as an integer, avoiding binary decimal ties. */
function roundBadgeDecimal(integer: string, fraction: string, decimals: number): string {
  const kept = fraction.slice(0, decimals).padEnd(decimals, '0');
  const increment = Number(fraction[decimals] ?? '0') >= 5 ? 1 : 0;
  const rounded = String(Number(integer + kept) + increment).padStart(decimals + 1, '0');
  return decimals ? `${rounded.slice(0, -decimals)}.${rounded.slice(-decimals)}` : rounded;
}

export function formatBadgePrice(price: string): string {
  if (!validPrice(price)) return '----';
  const n = Number(price);
  const [whole, fraction = ''] = price.split('.');
  const integer = whole.replace(/^0+(?=\d)/, '');
  if (integer === '0') {
    if (n < 0.001) {
      const notation = n.toExponential(0).replace('e+', 'e');
      return notation.length <= 4 ? notation : 'TINY';
    }
    const rounded = roundBadgeDecimal(integer, fraction, 3);
    return rounded === '1.000' ? '1.00' : rounded.replace(/^0/, '');
  }
  if (integer.length <= 5) {
    // Slice the decimal string so floating-point rounding cannot alter the leading digits.
    if (integer.length >= 4) return integer.slice(0, 4);
    let decimals = 3 - integer.length;
    let rounded = roundBadgeDecimal(integer, fraction, decimals);
    while (rounded.length > 4 && decimals > 0) {
      // Re-round the original price when a carry consumes another character.
      rounded = roundBadgeDecimal(integer, fraction, --decimals);
    }
    return rounded;
  }
  const units = ['', 'k', 'M', 'B', 'T'];
  for (let unit = 0; unit < units.length; unit++) {
    const scaled = n / 1000 ** unit;
    if (scaled >= 1000) continue;
    const budget = 4 - units[unit].length;
    for (let decimals = 2; decimals >= 0; decimals--) {
      const value = scaled.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      if (value.length <= budget && Number(value) < 1000) return padBadgeNumber(value, budget) + units[unit];
    }
  }
  return 'HUGE';
}

export function formatChange(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return '--';
  return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
}

export function formatBadgeChange(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return '----';
  if (Math.abs(change) >= 100) return change >= 0 ? '+99+' : '-99+';
  const signed = `${change > 0 ? '+' : ''}${change.toFixed(1)}`;
  return padBadgeNumber(signed.length <= 4 ? signed : `${change > 0 ? '+' : ''}${Math.round(change)}`, 4);
}

export function isStale(quote: Quote | undefined, now = Date.now()): boolean {
  return !quote || now - quote.receivedAt > STALE_AFTER_MS || quote.receivedAt > now + 5000;
}
