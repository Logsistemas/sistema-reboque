/**
 * Central de Notificações — som e alertas visuais (/central)
 * Única função de áudio: playCentralAlert(tipo)
 */
(function centralAlertasOperacionais() {
  'use strict';

  const LS_SOM = 'central_som_ativo';
  const POLL_MS = 5000;

  const SOUNDS = {
    mensagem: '/static/sounds/mobile_message.wav',
    placa: '/static/sounds/plate_alert.mp3',
    recusa: '/static/sounds/refusal_alert.mp3',
    default: '/static/sounds/mobile_message.wav',
  };

  const SOUNDS_FALLBACK = {
    placa: '/static/sounds/plate_alert.wav',
    recusa: '/static/sounds/ambulance_siren.wav',
    mensagem: '/static/sounds/mobile_message.wav',
    default: '/static/sounds/mobile_message.wav',
  };

  const state = {
    porServico: {},
    msgPorServico: {},
    placaPorServico: {},
    recusaPorServico: {},
    placasPendentes: new Set(),
    recusasPendentes: new Set(),
    mapsKey: '',
    mapInstance: null,
    mapMarkers: [],
    chatServicoId: null,
    chatPoll: null,
    somDesbloqueado: false,
    inicializado: false,
    vistos: new Set(),
    audioCache: {},
    pollInFlight: false,
    pollPending: false,
  };

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'sd-mobile-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5500);
  }

  function somPreferido() {
    return localStorage.getItem(LS_SOM) === '1';
  }

  function somHabilitado() {
    return somPreferido() && state.somDesbloqueado;
  }

  function atualizarIconeSom() {
    const btn = document.getElementById('btnCentralSomIco');
    if (!btn) return;
    const pref = somPreferido();
    btn.textContent = pref ? '🔊' : '🔇';
    if (pref && !state.somDesbloqueado) {
      btn.title = 'Som ativo — interaja com a página se o Chrome bloquear o áudio';
    } else {
      btn.title = pref ? 'Som da Central ativo' : 'Som da Central desativado';
    }
    btn.classList.toggle('central-som-on', pref);
    btn.classList.toggle('central-som-off', !pref);
    console.log('[CENTRAL_ALERTAS] som ativo=' + (somPreferido() ? 'true' : 'false'));
  }

  async function desbloquearAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      state.audioCtx = state.audioCtx || new Ctx();
      if (state.audioCtx.state === 'suspended') {
        await state.audioCtx.resume();
      }
      state.somDesbloqueado = true;
    } catch (e) {
      console.log('[CENTRAL_ALERTAS] audio ctx erro', e);
    }
  }

  function getAudio(src) {
    if (!state.audioCache[src]) {
      const a = new Audio(src);
      a.preload = 'auto';
      state.audioCache[src] = a;
    }
    return state.audioCache[src];
  }

  async function preloadSounds() {
    const urls = [...new Set([...Object.values(SOUNDS), ...Object.values(SOUNDS_FALLBACK)])];
    await Promise.all(
      urls.map(
        (src) =>
          new Promise((resolve) => {
            try {
              const a = getAudio(src);
              a.load();
              if (a.readyState >= 2) resolve();
              else {
                a.addEventListener('canplaythrough', () => resolve(), { once: true });
                a.addEventListener('error', () => resolve(), { once: true });
              }
            } catch (e) {
              resolve();
            }
          })
      )
    );
  }

  async function playAudio(src, volume) {
    const audio = getAudio(src);
    audio.volume = volume;
    audio.currentTime = 0;
    await audio.play();
  }

  /** Única função de som — todos os alertas passam por aqui. */
  async function playCentralAlert(tipo) {
    const t = (tipo || 'default').toLowerCase();
    if (!somPreferido()) {
      toast('Clique no ícone de som para ativar alertas sonoros.');
      return;
    }

    if (!state.somDesbloqueado) {
      await desbloquearAudio();
    }

    const src = SOUNDS[t] || SOUNDS.default;
    const vol = t === 'recusa' ? 1 : t === 'placa' ? 0.92 : 0.88;
    console.log('[CENTRAL_ALERTAS] tocando som tipo=' + t + ' src=' + src);

    try {
      await playAudio(src, vol);
      state.somDesbloqueado = true;
      atualizarIconeSom();
    } catch (e) {
      console.log('[CENTRAL_ALERTAS] mp3 falhou tipo=' + t, e);
      const fallback = SOUNDS_FALLBACK[t] || SOUNDS_FALLBACK.default;
      if (fallback && fallback !== src) {
        try {
          await playAudio(fallback, vol);
          state.somDesbloqueado = true;
          atualizarIconeSom();
        } catch (e2) {
          console.log('[CENTRAL_ALERTAS] fallback falhou tipo=' + t, e2);
        }
      }
    }
  }

  async function toggleSom() {
    if (somPreferido()) {
      localStorage.setItem(LS_SOM, '0');
      atualizarIconeSom();
      return;
    }

    localStorage.setItem(LS_SOM, '1');
    await desbloquearAudio();
    await preloadSounds();
    await playCentralAlert('mensagem');
    atualizarIconeSom();
  }

  function registrarDesbloqueioPorGestura() {
    if (!somPreferido() || state.somDesbloqueado) return;
    const unlock = () => {
      void desbloquearAudio().then(() => {
        atualizarIconeSom();
      });
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
  }

  async function initSomPersistente() {
    if (localStorage.getItem(LS_SOM) !== '1' && localStorage.getItem('somAtivo') === '1') {
      localStorage.setItem(LS_SOM, '1');
    }
    atualizarIconeSom();
    if (somPreferido()) {
      await preloadSounds();
      await desbloquearAudio();
      registrarDesbloqueioPorGestura();
      console.log('[CENTRAL_ALERTAS] som persistente carregado (sem beep no reload)');
    }
  }

  function normSid(sid) {
    return String(sid || '').trim().toLowerCase();
  }

  function syncPorServicoFromAlertas(data) {
    const por = { ...(data.por_servico || {}) };
    (data.placas || []).forEach((p) => {
      const sid = String(p.servico_id || '');
      if (!sid) return;
      por[sid] = {
        ...(por[sid] || {}),
        placa: 1,
        placa_pendente: true,
        protocolo: p.protocolo || por[sid]?.protocolo || '',
      };
    });
    (data.recusas || []).forEach((r) => {
      const sid = String(r.servico_id || '');
      if (!sid) return;
      por[sid] = {
        ...(por[sid] || {}),
        recusa: 1,
        recusa_pendente: true,
        protocolo: r.protocolo || por[sid]?.protocolo || '',
      };
    });
    return por;
  }

  function atualizarPendentesVisuais(data) {
    state.placasPendentes = new Set((data.placas || []).map((p) => normSid(p.servico_id)));
    state.recusasPendentes = new Set((data.recusas || []).map((r) => normSid(r.servico_id)));
  }

  function servicoComPlacaPendente(sid, info) {
    return state.placasPendentes.has(normSid(sid)) || temPlaca(info);
  }

  function servicoComRecusaPendente(sid, info) {
    return state.recusasPendentes.has(normSid(sid)) || temRecusa(info);
  }

  function lookupInfo(sid) {
    const id = String(sid || '');
    const map = state.porServico || {};
    if (map[id]) return map[id];
    const hit = Object.keys(map).find((k) => String(k).toLowerCase() === id.toLowerCase());
    return hit ? map[hit] : {};
  }

  function qtdMsg(info) {
    return Number(info.mensagem || info.mensagens || 0);
  }

  function temPlaca(info) {
    return Number(info.placa || 0) > 0 || info.placa_pendente === true;
  }

  function temRecusa(info) {
    return Number(info.recusa || 0) > 0 || info.recusa_pendente === true;
  }

  function atalhosHtml(sid) {
    const id = esc(sid);
    return `
      <span class="central-atalhos">
        <button type="button" class="central-ico-btn" data-central-chat="${id}" title="Mensagens Mobile" onclick="event.stopPropagation(); window.centralAlertas.abrirChat('${id}');">💬<span class="central-ico-badge" data-badge-chat="${id}">0</span></button>
        <button type="button" class="central-ico-btn" data-central-map="${id}" title="Localização do motorista" onclick="event.stopPropagation(); window.centralAlertas.abrirMapa('${id}');">📍</button>
      </span>`;
  }

  function aplicarEstadoNaTabela() {
    const tbody = document.getElementById('servicos-body');
    if (!tbody) return;

    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      const sid = tr.getAttribute('data-id');
      const info = lookupInfo(sid);
      const chatBtn = tr.querySelector(`[data-central-chat="${sid}"]`);
      const chatBadge = tr.querySelector(`[data-badge-chat="${sid}"]`);
      const placaCell = tr.querySelector('[data-col-placa]');
      const statusCell = tr.querySelector('.col-status-alerta');

      const qMsg = qtdMsg(info);
      const pPlaca = servicoComPlacaPendente(sid, info);
      const pRecusa = servicoComRecusaPendente(sid, info);

      if (chatBtn) {
        chatBtn.classList.toggle('alerta-piscando', qMsg > 0);
        chatBtn.classList.toggle('alerta-piscando-msg', qMsg > 0);
      }
      if (chatBadge) {
        chatBadge.textContent = String(qMsg);
        chatBadge.classList.toggle('show', qMsg > 0);
      }

      if (placaCell) {
        const placaBadge = placaCell.querySelector('b');
        if (placaBadge) {
          placaBadge.classList.toggle('placa-alerta-badge', pPlaca);
        }
        placaCell.setAttribute('data-alerta-placa', pPlaca ? '1' : '0');
        if (pPlaca) {
          console.log('[CENTRAL_ALERTAS] aplicando pisca placa');
          console.log('[CENTRAL_ALERTAS] aplicando pisca placa servico_id=' + sid);
        }
        placaCell.onclick = (e) => {
          e.stopPropagation();
          void marcarVisto(sid, 'placa');
        };
      }

      if (statusCell) {
        const statusBadge = statusCell.querySelector('span');
        if (statusBadge) {
          statusBadge.classList.toggle('status-alerta-recusa', pRecusa);
        }
        if (pRecusa) {
          console.log('[CENTRAL_ALERTAS] aplicando destaque recusa');
          console.log('[CENTRAL_ALERTAS] aplicando destaque recusa servico_id=' + sid);
        }
      }
    });
  }

  function fp(tipo, servicoId, stamp) {
    return `${tipo}|${servicoId}|${stamp || ''}`;
  }

  function semearSessao(data) {
    if (state.inicializado) return;

    const porMerged = syncPorServicoFromAlertas(data);

    (data.mensagens?.itens || []).forEach((m) => {
      state.msgPorServico[String(m.servico_id)] = Number(m.qtd) || 0;
    });

    Object.entries(porMerged).forEach(([sid, info]) => {
      state.placaPorServico[sid] = temPlaca(info) ? 1 : 0;
      state.recusaPorServico[sid] = temRecusa(info) ? 1 : 0;
    });

    (data.placas || []).forEach((p) => {
      state.vistos.add(fp('placa', p.servico_id, p.created_at_iso));
    });
    (data.recusas || []).forEach((r) => {
      state.vistos.add(fp('recusa', r.servico_id, r.created_at_iso));
    });
  }

  function pushNovo(novos, item) {
    const sid = String(item.servico_id || '');
    const tipo = item.tipo;
    if (novos.some((n) => n.tipo === tipo && String(n.servico_id) === sid)) return;
    novos.push(item);
    console.log('[CENTRAL_ALERTAS] alerta novo tipo=' + tipo + ' servico_id=' + sid);
  }

  function limparVistosServico(servicoId, tipo) {
    const id = normSid(servicoId);
    [...state.vistos].forEach((key) => {
      const [t, sid] = key.split('|');
      if (t === tipo && normSid(sid) === id) state.vistos.delete(key);
    });
  }

  function processarNovosAlertas(data) {
    const novos = [];
    const porMerged = syncPorServicoFromAlertas(data);
    const prevPlaca = { ...state.placaPorServico };
    const prevRecusa = { ...state.recusaPorServico };
    state.placaPorServico = {};
    state.recusaPorServico = {};

    (data.mensagens?.itens || []).forEach((m) => {
      const sid = String(m.servico_id || '');
      const q = Number(m.qtd) || 0;
      const prev = state.msgPorServico[sid] || 0;
      if (state.inicializado && q > prev) {
        pushNovo(novos, { tipo: 'mensagem', servico_id: sid, protocolo: m.protocolo || '' });
      }
      state.msgPorServico[sid] = q;
    });

    (data.placas || []).forEach((p) => {
      const key = fp('placa', p.servico_id, p.created_at_iso);
      if (state.vistos.has(key)) return;
      state.vistos.add(key);
      if (state.inicializado) {
        pushNovo(novos, { tipo: 'placa', servico_id: p.servico_id, protocolo: p.protocolo || '' });
      }
    });

    (data.recusas || []).forEach((r) => {
      const key = fp('recusa', r.servico_id, r.created_at_iso);
      if (state.vistos.has(key)) return;
      state.vistos.add(key);
      if (state.inicializado) {
        pushNovo(novos, { tipo: 'recusa', servico_id: r.servico_id, protocolo: r.protocolo || '' });
      }
    });

    Object.entries(porMerged).forEach(([sid, info]) => {
      const pNow = temPlaca(info) ? 1 : 0;
      const rNow = temRecusa(info) ? 1 : 0;
      const pPrev = prevPlaca[sid] || 0;
      const rPrev = prevRecusa[sid] || 0;
      const protocolo = info.protocolo || lookupInfo(sid).protocolo || '';

      if (state.inicializado && pNow > pPrev) {
        pushNovo(novos, { tipo: 'placa', servico_id: sid, protocolo });
      }
      if (state.inicializado && rNow > rPrev) {
        pushNovo(novos, { tipo: 'recusa', servico_id: sid, protocolo });
      }

      state.placaPorServico[sid] = pNow;
      state.recusaPorServico[sid] = rNow;
    });

    return novos;
  }

  async function fetchAlertas() {
    const res = await fetch('/api/central/alertas', { cache: 'no-store' });
    return res.json();
  }

  async function pollAlertas() {
    if (state.pollInFlight) {
      state.pollPending = true;
      return;
    }
    state.pollInFlight = true;
    try {
      const data = await fetchAlertas();
      if (!data.ok) return;

      console.log('[CENTRAL_ALERTAS] placas recebidas', data.placas);
      console.log('[CENTRAL_ALERTAS] recusas recebidas', data.recusas);

      semearSessao(data);
      const novos = processarNovosAlertas(data);

      for (const n of novos) {
        if (n.tipo === 'placa') {
          console.log('[CENTRAL_ALERTAS] disparando som placa');
        } else if (n.tipo === 'recusa') {
          console.log('[CENTRAL_ALERTAS] disparando som recusa');
        }
        await playCentralAlert(n.tipo);
        if (n.tipo === 'mensagem') {
          toast(`Nova mensagem do motorista no protocolo ${n.protocolo || ''}`);
        } else if (n.tipo === 'placa') {
          toast(`Placa enviada pelo motorista no protocolo ${n.protocolo || ''}`);
        } else if (n.tipo === 'recusa') {
          toast(`Motorista recusou o serviço ${n.protocolo || ''}`);
        }
      }

      state.porServico = syncPorServicoFromAlertas(data);
      atualizarPendentesVisuais(data);
      state.inicializado = true;
      aplicarEstadoNaTabela();
    } catch (e) {
      console.log('[CENTRAL_ALERTAS] poll erro', e);
    } finally {
      state.pollInFlight = false;
      if (state.pollPending) {
        state.pollPending = false;
        void pollAlertas();
      }
    }
  }

  async function marcarVisto(servicoId, tipos) {
    const lista = Array.isArray(tipos) ? tipos : [tipos];
    for (const tipo of lista) {
      limparVistosServico(servicoId, tipo);
      console.log('[CENTRAL_ALERTAS] marcado como visto tipo=' + tipo + ' servico_id=' + servicoId);
      await fetch(`/api/central/alertas/${tipo}/${servicoId}/marcar-visto`, { method: 'POST' });
    }
    await pollAlertas();
  }

  function renderChatMessages(lista) {
    const box = document.getElementById('centralChatMessages');
    if (!box) return;
    if (!lista || !lista.length) {
      box.innerHTML = '<div class="sd-mobile-empty">Nenhuma mensagem ainda.</div>';
      return;
    }
    box.innerHTML = lista
      .map((m) => {
        const tipo = (m.remetente_tipo || '').toLowerCase() === 'central' ? 'central' : 'motorista';
        return `
          <div class="sd-mobile-bubble ${tipo}">
            <div class="sd-mobile-bubble-meta">${esc(m.remetente_nome)} · ${esc(m.created_at)}</div>
            <div class="sd-mobile-bubble-body">${esc(m.mensagem)}</div>
          </div>`;
      })
      .join('');
    box.scrollTop = box.scrollHeight;
  }

  async function carregarChat(servicoId) {
    const res = await fetch(`/api/servicos/${servicoId}/mobile/mensagens`, { cache: 'no-store' });
    const data = await res.json();
    if (data.ok) renderChatMessages(data.mensagens || []);
  }

  async function enviarChat() {
    const input = document.getElementById('centralChatInput');
    const sid = state.chatServicoId;
    if (!input || !sid) return;
    const texto = (input.value || '').trim();
    if (!texto) return;
    const res = await fetch(`/api/servicos/${sid}/mobile/mensagens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        remetente_tipo: 'central',
        remetente_id: 'central',
        remetente_nome: 'Central / Operação',
        mensagem: texto,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.erro || 'Falha ao enviar.');
      return;
    }
    input.value = '';
    await carregarChat(sid);
  }

  function fecharModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
    if (id === 'modalCentralChat' && state.chatPoll) {
      clearInterval(state.chatPoll);
      state.chatPoll = null;
    }
  }

  async function abrirChat(servicoId) {
    state.chatServicoId = servicoId;
    const modal = document.getElementById('modalCentralChat');
    const title = document.getElementById('centralChatTitle');
    const servico = (window.ultimosServicos || []).find((s) => String(s.id) === String(servicoId));
    if (title) title.textContent = `Mobile — ${servico?.protocolo || servicoId}`;
    if (modal) modal.classList.add('open');
    await carregarChat(servicoId);
    await marcarVisto(servicoId, 'mensagem');
    if (state.chatPoll) clearInterval(state.chatPoll);
    state.chatPoll = setInterval(() => void carregarChat(servicoId), 5000);
  }

  async function carregarMapsKey() {
    if (state.mapsKey) return state.mapsKey;
    const fromPage = (window.CENTRAL_CONFIG && window.CENTRAL_CONFIG.googleMapsApiKey) || '';
    if (fromPage) {
      state.mapsKey = fromPage;
      return state.mapsKey;
    }
    try {
      const res = await fetch('/api/central/config/maps', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        state.mapsKey = data.googleMapsApiKey || data.google_maps_api_key || '';
      }
    } catch (e) {
      console.log('[CENTRAL_ALERTAS] maps config', e);
    }
    return state.mapsKey;
  }

  function loadGoogleMaps() {
    return new Promise(async (resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve();
        return;
      }
      await carregarMapsKey();
      if (!state.mapsKey) {
        reject(new Error('Google Maps API key não configurada. Defina GOOGLE_MAPS_API_KEY no .env e reinicie o backend.'));
        return;
      }
      const existing = document.querySelector('script[data-central-gmaps]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Falha ao carregar Google Maps')));
        return;
      }
      const s = document.createElement('script');
      s.dataset.centralGmaps = '1';
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(state.mapsKey)}&language=pt-BR&region=BR`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Falha ao carregar Google Maps'));
      document.head.appendChild(s);
    });
  }

  function limparMapa() {
    state.mapMarkers.forEach((m) => m.setMap(null));
    state.mapMarkers = [];
    state.mapInstance = null;
  }

  async function abrirMapa(servicoId) {
    const modal = document.getElementById('modalCentralMapa');
    const canvas = document.getElementById('centralMapCanvas');
    const meta = document.getElementById('centralMapMeta');
    if (!modal || !canvas) return;

    modal.classList.add('open');
    if (meta) meta.innerHTML = '<div>Carregando localização…</div>';

    try {
      const res = await fetch(`/api/servicos/${servicoId}/localizacao-motorista`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.erro || 'Erro ao buscar localização');

      await loadGoogleMaps();
      limparMapa();

      const mot = data.motorista || {};
      const origem = data.origem || {};
      const bounds = new google.maps.LatLngBounds();

      state.mapInstance = new google.maps.Map(canvas, {
        center: { lat: -22.9068, lng: -43.1729 },
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
      });

      if (origem.lat && origem.lng) {
        const o = { lat: Number(origem.lat), lng: Number(origem.lng) };
        state.mapMarkers.push(new google.maps.Marker({
          map: state.mapInstance,
          position: o,
          label: 'O',
          title: 'Origem',
        }));
        bounds.extend(o);
      }

      if (mot.lat && mot.lng) {
        const p = { lat: Number(mot.lat), lng: Number(mot.lng) };
        state.mapMarkers.push(new google.maps.Marker({
          map: state.mapInstance,
          position: p,
          label: 'M',
          title: mot.nome || 'Motorista',
        }));
        bounds.extend(p);
      } else if (meta) {
        meta.innerHTML = '<div class="muted">Motorista sem localização atual.</div>';
      }

      if (state.mapMarkers.length) {
        state.mapInstance.fitBounds(bounds, 56);
      }

      if (meta && mot.lat && mot.lng) {
        meta.innerHTML = `
          <div><label>Motorista</label><b>${esc(mot.nome || '—')}</b></div>
          <div><label>Online</label><b>${mot.online ? 'Sim' : 'Não'}</b></div>
          <div><label>Distância</label><b>${esc(data.distancia_texto || '—')}</b></div>
          <div><label>Tempo est.</label><b>${esc(data.duracao_texto || '—')}</b></div>
          <div><label>Atualizado</label><b>${esc(mot.atualizado_em || '—')}</b></div>
          <div><label>Origem</label><b>${esc(origem.endereco || '—')}</b></div>`;
      }
    } catch (err) {
      if (meta) meta.innerHTML = `<div class="muted">${esc(err.message || 'Localização indisponível')}</div>`;
    }
  }

  function marcarServicoVisto(servicoId, tipos) {
    void marcarVisto(servicoId, tipos || ['placa', 'recusa']);
  }

  function installRenderHook() {
    const oldRender = window.renderServicos;
    if (typeof oldRender !== 'function' || oldRender.__centralAlertasWrapped) return;
    function wrappedRenderServicos(ss) {
      oldRender(ss);
      aplicarEstadoNaTabela();
    }
    wrappedRenderServicos.__centralAlertasWrapped = true;
    window.renderServicos = wrappedRenderServicos;
    console.log('[CENTRAL_ALERTAS] renderServicos hook instalado');
  }

  function init() {
    void initSomPersistente();

    document.getElementById('centralChatSend')?.addEventListener('click', () => void enviarChat());
    document.getElementById('centralChatInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void enviarChat();
      }
    });
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => fecharModal(btn.getAttribute('data-close-modal')));
    });

    installRenderHook();

    void carregarMapsKey();
    void pollAlertas();
    setInterval(() => void pollAlertas(), POLL_MS);
    console.log('[CENTRAL_ALERTAS] polling iniciado intervalo=' + POLL_MS + 'ms');
  }

  window.centralAlertas = {
    abrirChat,
    abrirMapa,
    marcarServicoVisto,
    atalhosHtml,
    pollAlertas,
    aplicarEstadoNaTabela,
    toggleSom,
    playCentralAlert,
    ativarSom: toggleSom,
  };

  window.centralAtalhosHtml = atalhosHtml;

  installRenderHook();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installRenderHook();
      init();
    });
  } else {
    init();
  }
  window.addEventListener('load', installRenderHook);
})();
