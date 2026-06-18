import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const cmmLogs = [];
const errors = [];

page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));
page.on('console', (m) => {
  const text = m.text();
  if (text.includes('[CMM]')) cmmLogs.push(text);
  if (m.type() === 'error') errors.push(`CON: ${text}`);
});

await page.goto('http://127.0.0.1:8000/central', { waitUntil: 'networkidle', timeout: 60000 });

const scriptLoaded = cmmLogs.some((l) => l.includes('SCRIPT CARREGADO'));
console.log('SCRIPT CARREGADO:', scriptLoaded);
console.log('CMM logs init:', cmmLogs.filter((l) => /SCRIPT|init|delegação/.test(l)).join(' | '));

const fnType = await page.evaluate(() => ({
  abrirModalMotorista: typeof window.abrirModalMotorista,
  cmmAbrirEnviar: typeof window.cmmAbrirEnviar,
  CMM_TEST_OPEN: typeof window.CMM_TEST_OPEN,
  build: window.CMM_BUILD,
}));

console.log('globals:', fnType);

const btnInfo = await page.evaluate(() => {
  const btn = document.querySelector('[data-cmm-open]');
  if (!btn) return null;
  return {
    hasDataOpen: btn.hasAttribute('data-cmm-open'),
    servicoId: btn.getAttribute('data-servico-id'),
    text: btn.textContent.trim(),
    onclick: !!btn.getAttribute('onclick'),
  };
});
console.log('botao HTML:', btnInfo);

if (!btnInfo) {
  console.error('FALHA: nenhum botao Enviar/trocar');
  process.exit(1);
}

// simula refresh da tabela (servico novo/importado)
await page.evaluate(async () => {
  const res = await fetch('/api/servicos', { cache: 'no-store' });
  const ss = await res.json();
  renderServicos(ss);
});
await page.waitForTimeout(300);

const btnAfterRefresh = await page.locator('[data-cmm-open]').count();
console.log('botoes apos renderServicos:', btnAfterRefresh);

await page.locator('[data-cmm-open]').first().click();
await page.waitForTimeout(900);

const state = await page.evaluate(() => ({
  open: document.getElementById('modalMotorista')?.classList.contains('open'),
  display: getComputedStyle(document.getElementById('modalMotorista')).display,
  hidden: document.getElementById('modalMotorista')?.getAttribute('aria-hidden'),
}));

console.log('modal state:', state);
console.log('CMM logs click:', cmmLogs.filter((l) => /CLICK|BTN|abrindo|modal open|servico_id/.test(l)).join('\n'));

if (!state.open || state.display === 'none') {
  console.error('FALHA: modal nao abriu');
  if (errors.length) console.error(errors.join('\n'));
  process.exit(1);
}

const card = page.locator('.cmm-card.selectable').first();
if (await card.count()) {
  await card.click();
  await page.waitForTimeout(200);
  const btnDisabled = await page.locator('#cmmBtnEnviar').isDisabled();
  console.log('botao Enviar Servico disabled:', btnDisabled);
  if (btnDisabled) {
    console.error('FALHA: botao Enviar Servico ainda desabilitado');
    process.exit(1);
  }
}

console.log('OK — teste real navegador: script, clique, modal, selecao');
await browser.close();
