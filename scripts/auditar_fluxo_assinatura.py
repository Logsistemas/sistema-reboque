#!/usr/bin/env python3
"""Replay do fluxo de assinatura com auditoria em cada etapa (somente diagnóstico)."""
from __future__ import annotations

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
from lxml import etree

from nfse_nacional.constants import NS_DS
from nfse_nacional.dps_builder import montar_dps_xml
from nfse_nacional.signature_flow_audit import SignatureFlowAuditor, verificar_assinatura
from nfse_nacional.signer import _extrair_signatures_para_root, assinar_dps
from nfse_nacional.xml_serial import serializar_dps_assinado


def _cert_teste():
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
    pfx = Path(tempfile.mktemp(suffix=".pfx"))
    pfx.write_bytes(
        pkcs12.serialize_key_and_certificates(
            b"test1234", key, cert, None, serialization.BestAvailableEncryption(b"test1234")
        )
    )
    return str(pfx), "test1234"


def _sign_step_by_step(root, inf, pfx, senha, ambiente="homologacao"):
    from signxml import XMLSigner, methods

    from nfse_nacional.constants import algoritmos_assinatura_nfse
    from nfse_nacional.signer import _obter_id_elemento, carregar_pfx

    key_pem, cert_pem = carregar_pfx(pfx, senha)
    ref_id = _obter_id_elemento(inf)
    reference_uri = f"#{ref_id}"
    sig_alg, dig_alg = algoritmos_assinatura_nfse(ambiente)

    class _XMLSignerNfseHomolog(XMLSigner):
        def check_deprecated_methods(self):
            pass

    signer_cls = _XMLSignerNfseHomolog if "sha1" in sig_alg.lower() else XMLSigner
    signer = signer_cls(
        method=methods.enveloped,
        signature_algorithm=sig_alg,
        digest_algorithm=dig_alg,
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )

    auditor = SignatureFlowAuditor(cert_pem=cert_pem)

    signed_copy = signer.sign(
        inf, key=key_pem, cert=cert_pem, reference_uri=reference_uri, id_attribute="Id"
    )
    auditor.registrar_apos_sign(signed_copy)

    _extrair_signatures_para_root(root, signed_copy)
    auditor.registrar_apos_mover(root)

    xml_bytes = serializar_dps_assinado(root, cert_pem=cert_pem)
    auditor.registrar_apos_serializacao(xml_bytes)

    return auditor.finalizar()


def main():
    config = {
        "ambiente": "homologacao",
        "cnpj": "31494899000170",
        "codigo_ibge_municipio": "3304557",
        "codigo_servico_nacional": "141401",
        "regime_tributario": "Regime Normal",
        "aliquota_iss_padrao": 5,
    }
    nota = {
        "numero_rps": "1",
        "data_emissao": "2026-06-09",
        "cliente_cnpj_cpf": "52910023000137",
        "cliente_nome": "TESTE",
        "total_nota": 1.0,
        "itens": [{"descricao": "TESTE"}],
        "impostos": {"aliquota_iss": 5, "nbs": "106044000"},
    }

    pfx, senha = _cert_teste()
    root, inf, _, _, _ = montar_dps_xml(config, nota)

    print("=== Replay etapa a etapa (certificado teste) ===")
    resultado = _sign_step_by_step(root, inf, pfx, senha)
    print(Path(ROOT / "debug" / "nfse_auditoria_fluxo_assinatura.txt").read_text(encoding="utf-8"))

    assinada = ROOT / "debug" / "nfse_assinada.xml"
    if assinada.is_file():
        print("\n=== Verificação sobre debug/nfse_assinada.xml (emissão real) ===")
        xml_real = assinada.read_bytes()
        ok, err = verificar_assinatura(xml_real)
        print(f"XMLVerifier nfse_assinada.xml: {ok}")
        if err:
            print(f"Erro: {err}")

    return 0 if resultado.get("etapa_quebra") == "apos_serializacao" or not resultado.get("etapa_quebra") else 1


if __name__ == "__main__":
    raise SystemExit(main())
