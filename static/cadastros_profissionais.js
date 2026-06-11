(function () {
  let itens = [];
  let itemAtual = null;
  const modal = document.getElementById("modalProfissional");
  const tbody = document.getElementById("tbodyProfissionais");

  const CAMPOS = [
    "filial_cnpj", "nome_completo", "nome_trabalho", "data_nascimento", "cpf", "rg",
    "telefone_fixo", "telefone_movel", "estado_civil", "email", "cep", "logradouro",
    "bairro", "cidade", "uf", "observacoes", "cnpj", "funcao", "remuneracao",
    "forma_pagamento", "data_admissao", "data_demissao", "hora_inicio", "hora_termino",
    "carga_horaria", "intervalo", "escala", "registro_ctps", "cnh_numero", "cnh_vencimento",
    "cnh_categoria", "pode_receber_servicos", "pode_aparecer_controle",
    "classificacao_vinculo", "tipo_profissional",
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isoDate(v) {
    if (!v) return "";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return "";
  }

  function badgeVinculo(p) {
    const v = (p.classificacao_vinculo || (p.terceiro ? "terceiro" : "contratado")).toLowerCase();
    const cls = v === "terceiro" ? "cad-badge-vinculo-terceiro" : "cad-badge-contratado";
    const txt = p.vinculo_label || (v === "terceiro" ? "Terceiro" : "Contratado");
    return `<span class="cad-badge ${cls}">${esc(txt)}</span>`;
  }

  function badgeTipo(p) {
    const t = (p.tipo_profissional || "operacional").toLowerCase();
    const cls = t === "motorista" ? "cad-badge-motorista" : "cad-badge-operacional";
    const txt = p.tipo_profissional_label || (t === "motorista" ? "Motorista" : "Operacional");
    return `<span class="cad-badge ${cls}">${esc(txt)}</span>`;
  }

  function atualizarKpis(k) {
    if (!k) return;
    const m = {
      total: "kpiPTotal",
      ativos: "kpiPAtivos",
      inativos: "kpiPInativos",
      motoristas: "kpiPMotoristas",
      operacionais: "kpiPOperacionais",
      contratados: "kpiPContratados",
      terceiros: "kpiPTerceiros",
    };
    Object.keys(m).forEach((key) => {
      const node = el(m[key]);
      if (node) node.textContent = String(k[key] ?? 0);
    });
  }

  function renderDetalhesRegistro(boxId, det) {
    const box = el(boxId);
    if (!box || !det) return;
    box.innerHTML = `
      <h4>Detalhes do registro</h4>
      <div class="cad-detalhes-grid">
        <div><span>Nome completo</span><b>${esc(det.nome_completo || "-")}</b></div>
        <div><span>CPF</span><b>${esc(det.cpf || "-")}</b></div>
        <div><span>Estado civil</span><b>${esc(det.estado_civil || "-")}</b></div>
        <div><span>Data de nascimento</span><b>${esc(det.data_nascimento || "-")}</b></div>
      </div>`;
  }

  function atualizarDetalhesPainel() {
    const det = {
      nome_completo: el("p_nome_completo")?.value?.trim() || "-",
      cpf: el("p_cpf")?.value?.trim() || "-",
      estado_civil: el("p_estado_civil")?.value || "-",
      data_nascimento: el("p_data_nascimento")?.value
        ? el("p_data_nascimento").value.split("-").reverse().join("/")
        : "-",
    };
    ["detalhesConfig", "detalhesHabilitacao", "detalhesArquivos"].forEach((id) =>
      renderDetalhesRegistro(id, det)
    );
  }

  function preencherForm(item) {
    CAMPOS.forEach((f) => {
      const inp = el("p_" + f);
      if (!inp) return;
      if (f.startsWith("pode_")) {
        inp.value = item?.[f] !== false ? "true" : "false";
        return;
      }
      if (f.includes("data") || f === "cnh_vencimento") {
        inp.value = isoDate(item?.[f]);
        return;
      }
      if (f === "classificacao_vinculo") {
        const v = item?.classificacao_vinculo || (item?.terceiro ? "terceiro" : "contratado");
        inp.value = v;
        return;
      }
      if (f === "tipo_profissional") {
        inp.value = (item?.tipo_profissional || "operacional").toLowerCase();
        return;
      }
      inp.value = item?.[f] ?? "";
    });
    const st = item?.status || "ativo";
    el("p_status_toggle").checked = st === "ativo";
    atualizarDetalhesPainel();
  }

  function abrirModal(item) {
    itemAtual = item;
    modal.classList.add("open");
    el("cadErroProf").style.display = "none";
    const id = item?.id || "";
    el("profissionalId").value = id;
    const titulo = item
      ? item.nome_exibicao || item.nome || item.nome_trabalho || item.nome_completo
      : "Novo profissional";
    el("modalProfTitulo").textContent = titulo;
    el("btnExcluirProf").style.display = id ? "" : "none";
    if (item) preencherForm(item);
    else {
      document.querySelectorAll("#modalProfissional [id^='p_']").forEach((inp) => {
        if (inp.tagName === "SELECT") {
          if (inp.id === "p_classificacao_vinculo") inp.value = "contratado";
          else if (inp.id === "p_tipo_profissional") inp.value = "operacional";
          else if (inp.id.startsWith("p_pode_")) inp.value = "true";
          else inp.selectedIndex = 0;
        } else inp.value = "";
      });
      el("p_status_toggle").checked = true;
      atualizarDetalhesPainel();
    }
    ativarTab("editar");
    renderArquivos(item?.arquivos || []);
    el("formArquivoProf").style.display = "none";
  }

  function fecharModal() {
    modal.classList.remove("open");
    itemAtual = null;
  }

  function ativarTab(tab) {
    document.querySelectorAll("#modalProfissional .cad-nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.cadTab === tab);
    });
    document.querySelectorAll("#modalProfissional .cad-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.cadPanel === tab);
    });
    if (tab !== "editar") atualizarDetalhesPainel();
  }

  function coletarPayload() {
    const payload = { id: el("profissionalId").value || undefined };
    CAMPOS.forEach((f) => {
      const inp = el("p_" + f);
      if (!inp) return;
      if (f.startsWith("pode_")) {
        payload[f] = inp.value === "true";
      } else {
        payload[f] = inp.value;
      }
    });
    payload.nome_exibicao = payload.nome_trabalho;
    payload.terceiro = payload.classificacao_vinculo === "terceiro";
    payload.status = el("p_status_toggle").checked ? "ativo" : "inativo";
    return payload;
  }

  function labelStatus(status) {
    return (status || "ativo").toLowerCase() === "ativo" ? "Ativo" : "Inativo";
  }

  function lerFiltrosFormulario() {
    return {
      busca: (el("filtroBuscaP")?.value || "").trim().toLowerCase(),
      status: (el("filtroStatusP")?.value || "").trim().toLowerCase(),
      funcao: (el("filtroFuncaoP")?.value || "").trim().toLowerCase(),
      tipo: (el("filtroTipoP")?.value || "").trim().toLowerCase(),
      vinculo: (el("filtroVinculoP")?.value || "").trim().toLowerCase(),
    };
  }

  function profissionalPassaFiltro(p, filtros) {
    const txt = [
      p.nome_exibicao,
      p.nome,
      p.nome_completo,
      p.cpf,
      p.telefone,
      p.funcao,
      p.tipo_profissional,
      p.classificacao_vinculo,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (filtros.busca && !txt.includes(filtros.busca)) return false;
    if (filtros.status && (p.status || "").toLowerCase() !== filtros.status) return false;
    if (filtros.funcao && !(p.funcao || "").toLowerCase().includes(filtros.funcao)) return false;
    if (filtros.tipo && (p.tipo_profissional || "").toLowerCase() !== filtros.tipo) return false;
    const vinc = (p.classificacao_vinculo || (p.terceiro ? "terceiro" : "contratado")).toLowerCase();
    if (filtros.vinculo && vinc !== filtros.vinculo) return false;
    return true;
  }

  function criarCelulaTexto(tr, texto) {
    const td = document.createElement("td");
    td.textContent = texto || "-";
    tr.appendChild(td);
    return td;
  }

  function criarCelulaHtml(tr, html, className) {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.innerHTML = html;
    tr.appendChild(td);
    return td;
  }

  function criarLinhaProfissional(p) {
    const tr = document.createElement("tr");

    const tdNome = document.createElement("td");
    const strong = document.createElement("strong");
    strong.textContent = p.nome_exibicao || p.nome || p.nome_trabalho || "-";
    tdNome.appendChild(strong);
    tr.appendChild(tdNome);

    criarCelulaTexto(tr, p.nome_completo || "-");
    criarCelulaTexto(tr, p.cpf || "-");
    criarCelulaTexto(tr, p.telefone || "-");
    criarCelulaTexto(tr, p.funcao || "-");
    criarCelulaHtml(tr, badgeTipo(p));
    criarCelulaHtml(tr, badgeVinculo(p));

    const st = (p.status || "ativo").toLowerCase();
    criarCelulaHtml(
      tr,
      `<span class="ctrl-pill ${st === "ativo" ? "" : "off"}">${esc(labelStatus(st))}</span>`
    );

    const tdAcoes = document.createElement("td");
    tdAcoes.className = "cad-col-acoes";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctrl-btn ctrl-btn-outline";
    btn.textContent = "Editar";
    btn.dataset.edit = p.id;
    btn.addEventListener("click", () => carregarItem(p.id));
    tdAcoes.appendChild(btn);
    tr.appendChild(tdAcoes);

    return tr;
  }

  function renderTabela(filtrosOverride) {
    if (!tbody) return;
    const filtros = filtrosOverride || lerFiltrosFormulario();
    tbody.innerHTML = "";
    let count = 0;

    itens.forEach((p) => {
      if (!profissionalPassaFiltro(p, filtros)) return;
      tbody.appendChild(criarLinhaProfissional(p));
      count += 1;
    });

    if (!count) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 9;
      td.className = "cad-empty-box";
      td.textContent = "Nenhum profissional encontrado.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  function limparFiltrosFormulario() {
    if (el("filtroBuscaP")) el("filtroBuscaP").value = "";
    if (el("filtroFuncaoP")) el("filtroFuncaoP").value = "";
    if (el("filtroStatusP")) el("filtroStatusP").value = "";
    if (el("filtroTipoP")) el("filtroTipoP").value = "";
    if (el("filtroVinculoP")) el("filtroVinculoP").value = "";
  }

  function aplicarFiltros() {
    renderTabela(lerFiltrosFormulario());
  }

  function renderArquivos(arquivos) {
    const box = el("listaArquivosProf");
    if (!arquivos?.length) {
      box.innerHTML = '<p class="cad-empty-box">Nenhum arquivo anexado.</p>';
      return;
    }
    box.innerHTML = `<div class="ctrl-table-wrap"><table class="ctrl-table"><thead>
      <tr><th>Data e hora</th><th>Extensão</th><th>Tipo</th><th>Nome</th><th></th></tr></thead><tbody>
      ${arquivos
        .map(
          (a) => `<tr>
        <td>${esc(a.created_at_fmt || "-")}</td>
        <td>${esc((a.extensao || "-").toUpperCase())}</td>
        <td>${esc(a.tipo || "-")}</td>
        <td>${esc(a.nome_arquivo || "-")}</td>
        <td class="cad-arq-actions">
          <a href="${esc(a.caminho_arquivo)}" target="_blank" class="ctrl-btn ctrl-btn-outline">Baixar</a>
          <button type="button" class="ctrl-btn ctrl-btn-outline cad-btn-danger" data-del-arq="${a.id}">Excluir</button>
        </td></tr>`
        )
        .join("")}
    </tbody></table></div>`;
    box.querySelectorAll("[data-del-arq]").forEach((btn) => {
      btn.addEventListener("click", () => excluirArquivo(btn.dataset.delArq));
    });
  }

  async function carregarLista() {
    const res = await fetch("/api/cadastros/profissionais");
    const json = await res.json();
    if (json.ok) {
      itens = json.itens || [];
      atualizarKpis(json.kpis);
      renderTabela({});
    }
  }

  async function carregarItem(id) {
    const res = await fetch(`/api/cadastros/profissionais/${id}`);
    const json = await res.json();
    if (json.ok) abrirModal(json.item);
  }

  async function salvar() {
    const err = el("cadErroProf");
    err.style.display = "none";
    const payload = coletarPayload();
    const id = payload.id;
    const url = id ? `/api/cadastros/profissionais/${id}` : "/api/cadastros/profissionais";
    const method = id ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.erro || "Erro ao salvar");
      if (!id && json.item?.id) {
        el("profissionalId").value = json.item.id;
        el("btnExcluirProf").style.display = "";
        itemAtual = json.item;
      }
      atualizarKpis(json.kpis);
      await carregarLista();
      if (json.item) {
        preencherForm(json.item);
        renderArquivos(json.item.arquivos || []);
      }
      err.textContent = "Salvo com sucesso.";
      err.style.color = "#166534";
      err.style.display = "block";
      setTimeout(() => {
        err.style.display = "none";
        err.style.color = "";
      }, 2000);
    } catch (e) {
      err.textContent = e.message;
      err.style.color = "#b91c1c";
      err.style.display = "block";
    }
  }

  async function excluir() {
    const id = el("profissionalId").value;
    if (!id || !confirm("Excluir este profissional permanentemente?")) return;
    const res = await fetch(`/api/cadastros/profissionais/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      fecharModal();
      await carregarLista();
    } else alert(json.erro || "Erro ao excluir");
  }

  async function excluirArquivo(aid) {
    const pid = el("profissionalId").value;
    if (!pid || !confirm("Excluir este arquivo?")) return;
    const res = await fetch(`/api/cadastros/profissionais/${pid}/arquivos/${aid}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) renderArquivos(json.itens || []);
  }

  el("btnNovoProfissional")?.addEventListener("click", () => abrirModal(null));
  el("btnFecharProf")?.addEventListener("click", fecharModal);
  el("btnSalvarProf")?.addEventListener("click", salvar);
  el("btnExcluirProf")?.addEventListener("click", excluir);
  el("p_status_toggle")?.addEventListener("change", (e) => {
    if (!e.target.checked && !confirm("Marcar profissional como inativo?")) {
      e.target.checked = true;
    }
  });

  document.querySelectorAll("#modalProfissional .cad-nav-btn").forEach((b) => {
    b.addEventListener("click", () => ativarTab(b.dataset.cadTab));
  });

  CAMPOS.filter((f) => ["nome_completo", "cpf", "estado_civil", "data_nascimento"].includes(f)).forEach(
    (f) => el("p_" + f)?.addEventListener("input", atualizarDetalhesPainel)
  );

  el("btnAplicarFiltrosP")?.addEventListener("click", aplicarFiltros);
  el("btnLimparFiltrosP")?.addEventListener("click", () => {
    limparFiltrosFormulario();
    renderTabela({});
  });

  ["filtroBuscaP", "filtroFuncaoP"].forEach((id) => {
    el(id)?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        aplicarFiltros();
      }
    });
  });

  el("btnToggleUploadArq")?.addEventListener("click", () => {
    const f = el("formArquivoProf");
    if (!el("profissionalId").value) {
      alert("Salve o profissional antes de anexar arquivos.");
      return;
    }
    f.style.display = f.style.display === "none" ? "block" : "none";
  });

  el("formArquivoProf")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const id = el("profissionalId").value;
    const fd = new FormData(ev.target);
    const res = await fetch(`/api/cadastros/profissionais/${id}/arquivos`, { method: "POST", body: fd });
    const json = await res.json();
    if (json.ok) {
      ev.target.reset();
      el("formArquivoProf").style.display = "none";
      renderArquivos(json.itens || []);
    } else alert(json.erro || "Falha no upload");
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
  });

  carregarLista();
})();
