(function () {
  const cfg = window.CONTROLE_CFG || {};
  const slug = cfg.slug || "";
  const apiPost = cfg.apiPost || "";
  const colunas = cfg.colunas || [];

  function el(id) {
    return document.getElementById(id);
  }

  window.abrirModalCadastroControle = function () {
    const modal = el("modalCadastroControle");
    const form = el("formCadastroControle");
    const err = el("ctrlFormErro");
    if (!modal || !form) return;
    form.reset();
    if (window.CtrlAc) {
      CtrlAc.reset(form);
      CtrlAc.init(form);
    }
    if (err) {
      err.style.display = "none";
      err.textContent = "";
    }
    if (slug === "manutencoes") {
      const tb = document.querySelector("#tabelaItensManutencao tbody");
      if (tb) tb.innerHTML = "";
      adicionarItemManutencao();
    }
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  };

  window.fecharModalCadastroControle = function () {
    const modal = el("modalCadastroControle");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  };

  function coletarPayloadForm() {
    const form = el("formCadastroControle");
    if (!form) return {};
    const data = {};
    form.querySelectorAll("input, select, textarea").forEach((field) => {
      const name = field.name;
      if (!name || field.disabled || field.classList.contains("ctrl-ac-input")) return;
      if (name.endsWith("_id")) return;
      if (field.type === "checkbox") {
        data[name] = field.checked;
        return;
      }
      if (field.type === "number" && field.value === "") return;
      if (field.value !== "") data[name] = field.value;
    });
    if (slug === "manutencoes") {
      data.itens = coletarItensManutencao();
    }
    return data;
  }

  function coletarItensManutencao() {
    const rows = document.querySelectorAll("#tabelaItensManutencao tbody tr");
    const itens = [];
    rows.forEach((tr) => {
      const descricao = tr.querySelector('[data-f="descricao"]')?.value?.trim();
      if (!descricao) return;
      itens.push({
        tipo: tr.querySelector('[data-f="tipo"]')?.value || "produto",
        descricao,
        valor_unitario: parseFloat(tr.querySelector('[data-f="valor_unitario"]')?.value || "0") || 0,
        quantidade: parseFloat(tr.querySelector('[data-f="quantidade"]')?.value || "1") || 1,
        valor_total: parseFloat(tr.querySelector('[data-f="valor_total"]')?.value || "0") || 0,
      });
    });
    return itens;
  }

  function adicionarItemManutencao() {
    const tb = document.querySelector("#tabelaItensManutencao tbody");
    if (!tb) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><select data-f="tipo"><option value="produto">Produto</option><option value="servico">Serviço</option></select></td>
      <td><input type="text" data-f="descricao" placeholder="Descrição" style="width:100%"></td>
      <td><input type="number" step="0.01" min="0" data-f="valor_unitario" value="0" style="width:90px"></td>
      <td><input type="number" step="0.01" min="0" data-f="quantidade" value="1" style="width:70px"></td>
      <td><input type="number" step="0.01" min="0" data-f="valor_total" value="0" style="width:90px" readonly></td>
      <td><button type="button" class="ctrl-btn ctrl-btn-outline" data-remove-item>×</button></td>`;
    tb.appendChild(tr);
    tr.querySelectorAll("[data-f]").forEach((inp) => {
      inp.addEventListener("input", () => recalcularLinhaManutencao(tr));
    });
    tr.querySelector("[data-remove-item]")?.addEventListener("click", () => {
      tr.remove();
      recalcularTotaisManutencao();
    });
  }

  function recalcularLinhaManutencao(tr) {
    const qtd = parseFloat(tr.querySelector('[data-f="quantidade"]')?.value || "0") || 0;
    const vu = parseFloat(tr.querySelector('[data-f="valor_unitario"]')?.value || "0") || 0;
    const total = qtd * vu;
    const out = tr.querySelector('[data-f="valor_total"]');
    if (out) out.value = total.toFixed(2);
    recalcularTotaisManutencao();
  }

  function recalcularTotaisManutencao() {
    let prod = 0;
    let serv = 0;
    document.querySelectorAll("#tabelaItensManutencao tbody tr").forEach((tr) => {
      const tipo = tr.querySelector('[data-f="tipo"]')?.value || "produto";
      const vt = parseFloat(tr.querySelector('[data-f="valor_total"]')?.value || "0") || 0;
      if (tipo === "servico") serv += vt;
      else prod += vt;
    });
    const tp = el("ctrlTotalProdutos");
    const ts = el("ctrlTotalServicos");
    const tg = el("ctrlTotalGeral");
    if (tp) tp.value = prod.toFixed(2);
    if (ts) ts.value = serv.toFixed(2);
    if (tg) tg.value = (prod + serv).toFixed(2);
  }

  window.adicionarItemManutencao = adicionarItemManutencao;

  function atualizarKpis(kpis) {
    if (!kpis) return;
    const m = { total: "kpiTotal", ativos: "kpiAtivos", mes: "kpiMes" };
    Object.keys(m).forEach((k) => {
      const node = el(m[k]);
      if (node && kpis[k] !== undefined) node.textContent = String(kpis[k]);
    });
  }

  function celulaValor(reg, chave) {
    if (reg._fmt && reg._fmt[chave] !== undefined) return reg._fmt[chave];
    return reg[chave] != null && reg[chave] !== "" ? reg[chave] : "-";
  }

  function criarLinhaTabela(reg) {
    const tr = document.createElement("tr");
    const status = (reg.status || "ativo").toLowerCase();
    const viatura = (reg.viatura || "").toLowerCase();
    const dataIso = reg._data_iso || "";
    tr.setAttribute("data-status", status);
    tr.setAttribute("data-viatura", viatura);
    tr.setAttribute("data-profissional", (reg.profissional || "").toLowerCase());
    tr.setAttribute("data-motorista", (reg.motorista || "").toLowerCase());
    tr.setAttribute("data-condutor", (reg.condutor || "").toLowerCase());
    tr.setAttribute("data-data", dataIso);
    colunas.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = celulaValor(reg, col.chave);
      tr.appendChild(td);
    });
    const tdUpd = document.createElement("td");
    tdUpd.textContent = reg.updated_at || reg.created_at || "-";
    tr.appendChild(tdUpd);
    return tr;
  }

  function garantirTabela() {
    let tbody = el("tbodyControle");
    if (tbody) return tbody;
    const empty = el("ctrlEmpty");
    const secao = el("secaoRegistros");
    if (!secao) return null;
    if (empty) empty.remove();
    const wrap = document.createElement("div");
    wrap.className = "ctrl-table-wrap";
    const table = document.createElement("table");
    table.className = "ctrl-table";
    table.id = "tabelaControle";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    colunas.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c.rotulo;
      hr.appendChild(th);
    });
    const thU = document.createElement("th");
    thU.textContent = "Atualizado";
    hr.appendChild(thU);
    thead.appendChild(hr);
    table.appendChild(thead);
    tbody = document.createElement("tbody");
    tbody.id = "tbodyControle";
    table.appendChild(tbody);
    wrap.appendChild(table);
    secao.appendChild(wrap);
    return tbody;
  }

  window.salvarCadastroControle = async function (ev) {
    if (ev) ev.preventDefault();
    const form = el("formCadastroControle");
    const errEl = el("ctrlFormErro");
    const btn = el("btnSalvarControle");
    if (errEl) {
      errEl.style.display = "none";
      errEl.textContent = "";
    }
    if (window.CtrlAc && form) {
      const missing = CtrlAc.validateRequired(form);
      if (missing.length) {
        if (errEl) {
          errEl.textContent = "Preencha: " + missing.join(", ");
          errEl.style.display = "block";
        }
        return false;
      }
    }
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(apiPost, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coletarPayloadForm()),
      });
      const json = await res.json();
      if (!json.ok) {
        const msg = json.erro || "Erro ao salvar";
        if (errEl) {
          errEl.textContent = msg;
          errEl.style.display = "block";
        } else alert(msg);
        return false;
      }
      fecharModalCadastroControle();
      atualizarKpis(json.kpis);
      const tbody = garantirTabela();
      if (tbody && json.registro) {
        tbody.insertBefore(criarLinhaTabela(json.registro), tbody.firstChild);
        filtrarTabelaControle();
      } else {
        location.reload();
      }
    } catch (e) {
      if (errEl) {
        errEl.textContent = "Falha de comunicação com o servidor.";
        errEl.style.display = "block";
      }
    } finally {
      if (btn) btn.disabled = false;
    }
    return false;
  };

  function parseDataIso(s) {
    if (!s) return null;
    const p = s.split("-");
    if (p.length !== 3) return null;
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  function periodoMatch(dataIso, periodo) {
    if (!periodo) return true;
    const d = parseDataIso(dataIso);
    if (!d) return periodo === "";
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diff = (hoje - d) / 86400000;
    if (periodo === "hoje") return diff === 0;
    if (periodo === "semana") return diff >= 0 && diff <= 6;
    if (periodo === "mes") {
      return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
    }
    if (periodo === "mes_anterior") {
      const m = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
    }
    return true;
  }

  window.filtrarTabelaControle = function () {
    const tabela = el("tabelaControle");
    if (!tabela) return;
    const busca = (el("buscaModulo")?.value || "").toLowerCase();
    const status = (el("filtroStatus")?.value || "").toLowerCase();
    const periodo = el("filtroPeriodo")?.value || "";
    const viatura = (el("filtroViatura")?.value || "").toLowerCase();
    const profissional = (el("filtroProfissional")?.value || "").toLowerCase();
    const motorista = (el("filtroMotorista")?.value || "").toLowerCase();
    const condutor = (el("filtroCondutor")?.value || "").toLowerCase();
    tabela.querySelectorAll("tbody tr").forEach((tr) => {
      const rowText = tr.innerText.toLowerCase();
      const rowStatus = (tr.getAttribute("data-status") || "").toLowerCase();
      const rowViatura = (tr.getAttribute("data-viatura") || "").toLowerCase();
      const rowData = tr.getAttribute("data-data") || "";
      const okBusca = !busca || rowText.includes(busca);
      const okStatus = !status || rowStatus === status;
      const okViatura = !viatura || rowViatura.includes(viatura);
      const okProf = !profissional || (tr.getAttribute("data-profissional") || "").includes(profissional);
      const okMot = !motorista || (tr.getAttribute("data-motorista") || "").includes(motorista);
      const okCond = !condutor || (tr.getAttribute("data-condutor") || "").includes(condutor);
      const okPeriodo = periodoMatch(rowData, periodo);
      tr.style.display =
        okBusca && okStatus && okViatura && okPeriodo && okProf && okMot && okCond ? "" : "none";
    });
  };

  window.limparFiltrosControle = function () {
    ["buscaModulo"].forEach((id) => {
      const n = el(id);
      if (n) n.value = "";
    });
    ["filtroStatus", "filtroPeriodo"].forEach((id) => {
      const n = el(id);
      if (n) n.value = "";
    });
    document.querySelectorAll(".ctrl-filters [data-ctrl-ac]").forEach((wrap) => {
      if (wrap._ctrlAcClear) wrap._ctrlAcClear();
    });
    ["filtroViaturaVis", "filtroProfissionalVis", "filtroMotoristaVis", "filtroCondutorVis"].forEach((id) => {
      const n = el(id);
      if (n) n.value = "";
    });
    filtrarTabelaControle();
  };

  document.getElementById("btnAddItemManutencao")?.addEventListener("click", adicionarItemManutencao);

  const litros = el("ctrlLitros");
  const vUnit = el("ctrlValorUnit");
  const vTotal = el("ctrlValorTotal");
  function recalcAbast() {
    if (!litros || !vUnit || !vTotal) return;
    const l = parseFloat(litros.value || "0") || 0;
    const u = parseFloat(vUnit.value || "0") || 0;
    if (l && u) vTotal.value = (l * u).toFixed(2);
  }
  litros?.addEventListener("input", recalcAbast);
  vUnit?.addEventListener("input", recalcAbast);

  el("modalCadastroControle")?.addEventListener("click", (e) => {
    if (e.target.id === "modalCadastroControle") fecharModalCadastroControle();
  });

  if (window.CtrlAc) {
    CtrlAc.preload().then(() => CtrlAc.init(document));
  }
})();
