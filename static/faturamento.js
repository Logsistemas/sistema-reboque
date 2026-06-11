(function () {
  const chkAll = document.getElementById("chk-all");
  const bulkBar = document.getElementById("bulk-bar");
  const bulkCount = document.getElementById("bulk-count");
  const formFiltros = document.getElementById("fat-form-filtros");
  const loadingEl = document.getElementById("fat-loading");

  function getCheckboxes() {
    return Array.from(document.querySelectorAll(".chk-servico"));
  }

  function atualizarBarra() {
    const checked = getCheckboxes().filter((c) => c.checked);
    const n = checked.length;
    if (n > 0) {
      bulkBar.classList.add("visible");
      bulkCount.textContent =
        n + (n === 1 ? " serviço selecionado" : " serviço(s) selecionado(s)");
    } else {
      bulkBar.classList.remove("visible");
    }
    getCheckboxes().forEach((c) => {
      c.closest("tr")?.classList.toggle("selected", c.checked);
    });
    if (chkAll) {
      const all = getCheckboxes();
      chkAll.checked = all.length > 0 && all.every((c) => c.checked);
      chkAll.indeterminate = n > 0 && n < all.length;
    }
  }

  if (chkAll) {
    chkAll.addEventListener("change", () => {
      const marcar = chkAll.checked;
      getCheckboxes().forEach((c) => {
        c.checked = marcar;
      });
      atualizarBarra();
    });
  }

  getCheckboxes().forEach((c) => {
    c.addEventListener("change", atualizarBarra);
    c.addEventListener("click", (e) => e.stopPropagation());
  });

  window.limparSelecao = function limparSelecao() {
    getCheckboxes().forEach((c) => {
      c.checked = false;
    });
    if (chkAll) {
      chkAll.checked = false;
      chkAll.indeterminate = false;
    }
    atualizarBarra();
  };

  window.acaoMassa = function acaoMassa(status) {
    const checked = getCheckboxes().filter((c) => c.checked);
    if (!checked.length) return;
    const n = checked.length;
    const labels = {
      para_faturar: "para faturar",
      faturado: "faturado",
      negociacao: "para negociar",
      para_conferir: "para conferir",
    };
    if (
      !confirm(
        'Confirmar alteração de ' +
          n +
          ' serviço(s) para "' +
          (labels[status] || status) +
          '"?'
      )
    )
      return;

    const form = document.getElementById("form-acao-massa");
    form.querySelectorAll('input[name="servico_ids"]').forEach((el) => el.remove());
    checked.forEach((ch) => {
      const inp = document.createElement("input");
      inp.type = "hidden";
      inp.name = "servico_ids";
      inp.value = ch.value;
      form.appendChild(inp);
    });
    document.getElementById("massa-status").value = status;
    if (loadingEl) loadingEl.hidden = false;
    form.submit();
  };

  /* Menu de ações por linha */
  function fecharMenus(exceto) {
    document.querySelectorAll(".fat-act-menu.open").forEach((menu) => {
      if (menu === exceto) return;
      menu.classList.remove("open");
      const btn = menu.querySelector(".fat-act-toggle");
      const panel = menu.querySelector(".fat-act-dropdown");
      if (btn) btn.setAttribute("aria-expanded", "false");
      if (panel) panel.hidden = true;
    });
  }

  document.querySelectorAll(".fat-act-menu").forEach((menu) => {
    const toggle = menu.querySelector(".fat-act-toggle");
    const panel = menu.querySelector(".fat-act-dropdown");
    if (!toggle || !panel) return;

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const abrir = !menu.classList.contains("open");
      fecharMenus(abrir ? menu : null);
      menu.classList.toggle("open", abrir);
      panel.hidden = !abrir;
      toggle.setAttribute("aria-expanded", abrir ? "true" : "false");
    });

    panel.querySelectorAll("form").forEach((form) => {
      form.addEventListener("submit", () => {
        if (loadingEl) loadingEl.hidden = false;
      });
    });
  });

  document.addEventListener("click", () => fecharMenus(null));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharMenus(null);
  });

  /* Loading ao filtrar ou submeter status */
  if (formFiltros) {
    formFiltros.addEventListener("submit", () => {
      document.body.classList.add("fat-skeleton");
      if (loadingEl) loadingEl.hidden = false;
    });
  }

  /* Exportar Excel — somente selecionados */
  const btnExport = document.getElementById("btn-export-excel");

  async function exportarExcel() {
    const checked = getCheckboxes().filter((c) => c.checked);
    if (!checked.length) {
      alert("Selecione ao menos um serviço para exportar.");
      return;
    }

    const formData = new FormData();
    checked.forEach((ch) => formData.append("servico_ids", ch.value));

    try {
      if (btnExport) btnExport.disabled = true;
      const res = await fetch("/faturamento/exportar-excel", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let msg = "Não foi possível exportar.";
        try {
          const data = await res.json();
          if (data?.erro) msg = data.erro;
        } catch (parseErr) {
          /* resposta não JSON */
        }
        alert(msg);
        return;
      }

      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const match = disp.match(/filename="?([^";\n]+)"?/i);
      const hoje = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const fallback =
        "faturamento_servicos_selecionados_" +
        pad(hoje.getDate()) +
        "-" +
        pad(hoje.getMonth() + 1) +
        "-" +
        hoje.getFullYear() +
        ".xlsx";
      const filename = match ? match[1] : fallback;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("[faturamento export]", e);
      alert("Não foi possível exportar.");
    } finally {
      if (btnExport) btnExport.disabled = false;
    }
  }

  if (btnExport) {
    btnExport.addEventListener("click", exportarExcel);
  }
})();
