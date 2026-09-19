import { chromium } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Optional real-network check; intentionally excluded from deterministic CI.
const profile = await mkdtemp(join(tmpdir(), 'coin-glance-live-'));
const extension = resolve('dist');
const futures=process.argv.includes('--usdm');
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 400, height: 600 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/popup.html`);
  if(futures){
    await page.getByRole('button',{name:'添加币对',exact:true}).click();
    await page.getByRole('tab',{name:'USDT 永续',exact:true}).click();
    await page.getByRole('searchbox',{name:'搜索币对'}).fill('BTW');
    await page.locator('.search-results button').filter({hasText:'BTW/USDT'}).click({timeout:15_000});
    await page.getByRole('button',{name:'固定到角标',exact:true}).click();
  }
  const deadline = Date.now() + 30_000;
  let snapshot;
  do {
    snapshot = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_STATE' }));
    const badge = await page.evaluate(() => chrome.action.getBadgeText({}));
    const visible = await page.locator('[data-testid="focus-quote"] .focus-price strong').innerText();
    const visibleStatus=await page.locator('[data-testid="focus-quote"] .fresh-label').innerText();
    const connected=futures?snapshot.data?.connections?.usdm?.status==='live' && snapshot.data?.quotes?.['usdm:BTWUSDT']?.source==='stream':snapshot.data?.connection.status==='live' && Object.keys(snapshot.data.quotes).length===10;
    if (snapshot.ok && connected && badge !== '....' && badge !== '----' && visible !== '--' && (!futures || visibleStatus==='实时行情')) break;
    await delay(500);
  } while (Date.now() < deadline);
  if (!snapshot?.ok || (futures?snapshot.data.connections?.usdm?.status:snapshot.data.connection.status) !== 'live') throw new Error(`Live connection unavailable: ${JSON.stringify(snapshot?.data?.connections ?? snapshot)}`);
  const result = await page.evaluate(async futures => {
    const { data } = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    return { status: futures?data.connections?.usdm?.status:data.connection.status, quotes: Object.keys(data.quotes).length, streamedQuotes: Object.values(data.quotes).filter(quote => quote.source === 'stream').length, badge: await chrome.action.getBadgeText({}), alarm: (await chrome.alarms.get('coin-glance-health'))?.periodInMinutes, ...(futures?{instrument:'BTWUSDT',market:'usdm',source:data.quotes['usdm:BTWUSDT']?.source}: {}) };
  },futures);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: futures?'artifacts/popup-usdm-live.png':'artifacts/popup-live.png' });
  console.log(JSON.stringify({ ...result, pageErrors: errors }, null, 2));
  if (errors.length || result.status !== 'live' || result.quotes !== (futures?11:10) || !result.streamedQuotes || (futures && result.source!=='stream') || ['....','----',''].includes(result.badge)) throw new Error('Live extension verification failed');
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
