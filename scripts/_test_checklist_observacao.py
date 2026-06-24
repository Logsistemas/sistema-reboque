"""Testa observacao por parte no checklist (API + persistência)."""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("API_BASE", "http://127.0.0.1:8000").rstrip("/")


def req(method, path, body=None):
    url = f"{BASE}{path}"
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}


def main():
    # Busca um serviço existente
    status, servicos = req("GET", "/api/servicos?limit=5")
    if status != 200 or not servicos:
        print("FAIL: não foi possível listar serviços", status, servicos)
        sys.exit(1)

    lista = servicos if isinstance(servicos, list) else servicos.get("servicos") or servicos.get("items") or []
    if not lista:
        print("FAIL: nenhum serviço encontrado")
        sys.exit(1)

    sid = str(lista[0].get("id") or lista[0].get("servico_id"))
    print("servico_id=", sid)

    payload = {
        "servico_id": sid,
        "checklist": {
            "Frente": {
                "marcacoes": [{"x": 50, "y": 40, "id": 1}],
                "fotos": [],
                "observacao": "Para-choque dianteiro trincado, lado direito.",
            },
            "Traseira": {
                "marcacoes": [],
                "fotos": [],
                "observacao": "Lanterna esquerda riscada.",
            },
        },
        "assinatura_origem": "data:image/png;base64," + ("A" * 100),
    }

    status, salvar = req("POST", "/api/checklist/salvar", payload)
    print("salvar status=", status, "ok=", salvar.get("ok"), "erro=", salvar.get("erro"))

    status, dados = req("GET", f"/api/checklist-dados/{sid}")
    print("dados status=", status)
    partes = dados.get("partes") or {}
    frente = partes.get("Frente") or {}
    traseira = partes.get("Traseira") or {}

    ok_frente = frente.get("observacao") == payload["checklist"]["Frente"]["observacao"]
    ok_traseira = traseira.get("observacao") == payload["checklist"]["Traseira"]["observacao"]
    ok_marcacao = len(frente.get("marcacoes") or []) == 1

    # Compatibilidade: parte sem observacao no payload antigo
    status2, salvar2 = req(
        "POST",
        "/api/checklist/salvar",
        {
            "servico_id": sid,
            "checklist": {
                "Vidros": {"marcacoes": [], "fotos": []},
            },
            "assinatura_origem": payload["assinatura_origem"],
        },
    )
    status3, dados3 = req("GET", f"/api/checklist-dados/{sid}")
    vidros = (dados3.get("partes") or {}).get("Vidros") or {}
    ok_vazio = (vidros.get("observacao") or "") == ""

    print("frente_obs=", frente.get("observacao"))
    print("traseira_obs=", traseira.get("observacao"))
    print("vidros_obs_vazio=", repr(vidros.get("observacao")))
    print("ok_frente", ok_frente, "ok_traseira", ok_traseira, "ok_marcacao", ok_marcacao, "ok_vazio", ok_vazio)

    if ok_frente and ok_traseira and ok_marcacao and ok_vazio and salvar.get("ok"):
        print("OK")
        sys.exit(0)
    print("FAIL")
    sys.exit(1)


if __name__ == "__main__":
    main()
