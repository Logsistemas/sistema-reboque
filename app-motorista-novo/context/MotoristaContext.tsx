import * as Location from 'expo-location';
import { router } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Linking, Vibration } from 'react-native';

import { API_BASE, DEBUG_API, debugLog, formatFetchError } from '../config/api';
import { registrarPushMotorista } from '../lib/pushNotifications';
import {
  clearMotoristaSession,
  loadMotoristaSession,
  parseLoginResponse,
  saveMotoristaSession,
  type MotoristaSessao,
} from '../lib/auth';
import {
  formatarPlaca,
  obterPlacaServico,
  placaValida,
  servicoEmAndamento,
  servicoFinalizado,
  servicoRecusado,
  servicoSomenteLeitura,
} from '../lib/servico';

type MotoristaContextValue = {
  logado: boolean;
  restaurandoSessao: boolean;
  entrando: boolean;
  motorista: MotoristaSessao | null;
  servicos: any[];
  historicoServicos: any[];
  carregandoHistorico: boolean;
  login: string;
  senha: string;
  placa: string;
  setLogin: (v: string) => void;
  setSenha: (v: string) => void;
  setPlaca: (v: string) => void;
  entrar: () => Promise<void>;
  sair: () => void;
  carregarServicos: (mid?: string, primeiraCarga?: boolean) => Promise<void>;
  carregarHistorico: (mid?: string) => Promise<void>;
  enviarPlacaServico: (servicoId: string, placa: string) => Promise<boolean>;
  atualizarStatus: (servicoId: string, status: string) => Promise<void>;
  abrirRota: (servico: any) => void;
  abrirRotaWaze: (servico: any) => void;
  abrirChecklist: (servico: any) => void;
  abrirDetalhe: (servico: any) => void;
  resumoDia: { recebidos: number; andamento: number; concluidos: number };
  obterServicoPorId: (id: string) => any | undefined;
  pushPermissaoNegada: boolean;
  registrarPush: () => Promise<void>;
};

const MotoristaContext = createContext<MotoristaContextValue | null>(null);

