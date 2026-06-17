import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';

import { API_BASE, debugLog } from '../config/api';
import {
  PARTES_CHECKLIST,
  carregarRascunhoChecklist,
  checklistFotosParaEnvio,
  limparRascunhoChecklist,
  resumoParte,
  salvarRascunhoChecklist,
} from '../lib/checklist_avarias';

const CHAVES_META = [
  'assinatura',
  'assinatura_salva',
  'assinatura_atualizada_em',
  'assinatura_origem',
  'assinatura_origem_salva',
  'assinatura_origem_em',
  'assinatura_destino',
  'assinatura_destino_salva',
  'assinatura_destino_em',
  'partes',
];

function extrairPartes(dados: any) {
  if (dados?.partes && typeof dados.partes === 'object') {
    return dados.partes;
  }

  const partes: any = {};
  Object.keys(dados || {}).forEach((key) => {
    if (CHAVES_META.includes(key)) {
      return;
    }
    const item = dados[key];
    if (item && typeof item === 'object' && ('marcacoes' in item || 'fotos' in item)) {
      partes[key] = item;
    }
  });
  return partes;
}

function assinaturaValida(valor: unknown) {
  const texto = String(valor || '').trim();
  return texto.length > 80;
}

type TipoAssinatura = 'origem' | 'destino';

