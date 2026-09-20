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
    expect(applySettingsPatch(state,{watchlist:[btc]}).badgeSymbol).toBeNull();
  });
  it('rejects unsupported markets and non-USDT perpetual instruments', () => {
    expect(isMarketSymbol({...btc,market:'unknown'})).toBe(false);
    expect(isMarketSymbol({...eth,market:'usdm'})).toBe(false);
  });
  it('keeps actual quote currencies and clears invalid badge selection on load', () => {
    const state = normalizeSettings({watchlist:[eth,eth,btc],badgeSymbol:'GONE',theme:'dark'});
    expect(state.watchlist).toEqual([eth,btc]);
    expect(state.badgeSymbol).toBeNull();
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
  it('clears the badge and rotation when the pinned coin is removed', () => {
    const state = applySettingsPatch({...createDefaultSettings(),badgeSymbol:'BTCUSDT',rotationSeconds:5}, {watchlist:[eth],theme:'light'});
    expect(state.badgeSymbol).toBeNull();
    expect(state.rotationSeconds).toBe(0);
    expect(state.theme).toBe('light');
  });
  it('starts without a badge and preserves an explicit opt-out after reload or watchlist changes', () => {
    expect(createDefaultSettings().badgeSymbol).toBeNull();
    const cleared=applySettingsPatch({...createDefaultSettings(),badgeSymbol:'BTCUSDT',rotationSeconds:5},{badgeSymbol:null});
    expect(cleared.badgeSymbol).toBeNull();
    expect(cleared.rotationSeconds).toBe(0);
    expect(normalizeSettings(JSON.parse(JSON.stringify(cleared))).badgeSymbol).toBeNull();
    expect(applySettingsPatch(cleared,{watchlist:[btc,eth],theme:'dark'}).badgeSymbol).toBeNull();
  });
  it('preserves a valid legacy pin and rejects rotation without a pin', () => {
    expect(normalizeSettings({version:1,watchlist:[btc],badgeSymbol:'BTCUSDT'}).badgeSymbol).toBe('BTCUSDT');
    expect(()=>applySettingsPatch(createDefaultSettings(),{rotationSeconds:5})).toThrow();
    expect(()=>applySettingsPatch(createDefaultSettings(),{badgeSymbol:'MISSING'})).toThrow();
    expect(()=>applySettingsPatch(createDefaultSettings(),{badgeSymbol:123})).toThrow();
  });
});
