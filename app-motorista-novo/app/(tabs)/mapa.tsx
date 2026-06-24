import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconAppButton } from '../../components/ui/IconAppButton';
import { FadeInView } from '../../components/ui/FadeInView';
import { useMotorista } from '../../context/MotoristaContext';
import { servicoFinalizado } from '../../lib/servico';
import { colors, radius, shadow, spacing } from '../../lib/ui/theme';

export default function MapaScreen() {
  const insets = useSafeAreaInsets();
  const { logado, restaurandoSessao, servicos, abrirRotaWaze, abrirRota } = useMotorista();

  const servicoAtivo = useMemo(
    () => servicos.find((s) => !servicoFinalizado(s)) || servicos[0],
    [servicos]
  );

  if (restaurandoSessao) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.orange} />
      </View>
    );
  }

  if (!logado) {
    return (
      <View style={styles.loading}>
        <Text style={styles.msg}>Faça login na aba Serviços.</Text>
      </View>
    );
  }

  if (!servicoAtivo) {
    return (
      <View style={[styles.container, styles.loading]}>
        <Ionicons name="map-outline" size={48} color={colors.textMuted} />
        <Text style={styles.msg}>Nenhum serviço ativo para exibir rota.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.mapArea}>
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map" size={72} color={colors.royal} style={{ opacity: 0.35 }} />
          <Text style={styles.mapLabel}>Visualização de rota</Text>
          <Text style={styles.mapSub}>
            {servicoAtivo.protocolo || 'Serviço ativo'}
          </Text>
        </View>
      </View>

      <FadeInView style={styles.floatWrap}>
        <View style={styles.floatCard}>
          <Text style={styles.floatTitle}>Origem</Text>
          <Text style={styles.floatValue}>{servicoAtivo.origem || '—'}</Text>
        </View>

        <View style={styles.floatCard}>
          <Text style={styles.floatTitle}>Destino</Text>
          <Text style={styles.floatValue}>{servicoAtivo.destino || '—'}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Ionicons name="speedometer-outline" size={18} color={colors.royal} />
            <Text style={styles.metaTxt}>Distância estimada</Text>
            <Text style={styles.metaVal}>Via Waze</Text>
          </View>
          <View style={styles.metaBox}>
            <Ionicons name="time-outline" size={18} color={colors.orange} />
            <Text style={styles.metaTxt}>Tempo estimado</Text>
            <Text style={styles.metaVal}>Ao abrir app</Text>
          </View>
        </View>

        <IconAppButton
          label="Abrir Waze"
          icon="navigate"
          onPress={() => abrirRotaWaze(servicoAtivo)}
          variant="waze"
        />

        <IconAppButton
          label="Abrir Google Maps"
          icon="map-outline"
          onPress={() => abrirRota(servicoAtivo)}
          variant="navy"
          style={{ marginTop: 8 }}
        />

        <IconAppButton
          label="Ver detalhes do serviço"
          icon="information-circle-outline"
          onPress={() => router.push(`/servico/${servicoAtivo.id}` as any)}
          variant="navy"
          style={{ marginTop: 8 }}
        />
      </FadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navyDark },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  msg: { color: colors.textMuted, fontWeight: '600', marginTop: 10, textAlign: 'center', paddingHorizontal: 24 },
  mapArea: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E2A55',
  },
  mapLabel: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 12 },
  mapSub: { color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  floatWrap: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: 100,
    ...shadow,
  },
  floatCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  floatTitle: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  floatValue: { fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 20 },
  metaRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metaBox: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaTxt: { fontSize: 11, color: colors.textMuted, marginTop: 4, fontWeight: '600' },
  metaVal: { fontSize: 14, fontWeight: '800', color: colors.navy, marginTop: 2 },
});
