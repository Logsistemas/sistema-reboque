/**
 * Chat Mobile Central ↔ App Motorista (módulo aditivo).
 */
(function centralMobileChat() {
  const panel = document.getElementById("panel-mobile");
  if (!panel) return;

  const servicoId = panel.dataset.servicoId;
  const messagesEl = document.getElementById("sdMobileMessages");
  const inputEl = document.getElementById("sdMobileInput");
  const sendBtn = document.getElementById("sdMobileSend");
  const badgeEl = document.getElementById("mobileNavBadge");
  if (!servicoId || !messagesEl || !inputEl || !sendBtn) return;

  let pollTimer = null;
  let ativo = false;
  let ultimoTotal = 0;

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function beepMsg() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1040;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) {}
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "sd-mobile-toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  function atualizarBadge(qtd) {
    if (!badgeEl) return;
    if (qtd > 0) {
      badgeEl.textContent = String(qtd);
      badgeEl.classList.remove("hidden");
    } else {
      badgeEl.classList.add("hidden");
    }
  }

  function renderMensagens(lista) {
    if (!lista || !lista.length) {
      messagesEl.innerHTML = '<div class="sd-mobile-empty">Nenhuma mensagem ainda. Inicie a conversa com o motorista.</div>';
      return;
    }
    messagesEl.innerHTML = lista
      .map((m) => {
        const tipo = (m.remetente_tipo || "").toLowerCase() === "central" ? "central" : "motorista";
        const nome = esc(m.remetente_nome || (tipo === "central" ? "Central" : "Motorista"));
        const hora = esc(m.created_at || "");
        return `
          <div class="sd-mobile-bubble ${tipo}">
            <div class="sd-mobile-bubble-meta">${nome} · ${hora}</div>
            <div class="sd-mobile-bubble-body">${esc(m.mensagem)}</div>
          </div>`;
      })
      .join("");
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function carregarMensagens(marcarLidas) {
    const res = await fetch(`/api/servicos/${servicoId}/mobile/mensagens`, { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) return;

    const lista = data.mensagens || [];
    const qtdMotorista = lista.filter((m) => m.remetente_tipo === "motorista").length;
    if (ativo && lista.length > ultimoTotal && ultimoTotal > 0) {
      const ultima = lista[lista.length - 1];
      if (ultima && ultima.remetente_tipo === "motorista") {
        beepMsg();
        toast(`Nova mensagem do motorista no protocolo ${panel.dataset.protocolo || ""}`);
      }
    }
    ultimoTotal = lista.length;
    renderMensagens(lista);

    if (marcarLidas && ativo) {
      await fetch(`/api/servicos/${servicoId}/mobile/marcar-lidas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leitor: "central" }),
      });
      atualizarBadge(0);
    } else {
      const unreadRes = await fetch(`/api/servicos/${servicoId}/mobile/unread?leitor=central`, { cache: "no-store" });
      const unread = await unreadRes.json();
      if (unread.ok) atualizarBadge(unread.qtd || 0);
    }
    void qtdMotorista;
  }

  async function enviarMensagem() {
    const texto = (inputEl.value || "").trim();
    if (!texto) return;
    sendBtn.disabled = true;
    try {
      const res = await fetch(`/api/servicos/${servicoId}/mobile/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remetente_tipo: "central",
          remetente_id: "central",
          remetente_nome: "Central / Operação",
          mensagem: texto,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.erro || "Falha ao enviar mensagem.");
        return;
      }
      inputEl.value = "";
      await carregarMensagens(false);
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  function iniciarPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (ativo) carregarMensagens(true);
    }, 5000);
  }

  function pararPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  sendBtn.addEventListener("click", enviarMensagem);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  });

  const observer = new MutationObserver(() => {
    ativo = panel.classList.contains("active");
    if (ativo) {
      iniciarPoll();
      carregarMensagens(true);
    }
  });
  observer.observe(panel, { attributes: true, attributeFilter: ["class"] });

  if (panel.classList.contains("active")) {
    ativo = true;
    iniciarPoll();
    carregarMensagens(true);
  } else {
    fetch(`/api/servicos/${servicoId}/mobile/unread?leitor=central`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) atualizarBadge(d.qtd || 0); });
  }
})();
