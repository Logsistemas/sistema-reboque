export const PLACA_CLIENTE_RE = /^[A-Z]{3}(\d{4}|\d[A-Z]\d{2})$/;

export function formatarPlaca(texto: string) {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

export function placaValida(placa: string) {
  return PLACA_CLIENTE_RE.test(formatarPlaca(placa));
}

export function obterPlacaServico(servico: any) {
  return formatarPlaca(
    String(servico?.placa_veiculo_removido || servico?.placa_removida || '')
  );
}

export function servicoFinalizado(servico: any) {
  const s = String(servico?.status || '').toLowerCase();
  return s === 'finalizado' || s === 'concluido' || s === 'concluído';
}

export function servicoRecusado(servico: any) {
  const s = String(servico?.status || '').toLowerCase();
  return s === 'recusado' || s === 'cancelado';
}

export function servicoSomenteLeitura(servico: any) {
  return servicoFinalizado(servico) || servicoRecusado(servico);
}

export function servicoEmAndamento(servico: any) {
  const s = String(servico?.status || '').toLowerCase();
  return (
    !!s &&
    s !== 'finalizado' &&
    s !== 'concluido' &&
    s !== 'concluído' &&
    s !== 'recusado' &&
    s !== 'cancelado' &&
    s !== 'novo'
  );
}

export function formatarDataServico(servico: any) {
  const raw =
    servico?.finalizado_em ||
    servico?.atualizado_em ||
    servico?.created_at ||
    servico?.criado_em;
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function saudacaoDia() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
