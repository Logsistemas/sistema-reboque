import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { StatusBadge } from '../ui/StatusBadge';
import { colors, radius, shadow, spacing } from '../../lib/ui/theme';
import { obterPlacaServico, formatarDataServico } from '../../lib/servico';

type Props = {
  servico: any;
  onPress: () => void;
  exibirDataHora?: boolean;
  modoVisualizacao?: boolean;
};

export function ServicoCardCompact({
  servico,
  onPress,
  exibirDataHora = false,
  modoVisualizacao = false,
}: Props) {
  const [obsAberta, setObsAberta] = useState(false);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.protocolo}>{servico.protocolo || 'Sem protocolo'}</Text>
          <Text style={styles.tipo}>{servico.tipo || 'Tipo não informado'}</Text>
        </View>
        <StatusBadge status={servico.status} />
      </View>

      <View style={styles.row}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
        <Text style={styles.rowText}>{servico.seguradora || '—'}</Text>
      </View>

      <View style={styles.row}>
        <Ionicons name="navigate-outline" size={16} color={colors.orange} />
        <Text style={styles.rowText} numberOfLines={2}>{servico.origem || '—'}</Text>
      </View>

      <View style={styles.row}>
        <Ionicons name="flag-outline" size={16} color={colors.royal} />
        <Text style={styles.rowText} numberOfLines={2}>{servico.destino || '—'}</Text>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.meta}>Placa: {obterPlacaServico(servico) || '—'}</Text>
        {exibirDataHora ? (
          <Text style={styles.meta}>Data: {formatarDataServico(servico)}</Text>
        ) : null}
        {servico.problema ? (
          <Text style={styles.metaProblema} numberOfLines={1}>{servico.problema}</Text>
        ) : null}
      </View>

      {servico.observacao ? (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            setObsAberta((v) => !v);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.obsToggle}>
            {obsAberta ? '▼ Ocultar observações' : '▶ Ver observações'}
          </Text>
          {obsAberta ? <Text style={styles.obsTexto}>{servico.observacao}</Text> : null}
        </TouchableOpacity>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {modoVisualizacao ? 'Toque para visualizar detalhes' : 'Toque para ver detalhes e ações'}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.royal} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  headerLeft: { flex: 1 },
  protocolo: { fontSize: 17, fontWeight: '900', color: colors.navy },
  tipo: { fontSize: 13, color: colors.textSoft, marginTop: 4, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  rowText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  metaRow: { marginTop: 4, marginBottom: 4 },
  meta: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  metaProblema: { fontSize: 12, color: colors.warningText, marginTop: 4, fontWeight: '600' },
  obsToggle: { color: colors.royal, fontWeight: '800', fontSize: 12, marginTop: 6 },
  obsTexto: { color: colors.textSoft, marginTop: 6, fontSize: 13, lineHeight: 18 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  footerText: { fontSize: 12, fontWeight: '700', color: colors.royal },
});
