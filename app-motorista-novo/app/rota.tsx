import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { IconAppButton } from '../components/ui/IconAppButton';
import { FadeInView } from '../components/ui/FadeInView';
import { useMotorista } from '../context/MotoristaContext';
import { colors, radius, shadow, spacing } from '../lib/ui/theme';

export default function RotaScreen() {
  const params = useLocalSearchParams<{ servico_id?: string }>();
  const { obterServicoPorId, abrirRotaWaze, abrirRota } = useMotorista();

  const servico =
    obterServicoPorId(String(params.servico_id || '')) ||
  null;

  if (!servico) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.orange} />
        <Text style={styles.msg}>Carregando rota...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapArea}>
        <Ionicons name="map" size={80} color={colors.royal} style={{ opacity: 0.3 }} />
        <Text style={styles.mapTitle}>Rota do serviço</Text>
        <Text style={styles.protocolo}>{servico.protocolo}</Text>
      </View>

      <FadeInView style={styles.panel}>
        <View style={styles.card}>
          <Text style={styles.label}>Origem</Text>
          <Text style={styles.value}>{servico.origem || '—'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Destino</Text>
          <Text style={styles.value}>{servico.destino || '—'}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.meta}>
            <Text style={styles.metaLabel}>Distância</Text>
            <Text style={styles.metaValue}>Calcular no Waze</Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaLabel}>Tempo</Text>
            <Text style={styles.metaValue}>Calcular no Waze</Text>
          </View>
        </View>

        <IconAppButton label="Abrir Waze" icon="navigate" onPress={() => abrirRotaWaze(servico)} variant="orange" />
        <IconAppButton
          label="Abrir Google Maps"
          icon="map-outline"
          onPress={() => abrirRota(servico)}
          variant="primary"
          style={{ marginTop: 8 }}
        />
      </FadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navyDark },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  msg: { marginTop: 10, color: colors.textMuted },
  mapArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E2A55',
  },
  mapTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 12 },
  protocolo: { color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  panel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: 32,
    ...shadow,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  value: { fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 20 },
  metaRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  meta: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  metaValue: { fontSize: 14, fontWeight: '800', color: colors.navy, marginTop: 4 },
});
