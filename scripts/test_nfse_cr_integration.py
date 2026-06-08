"""Teste integração NFS-e → Contas a Receber (TOKIO + vencimento + filtros)."""
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as main
from fastapi.testclient import TestClient

API = "/api/financeiro/notas-servico"
CR_API = "/api/financeiro/contas-receber"


def post_json(client, url, payload, method="POST"):
    return client.request(method, url, json=payload)


def assert_cr_list(client, params, expect_min=1, label=""):
    r = client.get(CR_API, params=params)
    assert r.status_code == 200, r.text
    itens = r.json().get("itens") or []
    assert len(itens) >= expect_min, f"{label}: esperado >= {expect_min}, obteve {len(itens)}"
    return itens


def main_test():
    main.init_db()
    client = TestClient(main.app)

    # Nota teste TOKIO — emissão 08/06/2026, 10 dias, R$ 1,00, 1 parcela
    payload = {
        "situacao": "pendente",
        "numero_rps": "CRTEST01",
        "serie_rps": "1",
        "data_emissao": "2026-06-08",
        "cliente_nome": "TOKIO MARINE SEGURADORA SA",
        "itens": [{"descricao": "Serviço teste integração CR", "valor": 1.0}],
        "total_nota": 1.0,
        "dias_pagamento": 10,
        "quantidade_parcelas": 1,
        "intervalo_parcelas": 30,
        "condicao_pagamento": "10 dias",
    }
    r = post_json(client, API, payload)
    assert r.status_code == 200, r.text
    nid = r.json()["item"]["id"]
    print("OK criar nota TOKIO", nid)

    # Lançar em Contas a Receber
    r = post_json(client, f"{API}/{nid}/lancar-contas-receber", {})
    assert r.status_code == 200, r.text
    cr_ids = r.json()["contas_receber_ids"]
    assert len(cr_ids) == 1
    cr_id = cr_ids[0]
    cr = main.one("select * from financeiro_contas_receber where id=%s", (cr_id,))
    assert cr["cliente"] == "TOKIO MARINE SEGURADORA SA"
    assert float(cr["valor"]) == 1.0
    assert cr["status"] == "em_aberto"
    assert str(cr["nota_servico_id"]) == nid
    assert cr["numero_documento"] == "CRTEST01"
    venc_esperado = date(2026, 6, 18)
    venc = cr["vencimento"]
    if hasattr(venc, "date"):
        venc = venc.date() if hasattr(venc, "date") and callable(venc.date) else venc
    assert venc == venc_esperado, f"Vencimento esperado {venc_esperado}, obteve {venc}"
    hist = cr.get("descricao") or ""
    assert hist == "Cobrança de serviço ref. RPS nº CRTEST01", hist
    assert "NFS-e nº" not in hist
    print("OK lancar CR", cr_id, "vencimento", venc_esperado)

    # Duplicar lançamento deve falhar
    r2 = post_json(client, f"{API}/{nid}/lancar-contas-receber", {})
    assert r2.status_code == 400
    print("OK bloqueio duplicado")

    # Filtros listagem CR
    assert_cr_list(
        client,
        {"situacao": "em_aberto", "data_ini": "2026-06-01", "data_fim": "2026-06-30"},
        expect_min=1,
        label="Jun/2026 em aberto",
    )
    assert_cr_list(
        client,
        {"data_ini": "2026-06-01", "data_fim": "2026-06-30"},
        expect_min=1,
        label="Jun/2026 todos",
    )
    assert_cr_list(client, {"busca": "TOKIO"}, expect_min=1, label="busca TOKIO")
    assert_cr_list(client, {"busca": "CRTEST01"}, expect_min=1, label="busca RPS")
    print("OK filtros listagem CR")

    # Parcelas — 3x, 10 dias, intervalo 30
    payload2 = {
        "situacao": "pendente",
        "numero_rps": "99802",
        "data_emissao": "2026-06-08",
        "cliente_nome": "Cliente Parcelas Teste",
        "itens": [{"descricao": "Serviço", "valor": 300.0}],
        "total_nota": 300.0,
        "dias_pagamento": 10,
        "quantidade_parcelas": 3,
        "intervalo_parcelas": 30,
    }
    r = post_json(client, API, payload2)
    nid2 = r.json()["item"]["id"]
    r = post_json(client, f"{API}/{nid2}/lancar-contas-receber", {})
    assert r.status_code == 200, r.text
    crs = main.q(
        "select vencimento from financeiro_contas_receber where nota_servico_id=%s order by vencimento",
        (nid2,),
        fetch=True,
    )
    assert len(crs) == 3
    esperados = [date(2026, 6, 18), date(2026, 7, 18), date(2026, 8, 17)]
    for i, row in enumerate(crs):
        v = row["vencimento"]
        if hasattr(v, "date"):
            v = v.date()
        assert v == esperados[i], f"Parcela {i+1}: esperado {esperados[i]}, obteve {v}"
    print("OK parcelas 3x com dias e intervalo")

    # Estornar e limpar
    post_json(client, f"{API}/{nid}/estornar-contas-receber", {})
    post_json(client, f"{API}/{nid2}/estornar-contas-receber", {})
    post_json(client, API, {"ids": [nid, nid2]}, method="DELETE")
    print("OK cleanup")


if __name__ == "__main__":
    main_test()
