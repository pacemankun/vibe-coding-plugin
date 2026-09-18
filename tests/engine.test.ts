import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketEngine, type SocketLike } from '../src/market/engine';
import { createDefaultSettings } from '../src/shared/settings';
import type { Quote } from '../src/shared/types';
const btc={symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT'};
const eth={symbol:'ETHBTC',baseAsset:'ETH',quoteAsset:'BTC'};
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
});
