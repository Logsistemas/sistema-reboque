"""Teste rápido das APIs do app motorista."""
from fastapi.testclient import TestClient

import app as main

client = TestClient(main.app)

m = main.one(
    "select id, login, senha, nome from motoristas where coalesce(ativo,true)=true limit 1"
)
print("motorista:", m.get("nome") if m else None, m.get("id") if m else None)
print("login campo:", m.get("login") if m else None)

if not m:
    raise SystemExit("Nenhum motorista ativo no banco.")

mid = str(m["id"])
login = m.get("login") or ""
senha = m.get("senha") or ""

r = client.post(
    "/api/app/motorista/login",
    json={"login": login, "senha": senha, "placa": "ABC1234"},
)
print("login:", r.status_code, r.json())

r2 = client.get(f"/api/app/motorista/{mid}/servicos")
j = r2.json()
print("servicos:", r2.status_code, "ok=", j.get("ok"), "qtd=", len(j.get("servicos", [])))

for s in j.get("servicos", [])[:3]:
    campos = {
        "protocolo": s.get("protocolo"),
        "seguradora": s.get("seguradora"),
        "origem": (s.get("origem") or "")[:60],
        "destino": (s.get("destino") or "")[:60],
        "tipo": s.get("tipo"),
        "status": s.get("status"),
        "observacao": s.get("observacao"),
        "placa": s.get("placa_veiculo_removido") or s.get("placa_removida"),
    }
    print("  servico:", campos)

outro = main.one(
    "select id from motoristas where id <> %s and coalesce(ativo,true)=true limit 1",
    (mid,),
)
if outro:
    r3 = client.get(f"/api/app/motorista/{outro['id']}/servicos")
    j3 = r3.json()
    ids = [x["id"] for x in j3.get("servicos", [])]
    overlap = [x["id"] for x in j.get("servicos", []) if x["id"] in ids]
    print("filtro motorista: overlap entre motoristas =", len(overlap))

if j.get("servicos"):
    sid = j["servicos"][0]["id"]
    r4 = client.get(f"/api/checklist-dados/{sid}")
    print("checklist-dados:", r4.status_code, list(r4.json().keys()) if r4.status_code == 200 else r4.text)

statuses = ["aceito", "a caminho", "na origem", "em transporte", "finalizado", "recusado"]
print("status API permitidos no app:", statuses)
print("nota: 'enviado' e 'cancelado' vem da Central; app atualiza via aceito/recusado/etc.")
