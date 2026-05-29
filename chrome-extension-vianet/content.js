/**
 * Essência Exportador — captura Vianet/Mondial v4
 * Prioridade: IDs exatos dos inputs ASP.NET · fallback labels/regex
 */

const VIANET_IDS = {
  assistencia: 'ctl00_ContentPlaceHolder1_txtFileNumber',
  solicitacao: 'ctl00_ContentPlaceHolder1_txtRequestNumber',
  seguradora: 'ctl00_ContentPlaceHolder1_txtProduct',
  aceito_em: 'ctl00_ContentPlaceHolder1_txtResponseDate',
  servico: 'ctl00_ContentPlaceHolder1_txtService',
  especialidade: 'ctl00_ContentPlaceHolder1_txtSpeciality',
  prazo: 'ctl00_ContentPlaceHolder1_txtArrivalTime',
  local_origem: 'ctl00_ContentPlaceHolder1_txtAddressName',
  complemento_origem: 'ctl00_ContentPlaceHolder1_txtAddressComplement',
  bairro_origem: 'ctl00_ContentPlaceHolder1_txtDistrict',
  regiao_origem: 'ctl00_ContentPlaceHolder1_txtZoneName',
  cidade_origem: 'ctl00_ContentPlaceHolder1_txtCityName',
  uf_origem: 'ctl00_ContentPlaceHolder1_txtStateName',
  cep_origem: 'ctl00_ContentPlaceHolder1_txtZipCode',
  referencias_origem: 'ctl00_ContentPlaceHolder1_txtReference',
  problema_descricao: 'ctl00_ContentPlaceHolder1_txtProblemDescription',
  problema_resumo: 'ctl00_ContentPlaceHolder1_txtProblem',
  informacao_importante: 'ctl00_ContentPlaceHolder1_txtImportantInformation',
  segurado: 'ctl00_ContentPlaceHolder1_txtCustomerName',
  solicitante: 'ctl00_ContentPlaceHolder1_txtInsuredName',
  telefone: 'ctl00_ContentPlaceHolder1_txtPhone',
  veiculo: 'ctl00_ContentPlaceHolder1_txtVehicle',
  placa: 'ctl00_ContentPlaceHolder1_txtVehiclePlate',
  ano: 'ctl00_ContentPlaceHolder1_txtVehicleYear',
  cor: 'ctl00_ContentPlaceHolder1_txtVehicleColor',
  combustivel: 'ctl00_ContentPlaceHolder1_txtVehicleFuel',
  nome_destino: 'ctl00_ContentPlaceHolder1_txtDestinationName',
  local_destino: 'ctl00_ContentPlaceHolder1_txtDestinationAddressName',
  complemento_destino: 'ctl00_ContentPlaceHolder1_txtDestinationAddressComplement',
  referencia_destino: 'ctl00_ContentPlaceHolder1_txtReferenceDestiny',
  bairro_destino: 'ctl00_ContentPlaceHolder1_txtDestinationDistrict',
  regiao_destino: 'ctl00_ContentPlaceHolder1_txtDestinationZoneName',
  cidade_destino: 'ctl00_ContentPlaceHolder1_txtDestinationCityName',
  uf_destino: 'ctl00_ContentPlaceHolder1_txtDestinationStateName',
};

const VALORES_IGNORADOS = new Set([
  'selecionar prestador', 'selecionar', 'ok', 'fale conosco', 'gps',
  'treinamento', 'fechamento', 'duvidas', 'dúvidas', 'exportar', 'procurar',
  '-', '...',
]);

const LABELS_INVALIDOS = new Set([
  'solicitacao', 'solicitação', 'assistencia', 'assistência', 'protocolo',
  'local', 'cidade', 'uf', 'estado', 'bairro', 'cep', 'referencias',
  'referências', 'segurado', 'selecionar prestador',
]);

