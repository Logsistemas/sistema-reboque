import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import SignatureScreen from 'react-native-signature-canvas';

import { AppButton } from '../components/ui/AppButton';
import { colors, radius, shadow, spacing } from '../lib/ui/theme';

function paramsParaChecklist(
  raw: Record<string, string | string[] | undefined>
) {
  const {
    assinatura: _a,
    assinatura_origem: _ao,
    assinatura_destino: _ad,
    ...rest
  } = raw;
  return rest;
}

export default function AssinaturaScreen() {
  const ref = useRef<any>(null);
  const [canvasKey, setCanvasKey] = useState(0);

  const params = useLocalSearchParams();
  const servicoId = String(params.servico_id ?? '');
  const tipo = String(params.tipo || 'origem').toLowerCase();
  const titulo =
    tipo === 'destino' ? 'Assinatura de Destino' : 'Assinatura de Origem';

  useFocusEffect(
    useCallback(() => {
      setCanvasKey((k) => k + 1);
      return undefined;
    }, [tipo])
  );

  function limpar() {
    ref.current?.clearSignature?.();
  }

  function voltarChecklist(extra: Record<string, string> = {}) {
    router.replace({
      pathname: '/checklist',
      params: {
        ...paramsParaChecklist(params),
        ...extra,
      },
    } as any);
  }

  function salvar(assinatura: string) {
    const assinaturaLimpa = (assinatura || '').trim();
    if (!assinaturaLimpa || assinaturaLimpa.length < 80) {
      Alert.alert('Assinatura inválida', 'Desenhe a assinatura antes de salvar.');
      return;
    }

    Alert.alert(
      'Assinatura registrada',
      `A assinatura de ${tipo === 'destino' ? 'destino' : 'origem'} será gravada ao finalizar o checklist.`
    );

    if (tipo === 'destino') {
      voltarChecklist({ assinatura_destino: assinaturaLimpa });
      return;
    }

    voltarChecklist({ assinatura_origem: assinaturaLimpa });
  }

  function handleEmpty() {
    Alert.alert(
      'Assinatura vazia',
      'Desenhe sua assinatura no campo antes de salvar.'
    );
  }

  function handleError(error: unknown) {
    console.log('Erro no canvas de assinatura:', error);
    Alert.alert(
      'Erro',
      'Não foi possível usar o campo de assinatura. Saia e abra a tela novamente.'
    );
  }

  function handleLoadEnd() {
    ref.current?.clearSignature?.();
  }

  const style = `
    .m-signature-pad--footer {
      display: none;
      margin: 0px;
    }

    body,html {
      width: 100%;
      height: 100%;
    }
  `;

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.subtitulo}>
          Após salvar, esta assinatura não poderá ser refeita ou alterada.
        </Text>
      </View>

      <View style={styles.assinaturaContainer}>
        <SignatureScreen
          key={`sig-${servicoId}-${tipo}-${canvasKey}`}
          ref={ref}
          onOK={salvar}
          onEmpty={handleEmpty}
          onError={handleError}
          onLoadEnd={handleLoadEnd}
          penColor="black"
          backgroundColor="white"
          webStyle={style}
          autoClear={false}
          descriptionText="Assine acima"
          webviewProps={{ cacheEnabled: false }}
        />
      </View>

      <View style={styles.botoes}>
        <AppButton label="Limpar" onPress={limpar} variant="secondary" style={styles.botaoMetade} />
        <AppButton
          label="Salvar assinatura"
          onPress={() => ref.current?.readSignature?.()}
          variant="primary"
          style={styles.botaoMetade}
        />
      </View>

      <AppButton label="Voltar sem assinar" onPress={() => voltarChecklist()} variant="navy" style={styles.botaoVoltar} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },

  headerCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },

  titulo: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.navy,
    marginBottom: 8,
  },

  subtitulo: {
    fontSize: 14,
    color: colors.textSoft,
    textAlign: 'center',
    lineHeight: 20,
  },

  assinaturaContainer: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#fff',
    ...shadow,
  },

  botoes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: spacing.md,
  },

  botaoMetade: {
    flex: 1,
  },

  botaoVoltar: {
    marginBottom: spacing.lg,
  },
});
