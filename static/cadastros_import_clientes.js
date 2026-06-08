(function () {
  const modal = document.getElementById("modalImportClientes");
  if (!modal) return;

  const API_PREVIEW = "/api/cadastros/clientes/import/preview";
  const API_IMPORT = "/api/cadastros/clientes/import";

  function el(id) {
    return document.getElementById(id);
  }

  function mostrarErro(msg) {
    const node = el("impCliErro");
    if (!node) return;
    node.textContent = msg || "";
    node.style.display = msg ? "block" : "none";
  }

  function arquivoSelecionado() {
    return el("impCliArquivo")?.files?.[0] || null;
  }

  function resetRelatorio() {
    if (el("impCliRelatorio")) el("impCliRelatorio").style.display = "none";
    if (el("impCliRelatorioTxt")) el("impCliRelatorioTxt").textContent = "";
    if (el("impCliRelatorioErros")) {
      el("impCliRelatorioErros").style.display = "none";
      el("impCliRelatorioErros").innerHTML = "";
    }
  }

  function renderPreview(j) {
    el("impCliResumo").style.display = "block";
    el("impCliTotal").textContent = String(j.total ?? 0);
    el("impCliNovos").textContent = String(j.novos ?? 0);
    el("impCliAtualiz").textContent = String(j.atualizacoes ?? 0);
    el("impCliIgnorados").textContent = String(j.ignorados ?? 0);
    const tb = el("tbodyImpCliPreview");
    const amostra = j.amostra || [];
    if (!tb) return;
    if (!amostra.length) {
      tb.innerHTML = '<tr><td colspan="5" class="muted">Nenhum registro válido.</td></tr>';
    } else {
      tb.innerHTML = amostra
        .map(
          (r) => `<tr>
          <td>${r.linha ?? "—"}</td>
          <td>${r.nome ?? "—"}</td>
          <td>${r.documento ?? "—"}</td>
          <td>${r.cidade ?? "—"}</td>
          <td>${r.acao === "atualizar" ? "Atualizar" : "Inserir"}</td>
        </tr>`
        )
        .join("");
    }
    const av = el("impCliAvisos");
    if (av) {
      const avisos = j.avisos || [];
      if (avisos.length) {
        av.style.display = "block";
        av.innerHTML = `<strong>Avisos (${avisos.length}):</strong><ul>${avisos
          .slice(0, 15)
          .map((a) => `<li>Linha ${a.linha}: ${a.msg}</li>`)
          .join("")}</ul>`;
      } else {
        av.style.display = "none";
        av.innerHTML = "";
      }
    }
    el("btnImpCliConfirmar").disabled = !(j.novos || j.atualizacoes);
  }

  function renderRelatorio(j) {
    el("impCliRelatorio").style.display = "block";
    el("impCliRelatorioTxt").textContent =
      `Importação concluída: ${j.inseridos ?? 0} inserido(s), ${j.atualizados ?? 0} atualizado(s), ${j.ignorados ?? 0} ignorado(s).`;
    const erros = j.erros || [];
    const box = el("impCliRelatorioErros");
    if (box && erros.length) {
      box.style.display = "block";
      box.innerHTML = `<strong>Erros (${erros.length}):</strong><ul>${erros
        .slice(0, 20)
        .map((e) => `<li>Linha ${e.linha}: ${e.msg}</li>`)
        .join("")}</ul>`;
    }
    if (j.kpis && typeof window.__cadAtualizarKpis === "function") {
      window.__cadAtualizarKpis(j.kpis);
    }
    if (typeof window.__cadRecarregarContatos === "function") {
      window.__cadRecarregarContatos().catch(() => {});
    }
  }

  async function enviar(url) {
    const file = arquivoSelecionado();
    if (!file) throw new Error("Selecione um arquivo CSV.");
    const fd = new FormData();
    fd.append("arquivo", file, file.name);
    const r = await fetch(url, { method: "POST", body: fd });
    const j = await r.json();
    if (!j.ok) throw new Error(j.erro || "Erro na importação");
    return j;
  }

  function abrirModal() {
    mostrarErro("");
    resetRelatorio();
    el("impCliResumo").style.display = "none";
    el("btnImpCliConfirmar").disabled = true;
    if (el("impCliArquivo")) el("impCliArquivo").value = "";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function fecharModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  el("btnImportarClientes")?.addEventListener("click", abrirModal);
  el("btnImpCliFechar")?.addEventListener("click", fecharModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
  });

  el("btnImpCliPreview")?.addEventListener("click", async () => {
    mostrarErro("");
    resetRelatorio();
    try {
      const j = await enviar(API_PREVIEW);
      renderPreview(j);
    } catch (e) {
      mostrarErro(e.message);
    }
  });

  el("btnImpCliConfirmar")?.addEventListener("click", async () => {
    mostrarErro("");
    const btn = el("btnImpCliConfirmar");
    if (btn) btn.disabled = true;
    try {
      const j = await enviar(API_IMPORT);
      renderRelatorio(j);
      renderPreview({
        total: (j.inseridos || 0) + (j.atualizados || 0) + (j.ignorados || 0),
        novos: 0,
        atualizacoes: 0,
        ignorados: j.ignorados || 0,
        amostra: (j.detalhes || []).slice(0, 8).map((d) => ({
          linha: d.linha,
          nome: d.nome,
          documento: "—",
          cidade: "—",
          acao: d.acao,
        })),
        avisos: j.erros || [],
      });
    } catch (e) {
      mostrarErro(e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
})();
