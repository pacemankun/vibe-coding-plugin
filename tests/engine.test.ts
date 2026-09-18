import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketEngine, type SocketLike } from '../src/market/engine';
import { createDefaultSettings } from '../src/shared/settings';
import type { Quote } from '../src/shared/types';
const btc={symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT'};
const eth={symbol:'ETHBTC',baseAsset:'ETH',quoteAsset:'BTC'};
const future={...btc,market:'usdm' as const};
const quote=(price='60000',receivedAt=1000):Quote=>({...btc,price,receivedAt,eventTime:receivedAt,changePercent:1,source:'rest'});
class Socket implements SocketLike {
  readyState=0; onopen:(()=>void)|null=null; onclose:(()=>void)|null=null; onerror:(()=>void)|null=null; onmessage:((event:{data:unknown})=>void)|null=null;
  sent:string[]=[];
  open(){this.readyState=1;this.onopen?.();}
  send(data:string){this.sent.push(data);}
  close(){this.readyState=3;this.onclose?.();}
  ticker(symbol='BTCUSDT',price='62000',time=Date.now()){this.onmessage?.({data:JSON.stringify({e:'24hrTicker',s:symbol,c:price,P:'2',E:time})});}
}
const active:MarketEngine[]=[];
function setup(getQuotes:()=>Promise<Quote[]> = async()=>[quote()]) {
  const sockets:Socket[]=[];
  const engine=new MarketEngine({settings:{...createDefaultSettings(),watchlist:[btc]},client:{getQuotes},createSocket:()=>{const s=new Socket();sockets.push(s);return s;},random:()=>0});
  active.push(engine);return {engine,sockets};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(1000);});
