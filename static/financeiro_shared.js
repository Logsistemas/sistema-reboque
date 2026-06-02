window.FinShared = {
  toast(msg, ms = 3200) {
    const t = document.getElementById("finToast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(t._tm);
    t._tm = setTimeout(() => { t.style.display = "none"; }, ms);
  },

  atualizarKpis(k) {
    if (!k) return;
    const map = {
      kpiTotalPagar: "total_pagar_fmt",
      kpiTotalReceber: "total_receber_fmt",
      kpiSaldoCaixa: "saldo_caixa_fmt",
      kpiVencidos: "vencidos_fmt",
      kpiPagoMes: "pago_mes_fmt",
      kpiRecebidoMes: "recebido_mes_fmt",
    };
    Object.entries(map).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el && k[key] != null) el.textContent = k[key];
    });
  },

  atualizarPainel(p) {
    if (!p) return;
    const q = document.getElementById("painelQtd");
    const t = document.getElementById("painelTotal");
    if (q) q.textContent = String(p.quantidade ?? 0);
    if (t) t.textContent = p.valor_total_fmt || "R$ 0,00";
  },

  statusBadge(st) {
    const s = (st || "em_aberto").toLowerCase().replace(/\s/g, "_");
    const label = {
      em_aberto: "Em aberto",
      pago: "Pago",
      recebido: "Recebido",
      atrasado: "Vencido",
      cancelado: "Cancelado",
    }[s] || st;
    return `<span class="fin-status ${s}">${label}</span>`;
  },

  isoDate(v) {
    if (!v) return "";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return "";
  },

  /** Converte valor digitado (BR ou EN) para número decimal. Ex.: 173.927,85 → 173927.85 */
  parseMoedaBr(v, defaultValue = 0) {
    if (v === null || v === undefined) return defaultValue;
    let s = String(v).trim().replace(/\s/g, "");
    if (!s) return defaultValue;
    s = s.replace(/^R\$\s?/i, "");
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : defaultValue;
  },

  formatMoedaInput(v) {
    const n = FinShared.parseMoedaBr(v, NaN);
    if (!Number.isFinite(n)) return String(v ?? "");
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  hojeISO() {
    return new Date().toISOString().slice(0, 10);
  },

  async apiJson(url, opts) {
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.erro || "Erro na requisição");
    return j;
  },

  preencherSelectContas(sel, contas, valor) {
    if (!sel) return;
    const v = valor || "";
    const keep = sel.querySelector('option[value=""]')?.textContent || "— Selecione —";
    sel.innerHTML = `<option value="">${keep}</option>`;
    (contas || []).forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = `${c.nome}${c.saldo_atual_fmt ? " (" + c.saldo_atual_fmt + ")" : ""}`;
      if (String(c.id) === String(v)) o.selected = true;
      sel.appendChild(o);
    });
  },

  _categoriasCache: {},

  async carregarCategorias(natureza) {
    const key = natureza || "all";
    if (this._categoriasCache[key]) return this._categoriasCache[key];
    const q = natureza ? `?natureza=${encodeURIComponent(natureza)}` : "";
    const j = await this.apiJson(`/api/financeiro/categorias${q}`);
    this._categoriasCache[key] = j;
    return j;
  },

  preencherSelectCategorias(sel, data, valorId, opts) {
    if (!sel) return;
    const placeholder = (opts && opts.placeholder) || "— Selecione —";
    const id = String(valorId || "");
    sel.innerHTML = `<option value="">${placeholder}</option>`;
    (data?.grupos || []).forEach((g) => {
      const og = document.createElement("optgroup");
      og.label = g.descricao;
      const oMain = document.createElement("option");
      oMain.value = g.id;
      oMain.textContent = `${g.descricao} (Principal)`;
      if (id === String(g.id)) oMain.selected = true;
      og.appendChild(oMain);
      (g.subcategorias || []).forEach((s) => {
        const o = document.createElement("option");
        o.value = s.id;
        o.textContent = `↳ ${s.descricao}`;
        if (id === String(s.id)) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  },

  labelCategoria(item) {
    return item?.categoria_label || item?.categoria || "-";
  },

  initTabsModal(root) {
    if (!root) return;
    root.querySelectorAll("[data-fin-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-fin-tab");
        root.querySelectorAll("[data-fin-tab]").forEach((b) => b.classList.toggle("active", b === btn));
        root.querySelectorAll("[data-fin-panel]").forEach((p) =>
          p.classList.toggle("active", p.getAttribute("data-fin-panel") === tab)
        );
      });
    });
  },

  mostrarErro(el, msg) {
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  },

  bindToolStubs() {
    document.querySelectorAll(".fin-tool-stub").forEach((btn) => {
      btn.addEventListener("click", () => {
        FinShared.toast("Ferramenta disponível em versão futura.");
      });
    });
  },

  storageGet(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  },

  storageSet(key, data) {
    try {
      sessionStorage.setItem(key, JSON.stringify(data));
    } catch (_) {}
  },

  _pad2(n) {
    return String(n).padStart(2, "0");
  },

  isoFromDate(d) {
    return `${d.getFullYear()}-${FinShared._pad2(d.getMonth() + 1)}-${FinShared._pad2(d.getDate())}`;
  },

  fmtDataBr(iso) {
    if (!iso || iso.length < 10) return "";
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  },

  calcPeriodo(preset, extra) {
    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);
    const labels = {
      hoje: "Hoje",
      esta_semana: "Esta semana",
      semana_passada: "Semana passada",
      este_mes: "Este mês",
      mes_passado: "Mês passado",
    };
    if (preset === "hoje") {
      const iso = FinShared.isoFromDate(hoje);
      return { data_ini: iso, data_fim: iso, label: labels.hoje };
    }
    if (preset === "esta_semana") {
      const start = new Date(hoje);
      const dow = start.getDay();
      start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return {
        data_ini: FinShared.isoFromDate(start),
        data_fim: FinShared.isoFromDate(end),
        label: labels.esta_semana,
      };
    }
    if (preset === "semana_passada") {
      const start = new Date(hoje);
      const dow = start.getDay();
      start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1) - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return {
        data_ini: FinShared.isoFromDate(start),
        data_fim: FinShared.isoFromDate(end),
        label: labels.semana_passada,
      };
    }
    if (preset === "este_mes") {
      const y = hoje.getFullYear();
      const m = hoje.getMonth();
      const ult = new Date(y, m + 1, 0).getDate();
      return {
        data_ini: `${y}-${FinShared._pad2(m + 1)}-01`,
        data_fim: `${y}-${FinShared._pad2(m + 1)}-${FinShared._pad2(ult)}`,
        label: labels.este_mes,
      };
    }
    if (preset === "mes_passado") {
      const y = hoje.getFullYear();
      const m = hoje.getMonth() - 1;
      const d = new Date(y, m, 1);
      const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return {
        data_ini: `${d.getFullYear()}-${FinShared._pad2(d.getMonth() + 1)}-01`,
        data_fim: `${d.getFullYear()}-${FinShared._pad2(d.getMonth() + 1)}-${FinShared._pad2(ult)}`,
        label: labels.mes_passado,
      };
    }
    if (preset === "selecionar_mes" && extra?.ym) {
      const [y, m] = extra.ym.split("-");
      const ult = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
      const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      return {
        data_ini: `${y}-${m}-01`,
        data_fim: `${y}-${m}-${FinShared._pad2(ult)}`,
        label: `${meses[parseInt(m, 10) - 1]}/${y}`,
      };
    }
    if (preset === "customizado" && extra?.data_ini && extra?.data_fim) {
      return {
        data_ini: extra.data_ini,
        data_fim: extra.data_fim,
        label: "Período customizado",
      };
    }
    return FinShared.calcPeriodo("este_mes");
  },

  aplicarPeriodoUI(range) {
    const ini = document.getElementById("topDataIni");
    const fim = document.getElementById("topDataFim");
    const lbl = document.getElementById("lblPeriodo");
    const lblRange = document.getElementById("lblPeriodoRange");
    if (ini) ini.value = range.data_ini || "";
    if (fim) fim.value = range.data_fim || "";
    if (lbl) lbl.textContent = range.label || "Período";
    if (lblRange && range.data_ini && range.data_fim) {
      lblRange.textContent = `${FinShared.fmtDataBr(range.data_ini)} — ${FinShared.fmtDataBr(range.data_fim)}`;
    } else if (lblRange) {
      lblRange.textContent = "";
    }
  },

  initFiltroPeriodo(opts) {
    const btn = document.getElementById("btnPeriodo");
    const panel = document.getElementById("panelPeriodo");
    if (!btn || !panel) return null;

    const onApply = typeof opts?.onApply === "function" ? opts.onApply : () => {};
    const storageKey = opts?.storageKey || "fin_periodo";
    let fechando = false;

    function fecharPanel() {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }

    function abrirPanel() {
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
    }

    function aplicar(range, save) {
      FinShared.aplicarPeriodoUI(range);
      if (save !== false) {
        FinShared.storageSet(storageKey, range);
      }
      fecharPanel();
      onApply(range);
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (panel.hidden) abrirPanel();
      else fecharPanel();
    });

    panel.querySelectorAll(".fin-period-opt").forEach((opt) => {
      opt.addEventListener("click", () => {
        const preset = opt.dataset.preset;
        const monthWrap = document.getElementById("periodMonthWrap");
        const customWrap = document.getElementById("periodCustomWrap");
        if (monthWrap) monthWrap.hidden = preset !== "selecionar_mes";
        if (customWrap) customWrap.hidden = preset !== "customizado";
        if (preset === "selecionar_mes" || preset === "customizado") return;
        aplicar(FinShared.calcPeriodo(preset));
      });
    });

    document.getElementById("periodMonthApply")?.addEventListener("click", () => {
      const ym = document.getElementById("periodPickMonth")?.value;
      if (!ym) return FinShared.toast("Selecione um mês.");
      aplicar(FinShared.calcPeriodo("selecionar_mes", { ym }));
    });

    document.getElementById("periodCustomApply")?.addEventListener("click", () => {
      const di = document.getElementById("periodCustomIni")?.value;
      const df = document.getElementById("periodCustomFim")?.value;
      if (!di || !df) return FinShared.toast("Informe data inicial e final.");
      if (di > df) return FinShared.toast("Data inicial não pode ser maior que a final.");
      aplicar(FinShared.calcPeriodo("customizado", { data_ini: di, data_fim: df }));
    });

    document.addEventListener("click", (e) => {
      if (fechando) return;
      if (panel.hidden) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      fecharPanel();
    });

    const saved = FinShared.storageGet(storageKey);
    if (saved?.data_ini && saved?.data_fim) {
      FinShared.aplicarPeriodoUI(saved);
    } else {
      const def = opts?.defaultPreset || "este_mes";
      FinShared.aplicarPeriodoUI(FinShared.calcPeriodo(def));
    }

    const hoje = new Date();
    const pm = document.getElementById("periodPickMonth");
    if (pm) pm.value = `${hoje.getFullYear()}-${FinShared._pad2(hoje.getMonth() + 1)}`;

    return { aplicar, getRange: () => FinShared.storageGet(storageKey) };
  },

  labelOrigemMov(origem) {
    const map = {
      pagamento: "Contas a pagar",
      pagamento_lote: "CP — lote",
      recebimento: "Contas a receber",
      manual: "Manual",
    };
    return map[origem] || origem || "—";
  },
};
