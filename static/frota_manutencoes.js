(function () {
  let itens = [];
  let viaturas = [];
  let fornecedores = [];
  let itensManutencao = [];
  let ultimoHodometro = null;
  let valorTotalItemManual = false;

  const modal = document.getElementById("modalManutencao");
  const modalItem = document.getElementById("modalItemManut");
  const tbody = document.getElementById("tbodyManutencoes");
  const tbodyItens = document.getElementById("tbodyItensManut");

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

  function hojeISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function normalizarTipo(t) {
    return String(t || "PRODUTO").toUpperCase().replace("Ç", "C");
  }

  function badgeStatus(st) {
    const s = (st || "finalizada").toLowerCase();
    const cls =
      s === "pendente"
        ? "frota-badge-status-pendente"
        : s === "cancelada"
        ? "frota-badge-status-cancelada"
        : "frota-badge-status-finalizada";
    const lbl = s.charAt(0).toUpperCase() + s.slice(1);
    return `<span class="cad-badge ${cls}">${esc(lbl)}</span>`;
  }

  function badgeTipo(t) {
    return `<span class="cad-badge frota-badge-tipo">${esc(t || "-")}</span>`;
  }

  function atualizarKpis(k) {
    if (!k) return;
    const map = { total: "kpiMnTotal", mes: "kpiMnMes" };
    Object.keys(map).forEach((key) => {
      const node = el(map[key]);
      if (node) node.textContent = String(k[key] ?? 0);
    });
    if (el("kpiMnValor")) el("kpiMnValor").textContent = fmtMoeda(k.valor_total);
    if (el("kpiMnProd")) el("kpiMnProd").textContent = fmtMoeda(k.total_produtos);
    if (el("kpiMnServ")) el("kpiMnServ").textContent = fmtMoeda(k.total_servicos);
    if (el("kpiMnMedia")) el("kpiMnMedia").textContent = fmtMoeda(k.media_manutencao);
  }

  function montarQueryFiltros() {
    const params = new URLSearchParams();
    if (el("filtroDataIniM")?.value) params.set("data_ini", el("filtroDataIniM").value);
    if (el("filtroDataFimM")?.value) params.set("data_fim", el("filtroDataFimM").value);
    if (el("filtroViaturaM")?.value) params.set("viatura_id", el("filtroViaturaM").value);
    if (el("filtroFornecedorM")?.value?.trim()) params.set("fornecedor", el("filtroFornecedorM").value.trim());
    if (el("filtroDocumentoM")?.value?.trim()) params.set("documento", el("filtroDocumentoM").value.trim());
    if (el("filtroStatusM")?.value) params.set("status", el("filtroStatusM").value);
    if (el("filtroBuscaM")?.value?.trim()) params.set("busca", el("filtroBuscaM").value.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  function preencherSelects() {
    const sel = el("filtroViaturaM");
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todas</option>';
    viaturas.forEach((v) => {
      sel.innerHTML += `<option value="${esc(v.id)}">${esc(v.label)}</option>`;
    });
    sel.value = cur;
    const dlV = el("listaViaturasMn");
    if (dlV) {
      dlV.innerHTML = viaturas.map((v) => `<option value="${esc(v.label)}"></option>`).join("");
    }
    const dlF = el("listaFornecedoresMn");
    if (dlF) {
      dlF.innerHTML = fornecedores.map((f) => `<option value="${esc(f.label)}"></option>`).join("");
    }
  }

  function resolverViatura() {
    const txt = (el("mn_viatura_busca")?.value || "").trim();
    const found = viaturas.find((v) => v.label === txt);
    el("mn_viatura_id").value = found ? found.id : "";
    return found;
  }

  function resolverFornecedor() {
    const txt = (el("mn_fornecedor_busca")?.value || "").trim();
    const found = fornecedores.find((f) => f.label === txt || f.nome === txt);
    el("mn_fornecedor_id").value = found ? found.id : "";
    return txt;
  }

  function calcularTotaisItens() {
    let prod = 0;
    let serv = 0;
    itensManutencao.forEach((it) => {
      const t = normalizarTipo(it.tipo);
      const v = Number(it.valor_total || 0);
      if (t === "SERVICO") serv += v;
      else prod += v;
    });
    el("mnTotalProdutos").textContent = fmtMoeda(prod);
    el("mnTotalServicos").textContent = fmtMoeda(serv);
    el("mnTotalGeral").textContent = fmtMoeda(prod + serv);
    return { prod, serv, total: prod + serv };
  }

  function renderItensManutencao() {
    if (!tbodyItens) return;
    tbodyItens.innerHTML = "";
    if (!itensManutencao.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.className = "cad-empty-box";
      td.textContent = "Nenhum item adicionado.";
      tr.appendChild(td);
      tbodyItens.appendChild(tr);
      calcularTotaisItens();
      return;
    }
    itensManutencao.forEach((it, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${badgeTipo(it.tipo)}</td>
        <td>${esc(it.item)}</td>
        <td>${fmtMoeda(it.valor_unitario)}</td>
        <td>${esc(it.quantidade)}</td>
        <td>${fmtMoeda(it.valor_total)}</td>
        <td class="cad-col-acoes">
          <button type="button" class="ctrl-btn ctrl-btn-outline ctrl-btn-sm" data-edit-item="${idx}">Editar</button>
          <button type="button" class="ctrl-btn ctrl-btn-outline ctrl-btn-sm cad-btn-danger" data-del-item="${idx}">×</button>
        </td>`;
      tbodyItens.appendChild(tr);
    });
    tbodyItens.querySelectorAll("[data-edit-item]").forEach((btn) => {
      btn.addEventListener("click", () => abrirModalItem(parseInt(btn.dataset.editItem, 10)));
    });
    tbodyItens.querySelectorAll("[data-del-item]").forEach((btn) => {
      btn.addEventListener("click", () => {
        itensManutencao.splice(parseInt(btn.dataset.delItem, 10), 1);
        renderItensManutencao();
      });
    });
    calcularTotaisItens();
  }

  async function buscarUltimoHodometro() {
    const vid = el("mn_viatura_id")?.value;
    const card = el("mnAlertaHodometro");
    if (!vid) {
      if (card) card.style.display = "none";
      ultimoHodometro = null;
      return;
    }
    const excluir = el("manutencaoId")?.value || "";
    const hod = el("mn_hodometro")?.value || "";
    const qs = new URLSearchParams({ hodometro: hod, excluir_id: excluir });
    try {
      const res = await fetch(`/api/frota/ultimo-hodometro/${vid}?${qs}`);
      const json = await res.json();
      if (!json.ok) return;
      ultimoHodometro = json.ultimo_hodometro;
      if (ultimoHodometro == null) {
        if (card) card.style.display = "none";
        return;
      }
      el("mnUltimoKmTxt").textContent = String(ultimoHodometro);
      const alertTxt = json.alerta || `Origem: ${json.origem || "registro anterior"}. Deseja utilizar o último hodômetro nesta manutenção?`;
      el("mnAlertaHodometroTxt").textContent = alertTxt;
      card.style.display = "block";
    } catch (e) {
      console.warn(e);
    }
  }

  function criarLinha(item) {
    const tr = document.createElement("tr");
    const cols = [
      item.data_fmt || "-",
      item.documento || "-",
      item.viatura || "-",
      item.placa || "-",
      item.fornecedor || "-",
      item.hodometro_fmt || "-",
      item.total_produtos_fmt || "-",
      item.total_servicos_fmt || "-",
      item.total_fmt || "-",
      null,
      null,
    ];
    cols.forEach((val, idx) => {
      const td = document.createElement("td");
      if (idx === 9) td.innerHTML = badgeStatus(item.status);
      else if (idx === 10) {
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
      td.colSpan = 11;
      td.className = "cad-empty-box";
      td.textContent = "Nenhuma manutenção encontrada.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    itens.forEach((item) => tbody.appendChild(criarLinha(item)));
  }

  function ativarTab(tab) {
    document.querySelectorAll("#modalManutencao .cad-nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.mnTab === tab);
    });
    document.querySelectorAll("#modalManutencao .cad-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.mnPanel === tab);
    });
  }

  function limparFormulario() {
    el("manutencaoId").value = "";
    el("mn_viatura_busca").value = "";
    el("mn_viatura_id").value = "";
    el("mn_data").value = hojeISO();
    el("mn_hodometro").value = "";
    el("mn_documento").value = "";
    el("mn_fornecedor_busca").value = "";
    el("mn_fornecedor_id").value = "";
    el("mn_observacao").value = "";
    el("mn_status").value = "finalizada";
    el("mn_gerar_pagar").checked = false;
    el("btnExcluirManut").style.display = "none";
    el("modalManutTitulo").textContent = "Nova manutenção";
    el("cadErroManut").style.display = "none";
    el("mnAlertaHodometro").style.display = "none";
    itensManutencao = [];
    renderItensManutencao();
    ativarTab("editar");
  }

  function abrirModal(item) {
    modal.classList.add("open");
    if (!item) {
      limparFormulario();
      return;
    }
    el("manutencaoId").value = item.id;
    el("modalManutTitulo").textContent = `Manutenção — ${item.viatura || item.placa || ""}`;
    el("btnExcluirManut").style.display = "";
    el("mn_viatura_id").value = item.viatura_id || "";
    const v = viaturas.find((x) => x.id === item.viatura_id);
    el("mn_viatura_busca").value = v?.label || item.viatura || "";
    el("mn_data").value = item.data_iso || hojeISO();
    el("mn_hodometro").value = item.hodometro ?? "";
    el("mn_documento").value = item.documento || "";
    el("mn_fornecedor_busca").value = item.fornecedor || "";
    el("mn_fornecedor_id").value = item.fornecedor_id || "";
    el("mn_observacao").value = item.observacoes || "";
    el("mn_status").value = item.status || "finalizada";
    el("mn_gerar_pagar").checked = !!item.gerar_contas_pagar;
    itensManutencao = (item.itens || []).map((it) => ({ ...it }));
    renderItensManutencao();
    el("cadErroManut").style.display = "none";
    ativarTab("editar");
    buscarUltimoHodometro();
  }

  function fecharModal() {
    modal.classList.remove("open");
  }

  function abrirModalItem(index) {
    console.log("ABRINDO MODAL ITEM");
    if (!modalItem) {
      console.error("Elemento #modalItemManut não encontrado");
      return;
    }
    const errItem = el("cadErroItem");
    if (errItem) errItem.style.display = "none";
    valorTotalItemManual = false;
    if (index == null || index < 0) {
      el("itemManutIndex").value = "";
      el("modalItemTitulo").textContent = "Cadastrar Item";
      el("it_tipo").value = "";
      el("it_item").value = "";
      el("it_valor_unitario").value = "0";
      el("it_quantidade").value = "1";
      el("it_valor_total").value = "0";
      el("it_observacao").value = "";
    } else {
      const it = itensManutencao[index];
      el("itemManutIndex").value = String(index);
      el("modalItemTitulo").textContent = "Editar item";
      el("it_tipo").value = it.tipo || "PRODUTO";
      el("it_item").value = it.item || "";
      el("it_valor_unitario").value = it.valor_unitario ?? 0;
      el("it_quantidade").value = it.quantidade ?? 1;
      el("it_valor_total").value = it.valor_total ?? 0;
      el("it_observacao").value = it.observacao || "";
    }
    modalItem.classList.add("open");
    modalItem.setAttribute("aria-hidden", "false");
    calcularValorTotalItem(true);
    el("it_tipo")?.focus();
  }

  function fecharModalItem() {
    if (!modalItem) return;
    modalItem.classList.remove("open");
    modalItem.setAttribute("aria-hidden", "true");
  }

  function calcularValorTotalItem(force) {
    const qtd = parseFloat(el("it_quantidade")?.value || "0");
    const unit = parseFloat(el("it_valor_unitario")?.value || "0");
    if (!force && valorTotalItemManual) return;
    if (qtd > 0 && unit >= 0) {
      el("it_valor_total").value = (qtd * unit).toFixed(2);
    }
  }

  function confirmarItem() {
    const err = el("cadErroItem");
    err.style.display = "none";
    const tipo = el("it_tipo").value;
    const item = (el("it_item").value || "").trim();
    const qtd = parseFloat(el("it_quantidade").value || "0");
    const vu = parseFloat(el("it_valor_unitario").value || "0");
    const vt = parseFloat(el("it_valor_total").value || "0");
    if (!tipo) {
      err.textContent = "Tipo é obrigatório.";
      err.style.display = "block";
      return;
    }
    if (!item) {
      err.textContent = "Item é obrigatório.";
      err.style.display = "block";
      return;
    }
    if (qtd <= 0) {
      err.textContent = "Quantidade deve ser maior que zero.";
      err.style.display = "block";
      return;
    }
    if (vu < 0 || vt < 0) {
      err.textContent = "Valores inválidos.";
      err.style.display = "block";
      return;
    }
    const payload = {
      tipo: normalizarTipo(tipo),
      item,
      valor_unitario: vu,
      quantidade: qtd,
      valor_total: vt,
      observacao: el("it_observacao").value.trim(),
    };
    const idx = el("itemManutIndex").value;
    if (idx !== "") itensManutencao[parseInt(idx, 10)] = payload;
    else itensManutencao.push(payload);
    console.log("ITEM ADICIONADO");
    renderItensManutencao();
    if (el("it_continuar").checked && idx === "") {
      el("it_tipo").value = tipo;
      el("it_item").value = "";
      el("it_valor_unitario").value = "0";
      el("it_quantidade").value = "1";
      el("it_valor_total").value = "0";
      el("it_observacao").value = "";
      valorTotalItemManual = false;
    } else {
      fecharModalItem();
    }
  }

  function coletarPayload() {
    resolverViatura();
    const forn = resolverFornecedor();
    return {
      id: el("manutencaoId").value || undefined,
      viatura_id: el("mn_viatura_id").value,
      data: el("mn_data").value,
      hodometro: el("mn_hodometro").value,
      documento: el("mn_documento").value,
      fornecedor: forn || el("mn_fornecedor_busca").value.trim(),
      fornecedor_id: el("mn_fornecedor_id").value || undefined,
      observacao: el("mn_observacao").value,
      status: el("mn_status").value,
      gerar_contas_pagar: el("mn_gerar_pagar").checked,
      itens: itensManutencao,
    };
  }

  async function carregarOpcoes() {
    const [rv, rf] = await Promise.all([
      fetch("/api/frota/viaturas-opcoes"),
      fetch("/api/frota/fornecedores-opcoes"),
    ]);
    viaturas = (await rv.json()).itens || [];
    fornecedores = (await rf.json()).itens || [];
    preencherSelects();
  }

  async function carregarLista() {
    const res = await fetch(`/api/frota/manutencoes${montarQueryFiltros()}`);
    const json = await res.json();
    if (json.ok) {
      itens = json.itens || [];
      atualizarKpis(json.kpis);
      renderTabela();
    }
  }

  async function carregarItem(id) {
    const res = await fetch(`/api/frota/manutencoes/${id}`);
    const json = await res.json();
    if (json.ok) abrirModal(json.item);
  }

  async function salvar() {
    const err = el("cadErroManut");
    err.style.display = "none";
    const payload = coletarPayload();
    const id = payload.id;
    const url = id ? `/api/frota/manutencoes/${id}` : "/api/frota/manutencoes";
    const method = id ? "PUT" : "POST";
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
      fecharModal();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
    }
  }

  async function excluir() {
    const id = el("manutencaoId").value;
    if (!id || !confirm("Cancelar esta manutenção?")) return;
    const res = await fetch(`/api/frota/manutencoes/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      fecharModal();
      atualizarKpis(json.kpis);
      await carregarLista();
    } else alert(json.erro || "Erro ao cancelar");
  }

  el("btnNovaManutencao")?.addEventListener("click", () => abrirModal(null));
  el("btnFecharManut")?.addEventListener("click", fecharModal);
  el("btnSalvarManut")?.addEventListener("click", salvar);
  el("btnExcluirManut")?.addEventListener("click", excluir);
  el("btnAplicarFiltrosM")?.addEventListener("click", carregarLista);
  el("btnLimparFiltrosM")?.addEventListener("click", () => {
    ["filtroDataIniM", "filtroDataFimM", "filtroFornecedorM", "filtroDocumentoM", "filtroBuscaM"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    ["filtroViaturaM", "filtroStatusM"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    carregarLista();
  });
  el("btnAddItemManut")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("CLICOU + ITEM");
    abrirModalItem(null);
  });
  el("btnAddItemConfirm")?.addEventListener("click", confirmarItem);
  el("btnFecharItem")?.addEventListener("click", fecharModalItem);
  el("btnUsarUltimoKm")?.addEventListener("click", () => {
    if (ultimoHodometro != null) {
      el("mn_hodometro").value = String(ultimoHodometro);
      el("mnAlertaHodometro").style.display = "none";
      buscarUltimoHodometro();
    }
  });
  el("btnIgnorarUltimoKm")?.addEventListener("click", () => {
    el("mnAlertaHodometro").style.display = "none";
  });

  document.querySelectorAll("#modalManutencao .cad-nav-btn").forEach((b) => {
    b.addEventListener("click", () => ativarTab(b.dataset.mnTab));
  });

  el("mn_viatura_busca")?.addEventListener("change", () => {
    resolverViatura();
    buscarUltimoHodometro();
  });
  el("mn_hodometro")?.addEventListener("input", buscarUltimoHodometro);

  ["it_quantidade", "it_valor_unitario"].forEach((id) => {
    el(id)?.addEventListener("input", () => calcularValorTotalItem(false));
  });
  el("it_valor_total")?.addEventListener("input", () => {
    valorTotalItemManual = true;
  });

  ["filtroBuscaM"].forEach((id) => {
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
  modalItem?.addEventListener("click", (e) => {
    if (e.target === modalItem) fecharModalItem();
  });

  (async function init() {
    await carregarOpcoes();
    await carregarLista();
  })();
})();
