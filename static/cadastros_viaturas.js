(function () {
  let itens = [];

  const modal = document.getElementById("modalViatura");
  const tbody = document.getElementById("tbodyViaturas");

  function el(id) {
    return document.getElementById(id);
  }

  function esc(t) {
    return String(t || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function badgeClassificacao(v) {
    const origem = (v.origem || "").toLowerCase();
    const cls = origem === "terceiro" ? "cad-badge-terceiro" : "cad-badge-propria";
    const txt = v.classificacao_original || v.origem_label || (origem === "terceiro" ? "TERCEIRO" : "LOG SOLUÇÕES");
    return `<span class="cad-viatura-badge ${cls}">${esc(txt)}</span>`;
  }

  function badgePersonalizacao(v) {
    if (!v.personalizacao) return '<span class="muted">—</span>';
    return `<span class="cad-viatura-badge cad-badge-personalizada">Personalizada: ${esc(v.personalizacao)}</span>`;
  }

  function atualizarKpis(k) {
    if (!k) return;
    const m = {
      total: "kpiVTotal",
      ativas: "kpiVAtivas",
      inativas: "kpiVInativas",
      com_documentos: "kpiVDocs",
      personalizadas: "kpiVPersonalizadas",
      proprias: "kpiVProprias",
      terceiros: "kpiVTerceiros",
    };
    Object.keys(m).forEach((key) => {
      const node = el(m[key]);
      if (node) node.textContent = String(k[key] ?? 0);
    });
  }

  function atualizarFiltroSeguradoras() {
    const sel = el("filtroSeguradoraV");
    if (!sel) return;
    const atual = sel.value;
    const set = new Set();
    itens.forEach((v) => {
      if (v.personalizacao) set.add(v.personalizacao.trim());
    });
    sel.innerHTML = '<option value="">Todas</option>';
    [...set].sort().forEach((s) => {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = s;
      sel.appendChild(o);
    });
    if (atual && [...set].includes(atual)) sel.value = atual;
  }

  function atualizarBadgeModal(item) {
    const box = el("viaturaBadgePersonalizada");
    if (!box) return;
    if (item?.personalizacao) {
      box.style.display = "block";
      box.textContent = `Personalizada: ${item.personalizacao}`;
    } else {
      box.style.display = "none";
      box.textContent = "";
    }
  }

  function abrirModal(item) {
    modal.classList.add("open");
    el("cadErroViatura").style.display = "none";
    const id = item?.id || "";
    el("viaturaId").value = id;
    el("modalViaturaTitulo").textContent = id
      ? `Viatura — ${item.nome_exibicao || item.exibicao || item.placa}`
      : "Nova viatura";
    el("btnExcluirViatura").style.display = id ? "" : "none";

    const fields = [
      "placa", "marca", "modelo", "renavam", "chassi", "ano_fabricacao", "ano_modelo",
      "combustivel", "capacidade_litros", "cor", "estado_placa", "tipo_viatura", "observacoes",
      "cpf_cnpj_crlv", "exibicao", "telefone", "personalizacao", "consumo_km_l", "hodometro",
      "classificacao_original",
    ];
    fields.forEach((f) => {
      const inp = el("v_" + f);
      if (inp) inp.value = item?.[f] ?? "";
    });
    if (!el("v_exibicao")?.value && item) {
      el("v_exibicao").value = item.nome_exibicao || item.exibicao || "";
    }
    el("v_origem").value = item?.origem || (item?.terceiro ? "terceiro" : "propria");
    el("v_status").value = item?.status || "ativo";
    el("v_terceiro").value = item?.terceiro ? "true" : "false";
    el("v_status_toggle").checked = (item?.status || "ativo") === "ativo";
    atualizarBadgeModal(item);
    ativarTab("editar");
    renderArquivos(item?.arquivos || []);
  }

  function fecharModal() {
    modal.classList.remove("open");
  }

  function ativarTab(tab) {
    document.querySelectorAll("#modalViatura .cad-nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.cadTab === tab);
    });
    document.querySelectorAll("#modalViatura .cad-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.cadPanel === tab);
    });
  }

  function coletarPayload() {
    const payload = { id: el("viaturaId").value || undefined };
    [
      "placa", "marca", "modelo", "renavam", "chassi", "ano_fabricacao", "ano_modelo",
      "combustivel", "cor", "estado_placa", "tipo_viatura", "observacoes",
      "cpf_cnpj_crlv", "exibicao", "telefone", "personalizacao", "classificacao_original",
    ].forEach((f) => {
      payload[f] = el("v_" + f)?.value?.trim() || "";
    });
    payload.nome_exibicao = payload.exibicao;
    payload.capacidade_litros = el("v_capacidade_litros")?.value || "";
    payload.consumo_km_l = el("v_consumo_km_l")?.value || "";
    payload.hodometro = el("v_hodometro")?.value || "";
    payload.origem = el("v_origem")?.value || "propria";
    payload.terceiro = payload.origem === "terceiro";
    payload.status = el("v_status_toggle").checked ? "ativo" : "inativo";
    if (!payload.exibicao) throw new Error("Exibição é obrigatória.");
    if (!payload.placa) throw new Error("Placa é obrigatória.");
    return payload;
  }

  function renderTabela() {
    const busca = (el("filtroBuscaV")?.value || "").toLowerCase();
    const status = (el("filtroStatusV")?.value || "").toLowerCase();
    const classificacao = (el("filtroClassificacaoV")?.value || "").toLowerCase();
    const persFiltro = el("filtroPersonalizacaoV")?.value || "";
    const seguradora = el("filtroSeguradoraV")?.value || "";
    tbody.innerHTML = "";
    let count = 0;
    itens.forEach((v) => {
      const txt = `${v.nome_exibicao || v.exibicao} ${v.placa} ${v.marca} ${v.modelo} ${v.personalizacao || ""} ${v.classificacao_original || ""}`.toLowerCase();
      if (busca && !txt.includes(busca)) return;
      if (status && (v.status || "").toLowerCase() !== status) return;
      if (classificacao && (v.origem || "").toLowerCase() !== classificacao) return;
      if (persFiltro === "com" && !v.personalizacao) return;
      if (persFiltro === "sem" && v.personalizacao) return;
      if (seguradora && (v.personalizacao || "") !== seguradora) return;
      count += 1;
      const tr = document.createElement("tr");
      if (v.personalizada) tr.classList.add("cad-row-personalizada");
      tr.innerHTML = `
        <td><strong>${esc(v.nome_exibicao || v.exibicao || "-")}</strong></td>
        <td>${esc(v.placa || "-")}</td>
        <td>${esc(v.marca || "-")}</td>
        <td>${esc(v.modelo || "-")}</td>
        <td>${esc(v.ano_fabricacao || "-")}</td>
        <td>${esc(v.ano_modelo || "-")}</td>
        <td>${badgeClassificacao(v)}</td>
        <td>${badgePersonalizacao(v)}</td>
        <td><span class="ctrl-pill ${v.status === "ativo" ? "" : "off"}">${esc(v.status)}</span></td>
        <td><button type="button" class="ctrl-btn ctrl-btn-outline" data-edit="${v.id}">Editar</button></td>`;
      tbody.appendChild(tr);
    });
    if (!count) {
      tbody.innerHTML = '<tr><td colspan="10" class="cad-empty-box">Nenhuma viatura encontrada.</td></tr>';
    }
    tbody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => carregarItem(btn.dataset.edit));
    });
  }

  function renderArquivos(arquivos) {
    const box = el("listaArquivosViatura");
    if (!box) return;
    if (!arquivos?.length) {
      box.innerHTML = '<p class="cad-empty-box">Nenhum arquivo anexado.</p>';
      return;
    }
    box.innerHTML = `<table class="ctrl-table"><thead><tr><th>Nome</th><th>Tipo</th><th>Data</th><th></th></tr></thead><tbody>
      ${arquivos.map((a) => `<tr><td>${esc(a.nome || "-")}</td><td>${esc(a.tipo_documento || "-")}</td><td>${esc(a.data_documento || "-")}</td>
      <td><a href="${esc(a.url)}" target="_blank" class="ctrl-btn ctrl-btn-outline">Abrir</a></td></tr>`).join("")}
    </tbody></table>`;
  }

  async function carregarLista() {
    const res = await fetch("/api/cadastros/viaturas");
    const json = await res.json();
    if (json.ok) {
      itens = json.itens || [];
      atualizarKpis(json.kpis);
      atualizarFiltroSeguradoras();
      renderTabela();
    }
  }

  async function carregarItem(id) {
    const res = await fetch(`/api/cadastros/viaturas/${id}`);
    const json = await res.json();
    if (json.ok) abrirModal(json.item);
  }

  async function salvar() {
    const err = el("cadErroViatura");
    err.style.display = "none";
    try {
      const payload = coletarPayload();
      const res = await fetch("/api/cadastros/viaturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.erro || "Erro ao salvar");
      fecharModal();
      await carregarLista();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
    }
  }

  async function excluir() {
    const id = el("viaturaId").value;
    if (!id || !confirm("Excluir esta viatura?")) return;
    const res = await fetch(`/api/cadastros/viaturas/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      fecharModal();
      await carregarLista();
    }
  }

  el("btnNovaViatura")?.addEventListener("click", () => abrirModal(null));
  el("btnFecharViatura")?.addEventListener("click", fecharModal);
  el("btnSalvarViatura")?.addEventListener("click", salvar);
  el("btnExcluirViatura")?.addEventListener("click", excluir);
  el("v_status_toggle")?.addEventListener("change", (e) => {
    el("v_status").value = e.target.checked ? "ativo" : "inativo";
  });
  el("v_personalizacao")?.addEventListener("input", (e) => {
    atualizarBadgeModal({ personalizacao: e.target.value.trim() });
  });
  el("v_origem")?.addEventListener("change", (e) => {
    el("v_terceiro").value = e.target.value === "terceiro" ? "true" : "false";
  });

  document.querySelectorAll("#modalViatura .cad-nav-btn").forEach((b) => {
    b.addEventListener("click", () => ativarTab(b.dataset.cadTab));
  });

  ["filtroBuscaV", "filtroStatusV", "filtroClassificacaoV", "filtroPersonalizacaoV", "filtroSeguradoraV"].forEach((id) => {
    el(id)?.addEventListener("input", renderTabela);
    el(id)?.addEventListener("change", renderTabela);
  });
  el("btnLimparFiltrosV")?.addEventListener("click", () => {
    ["filtroBuscaV"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    ["filtroStatusV", "filtroClassificacaoV", "filtroPersonalizacaoV", "filtroSeguradoraV"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    renderTabela();
  });

  el("formArquivoViatura")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const id = el("viaturaId").value;
    if (!id) {
      alert("Salve a viatura antes de anexar arquivos.");
      return;
    }
    const fd = new FormData(ev.target);
    const res = await fetch(`/api/cadastros/viaturas/${id}/arquivos`, { method: "POST", body: fd });
    const json = await res.json();
    if (json.ok) {
      ev.target.reset();
      renderArquivos(json.item?.arquivos || []);
    } else alert(json.erro || "Falha no upload");
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
  });

  carregarLista();
})();
