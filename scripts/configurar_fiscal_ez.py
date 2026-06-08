"""Configura Configuração Fiscal EZ LOGISTICA + importa certificado A1 (sem emitir NFS-e)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as main
import financeiro_config_fiscal as fcf
from nfse_nacional.service import pendencias_emissao_empresa, validar_certificado_cnpj
from nfse_nacional.signer import extrair_cnpj_certificado

CNPJ_ESPERADO = "31494899000170"


def _titular_cert(info):
    subj = info.get("subject") or ""
    if "CN=" in subj:
        cn = subj.split("CN=", 1)[1].split(",", 1)[0]
        if ":" in cn:
            return cn.split(":", 1)[0].strip()
        return cn.strip()
    return info.get("razao_social") or "—"


def run():
    main_mod = main
    main_mod.init_db()

    payload = {
        "razao_social": "EZ LOGISTICA EIRELI",
        "nome_fantasia": "LOG SOLUCOES",
        "cnpj": "31.494.899/0001-70",
        "inscricao_municipal": "1.132.123-2",
        "municipio_emissao": "Rio de Janeiro",
        "uf_municipio": "RJ",
        "codigo_ibge_municipio": "3304557",
        "cnae_principal": "5229002",
        "regime_tributario": "Regime Normal",
        "aliquota_iss_padrao": 5,
        "ambiente": "homologacao",
    }

    from fastapi.testclient import TestClient

    client = TestClient(main_mod.app)
    r = client.put("/api/financeiro/configuracao-fiscal", json=payload)
    if r.status_code != 200:
        raise SystemExit(f"Falha ao salvar config: {r.status_code} {r.text}")
    config = r.json()["config"]
    print("CONFIG SALVA:", config["id"])

    leg = main_mod.one(
        "select * from financeiro_certificados_digitais where coalesce(ativo,true)=true order by updated_at desc limit 1"
    )
    if not leg:
        raise SystemExit("Certificado A1 não encontrado no servidor.")

    path = leg["caminho_arquivo"]
    senha = fcf._dec_senha(leg.get("senha_criptografada") or "")
    if not senha:
        raise SystemExit("Senha do certificado legado indisponível.")

    with open(path, "rb") as f:
        raw = f.read()

    # Import via API (mesmo fluxo da tela)
    r2 = client.post(
        "/api/financeiro/configuracao-fiscal/certificado",
        files={"arquivo": (Path(path).name, raw, "application/x-pkcs12")},
        data={"senha": senha},
    )
    if r2.status_code != 200:
        raise SystemExit(f"Falha ao importar certificado: {r2.status_code} {r2.text}")

    cert_pub = r2.json()["certificado"]
    info = fcf.ler_certificado_info(path, senha)
    cnpj_cert = extrair_cnpj_certificado(path, senha) or info.get("cnpj") or ""
    titular = _titular_cert(info)
    validade = info.get("validade")
    validade_fmt = validade.strftime("%d/%m/%Y") if validade else "—"

    cnpj_ok = cnpj_cert == CNPJ_ESPERADO
    print("\n=== CERTIFICADO A1 ===")
    print(f"CNPJ certificado: {cnpj_cert[:2]}.{cnpj_cert[2:5]}.{cnpj_cert[5:8]}/{cnpj_cert[8:12]}-{cnpj_cert[12:]}")
    print(f"CNPJ confere com empresa: {'SIM' if cnpj_ok else 'NAO'}")
    print(f"Titular: {titular}")
    print(f"Vencimento: {validade_fmt}")
    print(f"Situacao: {'Valido' if cert_pub.get('valido') else 'Verificar'}")

    r3 = client.get("/api/financeiro/configuracao-fiscal")
    data = r3.json()
    config = data["config"]
    cert_row = main_mod.one(
        "select * from financeiro_config_fiscal_certificado where coalesce(ativo,true)=true order by updated_at desc limit 1"
    )
    cert_full = dict(cert_row) if cert_row else {}
    pend = pendencias_emissao_empresa(config, cert_full, fcf._dec_senha)
    pend_cnpj = validar_certificado_cnpj(config, cert_full, fcf._dec_senha)
    todas = list(dict.fromkeys(pend + pend_cnpj))

    print("\n=== APTIDAO PARA EMISSAO (homologacao) ===")
    if not todas:
        print("100% apta — todos os pre-requisitos atendidos.")
    else:
        print("NAO 100% apta — pendencias:")
        for p in todas:
            print(f"  - {p}")

    print("\n=== CAMPOS OBRIGATORIOS AINDA PENDENTES ===")
    extras = []
    if not (config.get("codigo_servico_nacional") or "").strip():
        extras.append("Codigo de servico nacional (cTribNac) — ex.: item LC 116 convertido para tabela nacional")
    if not (config.get("codigo_servico_municipal") or "").strip():
        extras.append("Codigo tributacao municipal (Rio de Janeiro) — se exigido pela prefeitura")
    extras.append("NBS — nao ha campo na tela; informar na nota/impostos se a SEFIN exigir para o servico")
    for e in extras:
        print(f"  - {e}")

    print("\nEmissao de notas: NAO executada (conforme solicitado).")


if __name__ == "__main__":
    run()
