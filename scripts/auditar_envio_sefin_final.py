#!/usr/bin/env python3
"""
Auditoria + emissão real SEFIN (fluxo completo).
Grava debug/auditoria_envio_sefin_final.txt antes do POST.

Uso:
    python scripts/auditar_envio_sefin_final.py
    python scripts/auditar_envio_sefin_final.py --emitir
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

RELATORIO = ROOT / "debug" / "auditoria_envio_sefin_final.txt"


def _emitir():
    import app as main
    import financeiro_config_fiscal as fcf
    from nfse_nacional.service import emitir_nota

    main.init_db()
    config = main.one("select * from financeiro_config_fiscal order by updated_at desc limit 1")
    if not config:
        raise SystemExit("Config fiscal ausente")
    config = dict(config)
    config["aliquota_iss_padrao"] = float(config.get("aliquota_iss_padrao") or 0)

    cert = main.one(
        """
        select * from financeiro_config_fiscal_certificado
         where coalesce(ativo, true) = true
         order by updated_at desc limit 1
        """
    )
    if not cert:
        raise SystemExit("Certificado ausente")
    cert = dict(cert)

    row = main.one(
        """
        select id from financeiro_notas_servico
         where situacao not in ('emitida', 'cancelada')
         order by updated_at desc limit 1
        """
    )
    if not row:
        raise SystemExit("Nenhuma nota pendente para emissão")
    nid = str(row["id"])
    nota = main.one("select * from financeiro_notas_servico where id=%s", (nid,))
    nota = dict(nota)
    nota["id"] = str(nota["id"])
    imp = main.one("select * from financeiro_notas_servico_impostos where nota_id=%s", (nid,))
    nota["impostos"] = dict(imp) if imp else {}
    nota["itens"] = main.q(
        "select * from financeiro_notas_servico_itens where nota_id=%s order by sequencia",
        (nid,),
        fetch=True,
    ) or []

    print(f"Emitindo nota {nid} ...")
    resultado = emitir_nota(config, cert, nota, fcf._dec_senha)
    print("Emissão concluída:", resultado)
    return 0


def _somente_auditoria():
    import app as main
    import financeiro_config_fiscal as fcf
    from nfse_nacional.client import NfseNacionalClient, preparar_envio_dps
    from nfse_nacional.envio_audit import auditar_envio_sefin_final
    from nfse_nacional.dps_builder import montar_dps_xml
    from nfse_nacional.ids import ndps_deterministico
    from nfse_nacional.signer import assinar_dps

    main.init_db()
    config = dict(main.one("select * from financeiro_config_fiscal order by updated_at desc limit 1") or {})
    config["aliquota_iss_padrao"] = float(config.get("aliquota_iss_padrao") or 0)
    cert = dict(
        main.one(
            """
            select * from financeiro_config_fiscal_certificado
             where coalesce(ativo, true) = true
             order by updated_at desc limit 1
            """
        )
        or {}
    )
    row = main.one("select id from financeiro_notas_servico order by updated_at desc limit 1")
    if not row:
        raise SystemExit("Sem notas")
    nid = str(row["id"])
    nota = dict(main.one("select * from financeiro_notas_servico where id=%s", (nid,)))
    nota["id"] = nid
    imp = main.one("select * from financeiro_notas_servico_impostos where nota_id=%s", (nid,))
    nota["impostos"] = dict(imp) if imp else {}
    nota["itens"] = main.q(
        "select * from financeiro_notas_servico_itens where nota_id=%s order by sequencia",
        (nid,),
        fetch=True,
    ) or []

    senha = fcf._dec_senha(cert.get("senha_criptografada") or "")
    n_dps = ndps_deterministico(nota.get("id"), nota.get("numero_rps"))
    root, inf, _, _, _ = montar_dps_xml(config, nota, n_dps=n_dps)
    xml = assinar_dps(root, inf, cert["caminho_arquivo"], senha, ambiente=config.get("ambiente"))
    _, xml_bytes, dps_b64, *_ = preparar_envio_dps(xml)
    auditar_envio_sefin_final(xml_bytes, dps_b64, pfx_path=cert["caminho_arquivo"], senha=senha)
    print("Auditoria OK (sem POST)")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--emitir", action="store_true", help="Executar POST real à SEFIN")
    args = parser.parse_args()
    try:
        code = _emitir() if args.emitir else _somente_auditoria()
    except Exception as exc:
        if RELATORIO.is_file():
            print(RELATORIO.read_text(encoding="utf-8"))
        raise SystemExit(str(exc)) from exc
    if RELATORIO.is_file():
        print(RELATORIO.read_text(encoding="utf-8"))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
