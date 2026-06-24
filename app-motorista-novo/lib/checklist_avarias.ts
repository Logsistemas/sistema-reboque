import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE } from '../config/api';

export type TipoVeiculo = 'leve' | 'utilitario' | 'pesado' | 'moto';

export type MarcacaoAvaria = {
  x: number;
  y: number;
  id: number;
  parte?: string;
  tipoVeiculo?: TipoVeiculo;
  criadoEm?: string;
};

export const PARTES_CHECKLIST = [
  'Frente',
  'Traseira',
  'Lateral esquerda',
  'Lateral direita',
  'Teto',
  'Rodas',
  'Vidros',
  'Parachoque',
  'Faróis',
  'Lanternas',
] as const;

const CAMPOS_TIPO_SERVICO = [
  'tipo_servico',
  'tipo',
  'categoria',
  'descricao_servico',
  'descricao',
  'tipo_veiculo',
  'observacao',
  'obs',
] as const;

const IMAGENS_LEVE: Record<string, number> = {
  Frente: require('../assets/checklist/carro-frente.png'),
  Traseira: require('../assets/checklist/carro-traseira.png'),
  'Lateral esquerda': require('../assets/checklist/carro-lateral-esquerda.png'),
  'Lateral direita': require('../assets/checklist/carro-lateral-direita.png'),
  Teto: require('../assets/checklist/carro-frente.png'),
  Rodas: require('../assets/checklist/carro-lateral-esquerda.png'),
  Vidros: require('../assets/checklist/carro-frente.png'),
  Parachoque: require('../assets/checklist/carro-traseira.png'),
  Faróis: require('../assets/checklist/carro-frente.png'),
  Lanternas: require('../assets/checklist/carro-traseira.png'),
};

const IMAGENS_UTILITARIO: Record<string, number> = {
  Frente: require('../assets/checklist/utilitario_frente.png'),
  Traseira: require('../assets/checklist/utilitario_traseira.png'),
  'Lateral esquerda': require('../assets/checklist/utilitario_lateral_esquerda.png'),
  'Lateral direita': require('../assets/checklist/utilitario_lateral_direita.png'),
  Teto: require('../assets/checklist/utilitario_frente.png'),
  Rodas: require('../assets/checklist/utilitario_lateral_esquerda.png'),
  Vidros: require('../assets/checklist/utilitario_frente.png'),
  Parachoque: require('../assets/checklist/utilitario_traseira.png'),
  Faróis: require('../assets/checklist/utilitario_frente.png'),
  Lanternas: require('../assets/checklist/utilitario_traseira.png'),
};

const IMAGENS_PESADO: Record<string, number> = {
  Frente: require('../assets/checklist/pesado_frente.png'),
  Traseira: require('../assets/checklist/pesado_traseira.png'),
  'Lateral esquerda': require('../assets/checklist/pesado_lateral_esquerda.png'),
  'Lateral direita': require('../assets/checklist/pesado_lateral_direita.png'),
  Teto: require('../assets/checklist/pesado_frente.png'),
  Rodas: require('../assets/checklist/pesado_lateral_esquerda.png'),
  Vidros: require('../assets/checklist/pesado_frente.png'),
  Parachoque: require('../assets/checklist/pesado_traseira.png'),
  Faróis: require('../assets/checklist/pesado_frente.png'),
  Lanternas: require('../assets/checklist/pesado_traseira.png'),
};

const IMAGENS_MOTO: Record<string, number> = {
  Frente: require('../assets/checklist/moto_frente.png'),
  Traseira: require('../assets/checklist/moto_traseira.png'),
  'Lateral esquerda': require('../assets/checklist/moto_lateral_esquerda.png'),
  'Lateral direita': require('../assets/checklist/moto_lateral_direita.png'),
  Teto: require('../assets/checklist/moto_frente.png'),
  Rodas: require('../assets/checklist/moto_lateral_esquerda.png'),
  Vidros: require('../assets/checklist/moto_frente.png'),
  Parachoque: require('../assets/checklist/moto_traseira.png'),
  Faróis: require('../assets/checklist/moto_frente.png'),
  Lanternas: require('../assets/checklist/moto_traseira.png'),
};

