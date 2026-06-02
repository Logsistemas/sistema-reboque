(function () {
  const path = window.location.pathname;
  const STORAGE_FILTERS = "ess_filters_open";

  function markActive(links) {
    links.forEach((el) => {
      const p = el.getAttribute("data-ess-top");
      if (!p) return;
      if (p === "/" && path === "/") {
        el.classList.add("active");
      } else if (p === "/financeiro" && path.startsWith("/financeiro")) {
        el.classList.add("active");
      } else if (p === "/cadastros" && path.startsWith("/cadastros")) {
        el.classList.add("active");
      } else if (p !== "/" && p !== "/financeiro" && p !== "/cadastros" && path.startsWith(p)) {
        el.classList.add("active");
      }
    });
  }

  markActive(document.querySelectorAll("[data-ess-top]"));

  document.querySelectorAll(".ess-top-dropdown").forEach((drop) => {
    const btn = drop.querySelector(".ess-top-drop-btn");
    const hasActiveChild = drop.querySelector(".ess-top-submenu a.active");
    if (hasActiveChild && btn) btn.classList.add("active");
  });

  const navToggle = document.getElementById("essToggleNav");
  const topNav = document.getElementById("essTopNav");
  if (navToggle && topNav) {
    navToggle.addEventListener("click", () => {
      topNav.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!topNav.classList.contains("open")) return;
      if (topNav.contains(e.target) || navToggle.contains(e.target)) return;
      topNav.classList.remove("open");
    });
  }

  document.querySelectorAll(".ess-top-drop-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (window.innerWidth > 1100) return;
      e.preventDefault();
      e.stopPropagation();
      const drop = btn.closest(".ess-top-dropdown");
      if (!drop) return;
      document.querySelectorAll(".ess-top-dropdown.open").forEach((d) => {
        if (d !== drop) d.classList.remove("open");
      });
      drop.classList.toggle("open");
    });
  });

  function setFiltersOpen(open) {
    const shell = document.getElementById("finShell") || document.querySelector(".fin-shell, .ess-filter-shell");
    if (!shell) return;
    shell.classList.toggle("filters-collapsed", !open);
    try {
      localStorage.setItem(STORAGE_FILTERS, open ? "1" : "0");
    } catch (_) {}
  }

  function initFiltersToggle() {
    const shell = document.getElementById("finShell") || document.querySelector(".fin-shell, .ess-filter-shell");
    if (!shell || !shell.querySelector("#finFiltersPanel, .ess-filters-panel, .fin-sidebar-left")) return;

    const saved = localStorage.getItem(STORAGE_FILTERS);
    if (saved === "0") setFiltersOpen(false);

    document.querySelectorAll("[data-ess-toggle-filters]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const show = btn.getAttribute("data-ess-toggle-filters") === "show";
        setFiltersOpen(show);
      });
    });
  }

  initFiltersToggle();
})();