afterEach(()=>{active.splice(0).forEach(engine=>engine.stop());vi.useRealTimers();});
describe('market lifecycle regression coverage',()=>{
  it('preserves the last valid price/time on failures without reporting a live connection',async()=>{
    let fail=false;
    const {engine}=setup(async()=>{if(fail)throw new Error('offline');return [quote()];});
    await engine.start();fail=true;
    await expect(engine.refresh()).rejects.toThrow('offline');
    expect(engine.getSnapshot().quotes.BTCUSDT).toMatchObject({price:'60000',receivedAt:1000});
    expect(engine.getSnapshot().connection.status).not.toBe('live');
  });
  it('only reports live after a valid ticker, not merely socket open',async()=>{
    const {engine,sockets}=setup();await engine.start();
    expect(sockets.length).toBe(1);
    sockets[0]?.open();expect(engine.getSnapshot().connection.status).not.toBe('live');
    sockets[0]?.ticker();expect(engine.getSnapshot().connection.status).toBe('live');
    expect(engine.getSnapshot().quotes.BTCUSDT.price).toBe('62000');
  });
  it('does not let an older REST snapshot overwrite a newer stream price',async()=>{
    let resolve!:(quotes:Quote[])=>void;
    const {engine,sockets}=setup(()=>new Promise(done=>{resolve=done;}));
    const starting=engine.start();
    sockets[0]?.open();vi.setSystemTime(2000);sockets[0]?.ticker('BTCUSDT','62000',2000);
    resolve?.([quote('59000',1000)]);await starting;
    expect(engine.getSnapshot().quotes.BTCUSDT?.price).toBe('62000');
  });
  it('sends a legal Binance heartbeat and reconnects after an unexpected close',async()=>{
    const {engine,sockets}=setup();await engine.start();sockets[0]?.open();sockets[0]?.ticker();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sockets[0]?.sent.map(text=>JSON.parse(text))).toContainEqual(expect.objectContaining({method:'LIST_SUBSCRIPTIONS'}));
    sockets[0]?.close();await vi.advanceTimersByTimeAsync(2000);
    expect(sockets.length).toBeGreaterThanOrEqual(2);
  });
  it('isolates callbacks from superseded sockets and subscriptions',async()=>{
    const {engine,sockets}=setup();await engine.start();const old=sockets[0];old?.open();
    engine.setSettings({...createDefaultSettings(),watchlist:[eth],badgeSymbol:'ETHBTC'});
    old?.ticker('BTCUSDT','999999');
    expect(engine.getSnapshot().quotes.BTCUSDT?.price).not.toBe('999999');
    expect(sockets.length).toBe(2);
  });
  it('reconnects immediately on serverShutdown and emits updated state to subscribers',async()=>{
    const {engine,sockets}=setup();const states:string[]=[];engine.subscribe(state=>states.push(state.connection.status));
    await engine.start();sockets[0]?.open();sockets[0]?.ticker();
    sockets[0]?.onmessage?.({data:JSON.stringify({e:'serverShutdown'})});
    expect(sockets.length).toBe(2);
    expect(states).toContain('live');
  });
  it('keeps same-symbol spot and futures quotes isolated on independent sockets',async()=>{
    const sockets:{url:string;socket:Socket}[]=[];
    const engine=new MarketEngine({settings:{...createDefaultSettings(),watchlist:[btc,future]},client:{getQuotes:async pairs=>pairs.map(pair=>({...pair,price:pair.market==='usdm'?'70000':'60000',receivedAt:1000,eventTime:1000,changePercent:1,source:'rest' as const}))},createSocket:url=>{const socket=new Socket();sockets.push({url,socket});return socket;},random:()=>0});
    active.push(engine);await engine.start();
    expect(sockets.map(item=>item.url)).toEqual(expect.arrayContaining([
      expect.stringContaining('data-stream.binance.vision'),
      expect.stringContaining('fstream.binance.com/market/stream?streams=btcusdt@ticker'),
    ]));
    expect(engine.getSnapshot().quotes.BTCUSDT.price).toBe('60000');
    expect(engine.getSnapshot().quotes['usdm:BTCUSDT'].price).toBe('70000');
    sockets.find(item=>item.url.includes('fstream'))?.socket.open();
    sockets.find(item=>item.url.includes('fstream'))?.socket.ticker('BTCUSDT','71000',1000);
    expect(engine.getSnapshot().quotes.BTCUSDT.price).toBe('60000');
    expect(engine.getSnapshot().quotes['usdm:BTCUSDT'].price).toBe('71000');
  });
  it('preserves one market when the other fails and cleans up removed subscriptions',async()=>{
    const sockets:{url:string;socket:Socket}[]=[];
    const engine=new MarketEngine({settings:{...createDefaultSettings(),watchlist:[btc,future]},client:{getQuotes:async pairs=>{
      if(pairs[0]?.market==='usdm')throw Error('futures unavailable');
      return [quote()];
    }},createSocket:url=>{const socket=new Socket();sockets.push({url,socket});return socket;},random:()=>0});
    active.push(engine);await engine.start();
    const spot=sockets.find(item=>item.url.includes('data-stream'))!.socket;
    spot.open();spot.ticker('BTCUSDT','61000',1000);
    expect(engine.getSnapshot().connections?.spot?.status).toBe('live');
    expect(engine.getSnapshot().connections?.usdm?.status).not.toBe('live');
    engine.setSettings({...createDefaultSettings(),watchlist:[btc]});
    expect(sockets.find(item=>item.url.includes('fstream'))?.socket.readyState).toBe(3);
    expect(sockets.filter(item=>item.url.includes('data-stream'))).toHaveLength(1);
    expect(engine.getSnapshot().quotes['usdm:BTCUSDT']).toBeUndefined();
    engine.stop();expect(spot.readyState).toBe(3);
  });
  it('publishes a successful spot refresh while futures is still pending',async()=>{
    let resolveFutures!:(quotes:Quote[])=>void;
    const futures=new Promise<Quote[]>(resolve=>{resolveFutures=resolve;});
    const engine=new MarketEngine({settings:{...createDefaultSettings(),watchlist:[btc,future]},client:{getQuotes:async pairs=>pairs[0]?.market==='usdm'?futures:[quote()]}});
    active.push(engine);
    const published=vi.fn();engine.subscribe(published);
    let finished=false;
    const refreshing=engine.refresh().then(()=>{finished=true;});
    await vi.waitFor(()=>expect(engine.getSnapshot().quotes.BTCUSDT?.price).toBe('60000'));
    expect(finished).toBe(false);
    expect(published).toHaveBeenCalledWith(expect.objectContaining({quotes:expect.objectContaining({BTCUSDT:expect.objectContaining({price:'60000'})})}));
    expect(engine.getSnapshot().quotes['usdm:BTCUSDT']).toBeUndefined();
    resolveFutures([{...quote('70000'),market:'usdm'}]);await refreshing;
    expect(engine.getSnapshot().quotes['usdm:BTCUSDT']?.price).toBe('70000');
  });
  it('ignores pending market results after settings change',async()=>{
    let resolveFutures!:(quotes:Quote[])=>void;
    const futures=new Promise<Quote[]>(resolve=>{resolveFutures=resolve;});
    const engine=new MarketEngine({settings:{...createDefaultSettings(),watchlist:[btc,future]},client:{getQuotes:async pairs=>pairs[0]?.market==='usdm'?futures:[quote()]}});
    active.push(engine);
    const refreshing=engine.refresh();
    await vi.waitFor(()=>expect(engine.getSnapshot().quotes.BTCUSDT?.price).toBe('60000'));
    engine.setSettings({...createDefaultSettings(),watchlist:[future]});
    const published=vi.fn();engine.subscribe(published);
    resolveFutures([{...quote('70000'),market:'usdm'}]);await refreshing;
    expect(engine.getSnapshot().quotes['usdm:BTCUSDT']).toBeUndefined();
    expect(published).not.toHaveBeenCalled();
  });
});
