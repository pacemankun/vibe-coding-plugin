import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

test('real extension displays three clean, readable payment QR codes', async ({}, testInfo) => {
  const profile = await mkdtemp(join(tmpdir(), 'danke-donation-'));
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 400, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      '--no-proxy-server', '--host-resolver-rules=MAP data-stream.binance.vision ~NOTFOUND, MAP fstream.binance.com ~NOTFOUND'],
  });
  try {
    await context.route('https://data-api.binance.vision/**', route => route.abort('internetdisconnected'));
    await context.route('https://fapi.binance.com/**', route => route.abort('internetdisconnected'));
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    const feed = page.getByRole('button', { name: /投喂蛋壳/ });
    await expect(feed).toBeVisible();
    await expect(feed.locator('.donation-note')).toHaveText('（支持开发）');
    const brand = await page.locator('.brand').boundingBox();
    const heading = await page.locator('.brand strong').boundingBox();
    const trigger = await feed.boundingBox();
    expect(heading && trigger && Math.abs(heading.y - trigger.y)).toBeLessThan(15);
    expect(brand && trigger && trigger.x - brand.x - brand.width).toBeGreaterThanOrEqual(6);
    expect(brand && trigger && trigger.x - brand.x - brand.width).toBeLessThanOrEqual(18);
    expect(await page.locator('.topbar').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.locator('.topbar').screenshot({ path: testInfo.outputPath('donation-entry.png') });
    await feed.click();
    await expect(page.getByRole('dialog', { name: '支持蛋壳币价' })).toBeVisible();
    const dialogBounds = await page.getByRole('dialog').boundingBox();
    expect(dialogBounds?.width).toBeLessThanOrEqual(330);
    expect(dialogBounds?.height).toBeLessThanOrEqual(470);
    await page.getByRole('dialog').screenshot({ path: testInfo.outputPath('donation-dialog-wechat.png') });
    expect(await page.getByRole('tab').allTextContents()).toEqual(['微信', '支付宝', 'USDT']);
    for (const [tab, image] of [['微信', '微信收款码'], ['支付宝', '支付宝收款码'], ['USDT', 'USDT收款码']]) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      const qr = page.getByRole('img', { name: image });
      await expect(qr).toBeVisible();
      await expect.poll(() => qr.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
      await qr.screenshot({ path: testInfo.outputPath(`qr-${tab}.png`) });
    }
    await expect(page.getByText('ERC20 (Ethereum)', { exact: true })).toBeVisible();
    await expect(page.getByText(/0\.5 USDT/)).toBeVisible();
    await expect(page.getByText('0xec80be6d6a4add98405efa2ef68e9f15d44072d8')).toBeVisible();
    await expect(page.getByRole('button', { name: '复制地址' })).toBeInViewport();
    expect((await page.getByRole('dialog').boundingBox())?.height).toBeLessThanOrEqual(470);
    await page.getByRole('dialog').screenshot({ path: testInfo.outputPath('donation-dialog-usdt.png') });
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
