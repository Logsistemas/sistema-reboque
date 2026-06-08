"""Teste ação Lançar em contas — nota PENDENTE, feedback e duplicidade."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as m
from fastapi.testclient import TestClient

API = "/api/financeiro/notas-servico"


def main_test():
    m.init_db()
    client = TestClient(m.app)

    payload = {
        "situacao": "pendente",
        "numero_rps": "PENDCR01",
        "data_emissao": "2026-06-08",
        "cliente_nome": "TOKIO MARINE SEGURADORA SA",
        "itens": [{"descricao": "Teste pendente CR", "valor": 1.0}],
        "dias_pagamento": 10,
        "quantidade_parcelas": 1,
    }
    r = client.post(API, json=payload)
    assert r.status_code == 200, r.text
    nid = r.json()["item"]["id"]
    assert r.json()["item"]["situacao"] == "pendente"
    print("OK nota pendente criada", nid)

    r = client.post(f"{API}/{nid}/lancar-contas-receber", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mensagem"] == "Conta a receber criada com sucesso."
    assert len(body["contas_receber_ids"]) == 1
    assert body["item"]["vinculacao_cr"] == "lancado_contas_receber"
    print("OK lancar pendente", body["mensagem"])

    r2 = client.post(f"{API}/{nid}/lancar-contas-receber", json={})
    assert r2.status_code == 400
    assert "já possui lançamento" in r2.json()["erro"].lower()
    print("OK bloqueio duplicado:", r2.json()["erro"])

    r3 = client.put(f"{API}/{nid}/situacao", json={"situacao": "cancelada"})
    assert r3.status_code == 200
    # estornar first to test cancelada block on fresh note
    client.post(f"{API}/{nid}/estornar-contas-receber", json={})

    payload2 = {**payload, "numero_rps": "PENDCR02", "situacao": "cancelada"}
    r = client.post(API, json=payload2)
    nid2 = r.json()["item"]["id"]
    r4 = client.post(f"{API}/{nid2}/lancar-contas-receber", json={})
    assert r4.status_code == 400
    assert "cancelada" in r4.json()["erro"].lower()
    print("OK bloqueio cancelada:", r4.json()["erro"])

    client.request("DELETE", API, json={"ids": [nid, nid2]})
    print("OK cleanup")


if __name__ == "__main__":
    main_test()
