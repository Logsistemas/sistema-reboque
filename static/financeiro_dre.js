(function () {
  const API = "/api/financeiro/dre/agrupamento";
  const S = window.FinShared;
  const tbody = document.getElementById("tbodyDre");

  function el(id) {
    return document.getElementById(id);
  }

  function montarQuery() {
    const q = new URLSearchParams();
    const di = el("topDataIni")?.value;
    const df = el("topDataFim")?.value;
    if (di) q.set("data_ini", di);
    if (df) q.set("data_fim", df);
    const qs = q.toString();
    return qs ? `${API}?${qs}` : API;
  }

  function atualizarPeriodoLabel() {
    const lbl = el("lblPeriodoDre");
    const pl = el("lblPeriodo");
    if (lbl && pl) lbl.textContent = pl.textContent || "Período";
  }

  function renderDre(data) {
    atualizarPeriodoLabel();
    const grupos = data?.grupos || [];
    const empty = el("dreEmpty");
    if (el("dreReceitaBruta")) {
      el("dreReceitaBruta").textContent = data?.receita_operacional_bruta_fmt || "R$ 0,00";
    }
    if (el("dreQtdReceitas")) el("dreQtdReceitas").textContent = (data?.receitas || []).length;
    if (el("dreQtdDespesas")) el("dreQtdDespesas").textContent = (data?.despesas || []).length;
    if (!tbody) return;
    if (!grupos.length) {
      tbody.innerHTML = "";
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";
    tbody.innerHTML = grupos
      .map((g) => {
        const isRob = g.grupo_dre === "Receita Operacional Bruta" && g.natureza === "Receita";
        const cls = isRob ? " fin-dre-row-highlight" : "";
        const natCls = g.natureza === "Receita" ? "fin-tipo-entrada" : "fin-tipo-saida";
        return `<tr class="${cls.trim()}">
          <td><b>${g.grupo_dre || "—"}</b></td>
          <td class="${natCls}">${g.natureza || "—"}</td>
          <td class="fin-tipo-entrada">${g.entradas_fmt || "—"}</td>
          <td class="fin-tipo-saida">${g.saidas_fmt || "—"}</td>
          <td>${g.saldo_fmt || "—"}</td>
          <td>${g.qtd_movimentos ?? 0}</td>
        </tr>`;
      })
      .join("");
  }

  async function carregar() {
    const j = await S.apiJson(montarQuery());
    renderDre(j);
  }

  S.bindToolStubs();
  S.initFiltroPeriodo({
    storageKey: "fin_dre_periodo",
    defaultPreset: "este_mes",
    onApply: () => carregar().catch((e) => S.toast(e.message)),
  });
  if (!el("topDataIni")?.value) {
    S.aplicarPeriodoUI(S.calcPeriodo("este_mes"));
  }
  carregar().catch((e) => S.toast(e.message));
})();
