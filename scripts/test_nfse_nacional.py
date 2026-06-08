"""Testes unitários NFS-e Nacional (sem chamada à API)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from nfse_nacional.ids import gerar_id_dps, gerar_id_evento_cancelamento, pad_ndps
from nfse_nacional.dps_builder import montar_dps_xml
from nfse_nacional.client import gzip_b64, gunzip_b64


def test_ids():
    id_dps = gerar_id_dps("3550308", "11222333000181", "1", "42")
    assert id_dps.startswith("DPS")
    assert len(id_dps) == 45
    assert pad_ndps("42") == "000000000000042"
    chave = "3" * 50
    id_ev = gerar_id_evento_cancelamento(chave, 1)
    assert id_ev.startswith("PRE")
    assert len(id_ev) == 59
    print("OK ids")


def test_dps_xml():
    config = {
        "ambiente": "homologacao",
        "cnpj": "11.222.333/0001-81",
        "inscricao_municipal": "123456",
        "codigo_ibge_municipio": "3550308",
        "codigo_servico_nacional": "140101",
        "codigo_servico_municipal": "001",
        "cnae_principal": "4930202",
        "regime_tributario": "Simples Nacional",
        "aliquota_iss_padrao": 5,
    }
    nota = {
        "id": "abc-123",
        "numero_rps": "1",
        "serie_rps": "1",
        "data_emissao": "2026-06-08",
        "cliente_nome": "TOKIO MARINE SEGURADORA SA",
        "cliente_cnpj_cpf": "33.050.196/0001-68",
        "total_nota": 1.0,
        "itens": [{"descricao": "Serviço teste", "valor": 1.0}],
        "impostos": {},
    }
    _root, inf, id_dps, _n, xml = montar_dps_xml(config, nota)
    assert "infDPS" in xml
    assert id_dps in xml
    assert "TOKIO MARINE" in xml
    assert "140101" in xml
    roundtrip = gunzip_b64(gzip_b64(xml))
    assert "DPS" in roundtrip
    print("OK dps xml", id_dps[:20] + "...")


def test_validacao_nota():
    from nfse_nacional.service import validar_nota_emissao, validar_config_emissao

    config = {
        "cnpj": "11222333000181",
        "inscricao_municipal": "123",
        "codigo_ibge_municipio": "3550308",
        "cnae_principal": "4930202",
        "codigo_servico_nacional": "140101",
        "regime_tributario": "Simples Nacional",
        "aliquota_iss_padrao": 5,
        "ambiente": "homologacao",
    }
    cert = {"caminho_arquivo": "/tmp/cert.pfx", "valido": True, "vencido": False}
    assert not validar_config_emissao(config, cert)
    nota_ok = {
        "situacao": "pendente",
        "cliente_cnpj_cpf": "33050196000168",
        "cliente_nome": "TOKIO",
        "total_nota": 100,
        "impostos": {"aliquota_iss": 5},
    }
    assert not validar_nota_emissao(nota_ok, config)
    nota_sem_doc = dict(nota_ok, cliente_cnpj_cpf="")
    assert any("CPF/CNPJ" in e for e in validar_nota_emissao(nota_sem_doc, config))
    nota_sem_ali = dict(nota_ok, impostos={})
    config_sem_ali = dict(config, aliquota_iss_padrao=0)
    assert any("Alíquota ISS" in e for e in validar_nota_emissao(nota_sem_ali, config_sem_ali))
    print("OK validacao")


if __name__ == "__main__":
    test_ids()
    test_dps_xml()
    test_validacao_nota()
