const CAMPOS_PREVIEW = [
  ['Assistência', 'assistencia'],
  ['Solicitação', 'solicitacao'],
  ['Protocolo final', 'protocolo'],
  ['Seguradora', 'seguradora'],
  ['Serviço', 'servico'],
  ['Aceito em', 'aceito_em'],
  ['Prazo', 'prazo'],
  ['Origem local', 'local_origem'],
  ['Origem bairro', 'bairro_origem'],
  ['Origem região', 'regiao_origem'],
  ['Origem cidade', 'cidade_origem'],
  ['Origem UF', 'uf_origem'],
  ['Origem CEP', 'cep_origem'],
  ['Origem referência', 'referencias_origem'],
  ['Destino nome', 'nome_destino'],
  ['Destino local', 'local_destino'],
  ['Destino bairro', 'bairro_destino'],
  ['Destino região', 'regiao_destino'],
  ['Destino cidade', 'cidade_destino'],
  ['Destino UF', 'uf_destino'],
  ['Destino referência', 'referencia_destino'],
  ['Segurado', 'segurado'],
  ['Solicitante', 'solicitante'],
  ['Telefone', 'telefone'],
  ['Veículo', 'veiculo'],
  ['Placa', 'placa'],
  ['Problema', 'problema'],
];

let dadosCapturados = null;
let debugCaptura = null;
let debugVisivel = false;

const btnCapturar = document.getElementById('btnCapturar');
const btnEnviar = document.getElementById('btnEnviar');
const btnDebug = document.getElementById('btnDebug');
const statusEl = document.getElementById('status');
const previewEl = document.getElementById('preview');
const debugEl = document.getElementById('debug');
const apiBaseEl = document.getElementById('apiBase');

chrome.storage.local.get(['apiBase'], (res) => {
  if (res.apiBase) apiBaseEl.value = res.apiBase;
});

function mostrarStatus(tipo, texto) {
  statusEl.className = `status ${tipo}`;
  statusEl.textContent = texto;
}

function assistenciaValida(assistencia) {
  const digits = String(assistencia || '').replace(/\D/g, '');
  return digits.length >= 5 && digits.length <= 12;
}

function protocoloValido(protocolo, assistencia) {
  if (!assistenciaValida(assistencia)) return false;
  const p = (protocolo || '').trim();
  if (!p) return false;
  const labels = [
    'solicitação:', 'solicitacao:', 'assistência:', 'assistencia:',
    'protocolo:', 'local:', 'cidade:', 'uf:', 'bairro:', 'cep:',
    'segurado:', 'selecionar prestador',
  ];
  const lower = p.toLowerCase();
  if (labels.some((l) => lower === l || lower === l.replace(':', ''))) return false;
  if (p.endsWith(':') && p.length < 40) return false;
  return /\d/.test(p);
}

function capturaValida(dados) {
  return protocoloValido(dados?.protocolo, dados?.assistencia);
}

function escapeHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderPreview(dados) {
  const linhas = CAMPOS_PREVIEW.map(([rotulo, chave]) => {
    const val =
      (dados[chave] || (chave.includes('uf_') ? dados[chave.replace('uf_', 'estado_')] : '') || '')
        .trim() || '-';
    return `<dt>${rotulo}</dt><dd>${escapeHtml(val)}</dd>`;
  }).join('');

  previewEl.innerHTML = `<h3>Preview capturado (IDs Vianet)</h3><dl>${linhas}</dl>`;
}

