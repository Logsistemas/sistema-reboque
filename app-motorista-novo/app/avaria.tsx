import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { debugLog } from '../config/api';
import {
  type MarcacaoAvaria,
  type TipoVeiculo,
  imagemLocalParte,
  indiceMarcacaoProxima,
  inferirTipoVeiculo,
  labelTipoVeiculo,
  nomeAssetChecklist,
  carregarRascunhoChecklist,
  salvarRascunhoChecklist,
  tituloParte,
  toqueParaPercentual,
  percentualParaPosicaoContainer,
} from '../lib/checklist_avarias';

type LayoutSize = { width: number; height: number };

export default function AvariaScreen() {
  const params = useLocalSearchParams();
  const parte = String(params.parte || 'Parte do veículo');
  const servicoId = String(params.servico_id || '');
  const tipoVeiculo = inferirTipoVeiculo({
    tipo_servico: params.tipo_servico,
    tipo: params.tipo_servico,
    observacao: params.observacao,
    categoria: params.categoria,
    descricao_servico: params.descricao_servico,
    tipo_veiculo: params.tipo_veiculo,
  }) as TipoVeiculo;

  const [marcacoes, setMarcacoes] = useState<MarcacaoAvaria[]>([]);

  const [fotos, setFotos] = useState<string[]>([]);

  useEffect(() => {
    let cancelado = false;

    async function carregarParte() {
      if (!servicoId) return;
      const rascunho = await carregarRascunhoChecklist(servicoId);
      if (cancelado || !rascunho) return;
      if (Array.isArray(rascunho.marcacoes?.[parte])) {
        setMarcacoes(rascunho.marcacoes[parte]);
      }
      if (Array.isArray(rascunho.fotos?.[parte])) {
        setFotos(rascunho.fotos[parte]);
      }
    }

    carregarParte();
    return () => {
      cancelado = true;
    };
  }, [servicoId, parte]);

  const [layout, setLayout] = useState<LayoutSize>({ width: 0, height: 0 });
  const [verFotosAberto, setVerFotosAberto] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const imagemFonte = imagemLocalParte(parte, tipoVeiculo);
  const imagemSelecionada = nomeAssetChecklist(parte, tipoVeiculo);

  useEffect(() => {
    console.log('[CHECKLIST] tipoVeiculo', tipoVeiculo);
    console.log('[CHECKLIST] imagemSelecionada', imagemSelecionada, 'parte', parte);
    debugLog('checklist', 'tipoVeiculo', tipoVeiculo, 'imagem', imagemSelecionada, 'parte', parte);
  }, [tipoVeiculo, imagemSelecionada, parte]);

  const dimensaoImagem = useMemo(() => {
    if (!imagemFonte) return { width: 0, height: 0 };
    const src = Image.resolveAssetSource(imagemFonte);
    return { width: src.width || 1, height: src.height || 1 };
  }, [imagemFonte]);

  const onLayoutImagem = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setLayout({ width, height });
  }, []);

  async function mesclarEstadoChecklist() {
    let todasMarcacoes: Record<string, MarcacaoAvaria[]> = {};
    let fotosAvarias: Record<string, string[]> = {};

    if (servicoId) {
      const rascunho = await carregarRascunhoChecklist(servicoId);
      if (rascunho) {
        todasMarcacoes = { ...(rascunho.marcacoes || {}) };
        fotosAvarias = { ...(rascunho.fotos || {}) };
      }
    }

    todasMarcacoes[parte] = marcacoes;
    fotosAvarias[parte] = fotos;
    return { todasMarcacoes, fotosAvarias };
  }

  async function voltarChecklist() {
    const { todasMarcacoes, fotosAvarias } = await mesclarEstadoChecklist();

    if (servicoId) {
      await salvarRascunhoChecklist(servicoId, {
        marcacoes: todasMarcacoes,
        fotos: fotosAvarias,
      });
    }

    debugLog('avaria', 'salvar parte', parte, {
      marcacoes: marcacoes.length,
      fotos: fotos.length,
    });

    router.replace({
      pathname: '/checklist',
      params: {
        servico_id: servicoId,
        tipo_servico: String(params.tipo_servico || ''),
        observacao: String(params.observacao || ''),
      },
    } as any);
  }

  function adicionarMarcacao(xPct: number, yPct: number) {
    const nova: MarcacaoAvaria = {
      x: Math.round(xPct * 10) / 10,
      y: Math.round(yPct * 10) / 10,
      id: Date.now(),
      parte,
      tipoVeiculo,
      criadoEm: new Date().toISOString(),
    };
    setMarcacoes((lista) => [...lista, nova]);
    debugLog('avaria', 'marcacao toque', parte, nova);
  }

  function removerMarcacao(id: number) {
    setMarcacoes((lista) => lista.filter((m) => m.id !== id));
  }

  function onPressImagem(xPx: number, yPx: number) {
    const pct = toqueParaPercentual(
      xPx,
      yPx,
      layout.width,
      layout.height,
      dimensaoImagem.width,
      dimensaoImagem.height
    );
    if (!pct) return;

    const { x: xPct, y: yPct } = pct;
    const idx = indiceMarcacaoProxima(marcacoes, xPct, yPct);

    if (idx >= 0) {
      const alvo = marcacoes[idx];
      Alert.alert('Remover marcação?', 'Deseja remover este X da avaria?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => removerMarcacao(alvo.id),
        },
      ]);
      return;
    }

    adicionarMarcacao(xPct, yPct);
  }

  async function tirarFotoAvaria() {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão negada', 'Ative a câmera para fotografar a avaria.');
      return;
    }

    const resultado = await ImagePicker.launchCameraAsync({
      quality: 0.45,
      allowsEditing: false,
    });
    if (!resultado.canceled && resultado.assets[0]) {
      setFotos((lista) => [...lista, resultado.assets[0].uri]);
      debugLog('avaria', 'foto capturada', parte);
    }
  }

  async function anexarFotoAvaria() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão negada', 'Permita acesso à galeria para anexar foto.');
      return;
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      quality: 0.45,
      allowsMultipleSelection: false,
      allowsEditing: false,
    });
    if (!resultado.canceled && resultado.assets[0]) {
      setFotos((lista) => [...lista, resultado.assets[0].uri]);
    }
  }

  function removerFoto(idx: number) {
    Alert.alert('Remover foto?', 'Esta foto será removida desta parte do checklist.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => setFotos((lista) => lista.filter((_, i) => i !== idx)),
      },
    ]);
  }

  function abrirVerFotos() {
    if (fotos.length === 0) {
      Alert.alert('Sem fotos', 'Nenhuma foto anexada nesta parte do checklist.');
      return;
    }
    setVerFotosAberto(true);
  }

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.titulo}>Checklist de Avarias</Text>
      <Text style={styles.subtitulo}>{tituloParte(parte)}</Text>
      <Text style={styles.tipo}>{labelTipoVeiculo(tipoVeiculo)}</Text>
      <Text style={styles.instrucao}>Toque na imagem para marcar um X vermelho no local da avaria.</Text>

      <View style={styles.imagemWrap} onLayout={onLayoutImagem}>
        {imagemFonte ? (
          <Image source={imagemFonte} style={styles.imagemVeiculo} resizeMode="contain" />
        ) : (
          <View style={styles.imagemFallback}>
            <Text style={styles.imagemFallbackTxt}>Imagem indisponível</Text>
          </View>
        )}

        <Pressable
          style={styles.imagemOverlay}
          onPress={(e) => onPressImagem(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        >
          {marcacoes.map((m) => {
            const pos = percentualParaPosicaoContainer(
              Number(m.x),
              Number(m.y),
              layout.width,
              layout.height,
              dimensaoImagem.width,
              dimensaoImagem.height
            );
            return (
            <View
              key={m.id}
              pointerEvents="none"
              style={[
                styles.marcadorX,
                { left: `${pos.leftPct}%`, top: `${pos.topPct}%` },
              ]}
            >
              <Text style={styles.marcadorXTexto}>✕</Text>
            </View>
            );
          })}
        </Pressable>
      </View>

      <Text style={styles.contador}>
        {marcacoes.length} marcação(ões) · {fotos.length} foto(s)
      </Text>

      <View style={styles.acoesFoto}>
        <TouchableOpacity style={styles.botaoFoto} onPress={tirarFotoAvaria}>
          <Text style={styles.botaoTexto}>Tirar Foto</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botaoFotoSec} onPress={abrirVerFotos}>
          <Text style={styles.botaoTexto}>Ver Fotos</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.botaoAnexar} onPress={anexarFotoAvaria}>
        <Text style={styles.botaoAnexarTxt}>Anexar foto da galeria</Text>
      </TouchableOpacity>

      {fotos.length > 0 && (
        <View style={styles.galeria}>
          <Text style={styles.galeriaTitulo}>Fotos desta parte</Text>
          {fotos.map((uri, idx) => (
            <View key={`${uri}-${idx}`} style={styles.fotoItem}>
              <Image source={{ uri }} style={styles.foto} />
              <TouchableOpacity style={styles.fotoRemover} onPress={() => removerFoto(idx)}>
                <Text style={styles.fotoRemoverTxt}>Remover foto</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.botaoSalvar} onPress={voltarChecklist}>
        <Text style={styles.botaoTexto}>Salvar</Text>
      </TouchableOpacity>

      <Modal visible={verFotosAberto} animationType="slide" transparent>
        <View style={styles.modalFundo}>
          <View style={styles.modalCaixa}>
            <Text style={styles.modalTitulo}>Fotos — {tituloParte(parte)}</Text>
            <ScrollView style={styles.modalScroll}>
              {fotos.map((uri, idx) => (
                <View key={`${uri}-${idx}`} style={styles.fotoItem}>
                  <Image source={{ uri }} style={styles.fotoModal} />
                  <TouchableOpacity style={styles.fotoRemover} onPress={() => removerFoto(idx)}>
                    <Text style={styles.fotoRemoverTxt}>Remover foto</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalFechar} onPress={() => setVerFotosAberto(false)}>
              <Text style={styles.botaoTexto}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 36 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#0f2744', marginBottom: 4 },
  subtitulo: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  tipo: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  instrucao: { fontSize: 14, color: '#475569', marginBottom: 14 },
  imagemWrap: {
    width: '100%',
    aspectRatio: 1.35,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative',
  },
  imagemVeiculo: { width: '100%', height: '100%' },
  imagemFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  imagemFallbackTxt: { color: '#64748b', fontWeight: '600' },
  imagemOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  marcadorX: {
    position: 'absolute',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    borderRadius: 14,
    backgroundColor: 'rgba(220, 38, 38, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  marcadorXTexto: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
    lineHeight: 18,
  },
  contador: {
    marginTop: 10,
    marginBottom: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
  },
  acoesFoto: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  botaoFoto: {
    flex: 1,
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 10,
  },
  botaoFotoSec: {
    flex: 1,
    backgroundColor: '#475569',
    padding: 14,
    borderRadius: 10,
  },
  botaoAnexar: {
    paddingVertical: 10,
    marginBottom: 12,
  },
  botaoAnexarTxt: {
    textAlign: 'center',
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 14,
  },
  modalFundo: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCaixa: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '85%',
    padding: 18,
  },
  modalTitulo: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: '#0f172a' },
  modalScroll: { maxHeight: 420 },
  fotoModal: { width: '100%', height: 240, borderRadius: 10, backgroundColor: '#e2e8f0' },
  modalFechar: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 10,
    marginTop: 12,
  },
  galeria: { marginBottom: 12 },
  galeriaTitulo: { fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  fotoItem: { marginBottom: 10 },
  foto: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#e2e8f0' },
  fotoRemover: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  fotoRemoverTxt: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },
  botaoSalvar: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  botaoTexto: { color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: 16 },
});
