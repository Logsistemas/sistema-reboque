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
import { AppButton } from '../components/ui/AppButton';
import { colors, radius, shadow, spacing } from '../lib/ui/theme';
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
      console.log('[CHECKLIST FOTO] envio finalizado partes=', Object.keys(fotosEnvio).length);
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

      router.replace('/checklist-sucesso' as any);
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
          <AppButton
            label={tipo === 'origem' ? 'Assinar origem' : 'Assinar destino'}
            onPress={() => abrirAssinatura(tipo)}
            variant="primary"
          />
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <Text style={styles.titulo}>Checklist veicular</Text>
        <Text style={styles.subHeader}>Inspeção por parte do veículo</Text>
        <View style={styles.progressRow}>
          <View style={[styles.progressPill, styles.progressOk]}>
            <Text style={styles.progressTxt}>
              {itens.filter((p) => !(marcacoes[p]?.length || 0)).length} sem avaria
            </Text>
          </View>
          <View style={[styles.progressPill, styles.progressWarn]}>
            <Text style={styles.progressTxt}>
              {itens.filter((p) => (marcacoes[p]?.length || 0) > 0).length} com avaria
            </Text>
          </View>
        </View>
      </View>

      <AppButton label="Tirar foto do veículo" onPress={tirarFoto} variant="orange" />

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
            qtdMarc > 0 ? styles.itemMarcado : styles.itemOk,
          ]}
          onPress={() => abrirParte(item)}
        >
          <View style={styles.itemHeader}>
            <Text style={styles.texto}>
              {qtdMarc > 0 ? '⚠ ' : '✔ '}
              {item}
            </Text>
            <View style={[styles.badgeMini, qtdMarc > 0 ? styles.badgeWarn : styles.badgeOk]}>
              <Text style={styles.badgeMiniTxt}>{qtdMarc > 0 ? 'Avaria' : 'OK'}</Text>
            </View>
          </View>
          <Text style={styles.itemSub}>
            {qtdMarc > 0
              ? `${qtdMarc} marcação(ões) · ${qtdFotos} foto(s)`
              : qtdFotos > 0
                ? `${qtdFotos} foto(s) anexada(s)`
                : 'Toque para inspecionar'}
          </Text>
        </TouchableOpacity>
      );
      })}

      <View style={styles.resumo}>
        <Text style={styles.resumoTitulo}>Resumo executivo</Text>
        <Text style={styles.resumoSub}>Checklist em andamento</Text>

        {itens.map((parte) => {
          const qtd = marcacoes[parte]?.length || 0;
          return (
          <View
            key={parte}
            style={[styles.resumoItem, qtd > 0 ? styles.resumoItemWarn : styles.resumoItemOk]}
          >
            <Text style={styles.resumoParte}>{parte}</Text>
            <Text style={styles.resumoDetalhe}>
              {resumoParte(marcacoes[parte], fotosAvarias[parte])}
            </Text>
          </View>
          );
        })}
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

      <AppButton label="Finalizar Checklist" onPress={finalizarChecklist} variant="navy" style={styles.botaoFinalizar} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 32,
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
    fontSize: 24,
    fontWeight: '800',
    color: colors.navy,
  },
  subHeader: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  progressRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  progressPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  progressOk: { backgroundColor: '#DCFCE7' },
  progressWarn: { backgroundColor: '#FEE2E2' },
  progressTxt: { fontSize: 12, fontWeight: '800', color: colors.navy },
  item: {
    padding: 16,
    borderWidth: 1,
    borderRadius: radius.sm,
    marginBottom: 10,
    backgroundColor: colors.bgCard,
    ...shadow,
  },
  itemOk: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  itemMarcado: {
    backgroundColor: colors.marcadoBg,
    borderColor: colors.marcadoBorder,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgeMini: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeOk: { backgroundColor: colors.success },
  badgeWarn: { backgroundColor: colors.danger },
  badgeMiniTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  texto: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.navy,
  },
  itemSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  botaoFinalizar: {
    marginTop: 16,
    marginBottom: 8,
  },
  fotoVeiculo: {
    width: '100%',
    height: 200,
    borderRadius: radius.sm,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resumo: {
    backgroundColor: colors.bgCard,
    padding: 16,
    borderRadius: radius.md,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  resumoTitulo: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
    color: colors.navy,
  },
  resumoSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
    fontWeight: '600',
  },
  resumoItem: {
    marginBottom: 10,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  resumoItemOk: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  resumoItemWarn: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECACA',
  },
  resumoParte: {
    fontWeight: '800',
    color: colors.navy,
    marginBottom: 2,
  },
  resumoDetalhe: {
    color: colors.textSoft,
    fontSize: 14,
  },
  secaoAssinaturas: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
    color: colors.navy,
  },
  assinaturaBloco: {
    backgroundColor: colors.bgCard,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 14,
    ...shadow,
  },
  assinaturaTitulo: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    color: colors.navy,
  },
  assinaturaSalvaTexto: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.successDark,
    marginBottom: 8,
  },
  assinaturaPendenteTexto: {
    fontSize: 14,
    color: colors.warningText,
    marginBottom: 8,
    fontWeight: '600',
  },
  assinaturaPreview: {
    width: '100%',
    height: 120,
    backgroundColor: '#fff',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
