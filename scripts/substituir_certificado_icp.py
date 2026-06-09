#!/usr/bin/env python3
"""
Substitui o certificado fiscal ativo por um PFX com cadeia ICP-Brasil completa.
Mantém a senha já cadastrada no sistema.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import uuid
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEFAULT_NOVO_PFX = Path.home() / "Desktop" / "teste_ez_exportavel.pfx"


def _cert_dir() -> Path:
    import app as main

    base = getattr(main, "FINANCEIRO_UPLOAD_DIR", os.path.join("static", "uploads", "financeiro"))
    d = Path(base) / "config_fiscal" / "certificados"
    d.mkdir(parents=True, exist_ok=True)
    return d


def substituir_certificado(novo_pfx: Path) -> dict:
    import app as main
    import financeiro_config_fiscal as fcf

    main.init_db()

    novo_pfx = Path(novo_pfx).expanduser().resolve()
    if not novo_pfx.is_file():
        raise FileNotFoundError(f"Arquivo PFX nao encontrado: {novo_pfx}")

    cert = main.one(
        """
        select * from financeiro_config_fiscal_certificado
         where coalesce(ativo, true) = true
         order by updated_at desc limit 1
        """
    )
    if not cert or not cert.get("caminho_arquivo"):
        raise RuntimeError("Nenhum certificado fiscal ativo configurado no sistema")

    cert = dict(cert)
    senha = fcf._dec_senha(cert.get("senha_criptografada") or "")
    if not senha:
        raise RuntimeError("Senha do certificado ativo nao encontrada no banco")

    old_path = Path(cert["caminho_arquivo"])
    if not old_path.is_absolute():
        old_path = (ROOT / old_path).resolve()

    cert_dir = _cert_dir()
    backup_dir = cert_dir / "backup"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"{old_path.stem}_backup_{ts}{old_path.suffix}"

    if old_path.is_file():
        shutil.copy2(old_path, backup_path)
    else:
        backup_path = None

    info = fcf.ler_certificado_info(str(novo_pfx), senha)
    if not info.get("valido"):
        msg = info.get("subject") or "Certificado invalido ou senha incorreta"
        raise RuntimeError(f"Novo PFX nao abriu com a senha cadastrada: {msg}")

    cfg = main.one("select * from financeiro_config_fiscal order by updated_at desc limit 1")
    cfg = dict(cfg) if cfg else {}
    cnpj_cert = fcf._so_digitos(info.get("cnpj"))
    cnpj_cfg = fcf._so_digitos(cfg.get("cnpj"))
    if cnpj_cfg and cnpj_cert and cnpj_cert != cnpj_cfg:
        raise RuntimeError(
            f"CNPJ do novo certificado ({cnpj_cert}) difere do configurado ({cnpj_cfg})"
        )

    from nfse_nacional.chain_audit import auditar_cadeia_icp

    pre = auditar_cadeia_icp(str(novo_pfx), senha)
    if pre.get("chain_len_atual", 0) < 1:
        raise RuntimeError(
            "Novo PFX sem cadeia intermediaria (chain_len=0). Exportacao incompleta."
        )

    novo_bytes = novo_pfx.read_bytes()
    ext = novo_pfx.suffix.lower() or ".pfx"
    dest_name = f"cert_{uuid.uuid4().hex}{ext}"
    upload_base = getattr(main, "FINANCEIRO_UPLOAD_DIR", os.path.join("static", "uploads", "financeiro"))
    cert_dir_str = os.path.join(upload_base, "config_fiscal", "certificados")
    os.makedirs(cert_dir_str, exist_ok=True)
    rel_path = os.path.join(cert_dir_str, dest_name).replace("\\", "/")
    dest_abs = (ROOT / rel_path).resolve() if not os.path.isabs(rel_path) else Path(rel_path)
    dest_abs.write_bytes(novo_bytes)

    main.q(
        "update financeiro_config_fiscal_certificado set ativo=false where coalesce(ativo,true)=true"
    )
    row = main.one(
        """
        insert into financeiro_config_fiscal_certificado (
          config_fiscal_id, tipo, caminho_arquivo, senha_criptografada,
          validade, razao_social, cnpj, subject, ativo, updated_at
        ) values (%s,'a1_servidor',%s,%s,%s,%s,%s,%s,true,now()) returning id
        """,
        (
            cert.get("config_fiscal_id") or (cfg.get("id") if cfg else None),
            rel_path,
            cert.get("senha_criptografada"),
            info.get("validade"),
            info.get("titular") or info.get("razao_social"),
            info.get("cnpj"),
            info.get("subject"),
        ),
    )

    pos = auditar_cadeia_icp(rel_path, senha)

    return {
        "sucesso": True,
        "certificado_id_anterior": str(cert["id"]),
        "certificado_id_novo": str(row["id"]),
        "backup_path": str(backup_path.resolve()) if backup_path else None,
        "caminho_anterior": str(old_path),
        "caminho_ativo": str(dest_abs),
        "caminho_relativo": rel_path,
        "origem_copia": str(novo_pfx),
        "pre_auditoria": {
            "chain_len": pre.get("chain_len_atual"),
            "intermediarios": pre.get("intermediarios_pfx"),
            "ac_safeweb": pre.get("ac_safeweb_rfb_v5_no_pfx"),
        },
        "pos_auditoria": {
            "chain_len": pos.get("chain_len_atual"),
            "intermediarios": pos.get("intermediarios_pfx"),
            "ac_safeweb": pos.get("ac_safeweb_rfb_v5_no_pfx"),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Substituir certificado fiscal ativo por PFX com cadeia ICP")
    parser.add_argument(
        "pfx",
        nargs="?",
        default=str(DEFAULT_NOVO_PFX),
        help=f"Caminho do novo PFX (default: {DEFAULT_NOVO_PFX})",
    )
    args = parser.parse_args()

    try:
        resultado = substituir_certificado(Path(args.pfx))
    except Exception as exc:
        sys.stdout.buffer.write(f"FALHA: {exc}\n".encode("utf-8", errors="replace"))
        return 1

    pos = resultado["pos_auditoria"]
    linhas = [
        "Certificado substituído com sucesso",
        "",
        f"caminho_certificado_ativo: {resultado['caminho_ativo']}",
        f"backup_certificado_anterior: {resultado['backup_path'] or '(arquivo antigo ausente)'}",
        f"chain_len_atual: {pos['chain_len']}",
        f"intermediarios_encontrados: {pos['intermediarios']}",
        f"AC SAFEWEB RFB v5 presente: {pos['ac_safeweb']}",
        f"certificado_id_novo: {resultado['certificado_id_novo']}",
    ]
    sys.stdout.buffer.write("\n".join(linhas).encode("utf-8", errors="replace"))
    sys.stdout.buffer.write(b"\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
