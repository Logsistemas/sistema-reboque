import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { API_BASE, debugLog } from '../config/api';

export const PUSH_SOUND = 'ambulance_siren.wav';
export const PUSH_CHANNEL_ID = 'novo_servico';
/** Duração máxima do .wav de sirene (limite iOS para som de notificação: 30s; operação: 20s). */
export const PUSH_SOUND_MAX_SECONDS = 20;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function configurarCanalAndroid() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Novos serviços — Essência Logística',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [
      0, 500, 200, 500, 200, 500, 200, 700, 200, 700, 200, 900, 200, 900, 200, 1100,
    ],
    sound: PUSH_SOUND,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    enableVibrate: true,
  });
}

function getExpoProjectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  );
}

export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

export async function solicitarPermissaoPush(): Promise<boolean> {
  if (!Device.isDevice) {
    console.warn('[PUSH] simulador/emulador — push token indisponível');
    return false;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return status === 'granted';
}

export async function obterPushToken(): Promise<string | null> {
  const projectId = getExpoProjectId();
  console.log('[PUSH] appOwnership:', Constants.appOwnership ?? '(desconhecido)');
  console.log('[PUSH] expoGo:', isExpoGo());
  console.log('[PUSH] projectId:', projectId ?? '(AUSENTE — rode: npx eas init)');

  if (!projectId) {
    console.warn('[PUSH] EAS projectId ausente — getExpoPushTokenAsync não funciona sem projeto Expo real');
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data || null;
    console.log('PUSH TOKEN:', token);
    return token;
  } catch (err) {
    console.error('[PUSH] getExpoPushTokenAsync falhou:', err);
    return null;
  }
}

export async function enviarPushTokenBackend(
  motoristaId: string,
  pushToken: string
): Promise<boolean> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const url = `${API_BASE}/api/app/motorista/push-token`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      motorista_id: motoristaId,
      push_token: pushToken,
      platform,
    }),
  });

  const data = await response.json();
  console.log('[PUSH] POST push-token status', response.status, data);
  debugLog('push', 'POST push-token', response.status, data);
  return !!data.ok;
}

export type RegistroPushResult = {
  ok: boolean;
  permissaoNegada?: boolean;
  semToken?: boolean;
  token?: string | null;
};

export async function registrarPushMotorista(motoristaId: string): Promise<RegistroPushResult> {
  try {
    await configurarCanalAndroid();

    const granted = await solicitarPermissaoPush();
    if (!granted) {
      console.warn('[PUSH] permissão de notificação negada');
      return { ok: false, permissaoNegada: true };
    }

    const token = await obterPushToken();
    if (!token) {
      return { ok: false, semToken: true, token: null };
    }

    const salvo = await enviarPushTokenBackend(motoristaId, token);
    if (salvo) {
      console.log('[PUSH] token salvo no backend para motorista', motoristaId);
    } else {
      console.error('[PUSH] falha ao salvar token no backend');
    }
    return { ok: salvo, token };
  } catch (err) {
    console.error('[PUSH] erro registrar:', err);
    debugLog('push', 'erro registrar', err);
    return { ok: false, semToken: true };
  }
}

export function abrirServicoDaNotificacao(
  data: Record<string, unknown> | undefined,
  onAbrir: (servicoId: string) => void
) {
  if (!data || data.type !== 'novo_servico') return;
  const servicoId = String(data.servico_id || '');
  if (!servicoId) return;
  onAbrir(servicoId);
}

export function abrirMensagensDaNotificacao(
  data: Record<string, unknown> | undefined,
  onAbrirMensagens: (servicoId: string) => void
) {
  if (!data || data.type !== 'mobile_message') return;
  const servicoId = String(data.servico_id || '');
  if (!servicoId) return;
  onAbrirMensagens(servicoId);
}

export function processarNotificacaoTap(
  data: Record<string, unknown> | undefined,
  onAbrirServico: (servicoId: string) => void,
  onAbrirMensagens: (servicoId: string) => void
) {
  if (!data) return;
  if (data.type === 'mobile_message') {
    abrirMensagensDaNotificacao(data, onAbrirMensagens);
    return;
  }
  abrirServicoDaNotificacao(data, onAbrirServico);
}
