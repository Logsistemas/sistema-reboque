"""Testes Configuração Fiscal (somente leitura — não sobrescreve dados reais)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as main
from fastapi.testclient import TestClient

API = "/api/financeiro/configuracao-fiscal"


def test_config_fiscal():
    main.init_db()
    client = TestClient(main.app)

    r = client.get("/financeiro/configuracao-fiscal")
    assert r.status_code == 200, r.text
    assert "Configuração Fiscal" in r.text
    print("OK página")

    r = client.get("/configuracoes/certificado-digital", follow_redirects=False)
    assert r.status_code in (302, 307)
    print("OK redirect legado")

    r = client.get(API)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert "config" in body
    assert "emissao" in body
    cfg = body["config"]
    assert cfg is None or cfg.get("razao_social")
    print("OK get config", cfg.get("razao_social") if cfg else "(vazio)")

    row = main.one("select count(*)::int as c from financeiro_config_fiscal")
    assert row["c"] >= 1
    print("OK tabela financeiro_config_fiscal")


if __name__ == "__main__":
    test_config_fiscal()
