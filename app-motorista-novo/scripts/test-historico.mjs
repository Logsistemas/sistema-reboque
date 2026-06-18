/**
 * Valida endpoint de histórico do motorista (Motorista Teste).
 * Uso: node scripts/test-historico.mjs
 */
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');

function parseLoginResponse(raw, status) {
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, erro: `JSON inválido (HTTP ${status})` };
  }
  if (!parsed?.ok || !parsed.motorista?.id) {
    return { ok: false, erro: parsed?.erro || 'Login inválido' };
  }
  return { ok: true, motorista: parsed.motorista };
}

async function main() {
  const payload = { login: 'Teste', senha: '123', placa: 'ABC1234' };
  const loginRes = await fetch(`${API_BASE}/api/app/motorista/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const loginRaw = await loginRes.text();
  const login = parseLoginResponse(loginRaw, loginRes.status);
  if (!login.ok) {
    console.error('FALHA login:', login.erro);
    process.exit(1);
  }

  const mid = login.motorista.id;
  console.log('Motorista:', login.motorista.nome, mid);

  const [ativosRes, historicoRes] = await Promise.all([
    fetch(`${API_BASE}/api/app/motorista/${mid}/servicos`),
    fetch(`${API_BASE}/api/app/motorista/${mid}/historico`),
  ]);

  const ativos = await ativosRes.json();
  const historico = await historicoRes.json();

  const listaAtivos = ativos.servicos || [];
  const listaHistorico = historico.servicos || [];

  const finalizados = listaHistorico.filter((s) =>
    String(s.status || '').toLowerCase().includes('finaliz')
  );
  const recusados = listaHistorico.filter((s) => {
    const st = String(s.status || '').toLowerCase();
    return st === 'recusado' || st === 'cancelado';
  });

  console.log('GET /servicos (ativos):', listaAtivos.length);
  console.log('GET /historico (todos):', listaHistorico.length);
  console.log('  finalizados no histórico:', finalizados.length);
  console.log('  recusados no histórico:', recusados.length);

  const ativosComFinalizado = listaAtivos.filter((s) =>
    String(s.status || '').toLowerCase().includes('finaliz')
  );

  if (ativosComFinalizado.length > 0) {
    console.error('FALHA: /servicos retornou finalizados:', ativosComFinalizado.length);
    process.exit(1);
  }

  if (listaHistorico.length < listaAtivos.length) {
    console.error('FALHA: histórico menor que ativos');
    process.exit(1);
  }

  if (finalizados.length === 0 && recusados.length === 0) {
    console.warn('AVISO: nenhum finalizado/recusado no banco para este motorista');
  } else {
    console.log('OK — histórico inclui encerrados');
    if (finalizados[0]) {
      console.log('  exemplo finalizado:', finalizados[0].protocolo, finalizados[0].status);
    }
    if (recusados[0]) {
      console.log('  exemplo recusado:', recusados[0].protocolo, recusados[0].status);
    }
  }

  console.log('OK — aba Serviços continua só com ativos');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
