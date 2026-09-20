import { MarketEngine } from '../market/engine';
import { BinanceClient } from '../market/binance';
import { applySettingsPatch, isMarketSymbol, isRecord, normalizeSettings } from '../shared/settings';
import type { MarketSymbol, MarketType, Quote, Snapshot } from '../shared/types';
import { marketOf, pairKey } from '../shared/market';
import { ensureAlarm, HEALTH_ALARM } from './alarm';
import { createBadge } from './badge';
import { paintToolbar } from './toolbar';

interface Runtime { engine:MarketEngine; client:BinanceClient; }
let initialization:Promise<Runtime>|undefined;
const ports=new Set<chrome.runtime.Port>();
let settingsQueue:Promise<unknown>=Promise.resolve();
let paintQueue=Promise.resolve();
let cacheQueue=Promise.resolve();
let lastPaint='';
let lastPersist=0;
let lastPublish=0;
let publishTimer:ReturnType<typeof setTimeout>|undefined;
let persistTimer:ReturnType<typeof setTimeout>|undefined;
let latest:Snapshot|undefined;

function publish() {
  if(!latest)return;
  lastPublish=Date.now();
  for(const port of ports) {
    try{port.postMessage({type:'STATE',state:latest});}catch{ports.delete(port);}
  }
}

function paint() {
  if(!latest)return;
  const badge=createBadge(latest);
  const key=JSON.stringify(badge);
  if(key===lastPaint)return;
  lastPaint=key;
  paintQueue=paintQueue.then(async()=>{
    await paintToolbar(badge);
  }).catch(()=>{lastPaint='';});
}

function persistQuotes() {
  if(!latest)return;
  lastPersist=Date.now();
  const quotes=latest.quotes;
  cacheQueue=cacheQueue.then(()=>chrome.storage.local.set({quotes})).catch(()=>{lastPersist=0;});
}

function onState(state:Snapshot) {
  latest=state;
  if(!publishTimer)publishTimer=setTimeout(()=>{publishTimer=undefined;publish();},Math.max(0,1000-(Date.now()-lastPublish)));
  if(!persistTimer)persistTimer=setTimeout(()=>{persistTimer=undefined;persistQuotes();},Math.max(0,15_000-(Date.now()-lastPersist)));
}

function getRuntime():Promise<Runtime> {
  if(initialization)return initialization;
  initialization=(async()=>{
    const saved=await chrome.storage.local.get(['settings','quotes','catalog','catalogUsdm']);
    const settings=normalizeSettings(saved.settings);
    if(!saved.settings)await chrome.storage.local.set({settings});
    await ensureAlarm(chrome.alarms);
    const readCatalog=(value:unknown,market:MarketType)=>isRecord(value) && Array.isArray(value.symbols) && typeof value.updatedAt==='number'
      ? {symbols:value.symbols.filter(isMarketSymbol).filter(pair=>marketOf(pair)===market),updatedAt:value.updatedAt}:undefined;
    const client=new BinanceClient({catalogs:{spot:readCatalog(saved.catalog,'spot'),usdm:readCatalog(saved.catalogUsdm,'usdm')},onCatalog:(symbols,updatedAt,market='spot')=>{void chrome.storage.local.set({[market==='usdm'?'catalogUsdm':'catalog']:{symbols,updatedAt}}).catch(()=>{});}});
    const engine=new MarketEngine({client,settings,quotes:isRecord(saved.quotes)?saved.quotes as Record<string,Quote>:undefined});
    engine.subscribe(onState);onState(engine.getSnapshot());paint();
    setInterval(paint,1000);
    void engine.start();
    return {client,engine};
  })().catch(error=>{initialization=undefined;throw error;});
  return initialization;
}

async function handleMessage(message:unknown):Promise<unknown> {
  if(!isRecord(message) || typeof message.type!=='string')throw new Error('消息格式无效');
  const {engine,client}=await getRuntime();
  switch(message.type) {
    case 'GET_STATE':return engine.getSnapshot();
    case 'GET_SYMBOLS': {
      if(message.market!==undefined && message.market!=='spot' && message.market!=='usdm')throw new Error('不支持的行情市场');
      return client.getSymbols(false,message.market??'spot');
    }
    case 'GET_QUOTE': {
      if(!isMarketSymbol(message.symbol))throw new Error('交易对格式无效');
      const requested=message.symbol;
      const catalog=await client.getSymbols(false,marketOf(requested));
      const pair=catalog.find(pair=>samePair(pair,requested));
      if(!pair)throw new Error('该交易对当前不可用');
      const quotes=await client.getQuotes([pair]);return quotes[0];
    }
    case 'REFRESH':engine.healthCheck();return engine.refresh();
    case 'UPDATE_SETTINGS': {
      const operation=settingsQueue.then(async()=>{
        const current=engine.getSnapshot().settings;
        const next=applySettingsPatch(current,message.patch);
        const added=next.watchlist.filter(pair=>!current.watchlist.some(old=>samePair(old,pair)));
        if(added.length) {
          const markets=[...new Set(added.map(marketOf))];
          const catalog=(await Promise.all(markets.map(market=>client.getSymbols(false,market)))).flat();
          if(!added.every(pair=>catalog.some(entry=>samePair(entry,pair))))throw new Error('新增交易对当前不可交易，请刷新目录');
        }
        await chrome.storage.local.set({settings:next});
        engine.setSettings(next);paint();publish();return engine.getSnapshot();
      });
      settingsQueue=operation.catch(()=>{});return operation;
    }
    default:throw new Error('不支持的操作');
  }
}
function samePair(a:MarketSymbol,b:MarketSymbol){return pairKey(a)===pairKey(b) && a.baseAsset===b.baseAsset && a.quoteAsset===b.quoteAsset;}

// Register listeners synchronously so MV3 can wake this worker for any event.
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(sender.id!==chrome.runtime.id)return false;
  void handleMessage(message).then(data=>sendResponse({ok:true,data}),error=>sendResponse({ok:false,error:error instanceof Error?error.message:'后台暂不可用'}));
  return true;
});
chrome.runtime.onConnect.addListener(port=>{
  if(port.name!=='popup' || port.sender?.id!==chrome.runtime.id){port.disconnect();return;}
  ports.add(port);port.onDisconnect.addListener(()=>ports.delete(port));
  void getRuntime().then(({engine})=>{if(ports.has(port))port.postMessage({type:'STATE',state:engine.getSnapshot()});}).catch(()=>port.disconnect());
});
function recover(){void getRuntime().then(async({engine})=>{await ensureAlarm(chrome.alarms);engine.healthCheck();}).catch(()=>{});}
chrome.runtime.onInstalled.addListener(recover);
chrome.runtime.onStartup.addListener(recover);
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===HEALTH_ALARM)recover();});
recover();