function renderDebug(debug) {
  if (!debug || !debugEl) return;

  const inputsHtml = (debug.inputs_amostra || [])
    .map(
      (inp) =>
        `<tr>
          <td>${escapeHtml(inp.name)}</td>
          <td>${escapeHtml(inp.id)}</td>
          <td>${escapeHtml(inp.value)}</td>
          <td>${escapeHtml(inp.placeholder)}</td>
          <td>${escapeHtml(inp.type)}</td>
        </tr>`
    )
    .join('');

  const framesHtml = (debug.frames_resumo || [])
    .map(
      (f) =>
        `<li>${escapeHtml(f.url)} — score ${f.score} — protocolo: ${escapeHtml(f.protocolo || '-')} ${f.isTop ? '(top)' : ''}</li>`
    )
    .join('');

  const bloqueadosHtml = (debug.documents_bloqueados || [])
    .map((b) => `<li>${escapeHtml(b.url)} (${escapeHtml(b.tipo)}) ${escapeHtml(b.erro || '')}</li>`)
    .join('');

  const idsHtml = (debug.ids_mapeados || [])
    .map(
      (item) =>
        `<tr>
          <td>${escapeHtml(item.campo)}</td>
          <td>${escapeHtml(item.id)}</td>
          <td>${item.encontrado ? 'sim' : 'não'}</td>
          <td>${escapeHtml(item.valor || '')}</td>
        </tr>`
    )
    .join('');

  debugEl.innerHTML = `
    <h3>Debug da captura</h3>
    <div class="debug-meta">
      <p><b>URL da aba:</b> ${escapeHtml(debug.url_aba || '-')}</p>
      <p><b>Documents/frames lidos:</b> ${debug.documents_lidos ?? 0} / ${debug.documents_total ?? 0}</p>
      <p><b>Frames capturados:</b> ${debug.frames_capturados ?? 1}</p>
      <p><b>IDs encontrados no DOM:</b> ${debug.ids_encontrados ?? 0}</p>
      <p><b>IDs com valor:</b> ${debug.ids_com_valor ?? 0}</p>
      <p><b>Inputs totais:</b> ${debug.total_inputs ?? 0}</p>
    </div>
    ${framesHtml ? `<details open><summary>Frames analisados</summary><ul class="debug-list">${framesHtml}</ul></details>` : ''}
    ${bloqueadosHtml ? `<details><summary>Iframes bloqueados</summary><ul class="debug-list">${bloqueadosHtml}</ul></details>` : ''}
    <details open>
      <summary>Campos Vianet por ID</summary>
      <div class="debug-table-wrap">
        <table class="debug-table">
          <thead><tr><th>campo</th><th>id</th><th>DOM</th><th>valor</th></tr></thead>
          <tbody>${idsHtml || '<tr><td colspan="4">Nenhum ID mapeado</td></tr>'}</tbody>
        </table>
      </div>
    </details>
    <details>
      <summary>Texto visível (3000 chars)</summary>
      <pre class="debug-pre">${escapeHtml(debug.texto_visivel_3000 || '(vazio)')}</pre>
    </details>
    <details>
      <summary>Inputs (até 80)</summary>
      <div class="debug-table-wrap">
        <table class="debug-table">
          <thead><tr><th>name</th><th>id</th><th>value</th><th>placeholder</th><th>type</th></tr></thead>
          <tbody>${inputsHtml || '<tr><td colspan="5">Nenhum input</td></tr>'}</tbody>
        </table>
      </div>
    </details>
  `;
}

function toggleDebug() {
  debugVisivel = !debugVisivel;
  if (debugEl) debugEl.style.display = debugVisivel ? 'block' : 'none';
  if (btnDebug) btnDebug.textContent = debugVisivel ? 'Ocultar debug' : 'Ver debug';
  if (debugVisivel && debugCaptura) renderDebug(debugCaptura);
}

function payloadParaEnvio(dados) {
  const copia = { ...dados };
  delete copia._debug;
  delete copia._captura;
  return copia;
}

async function obterAbaAtiva() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function capturarTodasFrames(tabId) {
  const resultados = [];

  try {
    const inj = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        try {
          if (typeof window.__ESSENCIA_CAPTURAR_FRAME__ === 'function') {
            return window.__ESSENCIA_CAPTURAR_FRAME__();
          }
          return null;
        } catch (e) {
          return { erro: String(e), frameUrl: location.href, score: 0, dados: {}, debug: {} };
        }
      },
    });

    for (const item of inj || []) {
      if (item?.result) resultados.push(item.result);
    }
  } catch (e) {
    console.log('executeScript allFrames:', e);
  }

  if (!resultados.length) {
    try {
      const resp = await chrome.tabs.sendMessage(tabId, { acao: 'capturar-frame' });
      if (resp?.ok && resp.resultado) resultados.push(resp.resultado);
    } catch (e) {
      console.log('sendMessage fallback:', e);
    }
  }

  return resultados;
}

