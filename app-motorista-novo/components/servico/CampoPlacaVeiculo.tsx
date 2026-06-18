import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '../ui/AppButton';
import { colors, radius, spacing } from '../../lib/ui/theme';
import { formatarPlaca, placaValida } from '../../lib/servico';

type Props = {
  servicoId: string;
  placaSalvaServidor: string;
  bloqueado: boolean;
  onEnviar: (placa: string) => Promise<boolean>;
};

export function CampoPlacaVeiculo({
  servicoId,
  placaSalvaServidor,
  bloqueado,
  onEnviar,
}: Props) {
  const [placaInput, setPlacaInput] = useState('');
  const [placaRegistrada, setPlacaRegistrada] = useState('');
  const servicoCarregado = useRef<string | null>(null);
  const editando = useRef(false);

  useEffect(() => {
    if (servicoCarregado.current !== servicoId) {
      servicoCarregado.current = servicoId;
      editando.current = false;
      setPlacaInput(placaSalvaServidor);
      setPlacaRegistrada(placaSalvaServidor);
      return;
    }

    if (editando.current || !placaSalvaServidor) {
      return;
    }

    setPlacaInput(placaSalvaServidor);
    setPlacaRegistrada(placaSalvaServidor);
  }, [servicoId, placaSalvaServidor]);

  async function enviarPlaca() {
    const placa = formatarPlaca(placaInput);

    if (!placa) {
      Alert.alert('Placa obrigatória', 'Digite a placa do veículo atendido.');
      return;
    }

    if (!placaValida(placa)) {
      Alert.alert(
        'Placa inválida',
        'Use o formato antigo (ABC1234) ou Mercosul (ABC1D23).'
      );
      return;
    }

    const ok = await onEnviar(placa);
    if (ok) {
      editando.current = false;
      setPlacaRegistrada(placa);
      setPlacaInput(placa);
    }
  }

  return (
    <View style={styles.placaBox}>
      <Text style={styles.placaLabel}>Placa do veículo atendido</Text>

      {placaRegistrada ? (
        <View style={styles.placaSalvaBox}>
          <Text style={styles.placaSalva}>✓ {placaRegistrada}</Text>
        </View>
      ) : null}

      <TextInput
        style={[styles.inputPlaca, bloqueado && styles.inputPlacaBloqueado]}
        placeholder="Ex: ABC1234 ou ABC1D23"
        placeholderTextColor={colors.textMuted}
        value={placaInput}
        editable={!bloqueado}
        autoCapitalize="characters"
        maxLength={7}
        onFocus={() => {
          editando.current = true;
        }}
        onBlur={() => {
          editando.current = false;
        }}
        onChangeText={(texto) => {
          editando.current = true;
          setPlacaInput(formatarPlaca(texto));
        }}
      />

      {!bloqueado && (
        <AppButton label="Enviar placa" onPress={enviarPlaca} variant="navy" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placaBox: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.borderLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placaLabel: {
    fontWeight: '800',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  placaSalvaBox: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: 8,
  },
  placaSalva: { color: colors.successDark, fontWeight: '800', fontSize: 13 },
  inputPlaca: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.bgCard,
    fontSize: 16,
    letterSpacing: 1,
    color: colors.text,
    fontWeight: '700',
  },
  inputPlacaBloqueado: { backgroundColor: '#F1F5F9', color: colors.textMuted },
});
