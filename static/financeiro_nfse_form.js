(function () {
  const S = window.FinShared;
  const API = "/api/financeiro/notas-servico";
  let contatosMap = {};
  let parcelas = [];

  function el(id) {
    return document.getElementById(id);
  }

  function parseNum(v) {
    if (v == null || v === "") return 0;
    const s = String(v).replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function fmtNum(n) {
    return (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function boolSelectVal(id) {
    return el(id)?.value === "1";
  }

  function setBoolSelect(id, value) {
    const node = el(id);
    if (node) node.value = value ? "1" : "0";
  }

  function mostrarErro(msg) {
    const node = el("nfseErro");
    if (!node) return;
    node.textContent = msg || "";
    node.style.display = msg ? "block" : "none";
  }

  function recalcTotais() {
    const valSrv = parseNum(el("nf_servico_valor")?.value);
    const desc = parseNum(el("nf_desconto")?.value);
    const base = parseNum(el("nf_base_calculo")?.value) || valSrv;
    const total = Math.max(0, base - desc);
    const ali = parseNum(el("imp_aliq_iss")?.value);
    const iss = ali ? (base * ali) / 100 : parseNum(el("imp_valor_iss")?.value);
    const comPct = parseNum(el("nf_comissao_pct")?.value);
    const comVal = comPct ? (total * comPct) / 100 : 0;
    if (el("nf_total_servicos")) el("nf_total_servicos").value = fmtNum(valSrv);
    if (el("nf_total_nota")) el("nf_total_nota").value = fmtNum(total);
    if (el("imp_valor_iss") && ali) el("imp_valor_iss").value = fmtNum(iss);
    if (el("nf_comissao_valor")) el("nf_comissao_valor").value = fmtNum(comVal);
    return { valSrv, base, desc, total, iss, comVal };
  }

  function payloadForm() {
    const t = recalcTotais();
    return {
      id: el("nf_id")?.value || undefined,
      situacao: el("nf_situacao")?.value || "pendente",
      numero_rps: el("nf_numero_rps")?.value,
      serie_rps: el("nf_serie_rps")?.value,
      numero_nfse: el("nf_numero_nfse")?.value,
      data_emissao: el("nf_data_emissao")?.value,
      natureza_operacao: el("nf_natureza")?.value,
      contato_id: el("nf_contato_id")?.value,
      cliente_nome: el("nf_cliente_nome")?.value,
      cliente_cnpj_cpf: el("nf_cliente_doc")?.value,
      cliente_ie: el("nf_cliente_ie")?.value,
      cliente_im: el("nf_cliente_im")?.value,
      cliente_consumidor_gov: boolSelectVal("nf_consumidor_gov"),
      cliente_tipo_operacao: el("nf_tipo_operacao")?.value,
      cliente_cep: el("nf_cep")?.value,
      cliente_uf: el("nf_uf")?.value,
      cliente_municipio: el("nf_municipio")?.value,
      cliente_bairro: el("nf_bairro")?.value,
      cliente_endereco: el("nf_endereco")?.value,
      cliente_numero: el("nf_numero")?.value,
      cliente_complemento: el("nf_complemento")?.value,
      cliente_fone: el("nf_fone")?.value,
      cliente_email: el("nf_email")?.value,
      municipio_prestacao: el("nf_municipio_prestacao")?.value,
      desconto_incondicional: t.desc,
      base_calculo: t.base,
      total_nota: t.total,
      vendedor: el("nf_vendedor")?.value,
      comissao_pct: parseNum(el("nf_comissao_pct")?.value),
      comissao_valor: t.comVal,
      condicao_pagamento: el("nf_condicao")?.value,
      dias_pagamento: parseInt(el("nf_dias_pagamento")?.value || "0", 10) || 0,
      quantidade_parcelas: Math.max(1, parseInt(el("nf_qtd_parcelas")?.value || "1", 10) || 1),
      intervalo_parcelas: Math.max(1, parseInt(el("nf_intervalo_parcelas")?.value || "30", 10) || 30),
      categoria_id: el("nf_categoria")?.value,
      categoria_txt: el("nf_categoria")?.selectedOptions?.[0]?.textContent,
      itens: [{ descricao: el("nf_servico_desc")?.value, valor: t.valSrv }],
      impostos: {
        codigo_tributacao: el("imp_cod_trib")?.value,
        codigo_cnae: el("imp_cnae")?.value,
        codigo_trib_municipal: el("imp_trib_mun")?.value,
        nbs: el("imp_nbs")?.value,
        indicador_operacao: el("imp_indicador")?.value,
        aliquota_iss: parseNum(el("imp_aliq_iss")?.value),
        valor_iss: parseNum(el("imp_valor_iss")?.value),
        reter_iss: boolSelectVal("imp_reter_iss"),
        descontar_iss: boolSelectVal("imp_descontar_iss"),
        reter_inss: boolSelectVal("imp_reter_inss"),
        reter_csll_pis_cofins: boolSelectVal("imp_reter_csll"),
        valor_ibpt: parseNum(el("imp_ibpt")?.value),
        valor_aprox_tributos: parseNum(el("imp_aprox")?.value),
        cst_ibs_cbs: el("imp_cst")?.value,
        classificacao_tributaria_ibs_cbs: el("imp_class")?.value,
      },
      parcelas,
    };
  }

  function preencherCliente(c) {
    if (!c) return;
    const nome =
      c.razao_social || c.nome || c.nome_fantasia || c.nome_exibicao || "";
    const doc = c.cpf_cnpj || c.cnpj_cpf || c.documento || c.cnpj || c.cpf || "";
    const ie = c.inscricao_estadual || c.ie_rg || c.ie || c.rg || "";
    const im = c.inscricao_municipal || c.im || "";
    const email = c.email_nfse || c.email || "";
    const fone = c.telefone || c.celular || c.fone || "";

    if (el("nf_contato_id")) el("nf_contato_id").value = c.id || "";
    if (el("nf_cliente_nome")) el("nf_cliente_nome").value = nome;
    if (el("nf_cliente_doc")) el("nf_cliente_doc").value = doc;
    if (el("nf_cliente_ie")) el("nf_cliente_ie").value = ie;
    if (el("nf_cliente_im")) el("nf_cliente_im").value = im;
    if (el("nf_cep")) el("nf_cep").value = c.cep || "";
    if (el("nf_uf")) el("nf_uf").value = c.uf || "";
    if (el("nf_municipio")) el("nf_municipio").value = c.municipio || c.cidade || "";
    if (el("nf_bairro")) el("nf_bairro").value = c.bairro || "";
    if (el("nf_endereco")) el("nf_endereco").value = c.endereco || c.logradouro || "";
    if (el("nf_numero")) el("nf_numero").value = c.numero || "";
    if (el("nf_complemento")) el("nf_complemento").value = c.complemento || "";
    if (el("nf_fone")) el("nf_fone").value = fone;
    if (el("nf_email")) el("nf_email").value = email;
    if (el("nf_municipio_prestacao") && !el("nf_municipio_prestacao").value) {
      el("nf_municipio_prestacao").value = c.municipio || c.cidade || "";
    }
    if (el("nf_condicao") && c.condicao_pagamento && !el("nf_condicao").value) {
      el("nf_condicao").value = c.condicao_pagamento;
    }
    if (el("nf_vendedor") && c.vendedor && !el("nf_vendedor").value) {
      el("nf_vendedor").value = c.vendedor;
    }
  }

  async function aplicarClienteSelecionado() {
    const nome = el("nf_cliente_busca")?.value?.trim();
    if (!nome) return;
    const c = contatosMap[nome];
    if (!c?.id) return;
    try {
      const j = await S.apiJson(`/api/cadastros/contatos/${c.id}/fiscal`);
      preencherCliente(j.item);
    } catch (_) {
      preencherCliente(c);
    }
  }

  async function carregarContatos() {
    try {
      const j = await S.apiJson("/api/cadastros/contatos/opcoes?papel=cliente");
      const dl = el("dlClientesNfse");
      contatosMap = {};
      (j.itens || []).forEach((c) => {
        contatosMap[c.nome] = c;
        contatosMap[c.id] = c;
      });
      if (dl) {
        dl.innerHTML = (j.itens || [])
          .map((c) => `<option value="${String(c.nome).replace(/"/g, "&quot;")}">`)
          .join("");
      }
    } catch (_) {}
  }

  async function carregarCategorias() {
    try {
      const j = await S.apiJson("/api/financeiro/categorias?natureza=Receita");
      const sel = el("nf_categoria");
      if (!sel) return;
      (j.itens || j.categorias || j.grupos || []).forEach((g) => {
        const addOpt = (c) => {
          if (!c || !c.id) return;
          const o = document.createElement("option");
          o.value = c.id;
          o.textContent = c.descricao || c.nome || c.tipo_categoria || "Categoria";
          sel.appendChild(o);
        };
        addOpt(g);
        (g.subcategorias || []).forEach(addOpt);
      });
    } catch (_) {}
  }

  function renderParcelas() {
    const wrap = el("parcelasWrap");
    const tb = el("tbodyParcelas");
    if (!tb) return;
    if (!parcelas.length) {
      if (wrap) wrap.style.display = "none";
      return;
    }
    if (wrap) wrap.style.display = "block";
    tb.innerHTML = parcelas
      .map(
        (p, i) => `<tr>
        <td>${p.numero_parcela || String(i + 1).padStart(3, "0")}</td>
        <td>${p.vencimento_fmt || p.vencimento || "—"}</td>
        <td>${(p.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
      </tr>`
      )
      .join("");
  }

  function preencherForm(n) {
    if (!n) return;
    const set = (id, v) => {
      if (el(id) != null && v != null) el(id).value = v;
    };
    const setChk = (id, v) => setBoolSelect(id, !!v);
    set("nf_id", n.id);
    set("nf_situacao", n.situacao);
    set("nf_numero_rps", n.numero_rps);
    set("nf_serie_rps", n.serie_rps);
    set("nf_numero_nfse", n.numero_nfse);
    if (n.data_emissao) set("nf_data_emissao", n.data_emissao);
    set("nf_natureza", n.natureza_operacao);
    set("nf_contato_id", n.contato_id);
    set("nf_cliente_nome", n.cliente_nome);
    set("nf_cliente_doc", n.cliente_cnpj_cpf);
    set("nf_cliente_ie", n.cliente_ie);
    set("nf_cliente_im", n.cliente_im);
    setChk("nf_consumidor_gov", n.cliente_consumidor_gov);
    set("nf_tipo_operacao", n.cliente_tipo_operacao);
    set("nf_cep", n.cliente_cep);
    set("nf_uf", n.cliente_uf);
    set("nf_municipio", n.cliente_municipio);
    set("nf_bairro", n.cliente_bairro);
    set("nf_endereco", n.cliente_endereco);
    set("nf_numero", n.cliente_numero);
    set("nf_complemento", n.cliente_complemento);
    set("nf_fone", n.cliente_fone);
    set("nf_email", n.cliente_email);
    set("nf_municipio_prestacao", n.municipio_prestacao);
    const it = (n.itens || [])[0] || {};
    set("nf_servico_desc", it.descricao);
    set("nf_servico_valor", fmtNum(it.valor));
    const imp = n.impostos || {};
    set("imp_cod_trib", imp.codigo_tributacao);
    set("imp_cnae", imp.codigo_cnae);
    set("imp_trib_mun", imp.codigo_trib_municipal);
    set("imp_nbs", imp.nbs);
    set("imp_indicador", imp.indicador_operacao);
    set("imp_aliq_iss", imp.aliquota_iss);
    set("imp_valor_iss", fmtNum(imp.valor_iss));
    setChk("imp_reter_iss", imp.reter_iss);
    setChk("imp_descontar_iss", imp.descontar_iss);
    setChk("imp_reter_inss", imp.reter_inss);
    setChk("imp_reter_csll", imp.reter_csll_pis_cofins);
    set("imp_ibpt", fmtNum(imp.valor_ibpt));
    set("imp_aprox", fmtNum(imp.valor_aprox_tributos));
    set("imp_cst", imp.cst_ibs_cbs);
    set("imp_class", imp.classificacao_tributaria_ibs_cbs);
    set("nf_desconto", fmtNum(n.desconto_incondicional));
    set("nf_base_calculo", fmtNum(n.base_calculo));
    set("nf_vendedor", n.vendedor);
    set("nf_comissao_pct", n.comissao_pct);
    set("nf_condicao", n.condicao_pagamento);
    set("nf_dias_pagamento", n.dias_pagamento != null ? n.dias_pagamento : 0);
    set("nf_qtd_parcelas", n.quantidade_parcelas != null ? n.quantidade_parcelas : 1);
    set("nf_intervalo_parcelas", n.intervalo_parcelas != null ? n.intervalo_parcelas : 30);
    if (n.categoria_id && el("nf_categoria")) el("nf_categoria").value = n.categoria_id;
    parcelas = n.parcelas || [];
    renderParcelas();
    recalcTotais();
  }

  async function carregarNota() {
    const id = window.__NFSE_ID;
    if (!id) {
      if (el("nf_data_emissao")) el("nf_data_emissao").value = new Date().toISOString().slice(0, 10);
      return;
    }
    const j = await S.apiJson(`${API}/${id}`);
    preencherForm(j.item);
  }

  async function salvar() {
    mostrarErro("");
    try {
      const p = payloadForm();
      const id = p.id;
      const url = id ? `${API}/${id}` : API;
      const method = id ? "PUT" : "POST";
      const j = await S.apiJson(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      S.toast("Nota salva.");
      if (!id && j.item?.id) {
        location.href = `/financeiro/notas-servico/${j.item.id}/editar`;
      }
    } catch (err) {
      mostrarErro(err.message);
    }
  }

  function cancelar() {
    location.href = "/financeiro/notas-servico";
  }

  el("nf_cliente_busca")?.addEventListener("change", aplicarClienteSelecionado);
  el("nf_cliente_busca")?.addEventListener("input", () => {
    clearTimeout(el("nf_cliente_busca")._tm);
    el("nf_cliente_busca")._tm = setTimeout(aplicarClienteSelecionado, 300);
  });

  ["nf_servico_valor", "nf_desconto", "nf_base_calculo", "imp_aliq_iss", "nf_comissao_pct"].forEach((id) => {
    el(id)?.addEventListener("input", recalcTotais);
  });

  el("btnGerarParcelas")?.addEventListener("click", async () => {
    const p = payloadForm();
    const qtd = p.quantidade_parcelas || 1;
    try {
      const nid = el("nf_id")?.value;
      const url = nid
        ? `${API}/${nid}/gerar-parcelas`
        : `${API}/gerar-parcelas-preview`;
      const j = await S.apiJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantidade: qtd,
          intervalo_dias: p.intervalo_parcelas,
          dias_pagamento: p.dias_pagamento,
          total_nota: p.total_nota,
          data_emissao: p.data_emissao,
        }),
      });
      parcelas = j.parcelas || [];
      renderParcelas();
      S.toast("Parcelas geradas.");
    } catch (err) {
      mostrarErro(err.message);
    }
  });

  ["btnSalvar", "btnSalvar2"].forEach((id) => el(id)?.addEventListener("click", salvar));
  ["btnCancelar", "btnCancelar2"].forEach((id) => el(id)?.addEventListener("click", cancelar));

  (async function init() {
    await carregarContatos();
    await carregarCategorias();
    await carregarNota();
  })();
})();