function normalizarTexto(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function limparValor(valor) {
  if (valor == null) return '';
  let s = String(valor).replace(/\s+/g, ' ').trim();
  s = s.replace(/^:\s*/, '');
  if (!s || s === '-' || s.toLowerCase() === 'nan') return '';
  return s;
}

function ehLabelInvalido(valor) {
  const n = normalizarTexto(valor).replace(/:$/, '');
  return LABELS_INVALIDOS.has(n) || (valor || '').trim().endsWith(':');
}

function valorInvalido(valor) {
  const s = limparValor(valor);
  if (!s) return true;
  const n = normalizarTexto(s).replace(/:$/, '');
  if (VALORES_IGNORADOS.has(n)) return true;
  if (LABELS_INVALIDOS.has(n)) return true;
  if (n.startsWith('selecionar')) return true;
  if (s.endsWith(':') && s.length < 40) return true;
  return false;
}

function extrairDigitos(valor, minLen = 1, maxLen = 12) {
  if (!valor || ehLabelInvalido(valor)) return '';
  const digits = String(valor).replace(/\D/g, '');
  if (digits.length >= minLen && digits.length <= maxLen) return digits;
  return '';
}

function valorDeInput(el) {
  if (!el) return '';
  if (el.tagName === 'SELECT') {
    const opt = el.options?.[el.selectedIndex];
    const txt = opt ? limparValor(opt.textContent) : limparValor(el.value);
    return valorInvalido(txt) || ehLabelInvalido(txt) ? '' : txt;
  }
  const v = limparValor(el.value ?? el.textContent);
  if (valorInvalido(v) || ehLabelInvalido(v)) return '';
  return v;
}

/** @returns {Array<{doc: Document|null, url: string, tipo: string, erro?: string}>} */
function getAllDocuments(win = window, acc = [], visitados = new Set(), profundidade = 0) {
  if (profundidade > 12) return acc;
  try {
    const doc = win.document;
    if (!doc || visitados.has(doc)) return acc;
    visitados.add(doc);
    acc.push({
      doc,
      url: win.location?.href || doc.URL || '',
      tipo: win === window.top ? 'principal' : 'frame',
    });

    for (const node of doc.querySelectorAll('iframe, frame')) {
      const src = node.getAttribute('src') || node.src || '(sem src)';
      try {
        const cw = node.contentWindow;
        if (cw?.document) getAllDocuments(cw, acc, visitados, profundidade + 1);
        else acc.push({ doc: null, url: src, tipo: 'iframe-sem-doc' });
      } catch (e) {
        acc.push({ doc: null, url: src, tipo: 'bloqueado', erro: e.message || String(e) });
      }
    }

    if (win.frames?.length) {
      for (let i = 0; i < win.frames.length; i++) {
        try {
          const fw = win.frames[i];
          if (fw?.document && !visitados.has(fw.document)) {
            getAllDocuments(fw, acc, visitados, profundidade + 1);
          }
        } catch (e) {
          acc.push({ doc: null, url: `frame[${i}]`, tipo: 'bloqueado', erro: e.message || String(e) });
        }
      }
    }
  } catch (e) {
    acc.push({ doc: null, url: win.location?.href || '', tipo: 'erro', erro: e.message || String(e) });
  }
  return acc;
}

function getElementByIdInDocs(docsCtx, id) {
  for (const ctx of docsCtx) {
    if (!ctx.doc) continue;
    const el = ctx.doc.getElementById(id);
    if (el) return el;
  }
  return null;
}

function valorPorId(docsCtx, id) {
  return valorDeInput(getElementByIdInDocs(docsCtx, id));
}

function montarProtocoloFinal(assistencia, solicitacao) {
  if (assistencia && solicitacao) return `${assistencia}-${solicitacao}`;
  if (assistencia) return assistencia;
  return '';
}

function assistenciaValida(assistencia) {
  return /^\d{5,12}$/.test(String(assistencia || '').replace(/\D/g, ''));
}

function protocoloValido(protocolo, assistencia) {
  if (!assistenciaValida(assistencia)) return false;
  const p = (protocolo || '').trim();
  if (!p || ehLabelInvalido(p)) return false;
  return /\d/.test(p);
}

function normalizarUf(valor) {
  const v = limparValor(valor);
  if (!v || ehLabelInvalido(v)) return '';
  const m = v.match(/\b([A-Z]{2})\b/i);
  return m ? m[1].toUpperCase() : (v.length === 2 ? v.toUpperCase() : '');
}

function normalizarCep(valor) {
  const d = String(valor || '').replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  if (d.length >= 5 && d.length <= 8) return d;
  return '';
}

function combinarServico(servico, especialidade) {
  const partes = [servico, especialidade].map((s) => limparValor(s)).filter(Boolean);
  return partes.join(' — ');
}

function combinarProblema(descricao, resumo, informacao) {
  const principal = limparValor(descricao) || limparValor(resumo);
  const info = limparValor(informacao);
  if (principal && info) return `${principal} | Info: ${info}`;
  return principal || info || '';
}

/** Fallback: busca número de assistência no texto visível */
function fallbackAssistencia(texto) {
  const re = /assist[eê]ncia\s*:?\s*(\d{5,12})/i;
  const m = (texto || '').match(re);
  return m?.[1] || '';
}

function fallbackSolicitacao(texto) {
  const re = /solicita[cç][aã]o\s*:?\s*(\d{1,4})/i;
  const m = (texto || '').match(re);
  return m?.[1] || '';
}

function coletarTextoVisivel(docsCtx) {
  const partes = [];
  for (const ctx of docsCtx) {
    if (!ctx.doc?.body) continue;
    try {
      const t = ctx.doc.body.innerText || '';
      if (t.trim()) partes.push(t);
    } catch (e) {
      /* ignore */
    }
  }
  return partes.join('\n\n');
}

function coletarInputsDeDocumento(doc, docUrl) {
  const lista = [];
  if (!doc) return lista;
  doc.querySelectorAll('input, textarea, select').forEach((el) => {
    lista.push({
      name: el.name || '',
      id: el.id || '',
      value: limparValor(el.value),
      placeholder: el.placeholder || '',
      type: el.type || el.tagName.toLowerCase(),
      docUrl: docUrl || '',
    });
  });
  return lista;
}

function montarDebugIds(docsCtx) {
  return Object.entries(VIANET_IDS).map(([campo, id]) => ({
    campo,
    id,
    valor: valorPorId(docsCtx, id),
    encontrado: !!getElementByIdInDocs(docsCtx, id),
  }));
}

function capturarPorIds(docsCtx, textoCompleto) {
  let assistencia = extrairDigitos(valorPorId(docsCtx, VIANET_IDS.assistencia), 5, 12);
  let solicitacao = extrairDigitos(valorPorId(docsCtx, VIANET_IDS.solicitacao), 1, 4);

  if (!assistencia) assistencia = fallbackAssistencia(textoCompleto);
  if (!solicitacao) solicitacao = fallbackSolicitacao(textoCompleto);

  const protocolo = montarProtocoloFinal(assistencia, solicitacao);

  const servicoBase = valorPorId(docsCtx, VIANET_IDS.servico);
  const especialidade = valorPorId(docsCtx, VIANET_IDS.especialidade);
  const servico = combinarServico(servicoBase, especialidade);

  const problema = combinarProblema(
    valorPorId(docsCtx, VIANET_IDS.problema_descricao),
    valorPorId(docsCtx, VIANET_IDS.problema_resumo),
    valorPorId(docsCtx, VIANET_IDS.informacao_importante)
  );

  const ufOrigem = normalizarUf(valorPorId(docsCtx, VIANET_IDS.uf_origem));
  const ufDestino = normalizarUf(valorPorId(docsCtx, VIANET_IDS.uf_destino));

  const dados = {
    assistencia,
    solicitacao,
    protocolo,
    seguradora: valorPorId(docsCtx, VIANET_IDS.seguradora),
    servico,
    especialidade,
    tipo_servico: servico,
    aceito_em: valorPorId(docsCtx, VIANET_IDS.aceito_em),
    prazo: valorPorId(docsCtx, VIANET_IDS.prazo),
    local_origem: valorPorId(docsCtx, VIANET_IDS.local_origem),
    complemento_origem: valorPorId(docsCtx, VIANET_IDS.complemento_origem),
    bairro_origem: valorPorId(docsCtx, VIANET_IDS.bairro_origem),
    regiao_origem: valorPorId(docsCtx, VIANET_IDS.regiao_origem),
    cidade_origem: valorPorId(docsCtx, VIANET_IDS.cidade_origem),
    estado_origem: ufOrigem,
    uf_origem: ufOrigem,
    cep_origem: normalizarCep(valorPorId(docsCtx, VIANET_IDS.cep_origem)),
    referencias_origem: valorPorId(docsCtx, VIANET_IDS.referencias_origem),
    problema,
    informacao_importante: valorPorId(docsCtx, VIANET_IDS.informacao_importante),
    segurado: valorPorId(docsCtx, VIANET_IDS.segurado),
    solicitante: valorPorId(docsCtx, VIANET_IDS.solicitante),
    telefone: valorPorId(docsCtx, VIANET_IDS.telefone),
    veiculo: valorPorId(docsCtx, VIANET_IDS.veiculo),
    placa: valorPorId(docsCtx, VIANET_IDS.placa),
    ano: valorPorId(docsCtx, VIANET_IDS.ano),
    cor: valorPorId(docsCtx, VIANET_IDS.cor),
    combustivel: valorPorId(docsCtx, VIANET_IDS.combustivel),
    nome_destino: valorPorId(docsCtx, VIANET_IDS.nome_destino),
    local_destino: valorPorId(docsCtx, VIANET_IDS.local_destino),
    complemento_destino: valorPorId(docsCtx, VIANET_IDS.complemento_destino),
    bairro_destino: valorPorId(docsCtx, VIANET_IDS.bairro_destino),
    regiao_destino: valorPorId(docsCtx, VIANET_IDS.regiao_destino),
    cidade_destino: valorPorId(docsCtx, VIANET_IDS.cidade_destino),
    estado_destino: ufDestino,
    uf_destino: ufDestino,
    cep_destino: '',
    referencia_destino: valorPorId(docsCtx, VIANET_IDS.referencia_destino),
    _captura: 'ids-v4',
  };

  return dados;
}

function scoreDados(dados, docsCtx) {
  let s = 0;
  if (getElementByIdInDocs(docsCtx, VIANET_IDS.assistencia)) s += 50;
  if (assistenciaValida(dados.assistencia)) s += 100;
  if (protocoloValido(dados.protocolo, dados.assistencia)) s += 80;
  if (dados.segurado) s += 10;
  if (dados.local_origem) s += 10;
  if (dados.cidade_origem) s += 10;
  const idsPreenchidos = montarDebugIds(docsCtx).filter((i) => i.valor).length;
  s += idsPreenchidos * 3;
  return s;
}

function montarDebug(docsCtx, inputs, textoCompleto, frameUrl) {
  const docsComAcesso = docsCtx.filter((d) => d.doc);
  const idsDebug = montarDebugIds(docsCtx);

  return {
    url_aba: frameUrl || location.href,
    documents_lidos: docsComAcesso.length,
    documents_total: docsCtx.length,
    documents_bloqueados: docsCtx.filter((d) => !d.doc).map((d) => ({
      url: d.url,
      tipo: d.tipo,
      erro: d.erro || '',
    })),
    total_inputs: inputs.length,
    ids_mapeados: idsDebug,
    ids_encontrados: idsDebug.filter((i) => i.encontrado).length,
    ids_com_valor: idsDebug.filter((i) => i.valor).length,
    texto_visivel_3000: (textoCompleto || '').slice(0, 3000),
    inputs_amostra: inputs.slice(0, 80),
    frame_url: frameUrl || location.href,
    is_top_frame: window === window.top,
  };
}

function capturarNesteFrame() {
  const docsCtx = getAllDocuments(window);
  const inputs = [];
  for (const ctx of docsCtx) {
    if (ctx.doc) inputs.push(...coletarInputsDeDocumento(ctx.doc, ctx.url));
  }

  const textoCompleto = coletarTextoVisivel(docsCtx);
  const dados = capturarPorIds(docsCtx, textoCompleto);
  const debug = montarDebug(docsCtx, inputs, textoCompleto, location.href);

  return {
    dados,
    debug,
    score: scoreDados(dados, docsCtx),
    frameUrl: location.href,
    isTop: window === window.top,
  };
}

window.__ESSENCIA_CAPTURAR_FRAME__ = () => capturarNesteFrame();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.acao === 'capturar-frame') {
    try {
      sendResponse({ ok: true, resultado: capturarNesteFrame() });
    } catch (err) {
      sendResponse({ ok: false, erro: String(err) });
    }
  }
  return true;
});
