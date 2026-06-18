import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CampoPlacaVeiculo } from '../servico/CampoPlacaVeiculo';
import { FadeInView } from '../ui/FadeInView';
import { IconAppButton } from '../ui/IconAppButton';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, radius, shadow, spacing } from '../../lib/ui/theme';
import { obterPlacaServico, servicoSomenteLeitura } from '../../lib/servico';

type Props = {
  servico: any;
  onEnviarPlaca: (placa: string) => Promise<boolean>;
  onAbrirChecklist: () => void;
  onAbrirRota: () => void;
  onAbrirRotaTela: () => void;
  onAbrirMensagens: () => void;
  onStatus: (status: string) => void;
  somenteLeitura?: boolean;
};

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

export function ServicoDetalheContent({
  servico,
  onEnviarPlaca,
  onAbrirChecklist,
  onAbrirRota,
  onAbrirRotaTela,
  onAbrirMensagens,
  onStatus,
  somenteLeitura = false,
}: Props) {
  const bloqueado = somenteLeitura || servicoSomenteLeitura(servico);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <FadeInView>
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.protocolo}>{servico.protocolo || '—'}</Text>
              <Text style={styles.cliente}>{servico.seguradora || servico.beneficiario || 'Cliente'}</Text>
              <Text style={styles.tipo}>{servico.tipo || '—'}</Text>
            </View>
            <StatusBadge status={servico.status} />
          </View>
        </View>
      </FadeInView>

      <FadeInView delay={60}>
        <View style={styles.grid}>
          <InfoCard label="Placa" value={obterPlacaServico(servico)} />
          <InfoCard label="Combustível" value={servico.combustivel || servico.tipo_combustivel || '—'} />
          <InfoCard label="Solicitante" value={servico.solicitante || '—'} />
          <InfoCard label="Telefone" value={servico.telefone_cliente || servico.telefone || '—'} />
        </View>
      </FadeInView>

      <FadeInView delay={100}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Rota</Text>
          <Text style={styles.routeLabel}>Origem</Text>
          <Text style={styles.routeValue}>{servico.origem || '—'}</Text>
          <Text style={[styles.routeLabel, { marginTop: 12 }]}>Destino</Text>
          <Text style={styles.routeValue}>{servico.destino || '—'}</Text>
          {servico.problema ? (
            <>
              <Text style={[styles.routeLabel, { marginTop: 12 }]}>Problema</Text>
              <Text style={styles.routeValue}>{servico.problema}</Text>
            </>
          ) : null}
        </View>
      </FadeInView>

      {servico.observacao ? (
        <FadeInView delay={140}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Observações</Text>
            <Text style={styles.obsTexto}>{servico.observacao}</Text>
          </View>
        </FadeInView>
      ) : null}

      <FadeInView delay={180}>
        <CampoPlacaVeiculo
          servicoId={String(servico.id)}
          placaSalvaServidor={obterPlacaServico(servico)}
          bloqueado={bloqueado}
          onEnviar={onEnviarPlaca}
        />
      </FadeInView>

      <FadeInView delay={220}>
        <Text style={styles.acoesTitulo}>Ações principais</Text>
        <IconAppButton label="Abrir rota no mapa" icon="map-outline" onPress={onAbrirRotaTela} variant="navy" />
        <IconAppButton label="Abrir checklist" icon="clipboard-outline" onPress={onAbrirChecklist} variant="navy" style={styles.btnGap} />
        <IconAppButton label="Falar com a Central" icon="chatbubbles-outline" onPress={onAbrirMensagens} variant="navy" style={styles.btnGap} />
        {!somenteLeitura ? (
          <IconAppButton label="Google Maps" icon="navigate-outline" onPress={onAbrirRota} variant="navy" style={styles.btnGap} />
        ) : null}
      </FadeInView>

      {!somenteLeitura ? (
      <FadeInView delay={260}>
        <Text style={styles.acoesTitulo}>Status operacional</Text>
        <IconAppButton label="Aceitar" icon="checkmark-circle-outline" onPress={() => onStatus('aceito')} variant="navy" />
        <IconAppButton label="Recusar" icon="close-circle-outline" onPress={() => onStatus('recusado')} variant="danger" style={styles.btnGap} />
        <IconAppButton label="A caminho" icon="car-sport-outline" onPress={() => onStatus('a caminho')} variant="navy" style={styles.btnGap} />
        <IconAppButton label="No local" icon="location-outline" onPress={() => onStatus('na origem')} variant="navy" style={styles.btnGap} />
        <IconAppButton label="Transportando" icon="swap-horizontal-outline" onPress={() => onStatus('em transporte')} variant="navy" style={styles.btnGap} />
        <IconAppButton label="Finalizar" icon="flag-outline" onPress={() => onStatus('finalizado')} variant="navy" style={styles.btnGap} />
      </FadeInView>
      ) : (
        <FadeInView delay={260}>
          <View style={styles.somenteLeituraBox}>
            <Text style={styles.somenteLeituraTxt}>
              Serviço encerrado — modo visualização. Alterações de status e placa não estão disponíveis.
            </Text>
          </View>
        </FadeInView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },
  headerCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  protocolo: { fontSize: 22, fontWeight: '900', color: '#fff' },
  cliente: { fontSize: 15, color: 'rgba(255,255,255,0.9)', marginTop: 6, fontWeight: '600' },
  tipo: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.md },
  infoCard: {
    width: '48%',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  infoLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '700', color: colors.navy, marginTop: 4 },
  sectionCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.navy, marginBottom: 10 },
  routeLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  routeValue: { fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 20 },
  obsTexto: { fontSize: 14, color: colors.textSoft, lineHeight: 21 },
  acoesTitulo: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },
  btnGap: { marginTop: 8 },
  somenteLeituraBox: {
    backgroundColor: colors.borderLight,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  somenteLeituraTxt: {
    fontSize: 14,
    color: colors.textSoft,
    lineHeight: 20,
    fontWeight: '600',
  },
});
