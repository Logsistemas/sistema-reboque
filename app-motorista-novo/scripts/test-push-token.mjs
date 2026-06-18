/**
 * Testa cadeia push no backend (Motorista Teste).
 * Uso:
 *   node scripts/test-push-token.mjs           # salva token fake
 *   node scripts/test-push-token.mjs --status   # consulta push-status
 *   node scripts/test-push-token.mjs --test     # dispara push-test (precisa token real no banco)
 */
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const args = new Set(process.argv.slice(2));

async function login() {
  const res = await fetch(`${API_BASE}/api/app/motorista/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'Teste', senha: '123', placa: 'ABC1234' }),
  });
  const data = JSON.parse(await res.text());
  if (!data.ok) throw new Error(data.erro || 'login falhou');
  return data.motorista;
}

async function main() {
  const mot = await login();
  console.log('Motorista:', mot.nome, mot.id);

  if (args.has('--status')) {
    const res = await fetch(`${API_BASE}/api/app/motorista/${mot.id}/push-status`);
    const data = await res.json();
    console.log('GET push-status', res.status, data);
    return;
  }

  if (args.has('--test')) {
    const res = await fetch(`${API_BASE}/api/app/motorista/${mot.id}/push-test`, { method: 'POST' });
    const data = await res.json();
    console.log('POST push-test', res.status, data);
    console.log('Verifique logs [PUSH] no terminal do backend');
    return;
  }

  const fakeToken = 'ExponentPushToken[test-token-historico-push]';
  const res = await fetch(`${API_BASE}/api/app/motorista/push-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      motorista_id: mot.id,
      push_token: fakeToken,
      platform: 'ios',
    }),
  });

  const data = await res.json();
  console.log('POST push-token', res.status, data);

  if (!data.ok) {
    process.exit(1);
  }

  console.log('OK — endpoint push-token funcionando');
  console.log('Para teste real: faça login no iPhone e rode: node scripts/test-push-token.mjs --test');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
