(function () {
  console.log("[nfse] financeiro_nfse.js carregado");
  const API = "/api/financeiro/notas-servico";
  const S = window.FinShared;
  if (!S) console.error("[nfse] FinShared não encontrado — toasts podem falhar");
  let itens = [];
  let selecionados = new Set();
  let emailNotaId = null;
  let emissaoEmpresaPronta = false;
  let emissaoAmbiente = "homologacao";
  let emissaoPendenciasEmpresa = [];
  let emissaoLotePermitida = true;
  let emissaoProducaoConfirmacao = "EMITIR PRODUCAO";
  let emissaoProducaoRequerConfirmacao = false;
  let emissaoMetaPronta = false;
  let producaoNotaId = null;
  let ultimaNotaEmitidaProdId = null;
  let emitindoProducao = false;

  const ENDPOINT_SEFIN_PRODUCAO = "https://sefin.nfse.gov.br/SefinNacional/nfse";
  const CONFIRMACAO_PRODUCAO = "EMITIR PRODUCAO";

  function el(id) {
    return document.getElementById(id);
  }

  function notaPorId(id) {
    return itens.find((i) => String(i.id) === String(id));
  }

  function isProducao() {
    return emissaoAmbiente === "producao" || emissaoProducaoRequerConfirmacao;
  }

  function erroExigeModalProducao(msg) {
    const m = String(msg || "");
    return (
      m.includes("EMITIR PRODUCAO") ||
      m.includes("PRODUÇÃO bloqueada") ||
      m.includes("PRODUCAO bloqueada")
    );
  }

  function modalProducaoEl() {
    return document.getElementById("modalProducao");
  }

  function inputConfirmacaoProducao() {
    const modal = modalProducaoEl();
    if (!modal) return null;
    return (
      modal.querySelector("#prodConfirmacao") ||
      modal.querySelector('input[name="confirmacao_producao"]') ||
      modal.querySelector("[data-prod-confirmacao]")
    );
  }

  function lerConfirmacaoDigitada() {
    const elemento = inputConfirmacaoProducao();
    const bruto = elemento?.value ?? "";
    const valor = String(bruto).normalize("NFKC").trim().replace(/\s+/g, " ");
    return { elemento, valor, bruto };
  }

  function confirmacaoProducaoValida(valor) {
    return valor === CONFIRMACAO_PRODUCAO;
  }

  function toastNfse(msg, isError) {
    if (S && S.toast) S.toast(msg, isError === true);
    else if (isError) alert(msg);
    else console.log(msg);
  }

  function mostrarModalProducao() {
    if (typeof window.__nfseFixModalLayer === "function") {
      window.__nfseFixModalLayer();
      window.setTimeout(() => inputConfirmacaoProducao()?.focus(), 0);
      return;
    }
    const modal = modalProducaoEl();
    if (!modal) return;
    ancorarModalProducao();
    modal.style.cssText =
      "display:flex!important;position:fixed!important;top:0!important;left:0!important;" +
      "right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;" +
      "margin:0!important;z-index:99999!important;align-items:center;justify-content:center;" +
      "padding:20px;box-sizing:border-box;background:rgba(15,23,42,0.72);backdrop-filter:blur(6px);";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    window.setTimeout(() => inputConfirmacaoProducao()?.focus(), 0);
  }

  function postJson(url, method, body) {
    return S.apiJson(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  }

  function situacaoAtiva() {
    return document.querySelector("#filtroSituacao .fin-pill.active")?.dataset.sit ?? "";
  }

  function initPills() {
    document.querySelectorAll(".fin-pills").forEach((group) => {
      group.querySelectorAll(".fin-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          group.querySelectorAll(".fin-pill").forEach((p) => p.classList.remove("active"));
          pill.classList.add("active");
        });
      });
    });
  }

  function badgeSituacao(s, nota) {
    const map = { pendente: "Pendente", emitida: "Emitida", cancelada: "Cancelada", erro: "Erro" };
    const lancada = nota?.vinculacao_cr === "lancado_contas_receber";
    const extra = lancada ? ' <span class="fin-status nf-sit-lancada-cr" title="Lançada em Contas a Receber">CR</span>' : "";
    if (s === "erro" && nota?.erro_emissao) {
      const msg = String(nota.erro_emissao);
      const curta = msg.length > 72 ? `${msg.slice(0, 72)}…` : msg;
      return `<div class="nf-sit-erro-wrap"><span class="fin-status nf-sit-erro" title="${msg.replace(/"/g, "&quot;")}">Erro</span><small class="nf-erro-msg" title="${msg.replace(/"/g, "&quot;")}">${curta}</small>${extra}</div>`;
    }
    return `<span class="fin-status nf-sit-${s || "pendente"}">${map[s] || s}</span>${extra}`;
  }

  function podeEmitirNota(nota) {
    if (!nota || !emissaoEmpresaPronta) return false;
    if (nota.emissao_pode === false) return false;
    const sit = (nota.situacao || "").toLowerCase();
    return sit === "pendente" || sit === "erro";
  }

  function montarQuery() {
    const q = new URLSearchParams();
    const sit = situacaoAtiva();
    if (sit) q.set("situacao", sit);
    const busca = el("ff_busca")?.value?.trim();
    const di = el("ff_data_ini")?.value;
    const df = el("ff_data_fim")?.value;
    if (busca) q.set("busca", busca);
    if (di) q.set("data_ini", di);
    if (df) q.set("data_fim", df);
    return q.toString() ? `${API}?${q}` : API;
  }

  function atualizarPainel(painel) {
    if (el("painelQtd")) el("painelQtd").textContent = String(painel?.quantidade ?? itens.length);
    if (el("painelTotal")) el("painelTotal").textContent = painel?.valor_total_fmt || "R$ 0,00";
  }

  function atualizarBotoes() {
    const n = selecionados.size;
    const tem = n > 0;
    ["btnImprimirSel", "btnExcluirSel", "btnGerarTxt"].forEach((id) => {
      if (el(id)) el(id).disabled = !tem;
    });
    if (el("btnEmitirSel")) el("btnEmitirSel").disabled = !tem || !emissaoEmpresaPronta || !emissaoLotePermitida;
    if (el("btnEmitirPendentes")) el("btnEmitirPendentes").disabled = !emissaoEmpresaPronta || !emissaoLotePermitida;
    const ultimaEmitida = itens.find((n) => n.id === ultimaNotaEmitidaProdId && n.situacao === "emitida");
    if (el("btnCancelarProdRapido")) {
      el("btnCancelarProdRapido").style.display =
        isProducao() && ultimaEmitida ? "flex" : "none";
    }
  }

  function fecharModalProducao() {
    producaoNotaId = null;
    const modal = modalProducaoEl();
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      modal.style.cssText = "display:none!important;";
    }
    document.body.style.overflow = "";
    const inputConf = inputConfirmacaoProducao();
    if (inputConf) inputConf.value = "";
    if (el("prodErro")) el("prodErro").style.display = "none";
    if (el("prodSucesso")) el("prodSucesso").style.display = "none";
    if (el("prodConfirmacaoWrap")) el("prodConfirmacaoWrap").style.display = "";
    if (el("btnConfirmarProducao")) el("btnConfirmarProducao").style.display = "";
    if (el("btnCancelarProdModal")) el("btnCancelarProdModal").style.display = "none";
  }

  function montarResumoLocal(nota) {
    const valor = Number(nota?.total_nota ?? nota?.total_servicos ?? 0);
    return {
      cnpj_prestador: "Carregando…",
      tomador_nome: nota?.cliente_nome || "—",
      tomador_doc: nota?.cliente_cnpj_cpf || "",
      valor_nota: Number.isFinite(valor) ? valor : 0,
      serie_rps: nota?.serie_rps || "1",
      nDPS: "Carregando…",
      endpoint_sefin: ENDPOINT_SEFIN_PRODUCAO,
    };
  }

  function renderResumoProducao(r) {
    const box = el("prodResumo");
    if (!box || !r) return;
    const fmt = (v) => (v != null && v !== "" ? v : "—");
    const cliente = r.tomador_doc
      ? `${fmt(r.tomador_nome)} (${fmt(r.tomador_doc)})`
      : fmt(r.tomador_nome);
    box.innerHTML = `
      <dl class="fin-prod-resumo">
        <dt>CNPJ</dt><dd>${fmt(r.cnpj_prestador)}</dd>
        <dt>Cliente</dt><dd>${cliente}</dd>
        <dt>Valor</dt><dd>R$ ${Number(r.valor_nota || 0).toFixed(2)}</dd>
        <dt>Série</dt><dd>${fmt(r.serie_rps)}</dd>
        <dt>nDPS</dt><dd>${fmt(r.nDPS)}</dd>
        <dt>Ambiente</dt><dd><strong>PRODUÇÃO</strong></dd>
        <dt>Endpoint</dt><dd style="font-size:11px;word-break:break-all">${fmt(r.endpoint_sefin)}</dd>
      </dl>`;
  }

  async function carregarResumoProducao(id) {
    try {
      const j = await S.apiJson(`${API}/${id}/resumo-emissao-producao`);
      renderResumoProducao(j.resumo);
      emissaoAmbiente = "producao";
      emissaoProducaoRequerConfirmacao = true;
      if (el("bannerProducao")) el("bannerProducao").style.display = "block";
      return true;
    } catch (err) {
      const nota = notaPorId(id);
      if (nota) renderResumoProducao(montarResumoLocal(nota));
      if (el("prodErro")) {
        el("prodErro").textContent =
          err.message || "Não foi possível carregar o resumo completo. Confirme os dados antes de emitir.";
        el("prodErro").style.display = "block";
      }
      return false;
    }
  }

  function ancorarModalProducao() {
    const modal = el("modalProducao");
    if (!modal) return;
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  }

  function initModalProducao() {
    ancorarModalProducao();
    const modal = modalProducaoEl();
    if (modal && !modal.classList.contains("open")) {
      modal.style.display = "none";
      modal.classList.remove("open");
    }

    el("btnFecharProducao")?.addEventListener("click", fecharModalProducao);

    el("modalProducao")?.addEventListener("click", (e) => {
      if (e.target === modalProducaoEl()) fecharModalProducao();
    });

    inputConfirmacaoProducao()?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmarEmissaoProducao().catch((err) => {
          console.error("[nfse] Erro Enter confirmar:", err);
          toastNfse(err?.message || "Erro inesperado ao emitir em produção.", true);
        });
      }
    });

    el("btnCancelarProdModal")?.addEventListener("click", () => {
      if (producaoNotaId) cancelarNfseProducao(producaoNotaId, "modal");
    });

    window.__nfseConfirmarProducao = () => confirmarEmissaoProducao();
    const btnConfirmar = el("btnConfirmarProducao");
    console.log("[nfse] modal produção inicializado", { btnConfirmar: !!btnConfirmar, input: !!inputConfirmacaoProducao() });
  }

  async function confirmarEmissaoProducao() {
    if (emitindoProducao) return;
    const notaId = producaoNotaId || modalProducaoEl()?.dataset?.notaId;
    const { elemento, valor } = lerConfirmacaoDigitada();
    const confirmacao = valor;
    const payload = { confirmacao: CONFIRMACAO_PRODUCAO };

    console.log("CLICK EMITIR PRODUCAO");
    console.log("VALOR:", confirmacao);
    console.log("NOTA:", notaId);
    console.log("INPUT ENCONTRADO", elemento);

    if (!elemento) {
      toastNfse("Campo de confirmação não encontrado no modal.", true);
      return;
    }

    if (!notaId) {
      toastNfse("Nota não identificada. Feche o modal e tente emitir novamente.", true);
      return;
    }

    if (!confirmacaoProducaoValida(confirmacao)) {
      const msg = `Digite exatamente: ${CONFIRMACAO_PRODUCAO}`;
      if (el("prodErro")) {
        el("prodErro").textContent = msg;
        el("prodErro").style.display = "block";
      }
      toastNfse(msg, true);
      return;
    }

    console.log("CONFIRMACAO OK");
    console.log("ENVIANDO POST");

    if (el("prodErro")) el("prodErro").style.display = "none";
    const btn = el("btnConfirmarProducao");
    if (btn) btn.disabled = true;

    toastNfse("Enviando NFS-e em produção...");

    emitindoProducao = true;
    try {
      const j = await postJson(`${API}/${notaId}/emitir`, "POST", payload);
      console.log("[nfse] POST /emitir resposta:", j);

      ultimaNotaEmitidaProdId = notaId;
      const em = j.emissao || {};
      if (el("prodSucesso")) {
        el("prodSucesso").innerHTML =
          `<strong>NFS-e autorizada em PRODUÇÃO</strong><br>` +
          `Número: ${em.numero_nfse || "—"}<br>` +
          `Chave: ${em.chave_acesso || "—"}<br>` +
          `Protocolo: ${em.protocolo || "—"}<br>` +
          (em.link_nfse ? `<a href="${em.link_nfse}" target="_blank" rel="noopener">Abrir DANFSe</a>` : "");
        el("prodSucesso").style.display = "block";
      }
      if (el("prodConfirmacaoWrap")) el("prodConfirmacaoWrap").style.display = "none";
      if (btn) btn.style.display = "none";
      if (el("btnCancelarProdModal")) el("btnCancelarProdModal").style.display = "";
      toastNfse(j.mensagem || "NFS-e autorizada em produção.");
      await carregar();
    } catch (err) {
      console.error("[nfse] Erro POST /emitir:", err);
      const msg = err?.message || "Erro na emissão.";
      if (el("prodErro")) {
        el("prodErro").textContent = msg;
        el("prodErro").style.display = "block";
      }
      toastNfse(msg, true);
    } finally {
      emitindoProducao = false;
      if (btn) btn.disabled = false;
    }
  }
  async function abrirModalProducao(id) {
    producaoNotaId = String(id);
    if (el("modalProducao")) el("modalProducao").dataset.notaId = String(id);
    if (el("prodErro")) el("prodErro").style.display = "none";
    if (el("prodSucesso")) el("prodSucesso").style.display = "none";
    if (el("prodConfirmacaoWrap")) el("prodConfirmacaoWrap").style.display = "";
    if (el("btnConfirmarProducao")) {
      el("btnConfirmarProducao").style.display = "";
      el("btnConfirmarProducao").disabled = false;
    }
    if (el("btnCancelarProdModal")) el("btnCancelarProdModal").style.display = "none";
    const inputConf = inputConfirmacaoProducao();
    if (inputConf) inputConf.value = "";
    renderResumoProducao(montarResumoLocal(notaPorId(id)));
    mostrarModalProducao();
    await carregarResumoProducao(id);
  }

  async function emitirNota(id, confirmacao) {
    if (isProducao() && !confirmacao) {
      await abrirModalProducao(id);
      return { ok: false, modal: true };
    }
    const body = confirmacao ? { confirmacao } : {};
    try {
      return await postJson(`${API}/${id}/emitir`, "POST", body);
    } catch (err) {
      if (!confirmacao && erroExigeModalProducao(err.message)) {
        emissaoAmbiente = "producao";
        emissaoProducaoRequerConfirmacao = true;
        if (el("bannerProducao")) el("bannerProducao").style.display = "block";
        await abrirModalProducao(id);
        return { ok: false, modal: true };
      }
      throw err;
    }
  }

  async function solicitarEmissao(id) {
    if (!emissaoMetaPronta) {
      S.toast("Aguarde o carregamento das configurações de emissão.", true);
      return;
    }
    const nota = notaPorId(id);
    if (!podeEmitirNota(nota)) {
      S.toast("Emissão bloqueada — verifique Configuração Fiscal e dados da nota.", true);
      return;
    }
    if (isProducao()) {
      await abrirModalProducao(id);
      return;
    }
    if (!confirm("Emitir NFS-e em homologação para esta nota?")) return;
    try {
      const j = await emitirNota(id);
      if (j?.modal) return;
      S.toast(j.mensagem || "NFS-e autorizada com sucesso.");
      await carregar();
    } catch (err) {
      if (erroExigeModalProducao(err.message)) {
        await abrirModalProducao(id);
        return;
      }
      S.toast(err.message || "Erro na emissão.", true);
    }
  }

  async function cancelarNfseProducao(id, origem) {
    const nota = notaPorId(id);
    const chave = nota?.chave_acesso || "";
    const msg =
      "CANCELAMENTO EM PRODUÇÃO\n\n" +
      `NFS-e: ${nota?.numero_nfse || "—"}\nChave: ${chave}\n\n` +
      "Esta ação cancela a nota na SEFIN Nacional. Deseja continuar?";
    if (!confirm(msg)) return;
    const motivo = prompt(
      "Motivo do cancelamento (mín. 15 caracteres):",
      "Cancelamento de teste em produção solicitado pelo emitente"
    );
    if (!motivo) return;
    try {
      await postJson(`${API}/${id}/cancelar-nfse`, "POST", { motivo });
      S.toast("NFS-e cancelada em produção.");
      if (origem === "modal") fecharModalProducao();
      await carregar();
    } catch (err) {
      S.toast(err.message || "Erro ao cancelar.", true);
    }
  }

  function fecharMenu() {
    const m = el("menuContexto");
    if (m) m.style.display = "none";
  }

  function menuAcoes(nota) {
    const id = nota.id;
    const lancado = nota.vinculacao_cr === "lancado_contas_receber";
    const cancelada = nota.situacao === "cancelada";
    return `
      ${lancado ? `<button type="button" data-act="estornar" data-id="${id}">Estornar contas</button>` : (!cancelada ? `<button type="button" data-act="lancar" data-id="${id}">Lançar em contas</button>` : "")}
      <button type="button" data-act="clonar" data-id="${id}">Clonar nota</button>
      <button type="button" data-act="boleto" data-id="${id}">Emitir boletos</button>
      <button type="button" data-act="email" data-id="${id}">Enviar por e-mail</button>
      ${nota.situacao === "emitida" && nota.chave_acesso ? `<button type="button" data-act="consultar-nfse" data-id="${id}">Consultar NFS-e</button>` : ""}
      ${nota.situacao === "emitida" ? `<button type="button" data-act="cancelar-nfse" data-id="${id}" class="${isProducao() ? "danger" : ""}">${isProducao() ? "Cancelar NFS-e (PRODUÇÃO)" : "Cancelar NFS-e (SEFIN)"}</button>` : ""}
      ${!cancelada && nota.situacao !== "emitida" ? `<button type="button" data-act="cancelar" data-id="${id}">Marcar cancelada</button>` : ""}
      <button type="button" data-act="imprimir" data-id="${id}">Imprimir NFS-e</button>
      <button type="button" data-act="sit-pendente" data-id="${id}">Alterar para Pendente</button>
      <button type="button" data-act="sit-emitida" data-id="${id}">Alterar para Emitida</button>
      <button type="button" data-act="sit-cancelada" data-id="${id}">Alterar para Cancelada</button>
      ${podeEmitirNota(nota) ? `<button type="button" data-act="emitir" data-id="${id}">Emitir NFS-e</button>` : ""}
      ${!podeEmitirNota(nota) && ["pendente", "erro"].includes(nota.situacao) ? `<button type="button" disabled title="${(nota.emissao_bloqueio || emissaoPendenciasEmpresa.join("; ")).replace(/"/g, "&quot;")}">Emitir NFS-e (bloqueado)</button>` : ""}
      <button type="button" data-act="editar" data-id="${id}">Editar</button>
      ${!lancado ? `<button type="button" data-act="excluir" data-id="${id}" class="danger">Excluir</button>` : ""}
    `;
  }

  function abrirMenu(e, id) {
    e.stopPropagation();
    const nota = itens.find((i) => i.id === id);
    if (!nota) return;
    const menu = el("menuContexto");
    if (!menu) return;
    menu.innerHTML = menuAcoes(nota);
    menu.style.display = "block";
    const rect = e.currentTarget.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 240)}px`;
    menu.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => executarAcao(b.dataset.act, b.dataset.id));
    });
  }

  async function executarAcao(act, id) {
    fecharMenu();
    try {
      if (act === "editar") {
        location.href = `/financeiro/notas-servico/${id}/editar`;
        return;
      }
      if (act === "imprimir") {
        window.open(`/financeiro/notas-servico/${id}/imprimir`, "_blank");
        return;
      }
      if (act === "clonar") {
        const j = await postJson(`${API}/${id}/clonar`, "POST", {});
        S.toast("Nota clonada.");
        location.href = `/financeiro/notas-servico/${j.item.id}/editar`;
        return;
      }
      if (act === "lancar") {
        const j = await postJson(`${API}/${id}/lancar-contas-receber`, "POST", {});
        S.toast(j.mensagem || "Conta a receber criada com sucesso.");
        await carregar();
        return;
      }
      if (act === "estornar") {
        if (!confirm("Estornar lançamentos em Contas a Receber?")) return;
        await postJson(`${API}/${id}/estornar-contas-receber`, "POST", {});
        S.toast("Lançamento estornado com sucesso.");
        await carregar();
        return;
      }
      if (act === "email") {
        const nota = notaPorId(id);
        emailNotaId = id;
        if (el("emailDestino")) el("emailDestino").value = nota?.cliente_email || "";
        if (el("modalEmail")) {
          el("modalEmail").classList.add("open");
          el("modalEmail").setAttribute("aria-hidden", "false");
        }
        return;
      }
      if (act === "emitir") {
        await solicitarEmissao(id);
        return;
      }
      if (act === "consultar-nfse") {
        const j = await S.apiJson(`${API}/${id}/consultar-nfse`);
        S.toast("Consulta realizada.");
        console.info("NFS-e consulta:", j.consulta);
        await carregar();
        return;
      }
      if (act === "cancelar-nfse") {
        if (isProducao()) {
          await cancelarNfseProducao(id, "menu");
          return;
        }
        const motivo = prompt("Motivo do cancelamento (mín. 15 caracteres):", "Cancelamento solicitado pelo emitente");
        if (!motivo) return;
        await postJson(`${API}/${id}/cancelar-nfse`, "POST", { motivo });
        S.toast("NFS-e cancelada.");
        await carregar();
        return;
      }
      if (act === "cancelar" || act.startsWith("sit-")) {
        const sit = act === "cancelar" ? "cancelada" : act.replace("sit-", "");
        await postJson(`${API}/${id}/situacao`, "PUT", { situacao: sit });
        S.toast("Situação atualizada.");
        await carregar();
        return;
      }
      if (act === "excluir") {
        if (!confirm("Excluir esta nota?")) return;
        await postJson(API, "DELETE", { ids: [id] });
        S.toast("Nota excluída.");
        selecionados.delete(id);
        await carregar();
        return;
      }
      if (act === "boleto") {
        S.toast("Emissão de boletos — integração pendente.");
      }
    } catch (err) {
      S.toast(err.message || "Erro ao processar a ação.", true);
    }
  }

  function render() {
    const tbody = el("tbodyNfse");
    if (!tbody) return;
    if (!itens.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="fin-empty"><div class="fin-empty-inner"><div class="fin-empty-icon">📄</div><p class="fin-empty-title">Nenhuma nota encontrada</p><p class="fin-empty-text">Inclua uma nota ou ajuste os filtros.</p></div></td></tr>`;
      atualizarBotoes();
      return;
    }
    tbody.innerHTML = itens
      .map(
        (n) => `<tr data-id="${n.id}">
        <td><input type="checkbox" class="chk-nfse" value="${n.id}" ${selecionados.has(n.id) ? "checked" : ""}></td>
        <td><a href="/financeiro/notas-servico/${n.id}/editar" class="fin-link-num">${n.numero_nfse ? n.numero_nfse + " / " : ""}${n.numero_rps || "—"}</a></td>
        <td>${n.data_emissao_fmt || "—"}</td>
        <td><b>${n.cliente_nome || "—"}</b></td>
        <td>${badgeSituacao(n.situacao, n)}</td>
        <td class="fin-valor">${n.total_nota_fmt}</td>
        <td class="fin-acoes"><button type="button" class="fin-btn-menu" data-menu="${n.id}" title="Ações">⋮</button></td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll(".chk-nfse").forEach((chk) => {
      chk.addEventListener("change", () => {
        if (chk.checked) selecionados.add(chk.value);
        else selecionados.delete(chk.value);
        atualizarBotoes();
        if (el("chkTodos")) el("chkTodos").checked = selecionados.size === itens.length && itens.length > 0;
      });
    });
    tbody.querySelectorAll("[data-menu]").forEach((btn) => {
      btn.addEventListener("click", (e) => abrirMenu(e, btn.dataset.menu));
    });
    atualizarBotoes();
  }

  async function carregar() {
    try {
      const j = await S.apiJson(montarQuery());
      itens = j.itens || [];
      emissaoEmpresaPronta = !!j.emissao?.empresa_pronta;
      emissaoAmbiente = j.emissao?.ambiente || "homologacao";
      emissaoPendenciasEmpresa = j.emissao?.pendencias_empresa || [];
      emissaoLotePermitida = j.emissao?.emissao_lote_permitida !== false;
      emissaoProducaoConfirmacao = j.emissao?.confirmacao_producao_texto || "EMITIR PRODUCAO";
      emissaoProducaoRequerConfirmacao = j.emissao?.producao_requer_confirmacao === true;
      emissaoMetaPronta = true;
      if (el("bannerProducao")) {
        el("bannerProducao").style.display = emissaoAmbiente === "producao" ? "block" : "none";
      }
      atualizarPainel(j.painel);
      render();
    } catch (err) {
      S.toast(err.message || "Erro ao processar a ação.", true);
    }
  }

  initModalProducao();

  el("btnFiltrar")?.addEventListener("click", carregar);
  el("btnLimpar")?.addEventListener("click", () => {
    ["ff_busca", "ff_data_ini", "ff_data_fim"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    document.querySelector("#filtroSituacao .fin-pill")?.click();
    carregar();
  });

  el("chkTodos")?.addEventListener("change", (e) => {
    selecionados.clear();
    if (e.target.checked) itens.forEach((i) => selecionados.add(i.id));
    render();
  });

  el("btnExcluirSel")?.addEventListener("click", async () => {
    if (!selecionados.size || !confirm(`Excluir ${selecionados.size} nota(s)?`)) return;
    try {
      await postJson(API, "DELETE", { ids: [...selecionados] });
      S.toast("Notas excluídas.");
      selecionados.clear();
      await carregar();
    } catch (err) {
      S.toast(err.message || "Erro ao processar a ação.", true);
    }
  });

  el("btnImprimirSel")?.addEventListener("click", () => {
    selecionados.forEach((id) => window.open(`/financeiro/notas-servico/${id}/imprimir`, "_blank"));
  });

  el("btnEmitirSel")?.addEventListener("click", async () => {
    if (!emissaoLotePermitida) {
      S.toast("Emissão em lote bloqueada em PRODUÇÃO. Emita uma nota por vez.", true);
      return;
    }
    if (!emissaoEmpresaPronta) {
      S.toast("Configure a Configuração Fiscal antes de emitir.", true);
      return;
    }
    for (const id of selecionados) {
      const nota = notaPorId(id);
      if (!podeEmitirNota(nota)) continue;
      try {
        await solicitarEmissao(id);
      } catch (err) {
        S.toast(err.message || "Erro na emissão.", true);
      }
      if (isProducao()) break;
    }
    if (!isProducao()) {
      S.toast("Processamento de emissão concluído.");
      await carregar();
    }
  });

  el("btnEmitirPendentes")?.addEventListener("click", async () => {
    if (!emissaoLotePermitida) {
      S.toast("Emissão em lote bloqueada em PRODUÇÃO. Emita uma nota por vez.", true);
      return;
    }
    const pends = itens.filter((i) => podeEmitirNota(i));
    if (!pends.length) {
      S.toast("Nenhuma nota pendente pronta para emissão.");
      return;
    }
    for (const n of pends) {
      try {
        await solicitarEmissao(n.id);
      } catch (err) {
        S.toast(err.message || "Erro na emissão.", true);
      }
      if (isProducao()) break;
    }
    if (!isProducao()) {
      S.toast("Pendentes processadas.");
      await carregar();
    }
  });

  el("btnCancelarProdRapido")?.addEventListener("click", () => {
    if (ultimaNotaEmitidaProdId) cancelarNfseProducao(ultimaNotaEmitidaProdId, "rapido");
  });

  el("btnGerarTxt")?.addEventListener("click", () => S.toast("Geração TXT — integração prefeitura pendente."));
  el("btnPortalPref")?.addEventListener("click", () => S.toast("Configure o link do portal da prefeitura na integração futura."));

  el("btnFecharEmail")?.addEventListener("click", () => {
    el("modalEmail")?.classList.remove("open");
  });
  el("btnConfirmarEmail")?.addEventListener("click", async () => {
    if (!emailNotaId) return;
    try {
      const j = await postJson(`${API}/${emailNotaId}/enviar-email`, "POST", {
        email: el("emailDestino")?.value,
        assunto: el("emailAssunto")?.value,
        mensagem: el("emailMsg")?.value,
      });
      S.toast(j.mensagem || "E-mail preparado.");
      el("modalEmail")?.classList.remove("open");
    } catch (err) {
      if (el("emailErro")) {
        el("emailErro").textContent = err.message;
        el("emailErro").style.display = "block";
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#menuContexto") && !e.target.closest(".fin-btn-menu")) fecharMenu();
  });

  initPills();
  carregar();
})();
