import { describe, expect, it } from 'vitest';
import { createBadge, getBadgePair } from '../src/background/badge';
import { ensureAlarm, HEALTH_ALARM } from '../src/background/alarm';
import { createDefaultSettings } from '../src/shared/settings';
import type { Snapshot } from '../src/shared/types';
describe('toolbar and worker recovery',()=>{
  it('uses the perpetual quote and its own connection when spot is offline',()=>{
    const spot=createDefaultSettings().watchlist[0];
    const future={...spot,market:'usdm' as const};
    const settings={...createDefaultSettings(),watchlist:[spot,future],badgeSymbol:'usdm:BTCUSDT'};
    const state:Snapshot={settings,quotes:{BTCUSDT:{...spot,price:'60000',changePercent:-1,receivedAt:5000,eventTime:5000,source:'rest'},'usdm:BTCUSDT':{...future,price:'61000',changePercent:2,receivedAt:5000,eventTime:5000,source:'stream'}},connection:{status:'degraded',message:'现货离线',lastMessageAt:5000},connections:{spot:{status:'offline',message:'断网',lastMessageAt:null},usdm:{status:'live',message:'实时',lastMessageAt:5000}}};
    const badge=createBadge(state,5000);
    expect(badge.text).toBe('061k');
    expect(badge.title).toContain('USDT 永续');
    expect(badge.title).toContain('最新成交价');
    expect(badge.color).toBe('#fbe4e6');
  });
  it('uses the actual rotated pair and its quote currency in the tooltip',()=>{
    const settings={...createDefaultSettings(),badgeSymbol:'BTCUSDT',rotationSeconds:5 as const};
    const pair=getBadgePair(settings,5000)!;
    expect(pair.symbol).toBe('ETHUSDT');
    const state:Snapshot={settings,quotes:{ETHUSDT:{...pair,price:'2500.120000',changePercent:1,receivedAt:5000,eventTime:5000,source:'stream'}},connection:{status:'live',message:'实时',lastMessageAt:5000}};
    const badge=createBadge(state,5000);
    expect(badge.title).toContain('ETH/USDT');
    expect(badge.title).toContain('2,500.12 USDT');
    expect(badge.text.length).toBeLessThanOrEqual(4);
  });
  it('keeps stale price visible but explicitly marks it as cached',()=>{
    const settings={...createDefaultSettings(),badgeSymbol:'BTCUSDT'};
    const pair=settings.watchlist[0];
    const state:Snapshot={settings,quotes:{BTCUSDT:{...pair,price:'60000',changePercent:2,receivedAt:1000,eventTime:1000,source:'rest'}},connection:{status:'offline',message:'断网',lastMessageAt:null}};
    const badge=createBadge(state,100000);
    expect(badge.text).toBe('060k');
    expect(badge.title).toMatch(/缓存|过期/);
    expect(badge.color).toBe('#fbe4e6');
  });
  it('keeps the toolbar palette identical for gains and losses',()=>{
    const settings={...createDefaultSettings(),badgeSymbol:'BTCUSDT'};
    const pair=settings.watchlist[0];
    for(const changePercent of [-3,0,3,null]){
      const state:Snapshot={settings,quotes:{BTCUSDT:{...pair,price:'0.6073',changePercent,receivedAt:1000,eventTime:1000,source:'stream'}},connection:{status:'live',message:'实时',lastMessageAt:1000}};
      expect(createBadge(state,1000).color).toBe('#fbe4e6');
    }
  });
  it('restores a missing alarm without resetting an existing scheduled alarm',async()=>{
    let scheduled:{name:string;periodInMinutes:number;scheduledTime:number}|undefined;
    const readScheduled=()=>scheduled;
    let now=0;
    const alarms={get:async()=>scheduled,create:async(name:string,info:{periodInMinutes:number})=>{scheduled={name,periodInMinutes:info.periodInMinutes,scheduledTime:now+30000};}} as unknown as Pick<typeof chrome.alarms,'get'|'create'>;
    await ensureAlarm(alarms);
    expect(scheduled).toMatchObject({name:HEALTH_ALARM,periodInMinutes:0.5});
    now=10000;await ensureAlarm(alarms);
    expect(scheduled?.scheduledTime).toBe(30000);
    scheduled=undefined;await ensureAlarm(alarms);
    expect(readScheduled()?.scheduledTime).toBe(40000);
  });
  it('clears Chrome badge text when nothing is pinned even with cached quotes or rotation',()=>{
    const settings={...createDefaultSettings(),badgeSymbol:null,rotationSeconds:5 as const};
    const pair=settings.watchlist[0];
    const state:Snapshot={settings,quotes:{BTCUSDT:{...pair,price:'60000',changePercent:2,receivedAt:1000,eventTime:1000,source:'rest'}},connection:{status:'offline',message:'断网',lastMessageAt:null}};
    expect(getBadgePair(settings,5000)).toBeUndefined();
    expect(createBadge(state,5000).text).toBe('');
    expect(createBadge(state,5000).title).toContain('未固定');
  });
});
