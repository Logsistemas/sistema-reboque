(function () {
  const API = "/api/financeiro/contas-financeiras";
  const S = window.FinShared;
  let itens = [];
  const modal = document.getElementById("modalFin");
  const tbody = document.getElementById("tbodyLista");
  const erro = document.getElementById("finErro");

  function el(id) {
    return document.getElementById(id);
  }

  function filtrados() {
    const busca = (el("filtroBusca")?.value || "").toLowerCase();
    const tipo = el("filtroTipo")?.value || "";
    const st = el("filtroStatus")?.value || "";
    return itens.filter((i) => {
      if (busca && !`${i.nome} ${i.banco} ${i.tipo}`.toLowerCase().includes(busca)) return false;
      if (tipo && i.tipo !== tipo) return false;
      if (st && i.status !== st) return false;
      return true;
    });
  }

  function render() {
    const rows = filtrados();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">Nenhuma conta cadastrada.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (i) => `<tr>
        <td><b>${i.nome}</b></td>
        <td>${i.tipo || "-"}</td>
        <td>${i.banco || "-"}</td>
        <td>${i.saldo_atual_fmt}</td>
        <td>${S.statusBadge(i.status)}</td>
        <td><button type="button" class="ctrl-btn ctrl-btn-outline btn-edit" data-id="${i.id}">Editar</button></td>
      </tr>`
      )
      .join("");
    tbody.querySelectorAll(".btn-edit").forEach((b) =>
      b.addEventListener("click", () => abrir(itens.find((x) => x.id === b.dataset.id)))
    );
  }

  async function carregar() {
    const j = await S.apiJson(API);
    itens = j.itens || [];
    render();
  }

  function abrir(item) {
    modal.classList.add("open");
    S.mostrarErro(erro, "");
    el("regId").value = item?.id || "";
    el("modalTitulo").textContent = item ? item.nome : "Nova conta financeira";
    el("btnExcluir").style.display = item?.id ? "inline-block" : "none";
    el("f_nome").value = item?.nome || "";
    el("f_tipo").value = item?.tipo || "Banco";
    el("f_banco").value = item?.banco || "";
    el("f_agencia").value = item?.agencia || "";
    el("f_conta").value = item?.conta || "";
    el("f_saldo_inicial").value = item?.saldo_inicial ?? 0;
    el("f_saldo_atual").value = item?.saldo_atual_fmt || (item ? item.saldo_atual : "—");
    el("f_status").value = item?.status || "ativo";
    el("f_observacoes").value = item?.observacoes || "";
  }

  async function salvar() {
    const id = el("regId").value;
    const payload = {
      nome: el("f_nome").value.trim(),
      tipo: el("f_tipo").value,
      banco: el("f_banco").value,
      agencia: el("f_agencia").value,
      conta: el("f_conta").value,
      saldo_inicial: el("f_saldo_inicial").value,
      status: el("f_status").value,
      observacoes: el("f_observacoes").value,
    };
    try {
      const url = id ? `${API}/${id}` : API;
      const j = await S.apiJson(url, {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      modal.classList.remove("open");
      await carregar();
      if (j.item) abrir(j.item);
    } catch (e) {
      S.mostrarErro(erro, e.message);
    }
  }

  async function excluir() {
    const id = el("regId").value;
    if (!id || !confirm("Excluir esta conta financeira?")) return;
    try {
      await S.apiJson(`${API}/${id}`, { method: "DELETE" });
      modal.classList.remove("open");
      await carregar();
    } catch (e) {
      S.mostrarErro(erro, e.message);
    }
  }

  document.getElementById("btnNovo")?.addEventListener("click", () => abrir(null));
  document.getElementById("btnFechar")?.addEventListener("click", () => modal.classList.remove("open"));
  document.getElementById("btnSalvar")?.addEventListener("click", salvar);
  document.getElementById("btnExcluir")?.addEventListener("click", excluir);
  ["filtroBusca", "filtroTipo", "filtroStatus"].forEach((id) =>
    el(id)?.addEventListener("input", render)
  );
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });

  carregar();
})();
