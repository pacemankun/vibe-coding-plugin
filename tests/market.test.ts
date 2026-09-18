import { afterEach, describe, expect, it, vi } from 'vitest';
import { BinanceClient } from '../src/market/binance';
const btc = {symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT'};
const eth = {symbol:'ETHBTC',baseAsset:'ETH',quoteAsset:'BTC'};
const ticker = {symbol:'BTCUSDT',lastPrice:'76448.09000000',priceChangePercent:'0.742',closeTime:1000};
afterEach(()=>vi.useRealTimers());
describe('Binance public market client', () => {
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
});
