(function () {
  const API = "/api/financeiro/movimentacoes";
  const S = window.FinShared;
  const STORAGE_KEY = "fin_caixa_filtros";
  let itens = [];
  let contas = [];
  let abaAtual = "movimentacoes";
  let catDespesa = null;
  let catReceita = null;
  let itemAtual = null;
  let anexosPendentes = [];
  let contatosOpcoes = [];
  const tbody = document.getElementById("tbodyMov");
  const modal = document.getElementById("modalMov");
  const erro = document.getElementById("movErro");

  function el(id) {
    return document.getElementById(id);
  }

  function salvarFiltros() {
    S.storageSet(STORAGE_KEY, {
      conta: el("topContaCaixa")?.value || "",
      busca: el("topBuscaCaixa")?.value || "",
      data_ini: el("topDataIni")?.value || "",
      data_fim: el("topDataFim")?.value || "",
      periodo_label: el("lblPeriodo")?.textContent || "",
      aba: abaAtual,
    });
  }

  function restaurarFiltros() {
    const s = S.storageGet(STORAGE_KEY);
    if (!s || !Object.keys(s).length) return;
    if (el("topBuscaCaixa") && s.busca != null) el("topBuscaCaixa").value = s.busca;
    if (s.aba) {
      abaAtual = s.aba;
      document.querySelectorAll("#abasCaixa button").forEach((b) => {
        b.classList.toggle("active", b.dataset.aba === abaAtual);
      });
    }
    if (s.data_ini && s.data_fim) {
      S.aplicarPeriodoUI({
        data_ini: s.data_ini,
        data_fim: s.data_fim,
        label: s.periodo_label || "Período",
      });
    }
    if (s.conta && el("topContaCaixa")) el("topContaCaixa").value = s.conta;
  }

  function atualizarLabelConta() {
    const sel = el("topContaCaixa");
    const lbl = el("lblContaAtiva");
    if (!sel || !lbl) return;
    const opt = sel.selectedOptions?.[0];
    lbl.textContent = opt && opt.value ? opt.textContent.split(" (")[0] : "Selecione uma conta financeira";
  }

  function obterContaId() {
    const v = el("topContaCaixa")?.value;
    if (v) return v;
    return S.storageGet(STORAGE_KEY)?.conta || "";
  }

  function montarQuery(contaOverride) {
    const q = new URLSearchParams();
    q.set("aba", abaAtual);
    const conta = contaOverride ?? obterContaId();
    if (conta) q.set("conta_financeira_id", conta);
    const di = el("topDataIni")?.value;
    const df = el("topDataFim")?.value;
    if (di) q.set("data_ini", di);
    if (df) q.set("data_fim", df);
    const busca = el("topBuscaCaixa")?.value?.trim();
    if (busca) q.set("busca", busca);
    return `${API}?${q}`;
  }

  function enriquecerPainelComConta(painel, contaId) {
    if (!painel || !contaId) return painel;
    const conta = contas.find((c) => String(c.id) === String(contaId));
    if (!conta) return painel;
    const p = { ...painel, conta_id: contaId };
    p.saldo_atual = conta.saldo_atual;
    p.saldo_atual_fmt = conta.saldo_atual_fmt;
    p.saldo_inicial = conta.saldo_inicial;
    p.saldo_inicial_fmt = conta.saldo_inicial_fmt;
    const temPeriodo = !!(el("topDataIni")?.value || el("topDataFim")?.value);
    if (String(painel.conta_id || "") === String(contaId) && painel.saldo_final_fmt) {
      p.saldo_final = painel.saldo_final;
      p.saldo_final_fmt = painel.saldo_final_fmt;
    } else if (temPeriodo) {
      const ent = Number(painel.entradas) || 0;
      const sai = Number(painel.saidas) || 0;
      p.saldo_final = (conta.saldo_inicial || 0) + ent - sai;
      p.saldo_final_fmt = painel.saldo_final_fmt || conta.saldo_atual_fmt;
    } else {
      p.saldo_final = conta.saldo_atual;
      p.saldo_final_fmt = conta.saldo_atual_fmt;
    }
    return p;
  }

  function atualizarPainelCaixa(p) {
    if (!p) return;
    const map = {
      painelQtdMov: "quantidade",
      painelSaldoAtual: "saldo_atual_fmt",
      painelSaldoIni: "saldo_inicial_fmt",
      painelEntradas: "entradas_fmt",
      painelSaidas: "saidas_fmt",
      painelSaldoFinal: "saldo_final_fmt",
    };
    Object.entries(map).forEach(([id, key]) => {
      const node = el(id);
      if (node) node.textContent = p[key] ?? (key === "quantidade" ? 0 : "—");
    });
  }

  function clipAnexo(item) {
    if (!item?.tem_anexos) return "";
    return '<span class="fin-clip" title="Possui anexos" aria-label="Possui anexos"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z"/></svg></span>';
  }

  function renderMov() {
    const msgConc = el("msgConciliacao");
    const wrap = document.querySelector(".fin-table-wrap");
    if (abaAtual === "conciliacao") {
      if (wrap) wrap.style.display = "none";
      if (msgConc) msgConc.style.display = "block";
      if (tbody) tbody.innerHTML = "";
      return;
    }
    if (wrap) wrap.style.display = "";
    if (msgConc) msgConc.style.display = "none";
    if (!tbody) return;
    const conta = el("topContaCaixa")?.value;
    if (!conta) {
      tbody.innerHTML = `<tr><td colspan="7" class="fin-empty">
        <div class="fin-empty-inner">
          <div class="fin-empty-icon">🏦</div>
          <p class="fin-empty-title">Selecione uma conta financeira</p>
          <p class="fin-empty-text">Use o seletor no topo para visualizar movimentações, entradas e saídas.</p>
        </div>
      </td></tr>`;
      return;
    }
    if (!itens.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="fin-empty">
        <div class="fin-empty-inner">
          <div class="fin-empty-icon">📋</div>
          <p class="fin-empty-title">Nenhuma movimentação no período</p>
          <p class="fin-empty-text">Ajuste o filtro de período ou inclua um lançamento manual.</p>
        </div>
      </td></tr>`;
      return;
    }
    tbody.innerHTML = itens
      .map((m) => {
        const cls = m.tipo === "entrada" ? "fin-tipo-entrada" : "fin-tipo-saida";
        const sinal = m.tipo === "entrada" ? "+" : "−";
        const origemLbl = S.labelOrigemMov(m.origem);
        return `<tr class="fin-row-clickable" data-id="${m.id}" tabindex="0" role="button" aria-label="Abrir lançamento">
          <td class="fin-col-chk"><input type="checkbox" class="chk-mov" value="${m.id}"></td>
          <td>${m.data_movimento_fmt || "-"}</td>
          <td>${S.labelCategoria(m)}</td>
          <td>${m.historico || m.descricao || "-"}</td>
          <td>${m.parte_nome || "-"}</td>
          <td class="fin-valor ${cls}"><span class="fin-valor-inner">${sinal} ${m.valor_fmt}${clipAnexo(m)}</span></td>
          <td><button type="button" class="fin-btn-table btn-mov-abrir" data-id="${m.id}">${m.editavel ? "Editar" : "Ver"}</button></td>
        </tr>`;
      })
      .join("");
    bindLinhasMov();
  }

  function bindLinhasMov() {
    if (!tbody || tbody.dataset.movBound) return;
    tbody.dataset.movBound = "1";
    tbody.addEventListener("click", (e) => {
      if (e.target.closest(".chk-mov") || e.target.closest(".fin-col-chk")) return;
      const btn = e.target.closest(".btn-mov-abrir");
      const row = e.target.closest("tr[data-id]");
      const id = btn?.dataset.id || row?.dataset.id;
      if (id) abrirMovimentacao(id).catch((err) => S.toast(err.message));
    });
    tbody.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const row = e.target.closest("tr[data-id]");
      if (!row || e.target.closest(".chk-mov")) return;
      e.preventDefault();
      abrirMovimentacao(row.dataset.id).catch((err) => S.toast(err.message));
    });
  }

  async function ensureCategoriasCaixa() {
    if (!catDespesa) catDespesa = await S.carregarCategorias("Despesa");
    if (!catReceita) catReceita = await S.carregarCategorias("Receita");
  }

  function categoriasPorTipo(tipo) {
    return tipo === "entrada" ? catReceita : catDespesa;
  }

  function preencherCategoriaMov(tipo, valorId) {
    S.preencherSelectCategorias(el("m_categoria_id"), categoriasPorTipo(tipo), valorId || "");
  }

  function preencherContas(sel, valor) {
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione a conta financeira</option>';
    contas.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = `${c.nome}${c.saldo_atual_fmt ? " (" + c.saldo_atual_fmt + ")" : ""}`;
      if (String(c.id) === String(valor)) o.selected = true;
      sel.appendChild(o);
    });
    S.preencherSelectContas(el("m_conta"), contas, valor || "");
    atualizarLabelConta();
  }

  async function carregarContatosOpcoes() {
    if (contatosOpcoes.length) return;
    try {
      const j = await S.apiJson("/api/cadastros/contatos/opcoes");
      contatosOpcoes = j.itens || [];
      const dl = el("dlContatosCaixa");
      if (dl) {
        dl.innerHTML = contatosOpcoes
          .map((c) => `<option value="${String(c.nome).replace(/"/g, "&quot;")}">`)
          .join("");
      }
    } catch (_) {}
  }

  function resolverPartePayload() {
    const nome = el("m_parte")?.value?.trim() || "";
    const match = contatosOpcoes.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
    if (match) return { cliente_fornecedor_id: match.id, cliente_fornecedor_nome: "" };
    return { cliente_fornecedor_id: "", cliente_fornecedor_nome: nome };
  }

  function limparAnexosPendentes() {
    anexosPendentes = [];
    if (el("anexoMovArquivo")) el("anexoMovArquivo").value = "";
    if (el("anexoMovNome")) el("anexoMovNome").value = "";
    if (el("anexoMovTipo")) el("anexoMovTipo").value = "";
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
    const tb = el("tbodyAnexosMov");
    if (!tb) return;
    const anexos = anexosParaExibir(salvos);
    if (!anexos.length) {
      tb.innerHTML = '<tr><td colspan="4" class="muted">Sem anexos.</td></tr>';
      return;
    }
    tb.innerHTML = anexos
      .map((a) => {
        const nome = String(a.nome_arquivo || "arquivo").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        const nomeCell = a.pendente
          ? `<span class="fin-anexo-link fin-anexo-pendente">${nome}</span> <span class="fin-anexo-badge">novo</span>`
          : `<a href="${a.url_download || "#"}" class="fin-anexo-link" target="_blank" rel="noopener">${nome}</a>`;
        const btn = a.pendente
          ? `<button type="button" class="fin-btn-table btn-del-pending-mov" data-idx="${a.pendingIdx}">Remover</button>`
          : `<button type="button" class="fin-btn-table fin-btn-table-danger btn-del-anexo-mov" data-id="${a.id}">Excluir</button>`;
        return `<tr>
        <td>${nomeCell}</td>
        <td>${a.tipo || "-"}</td>
        <td>${a.created_at_fmt || "-"}</td>
        <td class="fin-acoes-anexo">${btn}</td></tr>`;
      })
      .join("");
  }

  function bindAnexosMov() {
    const tb = el("tbodyAnexosMov");
    if (!tb || tb.dataset.anexosBound) return;
    tb.dataset.anexosBound = "1";
    tb.addEventListener("click", async (e) => {
      const btnPending = e.target.closest(".btn-del-pending-mov");
      if (btnPending) {
        e.preventDefault();
        const idx = parseInt(btnPending.dataset.idx, 10);
        if (!Number.isNaN(idx)) {
          anexosPendentes.splice(idx, 1);
          renderAnexosLista(itemAtual?.anexos || []);
        }
        return;
      }
      const btn = e.target.closest(".btn-del-anexo-mov");
      if (!btn) return;
      e.preventDefault();
      if (!confirm("Excluir este anexo?")) return;
      try {
        const r = await fetch(`/api/financeiro/anexos/${btn.dataset.id}`, { method: "DELETE" });
        const j = await r.json();
        if (!j.ok) throw new Error(j.erro || "Erro ao excluir");
        if (itemAtual) itemAtual.anexos = j.anexos || [];
        renderAnexosLista(j.anexos || []);
        await carregar();
        S.toast("Anexo excluído.");
      } catch (err) {
        S.toast(err.message || "Erro ao excluir anexo");
      }
    });
  }

  function adicionarAnexoPendente(file) {
    if (!file || !file.size) return;
    anexosPendentes.push({
      file,
      nome: el("anexoMovNome")?.value?.trim() || file.name,
      tipo: el("anexoMovTipo")?.value?.trim() || "Outros",
    });
    if (el("anexoMovNome")) el("anexoMovNome").value = "";
    if (el("anexoMovTipo")) el("anexoMovTipo").value = "";
    if (el("anexoMovArquivo")) el("anexoMovArquivo").value = "";
    renderAnexosLista(itemAtual?.anexos || []);
    S.toast("Arquivo adicionado. Clique em Salvar para gravar.");
  }

  async function enviarAnexosPendentes(movId) {
    if (!anexosPendentes.length) return itemAtual?.anexos || [];
    let anexos = itemAtual?.anexos || [];
    for (const p of anexosPendentes) {
      const fd = new FormData();
      fd.append("arquivo", p.file, p.file.name);
      fd.append("nome", p.nome);
      fd.append("tipo", p.tipo);
      const r = await fetch(`${API}/${movId}/anexos`, { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro ao gravar anexo");
      anexos = j.anexos || anexos;
    }
    anexosPendentes = [];
    return anexos;
  }

  function setModoFormulario(editavel) {
    const campos = ["m_categoria_id", "m_data", "m_valor", "m_tipo", "m_competencia", "m_conta", "m_descricao", "m_parte"];
    campos.forEach((id) => {
      const node = el(id);
      if (node) node.disabled = !editavel;
    });
    const formAnexo = el("formAnexoMov");
    if (formAnexo) formAnexo.style.display = editavel ? "" : "none";
    const hint = el("movAnexoHint");
    if (hint) hint.style.display = editavel ? "" : "none";
    const viewHint = el("movViewHint");
    if (viewHint) viewHint.style.display = editavel ? "none" : "block";
    const btnSalvar = el("btnSalvarMov");
    if (btnSalvar) {
      btnSalvar.style.display = editavel ? "" : "none";
      btnSalvar.textContent = el("m_id")?.value ? "Salvar" : "Salvar";
    }
    const btnFechar = el("btnFecharMov");
    if (btnFechar) btnFechar.textContent = editavel ? "Cancelar" : "Fechar";
  }

  function preencherFormMov(item) {
    el("m_id").value = item?.id || "";
    el("m_contato_id").value = item?.cliente_fornecedor_id || "";
    el("m_data").value = item?.data_movimento || S.hojeISO();
    el("m_competencia").value = item?.competencia || "";
    el("m_valor").value = item?.valor ?? "";
    el("m_descricao").value = item?.descricao && item.descricao !== "-" ? item.descricao : item?.historico || "";
    el("m_tipo").value = item?.tipo || "entrada";
    el("m_parte").value =
      item?.parte_nome && item.parte_nome !== "-" ? item.parte_nome : item?.cliente_fornecedor_nome || "";
    preencherCategoriaMov(item?.tipo || "entrada", item?.categoria_id || "");
    S.preencherSelectContas(el("m_conta"), contas, item?.conta_financeira_id || obterContaId());
  }

  function resetModalTabs() {
    modal?.querySelector('[data-fin-tab="geral"]')?.click();
  }

  async function abrirNovo() {
    const conta = el("topContaCaixa")?.value;
    if (!conta) {
      S.toast("Selecione uma conta financeira no topo.");
      return;
    }
    await ensureCategoriasCaixa();
    await carregarContatosOpcoes();
    itemAtual = null;
    limparAnexosPendentes();
    modal.classList.add("open");
    S.mostrarErro(erro, "");
    resetModalTabs();
    el("modalMovTitulo").textContent = "Incluir lançamento manual";
    el("modalMovNavTitulo").textContent = "Novo lançamento";
    preencherFormMov(null);
    el("m_data").value = S.hojeISO();
    el("m_tipo").value = "entrada";
    preencherCategoriaMov("entrada", "");
    S.preencherSelectContas(el("m_conta"), contas, conta);
    setModoFormulario(true);
    renderAnexosLista([]);
  }

  async function abrirMovimentacao(id) {
    await ensureCategoriasCaixa();
    await carregarContatosOpcoes();
    const j = await S.apiJson(`${API}/${id}`);
    itemAtual = j.item;
    contas = j.contas || contas;
    limparAnexosPendentes();
    modal.classList.add("open");
    S.mostrarErro(erro, "");
    resetModalTabs();
    const editavel = !!itemAtual?.editavel;
    const origem = S.labelOrigemMov(itemAtual?.origem);
    el("modalMovTitulo").textContent = editavel
      ? "Editar lançamento manual"
      : `Lançamento — ${origem}`;
    el("modalMovNavTitulo").textContent = itemAtual?.historico || "Lançamento";
    preencherFormMov(itemAtual);
    setModoFormulario(editavel);
    renderAnexosLista(itemAtual?.anexos || []);
  }

  function payloadFormMov() {
    const parte = resolverPartePayload();
    return {
      conta_financeira_id: el("m_conta").value,
      tipo: el("m_tipo").value,
      valor: el("m_valor").value,
      data_movimento: el("m_data").value,
      competencia: el("m_competencia").value,
      descricao: el("m_descricao").value,
      categoria_id: el("m_categoria_id").value,
      cliente_fornecedor_id: parte.cliente_fornecedor_id,
      cliente_fornecedor_nome: parte.cliente_fornecedor_nome,
      aba: abaAtual,
    };
  }

  async function carregar(opts = {}) {
    salvarFiltros();
    const contaQuery = opts.contaId ?? obterContaId();
    const j = await S.apiJson(montarQuery(contaQuery));
    itens = j.itens || [];
    contas = j.contas || [];
    const cv = contaQuery || el("topContaCaixa")?.value || "";
    preencherContas(el("topContaCaixa"), cv);
    if (!el("topContaCaixa")?.value && contas.length === 1) {
      const unica = String(contas[0].id);
      preencherContas(el("topContaCaixa"), unica);
      salvarFiltros();
      if (!opts._retried) {
        return carregar({ contaId: unica, _retried: true });
      }
    }
    const contaAtiva = el("topContaCaixa")?.value || contaQuery;
    if (!opts._retried && contaAtiva && contaAtiva !== contaQuery) {
      return carregar({ contaId: contaAtiva, _retried: true });
    }
    const painel = enriquecerPainelComConta(j.painel, contaAtiva);
    atualizarPainelCaixa(painel);
    renderMov();
  }

  document.querySelectorAll("#abasCaixa button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#abasCaixa button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      abaAtual = btn.dataset.aba || "movimentacoes";
      carregar().catch((e) => S.toast(e.message));
    });
  });

  el("btnIncluirMov")?.addEventListener("click", () => abrirNovo().catch((e) => S.toast(e.message)));

  el("btnFecharMov")?.addEventListener("click", () => {
    modal.classList.remove("open");
    itemAtual = null;
    limparAnexosPendentes();
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("open");
      itemAtual = null;
      limparAnexosPendentes();
    }
  });

  el("btnSalvarMov")?.addEventListener("click", async () => {
    const id = el("m_id")?.value;
    const url = id ? `${API}/${id}` : API;
    const method = id ? "PUT" : "POST";
    try {
      const j = await S.apiJson(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFormMov()),
      });
      const movId = j.item?.id || id;
      if (movId && anexosPendentes.length) {
        await enviarAnexosPendentes(movId);
      }
      modal.classList.remove("open");
      itemAtual = null;
      limparAnexosPendentes();
      await carregar();
      S.toast(id ? "Lançamento atualizado." : "Lançamento registrado.");
    } catch (e) {
      S.mostrarErro(erro, e.message);
    }
  });

  el("formAnexoMov")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const file = el("anexoMovArquivo")?.files?.[0];
    if (!file) return S.toast("Selecione um arquivo.");
    adicionarAnexoPendente(file);
  });

  el("topContaCaixa")?.addEventListener("change", () => {
    atualizarLabelConta();
    carregar().catch((e) => S.toast(e.message));
  });

  let buscaTm;
  el("topBuscaCaixa")?.addEventListener("input", () => {
    clearTimeout(buscaTm);
    buscaTm = setTimeout(() => carregar().catch(() => {}), 450);
  });
  el("topBuscaCaixa")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") carregar().catch((e) => S.toast(e.message));
  });

  el("m_tipo")?.addEventListener("change", async () => {
    await ensureCategoriasCaixa();
    preencherCategoriaMov(el("m_tipo").value, el("m_categoria_id")?.value || "");
  });

  el("m_parte")?.addEventListener("input", () => {
    const nome = el("m_parte")?.value?.trim() || "";
    const match = contatosOpcoes.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
    if (el("m_contato_id")) el("m_contato_id").value = match ? match.id : "";
  });

  S.bindToolStubs();
  bindAnexosMov();
  if (modal && !modal.dataset.tabsInit) {
    modal.dataset.tabsInit = "1";
    S.initTabsModal(modal);
  }
  restaurarFiltros();
  S.initFiltroPeriodo({
    storageKey: "fin_caixa_periodo",
    defaultPreset: "este_mes",
    onApply: () => carregar().catch((e) => S.toast(e.message)),
  });
  if (!el("topDataIni")?.value) {
    S.aplicarPeriodoUI(S.calcPeriodo("este_mes"));
  }
  carregar().catch((e) => S.toast(e.message));
})();
