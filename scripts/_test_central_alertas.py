"""Teste HTTP — alertas operacionais Central (placa + recusa)."""
import json
import sys
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")


def http_json(method, path, body=None):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    servicos = http_json("GET", "/api/servicos")
    if not servicos:
        print("NO_SERVICO")
        return 1
    sid = str(servicos[0]["id"])
    proto = servicos[0].get("protocolo") or ""
    print("servico", sid[:8], "protocolo", proto)

    http_json("POST", f"/api/app/servicos/{sid}/placa", {"placa": "TST1A23"})
    alertas = http_json("GET", "/api/central/alertas")
    placas = alertas.get("placas") or []
    print("placas", len(placas))
    hit = next((p for p in placas if str(p.get("servico_id")) == sid), None)
    print("placa_hit", bool(hit), hit.get("titulo") if hit else "")
    if not hit:
        print("FAIL placa")
        return 1

    http_json("POST", f"/api/app/servicos/{sid}/status", {"status": "recusado"})
    alertas2 = http_json("GET", "/api/central/alertas")
    recusas = alertas2.get("recusas") or []
    print("recusas", len(recusas))
    hit2 = next((r for r in recusas if str(r.get("servico_id")) == sid), None)
    print("recusa_hit", bool(hit2), hit2.get("titulo") if hit2 else "")
    if not hit2:
        print("FAIL recusa")
        return 1

    http_json("POST", f"/api/central/alertas/placa/{sid}/marcar-visto")
    http_json("POST", f"/api/central/alertas/recusa/{sid}/marcar-visto")
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
