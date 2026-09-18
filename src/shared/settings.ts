import type { MarketSymbol, Settings } from './types';

export const MAX_WATCHLIST = 20;
export function createDefaultSettings(): Settings {
  return {version:1,watchlist:['BTC','ETH','SOL','BNB','XRP','DOGE','TRX','ADA','AVAX','LINK'].map(baseAsset=>({symbol:`${baseAsset}USDT`,baseAsset,quoteAsset:'USDT'})),badgeSymbol:'BTCUSDT',badgeMode:'price',rotationSeconds:0,theme:'system',colorScheme:'green-up'};
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isMarketSymbol(value: unknown): value is MarketSymbol {
  if (!isRecord(value)) return false;
  const asset = /^[\p{L}\p{N}]{1,40}$/u;
  return typeof value.symbol === 'string' && typeof value.baseAsset === 'string' && typeof value.quoteAsset === 'string'
    && asset.test(value.baseAsset) && asset.test(value.quoteAsset) && value.symbol === value.baseAsset + value.quoteAsset;
}

export function normalizeSettings(value: unknown): Settings {
  const defaults = createDefaultSettings();
  if (!isRecord(value)) return defaults;
  const valid = Array.isArray(value.watchlist) ? value.watchlist.filter(isMarketSymbol) : [];
  const watchlist = [...new Map(valid.map(pair => [pair.symbol, {symbol:pair.symbol,baseAsset:pair.baseAsset,quoteAsset:pair.quoteAsset}])).values()].slice(0, MAX_WATCHLIST);
  if (!watchlist.length) watchlist.push(...defaults.watchlist);
  return {
    version: 1, watchlist,
    badgeSymbol: watchlist.some(pair => pair.symbol === value.badgeSymbol) ? value.badgeSymbol as string : watchlist[0].symbol,
    badgeMode: value.badgeMode === 'change' ? 'change' : 'price',
    rotationSeconds: [0,5,10,15].includes(value.rotationSeconds as number) ? value.rotationSeconds as Settings['rotationSeconds'] : 0,
    theme: ['light','dark','system'].includes(value.theme as string) ? value.theme as Settings['theme'] : 'system',
    colorScheme: value.colorScheme === 'red-up' ? 'red-up' : 'green-up',
  };
}

export function applySettingsPatch(settings: Settings, patch: unknown): Settings {
  if (!isRecord(patch)) throw new Error('设置格式无效');
  const allowed = ['watchlist','badgeSymbol','badgeMode','rotationSeconds','theme','colorScheme'];
  if (Object.keys(patch).some(key => !allowed.includes(key))) throw new Error('包含不支持的设置');
  if ('watchlist' in patch && (!Array.isArray(patch.watchlist) || patch.watchlist.length < 1 || patch.watchlist.length > MAX_WATCHLIST || !patch.watchlist.every(isMarketSymbol))) {
    throw new Error('自选列表须包含 1–20 个有效交易对');
  }
  for (const [key, values] of Object.entries({badgeMode:['price','change'],rotationSeconds:[0,5,10,15],theme:['light','dark','system'],colorScheme:['green-up','red-up']})) {
    if (key in patch && !(values as unknown[]).includes(patch[key])) throw new Error('设置选项无效');
  }
  const result = normalizeSettings({...settings,...patch});
  if ('badgeSymbol' in patch && !result.watchlist.some(pair => pair.symbol === patch.badgeSymbol)) throw new Error('请从自选列表选择角标币种');
  return result;
}
