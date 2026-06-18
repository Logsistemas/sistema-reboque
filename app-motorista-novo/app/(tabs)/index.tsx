import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ServicoCardCompact } from '../../components/home/ServicoCardCompact';
import { LoginPremium } from '../../components/home/LoginPremium';
import { AppButton } from '../../components/ui/AppButton';
import { FadeInView } from '../../components/ui/FadeInView';
import { StatPill } from '../../components/ui/StatPill';
import { useMotorista } from '../../context/MotoristaContext';
import { saudacaoDia } from '../../lib/servico';
import { colors, radius, shadow, spacing } from '../../lib/ui/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const {
    logado,
    restaurandoSessao,
    motorista,
    servicos,
    carregarServicos,
    abrirDetalhe,
    resumoDia,
    login,
    senha,
    placa,
    entrando,
    setLogin,
    setSenha,
    setPlaca,
    entrar,
    pushPermissaoNegada,
  } = useMotorista();

  if (restaurandoSessao) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.orange} />
        <Text style={styles.loadingText}>Carregando sessão...</Text>
      </View>
    );
  }

  if (!logado) {
    return (
      <LoginPremium
        login={login}
        senha={senha}
        placa={placa}
        entrando={entrando}
        onLoginChange={setLogin}
        onSenhaChange={setSenha}
        onPlacaChange={setPlaca}
        onEntrar={entrar}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
    >
      <FadeInView>
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color="#fff" />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.saudacao}>{saudacaoDia()},</Text>
              <Text style={styles.nome}>{motorista?.nome || 'Motorista'}</Text>
              <Text style={styles.placaReboque}>
                Reboque: {motorista?.placa_atual || '—'}
              </Text>
            </View>
            <View style={styles.notif}>
              <Ionicons name="notifications-outline" size={22} color="#fff" />
            </View>
          </View>
        </View>
      </FadeInView>

      {pushPermissaoNegada ? (
        <Text style={styles.avisoPush}>
          Ative notificações para receber novos serviços em tempo real.
        </Text>
      ) : null}

      <FadeInView delay={80}>
        <Text style={styles.sectionTitle}>Resumo do dia</Text>
        <View style={styles.statsRow}>
          <StatPill label="Recebidos" value={resumoDia.recebidos} accent={colors.royal} />
          <StatPill label="Em andamento" value={resumoDia.andamento} accent={colors.navy} />
          <StatPill label="Concluídos" value={resumoDia.concluidos} accent={colors.badgeFinalizadoText} />
        </View>
      </FadeInView>

      <FadeInView delay={120}>
        <AppButton
          label="Atualizar serviços"
          onPress={() => motorista?.id && carregarServicos(motorista.id)}
          variant="navy"
          style={styles.btnAtualizar}
        />
      </FadeInView>

      <FadeInView delay={160}>
        <Text style={styles.sectionTitle}>Serviços</Text>
      </FadeInView>

      {servicos.length === 0 ? (
        <FadeInView delay={200}>
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum serviço disponível no momento.</Text>
          </View>
        </FadeInView>
      ) : (
        servicos.map((servico, idx) => (
          <FadeInView key={servico.id} delay={180 + idx * 40}>
            <ServicoCardCompact
              servico={servico}
              onPress={() => abrirDetalhe(servico)}
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  loadingText: { marginTop: 12, color: colors.textMuted, fontWeight: '600' },
  headerCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadow,
  },
  avisoPush: {
    fontSize: 13,
    color: colors.textSoft,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    lineHeight: 18,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.royal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1 },
  saudacao: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  nome: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 },
  placaReboque: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 },
  notif: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.navy,
    marginBottom: 12,
  },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  btnAtualizar: { marginBottom: spacing.lg },
  emptyBox: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 15,
    marginTop: 10,
  },
});
