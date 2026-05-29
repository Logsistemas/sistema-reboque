import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import SignatureScreen from 'react-native-signature-canvas';

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
      <Text style={styles.titulo}>{titulo}</Text>

      <Text style={styles.subtitulo}>
        Após salvar, esta assinatura não poderá ser refeita ou alterada.
      </Text>

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
        <TouchableOpacity style={styles.botaoLimpar} onPress={limpar}>
          <Text style={styles.textoBotao}>Limpar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.botaoSalvar}
          onPress={() => ref.current?.readSignature?.()}
        >
          <Text style={styles.textoBotao}>Salvar assinatura</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.botaoVoltar}
        onPress={() => voltarChecklist()}
      >
        <Text style={styles.textoBotao}>Voltar sem assinar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 50,
  },

  titulo: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },

  subtitulo: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginHorizontal: 15,
    marginBottom: 12,
  },

  assinaturaContainer: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#ccc',
    marginHorizontal: 15,
    borderRadius: 10,
    overflow: 'hidden',
  },

  botoes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
  },

  botaoLimpar: {
    backgroundColor: '#999',
    padding: 15,
    borderRadius: 10,
    width: '45%',
    alignItems: 'center',
  },

  botaoSalvar: {
    backgroundColor: '#1976d2',
    padding: 15,
    borderRadius: 10,
    width: '45%',
    alignItems: 'center',
  },

  botaoVoltar: {
    backgroundColor: '#64748b',
    marginHorizontal: 15,
    marginBottom: 20,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },

  textoBotao: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