export function MotoristaProvider({ children }: { children: React.ReactNode }) {
  const [logado, setLogado] = useState(false);
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [placa, setPlaca] = useState('');
  const [motorista, setMotorista] = useState<MotoristaSessao | null>(null);
  const [servicos, setServicos] = useState<any[]>([]);
  const [historicoServicos, setHistoricoServicos] = useState<any[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [pushPermissaoNegada, setPushPermissaoNegada] = useState(false);
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

  const carregarServicos = useCallback(async (mid?: string, primeiraCarga = false) => {
    const motoristaId = mid || motorista?.id;
    if (!motoristaId) return;

    const url = `${API_BASE}/api/app/motorista/${motoristaId}/servicos`;
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
  }, [motorista?.id]);

  const carregarHistorico = useCallback(async (mid?: string) => {
    const motoristaId = mid || motorista?.id;
    if (!motoristaId) return;

    const url = `${API_BASE}/api/app/motorista/${motoristaId}/historico`;
    debugLog('historico', 'GET', url);
    setCarregandoHistorico(true);
    try {
      const response = await fetch(url);
      const data = await response.json();
      debugLog('historico', 'status', response.status, 'qtd', data.servicos?.length ?? 0);

      if (data.ok) {
        setHistoricoServicos(data.servicos || []);
      }
    } catch (err) {
      debugLog('historico', 'ERRO conexao', err);
      Alert.alert('Erro', 'Falha ao carregar histórico.');
    } finally {
      setCarregandoHistorico(false);
    }
  }, [motorista?.id]);

  const registrarPush = useCallback(async () => {
    if (!motorista?.id) return;
    const resultado = await registrarPushMotorista(motorista.id);
    setPushPermissaoNegada(!!resultado.permissaoNegada);
    if (resultado.ok) {
      debugLog('push', 'token registrado para', motorista.id, resultado.token);
    } else if (resultado.semToken) {
      debugLog('push', 'sem token — verifique EAS projectId (npx eas init)');
    }
  }, [motorista?.id]);

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
  }, [carregarServicos]);

  async function enviarPlacaServico(servicoId: string, placaEnviar: string): Promise<boolean> {
    const servico =
      servicos.find((s) => s.id === servicoId) ||
      historicoServicos.find((s) => s.id === servicoId);

    if (servico && servicoSomenteLeitura(servico)) {
      Alert.alert('Serviço encerrado', 'Não é possível alterar a placa deste serviço.');
      return false;
    }

    try {
      const response = await fetch(`${API_BASE}/api/app/servicos/${servicoId}/placa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: placaEnviar }),
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
                placa_veiculo_removido: placaEnviar,
                placa_removida: placaEnviar,
              }
            : s
        )
      );
      if (motorista?.id) carregarServicos(motorista.id);
      return true;
    } catch {
      Alert.alert('Erro', 'Falha de conexão ao enviar a placa.');
      return false;
    }
  }

  async function atualizarStatus(servicoId: string, status: string) {
    const servico =
      servicos.find((s) => s.id === servicoId) ||
      historicoServicos.find((s) => s.id === servicoId);

    if (servico && servicoSomenteLeitura(servico)) {
      Alert.alert('Serviço encerrado', 'Não é possível alterar o status deste serviço.');
      return;
    }

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
      if (motorista?.id) carregarServicos(motorista.id);
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
  }, [logado, motorista, carregarServicos]);

  function sair() {
    void clearMotoristaSession();
    setLogado(false);
    setMotorista(null);
    setServicos([]);
    setHistoricoServicos([]);
    setPushPermissaoNegada(false);
    idsAnteriores.current = [];
    debugLog('session', 'logout', 'voltou tela login');
  }

  function abrirRota(servico: any) {
    const destino = encodeURIComponent(servico.origem || '');
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${destino}`);
  }

  function abrirRotaWaze(servico: any) {
    const endereco = encodeURIComponent(servico.origem || '');
    Linking.openURL(`https://waze.com/ul?q=${endereco}&navigate=yes`);
  }

  function abrirChecklist(servico: any) {
    router.push({
      pathname: '/checklist',
      params: {
        servico_id: servico.id,
        tipo_servico: servico.tipo || '',
        observacao: servico.observacao || '',
      },
    } as any);
  }

  function abrirDetalhe(servico: any) {
    router.push(`/servico/${servico.id}` as any);
  }

  function obterServicoPorId(id: string) {
    return (
      servicos.find((s) => String(s.id) === String(id)) ||
      historicoServicos.find((s) => String(s.id) === String(id))
    );
  }

  const resumoDia = useMemo(() => ({
    recebidos: servicos.length,
    andamento: servicos.filter((s) => servicoEmAndamento(s)).length,
    concluidos: servicos.filter((s) => servicoFinalizado(s)).length,
  }), [servicos]);

  const value: MotoristaContextValue = {
    logado,
    restaurandoSessao,
    entrando,
    motorista,
    servicos,
    historicoServicos,
    carregandoHistorico,
    login,
    senha,
    placa,
    setLogin,
    setSenha,
    setPlaca,
    entrar,
    sair,
    carregarServicos,
    carregarHistorico,
    enviarPlacaServico,
    atualizarStatus,
    abrirRota,
    abrirRotaWaze,
    abrirChecklist,
    abrirDetalhe,
    resumoDia,
    obterServicoPorId,
    pushPermissaoNegada,
    registrarPush,
  };

  return <MotoristaContext.Provider value={value}>{children}</MotoristaContext.Provider>;
}

export function useMotorista() {
  const ctx = useContext(MotoristaContext);
  if (!ctx) throw new Error('useMotorista deve ser usado dentro de MotoristaProvider');
  return ctx;
}

export { formatarPlaca, placaValida, obterPlacaServico, servicoFinalizado, servicoRecusado, servicoEmAndamento, servicoSomenteLeitura };
