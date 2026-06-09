"""Testes unitários NFS-e Nacional (sem chamada à API)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from nfse_nacional.ids import gerar_id_dps, gerar_id_evento_cancelamento, pad_ndps
from nfse_nacional.dps_builder import montar_dps_xml, extrair_trecho_cserv, extrair_trecho_tributos
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
        "regime_tributario": "Regime Normal",
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
        "impostos": {"nbs": "106044000", "aliquota_iss": 5},
    }
    _root, inf, id_dps, _n, xml = montar_dps_xml(config, nota)
    assert "infDPS" in xml
    assert id_dps in xml
    assert "TOKIO MARINE" in xml
    assert "140101" in xml
    assert "106044000" in xml
    assert "cCNAE" not in xml and "cNAE" not in xml
    assert "ns0:" not in xml
    assert '<DPS xmlns="' in xml
    cserv = extrair_trecho_cserv(_root)
    assert "<cServ" in cserv
    assert "<cNBS>106044000</cNBS>" in cserv
    assert "cCNAE" not in cserv
    assert "<cTribMun>001</cTribMun>" in cserv
    trib = extrair_trecho_tributos(_root)
    assert "<totTrib" in trib
    assert "<indTotTrib>0</indTotTrib>" in trib
    assert "tribFed" not in trib
    roundtrip = gunzip_b64(gzip_b64(xml))
    assert "DPS" in roundtrip
    print("OK dps xml", id_dps[:20] + "...")


def test_dps_sem_ctrib_mun():
    """Como Bling: cTribNac + cNBS, sem cTribMun quando municipal não informado."""
    config = {
        "ambiente": "homologacao",
        "cnpj": "31494899000170",
        "codigo_ibge_municipio": "3304557",
        "codigo_servico_nacional": "141401",
        "codigo_servico_municipal": "141401",
        "regime_tributario": "Regime Normal",
        "aliquota_iss_padrao": 5,
    }
    nota = {
        "numero_rps": "1",
        "data_emissao": "2026-06-08",
        "cliente_cnpj_cpf": "33164021000444",
        "cliente_nome": "TOKIO",
        "total_nota": 1.0,
        "itens": [{"descricao": "Serviço"}],
        "impostos": {"nbs": "106044000", "aliquota_iss": 5},
    }
    root, _, _, _, xml = montar_dps_xml(config, nota)
    cserv = extrair_trecho_cserv(root)
    assert "<cTribNac>141401</cTribNac>" in cserv
    assert "<cNBS>106044000</cNBS>" in cserv
    assert "cTribMun" not in cserv and "cTribMun" not in xml
    print("OK dps sem cTribMun (estilo Bling)")


def test_tot_trib_simples_nacional():
    config = {
        "ambiente": "homologacao",
        "cnpj": "11.222.333/0001-81",
        "codigo_ibge_municipio": "3550308",
        "codigo_servico_nacional": "140101",
        "regime_tributario": "Simples Nacional",
        "aliquota_iss_padrao": 5,
    }
    nota = {
        "numero_rps": "1",
        "data_emissao": "2026-06-08",
        "cliente_cnpj_cpf": "33050196000168",
        "cliente_nome": "Cliente",
        "total_nota": 100,
        "itens": [{"descricao": "Serviço"}],
        "impostos": {"aliquota_iss": 5},
    }
    root, _, _, _, xml = montar_dps_xml(config, nota)
    trib = extrair_trecho_tributos(root)
    assert "<totTrib" in trib
    assert "<pTotTribSN>5.00</pTotTribSN>" in trib
    assert "totTrib/>" not in trib and "<totTrib></totTrib>" not in trib
    print("OK totTrib simples nacional")


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


def test_assinatura_dps_reference():
    """Garante Reference URI = #{Id} real (não #uri)."""
    import tempfile
    from datetime import datetime, timedelta, timezone

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    from nfse_nacional.signer import assinar_dps, carregar_pfx

    config = {
        "ambiente": "homologacao",
        "cnpj": "31494899000170",
        "inscricao_municipal": "11321232",
        "codigo_ibge_municipio": "3304557",
        "codigo_servico_nacional": "141401",
        "cnae_principal": "5229002",
        "regime_tributario": "Regime Normal",
        "aliquota_iss_padrao": 5,
    }
    nota = {
        "id": "test-sign",
        "numero_rps": "1",
        "serie_rps": "1",
        "data_emissao": "2026-06-08",
        "cliente_nome": "TOKIO MARINE",
        "cliente_cnpj_cpf": "33050196000168",
        "total_nota": 1.0,
        "itens": [{"descricao": "Serviço teste", "valor": 1.0}],
        "impostos": {"aliquota_iss": 5, "nbs": "106044000"},
    }
    root, inf, id_dps, _, _ = montar_dps_xml(config, nota)

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Teste NFS-e")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    pfx_path = tempfile.mktemp(suffix=".pfx")
    from cryptography.hazmat.primitives.serialization import pkcs12

    with open(pfx_path, "wb") as f:
        f.write(
            pkcs12.serialize_key_and_certificates(
                b"test1234",
                key,
                cert,
                None,
                serialization.BestAvailableEncryption(b"test1234"),
            )
        )

    xml_assinado = assinar_dps(root, inf, pfx_path, "test1234", ambiente="homologacao")
    xml_txt = xml_assinado.decode("utf-8") if isinstance(xml_assinado, bytes) else xml_assinado

    from nfse_nacional.signature_flow_audit import (
        verificar_assinatura,
        verificar_digest,
        verificar_rsa,
    )

    ok_xml, err_xml = verificar_assinatura(xml_assinado)
    ok_dig, info_dig = verificar_digest(xml_assinado)
    ok_rsa, err_rsa = verificar_rsa(xml_assinado)
    print(f"XMLVerifier=True: {ok_xml}")
    print(f"Digest=True: {ok_dig}")
    print(f"RSA=True: {ok_rsa}")
    if err_xml:
        print(f"  XMLVerifier erro: {err_xml}")
    if not ok_dig:
        print(f"  Digest erro: {info_dig}")
    if err_rsa:
        print(f"  RSA erro: {err_rsa}")
    assert ok_xml, f"XMLVerifier: {err_xml}"
    assert ok_dig, f"Digest: {info_dig}"
    assert ok_rsa, f"RSA: {err_rsa}"

    assert "rsa-sha1" in xml_txt
    assert "xmldsig#sha1" in xml_txt
    assert 'Signature xmlns="http://www.w3.org/2000/09/xmldsig#"' in xml_txt
    assert "ds:" not in xml_txt
    assert "xmlns:ds" not in xml_txt

    from nfse_nacional.signature_audit import registrar_diagnostico_assinatura

    diag = registrar_diagnostico_assinatura(xml_assinado, pfx_path, "test1234")
    assert diag["signature_method"] == "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
    assert diag["digest_method"] == "http://www.w3.org/2000/09/xmldsig#sha1"
    assert diag["validacoes_ok"] is True

    ok_post, err_post = verificar_assinatura(xml_assinado)
    print(f"XMLVerifier antes do POST: {ok_post}")
    if err_post:
        print(f"  erro: {err_post}")
    assert ok_post, f"Assinatura inválida antes do POST: {err_post}"
    assert f'URI="#{id_dps}"' in xml_txt or f'URI="#{id_dps}"' in xml_txt.replace("'", '"')
    assert 'URI="#uri"' not in xml_txt
    assert "Signature" in xml_txt
    assert '<DPS xmlns="' in xml_txt
    assert "ns0:" not in xml_txt and "xmlns:ns" not in xml_txt
    assert "cCNAE" not in xml_txt
    assert "<cNBS>106044000</cNBS>" in extrair_trecho_cserv(root)
    import re

    assert not re.search(r"<\s*/?\s*[a-zA-Z0-9]+:", xml_txt)
    from nfse_nacional.xml_serial import analisar_xml_dps

    info = analisar_xml_dps(xml_assinado)
    assert info["tag_raiz"] == "DPS"
    assert info["prefixos_tags"] == []
    assert info["xmlns_prefixados"] == []
    print(f"Prefixos=0")
    print("OK assinatura reference", id_dps[:24] + "...")


def test_gzip_bytes_integridade():
    from nfse_nacional.client import preparar_envio_dps

    xml_bytes = (
        b'<?xml version="1.0" encoding="UTF-8"?>'
        b'<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="X"/></DPS>'
    )
    path, saved, dps_b64, sha_final, sha_arquivo, sha_enviado = preparar_envio_dps(xml_bytes)
    assert saved == xml_bytes
    assert sha_final == sha_arquivo == sha_enviado
    assert path.exists()
    print("OK gzip bytes integridade", sha_final[:16] + "...")


if __name__ == "__main__":
    test_ids()
    test_dps_xml()
    test_dps_sem_ctrib_mun()
    test_tot_trib_simples_nacional()
    test_validacao_nota()
    test_assinatura_dps_reference()
    test_gzip_bytes_integridade()
