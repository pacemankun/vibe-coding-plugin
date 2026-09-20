import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

test('BTW perpetual search, market isolation, pinning and persistent badge selection', async () => {
  const profile=await mkdtemp(join(tmpdir(),'coin-glance-usdm-'));
  const extension=resolve('dist');
  const context=await chromium.launchPersistentContext(profile,{
    channel:'chromium',headless:true,viewport:{width:400,height:600},
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server','--host-resolver-rules=MAP data-stream.binance.vision ~NOTFOUND, MAP fstream.binance.com ~NOTFOUND'],
  });
  try {
    const spot=['BTC','ETH','SOL','BNB','XRP','DOGE','TRX','ADA','AVAX','LINK'].map(baseAsset=>({symbol:`${baseAsset}USDT`,baseAsset,quoteAsset:'USDT'}));
    await context.route('https://data-api.binance.vision/**',route=>{
      const url=new URL(route.request().url());
      if(url.pathname.endsWith('exchangeInfo'))return route.fulfill({json:{symbols:spot.map(pair=>({...pair,status:'TRADING',isSpotTradingAllowed:true}))}});
      const symbols=JSON.parse(url.searchParams.get('symbols')??'[]') as string[];
      return route.fulfill({json:symbols.map(symbol=>({symbol,lastPrice:symbol==='BTCUSDT'?'60000.12':'100',priceChangePercent:'1.5',closeTime:Date.now()}))});
    });
    let futureFailed=false;
    await context.route('https://fapi.binance.com/**',route=>{
      if(futureFailed)return route.abort('internetdisconnected');
      const url=new URL(route.request().url());
      if(url.pathname.endsWith('exchangeInfo'))return route.fulfill({json:{symbols:['BTW','BTC'].map(baseAsset=>({symbol:`${baseAsset}USDT`,baseAsset,quoteAsset:'USDT',marginAsset:'USDT',status:'TRADING',contractType:'PERPETUAL'}))}});
      const symbol=url.searchParams.get('symbol');
      expect(url.searchParams.has('symbols')).toBe(false);
      expect(symbol).not.toBeNull();
      return route.fulfill({json:{symbol,lastPrice:symbol==='BTWUSDT'?'0.7050000':'61000.34',priceChangePercent:'-3.903',closeTime:Date.now()}});
    });
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const page=await context.newPage();
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await page.getByRole('button',{name:'刷新行情',exact:true}).click();
    await expect(page.getByRole('button',{name:'查看 BTC/USDT 详情',exact:true})).toContainText('60,000.12');
    await page.getByRole('button',{name:'添加币对',exact:true}).click();
    await page.getByRole('tab',{name:'USDT 永续',exact:true}).click();
    await page.getByRole('searchbox',{name:'搜索币对'}).fill('BTW');
    await page.locator('.search-results button').filter({hasText:'BTW/USDT'}).click();
    await expect(page.getByTestId('pair-detail')).toContainText('0.705');
    await expect(page.getByTestId('pair-detail')).toContainText('USDT 永续');
    await page.getByRole('button',{name:'固定到角标',exact:true}).click();
    await expect(page.getByTestId('focus-quote')).toContainText('BTW');
    await expect.poll(()=>worker.evaluate(()=>chrome.action.getTitle({}))).toContain('BTW/USDT · USDT 永续');
    await expect.poll(()=>worker.evaluate(()=>chrome.action.getBadgeText({}))).toBe('.705');
    await page.reload();
    await expect(page.getByTestId('focus-quote')).toContainText('BTW');
    await page.getByRole('button',{name:'添加币对',exact:true}).click();
    await page.getByRole('tab',{name:'USDT 永续',exact:true}).click();
    await page.getByRole('searchbox',{name:'搜索币对'}).fill('BTCUSDT');
    await page.locator('.search-results button').filter({hasText:'BTC/USDT'}).click();
    await page.getByRole('button',{name:'加入自选',exact:true}).click();
    const saved=await worker.evaluate(async()=> (await chrome.storage.local.get('settings')).settings as {watchlist:{symbol:string;market?:string}[];badgeSymbol:string});
    expect(saved.watchlist.filter(pair=>pair.symbol==='BTCUSDT')).toHaveLength(2);
    expect(saved.badgeSymbol).toBe('usdm:BTWUSDT');
    const state=await page.evaluate(async()=> (await chrome.runtime.sendMessage({type:'GET_STATE'})).data);
    expect(state.quotes.BTCUSDT.price).toBe('60000.12');
    await expect.poll(async()=> (await page.evaluate(async()=> (await chrome.runtime.sendMessage({type:'GET_STATE'})).data)).quotes['usdm:BTCUSDT']?.price).toBe('61000.34');
    futureFailed=true;
    await page.getByRole('button',{name:'刷新行情',exact:true}).click();
    await expect(page.getByTestId('focus-quote')).toContainText('0.705');
    await expect(page.getByRole('button',{name:'查看 BTC/USDT 详情',exact:true})).toContainText('60,000.12');
    await mkdir('artifacts',{recursive:true});
    await page.screenshot({path:'artifacts/popup-usdm.png'});
  } finally {await context.close();await rm(profile,{recursive:true,force:true});}
});
