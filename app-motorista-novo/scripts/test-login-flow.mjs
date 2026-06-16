/**
 * Simula o fluxo de login do app (fetch + parse + serviços).
 * Uso: node scripts/test-login-flow.mjs
 */
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');

function parseLoginResponse(raw, status) {
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, erro: `JSON inválido (HTTP ${status})` };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, erro: `Resposta vazia (HTTP ${status})` };
  }
  if (parsed.ok !== true) {
    return { ok: false, erro: parsed.erro || 'Login inválido' };
  }
  if (!parsed.motorista?.id) {
    return { ok: false, erro: 'Sem motorista.id' };
  }
  return { ok: true, motorista: parsed.motorista, raw };
}

async function main() {
  const payload = { login: 'Teste', senha: '123', placa: 'ABC1234' };
  const url = `${API_BASE}/api/app/motorista/login`;

  console.log('POST', url);
  console.log('payload', payload);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  console.log('status', res.status);
  console.log('raw', raw);

  const login = parseLoginResponse(raw, res.status);
  if (!login.ok) {
    console.error('FALHA login:', login.erro);
    process.exit(1);
  }

  console.log('motorista', login.motorista);
  console.log('→ setLogado(true) + tela Serviços');

  const svcUrl = `${API_BASE}/api/app/motorista/${login.motorista.id}/servicos`;
  const svcRes = await fetch(svcUrl);
  const svcRaw = await svcRes.text();
  const svcData = JSON.parse(svcRaw);

  console.log('GET', svcUrl);
  console.log('servicos status', svcRes.status, 'qtd', svcData.servicos?.length ?? 0);
  console.log('OK — Login → Tela de Serviços validado');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
