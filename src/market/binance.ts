import type { MarketSymbol, MarketType, Quote } from '../shared/types';
import { isMarketSymbol, isRecord } from '../shared/settings';
import { validPrice } from '../shared/format';
import { marketOf, pairKey } from '../shared/market';

type Catalog={symbols:MarketSymbol[];updatedAt:number};
export interface ClientOptions { fetch?: typeof globalThis.fetch; now?: () => number; catalog?: Catalog; catalogs?:Partial<Record<MarketType,Catalog>>; onCatalog?: (symbols:MarketSymbol[], updatedAt:number, market?:MarketType)=>void; }
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
  if (marketOf(pair)==='usdm' && value.st!==undefined && value.st!==1) return null;
  if (typeof value.E !== 'number' || !Number.isFinite(value.E) || value.E < 0 || value.E > now + 60_000) return null;
  return {...pair,price:value.c,changePercent:parseChange(value.P),receivedAt:now,eventTime:value.E,source:'stream'};
}

export class BinanceClient {
  private fetcher: typeof globalThis.fetch;
  private now: () => number;
  private catalogs:Partial<Record<MarketType,Catalog>>;
  private onCatalog?: ClientOptions['onCatalog'];
  private cooldownUntil:Record<MarketType,number> = {spot:0,usdm:0};
  private requests = new Map<string, Promise<unknown>>();
  private futuresActive=0;
  private futuresQueue:Array<()=>void>=[];
  constructor(options: ClientOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.catalogs={...options.catalogs,spot:options.catalog??options.catalogs?.spot};
    this.onCatalog = options.onCatalog;
  }

  private async acquireFutureSlot():Promise<()=>void> {
    if(this.futuresActive<4)this.futuresActive++;
    else await new Promise<void>(resolve=>this.futuresQueue.push(resolve));
    return ()=>{const next=this.futuresQueue.shift();if(next)next();else this.futuresActive--;};
  }

