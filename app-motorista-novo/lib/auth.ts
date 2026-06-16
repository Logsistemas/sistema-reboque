import AsyncStorage from '@react-native-async-storage/async-storage';

import { debugLog } from '../config/api';

export const SESSION_KEY = '@essencia_motorista_sessao';

export type MotoristaSessao = {
  id: string;
  nome?: string;
  placa_atual?: string;
  veiculo?: string;
  online?: boolean;
};

type LoginPayload = {
  ok?: boolean;
  erro?: string;
  motorista?: MotoristaSessao | null;
};

export type LoginParseResult =
  | { ok: true; motorista: MotoristaSessao; raw: string }
  | { ok: false; erro: string; raw: string; status: number };

export function parseLoginResponse(raw: string, status: number): LoginParseResult {
  let parsed: unknown;

  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return {
      ok: false,
      erro: `Resposta inválida do servidor (HTTP ${status})`,
      raw,
      status,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      erro: `Resposta vazia do servidor (HTTP ${status})`,
      raw,
      status,
    };
  }

  const data = parsed as LoginPayload;

  if (data.ok !== true) {
    return {
      ok: false,
      erro: data.erro || 'Login inválido',
      raw,
      status,
    };
  }

  const motorista = data.motorista;
  if (!motorista?.id) {
    return {
      ok: false,
      erro: 'Servidor não retornou motorista.id',
      raw,
      status,
    };
  }

  return { ok: true, motorista, raw };
}

export async function saveMotoristaSession(motorista: MotoristaSessao) {
  const json = JSON.stringify(motorista);
  await AsyncStorage.setItem(SESSION_KEY, json);
  debugLog('session', 'AsyncStorage SET', SESSION_KEY, motorista);
}

export async function loadMotoristaSession(): Promise<MotoristaSessao | null> {
  const json = await AsyncStorage.getItem(SESSION_KEY);
  debugLog('session', 'AsyncStorage GET', SESSION_KEY, json ?? '(vazio)');
  if (!json) return null;

  try {
    const motorista = JSON.parse(json) as MotoristaSessao;
    if (!motorista?.id) return null;
    return motorista;
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function clearMotoristaSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
  debugLog('session', 'AsyncStorage REMOVE', SESSION_KEY);
}
