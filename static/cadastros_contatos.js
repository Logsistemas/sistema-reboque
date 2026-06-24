(function () {
  const body = document.body;
  const modo = body.dataset.modo || "cliente";
  const filtroCliente = body.dataset.filtroCliente === "1";
  const filtroFornecedor = body.dataset.filtroFornecedor === "1";
  const API = "/api/cadastros/contatos";
  let itens = [];
  let itemAtual = null;
  const modal = document.getElementById("modalContato");
  const tbody = document.getElementById("tbodyContatos");
  const erro = document.getElementById("cadErroContato");

  function el(id) {
    return document.getElementById(id);
  }

  function queryLista() {
    const q = new URLSearchParams();
    if (filtroCliente) q.set("cliente", "1");
    if (filtroFornecedor) q.set("fornecedor", "1");
    return `${API}?${q.toString()}`;
  }

  function atualizarKpis(k) {
    if (!k) return;
    const m = { kpiCTotal: "total", kpiCAtivos: "ativos", kpiCNovos: "novos_mes" };
    Object.entries(m).forEach(([id, key]) => {
      const node = el(id);
      if (node) node.textContent = String(k[key] ?? 0);
    });
  }

  function classificacaoLabel(i) {
    const p = [];
    if (i.cliente) p.push("Cliente");
    if (i.fornecedor) p.push("Fornecedor");
    return p.join(" + ") || "—";
  }

  function statusHtml(st) {
    const s = (st || "ativo").toLowerCase();
    return `<span class="fin-status ${s === "ativo" ? "recebido" : "cancelado"}">${s === "ativo" ? "Ativo" : "Inativo"}</span>`;
  }

  function filtrados() {
    const nome = (el("filtroNome")?.value || "").toLowerCase();
    const doc = (el("filtroDoc")?.value || "").replace(/\D/g, "");
    const cidade = (el("filtroCidade")?.value || "").toLowerCase();
    const st = el("filtroStatus")?.value || "";
    return itens.filter((i) => {
      const txt = `${i.nome_exibicao} ${i.razao_social || ""} ${i.nome_fantasia || ""} ${i.nome || ""}`.toLowerCase();
      if (nome && !txt.includes(nome)) return false;
      const d = (i.documento || "").replace(/\D/g, "");
      if (doc && !d.includes(doc)) return false;
      if (cidade && !(i.cidade || "").toLowerCase().includes(cidade)) return false;
      if (st && i.status !== st) return false;
      return true;
    });
  }

  function render() {
    const rows = filtrados();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">Nenhum contato encontrado.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (i) => `<tr>
        <td><b>${i.nome_exibicao}</b></td>
        <td>${i.documento || "-"}</td>
        <td>${i.cidade || "-"}</td>
        <td>${classificacaoLabel(i)}</td>
        <td>${statusHtml(i.status)}</td>
        <td><button type="button" class="ctrl-btn ctrl-btn-outline btn-edit-c" data-id="${i.id}">Editar</button></td>
      </tr>`
      )
      .join("");
    tbody.querySelectorAll(".btn-edit-c").forEach((b) =>
      b.addEventListener("click", () => abrirPorId(b.dataset.id))
    );
  }

  async function carregar() {
    const j = await fetch(queryLista()).then((r) => r.json());
    if (!j.ok) throw new Error(j.erro || "Erro ao carregar");
    itens = j.itens || [];
    atualizarKpis(j.kpis);
    render();
  }

  window.__cadRecarregarContatos = carregar;
  window.__cadAtualizarKpis = atualizarKpis;

  function toggleTipoPessoa() {
    const tp = document.querySelector('input[name="c_tipo_pessoa"]:checked')?.value || "juridica";
    el("blocoPF").style.display = tp === "fisica" ? "grid" : "none";
    el("blocoPJ").style.display = tp === "juridica" ? "grid" : "none";
  }

  function toggleComercial() {
    el("blocoComercialCliente").style.display = el("c_cliente").checked ? "block" : "none";
    el("blocoComercialFornecedor").style.display = el("c_fornecedor").checked ? "block" : "none";
  }

  function initTabs() {
    modal.querySelectorAll("[data-cad-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-cad-tab");
        modal.querySelectorAll("[data-cad-tab]").forEach((b) => b.classList.toggle("active", b === btn));
        modal.querySelectorAll("[data-cad-panel]").forEach((p) =>
          p.classList.toggle("active", p.getAttribute("data-cad-panel") === tab)
        );
      });
    });
  }

  function preencherForm(item) {
    const st = item?.status || "ativo";
    document.querySelectorAll('input[name="c_status"]').forEach((r) => {
      r.checked = r.value === st;
    });
    const tp = item?.tipo_pessoa || "juridica";
    document.querySelectorAll('input[name="c_tipo_pessoa"]').forEach((r) => {
      r.checked = r.value === tp;
    });
    toggleTipoPessoa();
    el("c_nome").value = item?.nome || "";
    el("c_cpf").value = item?.cpf || "";
    el("c_rg").value = item?.rg || "";
    el("c_data_nascimento").value = item?.data_nascimento?.slice?.(0, 10) || item?.data_nascimento || "";
    el("c_razao_social").value = item?.razao_social || "";
    el("c_nome_fantasia").value = item?.nome_fantasia || "";
    el("c_cnpj").value = item?.cnpj || "";
    el("c_inscricao_estadual").value = item?.inscricao_estadual || "";
    el("c_contribuinte_icms").value = item?.contribuinte_icms || "";
    el("c_cliente").checked = item ? !!item.cliente : filtroCliente;
    el("c_fornecedor").checked = item ? !!item.fornecedor : filtroFornecedor;
    toggleComercial();
    el("c_cep").value = item?.cep || "";
    el("c_uf").value = item?.uf || "";
    el("c_cidade").value = item?.cidade || "";
    el("c_bairro").value = item?.bairro || "";
    el("c_logradouro").value = item?.logradouro || "";
    el("c_numero").value = item?.numero || "";
    el("c_complemento").value = item?.complemento || "";
    el("c_email").value = item?.email || "";
    el("c_email_financeiro").value = item?.email_financeiro || "";
    el("c_celular").value = item?.celular || "";
    el("c_telefone").value = item?.telefone || "";
    el("c_limite_credito").value = item?.limite_credito ?? 0;
    el("c_prazo_recebimento").value = item?.prazo_recebimento || "";
    el("c_obs_comercial_cliente").value = item?.observacoes_comercial_cliente || "";
    el("c_prazo_pagamento").value = item?.prazo_pagamento || "";
    el("c_categoria_fornecedor").value = item?.categoria_fornecedor || "";
    el("c_obs_comercial_fornecedor").value = item?.observacoes_comercial_fornecedor || "";
    el("c_observacoes").value = item?.observacoes || "";
    renderArquivos(item?.arquivos || []);
  }

  function renderArquivos(arquivos) {
    const tb = el("tbodyArquivosContato");
    if (!tb) return;
    if (!arquivos.length) {
      tb.innerHTML = '<tr><td colspan="5" class="muted">Sem anexos.</td></tr>';
      return;
    }
    tb.innerHTML = arquivos
      .map(
        (a) => `<tr>
        <td>${a.created_at_fmt || "-"}</td>
        <td>${a.tipo || "-"}</td>
        <td>${a.nome_arquivo || "-"}</td>
        <td><a href="${a.caminho_arquivo}" target="_blank" rel="noopener">Download</a></td>
        <td><button type="button" class="ctrl-btn ctrl-btn-outline btn-del-arq" data-aid="${a.id}">Excluir</button></td>
      </tr>`
      )
      .join("");
    tb.querySelectorAll(".btn-del-arq").forEach((b) =>
      b.addEventListener("click", () => excluirArquivo(b.dataset.aid))
    );
  }

  async function abrirPorId(id) {
    const j = await fetch(`${API}/${id}`).then((r) => r.json());
    if (!j.ok) return alert(j.erro || "Erro");
    abrir(j.item);
  }

  function abrir(item) {
    itemAtual = item;
    modal.classList.add("open");
    erro.style.display = "none";
    el("contatoId").value = item?.id || "";
    el("modalContatoTitulo").textContent = item ? item.nome_exibicao : "Novo contato";
    el("btnExcluirContato").style.display = item?.id ? "inline-block" : "none";
    preencherForm(item || {});
    initTabs();
    if (window.__cadCarregarTabelaValores && item?.id) {
      window.__cadCarregarTabelaValores(item.id);
    }
  }

  function payload() {
    return {
      id: el("contatoId").value,
      status: document.querySelector('input[name="c_status"]:checked')?.value || "ativo",
      tipo_pessoa: document.querySelector('input[name="c_tipo_pessoa"]:checked')?.value || "juridica",
      nome: el("c_nome").value,
      cpf: el("c_cpf").value,
      rg: el("c_rg").value,
      data_nascimento: el("c_data_nascimento").value,
      razao_social: el("c_razao_social").value,
      nome_fantasia: el("c_nome_fantasia").value,
      cnpj: el("c_cnpj").value,
      inscricao_estadual: el("c_inscricao_estadual").value,
      contribuinte_icms: el("c_contribuinte_icms").value,
      cliente: el("c_cliente").checked,
      fornecedor: el("c_fornecedor").checked,
      cep: el("c_cep").value,
      uf: el("c_uf").value,
      cidade: el("c_cidade").value,
      bairro: el("c_bairro").value,
      logradouro: el("c_logradouro").value,
      numero: el("c_numero").value,
      complemento: el("c_complemento").value,
      email: el("c_email").value,
      email_financeiro: el("c_email_financeiro").value,
      celular: el("c_celular").value,
      telefone: el("c_telefone").value,
      limite_credito: el("c_limite_credito").value,
      prazo_recebimento: el("c_prazo_recebimento").value,
      observacoes_comercial_cliente: el("c_obs_comercial_cliente").value,
      prazo_pagamento: el("c_prazo_pagamento").value,
      categoria_fornecedor: el("c_categoria_fornecedor").value,
      observacoes_comercial_fornecedor: el("c_obs_comercial_fornecedor").value,
      observacoes: el("c_observacoes").value,
      filtro_cliente: filtroCliente,
      filtro_fornecedor: filtroFornecedor,
    };
  }

  async function salvar() {
    const id = el("contatoId").value;
    const url = id ? `${API}/${id}` : API;
    const method = id ? "PUT" : "POST";
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro ao salvar");
      atualizarKpis(j.kpis);
      await carregar();
      if (j.item) {
        el("contatoId").value = j.item.id;
        el("btnExcluirContato").style.display = "inline-block";
        const det = await fetch(`${API}/${j.item.id}`).then((x) => x.json());
        if (det.item) preencherForm(det.item);
        if (window.__cadCarregarTabelaValores) window.__cadCarregarTabelaValores(j.item.id);
      }
    } catch (e) {
      erro.textContent = e.message;
      erro.style.display = "block";
    }
  }

  async function excluir() {
    const id = el("contatoId").value;
    if (!id || !confirm("Excluir este contato?")) return;
    const q = new URLSearchParams();
    if (filtroCliente) q.set("cliente", "1");
    if (filtroFornecedor) q.set("fornecedor", "1");
    const j = await fetch(`${API}/${id}?${q}`, { method: "DELETE" }).then((r) => r.json());
    if (!j.ok) return alert(j.erro || "Erro");
    modal.classList.remove("open");
    atualizarKpis(j.kpis);
    await carregar();
  }

  async function excluirArquivo(aid) {
    const id = el("contatoId").value;
    if (!id || !confirm("Excluir anexo?")) return;
    const j = await fetch(`${API}/${id}/arquivos/${aid}`, { method: "DELETE" }).then((r) => r.json());
    if (j.ok) renderArquivos(j.itens || []);
  }

  async function buscarCep() {
    const cep = (el("c_cep").value || "").replace(/\D/g, "");
    if (cep.length !== 8) {
      alert("Informe um CEP válido com 8 dígitos.");
      return;
    }
    try {
      const data = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((r) => r.json());
      if (data.erro) throw new Error("CEP não encontrado");
      el("c_logradouro").value = data.logradouro || "";
      el("c_bairro").value = data.bairro || "";
      el("c_cidade").value = data.localidade || "";
      el("c_uf").value = data.uf || "";
    } catch (e) {
      alert(e.message || "Não foi possível buscar o CEP.");
    }
  }

  el("btnNovoContato")?.addEventListener("click", () => abrir(null));
  el("btnFecharContato")?.addEventListener("click", () => modal.classList.remove("open"));
  el("btnSalvarContato")?.addEventListener("click", salvar);
  el("btnExcluirContato")?.addEventListener("click", excluir);
  el("btnBuscarCep")?.addEventListener("click", buscarCep);
  el("btnToggleUploadContato")?.addEventListener("click", () => {
    const p = el("formArquivoContato");
    p.style.display = p.style.display === "none" ? "block" : "none";
  });
  document.querySelectorAll('input[name="c_tipo_pessoa"]').forEach((r) =>
    r.addEventListener("change", toggleTipoPessoa)
  );
  el("c_cliente")?.addEventListener("change", toggleComercial);
  el("c_fornecedor")?.addEventListener("change", toggleComercial);
  ["filtroNome", "filtroDoc", "filtroCidade", "filtroStatus"].forEach((id) =>
    el(id)?.addEventListener("input", render)
  );
  el("btnLimparFiltrosC")?.addEventListener("click", () => {
    ["filtroNome", "filtroDoc", "filtroCidade"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    if (el("filtroStatus")) el("filtroStatus").value = "";
    render();
  });
  el("formArquivoContato")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const id = el("contatoId").value;
    if (!id) {
      erro.textContent = "Salve o contato antes de anexar arquivos.";
      erro.style.display = "block";
      return;
    }
    const fd = new FormData(ev.target);
    const j = await fetch(`${API}/${id}/arquivos`, { method: "POST", body: fd }).then((r) => r.json());
    if (!j.ok) return alert(j.erro || "Erro no upload");
    renderArquivos(j.itens || []);
    ev.target.reset();
    el("formArquivoContato").style.display = "none";
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });

  toggleTipoPessoa();
  toggleComercial();
  carregar().catch((e) => alert(e.message));
})();
