console.log('[CMM] SCRIPT CARREGADO VERSAO DEBUG 20260529d');

/**
 * Modal premium Enviar/Trocar Motorista — Central de Serviços
 * Não altera API, backend ou regras de despacho.
 */
(function () {
  'use strict';

  window.CMM_DEBUG = true;
  window.CMM_BUILD = '20260529d';

  function applyForcedVisibility(el) {
    if (!el) return;
    el.style.setProperty('display', 'flex', 'important');
    el.style.setProperty('visibility', 'visible', 'important');
    el.style.setProperty('opacity', '1', 'important');
    el.style.setProperty('z-index', '999999', 'important');
    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('inset', '0', 'important');
    el.style.setProperty('width', '100vw', 'important');
    el.style.setProperty('height', '100vh', 'important');
    el.style.setProperty('pointer-events', 'auto', 'important');
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('overflow', 'visible', 'important');
  }

  function clearForcedVisibility(el) {
    if (!el) return;
    [
      'display',
      'visibility',
      'opacity',
      'z-index',
      'position',
      'inset',
      'width',
      'height',
      'pointer-events',
      'transform',
      'overflow',
    ].forEach((prop) => el.style.removeProperty(prop));
  }

  window.CMM_inspectModal = function () {
    const modal =
      document.querySelector('[data-cmm-modal]') ||
      document.getElementById('modalMotorista') ||
      document.querySelector('.cmm-backdrop');
    if (!modal) {
      console.warn('[CMM] inspect: modal não encontrado');
      return null;
    }
    const cs = getComputedStyle(modal);
    const rect = modal.getBoundingClientRect();
    const info = {
      element: modal.id || modal.className,
      parent: modal.parentElement?.tagName,
      classes: modal.className,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      zIndex: cs.zIndex,
      position: cs.position,
      transform: cs.transform,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      ariaHidden: modal.getAttribute('aria-hidden'),
    };
    console.log('[CMM] inspect modal', info);
    return info;
  };

  const state = {
    servicoId: null,
    servico: null,
    motoristas: [],
    selectedId: null,
    search: '',
    statusFilter: 'online',
    tipoFilter: 'todos',
    sortBy: 'proximo',
    quickFilter: 'todos-online',
    loading: false,
    scrollTop: 0,
  };

  let els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(t) {
    return String(t || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safe(v) {
    return v === null || v === undefined || v === '' ? '-' : String(v);
  }

  function initials(nome) {
    const p = String(nome || '?').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  function normalizeTipo(m) {
    const raw = [
      m.viatura_classificacao,
      m.funcao,
      m.tipo,
      m.viatura_exibicao,
      m.tipo_profissional_label,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (/carretin|carreta/.test(raw)) return 'carretinha';
    if (/pesad|truck|caminh/.test(raw)) return 'pesado';
    if (/apoio/.test(raw)) return 'apoio';
    if (/leve|utilit|passeio/.test(raw)) return 'leve';
    return raw || 'outros';
  }

  function tipoLabel(m) {
    const t = normalizeTipo(m);
    const map = {
      leve: 'Leve',
      pesado: 'Pesado',
      apoio: 'Apoio',
      carretinha: 'Carretinha',
    };
    return map[t] || m.viatura_exibicao || m.funcao || m.tipo || 'Veículo';
  }

  function hasGps(m) {
    return !!(m.lat && m.lng);
  }

  function podeSelecionar(m) {
    return !!m.online && !m.ocupado;
  }

  function distanciaKm(m) {
    if (m.distancia_valor != null && !Number.isNaN(Number(m.distancia_valor))) {
      return Number(m.distancia_valor) / 1000;
    }
    const txt = String(m.distancia_texto || '');
    const match = txt.match(/([\d,.]+)\s*km/i);
    if (match) return parseFloat(match[1].replace(',', '.'));
    return null;
  }

  function formatarDistancia(m) {
    if (m.distancia_texto && m.duracao_texto) {
      return `${m.distancia_texto} · ${m.duracao_texto}`;
    }
    return m.distancia_texto || 'Distância indisponível';
  }

  function formatarDistanciaCurta(m) {
    const km = distanciaKm(m);
    if (km != null) return `${km.toFixed(1).replace('.', ',')} km`;
    const txt = String(m.distancia_texto || '');
    if (/km/i.test(txt)) return txt.split('|')[0].trim();
    return txt || '—';
  }

  function motoristaSearchHaystack(m) {
    return [
      m.nome_exibicao,
      m.nome,
      m.nome_completo,
      m.viatura_placa,
      m.placa_atual,
      m.placa,
      m.cpf,
      m.funcao,
      m.viatura_exibicao,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function filteredMotoristas() {
    let list = [...state.motoristas];

    if (state.statusFilter === 'online') {
      list = list.filter((m) => m.online);
    } else if (state.statusFilter === 'offline') {
      list = list.filter((m) => !m.online);
    }

    if (state.tipoFilter !== 'todos') {
      list = list.filter((m) => normalizeTipo(m) === state.tipoFilter);
    }

    if (state.quickFilter === 'gps-ativo') {
      list = list.filter((m) => m.online && hasGps(m));
    } else if (state.quickFilter === 'sem-gps') {
      list = list.filter((m) => m.online && !hasGps(m));
    } else if (['leve', 'pesado', 'apoio', 'carretinha'].includes(state.quickFilter)) {
      list = list.filter((m) => m.online && normalizeTipo(m) === state.quickFilter);
    } else if (state.quickFilter === 'todos-online') {
      list = list.filter((m) => m.online);
    }

    const q = state.search.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => motoristaSearchHaystack(m).includes(q));
    }

    list.sort((a, b) => {
      if (state.sortBy === 'nome') {
        return String(a.nome_exibicao || a.nome || '').localeCompare(
          String(b.nome_exibicao || b.nome || ''),
          'pt-BR'
        );
      }
      if (state.sortBy === 'atividade') {
        return String(b.ultima_atualizacao || '').localeCompare(String(a.ultima_atualizacao || ''));
      }
      const ga = hasGps(a) ? 0 : 1;
      const gb = hasGps(b) ? 0 : 1;
      if (ga !== gb) return ga - gb;
      const da = distanciaKm(a);
      const db = distanciaKm(b);
      if (da != null && db != null && da !== db) return da - db;
      if (da != null && db == null) return -1;
      if (da == null && db != null) return 1;
      return String(a.nome_exibicao || a.nome || '').localeCompare(
        String(b.nome_exibicao || b.nome || ''),
        'pt-BR'
      );
    });

    return list;
  }

  function recomendadoId(list) {
    const onlineLivre = list.filter(podeSelecionar);
    if (!onlineLivre.length) return null;
    return onlineLivre[0].id;
  }

  function statsPainel() {
    const online = state.motoristas.filter((m) => m.online);
    const livres = online.filter(podeSelecionar);
    const comGps = online.filter(hasGps);
    const prox = livres.slice().sort((a, b) => {
      const da = distanciaKm(a);
      const db = distanciaKm(b);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    })[0];
    const ultimas = online
      .map((m) => m.ultima_atualizacao)
      .filter(Boolean)
      .sort()
      .reverse();
    return {
      online: online.length,
      livres: livres.length,
      proximo: prox,
      ultimaAtualizacao: ultimas[0] || '—',
      taxaAceitacao: 'N/D',
    };
  }

  function renderServicoCard() {
    if (!els.servicoDetalhes) return;
    const s = state.servico || {};
    const fields = [
      ['Data/Hora', s.data_hora_central || s.created_at || '—'],
      ['Protocolo', s.protocolo || '—'],
      ['Cliente', s.seguradora || '—'],
      ['Tipo de Serviço', s.tipo || '—'],
      ['Cidade Destino', s.destino_cidade || s.destino || '—'],
      ['Valor', s.valor_total_fmt || '—'],
    ];
    els.servicoDetalhes.innerHTML = fields
      .map(
        ([k, v]) => `
      <div class="cmm-servico-field">
        <span class="cmm-servico-label">${escapeHtml(k)}</span>
        <strong class="cmm-servico-value">${escapeHtml(v)}</strong>
      </div>`
      )
      .join('');
  }

  function renderStats() {
    const st = statsPainel();
    els.statOnline.textContent = String(st.online);
    els.statProximo.textContent = st.proximo
      ? `${st.proximo.nome_exibicao || st.proximo.nome} · ${formatarDistanciaCurta(st.proximo)}`
      : '—';
    els.statTaxa.textContent = st.taxaAceitacao;
    els.statUltima.textContent = st.ultimaAtualizacao;
    els.statLivres.textContent = `${st.livres} livre(s)`;
  }

  function renderCard(m, idx, recId) {
    const sel = state.selectedId === m.id;
    const selectable = podeSelecionar(m);
    const recommended = recId === m.id && selectable;
    const online = !!m.online;
    const ocupado = !!m.ocupado;
    const placa = m.viatura_placa || m.placa_atual || m.placa || '—';
    const statusTxt = !online ? 'Offline' : ocupado ? 'Ocupado' : 'Online';
    const statusCls = !online ? 'offline' : ocupado ? 'ocupado' : 'online';
    const alerta = m.alerta_personalizacao
      ? `<div class="cmm-card-alerta">${escapeHtml(m.alerta_personalizacao_msg || 'Viatura personalizada incompatível.')}</div>`
      : '';

    return `
      <article
        class="cmm-card ${sel ? 'selected' : ''} ${selectable ? 'selectable' : 'locked'} ${recommended ? 'recommended' : ''}"
        data-id="${escapeHtml(m.id)}"
        data-selectable="${selectable ? '1' : '0'}"
        role="button"
        tabindex="${selectable ? '0' : '-1'}"
        aria-pressed="${sel ? 'true' : 'false'}"
      >
        <div class="cmm-card-avatar">${escapeHtml(initials(m.nome_exibicao || m.nome))}</div>
        <div class="cmm-card-body">
          <div class="cmm-card-top">
            <strong class="cmm-card-nome">${escapeHtml(m.nome_exibicao || m.nome)}</strong>
            ${recommended ? '<span class="cmm-badge-rec">RECOMENDADO</span>' : ''}
            ${sel ? '<span class="cmm-card-check" aria-hidden="true">✓</span>' : ''}
          </div>
          <div class="cmm-card-meta">
            <span>${escapeHtml(placa)}</span>
            <span class="cmm-dot">·</span>
            <span>${escapeHtml(tipoLabel(m))}</span>
          </div>
          <div class="cmm-card-foot">
            <span class="cmm-status ${statusCls}">${escapeHtml(statusTxt)}</span>
            <span class="cmm-dist">${escapeHtml(formatarDistanciaCurta(m))}</span>
            <span class="cmm-gps">${escapeHtml(m.ultima_atualizacao || 'GPS —')}</span>
          </div>
          ${alerta}
        </div>
        <span class="cmm-rank">${idx + 1}</span>
      </article>
    `;
  }

  function renderMotoristaList() {
    const list = filteredMotoristas();
    const recId = recomendadoId(list);
    const inner = els.listInner;

    if (!inner) return;

    if (!list.length) {
      inner.innerHTML = '';
      if (els.listEmpty) {
        els.listEmpty.hidden = false;
        els.listEmpty.textContent = state.search
          ? 'Nenhum motorista encontrado para a busca.'
          : state.statusFilter === 'offline'
            ? 'Nenhum motorista offline no momento.'
            : 'Nenhum motorista online no momento.';
      }
      renderStats();
      updateSubmit();
      return;
    }

    if (els.listEmpty) els.listEmpty.hidden = true;
    inner.innerHTML = list.map((m, i) => renderCard(m, i, recId)).join('');
    renderStats();
    updateSubmit();
  }

  /** @deprecated alias interno */
  function renderVirtualList() {
    renderMotoristaList();
  }

  function updateSubmit() {
    if (!els.hiddenId || !els.btnEnviar) return;
    const m = state.motoristas.find((x) => x.id === state.selectedId);
    const ok = !!(m && podeSelecionar(m));
    els.hiddenId.value = ok ? state.selectedId : '';
    els.btnEnviar.disabled = !ok;
    els.btnEnviar.textContent = ok ? 'Enviar Serviço' : 'Selecione um motorista';
  }

  function selectMotorista(id) {
    const m = state.motoristas.find((x) => x.id === id);
    if (!m || !podeSelecionar(m)) return;
    state.selectedId = id;
    renderVirtualList();
  }

  function setLoading(on) {
    state.loading = on;
    if (els.loading) {
      els.loading.hidden = !on;
      els.loading.classList.toggle('is-active', on);
      els.loading.style.display = on ? 'flex' : 'none';
      els.loading.setAttribute('aria-busy', on ? 'true' : 'false');
    }
    if (els.listInner) els.listInner.style.visibility = on ? 'hidden' : 'visible';
    if (els.listEmpty) els.listEmpty.hidden = on || !!els.listInner?.children?.length;
  }

  function bindEvents() {
    if (els.bound) return;
    if (!els.backdrop || !els.panel) {
      console.error('[CMM] bindEvents abortado — modal incompleto no DOM');
      return;
    }
    els.bound = true;

    els.backdrop.addEventListener('click', (e) => {
      if (e.target === els.backdrop) close();
    });

    els.panel.addEventListener('click', (e) => e.stopPropagation());

    if (els.btnCancelar) els.btnCancelar.addEventListener('click', close);
    if (els.btnClose) els.btnClose.addEventListener('click', close);

    if (els.search) {
      els.search.addEventListener('input', () => {
        state.search = els.search.value;
        state.scrollTop = 0;
        if (els.listViewport) els.listViewport.scrollTop = 0;
        renderVirtualList();
      });
    }

    if (els.statusFilter) {
      els.statusFilter.addEventListener('change', () => {
        state.statusFilter = els.statusFilter.value;
        state.scrollTop = 0;
        if (els.listViewport) els.listViewport.scrollTop = 0;
        renderVirtualList();
      });
    }

    if (els.tipoFilter) {
      els.tipoFilter.addEventListener('change', () => {
        state.tipoFilter = els.tipoFilter.value;
        renderVirtualList();
      });
    }

    if (els.sortBy) {
      els.sortBy.addEventListener('change', () => {
        state.sortBy = els.sortBy.value;
        renderVirtualList();
      });
    }

    if (els.quickFilters) {
      els.quickFilters.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-quick]');
        if (!btn) return;
        state.quickFilter = btn.getAttribute('data-quick');
        els.quickFilters.querySelectorAll('[data-quick]').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        if (state.quickFilter === 'todos-online') state.statusFilter = 'online';
        if (els.statusFilter && els.statusFilter.value !== state.statusFilter) {
          els.statusFilter.value = state.statusFilter;
        }
        renderVirtualList();
      });
    }

    if (els.listInner) {
      els.listInner.addEventListener('click', (e) => {
        const card = e.target.closest('.cmm-card.selectable');
        if (!card) return;
        selectMotorista(card.getAttribute('data-id'));
      });

      els.listInner.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('.cmm-card.selectable');
        if (!card) return;
        e.preventDefault();
        selectMotorista(card.getAttribute('data-id'));
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.backdrop && els.backdrop.classList.contains('open')) close();
    });
  }

  function mountToBody() {
    const modal = $('modalMotorista');
    if (!modal) return;
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    } else {
      document.body.appendChild(modal);
    }
    console.log('[CMM] modal parent=', modal.parentElement?.tagName);
  }

  function cacheElements() {
    els = {
      backdrop: $('modalMotorista'),
      panel: $('cmmPanel'),
      form: $('formEnviarMotorista'),
      hiddenId: $('cmmMotoristaId'),
      servicoDetalhes: $('cmmServicoDetalhes'),
      search: $('cmmSearch'),
      statusFilter: $('cmmStatusFilter'),
      tipoFilter: $('cmmTipoFilter'),
      sortBy: $('cmmSortBy'),
      quickFilters: $('cmmQuickFilters'),
      listViewport: $('cmmListViewport'),
      listInner: $('cmmListInner'),
      listWrap: $('cmmListWrap'),
      listEmpty: $('cmmListEmpty'),
      loading: $('cmmLoading'),
      statOnline: $('cmmStatOnline'),
      statProximo: $('cmmStatProximo'),
      statTaxa: $('cmmStatTaxa'),
      statUltima: $('cmmStatUltima'),
      statLivres: $('cmmStatLivres'),
      btnEnviar: $('cmmBtnEnviar'),
      btnCancelar: $('cmmBtnCancelar'),
      btnClose: $('cmmBtnClose'),
    };
  }

  function showBackdrop() {
    if (!els.backdrop) return;
    els.backdrop.classList.add('open');
    els.backdrop.setAttribute('aria-hidden', 'false');
    applyForcedVisibility(els.backdrop);
    document.body.classList.add('cmm-modal-open');
    console.log('[CMM] modal open=true');
    window.CMM_inspectModal && window.CMM_inspectModal();
  }

  function renderServicoLoading(msg) {
    if (!els.servicoDetalhes) return;
    els.servicoDetalhes.innerHTML = `
      <div class="cmm-servico-field">
        <span class="cmm-servico-label">Status</span>
        <strong class="cmm-servico-value">${escapeHtml(msg)}</strong>
      </div>`;
  }

  async function resolveServico(servicoId) {
    const id = String(servicoId || '').trim();
    if (!id) return null;

    const cache = window.ultimosServicos || [];
    let found = cache.find((s) => String(s.id) === id) || null;
    const emCache = !!found;
    console.log('[CMM] serviço encontrado em cache=' + emCache);

    if (found) return found;

    console.log('[CMM] buscando serviço na API, id=' + id);
    renderServicoLoading('Carregando dados do serviço...');

    try {
      const hoje = new Date();
      const ini = new Date(hoje);
      ini.setDate(ini.getDate() - 120);
      const pad = (n) => String(n).padStart(2, '0');
      const dataIni = `${ini.getFullYear()}-${pad(ini.getMonth() + 1)}-${pad(ini.getDate())}`;
      const dataFim = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
      const qs = new URLSearchParams({ data_ini: dataIni, data_fim: dataFim, ts: String(Date.now()) });
      const resp = await fetch(`/api/servicos?${qs}`, { cache: 'no-store' });
      if (resp.ok) {
        const lista = await resp.json();
        found = (lista || []).find((s) => String(s.id) === id) || null;
        if (found) {
          const atual = window.ultimosServicos || [];
          if (!atual.some((s) => String(s.id) === id)) {
            window.ultimosServicos = [...atual, found];
          }
          console.log('[CMM] serviço carregado da API:', found.protocolo || id);
          return found;
        }
      }
    } catch (err) {
      console.error('[CMM] erro ao buscar serviço na API:', err);
    }

    console.warn('[CMM] fallback mínimo para serviço id=' + id);
    return { id, protocolo: '—', tipo: '—', seguradora: '—', destino: '—' };
  }

  async function open(servicoId) {
    const id = String(servicoId || '').trim();
    console.log('[CMM] servico_id=' + id);
    if (!id) {
      console.error('[CMM] servicoId ausente — botão sem data-servico-id');
      alert('Serviço inválido. Atualize a página e tente novamente.');
      return;
    }

    mountToBody();
    cacheElements();
    bindEvents();

    if (!els.backdrop) {
      console.error('[CMM] #modalMotorista não encontrado no DOM');
      alert('Modal de motoristas não encontrado. Atualize a página (Ctrl+Shift+R).');
      return;
    }

    console.log('[CMM] abrindo modal');
    state.servicoId = id;
    state.servico = null;
    state.selectedId = null;
    state.search = '';
    state.statusFilter = 'online';
    state.tipoFilter = 'todos';
    state.sortBy = 'proximo';
    state.quickFilter = 'todos-online';
    state.scrollTop = 0;

    showBackdrop();

    if (window.motoristasCache?.length) {
      state.motoristas = window.motoristasCache;
    }

    setLoading(true);
    if (els.listInner) els.listInner.innerHTML = '';
    if (els.listEmpty) els.listEmpty.hidden = true;
    renderServicoLoading('Carregando dados do serviço...');

    if (els.form) els.form.action = `/servicos/${id}/enviar`;
    if (els.hiddenId) els.hiddenId.value = '';
    if (els.btnEnviar) {
      els.btnEnviar.disabled = true;
      els.btnEnviar.textContent = 'Selecione um motorista';
    }

    try {
      if (els.search) els.search.value = '';
      if (els.statusFilter) els.statusFilter.value = 'online';
      if (els.tipoFilter) els.tipoFilter.value = 'todos';
      if (els.sortBy) els.sortBy.value = 'proximo';
      if (els.quickFilters) {
        els.quickFilters.querySelectorAll('[data-quick]').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-quick') === 'todos-online');
        });
      }

      state.servico = await resolveServico(id);

      if (els.form) els.form.action = `/servicos/${id}/enviar`;
      renderServicoCard();

      if (state.motoristas.length) {
        setLoading(false);
        renderMotoristaList();
      }

      const motoristas = await fetchMotoristasParaServico(id);
      if (motoristas.length) {
        state.motoristas = motoristas;
        window.motoristasCache = motoristas;
      }
    } catch (err) {
      console.error('[CMM] erro ao carregar modal:', err);
      if (!state.motoristas.length) {
        state.motoristas = window.motoristasCache || [];
      }
    } finally {
      setLoading(false);
      if (els.listViewport) els.listViewport.scrollTop = 0;
      state.scrollTop = 0;

      const list = filteredMotoristas();
      const rec = recomendadoId(list);
      const firstLivre = list.find(podeSelecionar);
      if (firstLivre) state.selectedId = rec || firstLivre.id;

      renderMotoristaList();
    }
  }

  async function fetchMotoristasParaServico(servicoId) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const resp = await fetch(`/api/servicos/${servicoId}/motoristas?ts=${Date.now()}`, {
        cache: 'no-store',
        signal: ctrl.signal,
      });
      if (resp.ok) return await resp.json();
    } catch (err) {
      console.warn('[CMM] motoristas fetch timeout/erro', err);
    } finally {
      clearTimeout(timer);
    }
    return window.motoristasCache || [];
  }

  function findEnviarButton(target) {
    if (!target || !target.closest) return null;

    let btn = target.closest('[data-cmm-open]');
    if (btn) return btn;

    btn = target.closest('button.central-btn-acao.primary');
    if (btn && /enviar\s*\/\s*trocar/i.test(String(btn.textContent || ''))) return btn;

    btn = target.closest('button');
    if (btn && /enviar\s*\/\s*trocar/i.test(String(btn.textContent || ''))) return btn;

    return null;
  }

  function servicoIdFromButton(btn) {
    if (!btn) return '';
    const fromAttr = btn.getAttribute('data-servico-id') || btn.dataset.servicoId || '';
    if (fromAttr) return String(fromAttr).trim();
    const row = btn.closest('tr[data-id]');
    if (row) return String(row.getAttribute('data-id') || '').trim();
    return '';
  }

  function bindButtonDirect(btn) {
    if (!btn || btn.disabled || btn.__cmmDirectBound) return;
    btn.__cmmDirectBound = true;
    btn.addEventListener(
      'click',
      function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        const servicoId = servicoIdFromButton(btn);
        console.log('[CMM] CLICK DIRETO NO BOTAO');
        console.log('[CMM] servico_id=' + servicoId);
        if (servicoId) open(servicoId);
      },
      true
    );
  }

  function bindAllEnviarButtons() {
    const tbody = document.getElementById('servicos-body');
    if (!tbody) return;
    tbody.querySelectorAll('[data-cmm-open], button.central-btn-acao.primary').forEach((btn) => {
      if (/enviar\s*\/\s*trocar/i.test(String(btn.textContent || '')) || btn.hasAttribute('data-cmm-open')) {
        bindButtonDirect(btn);
      }
    });
  }

  function handleCmmClick(e) {
    if (window.CMM_DEBUG) {
      console.log('[CMM] CLICK GERAL', e.target);
    }

    const btn = findEnviarButton(e.target);
    console.log('[CMM] BTN ENCONTRADO', btn);
    if (!btn || btn.disabled) return;

    e.preventDefault();
    e.stopPropagation();

    const servicoId = servicoIdFromButton(btn);
    console.log('[CMM] CLICK ENVIAR/TROCAR');
    console.log('[CMM] servico_id=' + servicoId);

    if (!servicoId || !String(servicoId).trim()) {
      console.error('[CMM] botão sem data-servico-id válido');
      alert('ID do serviço não encontrado. Atualize a Central e tente novamente.');
      return;
    }

    open(servicoId);
  }

  function close() {
    if (!els.backdrop) cacheElements();
    if (!els.backdrop) return;
    els.backdrop.classList.remove('open');
    els.backdrop.setAttribute('aria-hidden', 'true');
    clearForcedVisibility(els.backdrop);
    document.body.classList.remove('cmm-modal-open');
    state.selectedId = null;
  }

  window.CentralModalMotorista = { open, close, bindAllEnviarButtons };
  window.cmmAbrirEnviar = function (btnOrId) {
    const id =
      btnOrId && typeof btnOrId === 'object'
        ? servicoIdFromButton(btnOrId)
        : String(btnOrId || '').trim();
    console.log('[CMM] cmmAbrirEnviar servico_id=' + id);
    return open(id);
  };
  window.CMM_TEST_OPEN = function (servicoId) {
    console.log('[CMM] TEST OPEN', servicoId);
    return open(servicoId);
  };
  window.abrirModalMotorista = function (servicoId) {
    console.log('[CMM] CLICK ENVIAR/TROCAR (global)');
    console.log('[CMM] servico_id=' + servicoId);
    return open(servicoId);
  };
  window.fecharModalMotorista = close;
  window.CMM_rebindTable = bindAllEnviarButtons;

  function bindGlobalClickDelegation() {
    if (window.__cmmClickBound) return;
    window.__cmmClickBound = true;

    document.addEventListener('click', handleCmmClick, true);

    const tbody = document.getElementById('servicos-body');
    if (tbody) {
      tbody.addEventListener('click', handleCmmClick, true);
    }

    bindAllEnviarButtons();
    console.log('[CMM] delegação global ativa (capture)');
  }

  function initModalMotorista() {
    mountToBody();
    cacheElements();
    bindEvents();
    bindGlobalClickDelegation();
    console.log('[CMM] init ok — modal no DOM:', !!document.getElementById('modalMotorista'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModalMotorista);
  } else {
    initModalMotorista();
  }
})();