const MAPAS_IMAGEM: Record<TipoVeiculo, Record<string, number>> = {
  leve: IMAGENS_LEVE,
  utilitario: IMAGENS_UTILITARIO,
  pesado: IMAGENS_PESADO,
  moto: IMAGENS_MOTO,
};

const REMOTE_IMAGENS: Record<TipoVeiculo, Record<string, string>> = {
  leve: {
    Frente: 'carro-frente.png',
    Traseira: 'carro-traseira.png',
    'Lateral esquerda': 'carro-lateral-esquerda.png',
    'Lateral direita': 'carro-lateral-direita.png',
  },
  utilitario: {
    Frente: 'utilitario_frente.png',
    Traseira: 'utilitario_traseira.png',
    'Lateral esquerda': 'utilitario_lateral_esquerda.png',
    'Lateral direita': 'utilitario_lateral_direita.png',
  },
  pesado: {
    Frente: 'pesado_frente.png',
    Traseira: 'pesado_traseira.png',
    'Lateral esquerda': 'pesado_lateral_esquerda.png',
    'Lateral direita': 'pesado_lateral_direita.png',
  },
  moto: {
    Frente: 'moto_frente.png',
    Traseira: 'moto_traseira.png',
    'Lateral esquerda': 'moto_lateral_esquerda.png',
    'Lateral direita': 'moto_lateral_direita.png',
  },
};

