/**
 * Baixa de Contas a Receber — parcial/total estilo Bling.
 * Carregado apenas em contas_a_receber.html
 */
(function () {
  const S = window.FinShared;
  let itemBaixa = null;
  let saldoAbertoAtual = 0;
  let valorRecebidoManual = false;
  let categoriasReceita = null;

  const modal = document.getElementById("modalBaixaReceber");

  function el(id) {
    return document.getElementById(id);
  }

  function fmtMoeda(n) {
    return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function parseMoney(id) {
    return S.parseMoedaBr(el(id)?.value, 0);
  }

  function setMoney(id, val) {
    const node = el(id);
    if (node) node.value = S.formatMoedaInput(val);
  }

  function calcValorAjustado(saldo, juros, desconto, multa, tarifa, taxas) {
    return Math.max(0, saldo + juros + multa - desconto - tarifa - taxas);
  }

  function lerAjustes(prefix) {
    const p = prefix || "bxRec";
    return {
      juros: parseMoney(`${p}_juros`),
      desconto: parseMoney(`${p}_desconto`),
      multa: parseMoney(`${p}_multa`),
      tarifa: parseMoney(`${p}_tarifa`),
      taxas: parseMoney(`${p}_taxas`),
    };
  }

  function atualizarCalculo(prefix, opts = {}) {
    const p = prefix || "bxRec";
    const aj = lerAjustes(p);
    const valorAjustado = calcValorAjustado(
      saldoAbertoAtual,
      aj.juros,
      aj.desconto,
      aj.multa,
      aj.tarifa,
      aj.taxas
    );
    if (!valorRecebidoManual || opts.forceValor) {
      setMoney(`${p}_valor_recebido`, valorAjustado);
    }
    const vr = parseMoney(`${p}_valor_recebido`);
    const hint = el(`${p}_calc_hint`) || el("bxRec_calc_hint");
    if (hint) {
      const rest = Math.max(0, valorAjustado - vr);
      hint.textContent =
        rest > 0.009
          ? `Saldo ajustado: ${fmtMoeda(valorAjustado)} — após esta baixa restará ${fmtMoeda(rest)} (baixa parcial).`
          : `Saldo ajustado: ${fmtMoeda(valorAjustado)} — baixa total.`;
    }
    const foot = el("bxRec_total_footer");
    if (foot && (!prefix || prefix === "bxRec")) foot.textContent = fmtMoeda(vr);
    return { valorAjustado, valorRecebido: vr, ...aj };
  }

  function preencherResumo(item, prefix) {
    const p = prefix || "bxRec";
    if (el(`${p}_cliente`)) el(`${p}_cliente`).value = item?.cliente || "—";
    if (el(`${p}_numero_doc`)) el(`${p}_numero_doc`).value = item?.numero_documento || "—";
    if (el(`${p}_vencimento`)) el(`${p}_vencimento`).value = item?.vencimento_fmt || item?.vencimento || "—";
    if (el(`${p}_valor_original`)) el(`${p}_valor_original`).value = item?.valor_fmt || fmtMoeda(item?.valor);
    if (el(`${p}_ja_recebido`)) el(`${p}_ja_recebido`).value = item?.valor_recebido_fmt || fmtMoeda(item?.valor_recebido);
    saldoAbertoAtual = Number(item?.saldo_aberto ?? item?.valor ?? 0);
    if (el(`${p}_saldo_aberto`)) el(`${p}_saldo_aberto`).value = item?.saldo_aberto_fmt || fmtMoeda(saldoAbertoAtual);
  }

  function resetCamposBaixa(item, prefix) {
    const p = prefix || "bxRec";
    valorRecebidoManual = false;
    ["juros", "desconto", "multa", "tarifa", "taxas"].forEach((f) => setMoney(`${p}_${f}`, 0));
    if (el(`${p}_data`)) el(`${p}_data`).value = S.hojeISO();
    if (el(`${p}_historico`)) el(`${p}_historico`).value = item?.descricao || item?.cliente || "";
    S.preencherSelectContas(el(`${p}_conta`), window.__finContas || [], item?.conta_financeira_id);
    S.preencherSelectCategorias(el(`${p}_categoria`), categoriasReceita, item?.categoria_id || "");
    preencherResumo(item, p);
    atualizarCalculo(p, { forceValor: true });
  }

  async function ensureCategorias() {
    if (!categoriasReceita) categoriasReceita = await S.carregarCategorias("Receita");
    return categoriasReceita;
  }

  function montarPayload(prefix) {
    const p = prefix || "bxRec";
    const calc = atualizarCalculo(p);
    return {
      conta_financeira_id: el(`${p}_conta`)?.value,
      categoria_id: el(`${p}_categoria`)?.value || "",
      data_recebimento: el(`${p}_data`)?.value,
      juros: calc.juros,
      desconto: calc.desconto,
      multa: calc.multa,
      tarifa: calc.tarifa,
      taxas_marketplace: calc.taxas,
      valor_recebido: calc.valorRecebido,
      historico: el(`${p}_historico`)?.value?.trim() || "",
    };
  }

  async function executarBaixa(rid, prefix) {
    const p = prefix || "bxRec";
    const payload = montarPayload(p);
    if (!payload.conta_financeira_id) throw new Error("Selecione a conta financeira.");
    if (!payload.data_recebimento) throw new Error("Informe a data do recebimento.");
    if (payload.valor_recebido <= 0) throw new Error("Valor recebido deve ser maior que zero.");
    const j = await S.apiJson(`/api/financeiro/contas-receber/${rid}/baixa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return j;
  }

  async function abrirModal(item) {
    if (!modal || !item) return;
    await ensureCategorias();
    itemBaixa = item;
    if (el("bxRecTitulo")) el("bxRecTitulo").textContent = item.cliente || "Recebimento";
    if (el("bxRecResumo")) {
      el("bxRecResumo").textContent = `Documento ${item.numero_documento || "—"} · Venc. ${item.vencimento_fmt || "—"}`;
    }
    S.mostrarErro(el("baixaReceberErro"), "");
    resetCamposBaixa(item, "bxRec");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function fecharModal() {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    itemBaixa = null;
    S.mostrarErro(el("baixaReceberErro"), "");
  }

  function bindMoneyInputs(prefix) {
    const p = prefix || "bxRec";
    const sel = prefix === "bxRecTab" ? ".bx-money-rec-tab" : ".bx-money-rec";
    document.querySelectorAll(sel).forEach((inp) => {
      if (inp.dataset.boundRec) return;
      inp.dataset.boundRec = "1";
      inp.addEventListener("input", () => {
        if (inp.id === `${p}_valor_recebido`) valorRecebidoManual = true;
        else valorRecebidoManual = false;
        atualizarCalculo(p);
      });
    });
  }

  async function posBaixaSucesso(j) {
    if (j?.painel) S.atualizarPainel(j.painel);
    if (j?.kpis) S.atualizarKpis(j.kpis);
    if (typeof window.__finRecarregarLista === "function") await window.__finRecarregarLista();
  }

  async function confirmarModal() {
    if (!itemBaixa?.id) return;
    const btn = el("btnConfirmarBaixaReceber");
    if (btn) btn.disabled = true;
    try {
      const j = await executarBaixa(itemBaixa.id, "bxRec");
      fecharModal();
      await posBaixaSucesso(j);
      S.toast("Recebimento registrado.");
    } catch (e) {
      S.mostrarErro(el("baixaReceberErro"), e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function confirmarTab() {
    const rid = el("regId")?.value;
    if (!rid) {
      S.mostrarErro(el("finErro"), "Salve o lançamento antes de dar baixa.");
      return;
    }
    try {
      const j = await executarBaixa(rid, "bxRecTab");
      await posBaixaSucesso(j);
      const det = await S.apiJson(`/api/financeiro/contas-receber/${rid}`);
      if (typeof window.__finPreencherForm === "function") window.__finPreencherForm(det.item);
      S.mostrarErro(el("finErro"), "");
      S.toast("Recebimento registrado.");
    } catch (e) {
      S.mostrarErro(el("finErro"), e.message);
    }
  }

  function preencherTabBaixa(item) {
    if (!item || !el("bxRecTab_conta")) return;
    ensureCategorias().then(() => resetCamposBaixa(item, "bxRecTab"));
    const fechado = item.status === "recebido";
    const btn = el("btnConfirmarBaixa");
    if (btn) {
      btn.disabled = !!fechado;
      btn.textContent = fechado ? "Título quitado" : "Confirmar recebimento";
    }
    if (el("baixaHint")) {
      el("baixaHint").textContent = fechado
        ? "Lançamento quitado. Consulte o histórico de recebimentos."
        : "Informe conta, categoria, ajustes e valor recebido. Baixas parciais mantêm saldo em aberto.";
    }
  }

  el("btnConfirmarBaixaReceber")?.addEventListener("click", confirmarModal);
  el("btnCancelarBaixaReceber")?.addEventListener("click", fecharModal);
  el("btnFecharBaixaReceber")?.addEventListener("click", fecharModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
  });

  bindMoneyInputs("bxRec");
  bindMoneyInputs("bxRecTab");

  window.FinBaixaReceber = {
    abrirModal,
    fecharModal,
    preencherTabBaixa,
    confirmarTab,
    podeBaixar(item) {
      return item && (item.status === "em_aberto" || item.status === "atrasado" || item.status === "parcialmente_recebido");
    },
    valorExibir(item) {
      if (item?.valor_exibir_fmt) return item.valor_exibir_fmt;
      return item?.valor_fmt || "—";
    },
  };
})();
