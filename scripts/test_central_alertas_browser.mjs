import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:8000';
const logs = [];

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const servicos = await api('GET', '/api/servicos');
let sid = String(servicos[0]?.id || '');
if (!sid) {
  console.log('NO_SERVICO');
  process.exit(1);
}

// Serviço único de teste pode estar recusado — reabrir para validar placa
await api('POST', `/api/app/servicos/${sid}/status`, { status: 'aceito' });
await api('POST', `/api/central/alertas/placa/${sid}/marcar-visto`);
await api('POST', `/api/central/alertas/recusa/${sid}/marcar-visto`);

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('[CENTRAL_ALERTAS]')) logs.push(text);
});

await page.goto(`${BASE}/central`, { waitUntil: 'networkidle', timeout: 60000 });

await page.evaluate(() => {
  localStorage.setItem('central_som_ativo', '1');
});

await page.click('#btnCentralSomIco');
await page.waitForTimeout(800);

// Limpa alertas pendentes para baseline limpo
await api('POST', `/api/central/alertas/placa/${sid}/marcar-visto`);
await api('POST', `/api/central/alertas/recusa/${sid}/marcar-visto`);

await page.evaluate(() => window.centralAlertas?.pollAlertas?.());
await page.waitForTimeout(1200);

logs.length = 0;

// Garante serviço ativo para envio de placa
await api('POST', `/api/app/servicos/${sid}/status`, { status: 'aceito' });
await api('POST', `/api/central/alertas/placa/${sid}/marcar-visto`);
await page.evaluate(() => window.centralAlertas?.pollAlertas?.());
await page.waitForTimeout(1500);

// Novos eventos com Central já aberta e inicializada
await api('POST', `/api/app/servicos/${sid}/placa`, { placa: 'BRO1W32' });
await page.waitForTimeout(6000);
await page.waitForSelector(`tr[data-id="${sid}"]`, { timeout: 15000 }).catch(() => null);

const visualPlaca = await page.evaluate((targetSid) => {
  const tr = document.querySelector(`tr[data-id="${targetSid}"]`) || document.querySelector('tr[data-id]');
  const placa = tr?.querySelector('[data-col-placa]');
  const badge = placa?.querySelector('b');
  const cellClasses = placa?.className || '';
  return {
    badgeClasses: badge?.className || '',
    cellHasPulse: /alerta-piscando-placa|placa-piscando/.test(cellClasses),
  };
}, sid);

await api('POST', `/api/app/servicos/${sid}/status`, { status: 'recusado' });
await page.waitForTimeout(6000);

const visualRecusa = await page.evaluate((targetSid) => {
  const tr = document.querySelector(`tr[data-id="${targetSid}"]`) || document.querySelector('tr[data-id]');
  const status = tr?.querySelector('.col-status-alerta span');
  const linhaClasses = tr?.className || '';
  return {
    statusClasses: status?.className || '',
    linhaHasHighlight: /linha-recusada|alerta-linha-recusa/.test(linhaClasses),
  };
}, sid);

console.log('=== LOGS NAVEGADOR [CENTRAL_ALERTAS] ===');
logs.forEach((l) => console.log(l));

const checks = {
  placasRecebidas: logs.some((l) => l.includes('placas recebidas')),
  recusasRecebidas: logs.some((l) => l.includes('recusas recebidas')),
  somPlaca: logs.some((l) => l.includes('tocando som tipo=placa') && l.includes('plate_alert.mp3')),
  somRecusa: logs.some((l) => l.includes('tocando som tipo=recusa') && l.includes('refusal_alert.mp3')),
  piscaPlaca: logs.some((l) => l.includes('aplicando pisca placa')),
  destaqueRecusa: logs.some((l) => l.includes('aplicando destaque recusa')),
  cssPlaca: visualPlaca.badgeClasses.includes('placa-alerta-badge') && !visualPlaca.cellHasPulse,
  cssRecusa: visualRecusa.statusClasses.includes('status-alerta-recusa') && !visualRecusa.linhaHasHighlight,
};

console.log('=== ESTADO VISUAL ===');
console.log(JSON.stringify({ visualPlaca, visualRecusa }, null, 2));
console.log('=== CHECKS ===');
console.log(JSON.stringify(checks, null, 2));

await api('POST', `/api/central/alertas/placa/${sid}/marcar-visto`);
await api('POST', `/api/central/alertas/recusa/${sid}/marcar-visto`);

await browser.close();

const ok =
  checks.placasRecebidas &&
  checks.recusasRecebidas &&
  checks.piscaPlaca &&
  checks.destaqueRecusa &&
  checks.cssPlaca &&
  checks.cssRecusa;

process.exit(ok ? 0 : 1);
