"""Aplica códigos fiscais do Bling na Configuração Fiscal e nota RPS 1."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as main
from fastapi.testclient import TestClient

CODIGO_NACIONAL = "141401"  # GUINCHO INTRAMUNICIPAL, GUINDASTE E IÇAMENTO
NBS = "106044000"
INDICADOR = "060104"


def run():
    main.init_db()
    client = TestClient(main.app)
    cfg = client.get("/api/financeiro/configuracao-fiscal").json()["config"]
    payload = {
        "razao_social": cfg["razao_social"],
        "nome_fantasia": cfg["nome_fantasia"],
        "cnpj": cfg["cnpj"],
        "inscricao_municipal": cfg["inscricao_municipal"],
        "municipio_emissao": cfg["municipio_emissao"],
        "uf_municipio": cfg["uf_municipio"],
        "codigo_ibge_municipio": cfg["codigo_ibge_municipio"],
        "cnae_principal": cfg["cnae_principal"],
        "regime_tributario": cfg["regime_tributario"],
        "aliquota_iss_padrao": cfg["aliquota_iss_padrao"],
        "ambiente": cfg["ambiente"],
        "codigo_servico_nacional": CODIGO_NACIONAL,
    }
    r = client.put("/api/financeiro/configuracao-fiscal", json=payload)
    assert r.status_code == 200, r.text

    em = client.get("/api/financeiro/configuracao-fiscal").json()["emissao"]
    print("codigo_servico_nacional:", CODIGO_NACIONAL)
    print("empresa_pronta:", em["empresa_pronta"])
    print("pendencias:", em["pendencias"])

    nota = main.one(
        "select id from financeiro_notas_servico where numero_rps='1' order by created_at desc limit 1"
    )
    if nota:
        nid = str(nota["id"])
        imp = main.one("select id from financeiro_notas_servico_impostos where nota_id=%s", (nid,))
        if imp:
            main.q(
                """
                update financeiro_notas_servico_impostos
                   set nbs=%s, indicador_operacao=%s,
                       aliquota_iss=coalesce(nullif(aliquota_iss,0), 5)
                 where nota_id=%s
                """,
                (NBS, INDICADOR, nid),
            )
        else:
            main.q(
                """
                insert into financeiro_notas_servico_impostos
                  (nota_id, nbs, indicador_operacao, aliquota_iss)
                values (%s,%s,%s,5)
                """,
                (nid, NBS, INDICADOR),
            )
        print("nota RPS 1 — NBS e indicador gravados")


if __name__ == "__main__":
    run()
