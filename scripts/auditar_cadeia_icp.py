#!/usr/bin/env python3
"""Auditoria cadeia ICP-Brasil — PFX vs repositorios Windows."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

RELATORIO = ROOT / "debug" / "auditoria_cadeia_icp.txt"


def _resolver_pfx_e_senha(pfx_arg: str | None, senha_arg: str | None) -> tuple[str, str]:
    import app as main_app
    import financeiro_config_fiscal as fcf

    senha_cfg = ""
    if not senha_arg:
        main_app.init_db()
        cert = main_app.one(
            """
            select * from financeiro_config_fiscal_certificado
             where coalesce(ativo, true) = true
             order by updated_at desc limit 1
            """
        )
        if cert and cert.get("senha_criptografada"):
            senha_cfg = fcf._dec_senha(cert.get("senha_criptografada") or "")

    if pfx_arg:
        pfx = str(Path(pfx_arg).expanduser().resolve())
        if not Path(pfx).is_file():
            raise SystemExit(f"Arquivo PFX nao encontrado: {pfx}")
        senha = senha_arg if senha_arg is not None else senha_cfg
        return pfx, senha

    main_app.init_db()
    cert = main_app.one(
        """
        select * from financeiro_config_fiscal_certificado
         where coalesce(ativo, true) = true
         order by updated_at desc limit 1
        """
    )
    if not cert or not cert.get("caminho_arquivo"):
        raise SystemExit("Certificado A1 nao configurado ou caminho ausente")

    pfx = cert["caminho_arquivo"]
    if not Path(pfx).is_file():
        raise SystemExit(f"Arquivo PFX nao encontrado: {pfx}")
    senha = senha_arg if senha_arg is not None else senha_cfg or fcf._dec_senha(
        cert.get("senha_criptografada") or ""
    )
    return str(Path(pfx).resolve()), senha


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Auditoria cadeia ICP-Brasil de um PFX (argumento opcional)."
    )
    parser.add_argument(
        "pfx",
        nargs="?",
        help="Caminho opcional ao arquivo .pfx/.p12 (default: certificado configurado no sistema)",
    )
    parser.add_argument(
        "--senha",
        help="Senha do PFX (default: senha do certificado configurado no sistema)",
    )
    args = parser.parse_args()

    from nfse_nacional.chain_audit import auditar_cadeia_icp

    pfx, senha = _resolver_pfx_e_senha(args.pfx, args.senha)
    resultado = auditar_cadeia_icp(pfx, senha)

    resumo = (
        f"\n=== RESUMO EXECUCAO ===\n"
        f"caminho_analisado: {resultado.get('pfx_path', pfx)}\n"
        f"chain_len_atual: {resultado.get('chain_len_atual')}\n"
        f"intermediarios_no_pfx: {resultado.get('intermediarios_pfx') or '(nenhum)'}\n"
        f"AC SAFEWEB RFB v5 no PFX: {resultado.get('ac_safeweb_rfb_v5_no_pfx')}\n"
    )

    sys.stdout.buffer.write((resultado["texto"] + resumo).encode("utf-8", errors="replace"))
    sys.stdout.buffer.write(
        f"\nRelatorio salvo em: {resultado['relatorio_path']}\n".encode("utf-8")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
