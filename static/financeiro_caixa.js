(function () {
  const API = "/api/financeiro/movimentacoes";
  const S = window.FinShared;
  const STORAGE_KEY = "fin_caixa_filtros";
  let itens = [];
  let contas = [];
  let abaAtual = "movimentacoes";
  let catDespesa = null;
  let catReceita = null;
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
        return `<tr>
          <td><input type="checkbox" class="chk-mov" value="${m.id}"></td>
          <td>${m.data_movimento_fmt || "-"}</td>
          <td>${S.labelCategoria(m)}</td>
          <td>${m.historico || m.descricao || "-"}</td>
          <td>${m.parte_nome || "-"}</td>
          <td class="fin-valor ${cls}">${sinal} ${m.valor_fmt}</td>
          <td><button type="button" class="fin-btn-table btn-mov-info" data-origem="${origemLbl}" data-desc="${(m.historico || m.descricao || "").replace(/"/g, "&quot;")}">Ver</button></td>
        </tr>`;
      })
      .join("");
    tbody.querySelectorAll(".btn-mov-info").forEach((b) => {
      b.addEventListener("click", () => {
        S.toast(`${b.dataset.origem}: ${b.dataset.desc || "—"}`);
      });
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

  el("btnIncluirMov")?.addEventListener("click", async () => {
    const conta = el("topContaCaixa")?.value;
    if (!conta) {
      S.toast("Selecione uma conta financeira no topo.");
      return;
    }
    modal.classList.add("open");
    S.mostrarErro(erro, "");
    el("m_data").value = S.hojeISO();
    el("m_valor").value = "";
    el("m_descricao").value = "";
    el("m_tipo").value = "entrada";
    await ensureCategoriasCaixa();
    preencherCategoriaMov("entrada", "");
    S.preencherSelectContas(el("m_conta"), contas, conta);
  });

  el("btnFecharMov")?.addEventListener("click", () => modal.classList.remove("open"));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });

  el("btnSalvarMov")?.addEventListener("click", async () => {
    try {
      await S.apiJson(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conta_financeira_id: el("m_conta").value,
          tipo: el("m_tipo").value,
          valor: el("m_valor").value,
          data_movimento: el("m_data").value,
          descricao: el("m_descricao").value,
          categoria_id: el("m_categoria_id").value,
          aba: abaAtual,
        }),
      });
      modal.classList.remove("open");
      await carregar();
      S.toast("Lançamento registrado.");
    } catch (e) {
      S.mostrarErro(erro, e.message);
    }
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
    preencherCategoriaMov(el("m_tipo").value, "");
  });

  S.bindToolStubs();
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
