/**
 * Integração experimental Central ↔ Pátio (Fase 1 — somente consulta).
 * Módulo desacoplado: remover este arquivo + CSS + aba no template sem impacto nos fluxos.
 */
(function centralPatioIntegracao() {
  const root = document.getElementById("panel-patio");
  if (!root) return;

  const servicoId = root.dataset.servicoId;
  const content = document.getElementById("sdPatioContent");
  if (!servicoId || !content) return;

  let carregado = false;

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function badgeHtml(status, label) {
    const key = (status || "no_patio").toLowerCase();
    return `<span class="sd-patio-badge sd-patio-badge-${esc(key)}">${esc(label || status)}</span>`;
  }

  function renderVazio() {
    content.innerHTML = '<div class="sd-patio-empty">Nenhum registro de pátio encontrado.</div>';
  }

  function renderRegistro(reg) {
    const saidaBlock =
      reg.data_hora_saida
        ? `
        <div class="sd-patio-field">
          <label>Data/Hora de saída</label>
          <b>${esc(reg.data_hora_saida)}</b>
        </div>
        <div class="sd-patio-field">
          <label>Responsável pela saída</label>
          <b>${esc(reg.responsavel_saida || "-")}</b>
        </div>`
        : "";

    content.innerHTML = `
      <div class="sd-patio-wrap">
        <div class="sd-patio-card">
          <div class="sd-patio-card-head">
            <div>
              <span class="sd-patio-exp-tag">Integração experimental</span>
              <h3>Controle de Pátio</h3>
            </div>
            ${badgeHtml(reg.status, reg.status_label)}
          </div>
          <div class="sd-patio-grid">
            <div class="sd-patio-field">
              <label>Status</label>
              <b>${esc(reg.status_label)}</b>
            </div>
            <div class="sd-patio-field">
              <label>Tempo no pátio</label>
              <b>${esc(reg.tempo_no_patio_fmt || "-")}</b>
            </div>
            <div class="sd-patio-field">
              <label>Data/Hora de entrada</label>
              <b>${esc(reg.data_hora_entrada || "-")}</b>
            </div>
            <div class="sd-patio-field">
              <label>Responsável pela entrada</label>
              <b>${esc(reg.responsavel_entrada || "-")}</b>
            </div>
            ${saidaBlock}
          </div>
          <div class="sd-patio-actions">
            <a class="sd-patio-btn sd-patio-btn-primary" href="${esc(reg.url_registro || "#")}" target="_blank" rel="noopener">
              Ver Registro do Pátio
            </a>
          </div>
        </div>
      </div>`;
  }

  async function carregar() {
    if (carregado) return;
    content.innerHTML = '<div class="sd-patio-loading">Carregando informações do pátio…</div>';
    try {
      const res = await fetch(`/api/integracao/central-patio/servico/${encodeURIComponent(servicoId)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      carregado = true;
      if (!json.ok || !json.vinculo || !json.registro) {
        renderVazio();
        return;
      }
      renderRegistro(json.registro);
    } catch (err) {
      console.warn("[central-patio] falha ao carregar:", err);
      carregado = true;
      renderVazio();
    }
  }

  const observer = new MutationObserver(() => {
    if (root.classList.contains("active")) carregar();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });

  if (root.classList.contains("active")) carregar();
})();
