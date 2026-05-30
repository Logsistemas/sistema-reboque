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
  const modal = document.getElementById("modalFin");
  const tbody = document.getElementById("tbodyLista");
  const erro = document.getElementById("finErro");

  function el(id) {
    return document.getElementById(id);
  }

  function situacaoAtiva() {
    return document.querySelector(".fin-pill.active")?.dataset.sit ?? "";
  }

  function initPills() {
    document.querySelectorAll(".fin-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".fin-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
      });
    });
  }

  function emptyRow(msg, hint) {
    return `<tr><td colspan="8" class="fin-empty">
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
    const conta = el("topContaFin")?.value;
    const busca = el("topBusca")?.value?.trim();
    const di = el("topDataIni")?.value;
    const df = el("topDataFim")?.value;
    if (cat) q.set("categoria", cat);
    if (tp) q.set(isPagar ? "tipo_pagamento" : "tipo_recebimento", tp);
    if (fm) q.set(isPagar ? "forma_pagamento" : "forma_recebimento", fm);
    if (vmin) q.set("valor_min", vmin);
    if (vmax) q.set("valor_max", vmax);
    if (ndoc) q.set("numero_documento", ndoc);
    if (conta) q.set("conta_financeira_id", conta);
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
        return `<tr data-id="${i.id}">
          <td><input type="checkbox" class="chk-row" value="${i.id}" ${podeBaixar ? "" : "disabled"}></td>
          <td><b>${parte || "-"}</b></td>
          <td>${i.historico || i.descricao || "-"}</td>
          <td>${forma || "-"}</td>
          <td>${i.vencimento_fmt || i.vencimento || "-"}</td>
          <td class="fin-valor">${i.valor_fmt}</td>
          <td>${S.statusBadge(i.status)}</td>
          <td class="fin-acoes">
            <button type="button" class="fin-btn-table btn-edit" data-id="${i.id}">Abrir</button>
            ${podeBaixar ? `<button type="button" class="fin-btn-table fin-btn-table-primary btn-baixa-rapida" data-id="${i.id}">Baixar</button>` : ""}
          </td>
        </tr>`;
      })
      .join("");
    tbody.querySelectorAll(".btn-edit").forEach((b) =>
      b.addEventListener("click", () => abrirDetalhe(b.dataset.id))
    );
    tbody.querySelectorAll(".btn-baixa-rapida").forEach((b) =>
      b.addEventListener("click", () => abrirDetalhe(b.dataset.id, true))
    );
  }

  async function carregarLista() {
    const j = await S.apiJson(montarQuery());
    itens = j.itens || [];
    contas = j.contas || [];
    S.atualizarPainel(j.painel);
    S.preencherSelectContas(el("topContaFin"), contas, el("topContaFin")?.value);
    if (!el("topContaFin")?.options.length || el("topContaFin").options.length === 1) {
      S.preencherSelectContas(el("topContaFin"), contas, "");
    }
    render();
  }

  function payloadForm() {
    const base = {
      descricao: el("f_descricao").value,
      categoria: el("f_categoria").value,
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
    el("f_categoria").value = item?.categoria || "";
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
    renderAnexos(item?.anexos || []);
    renderHistorico(item?.historico || []);
  }

  function renderAnexos(anexos) {
    const tb = el("tbodyAnexos");
    if (!tb) return;
    if (!anexos.length) {
      tb.innerHTML = '<tr><td colspan="4" class="muted">Sem anexos.</td></tr>';
      return;
    }
    tb.innerHTML = anexos
      .map(
        (a) => `<tr>
        <td>${a.nome_arquivo || "-"}</td><td>${a.tipo || "-"}</td><td>${a.created_at_fmt || "-"}</td>
        <td><a href="${a.caminho_arquivo}" target="_blank" rel="noopener">Baixar</a></td></tr>`
      )
      .join("");
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
      renderAnexos([]);
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
      await carregarLista();
      S.atualizarPainel(j.painel);
      if (j.item) {
        el("regId").value = j.item.id;
        el("btnExcluir").style.display = "inline-block";
        const det = await S.apiJson(`${API}/${j.item.id}`);
        preencherForm(det.item);
        S.toast("Salvo com sucesso.");
      }
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
  el("btnFiltrar")?.addEventListener("click", carregarLista);
  el("btnLimparFiltros")?.addEventListener("click", () => {
    ["ff_categoria", "ff_tipo", "ff_forma", "ff_valor_min", "ff_valor_max", "ff_numero_doc", "topBusca"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    if (el("topContaFin")) el("topContaFin").value = "";
    if (el("topDataIni")) el("topDataIni").value = "";
    if (el("topDataFim")) el("topDataFim").value = "";
    document.querySelectorAll(".fin-pill").forEach((p) => {
      p.classList.toggle("active", p.dataset.sit === "");
    });
    carregarLista();
  });
  el("btnBaixarSel")?.addEventListener("click", async () => {
    const ids = idsSelecionados();
    if (!ids.length) return S.toast("Selecione lançamentos em aberto.");
    if (!contas.length) await carregarLista();
    const opts = contas.map((c, i) => `${i + 1}: ${c.nome}`).join("\n");
    const pick = prompt(`Conta financeira (número):\n${opts}`);
    if (!pick) return;
    const idx = parseInt(pick, 10) - 1;
    const conta = contas[idx];
    if (!conta) return S.toast("Conta inválida.");
    try {
      const payload = { ids, conta_financeira_id: conta.id };
      if (isPagar) payload.data_pagamento = S.hojeISO();
      else payload.data_recebimento = S.hojeISO();
      const j = await S.apiJson(API_LOTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await carregarLista();
      S.toast(`Baixa: ${(j.baixados || []).length} ok, ${(j.erros || []).length} erro(s).`);
    } catch (e) {
      S.toast(e.message);
    }
  });
  el("chkTodos")?.addEventListener("change", (ev) => {
    document.querySelectorAll(".chk-row:not(:disabled)").forEach((c) => {
      c.checked = ev.target.checked;
    });
  });

  el("formAnexo")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const id = el("regId").value;
    if (!id) return S.mostrarErro(erro, "Salve antes de anexar.");
    const fd = new FormData(ev.target);
    const r = await fetch(`${API}/${id}/anexos`, { method: "POST", body: fd });
    const j = await r.json();
    if (!j.ok) return S.mostrarErro(erro, j.erro || "Erro");
    renderAnexos(j.anexos || []);
    ev.target.reset();
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });

  configurarLabels();
  initPills();
  S.bindToolStubs();
  carregarContatosOpcoes();
  carregarLista().catch((e) => S.toast(e.message));
})();
