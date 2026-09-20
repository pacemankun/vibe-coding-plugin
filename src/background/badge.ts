import type { Settings, Snapshot, MarketSymbol } from '../shared/types';
import { formatBadgeChange, formatBadgePrice, formatChange, formatPrice, isStale } from '../shared/format';
import { connectionFor, marketLabel, marketOf, pairKey } from '../shared/market';

export function getBadgePair(settings:Settings,now=Date.now()):MarketSymbol | undefined {
  const selected=settings.watchlist.findIndex(pair=>pairKey(pair)===settings.badgeSymbol);
  if(selected<0)return undefined;
  const offset=settings.rotationSeconds?Math.floor(now/(settings.rotationSeconds*1000)):0;
  return settings.watchlist[(selected+offset)%settings.watchlist.length];
}

export function createBadge(state:Snapshot,now=Date.now()) {
  const pair=getBadgePair(state.settings,now);
  if(!pair)return {text:'',color:'#64748b',title:'蛋壳币价 · 未固定角标\n点击图标查看自选行情，选择币对后可固定到角标。'};
  const quote=state.quotes[pairKey(pair)];
  const connection=connectionFor(state,pair);
  const stale=isStale(quote,now);
  const live=connection.status==='live' && !stale;
  const color='#fbe4e6';
  const text=!quote?(connection.status==='connecting'?'....':'----'):state.settings.badgeMode==='change'?formatBadgeChange(quote.changePercent):formatBadgePrice(quote.price);
  const time=quote?new Date(quote.receivedAt).toLocaleString('zh-CN',{hour12:false}):'尚未收到';
  const status=!quote?'等待行情':stale?'缓存已过期':live?'实时行情':'最近报价 · 推送未连接';
  const title=[`蛋壳币价 · ${pair.baseAsset}/${pair.quoteAsset} · ${marketLabel(pair)}`,
    marketOf(pair)==='usdm'?'最新成交价（不是标记价格）':'现货最新价',
    quote?`${formatPrice(quote.price)} ${pair.quoteAsset}`:'暂无有效价格',
    `24 小时涨跌：${formatChange(quote?.changePercent??null)}`,
    `${status} · 收到时间：${time}`,
    `工具栏：${text}`,
    state.settings.badgeMode==='change'?'角标数值单位：%':'角标为近似值；k=千，M=百万，e-5=×10⁻⁵；TINY/HUGE 请看完整价',
    connection.message].join('\n');
  return {text,color,title};
}
