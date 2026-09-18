export interface MarketSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

export interface Quote extends MarketSymbol {
  price: string;
  changePercent: number | null;
  receivedAt: number;
  eventTime: number | null;
  source: 'rest' | 'stream';
}

export interface Settings {
  version: 1;
  watchlist: MarketSymbol[];
  badgeSymbol: string;
  badgeMode: 'price' | 'change';
  rotationSeconds: 0 | 5 | 10 | 15;
  theme: 'light' | 'dark' | 'system';
  colorScheme: 'green-up' | 'red-up';
}

export interface Snapshot {
  settings: Settings;
  quotes: Record<string, Quote>;
  connection: {
    status: 'connecting' | 'live' | 'degraded' | 'offline';
    message: string;
    lastMessageAt: number | null;
  };
}

export type Request =
  | { type: 'GET_STATE' }
  | { type: 'GET_SYMBOLS' }
  | { type: 'GET_QUOTE'; symbol: MarketSymbol }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Omit<Settings, 'version'>> }
  | { type: 'REFRESH' };

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };
export interface PopupBridge {
  getState(): Promise<Snapshot>;
  getSymbols(): Promise<MarketSymbol[]>;
  getQuote(symbol: MarketSymbol): Promise<Quote>;
  updateSettings(patch: Partial<Omit<Settings, 'version'>>): Promise<Snapshot>;
  refresh(): Promise<Snapshot>;
  subscribe(listener: (state: Snapshot) => void): () => void;
  isPreview: boolean;
}
