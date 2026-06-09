"""Gera o XML DPS assinado (mesmo fluxo da emissão) e salva em debug/."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as main
import financeiro_config_fiscal as fcf
from nfse_nacional.client import preparar_envio_dps
from nfse_nacional.dps_builder import montar_dps_xml
from nfse_nacional.ids import ndps_deterministico
from nfse_nacional.signer import assinar_dps
from nfse_nacional.xml_serial import analisar_xml_dps


def _carregar_nota_teste():
    row = main.one(
        """
        select id from financeiro_notas_servico
         where coalesce(numero_rps::text, '') = '1'
           and cliente_nome ilike '%%TOKIO%%'
         order by updated_at desc limit 1
        """
    )
    if not row:
        row = main.one(
            "select id from financeiro_notas_servico order by updated_at desc limit 1"
        )
    if not row:
        raise SystemExit("Nenhuma nota de serviço no banco")
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
    return nota


def _carregar_config():
    row = main.one("select * from financeiro_config_fiscal order by updated_at desc limit 1")
    if not row:
        raise SystemExit("Config fiscal ausente")
    c = dict(row)
    c["aliquota_iss_padrao"] = float(c.get("aliquota_iss_padrao") or 0)
    return c


def _carregar_cert():
    row = main.one(
        """
        select * from financeiro_config_fiscal_certificado
         where coalesce(ativo, true) = true
         order by updated_at desc limit 1
        """
    )
    if not row:
        raise SystemExit("Certificado fiscal ausente")
    return dict(row)


def gerar_xml_assinado(config, cert, nota):
    n_dps = ndps_deterministico(nota.get("id"), nota.get("numero_rps"))
    dps_root, inf_dps, id_dps, n_dps_val, _ = montar_dps_xml(config, nota, n_dps=n_dps)
    senha = fcf._dec_senha(cert.get("senha_criptografada") or "")
    xml = assinar_dps(dps_root, inf_dps, cert["caminho_arquivo"], senha)
    return xml, id_dps


def run():
    main.init_db()
    config = _carregar_config()
    cert = _carregar_cert()
    nota = _carregar_nota_teste()

    xml_bytes, id_dps = gerar_xml_assinado(config, cert, nota)
    path, saved, dps_b64, sha_final, sha_arquivo, sha_enviado = preparar_envio_dps(xml_bytes)
    info = analisar_xml_dps(saved)

    print("=== XML DPS assinado (fluxo emissão) ===")
    print("Arquivo:", path)
    print("id_dps:", id_dps)
    print("sha256_xml_final:", sha_final)
    print("sha256_arquivo_debug:", sha_arquivo)
    print("sha256_xml_enviado:", sha_enviado)
    print("Primeira linha:", info["primeira_linha"])
    print("Tag raiz:", info["tag_raiz"])
    print("Namespaces:", info["namespaces"])
    print("Prefixos em tags:", info["prefixos_tags"] or "NENHUM")
    print("xmlns: prefixados:", info["xmlns_prefixados"] or "NENHUM")
    print("Payload JSON keys:", ["dpsXmlGZipB64"])
    print("dpsXmlGZipB64 len:", len(dps_b64))

    if info["prefixos_tags"] or info["xmlns_prefixados"]:
        raise SystemExit(1)
    print("OK — XML pronto para SEFIN")


if __name__ == "__main__":
    run()
