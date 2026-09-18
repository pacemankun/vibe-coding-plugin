import { describe, expect, it } from 'vitest';
import { applySettingsPatch, createDefaultSettings, normalizeSettings, isMarketSymbol } from '../src/shared/settings';
const btc = {symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT'};
const eth = {symbol:'ETHBTC',baseAsset:'ETH',quoteAsset:'BTC'};
const future = {...btc,market:'usdm' as const};

describe('settings persistence boundaries', () => {
  it('keeps spot and perpetual contracts with the same symbol separate', () => {
    const state=normalizeSettings({watchlist:[btc,future,future],badgeSymbol:'usdm:BTCUSDT'});
    expect(state.watchlist).toEqual([btc,future]);
    expect(state.badgeSymbol).toBe('usdm:BTCUSDT');
    expect(applySettingsPatch(state,{watchlist:[btc]}).badgeSymbol).toBe('BTCUSDT');
  });
  it('rejects unsupported markets and non-USDT perpetual instruments', () => {
    expect(isMarketSymbol({...btc,market:'unknown'})).toBe(false);
    expect(isMarketSymbol({...eth,market:'usdm'})).toBe(false);
  });
  it('keeps actual quote currencies, deduplicates and repairs missing badge selection on load', () => {
    const state = normalizeSettings({watchlist:[eth,eth,btc],badgeSymbol:'GONE',theme:'dark'});
    expect(state.watchlist).toEqual([eth,btc]);
    expect(state.badgeSymbol).toBe('ETHBTC');
    expect(state.theme).toBe('dark');
  });
  it('rejects removing the last coin instead of silently resetting user settings', () => {
    expect(()=>applySettingsPatch(createDefaultSettings(), {watchlist:[]})).toThrow();
  });
  it('rejects unknown modes and malformed trading pairs', () => {
    expect(()=>applySettingsPatch(createDefaultSettings(), {rotationSeconds:1})).toThrow();
    expect(()=>applySettingsPatch(createDefaultSettings(), {watchlist:[{...btc,symbol:'ETHBTC'}]})).toThrow();
    expect(isMarketSymbol(eth)).toBe(true);
    expect(isMarketSymbol({symbol:'bad<script>',baseAsset:'bad',quoteAsset:'USDT'})).toBe(false);
  });
  it('repairs selected badge when that coin is removed', () => {
    const state = applySettingsPatch(createDefaultSettings(), {watchlist:[eth],theme:'light'});
    expect(state.badgeSymbol).toBe('ETHBTC');
    expect(state.theme).toBe('light');
  });
});
