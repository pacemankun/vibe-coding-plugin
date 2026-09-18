import { applySettingsPatch, createDefaultSettings } from '../shared/settings';
import { marketOf, pairKey } from '../shared/market';
import type { MarketSymbol, PopupBridge, Quote, Snapshot } from '../shared/types';

const symbols: MarketSymbol[] = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT' },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT' },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT' },
  { symbol: 'TRXUSDT', baseAsset: 'TRX', quoteAsset: 'USDT' },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT' },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT' },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', quoteAsset: 'USDT' },
  { symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC' },
  { symbol: 'SOLBTC', baseAsset: 'SOL', quoteAsset: 'BTC' },
  { symbol: 'BTWUSDT', baseAsset: 'BTW', quoteAsset: 'USDT', market: 'usdm' },
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', market: 'usdm' },
];
const sample: Record<string, [string, number]> = {
  BTCUSDT: ['67482.36000000', 2.41], ETHUSDT: ['3521.800000', 1.82], SOLUSDT: ['178.3200', -0.73],
  BNBUSDT: ['612.5500', 0.84], XRPUSDT: ['0.61850000', 3.16], DOGEUSDT: ['0.15480000', -1.20],
  TRXUSDT: ['0.12450000', 0.36], ADAUSDT: ['0.47210000', -0.85], AVAXUSDT: ['37.8400', 1.14],
  LINKUSDT: ['18.2600', 2.64], ETHBTC: ['0.05219000', -0.31], SOLBTC: ['0.00264300', 1.05],
  'usdm:BTWUSDT': ['0.7050000', -3.903], 'usdm:BTCUSDT': ['67500.120000', 2.5],
};
function makeQuote(symbol: MarketSymbol): Quote {
  const [price, changePercent] = sample[pairKey(symbol)] ?? ['1.0000', 0];
  return { ...symbol, price, changePercent, receivedAt: Date.now(), eventTime: Date.now(), source: 'stream' };
}
let state: Snapshot = {
  settings: createDefaultSettings(),
  quotes: Object.fromEntries(symbols.map(symbol => [pairKey(symbol), makeQuote(symbol)])),
  connection: { status: 'live', message: '示例数据', lastMessageAt: Date.now() },
};
const listeners = new Set<(state: Snapshot) => void>();
function publish() { listeners.forEach(listener => listener(state)); }

export const previewBridge: PopupBridge = {
  isPreview: true,
  getState: async () => state,
  getSymbols: async (market = 'spot') => symbols.filter(pair => marketOf(pair) === market),
  getQuote: async symbol => makeQuote(symbol),
  updateSettings: async patch => {
    state = { ...state, settings: applySettingsPatch(state.settings, patch) };
    publish();
    return state;
  },
  refresh: async () => {
    state = { ...state, quotes: Object.fromEntries(symbols.map(symbol => [pairKey(symbol), makeQuote(symbol)])) };
    publish();
    return state;
  },
  subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
