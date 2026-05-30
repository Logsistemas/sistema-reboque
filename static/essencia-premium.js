(function () {
  const path = window.location.pathname;

  document.querySelectorAll("[data-ess-nav]").forEach((a) => {
    const p = a.getAttribute("data-ess-nav");
    if (!p) return;
    if (p === "/financeiro" && path === "/financeiro") {
      a.classList.add("active");
    } else if (p !== "/financeiro" && path.startsWith(p)) {
      a.classList.add("active");
    }
  });

  document.querySelectorAll("[data-ess-top]").forEach((a) => {
    const p = a.getAttribute("data-ess-top");
    if (p === "/financeiro" && path.startsWith("/financeiro")) a.classList.add("active");
    else if (p !== "/financeiro" && path.startsWith(p)) a.classList.add("active");
  });

  const toggle = document.getElementById("essToggleSidebar");
  const sidebar = document.getElementById("essSidebar");
  if (toggle && sidebar) {
    toggle.addEventListener("click", () => sidebar.classList.toggle("open"));
  }
})();
