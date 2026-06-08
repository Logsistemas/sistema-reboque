(function () {
  const S = window.FinShared;
  const API = "/api/financeiro/configuracao-fiscal";
  const LS_ULTIMA = "fcf_ultima_validacao";

  function el(id) {
    return document.getElementById(id);
  }

  function parseNum(v) {
    if (v == null || v === "") return 0;
    const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  function mostrarErro(id, msg) {
    const node = el(id);
    if (!node) return;
    node.textContent = msg || "";
    node.style.display = msg ? "block" : "none";
  }

  function fmtDataHora(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR");
    } catch (_) {
      return iso;
    }
  }

  function registrarValidacao() {
    const agora = new Date().toISOString();
    localStorage.setItem(LS_ULTIMA, agora);
    if (el("stUltimaValidacao")) el("stUltimaValidacao").textContent = fmtDataHora(agora);
  }

  function setBadge(node, nivel, texto) {
    if (!node) return;
    node.textContent = texto;
    node.className = "fcf-badge-pill";
    if (nivel === "ok") node.classList.add("fcf-pill-ok");
    else if (nivel === "warn") node.classList.add("fcf-pill-warn");
    else if (nivel === "err") node.classList.add("fcf-pill-err");
    else node.classList.add("fcf-pill-neutral");
  }

  function payloadConfig() {
    return {
      razao_social: el("cf_razao")?.value?.trim(),
      nome_fantasia: el("cf_fantasia")?.value?.trim(),
      cnpj: el("cf_cnpj")?.value?.trim(),
      inscricao_municipal: el("cf_im")?.value?.trim(),
      inscricao_estadual: el("cf_ie")?.value?.trim(),
      cnae_principal: el("cf_cnae")?.value?.trim(),
      codigo_servico_municipal: el("cf_cod_serv")?.value?.trim(),
      codigo_servico_nacional: el("cf_cod_serv_nac")?.value?.trim(),
      municipio_emissao: el("cf_municipio")?.value?.trim(),
      codigo_ibge_municipio: el("cf_ibge")?.value?.trim(),
      uf_municipio: el("cf_uf")?.value?.trim(),
      regime_tributario: el("cf_regime")?.value,
      aliquota_iss_padrao: parseNum(el("cf_iss")?.value),
      ambiente: el("cf_ambiente")?.value || "homologacao",
    };
  }

  function preencherConfig(c) {
    if (!c) return;
    const set = (id, v) => {
      if (el(id) != null && v != null && v !== undefined) el(id).value = v;
    };
    set("cf_razao", c.razao_social);
    set("cf_fantasia", c.nome_fantasia);
    set("cf_cnpj", c.cnpj_fmt || c.cnpj);
    set("cf_im", c.inscricao_municipal);
    set("cf_ie", c.inscricao_estadual);
    set("cf_cnae", c.cnae_principal);
    set("cf_cod_serv", c.codigo_servico_municipal);
    set("cf_municipio", c.municipio_emissao);
    set("cf_ibge", c.codigo_ibge_municipio);
    set("cf_uf", c.uf_municipio);
    set("cf_cod_serv_nac", c.codigo_servico_nacional);
    set("cf_regime", c.regime_tributario);
    if (c.aliquota_iss_padrao != null) {
      set("cf_iss", String(c.aliquota_iss_padrao).replace(".", ","));
    }
    set("cf_ambiente", c.ambiente || "homologacao");
  }

  function renderPendencias(emissao) {
    const card = el("cardPendencias");
    const ul = el("listaPendencias");
    const pend = emissao?.pendencias || [];
    if (!card || !ul) return;

    if (!pend.length) {
      card.classList.add("fcf-card-pendencias--ok");
      ul.innerHTML = '<li class="fcf-pend-ok-msg">🟢 Empresa apta para emissão</li>';
      return;
    }

    card.classList.remove("fcf-card-pendencias--ok");
    ul.innerHTML = pend.map((p) => `<li>🔴 ${p}</li>`).join("");
  }

  function renderPainelStatus(emissao, comunicacaoExtra) {
    const e = emissao || {};
    const com = comunicacaoExtra || {};

    setBadge(el("stAmbiente"), "neutral", e.ambiente_label || "—");

    setBadge(
      el("stEmpresa"),
      e.empresa_pronta ? "ok" : "warn",
      e.empresa_pronta ? "🟢 Apta" : "🟡 Não apta"
    );

    setBadge(
      el("stCertificado"),
      e.certificado_valido ? "ok" : "err",
      e.certificado_valido ? "🟢 Válido" : "🔴 Inválido"
    );

    if (com.ok === true) {
      setBadge(el("stComunicacao"), "ok", "🟢 OK");
    } else if (com.ok === false) {
      setBadge(el("stComunicacao"), "err", "🔴 Falha");
    } else {
      setBadge(el("stComunicacao"), "neutral", e.comunicacao_label || "Não testada");
    }

    if (el("stUltimaValidacao")) {
      el("stUltimaValidacao").textContent = fmtDataHora(localStorage.getItem(LS_ULTIMA));
    }
  }

  function renderCert(cert) {
    const det = el("certDetalhes");
    const alerta = el("certAlerta");
    const exportBtn = el("btnExportCert");
    if (!det) return;

    if (!cert) {
      det.innerHTML = '<p class="fcf-empty">Envie o certificado A1 (.pfx) para habilitar a emissão.</p>';
      if (alerta) {
        alerta.style.display = "block";
        alerta.className = "fcf-cert-alert fcf-cert-alert--err";
        alerta.textContent = "🔴 Certificado não configurado — emissão bloqueada.";
      }
      if (exportBtn) exportBtn.disabled = true;
      return;
    }

    const dias = cert.dias_restantes != null ? cert.dias_restantes : "—";
    const statusOk = cert.valido && cert.cnpj_confere_empresa !== false;
    const statusLine = statusOk
      ? "🟢 Certificado válido"
      : cert.vencido
        ? "🔴 Certificado vencido"
        : "🟡 Verificar certificado";

    det.innerHTML = `
      <div class="fcf-cert-status-line ${statusOk ? "is-ok" : cert.vencido ? "is-err" : "is-warn"}">${statusLine}</div>
      <dl class="fcf-cert-dl">
        <div><dt>Titular</dt><dd>${cert.titular || cert.razao_social || "—"}</dd></div>
        <div><dt>CNPJ</dt><dd>${cert.cnpj_fmt || cert.cnpj || "—"}</dd></div>
        <div><dt>Emissor</dt><dd>${cert.emissor || "ICP-Brasil"}</dd></div>
        <div><dt>Data de emissão</dt><dd>${cert.emissao_fmt || "—"}</dd></div>
        <div><dt>Validade</dt><dd>${cert.validade_fmt || "—"}</dd></div>
        <div><dt>Dias restantes</dt><dd>${dias}</dd></div>
      </dl>`;

    if (alerta && cert.alerta && cert.alerta.nivel !== "ok") {
      alerta.style.display = "block";
      const n = cert.alerta.nivel;
      alerta.className = `fcf-cert-alert fcf-cert-alert--${n === "atencao" || n === "critico" ? "warn" : "err"}`;
      const icon = n === "atencao" ? "🟡" : n === "critico" ? "🟠" : "🔴";
      alerta.textContent = `${icon} ${cert.alerta.mensagem || ""}`;
    } else if (alerta) {
      alerta.style.display = "none";
    }

    if (exportBtn) exportBtn.disabled = false;
  }

  function aplicarResposta(j, comunicacaoExtra) {
    preencherConfig(j.config);
    renderPendencias(j.emissao);
    renderPainelStatus(j.emissao, comunicacaoExtra || j.comunicacao);
    renderCert(j.certificado);
  }

  async function carregar() {
    const j = await S.apiJson(API);
    aplicarResposta(j);
  }

  async function salvarConfig() {
    mostrarErro("fiscalErro", "");
    try {
      const j = await S.apiJson(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadConfig()),
      });
      aplicarResposta(j);
      registrarValidacao();
      S.toast("Configuração salva com sucesso.");
    } catch (err) {
      mostrarErro("fiscalErro", err.message);
      S.toast(err.message, true);
    }
  }

  async function salvarCert() {
    mostrarErro("certErro", "");
    const file = el("certArquivo")?.files?.[0];
    const senha = el("certSenha")?.value || "";
    if (!file) {
      S.toast("Selecione o arquivo .pfx ou .p12", true);
      return;
    }
    const fd = new FormData();
    fd.append("arquivo", file, file.name);
    fd.append("senha", senha);
    try {
      const r = await fetch(`${API}/certificado`, { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro ao salvar certificado");
      aplicarResposta(j);
      if (el("certArquivo")) el("certArquivo").value = "";
      if (el("certSenha")) el("certSenha").value = "";
      registrarValidacao();
      S.toast("Certificado atualizado.");
    } catch (err) {
      mostrarErro("certErro", err.message);
      S.toast(err.message, true);
    }
  }

  async function validarCert() {
    mostrarErro("certErro", "");
    const file = el("certArquivo")?.files?.[0];
    const senha = el("certSenha")?.value || "";
    try {
      let r;
      if (file) {
        const fd = new FormData();
        fd.append("arquivo", file, file.name);
        fd.append("senha", senha);
        r = await fetch(`${API}/certificado/validar`, { method: "POST", body: fd });
      } else {
        r = await fetch(`${API}/certificado/validar`, { method: "POST" });
      }
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha na validação");
      const v = j.validacao;
      registrarValidacao();
      if (!v.cnpj_confere_empresa) {
        S.toast(`Certificado pertence a outro CNPJ (${v.cnpj_fmt}).`, true);
      } else {
        S.toast(`Certificado válido — ${v.titular || "OK"}`);
      }
    } catch (err) {
      mostrarErro("certErro", err.message);
      S.toast(err.message, true);
    }
  }

  async function testarComunicacao() {
    try {
      const j = await S.apiJson(`${API}/testar-comunicacao`, { method: "POST" });
      aplicarResposta(j, j.comunicacao);
      registrarValidacao();
      S.toast(j.comunicacao?.mensagem || "Teste concluído.", !j.comunicacao?.ok);
    } catch (err) {
      setBadge(el("stComunicacao"), "err", "🔴 Falha");
      S.toast(err.message, true);
    }
  }

  el("btnSalvarConfig")?.addEventListener("click", salvarConfig);
  el("btnSalvarCert")?.addEventListener("click", salvarCert);
  el("btnValidarCert")?.addEventListener("click", validarCert);
  el("btnTestarComunicacao")?.addEventListener("click", testarComunicacao);
  el("btnExportCert")?.addEventListener("click", () => {
    window.location.href = `${API}/certificado/exportar`;
  });

  carregar().catch((e) => S.toast(e.message, true));
})();
