(function () {
  let itens = [];

  const modal = document.getElementById("modalViatura");
  const tbody = document.getElementById("tbodyViaturas");

  function el(id) {
    return document.getElementById(id);
  }

  function atualizarKpis(k) {
    if (!k) return;
    const m = { total: "kpiVTotal", ativas: "kpiVAtivas", inativas: "kpiVInativas", com_documentos: "kpiVDocs" };
    Object.keys(m).forEach((key) => {
      const node = el(m[key]);
      if (node) node.textContent = String(k[key] ?? 0);
    });
  }

  function abrirModal(item) {
    modal.classList.add("open");
    el("cadErroViatura").style.display = "none";
    const id = item?.id || "";
    el("viaturaId").value = id;
    el("modalViaturaTitulo").textContent = id ? `Viatura — ${item.exibicao || item.placa}` : "Nova viatura";
    el("btnExcluirViatura").style.display = id ? "" : "none";

    const fields = [
      "placa", "marca", "modelo", "renavam", "chassi", "ano_fabricacao", "ano_modelo",
      "combustivel", "capacidade_litros", "cor", "estado_placa", "tipo_viatura", "observacoes",
      "cpf_cnpj_crlv", "exibicao", "telefone", "personalizacao", "consumo_km_l", "hodometro",
    ];
    fields.forEach((f) => {
      const inp = el("v_" + f);
      if (inp) inp.value = item?.[f] ?? "";
    });
    el("v_status").value = item?.status || "ativo";
    el("v_terceiro").value = item?.terceiro ? "true" : "false";
    el("v_status_toggle").checked = (item?.status || "ativo") === "ativo";
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
      "cpf_cnpj_crlv", "exibicao", "telefone", "personalizacao",
    ].forEach((f) => {
      payload[f] = el("v_" + f)?.value?.trim() || "";
    });
    payload.capacidade_litros = el("v_capacidade_litros")?.value || "";
    payload.consumo_km_l = el("v_consumo_km_l")?.value || "";
    payload.hodometro = el("v_hodometro")?.value || "";
    payload.terceiro = el("v_terceiro")?.value === "true";
    payload.status = el("v_status_toggle").checked ? "ativo" : "inativo";
    if (!payload.exibicao) payload.exibicao = (payload.placa || "").toUpperCase();
    return payload;
  }

  function renderTabela() {
    const busca = (el("filtroBuscaV")?.value || "").toLowerCase();
    const status = (el("filtroStatusV")?.value || "").toLowerCase();
    const tipo = (el("filtroTipoV")?.value || "").toLowerCase();
    const ano = (el("filtroAnoV")?.value || "").toLowerCase();
    tbody.innerHTML = "";
    itens.forEach((v) => {
      const txt = `${v.exibicao} ${v.placa} ${v.marca} ${v.modelo} ${v.tipo_viatura} ${v.ano_fabricacao} ${v.ano_modelo}`.toLowerCase();
      if (busca && !txt.includes(busca)) return;
      if (status && (v.status || "").toLowerCase() !== status) return;
      if (tipo && !(v.tipo_viatura || "").toLowerCase().includes(tipo)) return;
      if (ano && !txt.includes(ano)) return;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${v.exibicao || "-"}</td>
        <td>${v.placa || "-"}</td>
        <td>${v.marca || "-"}</td>
        <td>${v.modelo || "-"}</td>
        <td>${v.ano_fabricacao || "-"}</td>
        <td>${v.ano_modelo || "-"}</td>
        <td>${v.tipo_viatura || "-"}</td>
        <td><span class="ctrl-pill ${v.status === "ativo" ? "" : "off"}">${v.status}</span></td>
        <td><button type="button" class="ctrl-btn ctrl-btn-outline" data-edit="${v.id}">Editar</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = itens.find((x) => x.id === btn.dataset.edit);
        if (item) carregarItem(item.id);
      });
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
      ${arquivos.map((a) => `<tr><td>${a.nome || "-"}</td><td>${a.tipo_documento || "-"}</td><td>${a.data_documento || "-"}</td>
      <td><a href="${a.url}" target="_blank" class="ctrl-btn ctrl-btn-outline">Abrir</a></td></tr>`).join("")}
    </tbody></table>`;
  }

  async function carregarLista() {
    const res = await fetch("/api/cadastros/viaturas");
    const json = await res.json();
    if (json.ok) {
      itens = json.itens || [];
      atualizarKpis(json.kpis);
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
      const res = await fetch("/api/cadastros/viaturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coletarPayload()),
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

  document.querySelectorAll("#modalViatura .cad-nav-btn").forEach((b) => {
    b.addEventListener("click", () => ativarTab(b.dataset.cadTab));
  });

  ["filtroBuscaV", "filtroStatusV", "filtroTipoV", "filtroAnoV"].forEach((id) => {
    el(id)?.addEventListener("input", renderTabela);
    el(id)?.addEventListener("change", renderTabela);
  });
  el("btnLimparFiltrosV")?.addEventListener("click", () => {
    ["filtroBuscaV", "filtroTipoV", "filtroAnoV"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    if (el("filtroStatusV")) el("filtroStatusV").value = "";
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
