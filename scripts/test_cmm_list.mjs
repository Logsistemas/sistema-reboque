import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://127.0.0.1:8000/central', { waitUntil: 'networkidle', timeout: 60000 });
await page.locator('[data-cmm-open]').first().click();
await page.waitForFunction(() => {
  const l = document.getElementById('cmmLoading');
  return l && (l.hidden || getComputedStyle(l).display === 'none');
}, null, { timeout: 15000 });
await page.waitForTimeout(200);

const audit = await page.evaluate(() => {
  const loading = document.getElementById('cmmLoading');
  const inner = document.getElementById('cmmListInner');
  const cards = inner ? inner.querySelectorAll('.cmm-card').length : 0;
  const skeletonsVisible = loading
    ? getComputedStyle(loading).display !== 'none' && !loading.hidden
    : false;
  const firstCard = inner?.querySelector('.cmm-card');
  const viewport = document.getElementById('cmmListViewport');
  const vRect = viewport?.getBoundingClientRect();
  const cRect = firstCard?.getBoundingClientRect();
  return {
    skeletonsVisible,
    loadingHidden: loading?.hidden,
    loadingDisplay: loading ? getComputedStyle(loading).display : null,
    cards,
    firstCardTop: cRect ? cRect.top - (vRect?.top || 0) : null,
    innerTransform: inner ? getComputedStyle(inner).transform : null,
  };
});

console.log('LIST AUDIT:', JSON.stringify(audit, null, 2));

if (audit.skeletonsVisible) {
  console.error('FALHA: skeleton ainda visivel apos carregar');
  process.exit(1);
}

if (audit.cards > 0 && audit.firstCardTop != null && audit.firstCardTop > 120) {
  console.error('FALHA: primeiro motorista muito abaixo do topo', audit.firstCardTop);
  process.exit(1);
}

const card = page.locator('.cmm-card.selectable').first();
if (await card.count()) {
  await card.click();
  const disabled = await page.locator('#cmmBtnEnviar').isDisabled();
  console.log('Enviar Servico disabled:', disabled);
  if (disabled) process.exit(1);
}

console.log('OK — lista sem skeleton, motoristas no topo');
await browser.close();
