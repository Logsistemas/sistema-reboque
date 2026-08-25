(function () {
  const chkAll = document.getElementById("chk-all");
  const bulkBar = document.getElementById("bulk-bar");
  const bulkCount = document.getElementById("bulk-count");
  const formFiltros = document.getElementById("formProcurar");
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

  /* KM Excedente — calculado em background no servidor (sem botão, sem loop
     de requisições no frontend). Se a linha ainda estiver com o skeleton
     "Calculando..." quando a página carrega, o backend já disparou o cálculo
     dela em background; ela aparece pronta na próxima vez que a tela for
     aberta ou filtrada — sem nenhuma ação do usuário. */

  /* Modal "Procurar" (estilo Autem) */
  const modalOverlay = document.getElementById("modalProcurarOverlay");
  const btnAbrirProcurar = document.getElementById("btnAbrirProcurar");
  const btnFecharProcurar = document.getElementById("btnFecharProcurar");

  function abrirModalProcurar() {
    if (!modalOverlay) return;
    modalOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function fecharModalProcurar() {
    if (!modalOverlay) return;
    modalOverlay.hidden = true;
    document.body.style.overflow = "";
    document.querySelectorAll(".fat-msel.open").forEach((m) => fecharMsel(m));
  }

  if (btnAbrirProcurar) btnAbrirProcurar.addEventListener("click", abrirModalProcurar);
  if (btnFecharProcurar) btnFecharProcurar.addEventListener("click", fecharModalProcurar);
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) fecharModalProcurar();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOverlay && !modalOverlay.hidden) fecharModalProcurar();
  });

  /* Dropdowns multi-seleção com busca (Seguradora, Motorista, Tipo, Status) */
  function fecharMsel(msel) {
    msel.classList.remove("open");
    const panel = msel.querySelector(".fat-msel-panel");
    if (panel) panel.hidden = true;
  }

  function atualizarTextoMsel(msel) {
    const conteudo = msel.querySelector(".fat-msel-trigger-content");
    if (!conteudo) return;
    const placeholder = msel.dataset.placeholder || "Todos";
    const marcados = Array.from(msel.querySelectorAll('input[type="checkbox"]:checked'));

    conteudo.innerHTML = "";

    if (marcados.length === 0) {
      const span = document.createElement("span");
      span.className = "fat-msel-placeholder-text";
      span.textContent = placeholder;
      conteudo.appendChild(span);
      return;
    }

    if (marcados.length <= 3) {
      marcados.forEach((chk) => {
        const rotulo = chk.closest(".fat-msel-option")?.querySelector("span")?.textContent || chk.value;
        const chip = document.createElement("span");
        chip.className = "fat-msel-chip";
        const texto = document.createElement("span");
        texto.textContent = rotulo;
        chip.appendChild(texto);
        const remover = document.createElement("span");
        remover.className = "fat-msel-chip-remove";
        remover.setAttribute("role", "button");
        remover.setAttribute("tabindex", "0");
        remover.setAttribute("title", "Remover");
        remover.textContent = "×";
        remover.addEventListener("click", (e) => {
          e.stopPropagation();
          chk.checked = false;
          atualizarTextoMsel(msel);
        });
        remover.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            chk.checked = false;
            atualizarTextoMsel(msel);
          }
        });
        chip.appendChild(remover);
        conteudo.appendChild(chip);
      });
      return;
    }

    const span = document.createElement("span");
    span.className = "fat-msel-count-text";
    span.textContent = `${marcados.length} selecionado(s)`;
    conteudo.appendChild(span);
  }

  document.querySelectorAll(".fat-msel").forEach((msel) => {
    const trigger = msel.querySelector(".fat-msel-trigger");
    const panel = msel.querySelector(".fat-msel-panel");
    const busca = msel.querySelector(".fat-msel-search");
    const opcoes = Array.from(msel.querySelectorAll(".fat-msel-option"));

    atualizarTextoMsel(msel);

    if (trigger) {
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const abrir = !msel.classList.contains("open");
        document.querySelectorAll(".fat-msel.open").forEach((m) => {
          if (m !== msel) fecharMsel(m);
        });
        msel.classList.toggle("open", abrir);
        if (panel) panel.hidden = !abrir;
        if (abrir && busca) busca.focus();
      });
    }

    if (panel) panel.addEventListener("click", (e) => e.stopPropagation());

    if (busca) {
      busca.addEventListener("input", () => {
        const termo = busca.value.trim().toLowerCase();
        opcoes.forEach((opt) => {
          const texto = (opt.textContent || "").trim().toLowerCase();
          opt.classList.toggle("fat-msel-hide", termo.length > 0 && !texto.includes(termo));
        });
      });
    }

    msel.querySelectorAll(".fat-msel-bulk-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const marcar = btn.dataset.action === "all";
        opcoes.forEach((opt) => {
          if (opt.classList.contains("fat-msel-hide")) return;
          const chk = opt.querySelector('input[type="checkbox"]');
          if (chk) chk.checked = marcar;
        });
        atualizarTextoMsel(msel);
      });
    });

    msel.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
      chk.addEventListener("change", () => atualizarTextoMsel(msel));
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".fat-msel.open").forEach((m) => fecharMsel(m));
  });
})();
