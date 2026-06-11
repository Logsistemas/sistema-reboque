(function () {
  const REFRESH_MS = 30000;
  let mapa = null;
  let camadaMarcadores = null;
  let carregouComSucesso = false;

  function esc(t) {
    return String(t ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function criarIcone(cor) {
    return L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:999px;background:${cor};border:2px solid #fff;box-shadow:0 0 0 2px ${cor}66"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  function popupMotorista(m) {
    return `<b>${esc(m.nome)}</b><br>Placa: ${esc(m.placa)}<br>Status: ${esc(m.status_label)}<br>GPS: ${esc(m.gps_atualizacao)}`;
  }

  function initMapa() {
    const el = document.getElementById("dash-map");
    if (!el || typeof L === "undefined" || mapa) return;
    mapa = L.map("dash-map", { zoomControl: true }).setView([-23.55, -46.63], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(mapa);
    camadaMarcadores = L.layerGroup().addTo(mapa);
  }

  function atualizarMapa(motoristas) {
    if (!mapa) initMapa();
    if (!camadaMarcadores) return;
    camadaMarcadores.clearLayers();
    const bounds = [];
    (motoristas || []).forEach((m) => {
      if (m.lat == null || m.lng == null) return;
      const mk = L.marker([m.lat, m.lng], { icon: criarIcone(m.cor_marcador || "#64748b") });
      mk.bindPopup(popupMotorista(m));
      camadaMarcadores.addLayer(mk);
      bounds.push([m.lat, m.lng]);
    });
    if (bounds.length) mapa.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
  }

  function setKpi(key, val) {
    document.querySelectorAll(`[data-kpi="${key}"]`).forEach((el) => {
      el.textContent = val ?? "—";
    });
  }

  function renderKpis(k) {
    if (!k) return;
    Object.keys(k).forEach((key) => setKpi(key, k[key]));
    document.querySelectorAll(".dash-op-cards .dash-card").forEach((el) => el.classList.remove("skeleton"));
  }

  function renderPrevisao(p) {
    if (!p) return;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v ?? "—";
    };
    set("prev-hoje", p.faturado_hoje_fmt);
    set("prev-mes", p.faturado_mes_fmt);
    set("prev-media", p.media_diaria_fmt);
    set("prev-projecao", p.projecao_fmt);
    set("prev-meta", p.meta_fmt);
    set("prev-dias-dec", p.dias_decorridos);
    set("prev-dias-rest", p.dias_restantes);
    set("prev-progresso", `${p.progresso_pct ?? 0}% da meta`);
    const bar = document.getElementById("prev-progress-bar");
    if (bar) bar.style.width = `${Math.min(100, p.progresso_pct || 0)}%`;
  }

  function mostrarErro(visivel) {
    const el = document.getElementById("dash-erro-msg");
    if (el) el.hidden = !visivel;
  }

  function atualizarBadge(ok) {
    const badge = document.getElementById("dash-live-badge");
    if (!badge) return;
    if (ok) {
      badge.textContent = "● Atualizado";
      badge.classList.remove("off");
    } else if (carregouComSucesso) {
      badge.textContent = "● Dados em cache";
      badge.classList.add("off");
    } else {
      badge.textContent = "● Aguardando dados";
      badge.classList.add("off");
    }
  }

  async function carregarOperacional() {
    try {
      const res = await fetch("/api/dashboard/operacional", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      let data = null;
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new Error("Resposta inválida do servidor");
      }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.erro || `HTTP ${res.status}`);
      }

      const ref = document.getElementById("dash-data-ref");
      if (ref) ref.textContent = data.data_ref || "";

      renderKpis(data.kpis);
      renderPrevisao(data.previsao);
      if (data.motoristas_mapa) atualizarMapa(data.motoristas_mapa);

      carregouComSucesso = true;
      mostrarErro(false);
      atualizarBadge(true);
    } catch (e) {
      console.warn("[dashboard operacional]", e);
      mostrarErro(true);
      atualizarBadge(false);
    }
  }

  async function carregarMapaFallback() {
    if (carregouComSucesso) return;
    try {
      const res = await fetch("/api/dashboard/mapa", { cache: "no-store" });
      const data = await res.json();
      if (data.ok && data.motoristas_mapa) atualizarMapa(data.motoristas_mapa);
    } catch (e) {
      console.warn("[dashboard mapa fallback]", e);
    }
  }

  function init() {
    initMapa();
    carregarOperacional();
    carregarMapaFallback();
    setInterval(carregarOperacional, REFRESH_MS);
    setTimeout(() => {
      if (mapa) mapa.invalidateSize();
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.DashboardApp = { init, carregarOperacional };
})();
