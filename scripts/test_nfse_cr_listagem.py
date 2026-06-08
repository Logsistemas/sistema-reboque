import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as m
from fastapi.testclient import TestClient

m.init_db()
client = TestClient(m.app)

# Simulate list with este_mes filter (May 2026 - today in user_info was May 29)
r_may = client.get("/api/financeiro/contas-receber?situacao=em_aberto&data_ini=2026-05-01&data_fim=2026-05-31")
items_may = r_may.json().get("itens") or []
nfse_may = [i for i in items_may if "RPS" in (i.get("descricao") or "")]
print("CR em aberto May 2026 com RPS:", len(nfse_may))

r_jun = client.get("/api/financeiro/contas-receber?situacao=em_aberto&data_ini=2026-06-01&data_fim=2026-06-30")
items_jun = r_jun.json().get("itens") or []
nfse_jun = [i for i in items_jun if "TOKIO" in (i.get("cliente") or "")]
print("CR em aberto June 2026 TOKIO:", len(nfse_jun))
for i in nfse_jun[:3]:
    print(" ", i.get("cliente"), i.get("vencimento"), i.get("valor_fmt"), i.get("descricao")[:60])

r_all = client.get("/api/financeiro/contas-receber?busca=TOKIO")
print("CR busca TOKIO (sem periodo):", len(r_all.json().get("itens") or []))
