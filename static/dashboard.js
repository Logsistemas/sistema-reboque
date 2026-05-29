(function () {
  const REFRESH_MS = 30000;
  let mapa = null;
  let camadaMarcadores = null;

  function escapeHtml(t) {
    return String(t || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function criarIcone(cor) {
    return L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:999px;background:${cor};border:2px solid #fff;box-shadow:0 0 0 2px ${cor}66"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  function popupMotorista(m) {
    return `
      <b>${escapeHtml(m.nome)}</b><br>
      Placa: ${escapeHtml(m.placa)}<br>
      Status: ${escapeHtml(m.status_label)}<br>
      GPS: ${escapeHtml(m.gps_atualizacao)}<br>
      Distância até origem: ${escapeHtml(m.distancia_origem || '-')}
    `;
  }

  function atualizarMapa(motoristas) {
    if (!mapa) return;
    if (camadaMarcadores) {
      camadaMarcadores.clearLayers();
    } else {
      camadaMarcadores = L.layerGroup().addTo(mapa);
    }

    const bounds = [];
    (motoristas || []).forEach((m) => {
      if (m.lat == null || m.lng == null) return;
      const mk = L.marker([m.lat, m.lng], {
        icon: criarIcone(m.cor_marcador || '#64748b'),
      });
      mk.bindPopup(popupMotorista(m));
      camadaMarcadores.addLayer(mk);
      bounds.push([m.lat, m.lng]);
    });

    if (bounds.length) {
      mapa.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }
  }

  function initMapa(motoristas) {
    const el = document.getElementById('dash-map');
    if (!el || typeof L === 'undefined') return;

    mapa = L.map('dash-map', { zoomControl: true }).setView([-23.55, -46.63], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(mapa);

    atualizarMapa(motoristas);
  }

  function atualizarKpis(kpis) {
    if (!kpis) return;
    const mapaKpi = {
      total_cadastrados: kpis.total_cadastrados,
      concluidos: kpis.concluidos,
      em_origem_transporte: kpis.em_origem_transporte,
      do_dia: kpis.do_dia,
      recusados: kpis.recusados,
      cancelados: kpis.cancelados,
      motoristas_online: kpis.motoristas_online,
      receita_mes_fmt: kpis.receita_mes_fmt,
      tmc_dia: kpis.tmc_dia,
      tme_mes: kpis.tme_mes,
      km_hoje: kpis.km_hoje,
    };

    Object.keys(mapaKpi).forEach((chave) => {
      document.querySelectorAll(`[data-kpi="${chave}"]`).forEach((el) => {
        el.textContent = mapaKpi[chave];
      });
    });

    const dup = document.querySelector('[data-kpi="receita_mes_fmt_dup"]');
    if (dup) dup.textContent = kpis.receita_mes_fmt || '';
  }

  function atualizarResumoStatus(itens) {
    const box = document.getElementById('dash-resumo-status');
    if (!box || !itens) return;

    const max = Math.max(...itens.map((i) => i.total || 0), 1);
    box.innerHTML = itens
      .map((item) => {
        const pct = Math.round(((item.total || 0) * 100) / max);
        return `
          <div class="bar-row" data-status-row="${escapeHtml(item.chave)}">
            <span>${escapeHtml(item.status)}</span>
            <div class="bar-track">
              <div class="bar-fill" style="width:${pct}%"></div>
            </div>
            <b class="bar-qtd">${item.total || 0}</b>
          </div>
        `;
      })
      .join('');
  }

  function atualizarFinanceiro(itens, receitaFmt) {
    const box = document.getElementById('dash-resumo-financeiro');
    if (!box) return;

    if (!itens || !itens.length) {
      box.innerHTML = '<p class="muted">Sem movimentação financeira no mês.</p>';
      return;
    }

    box.innerHTML =
      itens
        .map(
          (item) => `
        <div class="finance-line">
          <span>${escapeHtml(item.status)}</span>
          <span><b>${item.total || 0}</b> serv. — ${escapeHtml(item.valor_fmt)}</span>
        </div>
      `
        )
        .join('') +
      `
      <div class="finance-line">
        <span><b>Total faturável</b></span>
        <span><b data-kpi="receita_mes_fmt_dup">${escapeHtml(receitaFmt)}</b></span>
      </div>
    `;
  }

  function atualizarAlertas(alertas) {
    const box = document.getElementById('dash-alertas');
    const count = document.getElementById('dash-alert-count');
    if (!box) return;

    if (count) count.textContent = String((alertas || []).length);

    if (!alertas || !alertas.length) {
      box.innerHTML = '<p class="muted alert-empty">Nenhum alerta no momento.</p>';
      return;
    }

    box.innerHTML = alertas
      .map(
        (a) => `
        <a class="alert-item" href="${escapeHtml(a.link || '/central')}">
          <span class="alert-ico">${escapeHtml(a.icone || '⚠')}</span>
          <span>${escapeHtml(a.texto)}</span>
        </a>
      `
      )
      .join('');
  }

  function atualizarRanking(ranking) {
    const box = document.getElementById('dash-ranking');
    if (!box) return;

    if (!ranking || !ranking.length) {
      box.innerHTML = '<p class="muted">Nenhum serviço atribuído hoje.</p>';
      return;
    }

    box.innerHTML = `
      <table class="ranking-table">
        <thead>
          <tr><th>#</th><th>Motorista</th><th>Serviços</th><th>Tempo médio</th></tr>
        </thead>
        <tbody>
          ${ranking
            .map(
              (m, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(m.nome)}</td>
              <td><b>${m.qtd || 0}</b></td>
              <td>${escapeHtml(m.tempo_medio || '0 min')}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  async function atualizarLive() {
    const badge = document.getElementById('dash-live-badge');
    try {
      const res = await fetch('/api/dashboard/live', { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) return;

      const ref = document.getElementById('dash-data-ref');
      if (ref) ref.textContent = data.data_ref || '';

      atualizarKpis(data.kpis);
      atualizarResumoStatus(data.resumo_status);
      atualizarFinanceiro(data.resumo_financeiro, data.kpis?.receita_mes_fmt);
      atualizarAlertas(data.alertas);
      atualizarRanking(data.ranking);
      atualizarMapa(data.motoristas_mapa);

      if (badge) {
        badge.textContent = '● Ao vivo';
        badge.classList.remove('off');
      }
    } catch (e) {
      if (badge) {
        badge.textContent = '● Reconectando...';
        badge.classList.add('off');
      }
    }
  }

  function init(motoristasIniciais) {
    initMapa(motoristasIniciais || []);
    setInterval(atualizarLive, REFRESH_MS);
    setTimeout(atualizarLive, 2000);
  }

  window.DashboardApp = { init, atualizarLive };
})();
