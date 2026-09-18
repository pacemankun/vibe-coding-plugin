import type { MarketSymbol, MarketType, Quote, Settings, Snapshot } from '../shared/types';
import { isRecord } from '../shared/settings';
import { isStale, validPrice } from '../shared/format';
import { marketOf, pairKey } from '../shared/market';
import { parseStreamQuote } from './binance';

export interface SocketLike {
  readyState: number;
  onopen: (()=>void) | null;
  onmessage: ((event:{data:unknown})=>void) | null;
  onclose: (()=>void) | null;
  onerror: (()=>void) | null;
  send(data:string): void;
  close(): void;
}
export interface EngineOptions { client:{getQuotes(symbols:MarketSymbol[]):Promise<Quote[]>}; settings:Settings; quotes?:Record<string,Quote>; createSocket?:(url:string)=>SocketLike; now?:()=>number; random?:()=>number; }
type Connection=Snapshot['connection'];
type Channel={socket:SocketLike|null;version:number;failures:number;openedAt:number;lastActivity:number;lastStreamAt:number|null;retryTimer:ReturnType<typeof setTimeout>|undefined;connection:Connection};
const markets:MarketType[]=['spot','usdm'];
function newChannel():Channel {return {socket:null,version:0,failures:0,openedAt:0,lastActivity:0,lastStreamAt:null,retryTimer:undefined,connection:{status:'connecting',message:'正在连接币安行情',lastMessageAt:null}};}
export class MarketEngine {
  private state:Snapshot;
  private now:()=>number;
  private socketFactory:(url:string)=>SocketLike;
  private listeners=new Set<(state:Snapshot)=>void>();
  private channels:Record<MarketType,Channel>={spot:newChannel(),usdm:newChannel()};
  private settingsVersion=0;
  private running=false;
  private healthTimer:ReturnType<typeof setInterval>|undefined;
  private inflight:{version:number;promise:Promise<Snapshot>}|undefined;
  constructor(private options:EngineOptions) {
    this.now=options.now??Date.now;
    this.socketFactory=options.createSocket??(url=>new WebSocket(url) as unknown as SocketLike);
    const quotes:Record<string,Quote>={};
    for(const pair of options.settings.watchlist) {
      const key=pairKey(pair);
      const quote=options.quotes?.[key];
      if (quote && validPrice(quote.price) && Number.isFinite(quote.receivedAt) && quote.receivedAt<=this.now()+5000) quotes[key]={...quote,...pair};
    }
    this.state={settings:options.settings,quotes,connection:{status:'connecting',message:'正在连接币安行情',lastMessageAt:null}};
    this.publish();
  }
  getSnapshot() { return this.state; }
  subscribe(listener:(state:Snapshot)=>void) { this.listeners.add(listener); return ()=>{this.listeners.delete(listener);}; }
  private emit() { for(const listener of this.listeners) listener(this.state); }
  private pairs(market:MarketType) {return this.state.settings.watchlist.filter(pair=>marketOf(pair)===market);}
  private activeMarkets() {return markets.filter(market=>this.pairs(market).length>0);}
  private publish() {
    const active=this.activeMarkets();
    const connections=Object.fromEntries(active.map(market=>[market,this.channels[market].connection])) as Snapshot['connections'];
    const statuses=active.map(market=>this.channels[market].connection.status);
    const status:Connection['status']=statuses.length===0?'connecting':statuses.every(s=>s==='live')?'live':statuses.every(s=>s==='offline')?'offline':statuses.every(s=>s==='connecting')?'connecting':'degraded';
    const lastMessageAt=active.reduce<number|null>((latest,market)=>Math.max(latest??0,this.channels[market].lastStreamAt??0)||null,null);
    const message=active.length===1?this.channels[active[0]].connection.message:status==='live'?'实时行情已连接':status==='connecting'?'正在连接币安行情':status==='offline'?'行情连接失败，保留上次报价':'部分市场行情暂不可用，保留上次报价';
    this.state={...this.state,connections,connection:{status,message,lastMessageAt}};
    this.emit();
  }
  private connection(market:MarketType,status:Connection['status'],message:string) {
    const channel=this.channels[market];
    channel.connection={status,message,lastMessageAt:channel.lastStreamAt};this.publish();
  }
  private streamHealthy(market:MarketType) {const channel=this.channels[market];return channel.socket?.readyState===1 && channel.lastStreamAt!==null && this.now()-channel.lastStreamAt<60_000;}
  private updateStatus(market:MarketType) {
    const complete=this.pairs(market).every(pair=>!isStale(this.state.quotes[pairKey(pair)],this.now()));
    if(this.streamHealthy(market)) this.connection(market,complete?'live':'degraded',complete?'实时行情已连接':'部分行情待更新');
    else this.connection(market,'degraded',complete?'已更新快照，正在恢复实时连接':'部分行情暂不可用，保留上次报价');
  }
  private merge(quotes:Quote[],requestStarted?:number) {
    const next={...this.state.quotes};
    for(const quote of quotes) {
      const key=pairKey(quote);
      if(!this.state.settings.watchlist.some(pair=>pairKey(pair)===key) || !validPrice(quote.price)) continue;
      const previous=next[key];
      if(previous && ((previous.eventTime!==null && quote.eventTime!==null && previous.eventTime>quote.eventTime)
        || (quote.source==='rest' && previous.source==='stream' && requestStarted!==undefined && previous.receivedAt>requestStarted))) continue;
      next[key]=quote;
    }
    this.state={...this.state,quotes:next};
  }
  async start() {
    if(this.running)return;
    this.running=true;
    for(const market of this.activeMarkets())this.connect(market);
    this.healthTimer=setInterval(()=>this.healthCheck(),20_000);
    await this.refresh().catch(()=>{});
  }
  async refresh():Promise<Snapshot> {
    const version=this.settingsVersion;
    if(this.inflight?.version===version)return this.inflight.promise;
    const started=this.now();
    const operation=(async()=>{
      const active=this.activeMarkets();
      let firstError:unknown;let succeeded=0;
      await Promise.allSettled(active.map(async market=>{
        try {
          const quotes=await this.options.client.getQuotes(this.pairs(market));
          if(version!==this.settingsVersion)return;
          if(!quotes.length)throw new Error('未收到有效行情');
          this.merge(quotes,started);this.updateStatus(market);succeeded++;
        } catch(error) {
          if(version!==this.settingsVersion)return;
          firstError??=error;
          if(!this.streamHealthy(market))this.connection(market,'offline',error instanceof Error?error.message:'行情连接失败，保留上次报价');
        }
      }));
      if(version!==this.settingsVersion)return this.state;
      if(!succeeded && firstError)throw firstError;
      return this.state;
    })();
    this.inflight={version,promise:operation};
    try{return await operation;}finally{if(this.inflight?.promise===operation)this.inflight=undefined;}
  }
  setSettings(settings:Settings) {
    const before=this.state.settings.watchlist;
    this.state={...this.state,settings};
    const changed=markets.filter(market=>JSON.stringify(before.filter(pair=>marketOf(pair)===market))!==JSON.stringify(this.pairs(market)));
    if(changed.length) {
      this.settingsVersion++;
      this.state={...this.state,quotes:Object.fromEntries(Object.entries(this.state.quotes).filter(([key])=>settings.watchlist.some(pair=>pairKey(pair)===key)))};
      for(const market of changed) {
        this.detach(market);this.channels[market].version++;
        if(this.running && this.pairs(market).length)this.connect(market);
      }
      if(this.running)void this.refresh().catch(()=>{});
    }
    this.publish();
  }
  private connect(market:MarketType) {
    if(!this.running || !this.pairs(market).length)return;
    this.detach(market);
    const channel=this.channels[market];
    const version=++channel.version;
    channel.lastStreamAt=null;channel.openedAt=this.now();channel.lastActivity=this.now();
    this.connection(market,'connecting','正在连接实时行情');
    const streams=this.pairs(market).map(pair=>`${encodeURIComponent(pair.symbol.toLowerCase())}@ticker`).join('/');
    const url=market==='usdm'?`wss://fstream.binance.com/market/stream?streams=${streams}`:`wss://data-stream.binance.vision:443/stream?streams=${streams}`;
    let socket:SocketLike;
    try {socket=this.socketFactory(url);} catch {this.scheduleReconnect(market);return;}
    channel.socket=socket;
    const current=()=>this.running && version===channel.version && channel.socket===socket;
    socket.onopen=()=>{if(current()){channel.openedAt=this.now();channel.lastActivity=this.now();}};
    socket.onmessage=event=>{
      if(!current() || typeof event.data!=='string')return;
      let payload:unknown;
      try{payload=JSON.parse(event.data);}catch{return;}
      if(!isRecord(payload))return;
      if('result' in payload && payload.id!==undefined){channel.lastActivity=this.now();return;}
      const data=isRecord(payload.data)?payload.data:payload;
      if(data.e==='serverShutdown'){this.connect(market);return;}
      const pair=this.pairs(market).find(pair=>pair.symbol===data.s);
      if(!pair)return;
      const quote=parseStreamQuote(data,pair,this.now());
      if(!quote)return;
      channel.lastActivity=this.now();channel.lastStreamAt=this.now();channel.failures=0;
      this.merge([quote]);this.updateStatus(market);
    };
    socket.onclose=()=>{if(current()){channel.socket=null;this.scheduleReconnect(market);}};
    socket.onerror=()=>{if(current()){this.detach(market);this.scheduleReconnect(market);}};
  }
  private detach(market:MarketType) {
    const channel=this.channels[market];
    clearTimeout(channel.retryTimer);channel.retryTimer=undefined;
    if(channel.socket){const previous=channel.socket;channel.socket=null;previous.onopen=previous.onclose=previous.onerror=null;previous.onmessage=null;previous.close();}
  }
  private scheduleReconnect(market:MarketType) {
    const channel=this.channels[market];
    if(!this.running || !this.pairs(market).length || channel.retryTimer)return;
    channel.lastStreamAt=null;
    this.connection(market,'offline','实时连接中断，正在自动重连');
    const delay=Math.min(30_000,1000*2**Math.min(channel.failures++,5))+(this.options.random??Math.random)()*500;
    channel.retryTimer=setTimeout(()=>{channel.retryTimer=undefined;this.connect(market);},delay);
  }
  healthCheck() {
    if(!this.running)return;
    const now=this.now();
    for(const market of this.activeMarkets()) {
      const channel=this.channels[market];
      if(channel.socket && (now-channel.openedAt>23*3600_000+55*60_000 || now-channel.lastActivity>45_000))this.connect(market);
      if(!channel.socket && !channel.retryTimer)this.connect(market);
      if(channel.socket?.readyState===1) {
        try{channel.socket.send(JSON.stringify({method:'LIST_SUBSCRIPTIONS',id:now}));}
        catch{this.detach(market);this.scheduleReconnect(market);}
      }
    }
    if(this.activeMarkets().some(market=>!this.streamHealthy(market) || this.pairs(market).some(pair=>isStale(this.state.quotes[pairKey(pair)],now))))void this.refresh().catch(()=>{});
    else for(const market of this.activeMarkets())this.updateStatus(market);
  }
  stop() {
    this.running=false;this.settingsVersion++;
    clearInterval(this.healthTimer);
    for(const market of markets){this.channels[market].version++;this.detach(market);}
  }
}
