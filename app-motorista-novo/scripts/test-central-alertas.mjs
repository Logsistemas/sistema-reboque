/** Teste alertas operacionais Central */
const API = (process.env.EXPO_PUBLIC_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');

async function main() {
  const login = await fetch(`${API}/api/app/motorista/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'Teste', senha: '123', placa: 'ABC1234' }),
  });
  const lj = await login.json();
  const mid = lj.motorista.id;
  const sv = await fetch(`${API}/api/app/motorista/${mid}/servicos`);
  const sj = await sv.json();
  const sid = sj.servicos?.[0]?.id;

  console.log('alertas antes', await (await fetch(`${API}/api/central/alertas`)).json());

  await fetch(`${API}/api/servicos/${sid}/mobile/mensagens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      remetente_tipo: 'motorista',
      remetente_id: mid,
      remetente_nome: lj.motorista.nome,
      mensagem: 'Teste alerta operacional',
    }),
  });

  await fetch(`${API}/api/app/servicos/${sid}/placa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placa_veiculo: 'ABC1D23' }),
  });

  const alertas = await (await fetch(`${API}/api/central/alertas`)).json();
  console.log('alertas depois', alertas);

  const loc = await (await fetch(`${API}/api/servicos/${sid}/localizacao-motorista`)).json();
  console.log('localizacao', loc.ok, loc.distancia_texto, loc.motorista?.nome);

  const maps = await (await fetch(`${API}/api/central/config/maps`)).json();
  console.log('maps config', maps.configurado);

  console.log('OK', sid);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