  private async request(path: string, market:MarketType): Promise<unknown> {
    if (this.now() < this.cooldownUntil[market]) throw new MarketError(`行情接口限流，${Math.ceil((this.cooldownUntil[market]-this.now())/1000)} 秒后重试`,429);
    const url=`${market==='usdm'?'https://fapi.binance.com':'https://data-api.binance.vision'}${path}`;
    const pending = this.requests.get(url);
    if (pending) return pending;
    const operation = (async () => {
      const release=market==='usdm'?await this.acquireFutureSlot():()=>{};
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(),8000);
      try {
        if(this.now()<this.cooldownUntil[market])throw new MarketError('行情接口限流，稍后自动重试',429);
        const response = await this.fetcher(url, {signal:controller.signal,credentials:'omit',cache:'no-store'});
        if (response.status === 429 || response.status === 418) {
          const retry = response.headers.get('Retry-After');
          const seconds = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) : retry ? (Date.parse(retry)-this.now())/1000 : 60;
          this.cooldownUntil[market] = this.now() + Math.max(1000, (Number.isFinite(seconds) ? seconds : 60)*1000);
          throw new MarketError('行情接口限流，稍后自动重试',response.status);
        }
        const body: unknown = await response.json();
        if (!response.ok) throw new MarketError(`行情服务暂不可用（HTTP ${response.status}）`,response.status,isRecord(body) && typeof body.code==='number' ? body.code : undefined);
        return body;
      } catch (error) {
        if (controller.signal.aborted) throw new MarketError('行情请求超时，请检查网络');
        if (error instanceof MarketError) throw error;
        throw new MarketError('无法连接币安行情，请检查网络');
      } finally { clearTimeout(timeout);release(); }
    })();
    this.requests.set(url, operation);
    try { return await operation; } finally { this.requests.delete(url); }
  }

  async getSymbols(force = false, market:MarketType='spot'): Promise<MarketSymbol[]> {
    const cached=this.catalogs[market];
    if (!force && cached?.symbols.length && this.now()-cached.updatedAt < 86_400_000) return cached.symbols;
    const data = await this.request(market==='usdm'?'/fapi/v1/exchangeInfo':'/api/v3/exchangeInfo?permissions=SPOT',market);
    if (!isRecord(data) || !Array.isArray(data.symbols)) throw new MarketError('币安交易对目录格式无效');
    const symbols = data.symbols.filter(item=>isRecord(item) && item.status==='TRADING' && isMarketSymbol(item) &&
      (market==='usdm' ? item.contractType==='PERPETUAL' && item.quoteAsset==='USDT' && item.marginAsset==='USDT' : item.isSpotTradingAllowed!==false))
      .map(({symbol,baseAsset,quoteAsset}:MarketSymbol)=>market==='usdm'?{symbol,baseAsset,quoteAsset,market}:{symbol,baseAsset,quoteAsset}).sort((a,b)=>a.symbol.localeCompare(b.symbol));
    if (!symbols.length) throw new MarketError(market==='usdm'?'币安未返回可用 USDT 永续合约':'币安未返回可用现货交易对');
    this.catalogs[market]={symbols,updatedAt:this.now()};
    this.onCatalog?.(symbols,this.catalogs[market].updatedAt,market);
    return symbols;
  }

  async getQuotes(symbols: MarketSymbol[]): Promise<Quote[]> {
    if (!symbols.length) return [];
    if (symbols.length > 20 || !symbols.every(isMarketSymbol)) throw new MarketError('一次最多查询 20 个有效交易对');
    const spot=symbols.filter(pair=>marketOf(pair)==='spot');
    const futures=[...new Map(symbols.filter(pair=>marketOf(pair)==='usdm').map(pair=>[pairKey(pair),pair])).values()];
    const outcomes=await Promise.allSettled([
      spot.length ? this.getSpotQuotes(spot) : Promise.resolve([]),
      this.getFuturesQuotes(futures),
    ]);
    const quotes=outcomes.flatMap(result=>result.status==='fulfilled'?result.value:[]);
    if(quotes.length)return quotes;
    const failure=outcomes.find(result=>result.status==='rejected');
    if(failure?.status==='rejected')throw failure.reason;
    throw new MarketError('币安未返回有效行情，保留上次报价');
  }

  private async getSpotQuotes(symbols:MarketSymbol[]):Promise<Quote[]> {
    const ids = [...new Set(symbols.map(pair=>pair.symbol))].sort();
    let data: unknown;
    try {
      data = await this.request(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(ids))}`,'spot');
    } catch(error) {
      if (!(error instanceof MarketError) || error.code !== -1121) throw error;
      const catalog = await this.getSymbols(true,'spot');
      const valid = symbols.filter(pair=>catalog.some(entry=>entry.symbol===pair.symbol));
      if (!valid.length || valid.length===symbols.length) throw new MarketError('所选交易对已停止交易或不可用');
      return this.getSpotQuotes(valid);
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

  private async getFuturesQuotes(symbols:MarketSymbol[]):Promise<Quote[]> {
    const results:Quote[]=[];
    let next=0;let firstError:unknown;
    const worker=async()=>{
      while(next<symbols.length) {
        const pair=symbols[next++];
        try {
          const data=await this.request(`/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(pair.symbol)}`,'usdm');
          if(!isRecord(data) || data.symbol!==pair.symbol || !validPrice(data.lastPrice))continue;
          results.push({...pair,market:'usdm',price:data.lastPrice,changePercent:parseChange(data.priceChangePercent),receivedAt:this.now(),eventTime:typeof data.closeTime==='number' && Number.isFinite(data.closeTime)?data.closeTime:null,source:'rest'});
        } catch(error) {firstError??=error;}
      }
    };
    await Promise.all(Array.from({length:Math.min(4,symbols.length)},()=>worker()));
    if(!results.length && firstError)throw firstError;
    if(symbols.length && !results.length)throw new MarketError('币安未返回有效行情，保留上次报价');
    return results;
  }
}
