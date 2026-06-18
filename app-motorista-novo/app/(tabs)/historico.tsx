import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ServicoCardCompact } from '../../components/home/ServicoCardCompact';
import { FadeInView } from '../../components/ui/FadeInView';
import { useMotorista } from '../../context/MotoristaContext';
import {
  servicoEmAndamento,
  servicoFinalizado,
  servicoRecusado,
} from '../../lib/servico';
import { colors, radius, spacing } from '../../lib/ui/theme';

type Filtro = 'todos' | 'andamento' | 'concluidos' | 'recusados';

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'andamento', label: 'Em andamento' },
  { id: 'concluidos', label: 'Concluídos' },
  { id: 'recusados', label: 'Recusados' },
];

export default function HistoricoScreen() {
  const insets = useSafeAreaInsets();
  const {
    logado,
    restaurandoSessao,
    motorista,
    historicoServicos,
    carregandoHistorico,
    carregarHistorico,
    abrirDetalhe,
  } = useMotorista();
  const [filtro, setFiltro] = useState<Filtro>('todos');

  useFocusEffect(
    useCallback(() => {
      if (motorista?.id) {
        void carregarHistorico(motorista.id);
      }
    }, [motorista?.id, carregarHistorico])
  );

  const lista = useMemo(() => {
    if (filtro === 'andamento') return historicoServicos.filter((s) => servicoEmAndamento(s));
    if (filtro === 'concluidos') return historicoServicos.filter((s) => servicoFinalizado(s));
    if (filtro === 'recusados') return historicoServicos.filter((s) => servicoRecusado(s));
    return historicoServicos;
  }, [historicoServicos, filtro]);

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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
    >
      <Text style={styles.titulo}>Histórico</Text>
      <Text style={styles.sub}>Filtre seus serviços por status</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtros}>
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filtroBtn, filtro === f.id && styles.filtroAtivo]}
            onPress={() => setFiltro(f.id)}
          >
            <Text style={[styles.filtroTxt, filtro === f.id && styles.filtroTxtAtivo]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {carregandoHistorico && historicoServicos.length === 0 ? (
        <View style={styles.loadingInline}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : lista.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTxt}>Nenhum serviço neste filtro.</Text>
        </View>
      ) : (
        lista.map((servico, idx) => (
          <FadeInView key={servico.id} delay={idx * 30}>
            <ServicoCardCompact
              servico={servico}
              onPress={() => abrirDetalhe(servico)}
              exibirDataHora
              modoVisualizacao
            />
          </FadeInView>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  msg: { color: colors.textMuted, fontWeight: '600' },
  titulo: { fontSize: 26, fontWeight: '900', color: colors.navy },
  sub: { color: colors.textMuted, marginBottom: spacing.md },
  filtros: { marginBottom: spacing.md },
  filtroBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  filtroAtivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  filtroTxt: { fontWeight: '700', color: colors.textMuted, fontSize: 13 },
  filtroTxtAtivo: { color: '#fff' },
  empty: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTxt: { marginTop: 10, color: colors.textMuted, fontWeight: '600' },
  loadingInline: { paddingVertical: 40, alignItems: 'center' },
});
