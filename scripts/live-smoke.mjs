import { chromium } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Optional real-network check; intentionally excluded from deterministic CI.
const profile = await mkdtemp(join(tmpdir(), 'coin-glance-live-'));
const extension = resolve('dist');
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
  const deadline = Date.now() + 30_000;
  let snapshot;
  do {
    snapshot = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_STATE' }));
    const badge = await page.evaluate(() => chrome.action.getBadgeText({}));
    const visible = await page.locator('[data-testid="focus-quote"] .focus-price strong').innerText();
    if (snapshot.ok && snapshot.data.connection.status === 'live' && Object.keys(snapshot.data.quotes).length === 10 && badge !== '…' && badge !== '--' && visible !== '--') break;
    await delay(500);
  } while (Date.now() < deadline);
  if (!snapshot?.ok || snapshot.data.connection.status !== 'live') throw new Error(`Live connection unavailable: ${JSON.stringify(snapshot?.data?.connection ?? snapshot)}`);
  const result = await page.evaluate(async () => {
    const { data } = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    return { status: data.connection.status, quotes: Object.keys(data.quotes).length, streamedQuotes: Object.values(data.quotes).filter(quote => quote.source === 'stream').length, badge: await chrome.action.getBadgeText({}), alarm: (await chrome.alarms.get('coin-glance-health'))?.periodInMinutes };
  });
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/popup-live.png' });
  console.log(JSON.stringify({ ...result, pageErrors: errors }, null, 2));
  if (errors.length || result.status !== 'live' || result.quotes !== 10 || !result.streamedQuotes || ['…','--',''].includes(result.badge)) throw new Error('Live extension verification failed');
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
