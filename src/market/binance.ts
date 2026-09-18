import type { MarketSymbol, Quote } from '../shared/types';
import { isMarketSymbol, isRecord } from '../shared/settings';
import { validPrice } from '../shared/format';

export interface ClientOptions { fetch?: typeof globalThis.fetch; now?: () => number; catalog?: {symbols:MarketSymbol[];updatedAt:number}; onCatalog?: (symbols:MarketSymbol[], updatedAt:number)=>void; }
export class MarketError extends Error {
  constructor(message: string, public status = 0, public code?: number) { super(message); }
}

export function parseChange(value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseStreamQuote(value: unknown, pair: MarketSymbol, now: number): Quote | null {
  if (!isRecord(value) || value.e !== '24hrTicker' || value.s !== pair.symbol || !validPrice(value.c)) return null;
  if (typeof value.E !== 'number' || !Number.isFinite(value.E) || value.E < 0 || value.E > now + 60_000) return null;
  return {...pair,price:value.c,changePercent:parseChange(value.P),receivedAt:now,eventTime:value.E,source:'stream'};
}

export class BinanceClient {
  private fetcher: typeof globalThis.fetch;
  private now: () => number;
  private catalog?: ClientOptions['catalog'];
  private onCatalog?: ClientOptions['onCatalog'];
  private cooldownUntil = 0;
  private requests = new Map<string, Promise<unknown>>();
  constructor(options: ClientOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.catalog = options.catalog;
    this.onCatalog = options.onCatalog;
  }

  private async request(path: string): Promise<unknown> {
    if (this.now() < this.cooldownUntil) throw new MarketError(`行情接口限流，${Math.ceil((this.cooldownUntil-this.now())/1000)} 秒后重试`,429);
    const pending = this.requests.get(path);
    if (pending) return pending;
    const operation = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(),8000);
      try {
        const response = await this.fetcher(`https://data-api.binance.vision${path}`, {signal:controller.signal,credentials:'omit',cache:'no-store'});
        if (response.status === 429 || response.status === 418) {
          const retry = response.headers.get('Retry-After');
          const seconds = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) : retry ? (Date.parse(retry)-this.now())/1000 : 60;
          this.cooldownUntil = this.now() + Math.max(1000, (Number.isFinite(seconds) ? seconds : 60)*1000);
          throw new MarketError('行情接口限流，稍后自动重试',response.status);
        }
        const body: unknown = await response.json();
        if (!response.ok) throw new MarketError(`行情服务暂不可用（HTTP ${response.status}）`,response.status,isRecord(body) && typeof body.code==='number' ? body.code : undefined);
        return body;
      } catch (error) {
        if (controller.signal.aborted) throw new MarketError('行情请求超时，请检查网络');
        if (error instanceof MarketError) throw error;
        throw new MarketError('无法连接币安行情，请检查网络');
      } finally { clearTimeout(timeout); }
    })();
    this.requests.set(path, operation);
    try { return await operation; } finally { this.requests.delete(path); }
  }

  async getSymbols(force = false): Promise<MarketSymbol[]> {
    if (!force && this.catalog?.symbols.length && this.now()-this.catalog.updatedAt < 86_400_000) return this.catalog.symbols;
    const data = await this.request('/api/v3/exchangeInfo?permissions=SPOT');
    if (!isRecord(data) || !Array.isArray(data.symbols)) throw new MarketError('币安交易对目录格式无效');
    const symbols = data.symbols.filter(item=>isRecord(item) && item.status==='TRADING' && item.isSpotTradingAllowed!==false && isMarketSymbol(item))
      .map(({symbol,baseAsset,quoteAsset}:MarketSymbol)=>({symbol,baseAsset,quoteAsset})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
    if (!symbols.length) throw new MarketError('币安未返回可用现货交易对');
    this.catalog={symbols,updatedAt:this.now()};
    this.onCatalog?.(symbols,this.catalog.updatedAt);
    return symbols;
  }

  async getQuotes(symbols: MarketSymbol[]): Promise<Quote[]> {
    if (!symbols.length) return [];
    if (symbols.length > 20 || !symbols.every(isMarketSymbol)) throw new MarketError('一次最多查询 20 个有效交易对');
    const ids = [...new Set(symbols.map(pair=>pair.symbol))].sort();
    let data: unknown;
    try {
      data = await this.request(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(ids))}`);
    } catch(error) {
      if (!(error instanceof MarketError) || error.code !== -1121) throw error;
      const catalog = await this.getSymbols(true);
      const valid = symbols.filter(pair=>catalog.some(entry=>entry.symbol===pair.symbol));
      if (!valid.length || valid.length===symbols.length) throw new MarketError('所选交易对已停止交易或不可用');
      return this.getQuotes(valid);
    }
    if (!Array.isArray(data)) throw new MarketError('币安行情返回格式无效');
    const receivedAt = this.now();
    const quotes: Quote[] = [];
    for (const item of data) {
      if (!isRecord(item) || !validPrice(item.lastPrice)) continue;
      const pair=symbols.find(pair=>pair.symbol===item.symbol);
      if (!pair) continue;
      quotes.push({...pair,price:item.lastPrice,changePercent:parseChange(item.priceChangePercent),receivedAt,eventTime:typeof item.closeTime==='number' && Number.isFinite(item.closeTime) ? item.closeTime : null,source:'rest'});
    }
    if (!quotes.length) throw new MarketError('币安未返回有效行情，保留上次报价');
    return quotes;
  }
}
