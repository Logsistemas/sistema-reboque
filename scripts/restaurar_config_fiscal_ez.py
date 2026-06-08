"""Restaura dados fiscais reais da EZ LOGISTICA (sem alterar schema)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as main
from fastapi.testclient import TestClient

DADOS_EZ = {
    "razao_social": "EZ LOGISTICA EIRELI",
    "nome_fantasia": "LOG SOLUCOES",
    "cnpj": "31.494.899/0001-70",
    "inscricao_municipal": "1.132.123-2",
    "municipio_emissao": "Rio de Janeiro",
    "uf_municipio": "RJ",
    "codigo_ibge_municipio": "3304557",
    "cnae_principal": "5229002",
    "regime_tributario": "Regime Normal",
    "codigo_servico_nacional": "141401",
    "codigo_servico_municipal": "141401",
    "aliquota_iss_padrao": 5,
    "ambiente": "homologacao",
}


def run():
    main.init_db()
    client = TestClient(main.app)
    r = client.put("/api/financeiro/configuracao-fiscal", json=DADOS_EZ)
    assert r.status_code == 200, r.text
    cfg = r.json()["config"]
    assert cfg["cnpj"] == "31494899000170"
    assert cfg["codigo_servico_nacional"] == "141401"
    print("OK dados EZ restaurados | CNPJ", cfg.get("cnpj_fmt") or cfg["cnpj"])
    em = r.json().get("emissao", {})
    print("empresa_pronta:", em.get("empresa_pronta"), "| pendencias:", em.get("pendencias"))


if __name__ == "__main__":
    run()
