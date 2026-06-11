(function () {
  let itens = [];
  let viaturas = [];
  let profissionais = [];
  let municipios = [];

  const modal = document.getElementById("modalMulta");
  const tbody = document.getElementById("tbodyMultas");

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

  function fmtMoeda(v) {
    return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function nowDatetimeLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function resolverDatalist(campoBusca, campoId, lista) {
    const txt = (el(campoBusca)?.value || "").trim();
    const found = lista.find(
      (x) =>
        x.label === txt ||
        x.label_operacional === txt ||
        x.label_admin === txt ||
        x.nome_exibicao === txt ||
        x.nome === txt
    );
    if (el(campoId)) el(campoId).value = found ? found.id : "";
    return found;
  }

  function calcularPreviewLocal() {
    const valor = parseFloat(el("mu_valor")?.value || "0");
    const pago = parseFloat(el("mu_valor_pago")?.value || "0");
    const aberto = Math.max(valor - pago, 0);
    if (el("muValorAbertoPreview")) el("muValorAbertoPreview").textContent = fmtMoeda(aberto);
    const venc = el("mu_data_vencimento")?.value;
    let st = "Pendente";
    if (valor > 0 && pago >= valor) st = "Pago";
    else if (venc) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const dv = new Date(venc + "T00:00:00");
      if (pago < valor && dv < hoje) st = "Vencido";
    }
    if (el("muStatusPreview")) el("muStatusPreview").textContent = st;
  }

  function badgeStatus(st) {
    const s = (st || "pendente").toLowerCase();
    const map = {
      pendente: "frota-badge-status-pendente",
      pago: "frota-badge-status-pago",
      vencido: "frota-badge-status-vencido",
      cancelado: "frota-badge-status-cancelada",
    };
    const cls = map[s] || "frota-badge-status-pendente";
    const lbl = s.charAt(0).toUpperCase() + s.slice(1);
    return `<span class="cad-badge ${cls}">${esc(lbl)}</span>`;
  }

  function atualizarKpis(k) {
    if (!k) return;
    if (el("kpiMuTotal")) el("kpiMuTotal").textContent = String(k.total ?? 0);
    if (el("kpiMuValor")) el("kpiMuValor").textContent = fmtMoeda(k.valor_total);
    if (el("kpiMuPago")) el("kpiMuPago").textContent = fmtMoeda(k.valor_pago);
    if (el("kpiMuAberto")) el("kpiMuAberto").textContent = fmtMoeda(k.valor_aberto);
    if (el("kpiMuVencidas")) el("kpiMuVencidas").textContent = String(k.vencidas ?? 0);
    if (el("kpiMuMes")) el("kpiMuMes").textContent = String(k.mes ?? 0);
  }

  function montarQueryFiltros() {
    const params = new URLSearchParams();
    if (el("filtroDataIniMu")?.value) params.set("data_ini", el("filtroDataIniMu").value);
    if (el("filtroDataFimMu")?.value) params.set("data_fim", el("filtroDataFimMu").value);
    if (el("filtroViaturaMu")?.value) params.set("viatura_id", el("filtroViaturaMu").value);
    if (el("filtroCondutorMu")?.value) params.set("condutor_id", el("filtroCondutorMu").value);
    if (el("filtroMunicipioMu")?.value?.trim()) params.set("municipio", el("filtroMunicipioMu").value.trim());
    if (el("filtroStatusMu")?.value) params.set("status", el("filtroStatusMu").value);
    if (el("filtroBuscaMu")?.value?.trim()) params.set("busca", el("filtroBuscaMu").value.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  function preencherSelectsFiltro() {
    const selV = el("filtroViaturaMu");
    if (selV) {
      const cur = selV.value;
      selV.innerHTML = '<option value="">Todas</option>';
      viaturas.forEach((v) => {
        selV.innerHTML += `<option value="${esc(v.id)}">${esc(v.label)}</option>`;
      });
      selV.value = cur;
    }
    const selC = el("filtroCondutorMu");
    if (selC) {
      const cur = selC.value;
      selC.innerHTML = '<option value="">Todos</option>';
      profissionais.forEach((p) => {
        selC.innerHTML += `<option value="${esc(p.id)}">${esc(p.label_operacional || p.label)}</option>`;
      });
      selC.value = cur;
    }
  }

  function preencherDatalists() {
    const mk = (id, arr, key) => {
      const dl = el(id);
      if (!dl) return;
      dl.innerHTML = arr
        .map((x) => `<option value="${esc(x[key] || x.label_operacional || x.label || x)}"></option>`)
        .join("");
    };
    mk("listaViaturasMu", viaturas, "label");
    mk("listaCondutoresMu", profissionais, "label_operacional");
    mk("listaResponsaveisMu", profissionais, "label_operacional");
    mk("listaMunicipiosMu", municipios.map((m) => ({ label: m })), "label");
    mk("listaMunicipiosFiltro", municipios.map((m) => ({ label: m })), "label");
  }

  function criarLinha(item) {
    const tr = document.createElement("tr");
    const cols = [
      item.data_hora_infracao_fmt || item.data_infracao_fmt || "-",
      item.auto_infracao || "-",
      item.viatura || "-",
      item.placa || "-",
      item.municipio || "-",
      item.condutor || "-",
      item.natureza || "-",
      item.valor_fmt || "-",
      item.valor_pago_fmt || "-",
      item.data_vencimento_fmt || "-",
      null,
      null,
    ];
    cols.forEach((val, idx) => {
      const td = document.createElement("td");
      if (idx === 10) td.innerHTML = badgeStatus(item.status);
      else if (idx === 11) {
        td.className = "cad-col-acoes";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ctrl-btn ctrl-btn-outline";
        btn.textContent = "Editar";
        btn.addEventListener("click", () => carregarItem(item.id));
        td.appendChild(btn);
      } else {
        td.textContent = val;
      }
      tr.appendChild(td);
    });
    return tr;
  }

  function renderTabela() {
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!itens.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 12;
      td.className = "cad-empty-box";
      td.textContent = "Nenhuma multa encontrada.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    itens.forEach((item) => tbody.appendChild(criarLinha(item)));
  }

  function limparFormulario() {
    el("multaId").value = "";
    el("mu_viatura_busca").value = "";
    el("mu_viatura_id").value = "";
    el("mu_auto_infracao").value = "";
    el("mu_data_hora_infracao").value = nowDatetimeLocal();
    el("mu_data_limite_indicacao").value = "";
    el("mu_municipio").value = "";
    el("mu_endereco").value = "";
    el("mu_descricao_multa").value = "";
    el("mu_natureza").value = "";
    el("mu_condutor_busca").value = "";
    el("mu_condutor_id").value = "";
    el("mu_responsavel_busca").value = "";
    el("mu_responsavel_id").value = "";
    el("mu_parcelas").value = "1";
    el("mu_data_vencimento").value = "";
    el("mu_valor").value = "";
    el("mu_valor_pago").value = "0";
    el("mu_observacao").value = "";
    el("mu_gerar_pagar").checked = false;
    el("mu_gerar_extrato").checked = false;
    el("btnExcluirMulta").style.display = "none";
    el("modalMultaTitulo").textContent = "Multa";
    el("cadErroMulta").style.display = "none";
    calcularPreviewLocal();
  }

  function abrirModal(item) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    if (!item) {
      limparFormulario();
      return;
    }
    el("multaId").value = item.id;
    el("modalMultaTitulo").textContent = "Editar multa";
    el("btnExcluirMulta").style.display = item.status === "cancelado" ? "none" : "";
    el("mu_viatura_id").value = item.viatura_id || "";
    const v = viaturas.find((x) => x.id === item.viatura_id);
    el("mu_viatura_busca").value = v?.label || item.viatura || "";
    el("mu_auto_infracao").value = item.auto_infracao || "";
    el("mu_data_hora_infracao").value = item.data_hora_infracao_iso || nowDatetimeLocal();
    el("mu_data_limite_indicacao").value = item.data_limite_indicacao_iso || "";
    el("mu_municipio").value = item.municipio || "";
    el("mu_endereco").value = item.endereco || "";
    el("mu_descricao_multa").value = item.descricao_multa || "";
    el("mu_natureza").value = item.natureza || "";
    el("mu_condutor_id").value = item.condutor_id || "";
    const c = profissionais.find((x) => x.id === item.condutor_id);
    el("mu_condutor_busca").value = c?.label || item.condutor || "";
    el("mu_responsavel_id").value = item.condutor_responsavel_id || "";
    const r = profissionais.find((x) => x.id === item.condutor_responsavel_id);
    el("mu_responsavel_busca").value = r?.label || item.condutor_responsavel || "";
    el("mu_parcelas").value = item.parcelas ?? 1;
    el("mu_data_vencimento").value = item.data_vencimento_iso || "";
    el("mu_valor").value = item.valor ?? "";
    el("mu_valor_pago").value = item.valor_pago ?? 0;
    el("mu_observacao").value = item.observacoes || "";
    el("mu_gerar_pagar").checked = !!item.gerar_contas_pagar;
    el("mu_gerar_extrato").checked = !!item.gerar_extrato_profissional;
    el("cadErroMulta").style.display = "none";
    calcularPreviewLocal();
  }

  function fecharModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function coletarPayload() {
    resolverDatalist("mu_viatura_busca", "mu_viatura_id", viaturas);
    resolverDatalist("mu_condutor_busca", "mu_condutor_id", profissionais);
    resolverDatalist("mu_responsavel_busca", "mu_responsavel_id", profissionais);
    return {
      id: el("multaId").value || undefined,
      viatura_id: el("mu_viatura_id").value,
      auto_infracao: el("mu_auto_infracao").value,
      data_hora_infracao: el("mu_data_hora_infracao").value,
      data_limite_indicacao: el("mu_data_limite_indicacao").value || undefined,
      municipio: el("mu_municipio").value,
      endereco: el("mu_endereco").value,
      descricao_multa: el("mu_descricao_multa").value,
      natureza: el("mu_natureza").value,
      condutor_id: el("mu_condutor_id").value,
      condutor_responsavel_id: el("mu_responsavel_id").value,
      parcelas: el("mu_parcelas").value,
      data_vencimento: el("mu_data_vencimento").value,
      valor: el("mu_valor").value,
      valor_pago: el("mu_valor_pago").value,
      observacao: el("mu_observacao").value,
      gerar_contas_pagar: el("mu_gerar_pagar").checked,
      gerar_extrato_profissional: el("mu_gerar_extrato").checked,
    };
  }

  async function carregarOpcoes() {
    const [rv, rp, rm] = await Promise.all([
      fetch("/api/frota/viaturas-opcoes"),
      fetch("/api/frota/profissionais-opcoes"),
      fetch("/api/frota/multas/opcoes/municipios"),
    ]);
    viaturas = (await rv.json()).itens || [];
    profissionais = (await rp.json()).itens || [];
    municipios = (await rm.json()).itens || [];
    preencherDatalists();
    preencherSelectsFiltro();
  }

  async function carregarLista() {
    const res = await fetch(`/api/frota/multas${montarQueryFiltros()}`);
    const json = await res.json();
    if (json.ok) {
      itens = json.itens || [];
      atualizarKpis(json.kpis);
      renderTabela();
    }
  }

  async function carregarItem(id) {
    const res = await fetch(`/api/frota/multas/${id}`);
    const json = await res.json();
    if (json.ok) abrirModal(json.item);
  }

  async function salvar() {
    const err = el("cadErroMulta");
    err.style.display = "none";
    const payload = coletarPayload();
    const id = payload.id;
    const url = id ? `/api/frota/multas/${id}` : "/api/frota/multas";
    const method = id ? "PUT" : "POST";
    const continuar = el("mu_continuar").checked && !id;
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.erro || "Erro ao salvar");
      atualizarKpis(json.kpis);
      await carregarLista();
      if (continuar) {
        limparFormulario();
        el("mu_continuar").checked = true;
      } else {
        fecharModal();
      }
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
    }
  }

  async function excluir() {
    const id = el("multaId").value;
    if (!id || !confirm("Cancelar esta multa?")) return;
    const res = await fetch(`/api/frota/multas/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      fecharModal();
      atualizarKpis(json.kpis);
      await carregarLista();
    } else alert(json.erro || "Erro ao cancelar");
  }

  el("btnNovaMulta")?.addEventListener("click", () => abrirModal(null));
  el("btnFecharMulta")?.addEventListener("click", fecharModal);
  el("btnSalvarMulta")?.addEventListener("click", salvar);
  el("btnExcluirMulta")?.addEventListener("click", excluir);
  el("btnAplicarFiltrosMu")?.addEventListener("click", carregarLista);
  el("btnLimparFiltrosMu")?.addEventListener("click", () => {
    ["filtroDataIniMu", "filtroDataFimMu", "filtroMunicipioMu", "filtroBuscaMu"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    ["filtroViaturaMu", "filtroCondutorMu", "filtroStatusMu"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    carregarLista();
  });

  ["mu_valor", "mu_valor_pago", "mu_data_vencimento"].forEach((id) => {
    el(id)?.addEventListener("input", calcularPreviewLocal);
  });

  ["filtroBuscaMu"].forEach((id) => {
    el(id)?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        carregarLista();
      }
    });
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
  });

  (async function init() {
    await carregarOpcoes();
    await carregarLista();
  })();
})();
