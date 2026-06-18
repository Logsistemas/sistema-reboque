import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';

import { useMotorista } from '../context/MotoristaContext';
import { processarNotificacaoTap } from '../lib/pushNotifications';

function navegarParaServico(servicoId: string) {
  router.replace('/(tabs)' as any);
  setTimeout(() => {
    router.push(`/servico/${servicoId}` as any);
  }, 120);
}

function navegarParaMensagens(servicoId: string) {
  router.replace('/(tabs)' as any);
  setTimeout(() => {
    router.push({
      pathname: '/mensagens/[servico_id]',
      params: { servico_id: servicoId },
    } as any);
  }, 120);
}

export function PushNotificationBootstrap() {
  const { logado, motorista, registrarPush } = useMotorista();

  useEffect(() => {
    if (!logado || !motorista?.id) return;
    void registrarPush();
  }, [logado, motorista?.id, registrarPush]);

  useEffect(() => {
    if (!logado || !motorista?.id) return;

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void registrarPush();
      }
    });

    return () => sub.remove();
  }, [logado, motorista?.id, registrarPush]);

  useEffect(() => {
    const subRecebida = Notifications.addNotificationReceivedListener((notif) => {
      console.log('[PUSH] recebida em foreground', notif.request.content.title);
    });

    const subResposta = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      processarNotificacaoTap(data, navegarParaServico, navegarParaMensagens);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      processarNotificacaoTap(data, navegarParaServico, navegarParaMensagens);
    });

    return () => {
      subRecebida.remove();
      subResposta.remove();
    };
  }, []);

  return null;
}
