import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push('ERR:' + e.message));

await page.goto('http://127.0.0.1:8000/central', { waitUntil: 'networkidle', timeout: 60000 });
await page.locator('[data-cmm-open]').first().click();
await page.waitForTimeout(5000);

const state = await page.evaluate(() => ({
  loading: {
    hidden: document.getElementById('cmmLoading')?.hidden,
    display: getComputedStyle(document.getElementById('cmmLoading')).display,
    className: document.getElementById('cmmLoading')?.className,
  },
  cards: document.querySelectorAll('#cmmListInner .cmm-card').length,
  modalOpen: document.getElementById('modalMotorista')?.classList.contains('open'),
}));

console.log('state', state);
console.log('logs', logs.filter((l) => l.includes('[CMM]')).slice(-15));
await browser.close();
