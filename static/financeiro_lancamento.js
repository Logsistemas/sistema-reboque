(function () {
  const body = document.body;
  if (body.dataset.finPage === "caixa") return;

  const tipo = body.dataset.finTipo || "pagar";
  const API = body.dataset.finApi || "/api/financeiro/contas-pagar";
  const API_LOTE = API + "/baixa-lote";
  const isPagar = tipo === "pagar";
  const S = window.FinShared;
  let itens = [];
  let contas = [];
  let itemAtual = null;
  let baixaLinhas = [];
  let anexosPendentes = [];
  let categoriasFin = null;
  const naturezaFin = isPagar ? "Despesa" : "Receita";
  const modal = document.getElementById("modalFin");
  const modalBaixa = document.getElementById("modalBaixa");
  const tbody = document.getElementById("tbodyLista");
  const erro = document.getElementById("finErro");

  function el(id) {
    return document.getElementById(id);
  }

  const STORAGE_KEY = `fin_${tipo}_filtros`;

  function salvarFiltros() {
    S.storageSet(STORAGE_KEY, {
      busca: el("topBusca")?.value || "",
      data_ini: el("topDataIni")?.value || "",
      data_fim: el("topDataFim")?.value || "",
      periodo_label: el("lblPeriodo")?.textContent || "",
      situacao: situacaoAtiva(),
      ff_categoria: el("ff_categoria")?.value || "",
      ff_tipo: el("ff_tipo")?.value || "",
      ff_forma: el("ff_forma")?.value || "",
      ff_valor_min: el("ff_valor_min")?.value || "",
      ff_valor_max: el("ff_valor_max")?.value || "",
      ff_numero_doc: el("ff_numero_doc")?.value || "",
    });
  }

  function restaurarFiltros() {
    const s = S.storageGet(STORAGE_KEY);
    if (!s || !Object.keys(s).length) return false;
    if (el("topBusca") && s.busca != null) el("topBusca").value = s.busca;
    if (s.data_ini && s.data_fim) {
      S.aplicarPeriodoUI({
        data_ini: s.data_ini,
        data_fim: s.data_fim,
        label: s.periodo_label || "Período",
      });
    }
    [
      ["ff_categoria", s.ff_categoria],
      ["ff_tipo", s.ff_tipo],
      ["ff_forma", s.ff_forma],
      ["ff_valor_min", s.ff_valor_min],
      ["ff_valor_max", s.ff_valor_max],
      ["ff_numero_doc", s.ff_numero_doc],
    ].forEach(([id, val]) => {
      if (el(id) && val != null) el(id).value = val;
    });
    if (s.situacao != null) {
      document.querySelectorAll("#filtroSituacao .fin-pill").forEach((p) => {
        p.classList.toggle("active", (p.dataset.sit ?? "") === (s.situacao ?? ""));
      });
    }
    return true;
  }

  function situacaoAtiva() {
    return document.querySelector(".fin-pill.active")?.dataset.sit ?? "";
  }

  function initPills() {
    document.querySelectorAll("#filtroSituacao .fin-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        document.querySelectorAll("#filtroSituacao .fin-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        salvarFiltros();
        carregarLista().catch((e) => S.toast(e.message));
      });
    });
  }

  function emptyRow(msg, hint) {
    return `<tr><td colspan="7" class="fin-empty">
      <div class="fin-empty-inner">
        <div class="fin-empty-icon">📋</div>
        <p class="fin-empty-title">${msg}</p>
        <p class="fin-empty-text">${hint}</p>
      </div>
    </td></tr>`;
  }

  function montarQuery() {
    const q = new URLSearchParams();
    const sit = situacaoAtiva();
    if (sit) q.set("situacao", sit);
    const cat = el("ff_categoria")?.value?.trim();
    const tp = el("ff_tipo")?.value?.trim();
    const fm = el("ff_forma")?.value?.trim();
    const vmin = el("ff_valor_min")?.value;
    const vmax = el("ff_valor_max")?.value;
    const ndoc = el("ff_numero_doc")?.value?.trim();
    const busca = el("topBusca")?.value?.trim();
    const di = el("topDataIni")?.value;
    const df = el("topDataFim")?.value;
    if (cat) q.set("categoria", cat);
    if (tp) q.set(isPagar ? "tipo_pagamento" : "tipo_recebimento", tp);
    if (fm) q.set(isPagar ? "forma_pagamento" : "forma_recebimento", fm);
    if (vmin) q.set("valor_min", vmin);
    if (vmax) q.set("valor_max", vmax);
    if (ndoc) q.set("numero_documento", ndoc);
    if (busca) q.set("busca", busca);
    if (di) q.set("data_ini", di);
    if (df) q.set("data_fim", df);
    return q.toString() ? `${API}?${q}` : API;
  }

  function configurarLabels() {
    if (el("lblParte")) el("lblParte").textContent = isPagar ? "Fornecedor" : "Cliente";
    if (el("lblForma")) el("lblForma").textContent = isPagar ? "Forma de pagamento" : "Forma de recebimento";
    if (el("lblTipoPgto")) el("lblTipoPgto").textContent = isPagar ? "Tipo de pagamento" : "Tipo de recebimento";
    if (el("lblDataBaixa")) el("lblDataBaixa").textContent = isPagar ? "Data pagamento" : "Data recebimento";
    if (el("modalNavTitulo")) el("modalNavTitulo").textContent = isPagar ? "Conta a pagar" : "Conta a receber";
    if (el("btnConfirmarBaixa")) {
      el("btnConfirmarBaixa").textContent = isPagar ? "Confirmar pagamento total" : "Confirmar recebimento total";
    }
  }

  function labelStatus(st) {
    const m = { em_aberto: "Em aberto", pago: "Pago", recebido: "Recebido", atrasado: "Vencido", cancelado: "Cancelado" };
    return m[st] || st;
  }

  function bindTabelaLinhas() {
    if (!tbody || tbody.dataset.lancClickBound) return;
    tbody.dataset.lancClickBound = "1";
    tbody.addEventListener("click", (e) => {
      if (e.target.closest("input.chk-row")) return;
      const tr = e.target.closest("tr[data-id]");
      if (!tr?.dataset.id) return;
      abrirDetalhe(tr.dataset.id).catch((err) => S.toast(err.message || "Erro ao abrir lançamento"));
    });
    tbody.addEventListener("mousedown", (e) => {
      if (e.target.closest("input.chk-row")) e.stopPropagation();
    });
    tbody.addEventListener("keydown", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      abrirDetalhe(tr.dataset.id).catch((err) => S.toast(err.message || "Erro ao abrir lançamento"));
    });
  }

  function render() {
    if (!tbody) return;
    if (!itens.length) {
      tbody.innerHTML = emptyRow(
        "Nenhum lançamento encontrado",
        "Ajuste os filtros ou clique em Incluir conta para cadastrar."
      );
      return;
    }
    tbody.innerHTML = itens
      .map((i) => {
        const parte = isPagar ? i.fornecedor : i.cliente;
        const forma = isPagar ? i.forma_pagamento : i.forma_recebimento;
        const podeBaixar = i.status === "em_aberto" || i.status === "atrasado";
        const clip = i.tem_anexos
          ? '<span class="fin-clip" title="Possui anexos" aria-label="Possui anexos"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z"/></svg></span>'
          : "";
        return `<tr class="fin-row-clickable" data-id="${i.id}" tabindex="0" role="button" aria-label="Abrir detalhe do lançamento">
          <td class="fin-col-chk"><input type="checkbox" class="chk-row" value="${i.id}" ${podeBaixar ? "" : "disabled"}></td>
          <td><b>${parte || "-"}</b></td>
          <td>${i.historico || i.descricao || "-"}</td>
          <td>${forma || "-"}</td>
          <td>${i.vencimento_fmt || i.vencimento || "-"}</td>
          <td class="fin-valor"><span class="fin-valor-inner">${i.valor_fmt}${clip}</span></td>
          <td>${S.statusBadge(i.status)}</td>
        </tr>`;
      })
      .join("");
  }

  async function carregarLista() {
    salvarFiltros();
    const j = await S.apiJson(montarQuery());
    itens = j.itens || [];
    contas = j.contas || [];
    S.atualizarPainel(j.painel);
    if (j.kpis) S.atualizarKpis(j.kpis);
    render();
  }

  function payloadForm() {
    const base = {
      descricao: el("f_descricao").value,
      categoria_id: el("f_categoria_id")?.value || "",
      numero_documento: el("f_numero_documento")?.value,
      competencia: el("f_competencia").value,
      emissao: el("f_emissao").value,
      vencimento: el("f_vencimento").value,
      valor: el("f_valor").value,
      parcelas: el("f_parcelas").value,
      conta_financeira_id: el("f_conta_financeira_id").value,
      observacoes: el("f_observacoes").value,
      status: "em_aberto",
    };
    if (isPagar) {
      base.fornecedor = el("f_parte").value;
      base.forma_pagamento = el("f_forma").value;
      base.tipo_pagamento = el("f_tipo_pagamento")?.value;
    } else {
      base.cliente = el("f_parte").value;
      base.forma_recebimento = el("f_forma").value;
      base.tipo_recebimento = el("f_tipo_pagamento")?.value;
    }
    return base;
  }

  function atualizarStatusLabel(st) {
    const lb = el("f_status_label");
    const hid = el("f_status");
    if (lb) lb.textContent = labelStatus(st || "em_aberto");
    if (hid) hid.value = st || "em_aberto";
  }

  function preencherForm(item) {
    el("f_parte").value = (isPagar ? item?.fornecedor : item?.cliente) || "";
    el("f_descricao").value = item?.descricao || "";
    if (el("f_numero_documento")) el("f_numero_documento").value = item?.numero_documento || "";
    if (el("f_categoria_id")) el("f_categoria_id").value = item?.categoria_id || "";
    S.preencherSelectCategorias(el("f_categoria_id"), categoriasFin, item?.categoria_id || "");
    if (el("f_tipo_pagamento")) {
      el("f_tipo_pagamento").value = (isPagar ? item?.tipo_pagamento : item?.tipo_recebimento) || "";
    }
    el("f_competencia").value = S.isoDate(item?.competencia);
    el("f_emissao").value = S.isoDate(item?.emissao);
    el("f_vencimento").value = S.isoDate(item?.vencimento);
    el("f_valor").value = item?.valor ?? "";
    el("f_parcelas").value = item?.parcelas || 1;
    if (el("f_parcelas_dup")) el("f_parcelas_dup").value = item?.parcelas || 1;
    if (el("f_valor_parcelas")) el("f_valor_parcelas").value = item?.valor_fmt || item?.valor || "";
    el("f_forma").value = (isPagar ? item?.forma_pagamento : item?.forma_recebimento) || "";
    atualizarStatusLabel(item?.status || "em_aberto");
    el("f_observacoes").value = item?.observacoes || "";
    S.preencherSelectContas(el("f_conta_financeira_id"), contas, item?.conta_financeira_id);
    S.preencherSelectContas(el("bx_conta_financeira_id"), contas, item?.conta_financeira_id);
    el("bx_data").value = S.isoDate(isPagar ? item?.data_pagamento : item?.data_recebimento) || S.hojeISO();
    el("bx_valor").value = item?.valor ?? "";
    const fechado = item && (item.status === "pago" || item.status === "recebido");
    if (el("btnConfirmarBaixa")) el("btnConfirmarBaixa").disabled = !!fechado;
    if (el("baixaHint")) {
      el("baixaHint").textContent = fechado
        ? "Lançamento já baixado. Consulte o histórico de movimentações."
        : "A baixa gera movimentação no Caixa e Bancos e atualiza o saldo da conta escolhida.";
    }
    renderAnexosLista(item?.anexos || []);
    renderHistorico(item?.historico || []);
  }

  function limparAnexosPendentes() {
    anexosPendentes = [];
    const inp = el("anexoArquivo");
    if (inp) inp.value = "";
  }

  function anexosParaExibir(salvos) {
    const pendentes = anexosPendentes.map((p, idx) => ({
      id: `pending-${idx}`,
      nome_arquivo: p.nome,
      tipo: p.tipo,
      created_at_fmt: "Aguardando salvar",
      pendente: true,
      pendingIdx: idx,
    }));
    return [...(salvos || []), ...pendentes];
  }

  function renderAnexosLista(salvos) {
    renderAnexos(anexosParaExibir(salvos));
  }

  function adicionarAnexoPendente(file) {
    if (!file || !file.size) return;
    anexosPendentes.push({
      file,
      nome: el("anexoNome")?.value?.trim() || file.name,
      tipo: el("anexoTipo")?.value?.trim() || "Outros",
    });
    if (el("anexoNome")) el("anexoNome").value = "";
    if (el("anexoTipo")) el("anexoTipo").value = "";
    if (el("anexoArquivo")) el("anexoArquivo").value = "";
    renderAnexosLista(itemAtual?.anexos || []);
    S.toast("Arquivo adicionado. Clique em Salvar para gravar.");
  }

  async function enviarAnexosPendentes(lancId) {
    if (!anexosPendentes.length) return itemAtual?.anexos || [];
    let anexos = itemAtual?.anexos || [];
    for (const p of anexosPendentes) {
      const fd = new FormData();
      fd.append("arquivo", p.file, p.file.name);
      fd.append("nome", p.nome);
      fd.append("tipo", p.tipo);
      const r = await fetch(`${API}/${lancId}/anexos`, { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro ao gravar anexo");
      anexos = j.anexos || anexos;
    }
    anexosPendentes = [];
    return anexos;
  }

  function renderAnexos(anexos) {
    const tb = el("tbodyAnexos");
    if (!tb) return;
    if (!anexos.length) {
      tb.innerHTML = '<tr><td colspan="4" class="muted">Sem anexos.</td></tr>';
      return;
    }
    tb.innerHTML = anexos
      .map((a) => {
        const nome = String(a.nome_arquivo || "arquivo").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        const nomeCell = a.pendente
          ? `<span class="fin-anexo-link fin-anexo-pendente">${nome}</span> <span class="fin-anexo-badge">novo</span>`
          : `<a href="${a.url_download || a.caminho_arquivo || "#"}" class="fin-anexo-link" target="_blank" rel="noopener">${nome}</a>`;
        const btn = a.pendente
          ? `<button type="button" class="fin-btn-table btn-del-pending" data-idx="${a.pendingIdx}">Remover</button>`
          : `<button type="button" class="fin-btn-table fin-btn-table-danger btn-del-anexo" data-id="${a.id}">Excluir</button>`;
        return `<tr>
        <td>${nomeCell}</td>
        <td>${a.tipo || "-"}</td>
        <td>${a.created_at_fmt || "-"}</td>
        <td class="fin-acoes-anexo">${btn}</td></tr>`;
      })
      .join("");
  }

  function bindAnexosTabela() {
    const tb = el("tbodyAnexos");
    if (!tb || tb.dataset.anexosBound) return;
    tb.dataset.anexosBound = "1";
    tb.addEventListener("click", async (e) => {
      const btnPending = e.target.closest(".btn-del-pending");
      if (btnPending) {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(btnPending.dataset.idx, 10);
        if (!Number.isNaN(idx)) {
          anexosPendentes.splice(idx, 1);
          renderAnexosLista(itemAtual?.anexos || []);
        }
        return;
      }
      const btn = e.target.closest(".btn-del-anexo");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (!confirm("Excluir este anexo?")) return;
      try {
        const r = await fetch(`/api/financeiro/anexos/${btn.dataset.id}`, { method: "DELETE" });
        const j = await r.json();
        if (!j.ok) throw new Error(j.erro || "Erro ao excluir");
        if (itemAtual) itemAtual.anexos = j.anexos || [];
        renderAnexosLista(j.anexos || []);
        await carregarLista();
        S.toast("Anexo excluído.");
      } catch (err) {
        S.toast(err.message || "Erro ao excluir anexo");
      }
    });
  }

  function renderHistorico(hist) {
    const tb = el("tbodyHistorico");
    if (!tb) return;
    if (!hist.length) {
      tb.innerHTML = '<tr><td colspan="5" class="muted">Nenhuma movimentação vinculada.</td></tr>';
      return;
    }
    tb.innerHTML = hist
      .map((h) => {
        const cls = h.tipo === "entrada" ? "fin-tipo-entrada" : "fin-tipo-saida";
        return `<tr>
          <td>${h.data_movimento_fmt || "-"}</td>
          <td class="${cls}">${h.tipo}</td>
          <td>${h.conta_nome || "-"}</td>
          <td>${h.valor_fmt || h.valor}</td>
          <td>${h.descricao || "-"}</td>
        </tr>`;
      })
      .join("");
  }

  async function abrirDetalhe(id, abaBaixa) {
    if (!categoriasFin) await carregarCategoriasFin().catch(() => {});
    const j = await S.apiJson(`${API}/${id}`);
    itemAtual = j.item;
    contas = j.contas || contas;
    abrir(itemAtual);
    if (abaBaixa) {
      modal.querySelector('[data-fin-tab="baixa"]')?.click();
    }
  }

  function abrir(item) {
    itemAtual = item;
    limparAnexosPendentes();
    modal.classList.add("open");
    S.mostrarErro(erro, "");
    el("regId").value = item?.id || "";
    el("modalTitulo").textContent = item
      ? (isPagar ? item.fornecedor : item.cliente) || "Lançamento"
      : isPagar ? "Incluir conta a pagar" : "Incluir conta a receber";
    el("btnExcluir").style.display = item?.id ? "inline-block" : "none";
    S.preencherSelectContas(el("f_conta_financeira_id"), contas, item?.conta_financeira_id);
    preencherForm(item || {});
    if (!item?.id) {
      renderAnexosLista([]);
      renderHistorico([]);
      el("bx_data").value = S.hojeISO();
      atualizarStatusLabel("em_aberto");
    }
    S.initTabsModal(modal);
  }

  async function salvar() {
    const id = el("regId").value;
    const url = id ? `${API}/${id}` : API;
    const method = id ? "PUT" : "POST";
    try {
      const j = await S.apiJson(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadForm()),
      });
      if (j.item) {
        await enviarAnexosPendentes(j.item.id);
      }
      await carregarLista();
      S.atualizarPainel(j.painel);
      modal.classList.remove("open");
      itemAtual = null;
      limparAnexosPendentes();
      S.toast("Salvo com sucesso.");
    } catch (e) {
      S.mostrarErro(erro, e.message);
    }
  }

  async function excluir() {
    const id = el("regId").value;
    if (!id || !confirm("Excluir este lançamento?")) return;
    try {
      await S.apiJson(`${API}/${id}`, { method: "DELETE" });
      modal.classList.remove("open");
      await carregarLista();
      S.toast("Excluído.");
    } catch (e) {
      S.mostrarErro(erro, e.message);
    }
  }

  function fmtMoeda(n) {
    return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function calcValorPagoLinha(ln) {
    const orig = S.parseMoedaBr(ln.valor_original, 0);
    const juros = S.parseMoedaBr(ln.juros, 0);
    const desconto = S.parseMoedaBr(ln.desconto, 0);
    const multa = S.parseMoedaBr(ln.multa, 0);
    const tarifa = S.parseMoedaBr(ln.tarifa, 0);
    if (ln._valor_pago_manual) {
      return S.parseMoedaBr(ln.valor_pago, 0);
    }
    return Math.max(0, orig + juros + multa + tarifa - desconto);
  }

  function linhaFromItem(item) {
    const vp = calcValorPagoLinha({
      valor_original: item.valor,
      juros: 0,
      desconto: 0,
      multa: 0,
      tarifa: 0,
    });
    return {
      id: item.id,
      fornecedor: item.fornecedor || "—",
      numero_documento: item.numero_documento || "—",
      vencimento: S.isoDate(item.vencimento) || "",
      vencimento_fmt: item.vencimento_fmt || item.vencimento || "—",
      valor_original: item.valor,
      valor_original_fmt: item.valor_fmt,
      conta_financeira_id: item.conta_financeira_id || "",
      conta_nome: item.conta_nome || "—",
      categoria_id: item.categoria_id || "",
      categoria: item.categoria || "",
      categoria_label: item.categoria_label || item.categoria || "",
      juros: "0",
      desconto: "0",
      multa: "0",
      tarifa: "0",
      valor_pago: String(vp),
      _valor_pago_manual: false,
    };
  }

  function mostrarErroBaixa(msg) {
    S.mostrarErro(el("baixaErro"), msg);
  }

  async function carregarCategoriasFin() {
    categoriasFin = await S.carregarCategorias(naturezaFin);
    S.preencherSelectCategorias(el("f_categoria_id"), categoriasFin, "");
    S.preencherSelectCategorias(el("bx_categoria_global"), categoriasFin, "");
  }

  function labelCatPorId(id) {
    if (!id || !categoriasFin?.flat) return "—";
    const found = categoriasFin.flat.find((c) => String(c.id) === String(id));
    return found?.label || "—";
  }

  function htmlSelectCatLinha(selectedId, idx) {
    const id = String(selectedId || "");
    let html = `<select class="bx-cat-linha fin-select-compact" data-idx="${idx}"><option value="">—</option>`;
    (categoriasFin?.grupos || []).forEach((g) => {
      html += `<optgroup label="${String(g.descricao).replace(/"/g, "&quot;")}">`;
      html += `<option value="${g.id}"${id === String(g.id) ? " selected" : ""}>${String(g.descricao).replace(/</g, "&lt;")} (Principal)</option>`;
      (g.subcategorias || []).forEach((s) => {
        html += `<option value="${s.id}"${id === String(s.id) ? " selected" : ""}>↳ ${String(s.descricao).replace(/</g, "&lt;")}</option>`;
      });
      html += "</optgroup>";
    });
    html += "</select>";
    return html;
  }

  function atualizarTotaisBaixa() {
    let total = 0;
    baixaLinhas.forEach((ln) => {
      ln.valor_pago = String(calcValorPagoLinha(ln));
      total += S.parseMoedaBr(ln.valor_pago, 0);
    });
    const totalFmt = fmtMoeda(total);
    if (el("bx_valor_total")) el("bx_valor_total").value = totalFmt;
    if (el("bx_total_footer")) el("bx_total_footer").textContent = totalFmt;
    if (el("baixaResumoQtd")) {
      el("baixaResumoQtd").textContent = `${baixaLinhas.length} lançamento(s) selecionado(s)`;
    }
  }

  function renderTabelaBaixa() {
    const tb = el("tbodyBaixa");
    if (!tb) return;
    const catUnica = el("bx_cat_unica")?.checked;
    const catGlobalId = el("bx_categoria_global")?.value || "";
    const catGlobalLabel = labelCatPorId(catGlobalId);
    tb.innerHTML = baixaLinhas
      .map((ln, idx) => {
        return `<tr data-idx="${idx}">
          <td class="fin-cell-parte"><b>${ln.fornecedor}</b></td>
          <td>${ln.numero_documento}</td>
          <td>${ln.vencimento_fmt || ln.vencimento || "—"}</td>
          <td class="fin-valor">${ln.valor_original_fmt || fmtMoeda(ln.valor_original)}</td>
          <td>${
            catUnica
              ? `<span class="muted">${catGlobalLabel}</span>`
              : htmlSelectCatLinha(ln.categoria_id, idx)
          }</td>
          <td><input type="text" inputmode="decimal" class="bx-money" data-field="juros" value="${ln.juros}"></td>
          <td><input type="text" inputmode="decimal" class="bx-money" data-field="desconto" value="${ln.desconto}"></td>
          <td><input type="text" inputmode="decimal" class="bx-money" data-field="multa" value="${ln.multa}"></td>
          <td><input type="text" inputmode="decimal" class="bx-money" data-field="tarifa" value="${ln.tarifa}"></td>
          <td class="fin-cell-valor-pago"><input type="text" inputmode="decimal" class="bx-money bx-valor-pago" data-field="valor_pago" value="${S.formatMoedaInput(ln.valor_pago)}"></td>
        </tr>`;
      })
      .join("");

    tb.querySelectorAll(".bx-money").forEach((inp) => {
      inp.addEventListener("input", () => {
        const tr = inp.closest("tr");
        const i = parseInt(tr?.dataset.idx, 10);
        if (Number.isNaN(i) || !baixaLinhas[i]) return;
        const field = inp.dataset.field;
        baixaLinhas[i][field] = inp.value;
        if (field === "valor_pago") {
          baixaLinhas[i]._valor_pago_manual = true;
        } else {
          baixaLinhas[i]._valor_pago_manual = false;
          const vp = calcValorPagoLinha(baixaLinhas[i]);
          baixaLinhas[i].valor_pago = String(vp);
          const vpInp = tr.querySelector(".bx-valor-pago");
          if (vpInp && field !== "valor_pago") vpInp.value = S.formatMoedaInput(vp);
        }
        atualizarTotaisBaixa();
      });
    });
    tb.querySelectorAll(".bx-cat-linha").forEach((inp) => {
      inp.addEventListener("change", () => {
        const i = parseInt(inp.dataset.idx, 10);
        if (!Number.isNaN(i) && baixaLinhas[i]) baixaLinhas[i].categoria_id = inp.value;
      });
    });
    atualizarTotaisBaixa();
  }

  function abrirModalBaixa(ids) {
    if (!modalBaixa || !isPagar) return;
    const unicos = [...new Set((ids || []).filter(Boolean))];
    if (!unicos.length) return S.toast("Selecione lançamentos em aberto.");
    const selecionados = unicos
      .map((id) => itens.find((i) => i.id === id))
      .filter((i) => i && (i.status === "em_aberto" || i.status === "atrasado"));
    if (!selecionados.length) return S.toast("Nenhum lançamento em aberto selecionado.");
    if (selecionados.length < unicos.length) {
      S.toast("Alguns títulos já pagos foram ignorados.");
    }
    baixaLinhas = selecionados.map(linhaFromItem);
    mostrarErroBaixa("");
    S.preencherSelectContas(el("bx_conta_global"), contas, selecionados[0]?.conta_financeira_id || "");
    S.preencherSelectCategorias(el("bx_categoria_global"), categoriasFin, selecionados[0]?.categoria_id || "");
    if (el("bx_data_global")) el("bx_data_global").value = S.hojeISO();
    if (el("bx_historico_global")) {
      el("bx_historico_global").value =
        selecionados.length === 1
          ? selecionados[0].descricao || selecionados[0].fornecedor || ""
          : `Baixa de ${selecionados.length} títulos a pagar`;
    }
    if (el("bx_agrupado")) el("bx_agrupado").checked = false;
    if (el("bx_cat_unica")) el("bx_cat_unica").checked = true;
    if (el("bx_usar_venc")) el("bx_usar_venc").checked = false;
    renderTabelaBaixa();
    modalBaixa.classList.add("open");
    modalBaixa.setAttribute("aria-hidden", "false");
  }

  function fecharModalBaixa() {
    if (!modalBaixa) return;
    modalBaixa.classList.remove("open");
    modalBaixa.setAttribute("aria-hidden", "true");
    baixaLinhas = [];
    mostrarErroBaixa("");
  }

  async function confirmarBaixaModal() {
    if (!isPagar || !baixaLinhas.length) return;
    const conta = el("bx_conta_global")?.value;
    if (!conta) return mostrarErroBaixa("Selecione a conta financeira de destino.");
    const usarVenc = el("bx_usar_venc")?.checked;
    const dataGlobal = el("bx_data_global")?.value;
    if (!usarVenc && !dataGlobal) return mostrarErroBaixa("Informe a data do pagamento.");
    const catUnica = el("bx_cat_unica")?.checked;
    const catGlobalId = el("bx_categoria_global")?.value || "";
    const historico = el("bx_historico_global")?.value?.trim() || "";
    const agrupado = el("bx_agrupado")?.checked;

    const itensPayload = baixaLinhas.map((ln) => {
      const vp = calcValorPagoLinha(ln);
      if (vp < 0) throw new Error("Valor pago não pode ser negativo");
      return {
        id: ln.id,
        juros: S.parseMoedaBr(ln.juros, 0),
        desconto: S.parseMoedaBr(ln.desconto, 0),
        multa: S.parseMoedaBr(ln.multa, 0),
        tarifa: S.parseMoedaBr(ln.tarifa, 0),
        valor_pago: vp,
        categoria_id: catUnica ? catGlobalId : ln.categoria_id,
        data_pagamento: usarVenc ? ln.vencimento : dataGlobal,
        conta_financeira_id: conta,
      };
    });

    for (const it of itensPayload) {
      if (!it.data_pagamento) return mostrarErroBaixa("Data de pagamento obrigatória em todos os títulos.");
      if (it.valor_pago < 0) return mostrarErroBaixa("Valor pago não pode ser negativo.");
    }

    const btn = el("btnConfirmarBaixaModal");
    if (btn) btn.disabled = true;
    try {
      const payload = {
        itens: itensPayload,
        conta_financeira_id: conta,
        data_pagamento: dataGlobal,
        categoria_id: catGlobalId,
        historico,
        agrupado,
        categoria_unica: catUnica,
        usar_data_vencimento: usarVenc,
      };
      const j = await S.apiJson(API_LOTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      fecharModalBaixa();
      await carregarLista();
      if (j.kpis) S.atualizarKpis(j.kpis);
      const nOk = (j.baixados || []).length;
      const nErr = (j.erros || []).length;
      if (nErr) {
        S.toast(`${nOk} baixado(s), ${nErr} erro(s). ${(j.erros[0] || {}).erro || ""}`);
      } else {
        S.toast(j.mensagem || `${nOk} pagamento(s) baixado(s) com sucesso.`);
      }
    } catch (e) {
      mostrarErroBaixa(e.message || "Erro ao baixar pagamentos.");
      S.toast(e.message || "Erro ao baixar");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function initModalBaixa() {
    if (!isPagar || !modalBaixa) return;
    el("btnFecharBaixa")?.addEventListener("click", fecharModalBaixa);
    el("btnCancelarBaixa")?.addEventListener("click", fecharModalBaixa);
    el("btnConfirmarBaixaModal")?.addEventListener("click", confirmarBaixaModal);
    el("bx_cat_unica")?.addEventListener("change", renderTabelaBaixa);
    el("bx_categoria_global")?.addEventListener("change", () => {
      if (el("bx_cat_unica")?.checked) renderTabelaBaixa();
    });
    el("bx_usar_venc")?.addEventListener("change", () => {
      const on = el("bx_usar_venc")?.checked;
      const d = el("bx_data_global");
      if (d) {
        d.disabled = !!on;
        d.title = on ? "Será usada a data de vencimento de cada título" : "";
      }
    });
    modalBaixa.addEventListener("click", (e) => {
      if (e.target === modalBaixa) fecharModalBaixa();
    });
  }

  async function confirmarBaixa() {
    const id = el("regId").value;
    if (!id) {
      S.mostrarErro(erro, "Salve o lançamento antes de dar baixa.");
      return;
    }
    const conta = el("bx_conta_financeira_id").value;
    if (!conta) {
      S.mostrarErro(erro, "Selecione a conta financeira na baixa.");
      return;
    }
    const payload = {
      conta_financeira_id: conta,
      valor: el("bx_valor").value,
    };
    if (isPagar) payload.data_pagamento = el("bx_data").value;
    else payload.data_recebimento = el("bx_data").value;
    const catId = el("f_categoria_id")?.value;
    if (catId) payload.categoria_id = catId;
    try {
      await S.apiJson(`${API}/${id}/baixa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await carregarLista();
      const det = await S.apiJson(`${API}/${id}`);
      preencherForm(det.item);
      S.mostrarErro(erro, "");
      S.toast(isPagar ? "Pagamento registrado." : "Recebimento registrado.");
    } catch (e) {
      S.mostrarErro(erro, e.message);
    }
  }

  function idsSelecionados() {
    return [...document.querySelectorAll(".chk-row:checked")].map((c) => c.value);
  }

  async function carregarContatosOpcoes() {
    const papel = isPagar ? "fornecedor" : "cliente";
    try {
      const j = await S.apiJson(`/api/cadastros/contatos/opcoes?papel=${papel}`);
      const dl = document.getElementById("dlContatosCadastro");
      if (!dl) return;
      dl.innerHTML = (j.itens || []).map((c) => `<option value="${String(c.nome).replace(/"/g, "&quot;")}">`).join("");
    } catch (_) {}
  }

  el("btnIncluir")?.addEventListener("click", () => abrir(null));
  el("btnNovo")?.addEventListener("click", () => abrir(null));
  el("btnFechar")?.addEventListener("click", () => modal.classList.remove("open"));
  el("btnSalvar")?.addEventListener("click", salvar);
  el("btnExcluir")?.addEventListener("click", excluir);
  el("btnConfirmarBaixa")?.addEventListener("click", confirmarBaixa);
  el("btnFiltrar")?.addEventListener("click", () => carregarLista().catch((e) => S.toast(e.message)));
  el("btnLimparFiltros")?.addEventListener("click", () => {
    ["ff_categoria", "ff_tipo", "ff_forma", "ff_valor_min", "ff_valor_max", "ff_numero_doc", "topBusca"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    document.querySelectorAll("#filtroSituacao .fin-pill").forEach((p) => {
      p.classList.toggle("active", (p.dataset.sit ?? "") === "");
    });
    const def = S.calcPeriodo("este_mes");
    S.aplicarPeriodoUI(def);
    S.storageSet(`fin_${tipo}_periodo`, def);
    sessionStorage.removeItem(STORAGE_KEY);
    carregarLista().catch((err) => S.toast(err.message));
  });
  el("topBusca")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") carregarLista().catch((e) => S.toast(e.message));
  });
  let buscaTm;
  el("topBusca")?.addEventListener("input", () => {
    clearTimeout(buscaTm);
    buscaTm = setTimeout(() => carregarLista().catch(() => {}), 450);
  });
  el("btnBaixarSel")?.addEventListener("click", () => {
    const ids = idsSelecionados();
    if (!ids.length) return S.toast("Selecione lançamentos em aberto.");
    if (isPagar) {
      abrirModalBaixa(ids);
      return;
    }
    if (ids.length === 1) {
      abrirDetalhe(ids[0], true);
      return;
    }
    S.toast("Para vários títulos, selecione um por vez ou use baixa em lote no detalhe.");
  });
  el("chkTodos")?.addEventListener("change", (ev) => {
    document.querySelectorAll(".chk-row:not(:disabled)").forEach((c) => {
      c.checked = ev.target.checked;
    });
  });

  el("formAnexo")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const arquivo = el("anexoArquivo")?.files?.[0];
    if (!arquivo?.size) return S.mostrarErro(erro, "Selecione um arquivo.");
    adicionarAnexoPendente(arquivo);
  });

  el("anexoArquivo")?.addEventListener("change", (ev) => {
    const arquivo = ev.target.files?.[0];
    if (!arquivo?.size) return;
    adicionarAnexoPendente(arquivo);
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });

  configurarLabels();
  initPills();
  initModalBaixa();
  bindTabelaLinhas();
  bindAnexosTabela();
  S.bindToolStubs();
  restaurarFiltros();
  S.initFiltroPeriodo({
    storageKey: `fin_${tipo}_periodo`,
    defaultPreset: "este_mes",
    onApply: () => carregarLista().catch((e) => S.toast(e.message)),
  });
  if (!el("topDataIni")?.value) {
    S.aplicarPeriodoUI(S.calcPeriodo("este_mes"));
  }
  carregarContatosOpcoes();
  carregarCategoriasFin().catch(() => {});
  carregarLista().catch((e) => S.toast(e.message));
})();
