(function () {
  const REFRESH_MS = 60000;
  let charts = {};

  function esc(t) {
    return String(t ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function setKpi(key, val) {
    document.querySelectorAll(`[data-kpi="${key}"]`).forEach((el) => {
      el.textContent = val ?? "—";
    });
  }

  function renderTopList(id, items, tpl) {
    const box = document.getElementById(id);
    if (!box) return;
    if (!items?.length) {
      box.innerHTML = '<p class="muted">Sem dados no período.</p>';
      return;
    }
    box.innerHTML = items.map((it, i) => tpl(it, i)).join("");
  }

  function baseChartOpts(moneyY) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } },
        y: {
          beginAtZero: true,
          grid: { color: "#eef2f7" },
          ticks: moneyY
            ? { callback: (v) => "R$ " + Number(v).toLocaleString("pt-BR") }
            : {},
        },
      },
    };
  }

  function destroyChart(id) {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  }

  function renderCharts(g) {
    if (!g || typeof Chart === "undefined") return;

    destroyChart("servicos");
    const ctxS = document.getElementById("chartServicos");
    if (ctxS) {
      charts.servicos = new Chart(ctxS, {
        type: "bar",
        data: {
          labels: g.labels,
          datasets: [{ data: g.servicos, backgroundColor: "rgba(11,47,87,0.75)", borderRadius: 4 }],
        },
        options: baseChartOpts(false),
      });
    }

    destroyChart("receita");
    const ctxR = document.getElementById("chartReceita");
    if (ctxR) {
      charts.receita = new Chart(ctxR, {
        type: "line",
        data: {
          labels: g.labels,
          datasets: [{
            data: g.receitas,
            borderColor: "#16a34a",
            backgroundColor: "rgba(22,163,74,0.12)",
            fill: true,
            tension: 0.35,
            pointRadius: 0,
          }],
        },
        options: baseChartOpts(true),
      });
    }

    const evo = g.evolucao_mensal || {};
    destroyChart("evolucao");
    const ctxE = document.getElementById("chartEvolucao");
    if (ctxE) {
      charts.evolucao = new Chart(ctxE, {
        type: "bar",
        data: {
          labels: evo.labels || [],
          datasets: [
            {
              label: "Receita",
              data: evo.receitas || [],
              backgroundColor: "rgba(22,163,74,0.7)",
              borderRadius: 4,
              yAxisID: "y",
            },
            {
              label: "Serviços",
              data: evo.servicos || [],
              type: "line",
              borderColor: "#2563eb",
              backgroundColor: "transparent",
              yAxisID: "y1",
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, position: "left", ticks: { callback: (v) => "R$ " + Number(v).toLocaleString("pt-BR") } },
            y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } },
          },
        },
      });
    }

    const cli = g.faturamento_cliente || {};
    destroyChart("clientes");
    const ctxC = document.getElementById("chartClientes");
    if (ctxC) {
      charts.clientes = new Chart(ctxC, {
        type: "bar",
        data: {
          labels: cli.labels || [],
          datasets: [{ data: cli.receitas || [], backgroundColor: "rgba(11,47,87,0.8)", borderRadius: 4 }],
        },
        options: { ...baseChartOpts(true), indexAxis: "y" },
      });
    }
  }

  async function carregar() {
    const badge = document.getElementById("dash-ger-live");
    try {
      const res = await fetch("/api/dashboard/gerencial", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.erro);

      const ref = document.getElementById("dash-ger-data-ref");
      if (ref) ref.textContent = data.data_ref || "";

      const k = data.kpis || {};
      Object.keys(k).forEach((key) => setKpi(key, k[key]));
      document.querySelectorAll(".dash-ger-kpis .skeleton").forEach((el) => el.classList.remove("skeleton"));

      renderTopList("dash-top-clientes", data.top_clientes, (it, i) => `
        <div class="dash-top-item"><span class="dash-top-rank">${i + 1}º</span>
        <div class="dash-top-body"><strong>${esc(it.nome)}</strong><span>${it.qtd} serv. · ${esc(it.receita_fmt)}</span></div></div>`);
      renderTopList("dash-top-viaturas", data.top_viaturas, (it, i) => `
        <div class="dash-top-item"><span class="dash-top-rank">${i + 1}º</span>
        <div class="dash-top-body"><strong>${esc(it.nome)}</strong><span>${esc(it.placa)} · ${it.qtd} serv. · ${esc(it.receita_fmt)}</span></div></div>`);
      renderTopList("dash-top-profissionais", data.top_profissionais, (it, i) => `
        <div class="dash-top-item"><span class="dash-top-rank">${i + 1}º</span>
        <div class="dash-top-body"><strong>${esc(it.nome)}</strong><span>${it.qtd} serv. · ${esc(it.receita_fmt)}</span></div></div>`);

      renderCharts(data.graficos);

      if (badge) {
        badge.textContent = "● Ao vivo";
        badge.classList.remove("off");
      }
    } catch (e) {
      if (badge) {
        badge.textContent = "● Reconectando…";
        badge.classList.add("off");
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      carregar();
      setInterval(carregar, REFRESH_MS);
    });
  } else {
    carregar();
    setInterval(carregar, REFRESH_MS);
  }
})();
