// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeBridge } from '../src/popup/bridge';
import { createDefaultSettings } from '../src/shared/settings';
import type { Snapshot } from '../src/shared/types';

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('popup connection bridge',()=>{
  it('marks every market offline when the background port disconnects',()=>{
    vi.useFakeTimers();
    let onMessage!:(message:unknown)=>void;
    let onDisconnect!:()=>void;
    const port={onMessage:{addListener:(fn:typeof onMessage)=>{onMessage=fn;}},onDisconnect:{addListener:(fn:()=>void)=>{onDisconnect=fn;}},disconnect:vi.fn()};
    vi.stubGlobal('chrome',{runtime:{id:'test-extension',connect:()=>port,lastError:{message:'后台连接中断'}}});
    const received:Snapshot[]=[];
    const stop=chromeBridge.subscribe(state=>received.push(state));
    const live={status:'live' as const,message:'实时',lastMessageAt:1000};
    const state:Snapshot={settings:createDefaultSettings(),quotes:{BTCUSDT:{symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',price:'60000',receivedAt:1000,eventTime:1000,changePercent:1,source:'stream'}},connection:live,connections:{spot:live,usdm:live}};
    onMessage({type:'STATE',state});onDisconnect();
    const disconnected=received.at(-1)!;
    expect(disconnected.connection.status).toBe('offline');
    expect(disconnected.connections?.spot?.status).toBe('offline');
    expect(disconnected.connections?.usdm?.status).toBe('offline');
    expect(disconnected.connections?.usdm?.lastMessageAt).toBe(1000);
    expect(disconnected.quotes).toBe(state.quotes);
    expect(state.connections?.usdm?.status).toBe('live');
    stop();
  });
});
