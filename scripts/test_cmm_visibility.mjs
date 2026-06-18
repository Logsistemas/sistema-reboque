import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'scripts', 'cmm-test-output');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://127.0.0.1:8000/central', { waitUntil: 'networkidle', timeout: 60000 });
await page.locator('[data-cmm-open]').first().click();
await page.waitForTimeout(1000);

const audit = await page.evaluate(() => {
  const modal = document.getElementById('modalMotorista');
  const panel = document.getElementById('cmmPanel');
  if (!modal) return { error: 'modalMotorista not found' };
  const ms = getComputedStyle(modal);
  const ps = panel ? getComputedStyle(panel) : null;
  const rect = modal.getBoundingClientRect();
  const prect = panel ? panel.getBoundingClientRect() : null;
  return {
    id: modal.id,
    classes: modal.className,
    parent: modal.parentElement?.tagName,
    parentId: modal.parentElement?.id || null,
    ariaHidden: modal.getAttribute('aria-hidden'),
    modal: {
      display: ms.display,
      visibility: ms.visibility,
      opacity: ms.opacity,
      zIndex: ms.zIndex,
      position: ms.position,
      width: ms.width,
      height: ms.height,
      transform: ms.transform,
      pointerEvents: ms.pointerEvents,
    },
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    panel: ps
      ? {
          display: ps.display,
          visibility: ps.visibility,
          opacity: ps.opacity,
          width: ps.width,
          height: ps.height,
          rect: prect
            ? { x: prect.x, y: prect.y, width: prect.width, height: prect.height }
            : null,
        }
      : null,
    visibleOnScreen: rect.width > 0 && rect.height > 0 && ms.display !== 'none' && ms.visibility !== 'hidden' && parseFloat(ms.opacity) > 0,
  };
});

console.log('MODAL AUDIT:', JSON.stringify(audit, null, 2));

await page.screenshot({ path: path.join(outDir, 'modal-open.png'), fullPage: false });
console.log('screenshot:', path.join(outDir, 'modal-open.png'));

const card = page.locator('.cmm-card.selectable').first();
if (await card.count()) {
  await card.click();
  await page.waitForTimeout(300);
  const envDisabled = await page.locator('#cmmBtnEnviar').isDisabled();
  console.log('Enviar Servico disabled:', envDisabled);
}

if (!audit.visibleOnScreen) {
  console.error('FALHA: modal nao visivel na tela');
  process.exit(1);
}

console.log('OK — modal visivel na tela');
await browser.close();
