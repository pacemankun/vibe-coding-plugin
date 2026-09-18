import { afterEach, describe, expect, it, vi } from 'vitest';
import { BinanceClient, parseStreamQuote } from '../src/market/binance';
const btc = {symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT'};
const eth = {symbol:'ETHBTC',baseAsset:'ETH',quoteAsset:'BTC'};
const ticker = {symbol:'BTCUSDT',lastPrice:'76448.09000000',priceChangePercent:'0.742',closeTime:1000};
const future = {...btc,market:'usdm' as const};
afterEach(()=>vi.useRealTimers());
describe('Binance public market client', () => {
  it('rejects coin-margined events on the USDT perpetual channel',()=>{
    const event={e:'24hrTicker',s:'BTCUSDT',c:'60000',P:'1',E:1000,st:2};
    expect(parseStreamQuote(event,future,1000)).toBeNull();
    expect(parseStreamQuote({...event,st:1},future,1000)?.market).toBe('usdm');
  });
  it('limits futures requests across simultaneous callers to four active requests',async()=>{
    let active=0;let peak=0;
    const client=new BinanceClient({fetch:async input=>{
      active++;peak=Math.max(peak,active);
      await new Promise(resolve=>setTimeout(resolve,5));
      active--;
      return Response.json({...ticker,symbol:new URL(String(input)).searchParams.get('symbol')});
    }});
    const pairs=Array.from({length:8},(_,i)=>({symbol:`COIN${i}USDT`,baseAsset:`COIN${i}`,quoteAsset:'USDT',market:'usdm' as const}));
    await Promise.all([client.getQuotes(pairs.slice(0,4)),client.getQuotes(pairs.slice(4))]);
    expect(peak).toBeLessThanOrEqual(4);
  });
  it('batches selected pairs and keeps source quote units and decimal strings', async () => {
    let request = '';
    const client = new BinanceClient({fetch:async input => {request=String(input);return Response.json([ticker,{symbol:'ETHBTC',lastPrice:'0.02500120',priceChangePercent:'-1.52',closeTime:999}]);},now:()=>2000});
    const quotes = await client.getQuotes([btc,eth]);
    expect(JSON.parse(new URL(request).searchParams.get('symbols')!)).toEqual(['BTCUSDT','ETHBTC']);
    expect(quotes[1]).toMatchObject({price:'0.02500120',quoteAsset:'BTC',changePercent:-1.52,receivedAt:2000});
  });
  it('rejects empty/invalid prices rather than returning fake success', async () => {
    const client = new BinanceClient({fetch:async()=>Response.json([{...ticker,lastPrice:'NaN'}])});
    await expect(client.getQuotes([btc])).rejects.toThrow();
  });
  it('missing change remains unavailable rather than becoming zero', async () => {
    const client = new BinanceClient({fetch:async()=>Response.json([{...ticker,priceChangePercent:undefined}])});
    expect((await client.getQuotes([btc]))[0].changePercent).toBeNull();
  });
  it('honors rate limit cooldown before issuing another request', async () => {
    let calls=0;
    let now=1000;
    const client=new BinanceClient({now:()=>now,fetch:async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'60'}});}});
    await expect(client.getQuotes([btc])).rejects.toThrow(/限流/);
    await expect(client.getQuotes([btc])).rejects.toThrow(/限流/);
    expect(calls).toBe(1);
    now=62000;
    await expect(client.getQuotes([btc])).rejects.toThrow();
    expect(calls).toBe(2);
  });
  it('times out a hanging request and aborts its network I/O', async () => {
    vi.useFakeTimers();
    let aborted=false;
    const client=new BinanceClient({fetch:async(_input,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));}))});
    const outcome=client.getQuotes([btc]).then(()=>null,error=>error as Error);
    await vi.advanceTimersByTimeAsync(8001);
    expect((await outcome)?.message).toMatch(/超时/);
    expect(aborted).toBe(true);
  });
  it('catalog excludes halted and non-spot markets and reuses valid cached data', async () => {
    let calls=0;
    const client=new BinanceClient({fetch:async()=>{calls++;return Response.json({symbols:[{...btc,status:'TRADING',isSpotTradingAllowed:true},{...eth,status:'BREAK'}, {symbol:'SOLUSDT',baseAsset:'SOL',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:false}]});}});
    expect(await client.getSymbols()).toEqual([btc]);
    expect(await client.getSymbols()).toEqual([btc]);
    expect(calls).toBe(1);
  });
  it('keeps independent spot and USDT perpetual catalogs and filters futures rules', async () => {
    const calls:string[]=[]; const published:string[]=[];
    const client=new BinanceClient({fetch:async input=>{
      calls.push(String(input));
      if(String(input).includes('fapi')) return Response.json({symbols:[
        {...btc,status:'TRADING',contractType:'PERPETUAL',marginAsset:'USDT'},
        {...btc,symbol:'BTCUSD',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USD',marginAsset:'USDT'},
        {...btc,symbol:'BTCUSDT_260925',status:'TRADING',contractType:'CURRENT_QUARTER',marginAsset:'USDT'},
        {...btc,symbol:'ETHUSDT',status:'BREAK',contractType:'PERPETUAL',marginAsset:'USDT'},
      ]});
      return Response.json({symbols:[{...btc,status:'TRADING',isSpotTradingAllowed:true}]});
    },onCatalog:(_symbols,_at,market)=>published.push(market??'spot')});
    expect(await client.getSymbols(false,'usdm')).toEqual([future]);
    expect(await client.getSymbols()).toEqual([btc]);
    expect(await client.getSymbols(false,'usdm')).toEqual([future]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('https://fapi.binance.com/fapi/v1/exchangeInfo');
    expect(published).toEqual(['usdm','spot']);
  });
  it('queries futures tickers by a single symbol and retains successful quotes',async()=>{
    const calls:string[]=[];
    const client=new BinanceClient({fetch:async input=>{
      calls.push(String(input));
      if(String(input).includes('ETHUSDT')) return new Response('{}',{status:503});
      return Response.json(ticker);
    },now:()=>2000});
    const quotes=await client.getQuotes([future,{...eth,symbol:'ETHUSDT',quoteAsset:'USDT',market:'usdm'}]);
    expect(quotes).toMatchObject([{market:'usdm',symbol:'BTCUSDT',price:ticker.lastPrice}]);
    expect(calls).toHaveLength(2);
    expect(calls.every(url=>new URL(url).searchParams.has('symbol') && !new URL(url).searchParams.has('symbols'))).toBe(true);
  });
  it('does not let one market rate limit block the other market',async()=>{
    const calls:string[]=[];
    const client=new BinanceClient({fetch:async input=>{
      calls.push(String(input));
      return String(input).includes('fapi') ? new Response('{}',{status:429,headers:{'Retry-After':'60'}}) : Response.json([ticker]);
    },now:()=>1000});
    expect(await client.getQuotes([btc,future])).toMatchObject([{symbol:'BTCUSDT',price:ticker.lastPrice}]);
    expect(await client.getQuotes([btc])).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });
});
