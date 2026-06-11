(function relatoriosFaturamento() {
  const app = document.getElementById("relFatApp");
  if (!app) return;

  const tipo = app.dataset.tipo;
  const el = (id) => document.getElementById(id);

  let ultimosFiltros = {};
  let ultimoRelatorio = null;

  const COLunas = {
    clientes: [
      { key: "cliente", label: "Cliente/Empresa", cls: "" },
      { key: "qtd", label: "Qtd", cls: "num" },
      { key: "qtd_pct_fmt", label: "Qtd %", cls: "num" },
      { key: "total_fmt", label: "Total R$", cls: "num" },
      { key: "valor_pct_fmt", label: "Valor %", cls: "num" },
      { key: "a_fechar_fmt", label: "A fechar R$", cls: "num" },
      { key: "a_faturar_fmt", label: "A faturar R$", cls: "num" },
    ],
    viaturas: [
      { key: "viatura", label: "Viatura", cls: "" },
      { key: "placa", label: "Placa", cls: "" },
      { key: "qtd", label: "Qtd", cls: "num" },
      { key: "qtd_pct_fmt", label: "Qtd %", cls: "num" },
      { key: "total_fmt", label: "Total R$", cls: "num" },
      { key: "valor_pct_fmt", label: "Valor %", cls: "num" },
      { key: "a_fechar_fmt", label: "A fechar R$", cls: "num" },
      { key: "a_faturar_fmt", label: "A faturar R$", cls: "num" },
    ],
    profissionais: [
      { key: "profissional", label: "Profissional", cls: "" },
      { key: "funcao", label: "Função", cls: "" },
      { key: "qtd", label: "Qtd", cls: "num" },
      { key: "qtd_pct_fmt", label: "Qtd %", cls: "num" },
      { key: "total_fmt", label: "Total R$", cls: "num" },
      { key: "valor_pct_fmt", label: "Valor %", cls: "num" },
      { key: "a_fechar_fmt", label: "A fechar R$", cls: "num" },
      { key: "a_faturar_fmt", label: "A faturar R$", cls: "num" },
    ],
    tipos: [
      { key: "tipo", label: "Tipo de serviço", cls: "" },
      { key: "qtd", label: "Qtd", cls: "num" },
      { key: "qtd_pct_fmt", label: "Qtd %", cls: "num" },
      { key: "total_fmt", label: "Total R$", cls: "num" },
      { key: "valor_pct_fmt", label: "Valor %", cls: "num" },
      { key: "a_fechar_fmt", label: "A fechar R$", cls: "num" },
      { key: "a_faturar_fmt", label: "A faturar R$", cls: "num" },
    ],
  };

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function inicioMesISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  }

  function fmtDataBR(iso) {
    if (!iso) return "—";
    const p = iso.split("-");
    if (p.length !== 3) return iso;
    return `${p[2]}/${p[1]}/${p[0]}`;
  }

  function coletarFiltrosForm() {
    const form = el("formRelFiltros");
    const fd = new FormData(form);
    const out = {};
    for (const [k, v] of fd.entries()) {
      if (k === "exibir_cancelados" || k === "sem_pedagio") {
        out[k] = "1";
      } else {
        out[k] = String(v || "").trim();
      }
    }
    if (!form.querySelector('[name="exibir_cancelados"]').checked) delete out.exibir_cancelados;
    if (!form.querySelector('[name="sem_pedagio"]').checked) delete out.sem_pedagio;
    return out;
  }

  function filtrosQuery(f) {
    const p = new URLSearchParams();
    Object.entries(f || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== "") p.set(k, v);
    });
    return p.toString();
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

  function montarThead() {
    const cols = COLunas[tipo] || [];
    el("relFatThead").innerHTML = `<tr>${cols
      .map((c) => `<th class="${c.cls}">${esc(c.label)}</th>`)
      .join("")}</tr>`;
  }

  function atualizarKpis(kpis, meta) {
    el("relFatKpis").hidden = false;
    el("kpiTotalServicos").textContent = String(kpis.total_servicos ?? 0);
    el("kpiValorTotal").textContent = kpis.valor_total_fmt || "R$ 0,00";
    el("kpiAFechar").textContent = kpis.total_a_fechar_fmt || "R$ 0,00";
    el("kpiAFaturar").textContent = kpis.total_a_faturar_fmt || "R$ 0,00";
    if (meta?.maior_label) el("kpiMaiorLabel").textContent = meta.maior_label;
    el("kpiMaiorNome").textContent = kpis.maior?.nome || "—";
    el("kpiMaiorValor").textContent = kpis.maior?.total_fmt || "R$ 0,00";
  }

  function resumoPeriodo(f) {
    const ini = fmtDataBR(f.data_ini);
    const fim = fmtDataBR(f.data_fim);
    let txt = `Período: ${ini} a ${fim}`;
    if (f.sem_pedagio) txt += " · Valores sem pedágio";
    if (f.exibir_cancelados) txt += " · Inclui cancelados";
    el("relFatPeriodoResumo").textContent = txt;
    const pe = el("relFatPrintPeriodo");
    if (pe) pe.textContent = txt;
  }

  function renderTabela(rel) {
    const cols = COLunas[tipo] || [];
    const tbody = el("relFatTbody");
    const tfoot = el("relFatTfoot");
    const linhas = rel.linhas || [];

    if (!linhas.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}" class="relfat-empty">Nenhum registro encontrado para os filtros selecionados.</td></tr>`;
      tfoot.hidden = true;
      return;
    }

    tbody.innerHTML = linhas
      .map(
        (ln) => `
      <tr data-grupo="${esc(ln.grupo_id)}" title="Clique para ver detalhamento">
        ${cols
          .map((c) => {
            const val = ln[c.key];
            const inner = c.key === "qtd" ? `<strong>${esc(val)}</strong>` : esc(val ?? "—");
            return `<td class="${c.cls}">${inner}</td>`;
          })
          .join("")}
      </tr>`
      )
      .join("");

    const k = rel.kpis || {};
    tfoot.hidden = false;
    const cells = cols.map((c, i) => {
      if (i === 0) return `<td><strong>TOTAL</strong></td>`;
      if (c.key === "qtd") return `<td class="num"><strong>${k.total_servicos ?? 0}</strong></td>`;
      if (c.key === "qtd_pct_fmt") return `<td class="num">100%</td>`;
      if (c.key === "total_fmt") return `<td class="num"><strong>${esc(k.valor_total_fmt)}</strong></td>`;
      if (c.key === "valor_pct_fmt") return `<td class="num">100%</td>`;
      if (c.key === "a_fechar_fmt") return `<td class="num"><strong>${esc(k.total_a_fechar_fmt)}</strong></td>`;
      if (c.key === "a_faturar_fmt") return `<td class="num"><strong>${esc(k.total_a_faturar_fmt)}</strong></td>`;
      return `<td></td>`;
    });
    tfoot.innerHTML = `<tr>${cells.join("")}</tr>`;

    tbody.querySelectorAll("tr[data-grupo]").forEach((tr) => {
      tr.addEventListener("click", () => abrirDetalhe(tr.dataset.grupo));
    });
  }

  async function buscarRelatorio(filtros) {
    const qs = filtrosQuery(filtros);
    const res = await fetch(`/api/relatorios/faturamento/${encodeURIComponent(tipo)}?${qs}`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.erro || "Erro ao gerar relatório");
    return json;
  }

  function colCount() {
    return (COLunas[tipo] || []).length || 8;
  }

  async function executarBusca(filtros) {
    ultimosFiltros = { ...filtros };
    const cols = colCount();
    el("relFatTbody").innerHTML = `<tr><td colspan="${cols}" class="relfat-empty">Gerando relatório…</td></tr>`;
    try {
      const rel = await buscarRelatorio(filtros);
      ultimoRelatorio = rel;
      resumoPeriodo(filtros);
      atualizarKpis(rel.kpis, rel.meta);
      renderTabela(rel);
    } catch (err) {
      console.warn("[rel-faturamento]", err);
      el("relFatTbody").innerHTML = `<tr><td colspan="${colCount()}" class="relfat-empty">Não foi possível gerar o relatório. Tente novamente.</td></tr>`;
    }
  }

  async function abrirDetalhe(grupoId) {
    if (!grupoId) return;
    const qs = filtrosQuery(ultimosFiltros);
    const url = `/api/relatorios/faturamento/${encodeURIComponent(tipo)}/detalhe?grupo=${encodeURIComponent(grupoId)}&${qs}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) {
        alert(json.erro || "Detalhe não encontrado");
        return;
      }
      const g = json.grupo || {};
      const titulo =
        g.cliente || g.viatura || g.profissional || g.tipo || grupoId;
      el("detalheTitulo").textContent = `Detalhamento — ${titulo}`;
      el("detalheResumo").innerHTML = `
        <span><b>Qtd:</b> ${esc(g.qtd)}</span>
        <span><b>Total:</b> ${esc(g.total_fmt)}</span>
        <span><b>A fechar:</b> ${esc(g.a_fechar_fmt)}</span>
        <span><b>A faturar:</b> ${esc(g.a_faturar_fmt)}</span>`;
      const servicos = json.servicos || [];
      el("detalheTbody").innerHTML = servicos.length
        ? servicos
            .map(
              (s) => `
          <tr>
            <td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.protocolo)}</a></td>
            <td>${esc(s.data)}</td>
            <td>${esc(s.cliente)}</td>
            <td>${esc(s.viatura)} <small>${esc(s.viatura_placa)}</small></td>
            <td>${esc(s.profissional)}</td>
            <td>${esc(s.tipo)}</td>
            <td>${esc(s.origem)}</td>
            <td>${esc(s.destino)}</td>
            <td class="num">${esc(s.valor_fmt)}</td>
            <td class="num">${esc(s.pedagio_fmt)}</td>
            <td>${esc(s.status_financeiro)}</td>
          </tr>`
            )
            .join("")
        : `<tr><td colspan="11" class="relfat-empty">Nenhum serviço neste grupo.</td></tr>`;
      abrirModal("modalRelDetalhe");
    } catch (err) {
      console.warn(err);
      alert("Erro ao carregar detalhamento.");
    }
  }

  function resetarFiltros() {
    const form = el("formRelFiltros");
    form.reset();
    el("filtroDataIni").value = inicioMesISO();
    el("filtroDataFim").value = hojeISO();
  }

  el("btnRelFiltros")?.addEventListener("click", () => abrirModal("modalRelFiltros"));
  el("btnFecharFiltros")?.addEventListener("click", () => fecharModal("modalRelFiltros"));
  el("btnFecharDetalhe")?.addEventListener("click", () => fecharModal("modalRelDetalhe"));
  el("btnResetFiltros")?.addEventListener("click", resetarFiltros);
  el("btnRelAtualizar")?.addEventListener("click", () => {
    if (Object.keys(ultimosFiltros).length) executarBusca(ultimosFiltros);
    else abrirModal("modalRelFiltros");
  });
  el("btnRelImprimir")?.addEventListener("click", () => window.print());
  el("btnRelPdf")?.addEventListener("click", () => window.print());
  el("btnRelExcel")?.addEventListener("click", () => {
    if (!Object.keys(ultimosFiltros).length) {
      alert("Gere o relatório antes de exportar.");
      return;
    }
    const qs = filtrosQuery(ultimosFiltros);
    window.location.href = `/api/relatorios/faturamento/${encodeURIComponent(tipo)}/exportar-excel?${qs}`;
  });

  el("formRelFiltros")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    fecharModal("modalRelFiltros");
    executarBusca(coletarFiltrosForm());
  });

  ["modalRelFiltros", "modalRelDetalhe"].forEach((id) => {
    el(id)?.addEventListener("click", (e) => {
      if (e.target.id === id) fecharModal(id);
    });
  });

  montarThead();
  resetarFiltros();
})();