export function normalizarTextoTipo(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[—–\-_/|\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function coletarTextoTipoServico(
  ...fontes: Array<string | Record<string, unknown> | null | undefined>
): string {
  const partes: string[] = [];

  for (const fonte of fontes) {
    if (!fonte) continue;

    if (typeof fonte === 'string') {
      const txt = fonte.trim();
      if (txt) partes.push(txt);
      continue;
    }

    for (const campo of CAMPOS_TIPO_SERVICO) {
      const valor = fonte[campo];
      if (valor !== null && valor !== undefined && String(valor).trim()) {
        partes.push(String(valor));
      }
    }
  }

  return normalizarTextoTipo(partes.join(' '));
}

/**
 * Ordem: pesado → moto → utilitário → leve.
 * "REBOQUE — EXTRA PESADO" deve retornar pesado, nunca leve.
 */
export function inferirTipoVeiculo(
  ...fontes: Array<string | Record<string, unknown> | null | undefined>
): TipoVeiculo {
  const t = coletarTextoTipoServico(...fontes);
  if (!t) return 'leve';

  if (
    /\bEXTRA\s+PESAD|\bPESAD(O|S)\b|\bPESAD\b|CAMINHAO|CAMINHÃO|PRANCHAO|PRANCHÃO|BITREM|RODOTREM|CARRETA|\bTRUCK\b|R\s*E\s*PES|R\s*L\s*PES|REBOQUE\s+PES|GUINCHO\s+PES|\bR\s+E\s+PES|\bR\s+L\s+PES/.test(
      t
    )
  ) {
    return 'pesado';
  }

  if (/\bMOTO(CICLETA)?S?\b/.test(t)) {
    return 'moto';
  }

  if (
    /UTILIT|UTILITÁRIO|\bSUV\b|\bVAN\b|PICK\s*UP|PICKUP|FURG|SPRINTER|MASTER|DUCATO|GUINAUTO/.test(
      t
    )
  ) {
    return 'utilitario';
  }

  if (
    /\bLEVE\b|C\s*MEC|MECANICA\s*LEVE|AUTOMOVEL|AUTOMÓVEL|REBOQUE\s*LEVE|\bPATIN/.test(
      t
    )
  ) {
    return 'leve';
  }

  if (/\bPES\b/.test(t)) {
    return 'pesado';
  }

  return 'leve';
}

export function labelTipoVeiculo(tipo: TipoVeiculo) {
  if (tipo === 'pesado') return 'Veículo pesado';
  if (tipo === 'utilitario') return 'Utilitário / SUV / Van';
  if (tipo === 'moto') return 'Motocicleta';
  return 'Veículo leve';
}

export function imagemLocalParte(parte: string, tipo: TipoVeiculo): number | null {
  const map = MAPAS_IMAGEM[tipo] || IMAGENS_LEVE;
  return map[parte] ?? map.Frente ?? null;
}

/** Nome do arquivo PNG (debug / validação no Expo). */
export function nomeAssetChecklist(parte: string, tipo: TipoVeiculo): string {
  const porTipo: Record<TipoVeiculo, Record<string, string>> = {
    leve: {
      Frente: 'carro-frente.png',
      Traseira: 'carro-traseira.png',
      'Lateral esquerda': 'carro-lateral-esquerda.png',
      'Lateral direita': 'carro-lateral-direita.png',
    },
    utilitario: {
      Frente: 'utilitario_frente.png',
      Traseira: 'utilitario_traseira.png',
      'Lateral esquerda': 'utilitario_lateral_esquerda.png',
      'Lateral direita': 'utilitario_lateral_direita.png',
    },
    pesado: {
      Frente: 'pesado_frente.png',
      Traseira: 'pesado_traseira.png',
      'Lateral esquerda': 'pesado_lateral_esquerda.png',
      'Lateral direita': 'pesado_lateral_direita.png',
    },
    moto: {
      Frente: 'moto_frente.png',
      Traseira: 'moto_traseira.png',
      'Lateral esquerda': 'moto_lateral_esquerda.png',
      'Lateral direita': 'moto_lateral_direita.png',
    },
  };
  const map = porTipo[tipo] || porTipo.leve;
  return map[parte] || map.Frente || 'carro-frente.png';
}

export function imagemRemotaParte(parte: string, tipo: TipoVeiculo): string | null {
  const map = REMOTE_IMAGENS[tipo] || REMOTE_IMAGENS.leve;
  const arquivo = map[parte] || map.Frente;
  if (!arquivo) return null;
  return `${API_BASE.replace(/\/$/, '')}/static/checklist/${arquivo}`;
}

export function tituloParte(parte: string) {
  const map: Record<string, string> = {
    Frente: 'Frente do veículo',
    Traseira: 'Traseira do veículo',
    'Lateral esquerda': 'Lateral esquerda',
    'Lateral direita': 'Lateral direita',
    Teto: 'Teto',
    Rodas: 'Rodas',
    Vidros: 'Vidros',
    Parachoque: 'Parachoque',
    Faróis: 'Faróis',
    Lanternas: 'Lanternas',
  };
  return map[parte] || parte;
}

export function resumoParte(marcacoes: MarcacaoAvaria[] | undefined, fotos: string[] | undefined) {
  const qtdMarc = marcacoes?.length || 0;
  const qtdFotos = fotos?.length || 0;
  if (qtdMarc === 0 && qtdFotos === 0) {
    return 'Sem avarias';
  }
  const linhas: string[] = [];
  if (qtdMarc === 1) linhas.push('1 avaria constatada');
  else if (qtdMarc > 1) linhas.push(`${qtdMarc} avarias constatadas`);
  if (qtdFotos === 1) linhas.push('1 foto anexada');
  else linhas.push(`${qtdFotos} fotos anexadas`);
  return linhas.join('\n');
}

/** Converte toque (px no container) em % sobre a área real da imagem (resizeMode contain). */
export function toqueParaPercentual(
  xPx: number,
  yPx: number,
  containerW: number,
  containerH: number,
  imagemW: number,
  imagemH: number
): { x: number; y: number } | null {
  if (containerW <= 0 || containerH <= 0 || imagemW <= 0 || imagemH <= 0) {
    return null;
  }

  const escala = Math.min(containerW / imagemW, containerH / imagemH);
  const renderW = imagemW * escala;
  const renderH = imagemH * escala;
  const offsetX = (containerW - renderW) / 2;
  const offsetY = (containerH - renderH) / 2;

  const relX = xPx - offsetX;
  const relY = yPx - offsetY;
  if (relX < 0 || relY < 0 || relX > renderW || relY > renderH) {
    return null;
  }

  return {
    x: Math.round((relX / renderW) * 1000) / 10,
    y: Math.round((relY / renderH) * 1000) / 10,
  };
}

/** Posição % da marcação → coordenadas no container (para overlay com contain). */
export function percentualParaPosicaoContainer(
  xPct: number,
  yPct: number,
  containerW: number,
  containerH: number,
  imagemW: number,
  imagemH: number
): { leftPct: number; topPct: number } {
  if (containerW <= 0 || containerH <= 0 || imagemW <= 0 || imagemH <= 0) {
    return { leftPct: xPct, topPct: yPct };
  }

  const escala = Math.min(containerW / imagemW, containerH / imagemH);
  const renderW = imagemW * escala;
  const renderH = imagemH * escala;
  const offsetX = (containerW - renderW) / 2;
  const offsetY = (containerH - renderH) / 2;

  const leftPx = offsetX + (xPct / 100) * renderW;
  const topPx = offsetY + (yPct / 100) * renderH;

  return {
    leftPct: (leftPx / containerW) * 100,
    topPct: (topPx / containerH) * 100,
  };
}

const DRAFT_PREFIX = '@essencia_checklist_draft:';

export async function salvarRascunhoChecklist(
  servicoId: string,
  dados: {
    marcacoes: Record<string, MarcacaoAvaria[]>;
    fotos: Record<string, string[]>;
    observacoes?: Record<string, string>;
  }
) {
  if (!servicoId) return;
  await AsyncStorage.setItem(`${DRAFT_PREFIX}${servicoId}`, JSON.stringify(dados));
}

export async function carregarRascunhoChecklist(servicoId: string) {
  if (!servicoId) return null;
  const json = await AsyncStorage.getItem(`${DRAFT_PREFIX}${servicoId}`);
  if (!json) return null;
  try {
    return JSON.parse(json) as {
      marcacoes: Record<string, MarcacaoAvaria[]>;
      fotos: Record<string, string[]>;
      observacoes?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

export async function limparRascunhoChecklist(servicoId: string) {
  if (!servicoId) return;
  await AsyncStorage.removeItem(`${DRAFT_PREFIX}${servicoId}`);
}

/** Converte asset do ImagePicker em data URI para envio à Central. */
export function fotoAssetParaChecklist(asset: {
  uri?: string;
  base64?: string | null;
  mimeType?: string | null;
}): string {
  if (asset.base64) {
    const mime = asset.mimeType || 'image/jpeg';
    const dataUri = `data:${mime};base64,${asset.base64}`;
    console.log('[CHECKLIST FOTO] capturada base64=true tamanho=', asset.base64.length);
    return dataUri;
  }
  const uri = String(asset.uri || '');
  console.log('[CHECKLIST FOTO] capturada base64=false uri=', uri.substring(0, 48));
  return uri;
}

/** Converte URI local em data URI no envio final (fallback para fotos antigas). */
export async function uriFotoParaEnvio(uri: string): Promise<string> {
  const u = String(uri || '').trim();
  if (!u) return u;
  if (u.startsWith('data:image')) return u;
  if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/static/')) return u;

  const low = u.toLowerCase();
  if (!low.startsWith('file://') && !low.startsWith('content://') && !low.startsWith('ph://')) {
    return u;
  }

  try {
    const FileSystem = await import('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(u, {
      encoding: 'base64',
    });
    if (base64) {
      console.log('[CHECKLIST FOTO] convertida file->base64 tamanho=', base64.length);
      return `data:image/jpeg;base64,${base64}`;
    }
  } catch (err) {
    console.log('[CHECKLIST FOTO] falha converter file uri', err);
  }

  return u;
}

export async function fotosParteParaEnvio(fotos: string[] = []): Promise<string[]> {
  const saida: string[] = [];
  for (const foto of fotos) {
    saida.push(await uriFotoParaEnvio(foto));
  }
  return saida;
}

export async function checklistFotosParaEnvio(
  fotosAvarias: Record<string, string[]>
): Promise<Record<string, string[]>> {
  const partes = Object.keys(fotosAvarias || {});
  const saida: Record<string, string[]> = {};
  await Promise.all(
    partes.map(async (parte) => {
      saida[parte] = await fotosParteParaEnvio(fotosAvarias[parte] || []);
    })
  );
  return saida;
}

export const RAIO_TOQUE_REMOCAO = 5;

export function indiceMarcacaoProxima(
  marcacoes: MarcacaoAvaria[],
  xPct: number,
  yPct: number,
  raio = RAIO_TOQUE_REMOCAO
) {
  return marcacoes.findIndex(
    (m) => Math.abs(Number(m.x) - xPct) <= raio && Math.abs(Number(m.y) - yPct) <= raio
  );
}
