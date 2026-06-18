import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/ui/AppButton';
import { FadeInView } from '../components/ui/FadeInView';
import { colors, radius, spacing } from '../lib/ui/theme';

export default function ChecklistSucessoScreen() {
  return (
    <View style={styles.container}>
      <FadeInView style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={96} color={colors.success} />
        </View>
        <Text style={styles.titulo}>Checklist concluído com sucesso</Text>
        <Text style={styles.sub}>
          Os dados foram enviados para a Central. Você pode voltar aos serviços.
        </Text>
        <AppButton
          label="Voltar aos serviços"
          onPress={() => router.replace('/(tabs)' as any)}
          variant="navy"
          style={styles.btn}
        />
      </FadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: { alignItems: 'center', width: '100%' },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.navy,
    textAlign: 'center',
  },
  sub: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  btn: { width: '100%' },
});
