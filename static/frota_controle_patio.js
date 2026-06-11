(function () {
  let itens = [];
  let profissionais = [];
  let seguradoras = [];
  let confirmarDuplicata = false;

  const modalEntrada = document.getElementById("modalEntradaPatio");
  const modalSaida = document.getElementById("modalSaidaPatio");
  const listaCards = document.getElementById("listaPatioCards");

  function el(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hojeISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function horaAtual() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function normalizarPlaca(v) {
    return String(v || "")
      .toUpperCase()
      .replace(/[\s\-.]/g, "");
  }

  function badgeStatus(st) {
    const s = (st || "no_patio").toLowerCase();
    const map = {
      no_patio: "frota-badge-patio-no_patio",
      saiu: "frota-badge-patio-saiu",
      cancelado: "frota-badge-patio-cancelado",
    };
    const lbl =
      s === "no_patio" ? "No pátio" : s === "saiu" ? "Saiu" : s === "cancelado" ? "Cancelado" : s;
    return `<span class="frota-badge-patio ${map[s] || "frota-badge-patio-no_patio"}">${esc(lbl)}</span>`;
  }

  function atualizarKpis(k) {
    if (!k) return;
    if (el("kpiPtNoPatio")) el("kpiPtNoPatio").textContent = String(k.no_patio ?? 0);
    if (el("kpiPtEntradas")) el("kpiPtEntradas").textContent = String(k.entradas_hoje ?? 0);
    if (el("kpiPtSaidas")) el("kpiPtSaidas").textContent = String(k.saidas_hoje ?? 0);
    if (el("kpiPtPendentes")) el("kpiPtPendentes").textContent = String(k.pendentes_saida ?? 0);
    if (el("kpiPtTempo")) el("kpiPtTempo").textContent = k.tempo_medio_fmt || "0min";
    if (el("kpiPtTotal")) el("kpiPtTotal").textContent = String(k.total_periodo ?? 0);
  }

  function montarQueryFiltros() {
    const params = new URLSearchParams();
    if (el("filtroDataIniPt")?.value) params.set("data_ini", el("filtroDataIniPt").value);
    if (el("filtroDataFimPt")?.value) params.set("data_fim", el("filtroDataFimPt").value);
    if (el("filtroStatusPt")?.value) params.set("status", el("filtroStatusPt").value);
    if (el("filtroSeguradoraPt")?.value?.trim()) params.set("seguradora", el("filtroSeguradoraPt").value.trim());
    if (el("filtroPlacaPt")?.value?.trim()) params.set("placa", normalizarPlaca(el("filtroPlacaPt").value));
    if (el("filtroMotoristaPt")?.value?.trim()) params.set("motorista", el("filtroMotoristaPt").value.trim());
    if (el("filtroResponsavelPt")?.value?.trim()) params.set("responsavel", el("filtroResponsavelPt").value.trim());
    if (el("filtroBuscaPt")?.value?.trim()) params.set("busca", el("filtroBuscaPt").value.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  function preencherDatalists() {
    const mk = (id, arr) => {
      const dl = el(id);
      if (!dl) return;
      dl.innerHTML = arr
        .map((x) => `<option value="${esc(typeof x === "string" ? x : x.label_operacional || x.label || x)}"></option>`)
        .join("");
    };
    mk("listaMotoristasPt", profissionais);
    mk("listaSeguradorasPt", seguradoras);
    mk("listaSeguradorasFiltro", seguradoras);
  }

  function resumirObs(texto, max = 90) {
    const t = (texto || "").trim();
    if (!t) return "-";
    return t.length > max ? t.slice(0, max) + "…" : t;
  }

  function criarCard(item) {
    const article = document.createElement("article");
    article.className = "frota-patio-card";
    const resp = item.responsavel_saida || item.responsavel_entrada || "-";
    const veiculo = [item.modelo, item.cor].filter(Boolean).join(" • ") || "—";
    const entrada = `${item.data_entrada_fmt || "-"} ${item.hora_chegada_fmt || ""}`.trim();
    const saida =
      item.status === "saiu" && item.hora_saida_fmt && item.hora_saida_fmt !== "-"
        ? `${item.data_saida_fmt && item.data_saida_fmt !== "-" ? item.data_saida_fmt + " " : ""}${item.hora_saida_fmt}`.trim()
        : "—";
    const obs = resumirObs(item.observacao || item.observacao_resumo);
    const obsFull = (item.observacao || item.observacao_resumo || "").trim();

    const body = document.createElement("div");
    body.className = "frota-patio-card-body";
    body.innerHTML = `
      <div class="frota-patio-card-head">
        <span class="frota-patio-placa">${esc(item.placa || "—")}</span>
        ${badgeStatus(item.status)}
        <span class="frota-patio-tempo">${esc(item.tempo_no_patio_fmt || "—")}</span>
      </div>
      <div class="frota-patio-veiculo">${esc(veiculo)}</div>
      <div class="frota-patio-meta">
        <span><strong>Motorista:</strong> ${esc(item.motorista || "—")}</span>
        <span><strong>Seguradora:</strong> ${esc(item.seguradora || "—")}</span>
        <span><strong>Responsável:</strong> ${esc(resp)}</span>
        <span><strong>Entrada:</strong> ${esc(entrada)}</span>
        <span><strong>Saída:</strong> ${esc(saida)}</span>
      </div>
      <div class="frota-patio-obs"${obsFull ? ` title="${esc(obsFull)}"` : ""}><strong>Obs:</strong> ${esc(obs)}</div>
    `;

    const acoes = document.createElement("div");
    acoes.className = "frota-patio-card-acoes";
    if (item.status === "no_patio") {
      const btnS = document.createElement("button");
      btnS.type = "button";
      btnS.className = "ctrl-btn ctrl-btn-primary frota-btn-saida-card";
      btnS.textContent = "Saída";
      btnS.addEventListener("click", () => abrirModalSaida(item));
      acoes.appendChild(btnS);
    }
    const btnE = document.createElement("button");
    btnE.type = "button";
    btnE.className = "ctrl-btn ctrl-btn-outline";
    btnE.textContent = "Editar";
    btnE.addEventListener("click", () => carregarItem(item.id));
    acoes.appendChild(btnE);
    if (item.status !== "cancelado") {
      const btnC = document.createElement("button");
      btnC.type = "button";
      btnC.className = "ctrl-btn ctrl-btn-outline ctrl-btn-sm cad-btn-danger frota-btn-cancel-card";
      btnC.textContent = "Cancelar";
      btnC.addEventListener("click", () => cancelarRegistro(item.id));
      acoes.appendChild(btnC);
    }

    article.appendChild(body);
    article.appendChild(acoes);
    return article;
  }

  function renderLista() {
    if (!listaCards) return;
    listaCards.innerHTML = "";
    if (!itens.length) {
      listaCards.innerHTML = '<p class="frota-patio-empty cad-empty-box">Nenhum registro encontrado.</p>';
      return;
    }
    itens.forEach((item) => listaCards.appendChild(criarCard(item)));
  }

  function limparFormularioEntrada() {
    confirmarDuplicata = false;
    el("patioId").value = "";
    el("pt_data_entrada").value = hojeISO();
    el("pt_hora_chegada").value = horaAtual();
    el("pt_motorista").value = "";
    el("pt_placa").value = "";
    el("pt_modelo").value = "";
    el("pt_cor").value = "";
    el("pt_seguradora").value = "";
    el("pt_responsavel_entrada").value = el("pt_responsavel_entrada").defaultValue || "Operação";
    el("pt_observacao").value = "";
    el("pt_data_saida").value = "";
    el("pt_hora_saida").value = "";
    el("pt_responsavel_saida").value = "";
    el("pt_observacao_saida").value = "";
    el("ptBlocoSaidaEdicao").style.display = "none";
    el("btnCancelarRegistroPt").style.display = "none";
    el("modalEntradaTitulo").textContent = "Entrada no Pátio";
    el("cadErroEntrada").style.display = "none";
  }

  function abrirModalEntrada(item) {
    modalEntrada.classList.add("open");
    modalEntrada.setAttribute("aria-hidden", "false");
    if (!item) {
      limparFormularioEntrada();
      return;
    }
    confirmarDuplicata = false;
    el("patioId").value = item.id;
    el("modalEntradaTitulo").textContent = "Editar registro";
    el("btnCancelarRegistroPt").style.display = item.status === "cancelado" ? "none" : "";
    el("pt_data_entrada").value = item.data_entrada_iso || hojeISO();
    el("pt_hora_chegada").value = item.hora_chegada_fmt || horaAtual();
    el("pt_motorista").value = item.motorista || "";
    el("pt_placa").value = item.placa || "";
    el("pt_modelo").value = item.modelo || "";
    el("pt_cor").value = item.cor || "";
    el("pt_seguradora").value = item.seguradora || "";
    el("pt_responsavel_entrada").value = item.responsavel_entrada || "Operação";
    el("pt_observacao").value = item.observacao || "";
    const showSaida = item.status === "saiu";
    el("ptBlocoSaidaEdicao").style.display = showSaida ? "block" : "none";
    if (showSaida) {
      el("pt_data_saida").value = item.data_saida_iso || "";
      el("pt_hora_saida").value = item.hora_saida_fmt !== "-" ? item.hora_saida_fmt : "";
      el("pt_responsavel_saida").value = item.responsavel_saida || "";
      el("pt_observacao_saida").value = item.observacao_saida || "";
    }
    el("cadErroEntrada").style.display = "none";
  }

  function fecharModalEntrada() {
    modalEntrada.classList.remove("open");
    modalEntrada.setAttribute("aria-hidden", "true");
  }

  function abrirModalSaida(item) {
    el("patioSaidaId").value = item.id;
    el("patioSaidaResumo").textContent = `Placa ${item.placa || "-"} — ${item.modelo || ""} ${item.cor || ""}`.trim();
    el("pt_saida_data").value = hojeISO();
    el("pt_saida_hora").value = horaAtual();
    el("pt_saida_responsavel").value = el("pt_saida_responsavel").defaultValue || "Operação";
    el("pt_saida_observacao").value = "";
    el("cadErroSaida").style.display = "none";
    modalSaida.classList.add("open");
    modalSaida.setAttribute("aria-hidden", "false");
  }

  function fecharModalSaida() {
    modalSaida.classList.remove("open");
    modalSaida.setAttribute("aria-hidden", "true");
  }

  function coletarPayloadEntrada() {
    const id = el("patioId").value;
    const payload = {
      data_entrada: el("pt_data_entrada").value,
      hora_chegada: el("pt_hora_chegada").value,
      motorista: el("pt_motorista").value.trim(),
      placa: normalizarPlaca(el("pt_placa").value),
      modelo: el("pt_modelo").value.trim(),
      cor: el("pt_cor").value.trim(),
      seguradora: el("pt_seguradora").value.trim(),
      responsavel_entrada: el("pt_responsavel_entrada").value.trim(),
      observacao: el("pt_observacao").value.trim(),
      confirmar_duplicata: confirmarDuplicata,
    };
    if (el("ptBlocoSaidaEdicao").style.display !== "none") {
      payload.data_saida = el("pt_data_saida").value || undefined;
      payload.hora_saida = el("pt_hora_saida").value || undefined;
      payload.responsavel_saida = el("pt_responsavel_saida").value.trim();
      payload.observacao_saida = el("pt_observacao_saida").value.trim();
      payload.status = "saiu";
    }
    if (id) payload.id = id;
    return payload;
  }

  async function salvarEntrada() {
    const err = el("cadErroEntrada");
    err.style.display = "none";
    const payload = coletarPayloadEntrada();
    const id = payload.id;
    const url = id ? `/api/frota/controle-patio/${id}` : "/api/frota/controle-patio";
    const method = id ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.status === 409 && json.requer_confirmacao) {
        if (confirm(json.mensagem || "Esta placa já está no pátio. Deseja continuar?")) {
          confirmarDuplicata = true;
          return salvarEntrada();
        }
        return;
      }
      if (!json.ok) throw new Error(json.erro || "Erro ao salvar");
      confirmarDuplicata = false;
      atualizarKpis(json.kpis);
      await carregarLista();
      fecharModalEntrada();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
    }
  }

  async function confirmarSaida() {
    const err = el("cadErroSaida");
    err.style.display = "none";
    const id = el("patioSaidaId").value;
    if (!id) return;
    const payload = {
      data_saida: el("pt_saida_data").value || hojeISO(),
      hora_saida: el("pt_saida_hora").value,
      responsavel_saida: el("pt_saida_responsavel").value.trim(),
      observacao_saida: el("pt_saida_observacao").value.trim(),
    };
    try {
      const res = await fetch(`/api/frota/controle-patio/${id}/saida`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.erro || "Erro ao registrar saída");
      atualizarKpis(json.kpis);
      await carregarLista();
      fecharModalSaida();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
    }
  }

  async function carregarOpcoes() {
    const [rp, rs] = await Promise.all([
      fetch("/api/frota/profissionais-opcoes"),
      fetch("/api/frota/seguradoras-opcoes"),
    ]);
    profissionais = (await rp.json()).itens || [];
    seguradoras = (await rs.json()).itens || [];
    preencherDatalists();
  }

  async function carregarLista() {
    const res = await fetch(`/api/frota/controle-patio${montarQueryFiltros()}`);
    const json = await res.json();
    if (json.ok) {
      itens = json.itens || [];
      atualizarKpis(json.kpis);
      renderLista();
    }
  }

  async function carregarItem(id) {
    const res = await fetch(`/api/frota/controle-patio/${id}`);
    const json = await res.json();
    if (json.ok) abrirModalEntrada(json.item);
  }

  async function cancelarRegistro(id) {
    if (!confirm("Cancelar este registro? O histórico será mantido com status Cancelado.")) return;
    const res = await fetch(`/api/frota/controle-patio/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      fecharModalEntrada();
      atualizarKpis(json.kpis);
      await carregarLista();
    } else alert(json.erro || "Erro ao cancelar");
  }

  el("btnNovaEntrada")?.addEventListener("click", () => abrirModalEntrada(null));
  el("btnFecharEntrada")?.addEventListener("click", fecharModalEntrada);
  el("btnSalvarEntrada")?.addEventListener("click", salvarEntrada);
  el("btnCancelarRegistroPt")?.addEventListener("click", () => {
    const id = el("patioId").value;
    if (id) cancelarRegistro(id);
  });
  el("btnFecharSaida")?.addEventListener("click", fecharModalSaida);
  el("btnConfirmarSaida")?.addEventListener("click", confirmarSaida);
  el("btnAplicarFiltrosPt")?.addEventListener("click", carregarLista);
  el("btnLimparFiltrosPt")?.addEventListener("click", () => {
    [
      "filtroDataIniPt",
      "filtroDataFimPt",
      "filtroSeguradoraPt",
      "filtroPlacaPt",
      "filtroMotoristaPt",
      "filtroResponsavelPt",
      "filtroBuscaPt",
    ].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    if (el("filtroStatusPt")) el("filtroStatusPt").value = "";
    carregarLista();
  });

  el("pt_placa")?.addEventListener("blur", (e) => {
    e.target.value = normalizarPlaca(e.target.value);
  });

  el("filtroBuscaPt")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      carregarLista();
    }
  });

  modalEntrada?.addEventListener("click", (e) => {
    if (e.target === modalEntrada) fecharModalEntrada();
  });
  modalSaida?.addEventListener("click", (e) => {
    if (e.target === modalSaida) fecharModalSaida();
  });

  (async function init() {
    await carregarOpcoes();
    await carregarLista();
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("registro");
    if (rid) {
      try {
        const res = await fetch(`/api/frota/controle-patio/${encodeURIComponent(rid)}`);
        const json = await res.json();
        if (json.ok && json.item) abrirModalEntrada(json.item);
      } catch (e) {
        console.warn("[patio] registro via URL não encontrado:", e);
      }
    }
  })();
})();
