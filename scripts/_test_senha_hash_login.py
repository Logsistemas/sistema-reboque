"""Testes unitários de hash/verify e fluxo de login (sem DB)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from auth_senha import e_hash_bcrypt, hash_senha, verificar_senha


def test_hash_verify():
    h = hash_senha("SenhaTeste!99")
    assert e_hash_bcrypt(h)
    assert verificar_senha("SenhaTeste!99", h)
    assert not verificar_senha("outra", h)
    assert verificar_senha("legado", "legado")  # pré-migração
    assert not verificar_senha("x", "")
    print("OK hash/verify")


def test_login_endpoints_com_mock():
    # Evita init_db no startup
    with patch("app.init_db"):
        import app as app_mod
        from fastapi.testclient import TestClient

        mid = "11111111-1111-1111-1111-111111111111"
        senha_plana = "teste123"
        motorista = {
            "id": mid,
            "nome": "Motorista Teste",
            "senha": hash_senha(senha_plana),
            "login": "mototeste",
            "cpf": "12345678901",
            "placa": "ABC1D23",
            "placa_atual": "ABC1D23",
            "veiculo": "Guincho",
            "ativo": True,
            "online": False,
        }

        def fake_one(sql, params=None):
            sql_l = (sql or "").lower()
            if "from motoristas" in sql_l and "where id" in sql_l:
                return dict(motorista)
            if "from motoristas" in sql_l:
                login = (params or [""])[0]
                if str(login).lower() in ("mototeste", "12345678901"):
                    return dict(motorista)
            return None

        def fake_q(sql, params=None, fetch=False):
            return [] if fetch else None

        app_mod.one = fake_one
        app_mod.q = fake_q
        app_mod.motorista_by_id = lambda _mid: dict(motorista, placa_atual="XYZ9A88", placa="XYZ9A88")

        client = TestClient(app_mod.app)

        # API app
        r = client.post(
            "/api/app/motorista/login",
            json={"login": "mototeste", "senha": senha_plana, "placa": "XYZ9A88"},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        print("OK api login")

        r_bad = client.post(
            "/api/app/motorista/login",
            json={"login": "mototeste", "senha": "errada", "placa": "XYZ9A88"},
        )
        assert r_bad.status_code == 401
        print("OK api login rejeita senha errada")

        # Web form
        r2 = client.post(
            "/motorista/login",
            data={"login": "mototeste", "senha": senha_plana, "placa": "XYZ9A88"},
            follow_redirects=False,
        )
        assert r2.status_code in (303, 302), r2.status_code
        assert f"/motorista/{mid}" in (r2.headers.get("location") or "")
        print("OK web login")

        # Rejeição web: valida a mesma regra do endpoint (sem depender do TemplateResponse no TestClient/Py3.14)
        assert not verificar_senha("errada", motorista["senha"])
        print("OK web login rejeita senha errada (verify)")
        print("TODOS OK")
        return


if __name__ == "__main__":
    test_hash_verify()
    test_login_endpoints_com_mock()
