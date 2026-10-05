import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8099';
const OUT_DIR = '/home/arcrek/workspace/tmail_add_domain/plans/reports/enhance-ux-ax-261005-1835-tmail/round-1';
const ADMIN_PASSWORD = 'admin-secret-pw';

fs.mkdirSync(OUT_DIR, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
  { name: 'reflow', width: 320, height: 568 },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });

for (const vp of viewports) {
  console.log(`Capturing for viewport: ${vp.name} (${vp.width}x${vp.height})`);

  // --- Home page ---
  {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#local-part', { timeout: 10000 });
    await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-home-loaded.png`), fullPage: true });

    // Enter address and navigate to inbox
    await page.fill('#local-part', 'demo.user');
    await page.click('button.primary-button[type=submit]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-inbox-loaded.png`), fullPage: true });

    // Open message reader
    try {
      const messageItem = page.locator('button.message-row').first();
      if (await messageItem.count() > 0) {
        await messageItem.click();
        await page.waitForSelector('.message-reader', { timeout: 5000 });
        await page.waitForTimeout(600);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-reader-loaded.png`), fullPage: true });
      }
    } catch (e) {
      console.warn(`Could not open message reader for ${vp.name}:`, e.message);
    }

    await context.close();
  }

  // --- Admin login & dashboard (skip reflow for admin tabs if not needed, or include) ---
  if (vp.name !== 'reflow') {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
    await page.waitForSelector('#admin-password', { timeout: 10000 });
    await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-admin-login.png`), fullPage: true });

    await page.fill('#admin-password', ADMIN_PASSWORD);
    await page.click('button.primary-button[type=submit]');
    await page.waitForSelector('#admin-tab-0', { timeout: 10000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-admin-dashboard.png`), fullPage: true });

    await context.close();
  }
}

await browser.close();
console.log('Capture complete!');
