/** Teste chat mobile — Motorista Teste */
const API = (process.env.EXPO_PUBLIC_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');

async function main() {
  const login = await fetch(`${API}/api/app/motorista/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'Teste', senha: '123', placa: 'ABC1234' }),
  });
  const lj = await login.json();
  if (!lj.ok) throw new Error(lj.erro || 'login');
  const mid = lj.motorista.id;
  const nome = lj.motorista.nome;

  const sv = await fetch(`${API}/api/app/motorista/${mid}/servicos`);
  const sj = await sv.json();
  const sid = sj.servicos?.[0]?.id;
  if (!sid) throw new Error('sem servico');

  const c1 = await fetch(`${API}/api/servicos/${sid}/mobile/mensagens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      remetente_tipo: 'central',
      remetente_id: 'central',
      remetente_nome: 'Central / Operação',
      mensagem: 'Bom dia, confirme se está a caminho.',
    }),
  });
  console.log('C1 central', c1.status, await c1.json());

  const c2 = await fetch(`${API}/api/servicos/${sid}/mobile/mensagens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      remetente_tipo: 'motorista',
      remetente_id: mid,
      remetente_nome: nome,
      mensagem: 'Bom dia, estou indo.',
    }),
  });
  console.log('C2 motorista', c2.status, await c2.json());

  const list = await fetch(`${API}/api/servicos/${sid}/mobile/mensagens`);
  console.log('LIST', await list.json());

  const unread = await fetch(`${API}/api/servicos/${sid}/mobile/unread?leitor=central`);
  console.log('UNREAD', await unread.json());

  const summary = await fetch(`${API}/api/central/mobile/unread-summary`);
  console.log('SUMMARY', await summary.json());

  console.log('OK servico', sid);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
