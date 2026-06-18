import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiStatusBadge } from '../ui/ApiStatusBadge';
import { AppButton } from '../ui/AppButton';
import { FadeInView } from '../ui/FadeInView';
import { DEBUG_API, API_BASE } from '../../config/api';
import { colors, radius, spacing } from '../../lib/ui/theme';

type Props = {
  login: string;
  senha: string;
  placa: string;
  entrando: boolean;
  onLoginChange: (v: string) => void;
  onSenhaChange: (v: string) => void;
  onPlacaChange: (v: string) => void;
  onEntrar: () => void;
};

export function LoginPremium({
  login,
  senha,
  placa,
  entrando,
  onLoginChange,
  onSenhaChange,
  onPlacaChange,
  onEntrar,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🚛</Text>
        <Text style={styles.heroBgIcon}>🛻</Text>
        <View style={styles.heroOverlay} />
        <Text style={styles.heroBrand}>Essência Logística</Text>
        <Text style={styles.heroTag}>Operação de reboque premium</Text>
        <ApiStatusBadge />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <FadeInView>
            <View style={styles.glassCard}>
              <Text style={styles.cardTitle}>Área do Motorista</Text>
              <Text style={styles.cardSub}>Acesse sua operação com segurança</Text>

              <Text style={styles.label}>Login</Text>
              <TextInput
                style={styles.input}
                placeholder="Seu login"
                placeholderTextColor={colors.textMuted}
                value={login}
                onChangeText={onLoginChange}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Senha</Text>
              <TextInput
                style={styles.input}
                placeholder="Sua senha"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={senha}
                onChangeText={onSenhaChange}
              />

              <Text style={styles.label}>Placa do reboque</Text>
              <TextInput
                style={styles.input}
                placeholder="ABC1D23"
                placeholderTextColor={colors.textMuted}
                value={placa}
                onChangeText={onPlacaChange}
                autoCapitalize="characters"
              />

              {DEBUG_API ? (
                <Text style={styles.debugApi} selectable>
                  API: {API_BASE}
                </Text>
              ) : null}

              <AppButton
                label="Entrar"
                onPress={onEntrar}
                variant="navy"
                loading={entrando}
                disabled={entrando}
                style={styles.btnEntrar}
              />
            </View>
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy },
  flex: { flex: 1 },
  hero: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  heroIcon: { fontSize: 56, zIndex: 2 },
  heroBgIcon: {
    position: 'absolute',
    fontSize: 140,
    opacity: 0.08,
    right: -10,
    top: 20,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,20,40,0.15)',
  },
  heroBrand: {
    fontSize: 30,
    fontWeight: '900',
    color: '#fff',
    marginTop: 10,
    zIndex: 2,
    letterSpacing: 0.3,
  },
  heroTag: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 6,
    zIndex: 2,
    marginBottom: 8,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  glassCard: {
    backgroundColor: colors.glass,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.navy,
    textAlign: 'center',
  },
  cardSub: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    marginTop: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#fff',
    fontSize: 16,
    color: colors.text,
  },
  debugApi: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  btnEntrar: { marginTop: 8 },
});
