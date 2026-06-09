#!/usr/bin/env python3
"""Auditoria certificado A1 + cadeia ICP-Brasil + X509Certificate no XML (E0714)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

RELATORIO = ROOT / "debug" / "auditoria_certificado_icp.txt"


def main() -> int:
    import app as main_app
    import financeiro_config_fiscal as fcf
    from nfse_nacional.cert_audit import auditar_certificado_icp

    main_app.init_db()
    cert = main_app.one(
        """
        select * from financeiro_config_fiscal_certificado
         where coalesce(ativo, true) = true
         order by updated_at desc limit 1
        """
    )
    if not cert or not cert.get("caminho_arquivo"):
        raise SystemExit("Certificado A1 não configurado ou caminho ausente")

    senha = fcf._dec_senha(cert.get("senha_criptografada") or "")
    pfx = cert["caminho_arquivo"]
    if not Path(pfx).is_file():
        raise SystemExit(f"Arquivo PFX não encontrado: {pfx}")

    resultado = auditar_certificado_icp(pfx, senha)
    print(resultado["texto"])
    print(f"\nRelatório salvo em: {resultado['relatorio_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
