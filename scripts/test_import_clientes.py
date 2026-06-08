"""Teste rápido da importação CSV de clientes (preview + upsert)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

CSV = """Código;Razão Social / Nome;Nome Fantasia;Tipo Pessoa;CNPJ / CPF;Inscrição Estadual / RG;IE Isento;Endereço;Número;Complemento;Bairro;CEP;Cidade;UF;Telefone;Fax;Celular;E-mail;E-mail para envio de NFS-e;Website;Situação;Observações;Segmento;Vendedor;Condição de pagamento;Regime tributário;Cliente desde
CLI001;Empresa Teste Import LTDA;Teste Import;PJ;11222333000181;123456789;Não;Rua das Flores;100;Sala 2;Centro;01310100;São Paulo;SP;(11)3333-4444;;(11)99999-8888;contato@teste.com;nfse@teste.com;www.teste.com;Ativo;Obs teste;Varejo;João;30 dias;Simples Nacional;01/01/2020
CLI002;Maria Silva Santos;;PF;52998224725;MG-12.345.678;;Av Brasil;50;;Jardim;30140071;Belo Horizonte;MG;;;;maria@email.com;;;;;;;
"""


def main_test():
    main.init_db()
    raw = CSV.encode("utf-8-sig")
    client = TestClient(main.app)
    files = {"arquivo": ("clientes_teste.csv", raw, "text/csv")}

    before = main.one("select count(*)::int as n from cadastro_contatos where cliente=true")["n"]
    prev = client.post("/api/cadastros/clientes/import/preview", files=files)
    print("PREVIEW:", prev.status_code, prev.json())

    imp = client.post("/api/cadastros/clientes/import", files=files)
    print("IMPORT:", imp.status_code, imp.json())

    after = main.one("select count(*)::int as n from cadastro_contatos where cliente=true")["n"]
    print("Clientes antes/depois:", before, after)

    row = main.one(
        """
        select id, codigo_cliente, razao_social, cnpj, cidade, email_nfse
          from cadastro_contatos
         where regexp_replace(coalesce(cnpj,''), '\\D', '', 'g') = '11222333000181'
         limit 1
        """
    )
    if row:
        print("email_nfse DB:", row.get("email_nfse"))
        fid = client.get(f"/api/cadastros/contatos/{row['id']}/fiscal")
        print("FISCAL:", fid.status_code, fid.json())

    imp2 = client.post("/api/cadastros/clientes/import", files=files)
    j2 = imp2.json()
    print(
        "REIMPORT (sem duplicar):",
        j2.get("inseridos"),
        "inseridos,",
        j2.get("atualizados"),
        "atualizados",
    )
    after2 = main.one("select count(*)::int as n from cadastro_contatos where cliente=true")["n"]
    print("Total clientes após reimport:", after2, "(delta esperado 0)")

    main.q("delete from cadastro_contatos where codigo_cliente in ('CLI001','CLI002')")
    print("Registros de teste removidos.")


if __name__ == "__main__":
    main_test()
