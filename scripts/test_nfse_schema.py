"""Teste de validação XSD local do DPS NFS-e Nacional v1.01."""
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

from nfse_nacional.dps_builder import montar_dps_xml
from nfse_nacional.schema_validator import validar_dps_xml, validar_dps_xml_ou_erro
from nfse_nacional.signer import assinar_dps


def _certificado_teste():
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
    pfx_path = Path(tempfile.mkstemp(suffix=".pfx")[1])
    pfx_path.write_bytes(
        pkcs12.serialize_key_and_certificates(
            b"teste", key, cert, None, serialization.BestAvailableEncryption(b"teste")
        )
    )
    return pfx_path, "teste"


def _config_e_nota():
    config = {
        "ambiente": "homologacao",
        "cnpj": "31494899000170",
        "inscricao_municipal": "11321232",
        "codigo_ibge_municipio": "3304557",
        "codigo_servico_nacional": "141401",
        "regime_tributario": "Regime Normal",
        "aliquota_iss_padrao": 5,
    }
    nota = {
        "numero_rps": "1",
        "serie_rps": "1",
        "data_emissao": "2026-06-08",
        "cliente_cnpj_cpf": "33164021000444",
        "cliente_nome": "TOKIO MARINE SEGURADORA SA",
        "total_nota": 1.0,
        "itens": [{"descricao": "Serviço de reboque"}],
        "impostos": {"aliquota_iss": 5, "nbs": "106044000"},
    }
    return config, nota


def test_dps_sem_assinatura():
    config, nota = _config_e_nota()
    _root, _inf, _id_dps, _n, xml = montar_dps_xml(config, nota)
    erros = validar_dps_xml(xml)
    assert erros == [], erros
    print("OK DPS sem assinatura passou no XSD")


def test_dps_assinado():
    config, nota = _config_e_nota()
    root, inf, id_dps, _n, _xml = montar_dps_xml(config, nota)
    pfx, senha = _certificado_teste()
    xml_assinado = assinar_dps(root, inf, str(pfx), senha)
    validar_dps_xml_ou_erro(xml_assinado)
    assert b"<Signature" in xml_assinado
    assert id_dps.encode() in xml_assinado
    print("OK DPS assinado passou no XSD", id_dps[:20] + "...")


def test_dps_invalido_rejeitado():
    from lxml import etree

    config, nota = _config_e_nota()
    root, _inf, _id, _n, _xml = montar_dps_xml(config, nota)
    for el in root.iter("{http://www.sped.fazenda.gov.br/nfse}totTrib"):
        el.getparent().remove(el)
    xml_invalido = etree.tostring(root, xml_declaration=True, encoding="UTF-8")
    erros = validar_dps_xml(xml_invalido)
    assert erros, "XML sem totTrib deveria falhar no XSD"
    print("OK DPS inválido (sem totTrib) rejeitado pelo XSD")


def main():
    test_dps_sem_assinatura()
    test_dps_assinado()
    test_dps_invalido_rejeitado()
    print("\nTodos os testes XSD passaram.")


if __name__ == "__main__":
    main()
