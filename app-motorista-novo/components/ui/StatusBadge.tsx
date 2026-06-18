import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../../lib/ui/theme';

function estiloStatus(status: string) {
  const s = String(status || '').toLowerCase();

  if (s === 'finalizado' || s === 'concluido' || s === 'concluído') {
    return {
      bg: colors.badgeFinalizadoBg,
      text: colors.badgeFinalizadoText,
      border: '#BBF7D0',
    };
  }

  if (s === 'recusado' || s === 'cancelado') {
    return {
      bg: colors.badgeRecusadoBg,
      text: colors.badgeRecusadoText,
      border: '#FECACA',
    };
  }

  if (s === 'aceito') {
    return {
      bg: colors.badgeAceitoBg,
      text: colors.badgeAceitoText,
      border: '#BFDBFE',
    };
  }

  if (s.includes('transporte') || s.includes('caminho') || s.includes('origem')) {
    return {
      bg: colors.badgeOperacaoBg,
      text: colors.badgeOperacaoText,
      border: '#C7D2E3',
    };
  }

  return {
    bg: colors.badgePendenteBg,
    text: colors.badgePendenteText,
    border: colors.border,
  };
}

export function StatusBadge({ status }: { status?: string }) {
  const label = (status || 'pendente').toUpperCase();
  const estilo = estiloStatus(status || '');

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: estilo.bg,
          borderColor: estilo.border,
        },
      ]}
    >
      <Text style={[styles.text, { color: estilo.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
