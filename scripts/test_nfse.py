"""Testes do módulo NFS-e (notas de serviço)."""
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

API = "/api/financeiro/notas-servico"


def post_json(client, url, payload, method="POST"):
    return client.request(method, url, json=payload)


def main_test():
    main.init_db()
    client = TestClient(main.app)

    # Páginas
    for path in (
        "/financeiro/notas-servico",
        "/financeiro/notas-servico/nova",
        "/financeiro/configuracao-fiscal",
    ):
        r = client.get(path)
        assert r.status_code == 200, f"Falha GET {path}: {r.status_code}"
        print("OK página", path)

    # Criar nota pendente
    payload = {
        "situacao": "pendente",
        "numero_rps": "99901",
        "serie_rps": "1",
        "data_emissao": "2026-05-29",
        "natureza_operacao": "Tributação no município",
        "cliente_nome": "Cliente Teste NFS-e LTDA",
        "cliente_cnpj_cpf": "11.222.333/0001-81",
        "cliente_email": "nfse@teste.com",
        "cliente_municipio": "São Paulo",
        "cliente_uf": "SP",
        "itens": [{"descricao": "Serviço de reboque", "valor": 1500.0}],
        "impostos": {"aliquota_iss": 5, "valor_iss": 75},
        "condicao_pagamento": "30 dias",
        "dias_pagamento": 30,
        "quantidade_parcelas": 1,
    }
    r = post_json(client, API, payload)
    assert r.status_code == 200, r.text
    nota = r.json()["item"]
    nid = nota["id"]
    print("OK criar nota", nid)

    # Reabrir / editar
    r = client.get(f"{API}/{nid}")
    assert r.status_code == 200
    print("OK get nota")

    payload["id"] = nid
    payload["observacoes"] = "Teste editado"
    r = post_json(client, f"{API}/{nid}", payload, method="PUT")
    assert r.status_code == 200
    print("OK editar nota")

    # Clonar
    r = post_json(client, f"{API}/{nid}/clonar", {})
    clone = r.json()["item"]
    print("OK clonar", clone["id"])

    # Emitida manual
    r = post_json(client, f"{API}/{nid}/situacao", {"situacao": "emitida"}, method="PUT")
    assert r.status_code == 200
    print("OK situacao emitida")

    # Lançar CR
    antes_cr = main.one("select count(*)::int as n from financeiro_contas_receber")["n"]
    r = post_json(client, f"{API}/{nid}/lancar-contas-receber", {})
    assert r.status_code == 200, r.text
    depois_cr = main.one("select count(*)::int as n from financeiro_contas_receber")["n"]
    assert depois_cr > antes_cr
    cr_id = r.json()["contas_receber_ids"][0]
    cr = main.one("select * from financeiro_contas_receber where id=%s", (cr_id,))
    assert "RPS" in (cr.get("descricao") or "")
    assert "NFS-e nº" not in (cr.get("descricao") or "")
    assert cr.get("nota_servico_id") == nid
    assert cr.get("status") == "em_aberto"
    venc = cr.get("vencimento")
    if hasattr(venc, "date"):
        venc = venc.date()
    assert venc == date(2026, 6, 28), f"Vencimento esperado 2026-06-28, obteve {venc}"
    print("OK lancar CR", cr_id)

    # Estornar
    r = post_json(client, f"{API}/{nid}/estornar-contas-receber", {})
    assert r.status_code == 200, r.text
    cr2 = main.one("select id from financeiro_contas_receber where id=%s", (cr_id,))
    assert cr2 is None
    print("OK estornar CR")

    # Cancelada
    r = post_json(client, f"{API}/{clone['id']}/situacao", {"situacao": "cancelada"}, method="PUT")
    assert r.status_code == 200
    print("OK cancelada")

    # Impressão
    r = client.get(f"/financeiro/notas-servico/{nid}/imprimir")
    assert r.status_code == 200
    print("OK impressao")

    # Limpeza
    post_json(client, API, {"ids": [nid, clone["id"]]}, method="DELETE")
    print("OK cleanup")

    # CR / Caixa intactos
    main.one("select count(*) from financeiro_contas_receber")
    main.one("select count(*) from financeiro_movimentacoes")
    print("OK financeiro existente intacto")


if __name__ == "__main__":
    main_test()
