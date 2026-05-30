/**
 * Autocomplete reutilizável — Controle (motoristas e viaturas ativos).
 */
window.CtrlAc = (function () {
  const API_PROFISSIONAIS = "/api/opcoes/profissionais";
  const API_MOTORISTAS = "/api/opcoes/motoristas";
  const API_VIATURAS = "/api/opcoes/viaturas";
  const MAX_ITEMS = 12;

  let cacheProfissionais = null;
  let cacheMotoristas = null;
  let cacheViaturas = null;

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  async function loadProfissionais() {
    if (cacheProfissionais) return cacheProfissionais;
    const res = await fetch(API_PROFISSIONAIS);
    cacheProfissionais = await res.json();
    return cacheProfissionais;
  }

  async function loadMotoristas() {
    if (cacheMotoristas) return cacheMotoristas;
    const res = await fetch(API_MOTORISTAS);
    cacheMotoristas = await res.json();
    return cacheMotoristas;
  }

  async function loadViaturas() {
    if (cacheViaturas) return cacheViaturas;
    const res = await fetch(API_VIATURAS);
    cacheViaturas = await res.json();
    return cacheViaturas;
  }

  function preload() {
    return Promise.all([loadProfissionais(), loadMotoristas(), loadViaturas()]);
  }

  function getHidden(wrap, suffix) {
    const field = wrap.dataset.field;
    if (!field) return null;
    const name = suffix ? `${field}${suffix}` : field;
    return wrap.querySelector(`input[type="hidden"][name="${name}"]`);
  }

  function closeList(wrap) {
    const list = wrap.querySelector(".ctrl-ac-list");
    if (list) {
      list.innerHTML = "";
      list.classList.remove("open");
    }
    wrap.classList.remove("open");
  }

  function renderList(wrap, items, onPick) {
    const list = wrap.querySelector(".ctrl-ac-list");
    if (!list) return;
    list.innerHTML = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "ctrl-ac-empty";
      li.textContent = "Nenhum resultado";
      list.appendChild(li);
    } else {
      items.slice(0, MAX_ITEMS).forEach((item) => {
        const li = document.createElement("li");
        li.className = "ctrl-ac-option";
        li.setAttribute("role", "option");
        li.tabIndex = 0;
        li.textContent = item.label;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          onPick(item);
          closeList(wrap);
        });
        list.appendChild(li);
      });
      if (items.length > MAX_ITEMS) {
        const more = document.createElement("li");
        more.className = "ctrl-ac-more";
        more.textContent = `+ ${items.length - MAX_ITEMS} — refine a busca`;
        list.appendChild(more);
      }
    }
    list.classList.add("open");
    wrap.classList.add("open");
  }

  function filterProfissionais(q) {
    const nq = norm(q);
    const lista = cacheProfissionais?.length ? cacheProfissionais : cacheMotoristas || [];
    return lista.filter((m) => {
      if (!nq) return true;
      return norm(m.nome).includes(nq);
    }).map((m) => ({
      id: m.id,
      text: m.nome,
      label: m.nome,
    }));
  }

  function filterViaturas(q) {
    const nq = norm(q);
    return (cacheViaturas || []).filter((v) => {
      if (!nq) return true;
      return (
        norm(v.placa).includes(nq) ||
        norm(v.nome).includes(nq) ||
        norm(v.label).includes(nq)
      );
    }).map((v) => ({
      id: v.id,
      text: v.placa || v.label,
      label: v.label,
    }));
  }

  function bindWrap(wrap) {
    if (wrap.dataset.acBound === "1") return;
    wrap.dataset.acBound = "1";

    const tipo = wrap.dataset.ctrlAc;
    const mode = wrap.dataset.mode || "form";
    const input = wrap.querySelector(".ctrl-ac-input");
    const filterHiddenId = wrap.dataset.filterHidden;
    const hiddenText =
      mode === "filter" && filterHiddenId
        ? document.getElementById(filterHiddenId)
        : getHidden(wrap, "");
    const hiddenId = mode === "form" ? getHidden(wrap, "_id") : null;

    if (!input) return;

    function applySelection(item) {
      input.value = item.label;
      if (hiddenText) hiddenText.value = item.text;
      if (hiddenId) hiddenId.value = item.id || "";
      if (mode === "filter" && typeof window.filtrarTabelaControle === "function") {
        window.filtrarTabelaControle();
      }
    }

    function clearSelection() {
      input.value = "";
      if (hiddenText) hiddenText.value = "";
      if (hiddenId) hiddenId.value = "";
      if (mode === "filter" && typeof window.filtrarTabelaControle === "function") {
        window.filtrarTabelaControle();
      }
    }

    async function showOptions(query) {
      if (tipo === "motorista") {
        await loadProfissionais();
        if (!cacheProfissionais?.length) await loadMotoristas();
        renderList(wrap, filterProfissionais(query), applySelection);
      } else if (tipo === "viatura") {
        await loadViaturas();
        renderList(wrap, filterViaturas(query), applySelection);
      }
    }

    input.addEventListener("focus", () => showOptions(input.value));
    input.addEventListener("click", () => showOptions(input.value));
    input.addEventListener("input", () => {
      const q = input.value.trim();
      if (hiddenText) hiddenText.value = mode === "filter" ? q.toLowerCase() : q;
      if (hiddenId) hiddenId.value = "";
      showOptions(input.value);
      if (mode === "filter" && typeof window.filtrarTabelaControle === "function") {
        window.filtrarTabelaControle();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeList(wrap);
    });
    input.addEventListener("blur", () => {
      setTimeout(() => closeList(wrap), 180);
    });

    wrap._ctrlAcClear = clearSelection;
  }

  function init(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-ctrl-ac]").forEach(bindWrap);
  }

  function reset(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-ctrl-ac]").forEach((wrap) => {
      if (wrap._ctrlAcClear) wrap._ctrlAcClear();
      else {
        const input = wrap.querySelector(".ctrl-ac-input");
        if (input) input.value = "";
        getHidden(wrap, "") && (getHidden(wrap, "").value = "");
        getHidden(wrap, "_id") && (getHidden(wrap, "_id").value = "");
      }
      closeList(wrap);
    });
  }

  function validateRequired(root) {
    const scope = root || document;
    const missing = [];
    scope.querySelectorAll("[data-ctrl-ac][data-required]").forEach((wrap) => {
      const ht = getHidden(wrap, "");
      const label = wrap.querySelector("label")?.textContent || "Campo";
      if (!ht || !ht.value.trim()) missing.push(label);
    });
    return missing;
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-ctrl-ac]")) {
      document.querySelectorAll("[data-ctrl-ac].open").forEach(closeList);
    }
  });

  return { preload, init, reset, validateRequired, loadMotoristas, loadViaturas };
})();
