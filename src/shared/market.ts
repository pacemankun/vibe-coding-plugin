import type { MarketSymbol, MarketType, Snapshot } from './types';

export function marketOf(pair: MarketSymbol): MarketType { return pair.market ?? 'spot'; }
export function pairKey(pair: MarketSymbol): string {
  return marketOf(pair) === 'usdm' ? `usdm:${pair.symbol}` : pair.symbol;
}
export function marketLabel(pair: MarketSymbol): string { return marketOf(pair) === 'usdm' ? 'USDT 永续' : '现货'; }
export function connectionFor(snapshot: Snapshot, pair: MarketSymbol): Snapshot['connection'] {
  return snapshot.connections?.[marketOf(pair)] ?? snapshot.connection;
}
