import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { IconAppButton } from '../../components/ui/IconAppButton';
import { useMotorista } from '../../context/MotoristaContext';
import {
  enviarMensagemMobile,
  listarMensagensMobile,
  marcarMensagensLidasMobile,
  type MensagemMobile,
} from '../../lib/mensagens';
import { colors, radius, shadow, spacing } from '../../lib/ui/theme';

export default function MensagensServicoScreen() {
  const { servico_id } = useLocalSearchParams<{ servico_id: string }>();
  const { motorista, obterServicoPorId } = useMotorista();
  const sid = String(servico_id || '');
  const servico = obterServicoPorId(sid);

  const [mensagens, setMensagens] = useState<MensagemMobile[]>([]);
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const carregar = useCallback(async () => {
    if (!sid) return;
    const lista = await listarMensagensMobile(sid);
    setMensagens(lista);
    await marcarMensagensLidasMobile(sid, 'motorista');
    setCarregando(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [sid]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
      const timer = setInterval(() => void carregar(), 5000);
      return () => clearInterval(timer);
    }, [carregar])
  );

  async function enviar() {
    if (!motorista?.id || !texto.trim() || enviando) return;
    setEnviando(true);
    try {
      const ok = await enviarMensagemMobile(sid, motorista.id, motorista.nome || 'Motorista', texto);
      if (ok) {
        setTexto('');
        await carregar();
      }
    } finally {
      setEnviando(false);
    }
  }

  if (!servico) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.orange} />
        <Text style={styles.muted}>Serviço não encontrado.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <View style={styles.headerCard}>
        <Text style={styles.protocolo}>{servico.protocolo || '—'}</Text>
        <Text style={styles.sub}>{servico.tipo || 'Serviço'}</Text>
        <Text style={styles.sub}>Central / Operação</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {carregando ? (
          <ActivityIndicator color={colors.navy} style={{ marginTop: 24 }} />
        ) : mensagens.length === 0 ? (
          <Text style={styles.empty}>Nenhuma mensagem ainda. Envie uma mensagem para a Central.</Text>
        ) : (
          mensagens.map((m) => {
            const central = m.remetente_tipo === 'central';
            return (
              <View key={m.id} style={[styles.bubbleWrap, central ? styles.bubbleRight : styles.bubbleLeft]}>
                <Text style={styles.meta}>
                  {m.remetente_nome} · {m.created_at}
                </Text>
                <View style={[styles.bubble, central ? styles.bubbleCentral : styles.bubbleMotorista]}>
                  <Text style={[styles.bubbleText, central && styles.bubbleTextLight]}>{m.mensagem}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.compose}>
        <TextInput
          style={styles.input}
          value={texto}
          onChangeText={setTexto}
          placeholder="Digite sua mensagem…"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={1000}
        />
        <IconAppButton
          label="Enviar"
          icon="send"
          onPress={enviar}
          loading={enviando}
          disabled={!texto.trim()}
          style={styles.sendBtn}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  muted: { marginTop: 8, color: colors.textMuted },
  headerCard: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    ...shadow,
  },
  protocolo: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.85)', marginTop: 4, fontWeight: '600' },
  messages: { flex: 1 },
  messagesContent: { padding: spacing.md, paddingBottom: spacing.lg },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 32, fontWeight: '600' },
  bubbleWrap: { marginBottom: spacing.md, maxWidth: '85%' },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  meta: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
  bubble: { borderRadius: radius.md, padding: 12 },
  bubbleCentral: { backgroundColor: colors.royal },
  bubbleMotorista: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  bubbleText: { color: colors.text, lineHeight: 20 },
  bubbleTextLight: { color: '#fff' },
  compose: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#fff',
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: {
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  sendBtn: {
    alignSelf: 'stretch',
  },
});
