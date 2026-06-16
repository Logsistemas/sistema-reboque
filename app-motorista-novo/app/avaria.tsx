import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_BASE, debugLog } from '../config/api';

export default function AvariaScreen() {
  const params = useLocalSearchParams();
  const parte = String(params.parte || 'Parte do veículo');
  const servicoId = String(params.servico_id || '');

  const [marcacoes, setMarcacoes] = useState<any[]>(() => {
    try {
      return JSON.parse(String(params.marcacoes || '[]'));
    } catch {
      return [];
    }
  });

  const [fotos, setFotos] = useState<string[]>(() => {
    try {
      return JSON.parse(String(params.fotos || '[]'));
    } catch {
      return [];
    }
  });

  function voltarChecklist() {
    let todasMarcacoes: Record<string, unknown> = {};
    let fotosAvarias: Record<string, unknown> = {};

    try {
      todasMarcacoes = JSON.parse(String(params.todasMarcacoes || '{}'));
    } catch {
      todasMarcacoes = {};
    }

    try {
      fotosAvarias = JSON.parse(String(params.fotosAvarias || '{}'));
    } catch {
      fotosAvarias = {};
    }

    todasMarcacoes[parte] = marcacoes;
    fotosAvarias[parte] = fotos;

    router.replace({
      pathname: '/checklist',
      params: {
        servico_id: servicoId,
        todasMarcacoes: JSON.stringify(todasMarcacoes),
        fotosAvarias: JSON.stringify(fotosAvarias),
      },
    } as any);
  }

  function adicionarMarcacao() {
    setMarcacoes((lista) => [
      ...lista,
      { x: 50 + lista.length * 5, y: 50 + lista.length * 5, id: Date.now() },
    ]);
    debugLog('avaria', 'marcacao adicionada', parte, marcacoes.length + 1);
  }

  async function tirarFotoAvaria() {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão negada', 'Ative a câmera para fotografar a avaria.');
      return;
    }

    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (!resultado.canceled) {
      setFotos((lista) => [...lista, resultado.assets[0].uri]);
      debugLog('avaria', 'foto capturada', parte);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.titulo}>{parte}</Text>
      <Text style={styles.sub}>Marque avarias com X e registre fotos desta parte.</Text>

      <View style={styles.areaMarcacao}>
        <Text style={styles.areaTexto}>
          {marcacoes.length > 0
            ? `${marcacoes.length} marcação(ões) registrada(s)`
            : 'Nenhuma marcação ainda'}
        </Text>
      </View>

      <TouchableOpacity style={styles.botao} onPress={adicionarMarcacao}>
        <Text style={styles.botaoTexto}>✕ Adicionar marcação</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.botaoSec} onPress={tirarFotoAvaria}>
        <Text style={styles.botaoTexto}>📸 Foto da avaria</Text>
      </TouchableOpacity>

      {fotos.map((uri, idx) => (
        <Image key={`${uri}-${idx}`} source={{ uri }} style={styles.foto} />
      ))}

      <TouchableOpacity style={styles.botaoSalvar} onPress={voltarChecklist}>
        <Text style={styles.botaoTexto}>Salvar e voltar ao checklist</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  titulo: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  sub: { color: '#64748b', marginBottom: 16 },
  areaMarcacao: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  areaTexto: { fontWeight: '600', color: '#334155' },
  botao: {
    backgroundColor: '#dc2626',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  botaoSec: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  botaoSalvar: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 24,
  },
  botaoTexto: { color: '#fff', textAlign: 'center', fontWeight: 'bold' },
  foto: { width: '100%', height: 180, borderRadius: 10, marginBottom: 10 },
});
