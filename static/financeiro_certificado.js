(function () {
  const S = window.FinShared;
  const API = "/api/configuracoes/certificado-digital";

  function el(id) {
    return document.getElementById(id);
  }

  el("btnSalvarCert")?.addEventListener("click", async () => {
    const file = el("certArquivo")?.files?.[0];
    const senha = el("certSenha")?.value || "";
    if (!file) {
      S.toast("Selecione o arquivo .pfx ou .p12", true);
      return;
    }
    const fd = new FormData();
    fd.append("arquivo", file, file.name);
    fd.append("senha", senha);
    fd.append("tipo", "a1_servidor");
    try {
      const r = await fetch(API, { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro ao salvar certificado");
      S.toast("Certificado atualizado.");
      location.reload();
    } catch (err) {
      if (el("certErro")) {
        el("certErro").textContent = err.message;
        el("certErro").style.display = "block";
      }
    }
  });

  el("btnExportCert")?.addEventListener("click", () => {
    window.location.href = `${API}/exportar`;
  });
})();
