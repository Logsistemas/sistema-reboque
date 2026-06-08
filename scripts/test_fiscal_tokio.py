import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as main
from fastapi.testclient import TestClient

main.init_db()
client = TestClient(main.app)

row = main.one(
    """
    select id, razao_social, cnpj, inscricao_estadual, logradouro, numero, complemento,
           bairro, cep, cidade, uf, telefone, email, email_nfse
      from cadastro_contatos
     where razao_social ilike %s
        or cnpj ilike %s
     limit 1
    """,
    ("%TOKIO MARINE%", "%33164021%"),
)
if not row:
    print("Cliente TOKIO MARINE não encontrado no banco")
    sys.exit(0)

cid = str(row["id"])
print("ID:", cid)
r = client.get(f"/api/cadastros/contatos/{cid}/fiscal")
print("Status:", r.status_code)
item = r.json().get("item") or {}
checks = {
    "nome": item.get("nome") or item.get("razao_social"),
    "cpf_cnpj": item.get("cpf_cnpj") or item.get("cnpj_cpf") or item.get("documento"),
    "ie": item.get("inscricao_estadual") or item.get("ie_rg"),
    "uf": item.get("uf"),
    "municipio": item.get("municipio") or item.get("cidade"),
    "cep": item.get("cep"),
    "endereco": item.get("endereco") or item.get("logradouro"),
    "numero": item.get("numero"),
    "bairro": item.get("bairro"),
    "complemento": item.get("complemento"),
    "telefone": item.get("telefone"),
    "email": item.get("email_nfse") or item.get("email"),
}
expected = {
    "nome": "TOKIO MARINE SEGURADORA SA",
    "cpf_cnpj": "33.164.021/0004-44",
    "uf": "RJ",
    "municipio": "Rio de Janeiro",
    "cep": "20071-003",
    "endereco": "AVN PRES VARGAS",
    "numero": "409",
    "bairro": "CENTRO",
    "complemento": "SAL 602",
    "telefone": "(11) 3054-7000",
    "email": "nfe@tokiomarine.com.br",
}
ok = True
for k, exp in expected.items():
    got = checks.get(k)
    if got != exp:
        print(f"FALHA {k}: esperado {exp!r}, obteve {got!r}")
        ok = False
    else:
        print(f"OK {k}: {got!r}")
if ok:
    print("\nTodos os campos TOKIO MARINE OK")
else:
    raise SystemExit(1)
