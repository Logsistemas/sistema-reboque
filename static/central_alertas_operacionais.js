/**
 * Alertas operacionais — Central (/central)
 * Som unificado via playCentralAlert(tipo)
 */
(function centralAlertasOperacionais() {
  'use strict';

  const LS_SOM = 'central_som_ativo';

  const SOUNDS = {
    mensagem: '/static/sounds/mobile_message.wav',
    placa: '/static/sounds/mobile_message.wav',
    recusa: '/static/sounds/ambulance_siren.wav',
    servico: '/static/sounds/mobile_message.wav',
    default: '/static/sounds/mobile_message.wav',
  };

  const state = {
    porServico: {},
    mapsKey: '',
    mapInstance: null,
    mapMarkers: [],
    chatServicoId: null,
    chatPoll: null,
    somAtivo: false,
    somDesbloqueado: false,
    audioCtx: null,
    inicializado: false,
    vistos: new Set(),
    lastMsgAt: '',
    audioCache: {},
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

  function somHabilitado() {
    return localStorage.getItem(LS_SOM) === '1' && state.somAtivo;
  }

  function atualizarIconeSom() {
    const btn = document.getElementById('btnCentralSomIco');
    if (!btn) return;
    const ativo = somHabilitado();
    btn.textContent = ativo ? '🔊' : '🔇';
    btn.title = ativo ? 'Som da Central ativo' : 'Som da Central desativado';
    btn.classList.toggle('central-som-on', ativo);
    btn.classList.toggle('central-som-off', !ativo);
  }

  async function desbloquearAudio() {
    try {
      state.audioCtx = state.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (state.audioCtx.state === 'suspended') {
        await state.audioCtx.resume();
      }
      state.somDesbloqueado = true;
    } catch (e) {
      console.log('[CENTRAL_ALERTAS] audio ctx', e);
    }
  }

  async function playBeepTeste() {
    try {
      await desbloquearAudio();
      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();
      osc.frequency.value = 1040;
      osc.connect(gain);
      gain.connect(state.audioCtx.destination);
      gain.gain.setValueAtTime(0.15, state.audioCtx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + 0.18);
      osc.stop(state.audioCtx.currentTime + 0.18);
    } catch (e) {
      console.log('[CENTRAL_ALERTAS] beep teste', e);
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

  async function playWebAudioFallback(tipo) {
    await desbloquearAudio();
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.frequency.value = tipo === 'recusa' ? 880 : 1040;
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);
    gain.gain.setValueAtTime(tipo === 'recusa' ? 0.2 : 0.15, state.audioCtx.currentTime);
    osc.start();
    const dur = tipo === 'recusa' ? 0.45 : 0.22;
    gain.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + dur);
    osc.stop(state.audioCtx.currentTime + dur);
  }

  /** Única função de som da Central — todos os alertas passam por aqui. */
  async function playCentralAlert(tipo) {
    const t = (tipo || 'default').toLowerCase();
    if (!somHabilitado()) {
      toast('Clique no ícone de som (🔇) no topo para liberar alertas sonoros.');
      return;
    }
    if (!state.somDesbloqueado) {
      toast('Clique no ícone de som (🔇) no topo para liberar alertas sonoros.');
      return;
    }

    const src = SOUNDS[t] || SOUNDS.default;
    console.log('[CENTRAL_ALERTAS] playCentralAlert', t, src);

    try {
      const audio = getAudio(src);
      audio.volume = t === 'recusa' ? 0.9 : 0.85;
      audio.currentTime = 0;
      await audio.play();
    } catch (e) {
      console.log('[CENTRAL_ALERTAS] wav falhou, fallback WebAudio', t, e);
      try {
        await playWebAudioFallback(t);
      } catch (err) {
        console.log('[CENTRAL_ALERTAS] fallback falhou', t, err);
      }
    }
  }

  async function toggleSom() {
    if (state.somAtivo && localStorage.getItem(LS_SOM) === '1') {
      state.somAtivo = false;
      localStorage.setItem(LS_SOM, '0');
      atualizarIconeSom();
      console.log('[CENTRAL_ALERTAS] som desativado');
      return;
    }
    state.somAtivo = true;
    localStorage.setItem(LS_SOM, '1');
    await desbloquearAudio();
    state.somDesbloqueado = true;
    await playBeepTeste();
    atualizarIconeSom();
    console.log('[CENTRAL_ALERTAS] som ativado');
  }

  function lookupInfo(sid) {
    const id = String(sid || '');
    const map = state.porServico || {};
    if (map[id]) return map[id];
    const hit = Object.keys(map).find((k) => String(k).toLowerCase() === id.toLowerCase());
    return hit ? map[hit] : {};
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

      const qMsg = info.mensagem || 0;
      const qPlaca = info.placa || 0;
      const qRecusa = info.recusa || 0;

      if (chatBtn) chatBtn.classList.toggle('alerta-piscando', qMsg > 0);
      if (chatBadge) {
        chatBadge.textContent = String(qMsg);
        chatBadge.classList.toggle('show', qMsg > 0);
      }

      if (placaCell) {
        const pisca = qPlaca > 0;
        placaCell.classList.toggle('placa-piscando', pisca);
        placaCell.classList.toggle('alerta-piscando', pisca);
        if (pisca) {
          console.log('[CENTRAL_ALERTAS] placa piscando servico_id=' + sid);
        }
        placaCell.onclick = (e) => {
          e.stopPropagation();
          void marcarVisto(sid, 'placa');
        };
      }

      if (statusCell) {
        const piscaRec = qRecusa > 0;
        statusCell.classList.toggle('alerta-piscando', piscaRec);
        if (piscaRec) {
          console.log('[CENTRAL_ALERTAS] recusa piscando servico_id=' + sid);
        }
      }
      tr.classList.toggle('linha-recusada', qRecusa > 0);
    });
  }

  function fp(tipo, servicoId, stamp) {
    return `${tipo}|${servicoId}|${stamp || ''}`;
  }

  function semearAlertasExistentes(data) {
    if (state.inicializado) return;

    const msgLatest = (data.mensagens && data.mensagens.latest_at) || '';
    if (msgLatest) state.lastMsgAt = msgLatest;

    (data.placas || []).forEach((p) => {
      state.vistos.add(fp('placa', p.servico_id, p.created_at_iso));
    });
    (data.recusas || []).forEach((r) => {
      state.vistos.add(fp('recusa', r.servico_id, r.created_at_iso));
    });
  }

  function processarNovosAlertas(data) {
    const novos = [];

    const msgLatest = (data.mensagens && data.mensagens.latest_at) || '';
    if (state.inicializado && msgLatest && msgLatest > state.lastMsgAt) {
      const item = ((data.mensagens && data.mensagens.itens) || [])[0] || {};
      novos.push({
        tipo: 'mensagem',
        servico_id: item.servico_id,
        protocolo: item.protocolo || '',
      });
      console.log('[CENTRAL_ALERTAS] mensagem detectada servico_id=' + (item.servico_id || ''));
    }
    if (msgLatest) state.lastMsgAt = msgLatest;

    (data.placas || []).forEach((p) => {
      const key = fp('placa', p.servico_id, p.created_at_iso);
      if (state.vistos.has(key)) return;
      state.vistos.add(key);
      if (state.inicializado) {
        novos.push({ tipo: 'placa', servico_id: p.servico_id, protocolo: p.protocolo || '' });
        console.log('[CENTRAL_ALERTAS] placa detectada servico_id=' + p.servico_id);
      }
    });

    (data.recusas || []).forEach((r) => {
      const key = fp('recusa', r.servico_id, r.created_at_iso);
      if (state.vistos.has(key)) return;
      state.vistos.add(key);
      if (state.inicializado) {
        novos.push({ tipo: 'recusa', servico_id: r.servico_id, protocolo: r.protocolo || '' });
        console.log('[CENTRAL_ALERTAS] recusa detectada servico_id=' + r.servico_id);
      }
    });

    return novos;
  }

  async function fetchAlertas() {
    const res = await fetch('/api/central/alertas', { cache: 'no-store' });
    return res.json();
  }

  async function pollAlertas() {
    try {
      const data = await fetchAlertas();
      if (!data.ok) return;

      semearAlertasExistentes(data);
      const novos = processarNovosAlertas(data);

      for (const n of novos) {
        if (n.tipo === 'placa') console.log('[CENTRAL_ALERTAS] som placa');
        if (n.tipo === 'recusa') console.log('[CENTRAL_ALERTAS] tocando sirene recusa');
        await playCentralAlert(n.tipo);
        if (n.tipo === 'mensagem') {
          toast(`Nova mensagem do motorista no protocolo ${n.protocolo || ''}`);
        } else if (n.tipo === 'placa') {
          toast(`Placa enviada pelo motorista no protocolo ${n.protocolo || ''}`);
        } else if (n.tipo === 'recusa') {
          toast(`Motorista recusou o serviço ${n.protocolo || ''}`);
        }
      }

      state.porServico = data.por_servico || {};
      state.inicializado = true;
      aplicarEstadoNaTabela();
    } catch (e) {
      console.log('[CENTRAL_ALERTAS] poll', e);
    }
  }

  async function marcarVisto(servicoId, tipos) {
    const lista = Array.isArray(tipos) ? tipos : [tipos];
    for (const tipo of lista) {
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

  function init() {
    if (localStorage.getItem(LS_SOM) !== '1' && localStorage.getItem('somAtivo') === '1') {
      localStorage.setItem(LS_SOM, '1');
    }
    state.somAtivo = localStorage.getItem(LS_SOM) === '1';
    if (state.somAtivo) {
      void desbloquearAudio();
    }
    atualizarIconeSom();

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

    const oldRender = window.renderServicos;
    if (typeof oldRender === 'function') {
      window.renderServicos = function wrappedRenderServicos(ss) {
        oldRender(ss);
        aplicarEstadoNaTabela();
      };
    }

    void carregarMapsKey();
    void pollAlertas();
    setInterval(() => void pollAlertas(), 5000);
  }

  window.centralAlertas = {
    abrirChat,
    abrirMapa,
    marcarServicoVisto,
    atalhosHtml,
    pollAlertas,
    toggleSom,
    playCentralAlert,
    ativarSom: toggleSom,
  };

  window.centralAtalhosHtml = atalhosHtml;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
