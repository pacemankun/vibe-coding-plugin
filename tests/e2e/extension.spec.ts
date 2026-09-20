import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createDefaultSettings } from '../../src/shared/settings';

test('real MV3 extension: toolbar, pair units, updates, offline cache and persistent settings', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'coin-glance-test-'));
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 400, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-proxy-server', '--host-resolver-rules=MAP data-stream.binance.vision ~NOTFOUND'],
  });
  try {
    const pairs = ['BTC','ETH','SOL','BNB','XRP','DOGE','TRX','ADA','AVAX','LINK'].map(baseAsset => ({ symbol: `${baseAsset}USDT`, baseAsset, quoteAsset: 'USDT' }));
    pairs.push({ symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC' });
    let failed = false;
    let btcPrice = '67482.36000000';
    await context.route('https://data-api.binance.vision/**', async route => {
      if (failed) return route.abort('internetdisconnected');
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/exchangeInfo')) return route.fulfill({ json: { symbols: pairs.map(pair => ({ ...pair, status: 'TRADING', isSpotTradingAllowed: true })) } });
      const symbols = JSON.parse(url.searchParams.get('symbols') ?? '[]') as string[];
      return route.fulfill({ json: symbols.map(symbol => ({ symbol, lastPrice: symbol === 'BTCUSDT' ? btcPrice : symbol === 'ETHBTC' ? '0.05219000' : '123.4500', priceChangePercent: '2.41', closeTime: Date.now() })) });
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.getByRole('button', { name: '刷新行情', exact: true }).click();
    await expect(page.getByText('未固定角标', {exact:true})).toBeVisible();
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
    await mkdir('artifacts',{recursive:true});
    await page.screenshot({path:'artifacts/popup-badge-unpinned.png'});
    await page.getByRole('button', {name:'查看 BTC/USDT 详情',exact:true}).click();
    await page.getByRole('button', {name:'固定到角标',exact:true}).click();
    await expect(page.getByTestId('focus-quote')).toContainText('67,482.36');
    await expect(page.getByText('交互预览 · 示例数据')).toHaveCount(0);
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('067k');
    expect(await worker.evaluate(async () => (await chrome.alarms.get('coin-glance-health'))?.periodInMinutes)).toBe(.5);
    await page.getByRole('button', { name: '添加币对', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜索币对' }).fill('ETHBTC');
    await page.getByRole('button', { name: '选择 ETH/BTC', exact: true }).click();
    await expect(page.getByTestId('pair-detail')).toContainText('0.05219');
    await expect(page.getByTestId('pair-detail')).not.toContainText('$');
    await page.getByRole('button', { name: '固定到角标', exact: true }).click();
    await expect(page.getByTestId('focus-quote')).toContainText('0.05219');
    await expect.poll(() => worker.evaluate(() => chrome.action.getTitle({}))).toContain('ETH/BTC');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '深色', exact: true }).click();
    await expect(page.locator('.popup-shell')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('.popup-shell')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('focus-quote')).toContainText('0.05219');
    const second = await context.newPage();
    await second.goto(`chrome-extension://${id}/popup.html`);
    await page.getByRole('button', {name:'查看 ETH/BTC 详情',exact:true}).click();
    await expect(page.getByRole('button', {name:'已固定 · 点击取消',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByTestId('pair-detail').screenshot({path:'artifacts/popup-badge-pinned.png'});
    await page.getByRole('button', {name:'已固定 · 点击取消',exact:true}).click();
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
    await expect(second.getByText('未固定角标',{exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByText('未固定角标',{exact:true})).toBeVisible();
    await page.getByRole('button', {name:'查看 ETH/BTC 详情',exact:true}).click();
    await expect(page.getByRole('button',{name:'固定到角标',exact:true})).toHaveAttribute('aria-pressed','false');
    await page.getByRole('button', {name:'固定到角标',exact:true}).click();
    await expect(second.getByTestId('focus-quote')).toContainText('0.05219');
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await page.getByRole('button',{name:'5 秒',exact:true}).click();
    await expect(page.getByRole('button',{name:'5 秒',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'隐藏角标',exact:true}).click();
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
    await expect(page.getByRole('button',{name:'5 秒',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'关闭设置',exact:true}).click();
    await page.getByRole('button',{name:'固定到角标',exact:true}).click();
    btcPrice = '70000.12000000';
    await page.getByRole('button', { name: '刷新行情', exact: true }).click();
    await expect(second.getByRole('button', { name: '查看 BTC/USDT 详情' })).toContainText('70,000.12');
    failed = true;
    await page.getByRole('button', { name: '刷新行情', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('刷新失败');
    await expect(page.getByTestId('focus-quote')).toContainText('0.05219');
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('.052');
    expect(await worker.evaluate(() => chrome.action.getBadgeBackgroundColor({}))).toEqual([154,246,252,255]);
    expect(await worker.evaluate(async () => ((await chrome.storage.local.get('settings')).settings as {badgeSymbol:string}).badgeSymbol)).toBe('ETHBTC');
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/popup-dark-offline.png' });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('browser restart restores cached quotes and settings, and recreates a missing alarm', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'coin-glance-restart-'));
  const extension = resolve('dist');
  const launch = () => chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 400, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-proxy-server', '--host-resolver-rules=MAP data-stream.binance.vision ~NOTFOUND, MAP data-api.binance.vision ~NOTFOUND'],
  });
  let context = await launch();
  try {
    let worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    let page = await context.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get('quotes')).quotes !== undefined)).toBe(true);
    const pair = { symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC' };
    const settings = { ...createDefaultSettings(), watchlist: [pair], badgeSymbol: pair.symbol, theme: 'dark' as const };
    const quote = { ...pair, price: '0.05219000', changePercent: 1.2, receivedAt: Date.now() - 120_000, eventTime: Date.now() - 120_000, source: 'rest' as const };
    await worker.evaluate(async ({ settings, quote }) => {
      await chrome.storage.local.set({ settings, quotes: { ETHBTC: quote } });
      await chrome.alarms.clear('coin-glance-health');
    }, { settings, quote });
    await context.close();
    context = await launch();
    worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    page = await context.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await expect(page.locator('.popup-shell')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('focus-quote')).toContainText('0.05219');
    await expect(page.getByTestId('focus-quote')).toContainText('缓存行情');
    await expect.poll(() => worker.evaluate(async () => (await chrome.alarms.get('coin-glance-health'))?.periodInMinutes)).toBe(.5);
    await expect.poll(() => worker.evaluate(() => chrome.action.getTitle({}))).toContain('缓存已过期');
    expect(await worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('.052');
    await page.getByRole('button',{name:'查看 ETH/BTC 详情',exact:true}).click();
    await page.getByRole('button',{name:'已固定 · 点击取消',exact:true}).click();
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
    await context.close();
    context=await launch();
    worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    page=await context.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await expect(page.getByText('未固定角标',{exact:true})).toBeVisible();
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
    expect(await worker.evaluate(async () => ((await chrome.storage.local.get('settings')).settings as {badgeSymbol:string|null}).badgeSymbol)).toBeNull();
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
