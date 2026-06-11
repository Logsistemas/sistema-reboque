(function () {
  let itens = [];
  let viaturas = [];
  let profissionais = [];
  let valorTotalManual = false;
  const modal = document.getElementById("modalAbastecimento");
  const tbody = document.getElementById("tbodyAbastecimentos");

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

  function fmtMoeda(v) {
    const n = Number(v || 0);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function nowDatetimeLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function atualizarKpis(k) {
    if (!k) return;
    const map = {
      total: "kpiAbTotal",
      litros: "kpiAbLitros",
      internos: "kpiAbInternos",
      externos: "kpiAbExternos",
    };
    Object.keys(map).forEach((key) => {
      const node = el(map[key]);
      if (node) node.textContent = String(k[key] ?? 0);
    });
    if (el("kpiAbValor")) el("kpiAbValor").textContent = fmtMoeda(k.valor_total);
    if (el("kpiAbMedia")) el("kpiAbMedia").textContent = String(k.media_km_litro ?? 0);
  }

  function badgePosto(posto) {
    const interno = (posto || "").toUpperCase() === "INTERNO";
    const cls = interno ? "frota-badge-posto-interno" : "frota-badge-posto-externo";
    return `<span class="cad-badge ${cls}">${esc(posto || "-")}</span>`;
  }

  function badgeCombustivel(c) {
    return `<span class="cad-badge frota-badge-combustivel">${esc(c || "-")}</span>`;
  }

  function labelStatus(st) {
    const s = (st || "ativo").toLowerCase();
    if (s === "cancelado") return "Cancelado";
    return s === "ativo" ? "Ativo" : "Inativo";
  }

  function montarQueryFiltros() {
    const params = new URLSearchParams();
    if (el("filtroDataIni")?.value) params.set("data_ini", el("filtroDataIni").value);
    if (el("filtroDataFim")?.value) params.set("data_fim", el("filtroDataFim").value);
    if (el("filtroViatura")?.value) params.set("viatura_id", el("filtroViatura").value);
    if (el("filtroProfissional")?.value) params.set("profissional_id", el("filtroProfissional").value);
    if (el("filtroPosto")?.value) params.set("posto", el("filtroPosto").value);
    if (el("filtroCombustivel")?.value) params.set("combustivel", el("filtroCombustivel").value);
    if (el("filtroBuscaAb")?.value?.trim()) params.set("busca", el("filtroBuscaAb").value.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  function preencherSelectFiltros() {
    const selV = el("filtroViatura");
    const selP = el("filtroProfissional");
    if (selV) {
      const cur = selV.value;
      selV.innerHTML = '<option value="">Todas</option>';
      viaturas.forEach((v) => {
        selV.innerHTML += `<option value="${esc(v.id)}">${esc(v.label)}</option>`;
      });
      selV.value = cur;
    }
    if (selP) {
      const cur = selP.value;
      selP.innerHTML = '<option value="">Todos</option>';
      profissionais.forEach((p) => {
        selP.innerHTML += `<option value="${esc(p.id)}">${esc(p.label_operacional || p.label || p.nome_exibicao)}</option>`;
      });
      selP.value = cur;
    }
  }

  function preencherDatalists() {
    const dlV = el("listaViaturasAb");
    const dlP = el("listaProfissionaisAb");
    if (dlV) {
      dlV.innerHTML = viaturas
        .map((v) => `<option value="${esc(v.label)}" data-id="${esc(v.id)}"></option>`)
        .join("");
    }
    if (dlP) {
      dlP.innerHTML = profissionais
        .map((p) => `<option value="${esc(p.label_operacional || p.label)}" data-id="${esc(p.id)}"></option>`)
        .join("");
    }
  }

  function resolverIdDatalist(inputId, hiddenId, lista) {
    const txt = (el(inputId)?.value || "").trim();
    const found = lista.find(
      (x) =>
        x.label === txt ||
        x.label_operacional === txt ||
        x.label_admin === txt ||
        x.nome_exibicao === txt
    );
    if (found) el(hiddenId).value = found.id;
    else el(hiddenId).value = "";
  }

  function calcularValorTotal(force) {
    const litros = parseFloat(el("ab_litros")?.value || "0");
    const unit = parseFloat(el("ab_valor_unitario")?.value || "0");
    if (!force && valorTotalManual) return;
    if (litros > 0 && unit > 0) {
      el("ab_valor_total").value = (litros * unit).toFixed(2);
    }
  }

  async function atualizarPreviewKm() {
    const vid = el("ab_viatura_id")?.value;
    const hod = el("ab_hodometro")?.value;
    const litros = el("ab_litros")?.value || "1";
    const alertaBox = el("abAlertaKm");
    if (!vid) {
      el("abUltimoKmPreview").textContent = "—";
      el("abKmRodadoPreview").textContent = "—";
      el("abMediaPreview").textContent = "—";
      if (alertaBox) alertaBox.style.display = "none";
      return;
    }
    const excluir = el("abastecimentoId")?.value || "";
    const qs = new URLSearchParams({ viatura_id: vid, hodometro: hod || "", excluir_id: excluir });
    try {
      const res = await fetch(`/api/frota/abastecimentos/ultimo-km?${qs}`);
      const json = await res.json();
      if (!json.ok) return;
      const ult = json.ultimo_hodometro;
      el("abUltimoKmPreview").textContent = ult != null ? String(ult) : "—";
      const desconsiderar = el("ab_desconsiderar_km")?.checked;
      if (alertaBox) {
        if (json.alerta && !desconsiderar) {
          alertaBox.textContent = json.alerta;
          alertaBox.style.display = "block";
        } else {
          alertaBox.style.display = "none";
        }
      }
      if (hod && ult != null) {
        const km = parseInt(hod, 10) - parseInt(ult, 10);
        if (km >= 0) {
          el("abKmRodadoPreview").textContent = String(km);
          const l = parseFloat(litros);
          el("abMediaPreview").textContent = l > 0 ? (km / l).toFixed(2) : "—";
        } else if (desconsiderar) {
          el("abKmRodadoPreview").textContent = "—";
          el("abMediaPreview").textContent = "—";
        } else {
          el("abKmRodadoPreview").textContent = "Inválido";
          el("abMediaPreview").textContent = "—";
        }
      }
    } catch (e) {
      console.warn("Preview KM:", e);
    }
  }

  function criarLinha(item) {
    const tr = document.createElement("tr");
    const st = (item.status || "ativo").toLowerCase();

    const cols = [
      item.data_hora_fmt || "-",
      item.viatura || "-",
      item.placa || "-",
      item.profissional || "-",
      null,
      null,
      item.litros_fmt || "-",
      item.valor_unitario_fmt || "-",
      item.valor_total_fmt || "-",
      item.hodometro_fmt || "-",
      item.km_rodado_fmt || "-",
      item.media_km_litro_fmt || "-",
      null,
      null,
    ];

    cols.forEach((val, idx) => {
      const td = document.createElement("td");
      if (idx === 4) td.innerHTML = badgePosto(item.posto);
      else if (idx === 5) td.innerHTML = badgeCombustivel(item.combustivel);
      else if (idx === 12) {
        td.innerHTML = `<span class="ctrl-pill ${st === "ativo" ? "" : "off"}">${esc(labelStatus(st))}</span>`;
      } else if (idx === 13) {
        td.className = "cad-col-acoes";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ctrl-btn ctrl-btn-outline";
        btn.textContent = "Editar";
        btn.addEventListener("click", () => carregarItem(item.id));
        td.appendChild(btn);
      } else {
        td.textContent = val;
      }
      tr.appendChild(td);
    });
    return tr;
  }

  function renderTabela() {
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!itens.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 14;
      td.className = "cad-empty-box";
      td.textContent = "Nenhum abastecimento encontrado.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    itens.forEach((item) => tbody.appendChild(criarLinha(item)));
  }

  function limparFormulario() {
    el("abastecimentoId").value = "";
    el("ab_viatura_busca").value = "";
    el("ab_viatura_id").value = "";
    el("ab_data_hora").value = nowDatetimeLocal();
    el("ab_posto").value = "";
    el("ab_profissional_busca").value = "";
    el("ab_profissional_id").value = "";
    el("ab_combustivel").value = "";
    el("ab_litros").value = "";
    el("ab_valor_unitario").value = "";
    el("ab_valor_total").value = "";
    el("ab_hodometro").value = "";
    el("ab_observacao").value = "";
    el("ab_desconsiderar_km").checked = false;
    el("ab_gerar_pagar").checked = false;
    valorTotalManual = false;
    el("btnExcluirAbast").style.display = "none";
    el("modalAbastTitulo").textContent = "Novo abastecimento";
    el("cadErroAbast").style.display = "none";
    atualizarPreviewKm();
  }

  function abrirModal(item) {
    modal.classList.add("open");
    if (!item) {
      limparFormulario();
      return;
    }
    el("abastecimentoId").value = item.id;
    el("modalAbastTitulo").textContent = "Editar abastecimento";
    el("btnExcluirAbast").style.display = "";
    el("ab_viatura_id").value = item.viatura_id || "";
    const v = viaturas.find((x) => x.id === item.viatura_id);
    el("ab_viatura_busca").value = v?.label || item.viatura || "";
    el("ab_data_hora").value = item.data_hora_iso || nowDatetimeLocal();
    el("ab_posto").value = item.posto || "";
    el("ab_profissional_id").value = item.profissional_id || "";
    const p = profissionais.find((x) => x.id === item.profissional_id);
    el("ab_profissional_busca").value = p?.label || item.profissional || "";
    el("ab_combustivel").value = item.combustivel || "";
    el("ab_litros").value = item.litros ?? "";
    el("ab_valor_unitario").value = item.valor_unitario ?? "";
    el("ab_valor_total").value = item.valor_total ?? "";
    el("ab_hodometro").value = item.hodometro ?? "";
    el("ab_observacao").value = item.observacoes || "";
    el("ab_desconsiderar_km").checked = !!item.desconsiderar_ultimo_km;
    el("ab_gerar_pagar").checked = !!item.gerar_contas_pagar;
    valorTotalManual = false;
    el("cadErroAbast").style.display = "none";
    atualizarPreviewKm();
  }

  function fecharModal() {
    modal.classList.remove("open");
  }

  function coletarPayload() {
    resolverIdDatalist("ab_viatura_busca", "ab_viatura_id", viaturas);
    resolverIdDatalist("ab_profissional_busca", "ab_profissional_id", profissionais);
    return {
      id: el("abastecimentoId").value || undefined,
      viatura_id: el("ab_viatura_id").value,
      data_hora: el("ab_data_hora").value,
      posto: el("ab_posto").value,
      profissional_id: el("ab_profissional_id").value,
      combustivel: el("ab_combustivel").value,
      litros: el("ab_litros").value,
      valor_unitario: el("ab_valor_unitario").value,
      valor_total: el("ab_valor_total").value,
      hodometro: el("ab_hodometro").value,
      observacao: el("ab_observacao").value,
      desconsiderar_ultimo_km: el("ab_desconsiderar_km").checked,
      gerar_contas_pagar: el("ab_gerar_pagar").checked,
    };
  }

  async function carregarOpcoes() {
    const [rv, rp] = await Promise.all([
      fetch("/api/frota/abastecimentos/opcoes/viaturas"),
      fetch("/api/frota/abastecimentos/opcoes/profissionais"),
    ]);
    const jv = await rv.json();
    const jp = await rp.json();
    viaturas = jv.itens || [];
    profissionais = jp.itens || [];
    preencherDatalists();
    preencherSelectFiltros();
  }

  async function carregarLista() {
    const res = await fetch(`/api/frota/abastecimentos${montarQueryFiltros()}`);
    const json = await res.json();
    if (json.ok) {
      itens = json.itens || [];
      atualizarKpis(json.kpis);
      renderTabela();
    }
  }

  async function carregarItem(id) {
    const res = await fetch(`/api/frota/abastecimentos/${id}`);
    const json = await res.json();
    if (json.ok) abrirModal(json.item);
  }

  async function salvar() {
    const err = el("cadErroAbast");
    err.style.display = "none";
    const payload = coletarPayload();
    const id = payload.id;
    const url = id ? `/api/frota/abastecimentos/${id}` : "/api/frota/abastecimentos";
    const method = id ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.erro || "Erro ao salvar");
      atualizarKpis(json.kpis);
      await carregarLista();
      const continuar = el("ab_continuar")?.checked && !id;
      if (continuar) {
        limparFormulario();
        el("ab_continuar").checked = true;
      } else {
        fecharModal();
      }
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
    }
  }

  async function excluir() {
    const id = el("abastecimentoId").value;
    if (!id || !confirm("Cancelar/excluir este abastecimento?")) return;
    const res = await fetch(`/api/frota/abastecimentos/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      fecharModal();
      atualizarKpis(json.kpis);
      await carregarLista();
    } else alert(json.erro || "Erro ao excluir");
  }

  el("btnNovoAbastecimento")?.addEventListener("click", () => abrirModal(null));
  el("btnFecharAbast")?.addEventListener("click", fecharModal);
  el("btnSalvarAbast")?.addEventListener("click", salvar);
  el("btnExcluirAbast")?.addEventListener("click", excluir);
  el("btnAplicarFiltrosAb")?.addEventListener("click", carregarLista);
  el("btnLimparFiltrosAb")?.addEventListener("click", () => {
    ["filtroDataIni", "filtroDataFim", "filtroBuscaAb"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    ["filtroViatura", "filtroProfissional", "filtroPosto", "filtroCombustivel"].forEach((id) => {
      if (el(id)) el(id).value = "";
    });
    carregarLista();
  });

  ["ab_litros", "ab_valor_unitario"].forEach((id) => {
    el(id)?.addEventListener("input", () => {
      calcularValorTotal(false);
      atualizarPreviewKm();
    });
  });
  el("ab_valor_total")?.addEventListener("input", () => {
    valorTotalManual = true;
  });
  el("ab_hodometro")?.addEventListener("input", atualizarPreviewKm);
  el("ab_viatura_busca")?.addEventListener("change", () => {
    resolverIdDatalist("ab_viatura_busca", "ab_viatura_id", viaturas);
    atualizarPreviewKm();
  });
  el("ab_profissional_busca")?.addEventListener("change", () => {
    resolverIdDatalist("ab_profissional_busca", "ab_profissional_id", profissionais);
  });
  el("ab_desconsiderar_km")?.addEventListener("change", atualizarPreviewKm);

  ["filtroBuscaAb"].forEach((id) => {
    el(id)?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        carregarLista();
      }
    });
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
  });

  (async function init() {
    await carregarOpcoes();
    await carregarLista();
  })();
})();
