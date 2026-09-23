import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const output = resolve('docs/webstore/assets');
const readPng = path => `data:image/png;base64,${readFileSync(resolve(path)).toString('base64')}`;
const icon = readPng('public/icons/128.png');
const market = readPng('artifacts/popup-usdm.png');
const watchlist = readPng('artifacts/popup-badge-unpinned.png');
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;width:440px;height:280px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#16383d;background:linear-gradient(140deg,#dffaff,#b9f1fa 58%,#f4fffb)}
    body:before{content:"";position:absolute;width:250px;height:250px;left:-58px;top:86px;border:2px solid #ffffff8c;border-radius:50%}
    .brand{position:absolute;left:22px;top:35px;width:176px;height:176px;border-radius:50%;background:#ffffffb8;display:grid;place-items:center;box-shadow:0 16px 35px #2b8d9826}
    .brand img{width:154px;height:154px;object-fit:contain}
    .copy{position:absolute;left:210px;top:61px;width:210px}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.22em;color:#277b8b}
    h1{margin:15px 0 8px;font-size:33px;letter-spacing:-.06em;white-space:nowrap}.sub{font-size:16px;font-weight:700;line-height:1.45}.pill{display:inline-block;margin-top:16px;padding:6px 12px;border-radius:8px;background:#8ae9f4;color:#14383d;font-size:12px;font-weight:750}
    .footer{position:absolute;right:21px;bottom:19px;font-size:10px;font-weight:700;letter-spacing:.16em;color:#277b8b}
  </style><div class="brand"><img src="${icon}" alt=""></div><div class="copy"><div class="eyebrow">DANKE COIN</div><h1>蛋壳币价</h1><div class="sub">币安现货与永续行情<br>在工具栏一眼可见</div><div class="pill">四字符价格角标</div></div><div class="footer">CHROME 扩展</div></html>`);
  await page.screenshot({ path: resolve(output, 'small-promo-440x280.png') });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;background:linear-gradient(135deg,#eaf8f7,#d5f4fa 68%,#f7fcf2);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#17342d}
    .heading{position:absolute;top:30px;left:150px;right:150px;display:flex;align-items:center;justify-content:space-between}
    .title{font-size:29px;font-weight:800;letter-spacing:-.04em}.meta{font-size:16px;color:#537a74;font-weight:650}
    .card{position:absolute;top:115px;width:400px;height:600px;border-radius:14px;overflow:hidden;box-shadow:0 18px 48px #123f3527;border:1px solid #a9d6cc;background:white}
    .card img{display:block;width:400px;height:600px;object-fit:cover}.card.first{left:205px}.card.second{left:675px}
    .caption{position:absolute;top:731px;width:400px;text-align:center;color:#315c56;font-size:17px;font-weight:750}.caption.first{left:205px}.caption.second{left:675px}
    .note{position:absolute;bottom:18px;right:28px;font-size:11px;color:#64847e}
  </style><div class="heading"><div class="title">蛋壳币价 · 一眼掌握自选行情</div><div class="meta">现货 / USDT 永续</div></div><div class="card first"><img src="${market}" alt="USDT 永续界面"></div><div class="card second"><img src="${watchlist}" alt="自选和未固定角标界面"></div><div class="caption first">查看永续交易对与完整价格</div><div class="caption second">自选列表与可取消的角标</div><div class="note">界面演示 · 价格为测试数据</div></html>`);
  await page.screenshot({ path: resolve(output, 'screenshot-01-1280x800.png') });
} finally {
  await browser.close();
}

console.log(`Created Chrome Web Store artwork in ${output}`);