function mesclarResultadosFrames(resultados, tabUrl) {
  const validos = (resultados || []).filter((r) => r && r.dados);
  if (!validos.length) return null;

  validos.sort((a, b) => (b.score || 0) - (a.score || 0));
  const melhor = validos[0];

  const debugMerged = {
    url_aba: tabUrl || melhor.frameUrl || '',
    documents_lidos: validos.reduce((n, r) => n + (r.debug?.documents_lidos || 0), 0),
    documents_total: validos.reduce((n, r) => n + (r.debug?.documents_total || 0), 0),
    documents_bloqueados: validos.flatMap((r) => r.debug?.documents_bloqueados || []),
    frames_capturados: validos.length,
    frames_resumo: validos.map((r) => ({
      url: r.frameUrl,
      score: r.score,
      isTop: r.isTop,
      protocolo: r.dados?.protocolo || '',
    })),
    total_inputs: melhor.debug?.total_inputs || 0,
    total_inputs_todos_frames: validos.reduce((n, r) => n + (r.debug?.total_inputs || 0), 0),
    ids_mapeados: melhor.debug?.ids_mapeados || [],
    ids_encontrados: melhor.debug?.ids_encontrados || 0,
    ids_com_valor: melhor.debug?.ids_com_valor || 0,
    texto_visivel_3000: validos
      .map(
        (r) =>
          `=== ${r.frameUrl} (score ${r.score}) ===\n${r.debug?.texto_visivel_3000 || ''}`
      )
      .join('\n\n')
      .slice(0, 3000),
    inputs_amostra: validos.flatMap((r) => r.debug?.inputs_amostra || []).slice(0, 80),
  };

  const dados = { ...melhor.dados };
  dados.raw = { ...dados };
  delete dados.raw._debug;
  dados.capturado_em = new Date().toISOString();
  dados.url = tabUrl || melhor.frameUrl || '';
  dados._debug = debugMerged;

  return dados;
}

btnCapturar.addEventListener('click', async () => {
  mostrarStatus('info', 'Capturando dados (incluindo iframes)...');
  btnEnviar.disabled = true;
  dadosCapturados = null;
  debugCaptura = null;

  try {
    const tab = await obterAbaAtiva();
    if (!tab?.id) {
      mostrarStatus('err', 'Nenhuma aba ativa encontrada.');
      return;
    }
    if (!tab.url?.includes('vianet.webmondial.com.br')) {
      mostrarStatus('err', 'Abra um serviço em vianet.webmondial.com.br antes de capturar.');
      return;
    }

    const resultados = await capturarTodasFrames(tab.id);
    dadosCapturados = mesclarResultadosFrames(resultados, tab.url);

    if (!dadosCapturados) {
      mostrarStatus('err', 'Falha ao capturar. Recarregue a página do Vianet e a extensão.');
      return;
    }

    debugCaptura = dadosCapturados._debug || null;
    renderPreview(dadosCapturados);
    if (debugVisivel) renderDebug(debugCaptura);

    if (!capturaValida(dadosCapturados)) {
      mostrarStatus(
        'err',
        'Protocolo inválido. Abra a tela do serviço no Vianet.'
      );
      btnEnviar.disabled = true;
      debugVisivel = true;
      if (debugEl) debugEl.style.display = 'block';
      if (btnDebug) btnDebug.textContent = 'Ocultar debug';
      renderDebug(debugCaptura);
      return;
    }

    mostrarStatus('ok', `Capturado (${debugCaptura?.frames_capturados || 1} frame(s)). Revise e envie.`);
    btnEnviar.disabled = false;
  } catch (err) {
    mostrarStatus('err', 'Erro ao capturar: ' + (err.message || err));
  }
});

if (btnDebug) {
  btnDebug.addEventListener('click', toggleDebug);
}

btnEnviar.addEventListener('click', async () => {
  if (!dadosCapturados) {
    mostrarStatus('err', 'Capture os dados antes de enviar.');
    return;
  }

  if (!capturaValida(dadosCapturados)) {
    mostrarStatus('err', 'Protocolo inválido. Abra a tela do serviço no Vianet.');
    btnEnviar.disabled = true;
    return;
  }

  const apiBase = (apiBaseEl.value || 'http://localhost:8000').replace(/\/$/, '');
  chrome.storage.local.set({ apiBase });

  btnEnviar.disabled = true;
  mostrarStatus('info', 'Enviando para o sistema...');

  try {
    const res = await fetch(`${apiBase}/api/importar/vianet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadParaEnvio(dadosCapturados)),
    });

    const data = await res.json();

    if (data.ok) {
      mostrarStatus('ok', `Importado! Protocolo ${data.protocolo} (id: ${data.id}). Veja na Central.`);
    } else if (data.erro === 'serviço já cadastrado') {
      mostrarStatus('err', `Serviço já cadastrado — protocolo ${data.protocolo || dadosCapturados.protocolo}.`);
    } else {
      mostrarStatus('err', data.erro || 'Erro ao importar serviço.');
      btnEnviar.disabled = true;
    }
  } catch (err) {
    mostrarStatus('err', 'Não foi possível conectar ao backend em ' + apiBase);
    btnEnviar.disabled = false;
  }
});
