import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/ui/AppButton';
import { FadeInView } from '../../components/ui/FadeInView';
import { useMotorista } from '../../context/MotoristaContext';
import { colors, radius, shadow, spacing } from '../../lib/ui/theme';

type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

export default function PerfilScreen() {
  const insets = useSafeAreaInsets();
  const {
    logado,
    restaurandoSessao,
    motorista,
    sair,
    carregarServicos,
  } = useMotorista();

  if (restaurandoSessao) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.orange} />
      </View>
    );
  }

  if (!logado || !motorista) {
    return (
      <View style={styles.loading}>
        <Text style={styles.msg}>Faça login na aba Serviços.</Text>
      </View>
    );
  }

  const itens: MenuItem[] = [
    {
      icon: 'person-outline',
      label: 'Meus dados',
      onPress: () =>
        Alert.alert(
          'Meus dados',
          `${motorista.nome || 'Motorista'}\nReboque: ${motorista.placa_atual || '—'}\nVeículo: ${motorista.veiculo || '—'}`
        ),
    },
    {
      icon: 'key-outline',
      label: 'Alterar senha',
      onPress: () =>
        Alert.alert('Alterar senha', 'Solicite a alteração de senha na Central.'),
    },
    {
      icon: 'settings-outline',
      label: 'Configurações',
      onPress: () => Alert.alert('Configurações', 'Em breve.'),
    },
    {
      icon: 'sync-outline',
      label: 'Sincronizar',
      onPress: () => {
        if (motorista.id) carregarServicos(motorista.id);
        Alert.alert('Sincronizar', 'Serviços atualizados.');
      },
    },
    {
      icon: 'information-circle-outline',
      label: 'Sobre',
      onPress: () =>
        Alert.alert('Essência Logística', 'App Motorista — operação de reboque premium.'),
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
    >
      <FadeInView>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color="#fff" />
          </View>
          <Text style={styles.nome}>{motorista.nome || 'Motorista'}</Text>
          <Text style={styles.placa}>Placa: {motorista.placa_atual || '—'}</Text>
          <Text style={styles.cadastro}>Operação ativa</Text>
        </View>
      </FadeInView>

      <FadeInView delay={80}>
        {itens.map((item) => (
          <TouchableOpacity key={item.label} style={styles.menuItem} onPress={item.onPress}>
            <Ionicons name={item.icon} size={22} color={colors.royal} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </FadeInView>

      <FadeInView delay={140}>
        <AppButton label="Sair" onPress={sair} variant="danger" style={styles.sair} />
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  msg: { color: colors.textMuted, fontWeight: '600' },
  profileCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadow,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.royal,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  nome: { fontSize: 22, fontWeight: '900', color: '#fff' },
  placa: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 6 },
  cadastro: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.navy },
  sair: { marginTop: spacing.md },
});
