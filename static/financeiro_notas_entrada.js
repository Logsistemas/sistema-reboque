(function () {
  const API = "/api/financeiro/notas-entrada";
  const S = window.FinShared;
  let itens = [];
  let contasFin = [];
  let selecionadoId = null;
  let detalheAtual = null;
  let lancarNotaId = null;
  /** Arquivo XML escolhido por clique ou drag-and-drop */
  let selectedXmlFile = null;
  window.selectedXmlFile = null;

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
        else if (act === "lancar") abrirModalLancar(nid);
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

  function preencherSelectContas(sel, valor) {
    if (!sel) return;
    const v = valor || "";
    sel.innerHTML = '<option value="">— Sem banco definido (baixa depois) —</option>';
    contasFin.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = `${c.nome}${c.saldo_atual_fmt ? " (" + c.saldo_atual_fmt + ")" : ""}`;
      if (String(c.id) === String(v)) o.selected = true;
      sel.appendChild(o);
    });
  }

  async function carregarLista(flashId) {
    const j = await S.apiJson(montarQuery());
    itens = j.itens || [];
    contasFin = j.contas || contasFin;
    S.atualizarPainel(j.painel);
    preencherSelectContas(el("lancar_conta_fin"));
    preencherSelectContas(el("imp_conta_fin"));
    render();
    if (flashId) {
      const tr = document.querySelector(`#tbodyNotas tr[data-id="${flashId}"]`);
      if (tr) {
        tr.classList.add("fin-success-flash");
        setTimeout(() => tr.classList.remove("fin-success-flash"), 1400);
      }
    }
  }

  let ativarDnDImport = function () {};
  let desativarDnDImport = function () {};

  function abrirModal(id) {
    const m = el(id);
    if (!m) return;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
  }

  function fecharModal(id) {
    const m = el(id);
    if (!m) return;
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    if (id === "modalImport") document.body.classList.remove("nf-modal-open");
  }

  function abrirModalImport() {
    console.log("[NF-e] Abrindo modal de importação XML");
    const m = el("modalImport");
    if (!m) {
      console.error("[NF-e] Elemento #modalImport não encontrado");
      S.toast("Erro: modal de importação não encontrado.");
      return;
    }
    abrirModal("modalImport");
    document.body.classList.add("nf-modal-open");
    ativarDnDImport();
    console.log("[NF-e] Modal aberto com sucesso");
  }

  function fecharModalImport() {
    desativarDnDImport();
    fecharModal("modalImport");
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
        <td>${it.ncm || "—"}</td>
        <td>${it.cfop || "—"}</td>
        <td>${it.quantidade ?? "—"} ${it.unidade || ""}</td>
        <td class="fin-valor">${it.valor_unitario_fmt || it.valor_unitario || "—"}</td>
        <td class="fin-valor">${it.valor_total_fmt || it.valor_total}</td>
      </tr>`
      )
      .join("") || '<tr><td colspan="7" class="fin-empty">Sem itens</td></tr>';

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
      ? `<table class="fin-table fin-hist-table"><thead><tr><th>Fornecedor</th><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>${cp
          .map(
            (c) =>
              `<tr>
                <td>${c.fornecedor || "—"}</td>
                <td>${c.descricao || "—"}</td>
                <td>${c.vencimento_fmt || "—"}</td>
                <td class="fin-valor">${c.valor_fmt || "—"}</td>
                <td><span class="fin-status ${c.status || ""}">${c.status || "—"}</span></td>
              </tr>`
          )
          .join("")}</tbody></table>`
      : '<p class="muted">Nenhuma conta a pagar vinculada. Use &quot;Lançar em contas a pagar&quot; para gerar as parcelas.</p>';

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

  function abrirModalLancar(id) {
    if (!id) return;
    lancarNotaId = id;
    setSelecionado(id);
    S.mostrarErro(el("lancarErro"), "");
    preencherSelectContas(el("lancar_conta_fin"), "");
    abrirModal("modalLancar");
    carregarResumoLancar(id);
  }

  async function carregarResumoLancar(id) {
    const wrap = el("lancarParcelasWrap");
    const tb = el("lancarParcelas");
    const resumo = el("lancarResumo");
    if (wrap) wrap.hidden = true;
    if (tb) tb.innerHTML = "";
    if (resumo) resumo.innerHTML = "Carregando…";
    try {
      const j = await S.apiJson(`${API}/${id}`);
      const n = j.item || {};
      if (resumo) {
        resumo.innerHTML = `<b>${n.nome_fornecedor || "Fornecedor"}</b><br>NF ${n.numero_nota || n.numero} · ${n.valor_total_fmt}`;
      }
      const parcelas = n.parcelas || [];
      if (parcelas.length && wrap && tb) {
        wrap.hidden = false;
        tb.innerHTML = parcelas
          .map(
            (p) => `<tr>
              <td>${p.numero_parcela || "—"}</td>
              <td>${p.vencimento_fmt || p.vencimento || "—"}</td>
              <td class="fin-valor">${p.valor_fmt || p.valor}</td>
            </tr>`
          )
          .join("");
      } else if (wrap) {
        wrap.hidden = true;
      }
    } catch (err) {
      const nota = itens.find((i) => i.id === id) || detalheAtual;
      if (resumo && nota) {
        resumo.innerHTML = `<b>${nota.nome_fornecedor || "Fornecedor"}</b><br>NF ${nota.numero_nota || nota.numero} · ${nota.valor_total_fmt}`;
      }
      S.mostrarErro(el("lancarErro"), err.message || "Não foi possível carregar as parcelas.");
    }
  }

  async function executarLancarCp(id, contaFinanceiraId) {
    if (!id) return;
    try {
      const body = {};
      if (contaFinanceiraId) body.conta_financeira_id = contaFinanceiraId;
      const j = await S.apiJson(`${API}/${id}/lancar-contas-pagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      S.toast(j.mensagem || "Lançado em Contas a Pagar.");
      fecharModal("modalLancar");
      if (j.painel) S.atualizarPainel(j.painel);
      await carregarLista(id);
      if (detalheAtual && detalheAtual.id === id) await abrirDetalhe(id);
    } catch (err) {
      S.mostrarErro(el("lancarErro"), err.message);
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

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function isXmlFile(file) {
    if (!file) return false;
    const name = (file.name || "").toLowerCase();
    if (!name.endsWith(".xml")) return false;
    const type = (file.type || "").toLowerCase();
    if (type && !type.includes("xml") && type !== "text/plain" && type !== "application/octet-stream") {
      return false;
    }
    return true;
  }

  function initImportModal() {
    const drop = el("dropzone");
    const uploadCol = el("finImpUploadCol");
    const shell = document.querySelector("#modalImport .fin-modal-import-shell");
    const input = el("imp_arquivo");
    const preview = el("imp_preview");
    const statusOk = el("imp_status_ok");
    const hint = el("imp_drop_hint");
    const btnImport = el("btnEnviarImport");
    const modal = el("modalImport");
    let dragDepth = 0;
    let dndDocBound = false;
    let lastDropAt = 0;

    const CAPTURE = true;
    const DND_EVENTS = ["dragenter", "dragover", "dragleave", "drop"];

    function modalAberto() {
      return !!modal?.classList.contains("open");
    }

    function alvoPermiteDrop(target) {
      if (!modal || !target) return false;
      if (target === modal) return true;
      if (shell && shell.contains(target)) return true;
      if (uploadCol && (target === uploadCol || uploadCol.contains(target))) return true;
      if (drop && (target === drop || drop.contains(target))) return true;
      return false;
    }

    function atualizarBotaoImportar() {
      if (btnImport) btnImport.disabled = !selectedXmlFile;
    }

    function setDragHighlight(on) {
      drop?.classList.toggle("dragover", on);
      uploadCol?.classList.toggle("dragover", on);
    }

    function syncInputFile(file) {
      if (!input || !file) return;
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
      } catch (_) {
        /* selectedXmlFile é a fonte principal */
      }
    }

    function limparArquivo(mostrarErro) {
      selectedXmlFile = null;
      window.selectedXmlFile = null;
      dragDepth = 0;
      if (input) input.value = "";
      drop?.classList.remove("has-file", "dragover");
      uploadCol?.classList.remove("dragover");
      if (preview) preview.hidden = true;
      if (statusOk) statusOk.hidden = true;
      if (hint) hint.classList.remove("is-hidden");
      atualizarBotaoImportar();
      if (mostrarErro) S.mostrarErro(el("importErro"), "");
    }

    function aplicarArquivo(file) {
      if (!file) return;
      const nome = (file.name || "").toLowerCase();
      if (!nome.endsWith(".xml")) {
        S.mostrarErro(el("importErro"), "Envie apenas arquivos com extensão .xml (NF-e).");
        S.toast("Selecione um arquivo .xml válido.");
        limparArquivo(false);
        return;
      }
      selectedXmlFile = file;
      window.selectedXmlFile = file;
      syncInputFile(file);
      S.mostrarErro(el("importErro"), "");
      drop?.classList.add("has-file");
      setDragHighlight(false);

      const nomeEl = el("imp_nome_arquivo");
      const tamEl = el("imp_arquivo_tamanho");
      const tipoEl = el("imp_arquivo_tipo");
      if (nomeEl) nomeEl.textContent = file.name;
      if (tamEl) tamEl.textContent = formatFileSize(file.size);
      if (tipoEl) tipoEl.textContent = file.type || "application/xml";
      if (preview) preview.hidden = false;
      if (statusOk) statusOk.hidden = false;
      if (hint) hint.classList.add("is-hidden");
      atualizarBotaoImportar();
      S.toast("XML selecionado com sucesso.");
    }

    function onDragOver(e) {
      if (!modalAberto()) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      if (alvoPermiteDrop(e.target)) setDragHighlight(true);
    }

    function onDragEnter(e) {
      if (!modalAberto()) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      if (!alvoPermiteDrop(e.target)) return;
      dragDepth += 1;
      setDragHighlight(true);
    }

    function onDragLeave(e) {
      if (!modalAberto()) return;
      e.preventDefault();
      e.stopPropagation();
      if (!alvoPermiteDrop(e.target)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragHighlight(false);
    }

    function onDrop(e) {
      if (!modalAberto()) return;
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastDropAt < 80) return;
      lastDropAt = now;

      if (!alvoPermiteDrop(e.target)) return;

      dragDepth = 0;
      setDragHighlight(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      console.log("drop XML", file.name);
      aplicarArquivo(file);
    }

    function bindDnd(node) {
      if (!node || node.dataset.nfDndBound === "1") return;
      node.dataset.nfDndBound = "1";
      DND_EVENTS.forEach((ev) => {
        const fn =
          ev === "dragenter" ? onDragEnter : ev === "dragleave" ? onDragLeave : ev === "drop" ? onDrop : onDragOver;
        node.addEventListener(ev, fn, false);
      });
    }

    function onDocDragOver(e) {
      if (!modalAberto()) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      if (e.type === "dragover") console.log("dragover XML");
    }

    function onDocDrop(e) {
      if (!modalAberto()) return;
      e.preventDefault();
      e.stopPropagation();
      onDrop(e);
    }

    function ligarDnDDocumento() {
      if (dndDocBound) return;
      dndDocBound = true;
      document.addEventListener("dragenter", onDocDragOver, CAPTURE);
      document.addEventListener("dragover", onDocDragOver, CAPTURE);
      document.addEventListener("drop", onDocDrop, CAPTURE);
    }

    function desligarDnDDocumento() {
      if (!dndDocBound) return;
      dndDocBound = false;
      document.removeEventListener("dragenter", onDocDragOver, CAPTURE);
      document.removeEventListener("dragover", onDocDragOver, CAPTURE);
      document.removeEventListener("drop", onDocDrop, CAPTURE);
    }

    bindDnd(modal);
    bindDnd(shell);
    bindDnd(uploadCol);
    bindDnd(drop);

    ativarDnDImport = ligarDnDDocumento;
    desativarDnDImport = () => {
      desligarDnDDocumento();
      dragDepth = 0;
      setDragHighlight(false);
    };

    ligarDnDDocumento();

    function abrirSeletor() {
      input?.click();
    }

    drop?.addEventListener("click", (e) => {
      if (e.target.closest("#btnLimparArquivo")) return;
      e.preventDefault();
      e.stopPropagation();
      abrirSeletor();
    });
    drop?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrirSeletor();
      }
    });

    input?.addEventListener("change", () => {
      const f = input.files?.[0];
      if (f) aplicarArquivo(f);
      else limparArquivo(false);
    });

    el("btnLimparArquivo")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      limparArquivo(true);
    });

    el("imp_lancar_cp")?.addEventListener("change", () => {
      const on = el("imp_lancar_cp")?.checked;
      const wrap = el("imp_conta_wrap");
      if (wrap) wrap.style.display = on ? "block" : "none";
    });

    const btnImpXml = el("btnImportarXml");
    if (btnImpXml) {
      btnImpXml.dataset.nfBound = "1";
      btnImpXml.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        console.log("[NF-e] Botão Importar XML clicado");
        limparArquivo(true);
        if (el("imp_lancar_cp")) el("imp_lancar_cp").checked = false;
        if (el("imp_conta_wrap")) el("imp_conta_wrap").style.display = "none";
        abrirModalImport();
      });
    } else {
      console.error("[NF-e] Botão #btnImportarXml não encontrado");
    }

    el("btnFecharImport")?.addEventListener("click", () => fecharModalImport());

    el("btnEnviarImport")?.addEventListener("click", async () => {
      const fileSend = selectedXmlFile || input?.files?.[0];
      if (!fileSend) {
        S.mostrarErro(el("importErro"), "Selecione o arquivo XML da NF-e antes de importar.");
        return;
      }
      const fd = new FormData();
      fd.append("arquivo", fileSend, fileSend.name);
      const lojaEl = el("imp_loja");
      fd.append("loja_unidade", lojaEl?.value || lojaEl?.selectedOptions?.[0]?.text || "");
      if (el("imp_lancar_cp")?.checked) {
        fd.append("lancar_contas_pagar", "1");
        const cf = el("imp_conta_fin")?.value;
        if (cf) fd.append("conta_financeira_id", cf);
      }

      btnImport.disabled = true;
      S.mostrarErro(el("importErro"), "");
      try {
        const j = await S.apiJson(`${API}/importar-xml`, { method: "POST", body: fd });
        S.toast(j.mensagem || "NF-e importada com sucesso.");
        if (j.contas) contasFin = j.contas;
        if (j.painel) S.atualizarPainel(j.painel);
        fecharModalImport();
        limparArquivo(false);
        const nid = j.item?.id;
        if (nid) setSelecionado(nid);
        await carregarLista(nid);
      } catch (err) {
        S.mostrarErro(el("importErro"), err.message || "Não foi possível importar o XML.");
      } finally {
        atualizarBotaoImportar();
      }
    });

    atualizarBotaoImportar();
  }

  function bindEvents() {
    document.addEventListener("click", (ev) => {
      const t = ev.target.closest("#btnImportarXml");
      if (!t || t.id !== "btnImportarXml") return;
      if (t.dataset.nfBound === "1") return;
      ev.preventDefault();
      ev.stopPropagation();
      console.log("[NF-e] Importar XML (delegação)");
      const imp = el("imp_lancar_cp");
      if (imp) imp.checked = false;
      if (el("imp_conta_wrap")) el("imp_conta_wrap").style.display = "none";
      abrirModalImport();
    });

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

    el("btnLancarSel")?.addEventListener("click", () => abrirModalLancar(selecionadoId));
    el("btnVerDetalhe")?.addEventListener("click", () => abrirDetalhe(selecionadoId));
    el("btnFecharDet")?.addEventListener("click", () => fecharModal("modalDetalhe"));
    el("btnLancarDet")?.addEventListener("click", () => abrirModalLancar(detalheAtual?.id));
    el("btnFecharLancar")?.addEventListener("click", () => fecharModal("modalLancar"));
    el("btnConfirmarLancar")?.addEventListener("click", () => {
      const cf = el("lancar_conta_fin")?.value || "";
      executarLancarCp(lancarNotaId, cf);
    });
    el("btnExcluirDet")?.addEventListener("click", () => excluirNota(detalheAtual?.id));

    document.addEventListener("click", fecharMenu);
    el("modalImport")?.addEventListener("click", (e) => {
      if (e.target === el("modalImport")) {
        fecharModalImport();
      }
    });
    el("modalDetalhe")?.addEventListener("click", (e) => {
      if (e.target === el("modalDetalhe")) fecharModal("modalDetalhe");
    });
    el("modalLancar")?.addEventListener("click", (e) => {
      if (e.target === el("modalLancar")) fecharModal("modalLancar");
    });
  }

  function boot() {
    if (!window.FinShared) {
      console.error("[NF-e] financeiro_shared.js não carregou (FinShared ausente)");
      return;
    }
    initPills();
    initTabsDetalhe();
    initImportModal();
    bindEvents();
    carregarLista().catch((e) => S.toast(e.message));
    console.log("[NF-e] Módulo Notas Entrada inicializado");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
