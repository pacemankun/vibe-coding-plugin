import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

test('toolbar uses the readable native badge with one palette and clears it on unpin',async()=>{
  const profile=await mkdtemp(join(tmpdir(),'danke-toolbar-'));
  const extension=resolve('dist');
  const context=await chromium.launchPersistentContext(profile,{
    channel:'chromium',headless:true,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server','--host-resolver-rules=MAP data-stream.binance.vision ~NOTFOUND, MAP data-api.binance.vision ~NOTFOUND'],
  });
  try {
    await context.route('https://data-api.binance.vision/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname.endsWith('/exchangeInfo'))return route.fulfill({json:{symbols:[]}});
      const symbols=JSON.parse(url.searchParams.get('symbols')??'[]') as string[];
      return route.fulfill({json:symbols.map(symbol=>({symbol,lastPrice:'0.6073',priceChangePercent:'-2.4',closeTime:Date.now()}))});
    });
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const id=new URL(worker.url()).host;
    const page=await context.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await expect.poll(()=>worker.evaluate(()=>chrome.action.getBadgeText({}))).toBe('');
    await page.getByRole('button',{name:'查看 BTC/USDT 详情',exact:true}).click();
    await page.getByRole('button',{name:'固定到角标',exact:true}).click();
    await expect.poll(()=>worker.evaluate(()=>chrome.action.getBadgeText({}))).toBe('.607');
    expect(await worker.evaluate(()=>chrome.action.getBadgeBackgroundColor({}))).toEqual([154,246,252,255]);
    expect(await worker.evaluate(()=>chrome.action.getBadgeTextColor({}))).toEqual([48,40,43,255]);
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await expect(page.getByText('涨跌颜色',{exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'隐藏角标',exact:true}).click();
    await expect.poll(()=>worker.evaluate(()=>chrome.action.getBadgeText({}))).toBe('');
  } finally {await context.close();await rm(profile,{recursive:true,force:true});}
});
