import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ServicoDetalheContent } from '../../components/servico/ServicoDetalheContent';
import { useMotorista } from '../../context/MotoristaContext';
import { servicoSomenteLeitura } from '../../lib/servico';
import { colors } from '../../lib/ui/theme';

export default function ServicoDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    obterServicoPorId,
    enviarPlacaServico,
    abrirChecklist,
    atualizarStatus,
  } = useMotorista();

  const servico = obterServicoPorId(String(id || ''));

  if (!servico) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.orange} />
        <Text style={styles.msg}>Serviço não encontrado ou já finalizado.</Text>
      </View>
    );
  }

  return (
    <ServicoDetalheContent
      servico={servico}
      somenteLeitura={servicoSomenteLeitura(servico)}
      onEnviarPlaca={(placa) => enviarPlacaServico(String(servico.id), placa)}
      onAbrirChecklist={() => abrirChecklist(servico)}
      onAbrirMensagens={() => {
        router.push({
          pathname: '/mensagens/[servico_id]',
          params: { servico_id: servico.id },
        } as any);
      }}
      onStatus={(status) => atualizarStatus(String(servico.id), status)}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 24,
  },
  msg: { marginTop: 12, color: colors.textMuted, textAlign: 'center', fontWeight: '600' },
});
