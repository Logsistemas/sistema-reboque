(function () {
  let itens = [];
  let itemAtual = null;
  const modal = document.getElementById("modalProfissional");
  const tbody = document.getElementById("tbodyProfissionais");

  const CAMPOS = [
    "filial_cnpj", "nome_completo", "nome_trabalho", "data_nascimento", "cpf", "rg",
    "telefone_fixo", "telefone_movel", "estado_civil", "email", "cep", "logradouro",
    "bairro", "cidade", "uf", "observacoes", "terceiro", "cnpj", "funcao", "remuneracao",
    "forma_pagamento", "data_admissao", "data_demissao", "hora_inicio", "hora_termino",
    "carga_horaria", "intervalo", "escala", "registro_ctps", "cnh_numero", "cnh_vencimento",
    "cnh_categoria", "pode_receber_servicos", "pode_aparecer_controle",
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function isoDate(v) {
    if (!v) return "";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return "";
  }

  function atualizarKpis(k) {
    if (!k) return;
    const m = { total: "kpiPTotal", ativos: "kpiPAtivos", inativos: "kpiPInativos", motoristas: "kpiPMotoristas" };
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
        <div><span>Nome completo</span><b>${det.nome_completo || "-"}</b></div>
        <div><span>CPF</span><b>${det.cpf || "-"}</b></div>
        <div><span>Estado civil</span><b>${det.estado_civil || "-"}</b></div>
        <div><span>Data de nascimento</span><b>${det.data_nascimento || "-"}</b></div>
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
      if (f === "terceiro") {
        inp.value = item?.terceiro ? "true" : "false";
        return;
      }
      if (f === "pode_receber_servicos") {
        inp.value = item?.pode_receber_servicos !== false ? "true" : "false";
        return;
      }
      if (f === "pode_aparecer_controle") {
        inp.value = item?.pode_aparecer_controle !== false ? "true" : "false";
        return;
      }
      if (f.includes("data") || f === "cnh_vencimento") {
        inp.value = isoDate(item?.[f]);
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
      ? item.nome || item.nome_trabalho || item.nome_completo
      : "Novo profissional";
    el("modalProfTitulo").textContent = titulo;
    el("btnExcluirProf").style.display = id ? "" : "none";
    if (item) preencherForm(item);
    else {
      document.querySelectorAll("#modalProfissional [id^='p_']").forEach((inp) => {
        if (inp.tagName === "SELECT") {
          if (inp.id === "p_terceiro") inp.value = "false";
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
      if (f === "terceiro" || f.startsWith("pode_")) {
        payload[f] = inp.value === "true";
      } else {
        payload[f] = inp.value;
      }
    });
    payload.status = el("p_status_toggle").checked ? "ativo" : "inativo";
    return payload;
  }

  function renderTabela() {
    const busca = (el("filtroBuscaP")?.value || "").toLowerCase();
    const status = (el("filtroStatusP")?.value || "").toLowerCase();
    const funcao = (el("filtroFuncaoP")?.value || "").toLowerCase();
    tbody.innerHTML = "";
    itens.forEach((p) => {
      const txt = `${p.nome} ${p.nome_completo} ${p.cpf} ${p.telefone} ${p.funcao}`.toLowerCase();
      if (busca && !txt.includes(busca)) return;
      if (status && (p.status || "").toLowerCase() !== status) return;
      if (funcao && !(p.funcao || "").toLowerCase().includes(funcao)) return;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.nome || "-"}</td>
        <td>${p.cpf || "-"}</td>
        <td>${p.telefone || "-"}</td>
        <td>${p.funcao || "-"}</td>
        <td><span class="ctrl-pill ${p.status === "ativo" ? "" : "off"}">${p.status}</span></td>
        <td><button type="button" class="ctrl-btn ctrl-btn-outline" data-edit="${p.id}">Editar</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => carregarItem(btn.dataset.edit));
    });
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
        <td>${a.created_at_fmt || "-"}</td>
        <td>${(a.extensao || "-").toUpperCase()}</td>
        <td>${a.tipo || "-"}</td>
        <td>${a.nome_arquivo || "-"}</td>
        <td class="cad-arq-actions">
          <a href="${a.caminho_arquivo}" target="_blank" class="ctrl-btn ctrl-btn-outline">Baixar</a>
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
      renderTabela();
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
      err.style.display = "none";
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

  ["filtroBuscaP", "filtroStatusP", "filtroFuncaoP"].forEach((id) => {
    el(id)?.addEventListener("input", renderTabela);
    el(id)?.addEventListener("change", renderTabela);
  });
  el("btnLimparFiltrosP")?.addEventListener("click", () => {
    ["filtroBuscaP", "filtroFuncaoP"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    if (el("filtroStatusP")) el("filtroStatusP").value = "";
    renderTabela();
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