export default function ChecklistScreen() {
  const params = useLocalSearchParams();

  const [marcacoes, setMarcacoes] = useState<any>({});
  const [fotosAvarias, setFotosAvarias] = useState<any>({});
  const [fotoVeiculo, setFotoVeiculo] = useState<string | null>(null);
  const [tipoServico, setTipoServico] = useState(String(params.tipo_servico || ''));
  const [observacaoServico, setObservacaoServico] = useState(String(params.observacao || ''));

  const [assinaturaOrigem, setAssinaturaOrigem] = useState<string | null>(null);
  const [assinaturaDestino, setAssinaturaDestino] = useState<string | null>(null);
  const [origemPersistida, setOrigemPersistida] = useState(false);
  const [destinoPersistida, setDestinoPersistida] = useState(false);

  useEffect(() => {
    async function carregarChecklist() {
      try {
        const novasMarcacoes: any = {};
        const novasFotos: any = {};
        let origemAtual: string | null = null;
        let destinoAtual: string | null = null;
        let origemNoServidor = false;
        let destinoNoServidor = false;

        const servicoId = String(params.servico_id || '');

        if (params.tipo_servico) {
          setTipoServico(String(params.tipo_servico));
        }
        if (params.observacao) {
          setObservacaoServico(String(params.observacao));
        }

        if (servicoId && servicoId !== 'undefined') {
          const url = `${API_BASE}/api/checklist-dados/${servicoId}`;
          debugLog('checklist', 'GET', url);
          const response = await fetch(url);

          if (response.ok) {
            const texto = await response.text();
            let dados: any = {};

            try {
              dados = JSON.parse(texto);
            } catch (e) {
              console.log(
                'Resposta não veio em JSON:',
                texto.substring(0, 100)
              );
              dados = {};
            }

            const partes = extrairPartes(dados);

            Object.keys(partes).forEach((parte) => {
              novasMarcacoes[parte] = partes[parte].marcacoes || [];
              novasFotos[parte] = partes[parte].fotos || [];
            });

            origemNoServidor = !!dados.assinatura_origem_salva;
            destinoNoServidor = !!dados.assinatura_destino_salva;

            if (assinaturaValida(dados.assinatura_origem)) {
              origemAtual = String(dados.assinatura_origem);
            } else if (assinaturaValida(dados.assinatura)) {
              origemAtual = String(dados.assinatura);
              origemNoServidor = origemNoServidor || !!dados.assinatura_salva;
            }

            if (assinaturaValida(dados.assinatura_destino)) {
              destinoAtual = String(dados.assinatura_destino);
            }
          }
        }

        const rascunho = servicoId ? await carregarRascunhoChecklist(servicoId) : null;
        if (rascunho) {
          Object.keys(rascunho.marcacoes || {}).forEach((parte) => {
            novasMarcacoes[parte] = rascunho.marcacoes[parte] || [];
          });
          Object.keys(rascunho.fotos || {}).forEach((parte) => {
            novasFotos[parte] = rascunho.fotos[parte] || [];
          });
        }

        if (assinaturaValida(params.assinatura_origem)) {
          origemAtual = String(params.assinatura_origem);
        }

        if (assinaturaValida(params.assinatura_destino)) {
          destinoAtual = String(params.assinatura_destino);
        }

        setMarcacoes(novasMarcacoes);
        setFotosAvarias(novasFotos);
        setAssinaturaOrigem(origemAtual);
        setAssinaturaDestino(destinoAtual);
        setOrigemPersistida(origemNoServidor);
        setDestinoPersistida(destinoNoServidor);
      } catch (err) {
        console.log('Erro ao carregar checklist:', err);
      }
    }

    carregarChecklist();
  }, [
    params.servico_id,
    params.tipo_servico,
    params.observacao,
    params.assinatura_origem,
    params.assinatura_destino,
  ]);

  useFocusEffect(
    React.useCallback(() => {
      const servicoId = String(params.servico_id || '');
      if (!servicoId) return;

      carregarRascunhoChecklist(servicoId).then((rascunho) => {
        if (!rascunho) return;
        setMarcacoes((atual) => ({ ...atual, ...(rascunho.marcacoes || {}) }));
        setFotosAvarias((atual) => ({ ...atual, ...(rascunho.fotos || {}) }));
      });
    }, [params.servico_id])
  );

  const itens = [...PARTES_CHECKLIST];

  function abrirParte(item: string) {
    router.push({
      pathname: '/avaria',
      params: {
        servico_id: params.servico_id,
        tipo_servico: tipoServico,
        observacao: observacaoServico,
        parte: item,
      },
    } as any);
  }

  async function tirarFoto() {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();

    if (!permissao.granted) {
      Alert.alert('Permissão negada');
      return;
    }

    const resultado = await ImagePicker.launchCameraAsync({
      quality: 0.5,
    });

    if (!resultado.canceled) {
      setFotoVeiculo(resultado.assets[0].uri);
    }
  }

  function abrirAssinatura(tipo: TipoAssinatura) {
    if (tipo === 'origem' && (origemPersistida || assinaturaValida(assinaturaOrigem))) {
      if (origemPersistida) {
        Alert.alert(
          'Assinatura bloqueada',
          'A assinatura de origem já foi registrada e não pode ser alterada.'
        );
      }
      return;
    }

    if (tipo === 'destino' && (destinoPersistida || assinaturaValida(assinaturaDestino))) {
      if (destinoPersistida) {
        Alert.alert(
          'Assinatura bloqueada',
          'A assinatura de destino já foi registrada e não pode ser alterada.'
        );
      }
      return;
    }

    router.push({
      pathname: '/assinatura',
      params: {
        servico_id: params.servico_id,
        tipo,
        tipo_servico: tipoServico,
        observacao: observacaoServico,
      },
    } as any);
  }

  async function finalizarChecklist() {
    if (!origemPersistida && !assinaturaValida(assinaturaOrigem)) {
      Alert.alert(
        'Assinatura de origem obrigatória',
        'Assine a coleta na origem antes de finalizar o checklist.'
      );
      return;
    }

    try {
      const fotosEnvio = await checklistFotosParaEnvio(fotosAvarias);
      const checklistCompleto: any = {};

      Object.keys(marcacoes).forEach((parte) => {
        checklistCompleto[parte] = {
          marcacoes: marcacoes[parte] || [],
          fotos: fotosEnvio[parte] || [],
        };
      });

      const payload: any = {
        servico_id: String(params.servico_id),
        checklist: checklistCompleto,
      };

      if (assinaturaValida(assinaturaOrigem) && !origemPersistida) {
        payload.assinatura_origem = assinaturaOrigem;
      }

      if (assinaturaValida(assinaturaDestino) && !destinoPersistida) {
        payload.assinatura_destino = assinaturaDestino;
      }

      const url = `${API_BASE}/api/checklist/salvar`;
      debugLog('checklist', 'POST', url, 'servico_id', params.servico_id);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const dados = await response.json();

      if (!dados.ok) {
        Alert.alert('Erro ao salvar checklist', dados.erro || '');
        return;
      }

      if (dados.assinatura_origem_salva) {
        setOrigemPersistida(true);
      }
      if (dados.assinatura_destino_salva) {
        setDestinoPersistida(true);
      }

      await limparRascunhoChecklist(String(params.servico_id));
      await salvarRascunhoChecklist(String(params.servico_id), {
        marcacoes,
        fotos: fotosAvarias,
      });

      Alert.alert('Sucesso', 'Checklist salvo com sucesso!', [
        {
          text: 'OK',
          onPress: () => (router as any).dismissAll(),
        },
      ]);
    } catch (err) {
      console.log(err);
      Alert.alert('Erro ao conectar com servidor');
    }
  }

  function renderBlocoAssinatura(
    tipo: TipoAssinatura,
    titulo: string,
    imagem: string | null,
    persistida: boolean
  ) {
    const capturada = assinaturaValida(imagem);

    return (
      <View style={styles.assinaturaBloco} key={tipo}>
        <Text style={styles.assinaturaTitulo}>{titulo}</Text>

        {persistida && capturada ? (
          <>
            <Text style={styles.assinaturaSalvaTexto}>
              ✅ {titulo} salva
            </Text>
            <Image
              source={{ uri: imagem! }}
              style={styles.assinaturaPreview}
              resizeMode="contain"
            />
          </>
        ) : capturada ? (
          <>
            <Text style={styles.assinaturaPendenteTexto}>
              Assinatura capturada — será gravada ao finalizar
            </Text>
            <Image
              source={{ uri: imagem! }}
              style={styles.assinaturaPreview}
              resizeMode="contain"
            />
          </>
        ) : (
          <TouchableOpacity
            style={styles.botao}
            onPress={() => abrirAssinatura(tipo)}
          >
            <Text style={styles.botaoTexto}>
              {tipo === 'origem' ? 'Assinar origem' : 'Assinar destino'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.titulo}>Checklist Veicular</Text>

      <TouchableOpacity style={styles.botao} onPress={tirarFoto}>
        <Text style={styles.botaoTexto}>📸 Tirar foto do veículo</Text>
      </TouchableOpacity>

      {fotoVeiculo && (
        <Image source={{ uri: fotoVeiculo }} style={styles.fotoVeiculo} />
      )}

      {itens.map((item) => {
        const qtdMarc = marcacoes[item]?.length || 0;
        const qtdFotos = fotosAvarias[item]?.length || 0;
        return (
        <TouchableOpacity
          key={item}
          style={[
            styles.item,
            qtdMarc > 0 && styles.itemMarcado,
          ]}
          onPress={() => abrirParte(item)}
        >
          <Text style={styles.texto}>
            {qtdMarc > 0 ? '⚠️ ' : '✅ '}
            {item}
          </Text>
          <Text style={styles.itemSub}>
            {qtdMarc > 0
              ? `${qtdMarc} avaria(s) · ${qtdFotos} foto(s)`
              : 'Toque para inspecionar'}
          </Text>
        </TouchableOpacity>
      );
      })}

      <View style={styles.resumo}>
        <Text style={styles.resumoTitulo}>Resumo das avarias</Text>

        {itens.map((parte) => (
          <View key={parte} style={styles.resumoItem}>
            <Text style={styles.resumoParte}>{parte}</Text>
            <Text style={styles.resumoDetalhe}>
              {resumoParte(marcacoes[parte], fotosAvarias[parte])}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.secaoAssinaturas}>Assinaturas</Text>

      {renderBlocoAssinatura(
        'origem',
        'Assinatura de Origem',
        assinaturaOrigem,
        origemPersistida
      )}

      {renderBlocoAssinatura(
        'destino',
        'Assinatura de Destino',
        assinaturaDestino,
        destinoPersistida
      )}

      <TouchableOpacity style={styles.botaoFinalizar} onPress={finalizarChecklist}>
        <Text style={styles.botaoTexto}>Finalizar Checklist</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },

  titulo: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },

  item: {
    padding: 15,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    marginBottom: 10,
  },

  itemMarcado: {
    backgroundColor: '#ffe5e5',
    borderColor: 'red',
  },

  texto: {
    fontSize: 16,
    fontWeight: '700',
  },

  itemSub: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },

  botao: {
    backgroundColor: '#1d4ed8',
    padding: 15,
    borderRadius: 10,
    marginTop: 6,
  },

  botaoFinalizar: {
    backgroundColor: '#1d4ed8',
    padding: 15,
    borderRadius: 10,
    marginTop: 16,
    marginBottom: 24,
  },

  botaoTexto: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },

  fotoVeiculo: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginBottom: 20,
  },

  resumo: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },

  resumoTitulo: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },

  resumoItem: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },

  resumoParte: {
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },

  resumoDetalhe: {
    color: '#475569',
    fontSize: 14,
  },

  secaoAssinaturas: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },

  assinaturaBloco: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },

  assinaturaTitulo: {
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#0f172a',
  },

  assinaturaSalvaTexto: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 8,
  },

  assinaturaPendenteTexto: {
    fontSize: 14,
    color: '#854d0e',
    marginBottom: 8,
  },

  assinaturaPreview: {
    width: '100%',
    height: 120,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
});
