"""Teste do modal Enviar/Trocar — HTML + API de despacho."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import app as main

client = TestClient(main.app)

# 1) HTML da Central contém botão e modal
r = client.get("/central")
assert r.status_code == 200, r.status_code
html = r.text
assert 'data-cmm-open="1"' in html, "botão data-cmm-open ausente"
assert 'id="modalMotorista"' in html, "modal #modalMotorista ausente"
assert "central_modal_motorista.js" in html, "script central_modal_motorista.js ausente"
assert "addEventListener('click', handleCmmClick, true)" in open("static/central_modal_motorista.js", encoding="utf-8").read(), "delegação capture ausente"
print("OK HTML: botão, modal, script e delegação capture presentes")

# 2) API motoristas para serviço
servicos = client.get("/api/servicos").json()
assert servicos, "sem serviços na central"
sid = servicos[0]["id"]
r_m = client.get(f"/api/servicos/{sid}/motoristas")
assert r_m.status_code == 200
motoristas = r_m.json()
assert isinstance(motoristas, list)
livre = next((m for m in motoristas if m.get("online") and not m.get("ocupado")), None)
print(f"OK API motoristas: {len(motoristas)} total, livre={bool(livre)}")

# 3) Despacho (mesma rota do form POST)
if livre:
    r_env = client.post(f"/servicos/{sid}/enviar", data={"motorista_id": livre["id"]}, follow_redirects=False)
    assert r_env.status_code in (303, 302, 200), r_env.status_code
    print(f"OK POST /servicos/{sid}/enviar status={r_env.status_code}")
else:
    print("AVISO: nenhum motorista livre online — despacho não testado")

print("OK — cadeia backend validada")
