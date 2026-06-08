(function () {
  const API = "/api/financeiro/notas-servico";
  const S = window.FinShared;
  let itens = [];
  let selecionados = new Set();
  let emailNotaId = null;
  let emissaoEmpresaPronta = false;
  let emissaoAmbiente = "homologacao";
  let emissaoPendenciasEmpresa = [];

  function el(id) {
    return document.getElementById(id);
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
    if (el("btnEmitirSel")) el("btnEmitirSel").disabled = !tem || !emissaoEmpresaPronta;
    if (el("btnEmitirPendentes")) el("btnEmitirPendentes").disabled = !emissaoEmpresaPronta;
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
      ${nota.situacao === "emitida" ? `<button type="button" data-act="cancelar-nfse" data-id="${id}">Cancelar NFS-e (SEFIN)</button>` : ""}
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
        const nota = itens.find((i) => i.id === id);
        emailNotaId = id;
        if (el("emailDestino")) el("emailDestino").value = nota?.cliente_email || "";
        if (el("modalEmail")) {
          el("modalEmail").classList.add("open");
          el("modalEmail").setAttribute("aria-hidden", "false");
        }
        return;
      }
      if (act === "emitir") {
        if (!podeEmitirNota(itens.find((i) => i.id === id))) {
          S.toast("Emissão bloqueada — verifique Configuração Fiscal e dados da nota.", true);
          return;
        }
        const j = await postJson(`${API}/${id}/emitir`, "POST", {});
        S.toast(j.mensagem || "NFS-e autorizada com sucesso.");
        await carregar();
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
      atualizarPainel(j.painel);
      render();
    } catch (err) {
      S.toast(err.message || "Erro ao processar a ação.", true);
    }
  }

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
    if (!emissaoEmpresaPronta) {
      S.toast("Configure a Configuração Fiscal antes de emitir.", true);
      return;
    }
    for (const id of selecionados) {
      const nota = itens.find((i) => i.id === id);
      if (!podeEmitirNota(nota)) continue;
      try {
        await postJson(`${API}/${id}/emitir`, "POST", {});
      } catch (err) {
        S.toast(err.message || "Erro na emissão.", true);
      }
    }
    S.toast("Processamento de emissão concluído.");
    await carregar();
  });

  el("btnEmitirPendentes")?.addEventListener("click", async () => {
    if (!emissaoEmpresaPronta) {
      S.toast("Configure a Configuração Fiscal antes de emitir.", true);
      return;
    }
    const pends = itens.filter((i) => podeEmitirNota(i));
    if (!pends.length) {
      S.toast("Nenhuma nota pendente pronta para emissão.");
      return;
    }
    for (const n of pends) {
      try {
        await S.apiJson(`${API}/${n.id}/emitir`, { method: "POST" });
      } catch (err) {
        S.toast(err.message || "Erro na emissão.", true);
      }
    }
    S.toast("Pendentes processadas.");
    await carregar();
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
