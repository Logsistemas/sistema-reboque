import { API_BASE, debugLog } from '../config/api';

export type MensagemMobile = {
  id: string;
  servico_id: string;
  remetente_tipo: 'central' | 'motorista' | string;
  remetente_id: string;
  remetente_nome: string;
  mensagem: string;
  lida_central: boolean;
  lida_motorista: boolean;
  created_at: string;
};

export async function listarMensagensMobile(servicoId: string): Promise<MensagemMobile[]> {
  const url = `${API_BASE}/api/servicos/${servicoId}/mobile/mensagens`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  debugLog('mobile', 'listar', res.status, data);
  if (!data.ok) return [];
  return data.mensagens || [];
}

export async function enviarMensagemMobile(
  servicoId: string,
  motoristaId: string,
  motoristaNome: string,
  texto: string
): Promise<boolean> {
  const msg = (texto || '').trim();
  if (!msg) return false;

  const url = `${API_BASE}/api/servicos/${servicoId}/mobile/mensagens`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      remetente_tipo: 'motorista',
      remetente_id: motoristaId,
      remetente_nome: motoristaNome,
      mensagem: msg,
    }),
  });
  const data = await res.json();
  debugLog('mobile', 'enviar', res.status, data);
  return !!data.ok;
}

export async function marcarMensagensLidasMobile(servicoId: string, leitor: 'central' | 'motorista') {
  const url = `${API_BASE}/api/servicos/${servicoId}/mobile/marcar-lidas`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leitor }),
  });
}

export async function contarNaoLidasMobile(servicoId: string, leitor: 'central' | 'motorista') {
  const url = `${API_BASE}/api/servicos/${servicoId}/mobile/unread?leitor=${leitor}`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  return data.ok ? Number(data.qtd || 0) : 0;
}
