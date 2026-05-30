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
};
