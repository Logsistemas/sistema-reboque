(function () {
  const API = "/api/financeiro/notas-entrada";
  const S = window.FinShared;
  let itens = [];
  let selecionadoId = null;
  let detalheAtual = null;

  function el(id) {
    return document.getElementById(id);
  }

  function situacaoAtiva() {
    return document.querySelector("#filtroSituacao .fin-pill.active")?.dataset.sit ?? "";
  }

  function vinculacaoAtiva() {
    return document.querySelector("#filtroVinculacao .fin-pill.active")?.dataset.vinc ?? "";
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

  function initTabsDetalhe() {
    const root = el("modalDetalhe");
    if (!root) return;
    root.querySelectorAll("[data-nf-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-nf-tab");
        root.querySelectorAll("[data-nf-tab]").forEach((b) => b.classList.toggle("active", b === btn));
        root.querySelectorAll("[data-nf-panel]").forEach((p) =>
          p.classList.toggle("active", p.getAttribute("data-nf-panel") === tab)
        );
      });
    });
  }

  function montarQuery() {
    const q = new URLSearchParams();
    const sit = situacaoAtiva();
    const vinc = vinculacaoAtiva();
    if (sit) q.set("situacao", sit);
    if (vinc) q.set("vinculacao", vinc);
    const prod = el("ff_produto")?.value?.trim();
    const lote = el("ff_lote")?.value?.trim();
    const uf = el("ff_uf")?.value?.trim();
    const busca = el("ff_busca")?.value?.trim();
    const di = el("ff_data_ini")?.value;
    const df = el("ff_data_fim")?.value;
    if (prod) q.set("produto", prod);
    if (lote) q.set("lote", lote);
    if (uf) q.set("uf", uf);
    if (busca) q.set("busca", busca);
    if (di) q.set("data_ini", di);
    if (df) q.set("data_fim", df);
    return q.toString() ? `${API}?${q}` : API;
  }

  function badgeSituacao(s) {
    const map = {
      registrada: "Registrada",
      pendente: "Pendente",
      cancelada: "Cancelada",
    };
    const label = map[s] || s;
    return `<span class="fin-status nf-sit-${s || "registrada"}">${label}</span>`;
  }

  function badgeVinculacao(v) {
    const ok = v === "lancado_contas_pagar";
    const label = ok ? "Lançado em contas a pagar" : "Não vinculado";
    return `<span class="fin-vinc ${ok ? "vinc-ok" : "vinc-pend"}">${label}</span>`;
  }

  function emptyRow() {
    return `<tr><td colspan="8" class="fin-empty">
      <div class="fin-empty-inner">
        <div class="fin-empty-icon">📥</div>
        <p class="fin-empty-title">Nenhuma nota encontrada</p>
        <p class="fin-empty-text">Importe um XML NF-e ou ajuste os filtros.</p>
      </div>
    </td></tr>`;
  }

  function atualizarBotoesSidebar() {
    const tem = !!selecionadoId;
    const nota = itens.find((i) => i.id === selecionadoId);
    const podeLancar = tem && nota && nota.vinculacao !== "lancado_contas_pagar" && nota.situacao !== "cancelada";
    if (el("btnLancarSel")) el("btnLancarSel").disabled = !podeLancar;
    if (el("btnVerDetalhe")) el("btnVerDetalhe").disabled = !tem;
  }

  function setSelecionado(id) {
    selecionadoId = id || null;
    document.querySelectorAll("#tbodyNotas tr[data-id]").forEach((tr) => {
      tr.classList.toggle("fin-row-selected", tr.dataset.id === selecionadoId);
    });
    atualizarBotoesSidebar();
  }

  function fecharMenu() {
    const m = el("menuContexto");
    if (m) m.style.display = "none";
  }

  function abrirMenu(e, id) {
    e.stopPropagation();
    const nota = itens.find((i) => i.id === id);
    if (!nota) return;
    const menu = el("menuContexto");
    if (!menu) return;
    const podeLancar = nota.vinculacao !== "lancado_contas_pagar" && nota.situacao !== "cancelada";
    const podeExcluir = nota.vinculacao !== "lancado_contas_pagar";
    menu.innerHTML = `
      <button type="button" data-act="detalhe" data-id="${id}">Ver detalhes</button>
      ${podeLancar ? `<button type="button" data-act="lancar" data-id="${id}">Lançar em contas a pagar</button>` : ""}
      <button type="button" data-act="xml" data-id="${id}">Baixar XML</button>
      ${podeExcluir ? `<button type="button" data-act="excluir" data-id="${id}" class="danger">Excluir</button>` : ""}
    `;
    menu.style.display = "block";
    const rect = e.currentTarget.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 220)}px`;
    menu.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        const act = b.dataset.act;
        const nid = b.dataset.id;
        fecharMenu();
        if (act === "detalhe") abrirDetalhe(nid);
        else if (act === "lancar") lancarCp(nid);
        else if (act === "xml") baixarXml(nid);
        else if (act === "excluir") excluirNota(nid);
      });
    });
  }

  function render() {
    const tbody = el("tbodyNotas");
    if (!tbody) return;
    if (!itens.length) {
      tbody.innerHTML = emptyRow();
      setSelecionado(null);
      return;
    }
    tbody.innerHTML = itens
      .map(
        (n) => `<tr data-id="${n.id}" class="${n.id === selecionadoId ? "fin-row-selected" : ""}">
        <td><input type="checkbox" class="chk-nota" value="${n.id}" ${n.id === selecionadoId ? "checked" : ""}></td>
        <td><button type="button" class="fin-link-num" data-open="${n.id}">${n.numero_nota || n.numero || "—"}</button></td>
        <td>${n.data_entrada_fmt || n.data_entrada || "—"}</td>
        <td><b>${n.nome_fornecedor || "—"}</b></td>
        <td>${badgeSituacao(n.situacao)}</td>
        <td class="fin-valor">${n.valor_total_fmt}</td>
        <td>${badgeVinculacao(n.vinculacao)}</td>
        <td class="fin-acoes">
          <button type="button" class="fin-btn-menu" data-menu="${n.id}" title="Ações">⋮</button>
        </td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll(".chk-nota").forEach((chk) => {
      chk.addEventListener("change", () => {
        document.querySelectorAll(".chk-nota").forEach((c) => {
          if (c !== chk) c.checked = false;
        });
        setSelecionado(chk.checked ? chk.value : null);
      });
    });
    tbody.querySelectorAll("[data-open]").forEach((b) =>
      b.addEventListener("click", () => abrirDetalhe(b.dataset.open))
    );
    tbody.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.addEventListener("click", (ev) => {
        if (ev.target.closest("input, button, a")) return;
        setSelecionado(tr.dataset.id);
        const chk = tr.querySelector(".chk-nota");
        if (chk) {
          document.querySelectorAll(".chk-nota").forEach((c) => (c.checked = c === chk));
          chk.checked = true;
        }
      });
    });
    tbody.querySelectorAll("[data-menu]").forEach((b) =>
      b.addEventListener("click", (ev) => {
        setSelecionado(b.dataset.menu);
        abrirMenu(ev, b.dataset.menu);
      })
    );
    atualizarBotoesSidebar();
  }

  async function carregarLista() {
    const j = await S.apiJson(montarQuery());
    itens = j.itens || [];
    S.atualizarPainel(j.painel);
    render();
  }

  function abrirModal(id) {
    const m = el(id);
    if (m) {
      m.classList.add("open");
      m.setAttribute("aria-hidden", "false");
    }
  }

  function fecharModal(id) {
    const m = el(id);
    if (m) {
      m.classList.remove("open");
      m.setAttribute("aria-hidden", "true");
    }
  }

  function campoDet(label, val) {
    return `<div class="fin-det-item"><label>${label}</label><span>${val || "—"}</span></div>`;
  }

  async function abrirDetalhe(id) {
    if (!id) return;
    setSelecionado(id);
    const j = await S.apiJson(`${API}/${id}`);
    detalheAtual = j.item;
    const n = detalheAtual;
    el("detTitulo").textContent = `NF-e ${n.numero || ""} — ${n.nome_fornecedor || ""}`;
    el("detNota").innerHTML = [
      campoDet("Número / Série", n.numero_nota),
      campoDet("Chave de acesso", n.chave_acesso),
      campoDet("Data emissão", n.data_emissao_fmt || n.data_emissao),
      campoDet("Data entrada", n.data_entrada_fmt || n.data_entrada),
      campoDet("Loja / unidade", n.loja_unidade),
      campoDet("Valor total", n.valor_total_fmt),
      campoDet("Impostos", n.valor_impostos_fmt),
      campoDet("Situação", n.situacao_label),
      campoDet("Vinculação", n.vinculacao_label),
      campoDet("Forma pagamento", n.forma_pagamento),
      campoDet("CNPJ fornecedor", n.cnpj_fornecedor),
      campoDet("Fornecedor", n.nome_fornecedor),
      campoDet("Endereço", n.endereco_fornecedor),
      campoDet("UF", n.uf),
    ].join("");

    const tbIt = el("detItens");
    tbIt.innerHTML = (n.itens || [])
      .map(
        (it) => `<tr>
        <td>${it.sequencia || ""}</td>
        <td>${it.descricao || "—"}</td>
        <td>${it.quantidade ?? "—"} ${it.unidade || ""}</td>
        <td class="fin-valor">${it.valor_total_fmt || it.valor_total}</td>
      </tr>`
      )
      .join("") || '<tr><td colspan="4" class="fin-empty">Sem itens</td></tr>';

    const tbPar = el("detParcelas");
    tbPar.innerHTML = (n.parcelas || [])
      .map(
        (p) => `<tr>
        <td>${p.numero_parcela || "—"}</td>
        <td>${p.vencimento_fmt || p.vencimento || "—"}</td>
        <td class="fin-valor">${p.valor_fmt || p.valor}</td>
      </tr>`
      )
      .join("") || '<tr><td colspan="3" class="fin-empty">Sem parcelas</td></tr>';

    const cp = n.contas_pagar_vinculadas || [];
    el("detCp").innerHTML = cp.length
      ? `<ul class="fin-cp-list">${cp
          .map(
            (c) =>
              `<li><a href="/financeiro/contas-a-pagar" target="_blank">${c.fornecedor || "Conta"}</a> — ${c.valor_fmt} <span class="fin-status ${c.status}">${c.status}</span></li>`
          )
          .join("")}</ul>`
      : '<p class="muted">Nenhuma conta a pagar vinculada.</p>';

    const xmlPre = el("detXml");
    if (n.xml_conteudo) {
      xmlPre.textContent = n.xml_conteudo.length > 80000 ? n.xml_conteudo.slice(0, 80000) + "\n\n… (truncado)" : n.xml_conteudo;
    } else {
      xmlPre.textContent = "XML não armazenado em texto. Use Baixar XML.";
    }

    const btnXml = el("btnBaixarXmlDet");
    if (btnXml) {
      btnXml.style.display = n.tem_xml ? "inline-flex" : "none";
      btnXml.href = `${API}/${id}/xml`;
    }

    const podeLancar = n.vinculacao !== "lancado_contas_pagar" && n.situacao !== "cancelada";
    el("btnLancarDet").style.display = podeLancar ? "inline-flex" : "none";
    el("btnExcluirDet").style.display = n.vinculacao !== "lancado_contas_pagar" ? "inline-flex" : "none";

    const root = el("modalDetalhe");
    root.querySelectorAll("[data-nf-tab]").forEach((b, i) => b.classList.toggle("active", i === 0));
    root.querySelectorAll("[data-nf-panel]").forEach((p, i) => p.classList.toggle("active", i === 0));

    abrirModal("modalDetalhe");
  }

  async function lancarCp(id) {
    if (!id) return;
    try {
      const j = await S.apiJson(`${API}/${id}/lancar-contas-pagar`, { method: "POST" });
      S.toast("Lançado em Contas a Pagar.");
      if (j.painel) S.atualizarPainel(j.painel);
      await carregarLista();
      if (detalheAtual && detalheAtual.id === id) await abrirDetalhe(id);
    } catch (err) {
      S.toast(err.message || "Erro ao lançar");
    }
  }

  function baixarXml(id) {
    window.open(`${API}/${id}/xml`, "_blank");
  }

  async function excluirNota(id) {
    if (!id || !confirm("Excluir esta nota fiscal de entrada?")) return;
    try {
      await S.apiJson(`${API}/${id}`, { method: "DELETE" });
      S.toast("Nota excluída.");
      fecharModal("modalDetalhe");
      selecionadoId = null;
      await carregarLista();
    } catch (err) {
      S.toast(err.message || "Erro ao excluir");
    }
  }

  function initImportModal() {
    const drop = el("dropzone");
    const input = el("imp_arquivo");
    const nome = el("imp_nome_arquivo");
    let arquivo = null;

    function setFile(file) {
      if (!file) return;
      const n = (file.name || "").toLowerCase();
      if (!n.endsWith(".xml")) {
        S.toast("Selecione um arquivo .xml");
        return;
      }
      arquivo = file;
      if (nome) nome.textContent = file.name;
      drop?.classList.add("has-file");
    }

    drop?.addEventListener("click", () => input?.click());
    drop?.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("dragover");
    });
    drop?.addEventListener("dragleave", () => drop.classList.remove("dragover"));
    drop?.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("dragover");
      const f = e.dataTransfer?.files?.[0];
      if (f) setFile(f);
    });
    input?.addEventListener("change", () => {
      if (input.files?.[0]) setFile(input.files[0]);
    });

    el("btnImportarXml")?.addEventListener("click", () => {
      arquivo = null;
      if (input) input.value = "";
      if (nome) nome.textContent = "";
      drop?.classList.remove("has-file");
      S.mostrarErro(el("importErro"), "");
      abrirModal("modalImport");
    });

    el("btnFecharImport")?.addEventListener("click", () => fecharModal("modalImport"));

    el("btnEnviarImport")?.addEventListener("click", async () => {
      if (!arquivo) {
        S.mostrarErro(el("importErro"), "Selecione o arquivo XML da NF-e.");
        return;
      }
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      fd.append("loja_unidade", el("imp_loja")?.value || "");
      if (el("imp_lancar_cp")?.checked) fd.append("lancar_contas_pagar", "1");

      el("btnEnviarImport").disabled = true;
      S.mostrarErro(el("importErro"), "");
      try {
        const j = await S.apiJson(`${API}/importar-xml`, { method: "POST", body: fd });
        S.toast(j.mensagem || "NF-e importada.");
        if (j.painel) S.atualizarPainel(j.painel);
        fecharModal("modalImport");
        await carregarLista();
        if (j.item?.id) {
          setSelecionado(j.item.id);
          abrirDetalhe(j.item.id);
        }
      } catch (err) {
        S.mostrarErro(el("importErro"), err.message);
      } finally {
        el("btnEnviarImport").disabled = false;
      }
    });
  }

  function bindEvents() {
    el("btnFiltrar")?.addEventListener("click", () => carregarLista().catch((e) => S.toast(e.message)));
    el("btnLimpar")?.addEventListener("click", () => {
      ["ff_produto", "ff_lote", "ff_uf", "ff_busca", "ff_data_ini", "ff_data_fim"].forEach((id) => {
        const e = el(id);
        if (e) e.value = "";
      });
      document.querySelectorAll(".fin-pills").forEach((g) => {
        g.querySelectorAll(".fin-pill").forEach((p, i) => p.classList.toggle("active", i === 0));
      });
      carregarLista().catch((err) => S.toast(err.message));
    });

    el("chkTodos")?.addEventListener("change", (ev) => {
      const on = ev.target.checked;
      document.querySelectorAll(".chk-nota").forEach((c) => (c.checked = on));
      if (on && itens[0]) setSelecionado(itens[0].id);
      else if (!on) setSelecionado(null);
    });

    el("btnLancarSel")?.addEventListener("click", () => lancarCp(selecionadoId));
    el("btnVerDetalhe")?.addEventListener("click", () => abrirDetalhe(selecionadoId));
    el("btnFecharDet")?.addEventListener("click", () => fecharModal("modalDetalhe"));
    el("btnLancarDet")?.addEventListener("click", () => lancarCp(detalheAtual?.id));
    el("btnExcluirDet")?.addEventListener("click", () => excluirNota(detalheAtual?.id));

    document.addEventListener("click", fecharMenu);
    el("modalImport")?.addEventListener("click", (e) => {
      if (e.target === el("modalImport")) fecharModal("modalImport");
    });
    el("modalDetalhe")?.addEventListener("click", (e) => {
      if (e.target === el("modalDetalhe")) fecharModal("modalDetalhe");
    });
  }

  initPills();
  initTabsDetalhe();
  initImportModal();
  bindEvents();
  carregarLista().catch((e) => S.toast(e.message));
})();
