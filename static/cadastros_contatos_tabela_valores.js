(function () {
  if (document.body.dataset.filtroCliente !== "1") return;

  const tbody = document.getElementById("tbodyTabelaValores");
  const btnSalvar = document.getElementById("btnSalvarTabelaValores");
  const msg = document.getElementById("cadMsgTabelaValores");
  if (!tbody) return;

  let linhas = [];

  function el(id) {
    return document.getElementById(id);
  }

  function brValor(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    if (!linhas.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">Salve o cliente para carregar a tabela de valores.</td></tr>';
      return;
    }

    const grupos = {};
    linhas.forEach((l, idx) => {
      const tipo = l.tipo_servico || "";
      if (!grupos[tipo]) grupos[tipo] = { label: l.label_tipo || tipo, itens: [] };
      grupos[tipo].itens.push({ ...l, _idx: idx });
    });

    let html = "";
    Object.keys(grupos)
      .sort()
      .forEach((tipo) => {
        const g = grupos[tipo];
        html += `<tr class="tv-grupo"><td colspan="4" style="background:#f1f5f9;font-weight:800;padding:10px 12px">${esc(g.label)} <span class="muted" style="font-weight:600;font-size:11px">${esc(tipo)}</span></td></tr>`;
        g.itens.forEach((l) => {
          const valor = brValor(l.valor_unitario ?? l.valor);
          const ativo = l.ativo !== false;
          const obs = l.observacao || "";
          html += `<tr data-idx="${l._idx}">
            <td style="padding-left:22px">— ${esc(l.label_item || l.item)}</td>
            <td><input type="number" step="0.01" min="0" class="tv-valor" value="${valor > 0 ? valor.toFixed(2) : ""}" placeholder="0,00"></td>
            <td style="text-align:center"><input type="checkbox" class="tv-ativo" ${ativo ? "checked" : ""}></td>
            <td><input type="text" class="tv-obs" value="${esc(obs)}" placeholder="Opcional"></td>
          </tr>`;
        });
      });
    tbody.innerHTML = html;
  }

  function coletarPayload() {
    const saida = [];
    tbody.querySelectorAll("tr[data-idx]").forEach((tr) => {
      const idx = Number(tr.dataset.idx);
      const base = linhas[idx] || {};
      saida.push({
        id: base.id,
        tipo_servico: base.tipo_servico,
        item: base.item,
        valor_unitario: brValor(tr.querySelector(".tv-valor")?.value),
        ativo: !!tr.querySelector(".tv-ativo")?.checked,
        observacao: (tr.querySelector(".tv-obs")?.value || "").trim(),
      });
    });
    return saida;
  }

  async function carregar(cid) {
    if (!cid) {
      linhas = [];
      render();
      return;
    }
    const j = await fetch(`/api/cadastros/contatos/${cid}/tabela-valores`).then((r) => r.json());
    if (!j.ok) {
      linhas = [];
      render();
      return;
    }
    linhas = j.itens || [];
    render();
  }

  async function salvar() {
    const cid = el("contatoId")?.value;
    if (!cid) {
      alert("Salve o cadastro do cliente antes de gravar a tabela de valores.");
      return;
    }
    btnSalvar.disabled = true;
    msg.style.display = "none";
    try {
      const r = await fetch(`/api/cadastros/contatos/${cid}/tabela-valores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: coletarPayload() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro ao salvar");
      linhas = j.itens || [];
      render();
      msg.textContent = "Tabela de valores salva com sucesso.";
      msg.style.display = "block";
    } catch (e) {
      alert(e.message || "Erro ao salvar tabela");
    } finally {
      btnSalvar.disabled = false;
    }
  }

  window.__cadCarregarTabelaValores = carregar;

  btnSalvar?.addEventListener("click", salvar);

  const modal = document.getElementById("modalContato");
  if (modal) {
    const obs = new MutationObserver(() => {
      const cid = el("contatoId")?.value;
      if (modal.classList.contains("open") && cid) carregar(cid);
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["class"] });
  }
})();
