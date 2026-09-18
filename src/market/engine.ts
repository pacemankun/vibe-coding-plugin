import type { MarketSymbol, Quote, Settings, Snapshot } from '../shared/types';
import { isRecord } from '../shared/settings';
import { isStale, validPrice } from '../shared/format';
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
export class MarketEngine {
  private state:Snapshot;
  private now:()=>number;
  private socketFactory:(url:string)=>SocketLike;
  private listeners=new Set<(state:Snapshot)=>void>();
  private socket:SocketLike|null=null;
  private socketVersion=0;
  private settingsVersion=0;
  private running=false;
  private failures=0;
  private openedAt=0;
  private lastActivity=0;
  private lastStreamAt:number|null=null;
  private retryTimer:ReturnType<typeof setTimeout>|undefined;
  private healthTimer:ReturnType<typeof setInterval>|undefined;
  private inflight:{version:number;promise:Promise<Snapshot>}|undefined;
  constructor(private options:EngineOptions) {
    this.now=options.now??Date.now;
    this.socketFactory=options.createSocket??(url=>new WebSocket(url) as unknown as SocketLike);
    const quotes:Record<string,Quote>={};
    for(const pair of options.settings.watchlist) {
      const quote=options.quotes?.[pair.symbol];
      if (quote && validPrice(quote.price) && Number.isFinite(quote.receivedAt) && quote.receivedAt<=this.now()+5000) quotes[pair.symbol]={...quote,...pair};
    }
    this.state={settings:options.settings,quotes,connection:{status:'connecting',message:'正在连接币安行情',lastMessageAt:null}};
  }
  getSnapshot() { return this.state; }
  subscribe(listener:(state:Snapshot)=>void) { this.listeners.add(listener); return ()=>{this.listeners.delete(listener);}; }
  private emit() { for(const listener of this.listeners) listener(this.state); }
  private connection(status:Snapshot['connection']['status'],message:string) {
    this.state={...this.state,connection:{status,message,lastMessageAt:this.lastStreamAt}};this.emit();
  }
  private streamHealthy() { return this.socket?.readyState===1 && this.lastStreamAt!==null && this.now()-this.lastStreamAt<60_000; }
  private updateStatus() {
    const complete=this.state.settings.watchlist.every(pair=>!isStale(this.state.quotes[pair.symbol],this.now()));
    if(this.streamHealthy()) this.connection(complete?'live':'degraded',complete?'实时行情已连接':'部分行情待更新');
    else this.connection('degraded',complete?'已更新快照，正在恢复实时连接':'部分行情暂不可用，保留上次报价');
  }
  private merge(quotes:Quote[],requestStarted?:number) {
    const next={...this.state.quotes};
    for(const quote of quotes) {
      if(!this.state.settings.watchlist.some(pair=>pair.symbol===quote.symbol) || !validPrice(quote.price)) continue;
      const previous=next[quote.symbol];
      // REST responses can arrive after a newer socket event. Event time is primary;
      // receipt time guards APIs where an exchange timestamp is missing.
      if(previous && ((previous.eventTime!==null && quote.eventTime!==null && previous.eventTime>quote.eventTime)
        || (quote.source==='rest' && previous.source==='stream' && requestStarted!==undefined && previous.receivedAt>requestStarted))) continue;
      next[quote.symbol]=quote;
    }
    this.state={...this.state,quotes:next};
  }
  async start() {
    if(this.running)return;
    this.running=true;this.connect();
    this.healthTimer=setInterval(()=>this.healthCheck(),20_000);
    await this.refresh().catch(()=>{});
  }
  async refresh():Promise<Snapshot> {
    const version=this.settingsVersion;
    if(this.inflight?.version===version)return this.inflight.promise;
    const started=this.now();
    const operation=(async()=>{
      try {
        const quotes=await this.options.client.getQuotes(this.state.settings.watchlist);
        if(version!==this.settingsVersion)return this.state;
        if(!quotes.length)throw new Error('未收到有效行情');
        this.merge(quotes,started);this.updateStatus();return this.state;
      } catch(error) {
        if(version===this.settingsVersion && !this.streamHealthy()) this.connection('offline',error instanceof Error?error.message:'行情连接失败，保留上次报价');
        throw error;
      }
    })();
    this.inflight={version,promise:operation};
    try{return await operation;}finally{if(this.inflight?.promise===operation)this.inflight=undefined;}
  }
  setSettings(settings:Settings) {
    const changed=JSON.stringify(settings.watchlist)!==JSON.stringify(this.state.settings.watchlist);
    this.state={...this.state,settings};
    if(changed) {
      this.settingsVersion++;
      this.state={...this.state,quotes:Object.fromEntries(Object.entries(this.state.quotes).filter(([symbol])=>settings.watchlist.some(pair=>pair.symbol===symbol)))};
      if(this.running){this.connect();void this.refresh().catch(()=>{});}
    }
    this.emit();
  }
  private connect() {
    if(!this.running)return;
    this.detach();
    const version=++this.socketVersion;
    this.lastStreamAt=null;this.openedAt=this.now();this.lastActivity=this.now();
    this.connection('connecting','正在连接实时行情');
    const streams=this.state.settings.watchlist.map(pair=>`${encodeURIComponent(pair.symbol.toLowerCase())}@ticker`).join('/');
    let socket:SocketLike;
    try {socket=this.socketFactory(`wss://data-stream.binance.vision:443/stream?streams=${streams}`);} catch {this.scheduleReconnect();return;}
    this.socket=socket;
    const current=()=>this.running && version===this.socketVersion && this.socket===socket;
    socket.onopen=()=>{if(current()){this.openedAt=this.now();this.lastActivity=this.now();}};
    socket.onmessage=event=>{
      if(!current() || typeof event.data!=='string')return;
      let payload:unknown;
      try{payload=JSON.parse(event.data);}catch{return;}
      if(!isRecord(payload))return;
      if('result' in payload && payload.id!==undefined){this.lastActivity=this.now();return;}
      const data=isRecord(payload.data)?payload.data:payload;
      if(data.e==='serverShutdown'){this.connect();return;}
      const pair=this.state.settings.watchlist.find(pair=>pair.symbol===data.s);
      if(!pair)return;
      const quote=parseStreamQuote(data,pair,this.now());
      if(!quote)return;
      this.lastActivity=this.now();this.lastStreamAt=this.now();this.failures=0;
      this.merge([quote]);this.updateStatus();
    };
    socket.onclose=()=>{if(current()){this.socket=null;this.scheduleReconnect();}};
    socket.onerror=()=>{if(current()){this.detach();this.scheduleReconnect();}};
  }
  private detach() {
    clearTimeout(this.retryTimer);this.retryTimer=undefined;
    if(this.socket){const previous=this.socket;this.socket=null;previous.onopen=previous.onclose=previous.onerror=null;previous.onmessage=null;previous.close();}
  }
  private scheduleReconnect() {
    if(!this.running || this.retryTimer)return;
    this.lastStreamAt=null;
    this.connection('offline','实时连接中断，正在自动重连');
    const delay=Math.min(30_000,1000*2**Math.min(this.failures++,5))+(this.options.random??Math.random)()*500;
    this.retryTimer=setTimeout(()=>{this.retryTimer=undefined;this.connect();},delay);
  }
  healthCheck() {
    if(!this.running)return;
    const now=this.now();
    if(this.socket && (now-this.openedAt>23*3600_000+55*60_000 || now-this.lastActivity>45_000))this.connect();
    if(!this.socket && !this.retryTimer)this.connect();
    if(this.socket?.readyState===1) {
      try{this.socket.send(JSON.stringify({method:'LIST_SUBSCRIPTIONS',id:now}));}
      catch{this.detach();this.scheduleReconnect();}
    }
    if(!this.streamHealthy() || this.state.settings.watchlist.some(pair=>isStale(this.state.quotes[pair.symbol],now)))void this.refresh().catch(()=>{});
    else this.updateStatus();
  }
  stop() {
    this.running=false;this.socketVersion++;this.settingsVersion++;
    clearInterval(this.healthTimer);this.detach();
  }
}
