import * as Location from 'expo-location';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View
} from 'react-native';
import { API_BASE, DEBUG_API, debugLog, formatFetchError } from '../../config/api';
import {
  clearMotoristaSession,
  loadMotoristaSession,
  parseLoginResponse,
  saveMotoristaSession,
  type MotoristaSessao,
} from '../../lib/auth';

const PLACA_CLIENTE_RE = /^[A-Z]{3}(\d{4}|\d[A-Z]\d{2})$/;

function formatarPlaca(texto: string) {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function placaValida(placa: string) {
  return PLACA_CLIENTE_RE.test(formatarPlaca(placa));
}

function obterPlacaServico(servico: any) {
  return formatarPlaca(
    String(servico?.placa_veiculo_removido || servico?.placa_removida || '')
  );
}

function servicoFinalizado(servico: any) {
  return String(servico?.status || '').toLowerCase() === 'finalizado';
}

type CampoPlacaProps = {
  servicoId: string;
  placaSalvaServidor: string;
  bloqueado: boolean;
  onEnviar: (placa: string) => Promise<boolean>;
};

function CampoPlacaVeiculo({
  servicoId,
  placaSalvaServidor,
  bloqueado,
  onEnviar,
}: CampoPlacaProps) {
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
      <Text style={styles.placaLabel}>Placa do veículo</Text>

      {placaRegistrada ? (
        <Text style={styles.placaSalva}>Placa registrada: {placaRegistrada}</Text>
      ) : null}

      <TextInput
        style={[styles.inputPlaca, bloqueado && styles.inputPlacaBloqueado]}
        placeholder="Ex: ABC1234 ou ABC1D23"
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
        <TouchableOpacity style={styles.botaoPlaca} onPress={enviarPlaca}>
          <Text style={styles.botaoTexto}>Enviar placa</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const [logado, setLogado] = useState(false);
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [placa, setPlaca] = useState('');
  const [motorista, setMotorista] = useState<MotoristaSessao | null>(null);
  const [servicos, setServicos] = useState<any[]>([]);
  const [entrando, setEntrando] = useState(false);
  const [restaurandoSessao, setRestaurandoSessao] = useState(true);

  const idsAnteriores = useRef<string[]>([]);

  async function tocarSomNovoServico() {
    debugLog('som', 'novo serviço — vibracao ativa; som opcional indisponivel no dev');
  }

  async function enviarLocalizacao(mid: string) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('GPS', 'Permissão de localização negada.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});

      await fetch(`${API_BASE}/api/app/motorista/${mid}/localizacao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        }),
      });
    } catch (e) {
      console.log('Erro GPS', e);
    }
  }

  async function entrar() {
    if (entrando) return;

    const payload = { login, senha, placa };
    const url = `${API_BASE}/api/app/motorista/login`;
    debugLog('login', 'API_BASE', API_BASE);
    debugLog('login', 'payload', payload);
    debugLog('login', 'URL', url);

    setEntrando(true);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const raw = await response.text();
      debugLog('login', 'status', response.status);
      debugLog('login', 'raw', raw);

      const parsed = parseLoginResponse(raw, response.status);
      debugLog('login', 'parsed', parsed);

      if (!parsed.ok) {
        Alert.alert('Erro', parsed.erro);
        return;
      }

      const mot = parsed.motorista;
      debugLog('login', 'motorista', mot);

      await saveMotoristaSession(mot);
      setMotorista(mot);
      setLogado(true);
      debugLog('login', 'estado', { logado: true, motoristaId: mot.id });
      debugLog('login', 'navegação', 'tela serviços (condicional logado=true)');

      void enviarLocalizacao(mot.id).catch((err) =>
        debugLog('login', 'GPS pós-login (ignorado)', err)
      );
      void carregarServicos(mot.id, true).catch((err) =>
        debugLog('login', 'servicos pós-login (ignorado)', err)
      );
    } catch (err) {
      const detalhe = formatFetchError(err);
      debugLog('login', 'ERRO', { API_BASE, url, payload, err, detalhe });
      Alert.alert(
        'Erro',
        DEBUG_API
          ? `Não foi possível conectar ao servidor.\n\nAPI: ${API_BASE}\nURL: ${url}\n\n${detalhe}`
          : 'Não foi possível conectar ao servidor.'
      );
    } finally {
      setEntrando(false);
    }
  }

  async function carregarServicos(mid: string, primeiraCarga = false) {
    const url = `${API_BASE}/api/app/motorista/${mid}/servicos`;
    debugLog('servicos', 'GET', url);
    try {
      const response = await fetch(url);
      const data = await response.json();
      debugLog('servicos', 'status', response.status, 'qtd', data.servicos?.length ?? 0);

      if (data.ok) {
        const lista = data.servicos || [];
        if (lista[0]) {
          debugLog('servicos', 'primeiro', {
            protocolo: lista[0].protocolo,
            status: lista[0].status,
            seguradora: lista[0].seguradora,
          });
        }
        const novosIds = lista.map((s: any) => s.id);

        if (!primeiraCarga) {
          const chegouNovo = novosIds.some((id: string) => !idsAnteriores.current.includes(id));
          if (chegouNovo && novosIds.length > 0) {
            Vibration.vibrate([500, 300, 500, 300, 800]);
            tocarSomNovoServico();
            Alert.alert('Novo serviço', 'Chegou um novo serviço para você.');
          }
        }

        idsAnteriores.current = novosIds;
        setServicos(lista);
      }
    } catch (err) {
      debugLog('servicos', 'ERRO conexao', err);
      Alert.alert('Erro', 'Falha ao carregar serviços.');
    }
  }

  useEffect(() => {
    let ativo = true;

    (async () => {
      try {
        const salvo = await loadMotoristaSession();
        debugLog('session', 'restaurar', salvo);
        if (!ativo || !salvo?.id) return;

        setMotorista(salvo);
        setLogado(true);
        debugLog('session', 'navegação=tela serviços (sessão restaurada)');
        await carregarServicos(salvo.id, true);
      } catch (err) {
        debugLog('session', 'ERRO restaurar', err);
      } finally {
        if (ativo) setRestaurandoSessao(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, []);

  async function enviarPlacaServico(servicoId: string, placa: string): Promise<boolean> {
    const servico = servicos.find((s) => s.id === servicoId);

    if (servico && servicoFinalizado(servico)) {
      Alert.alert('Serviço finalizado', 'Não é possível alterar a placa deste serviço.');
      return false;
    }

    try {
      const response = await fetch(`${API_BASE}/api/app/servicos/${servicoId}/placa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa }),
      });

      const data = await response.json();

      if (!data.ok) {
        Alert.alert('Erro', data.erro || 'Não foi possível enviar a placa.');
        return false;
      }

      Alert.alert('Sucesso', 'Placa enviada para a Central.');
      setServicos((lista) =>
        lista.map((s) =>
          s.id === servicoId
            ? {
                ...s,
                placa_veiculo_removido: placa,
                placa_removida: placa,
              }
            : s
        )
      );
      carregarServicos(motorista.id);
      return true;
    } catch {
      Alert.alert('Erro', 'Falha de conexão ao enviar a placa.');
      return false;
    }
  }

  async function atualizarStatus(servicoId: string, status: string) {
    const servico = servicos.find((s) => s.id === servicoId);

    if (status === 'na origem' && !obterPlacaServico(servico)) {
      Alert.alert(
        'Placa obrigatória',
        'Informe a placa do veículo antes de marcar chegada na origem.'
      );
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/app/servicos/${servicoId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, detalhe: `Status atualizado pelo app: ${status}` }),
      });

      const data = await response.json();

      if (!data.ok) {
        Alert.alert('Erro', data.erro || 'Não foi possível atualizar.');
        return;
      }

      Alert.alert('Sucesso', `Status atualizado: ${status}`);
      carregarServicos(motorista.id);
    } catch {
      Alert.alert('Erro', 'Falha de conexão ao atualizar status.');
    }
  }

  useEffect(() => {
    if (!logado || !motorista?.id) return;

    const intervalo = setInterval(() => {
      carregarServicos(motorista.id);
      enviarLocalizacao(motorista.id);
    }, 5000);

    return () => clearInterval(intervalo);
  }, [logado, motorista]);

  function sair() {
    void clearMotoristaSession();
    setLogado(false);
    setMotorista(null);
    setServicos([]);
    idsAnteriores.current = [];
    debugLog('session', 'logout', 'voltou tela login');
  }

  if (restaurandoSessao) {
    return (
      <View style={[styles.container, styles.centralizado]}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (!logado) {
    return (
      <View style={styles.container}>
        <Text style={styles.titulo}>Essência Logística</Text>
        <Text style={styles.subtitulo}>Área do Motorista</Text>

        <TextInput style={styles.input} placeholder="Login" value={login} onChangeText={setLogin} />
        <TextInput style={styles.input} placeholder="Senha" secureTextEntry value={senha} onChangeText={setSenha} />
        <TextInput style={styles.input} placeholder="Placa do reboque" value={placa} onChangeText={setPlaca} />

        {DEBUG_API ? (
          <Text style={styles.debugApi} selectable>
            API: {API_BASE}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.botaoEntrar, entrando && styles.botaoEntrarDisabled]}
          onPress={entrar}
          disabled={entrando}
        >
          {entrando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.botaoTexto}>Entrar</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.tituloTopo}>Bem-vindo</Text>
      <Text style={styles.nome}>{motorista?.nome}</Text>
      <Text style={styles.info}>Placa: {motorista?.placa_atual}</Text>

      <TouchableOpacity style={styles.botaoAtualizar} onPress={() => carregarServicos(motorista.id)}>
        <Text style={styles.botaoTexto}>Atualizar Serviços</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.botaoSair} onPress={sair}>
        <Text style={styles.botaoTexto}>Sair</Text>
      </TouchableOpacity>

      <Text style={styles.servicosTitulo}>Serviços Recebidos</Text>

      {servicos.length === 0 && <Text style={styles.semServico}>Nenhum serviço disponível.</Text>}

      {servicos.map((servico) => {
        const bloqueado = servicoFinalizado(servico);

        return (
        <View key={servico.id} style={styles.card}>
          <Text style={styles.cardTitulo}>
            {servico.protocolo || 'Sem protocolo'} - {servico.tipo || ''}
          </Text>

          <Text style={styles.linha}>Seguradora: {servico.seguradora || '-'}</Text>
          <Text style={styles.linha}>Origem: {servico.origem || '-'}</Text>
          <Text style={styles.linha}>Destino: {servico.destino || '-'}</Text>
          {servico.observacao ? (
            <Text style={styles.linha}>Obs: {servico.observacao}</Text>
          ) : null}
          <Text style={styles.status}>Status: {servico.status || '-'}</Text>

          <CampoPlacaVeiculo
            servicoId={String(servico.id)}
            placaSalvaServidor={obterPlacaServico(servico)}
            bloqueado={bloqueado}
            onEnviar={(placa) => enviarPlacaServico(String(servico.id), placa)}
          />
          <TouchableOpacity
  style={styles.botaoOperacao}
  onPress={() => {
    const destino = encodeURIComponent(servico.origem || '');
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${destino}`);
  }}
>
  <Text style={styles.botaoTexto}>Abrir rota</Text>
</TouchableOpacity>
<TouchableOpacity
  style={styles.botaoFinalizar}
  onPress={() => {
    router.push({
  pathname: '/checklist',
  params: {
    servico_id: servico.id,
  },
} as any);
  }}
>
  <Text style={styles.botaoTexto}>Abrir checklist</Text>
</TouchableOpacity>

          <View style={styles.gridBotoes}>
            <TouchableOpacity style={styles.botaoOperacao} onPress={() => atualizarStatus(servico.id, 'aceito')}>
              <Text style={styles.botaoTexto}>Aceitar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.botaoRecusar} onPress={() => atualizarStatus(servico.id, 'recusado')}>
              <Text style={styles.botaoTexto}>Recusar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.botaoOperacao} onPress={() => atualizarStatus(servico.id, 'a caminho')}>
              <Text style={styles.botaoTexto}>A caminho</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.botaoOperacao} onPress={() => atualizarStatus(servico.id, 'na origem')}>
              <Text style={styles.botaoTexto}>Na origem</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.botaoOperacao} onPress={() => atualizarStatus(servico.id, 'em transporte')}>
              <Text style={styles.botaoTexto}>Em transporte</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.botaoFinalizar} onPress={() => atualizarStatus(servico.id, 'finalizado')}>
              <Text style={styles.botaoTexto}>Finalizar</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  centralizado: { justifyContent: 'center', alignItems: 'center' },
  titulo: { fontSize: 30, fontWeight: 'bold', marginTop: 80, textAlign: 'center' },
  tituloTopo: { fontSize: 26, fontWeight: 'bold', marginTop: 40, textAlign: 'center' },
  subtitulo: { fontSize: 18, color: '#666', marginBottom: 40, textAlign: 'center' },
  debugApi: { fontSize: 11, color: '#64748b', marginBottom: 12, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, marginBottom: 15 },
  botaoEntrar: { backgroundColor: '#f97316', padding: 16, borderRadius: 10 },
  botaoEntrarDisabled: { opacity: 0.7 },
  botaoAtualizar: { backgroundColor: '#2563eb', padding: 14, borderRadius: 10, marginTop: 20 },
  botaoSair: { backgroundColor: '#dc2626', padding: 14, borderRadius: 10, marginTop: 10 },
  botaoTexto: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },
  nome: { fontSize: 22, fontWeight: 'bold', marginTop: 10 },
  info: { marginTop: 5, color: '#666' },
  servicosTitulo: { fontSize: 22, fontWeight: 'bold', marginTop: 30, marginBottom: 20 },
  semServico: { color: '#666' },
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 15, marginBottom: 15 },
  cardTitulo: { fontWeight: 'bold', fontSize: 17, marginBottom: 10 },
  linha: { marginBottom: 5 },
  status: { marginTop: 8, fontWeight: 'bold' },
  gridBotoes: { marginTop: 15 },
  botaoOperacao: { backgroundColor: '#f97316', padding: 13, borderRadius: 8, marginBottom: 8 },
  botaoRecusar: { backgroundColor: '#dc2626', padding: 13, borderRadius: 8, marginBottom: 8 },
  botaoFinalizar: { backgroundColor: '#111827', padding: 13, borderRadius: 8, marginBottom: 8 },
  placaBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  placaLabel: { fontWeight: 'bold', fontSize: 15, marginBottom: 8 },
  placaSalva: { color: '#166534', fontWeight: 'bold', marginBottom: 8 },
  inputPlaca: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
    fontSize: 16,
    letterSpacing: 1,
  },
  inputPlacaBloqueado: { backgroundColor: '#f1f5f9', color: '#64748b' },
  botaoPlaca: { backgroundColor: '#16a34a', padding: 13, borderRadius: 8 },
});