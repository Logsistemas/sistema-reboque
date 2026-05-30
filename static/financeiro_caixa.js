(function () {
  const API = "/api/financeiro/movimentacoes";
  const S = window.FinShared;
  let itens = [];
  let contas = [];
  let abaAtual = "movimentacoes";
  const tbody = document.getElementById("tbodyMov");
  const modal = document.getElementById("modalMov");
  const erro = document.getElementById("movErro");

  function el(id) {
    return document.getElementById(id);
  }

  function mesParaRange(ym) {
    if (!ym || ym.length < 7) return { di: "", df: "" };
    const [y, m] = ym.split("-");
    const ultimo = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
    return { di: `${y}-${m}-01`, df: `${y}-${m}-${String(ultimo).padStart(2, "0")}` };
  }

  function montarQuery() {
    const q = new URLSearchParams();
    q.set("aba", abaAtual);
    const conta = el("filtroContaCaixa")?.value || el("topContaCaixa")?.value;
    if (conta) q.set("conta_financeira_id", conta);
    let di = el("filtroDataIni")?.value;
    let df = el("filtroDataFim")?.value;
    const mes = el("topMes")?.value;
    if (mes && !di && !df) {
      const r = mesParaRange(mes);
      di = r.di;
      df = r.df;
    }
    if (di) q.set("data_ini", di);
    if (df) q.set("data_fim", df);
    const busca = el("topBuscaCaixa")?.value?.trim();
    if (busca) q.set("busca", busca);
    return `${API}?${q}`;
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
    if (!itens.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="fin-empty">
        <div class="fin-empty-inner">
          <div class="fin-empty-icon">🏦</div>
          <p class="fin-empty-title">Nenhuma movimentação no período</p>
          <p class="fin-empty-text">Selecione uma conta, defina o período e clique em Aplicar filtros.</p>
        </div>
      </td></tr>`;
      return;
    }
    tbody.innerHTML = itens
      .map((m) => {
        const cls = m.tipo === "entrada" ? "fin-tipo-entrada" : "fin-tipo-saida";
        const sinal = m.tipo === "entrada" ? "+" : "−";
        return `<tr>
          <td><input type="checkbox" class="chk-mov" value="${m.id}"></td>
          <td>${m.data_movimento_fmt || "-"}</td>
          <td>${m.categoria || "-"}</td>
          <td>${m.historico || m.descricao || "-"}</td>
          <td>${m.parte_nome || "-"}</td>
          <td class="fin-valor ${cls}">${sinal} ${m.valor_fmt}</td>
          <td><span class="fin-status em_aberto" style="text-transform:none">${m.origem || "-"}</span></td>
        </tr>`;
      })
      .join("");
  }

  function preencherContas(sel, valor) {
    if (!sel) return;
    sel.innerHTML = '<option value="">Todas as contas financeiras</option>';
    contas.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = `${c.nome} — ${c.saldo_atual_fmt || ""}`;
      if (String(c.id) === String(valor)) o.selected = true;
      sel.appendChild(o);
    });
    S.preencherSelectContas(el("m_conta"), contas, valor || "");
  }

  async function carregar() {
    const j = await S.apiJson(montarQuery());
    itens = j.itens || [];
    contas = j.contas || [];
    atualizarPainelCaixa(j.painel);
    const cv = el("filtroContaCaixa")?.value || "";
    preencherContas(el("filtroContaCaixa"), cv);
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

  el("btnIncluirMov")?.addEventListener("click", () => {
    const conta = el("filtroContaCaixa")?.value;
    if (!conta) {
      S.toast("Selecione uma conta financeira à esquerda.");
      return;
    }
    modal.classList.add("open");
    S.mostrarErro(erro, "");
    el("m_data").value = S.hojeISO();
    el("m_valor").value = "";
    el("m_descricao").value = "";
    el("m_categoria").value = "";
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
          categoria: el("m_categoria").value,
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

  el("btnFiltrarCaixa")?.addEventListener("click", () => carregar().catch((e) => S.toast(e.message)));
  el("btnLimparCaixa")?.addEventListener("click", () => {
    ["filtroDataIni", "filtroDataFim", "topBuscaCaixa", "topMes"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    if (el("filtroContaCaixa")) el("filtroContaCaixa").value = "";
    carregar().catch((e) => S.toast(e.message));
  });
  el("filtroContaCaixa")?.addEventListener("change", () => carregar().catch((e) => S.toast(e.message)));
  el("topMes")?.addEventListener("change", () => carregar().catch((e) => S.toast(e.message)));

  const hoje = new Date();
  if (el("topMes")) el("topMes").value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  S.bindToolStubs();
  carregar().catch((e) => S.toast(e.message));
})();
