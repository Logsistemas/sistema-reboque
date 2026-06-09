#!/usr/bin/env python3
"""
Teste experimental: assinatura XMLDSIG sem prefixo ds: (E1228).
Não altera emissão nem serializar_dps_assinado().

Uso:
    python scripts/test_signature_sem_prefixo.py
"""
from __future__ import annotations

import base64
import re
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
from signxml import XMLSigner, methods
from signxml.util import namespaces as signxml_ns

from nfse_nacional.constants import NS, NS_DS, algoritmos_assinatura_nfse
from nfse_nacional.dps_builder import montar_dps_xml
from nfse_nacional.signer import _extrair_signatures_para_root, _obter_id_elemento, carregar_pfx
from nfse_nacional.signature_flow_audit import verificar_assinatura

DEBUG_DIR = ROOT / "debug"
OUT_PADRAO = DEBUG_DIR / "nfse_assinada_padrao_ds.xml"
OUT_SEM_PREFIXO = DEBUG_DIR / "nfse_assinada_namespace_default.xml"
OUT_POST = DEBUG_DIR / "nfse_post_final.xml"
RELATORIO = DEBUG_DIR / "resultado_test_signature_sem_prefixo.txt"

PREFIXOS_MONITORADOS = ("ds", "ns0", "ns1", "ns2", "soap", "xsi", "xsd", "xml")


def _local(tag) -> str:
    return etree.QName(tag).localname


def _cert_teste() -> tuple[str, str]:
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


def _config_nota():
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
    return config, nota


class _XMLSignerNfseHomolog(XMLSigner):
    """signxml 4.x — permite SHA-1 (homologação)."""

    def check_deprecated_methods(self):
        pass


class _XMLSignerSemPrefixoDs(_XMLSignerNfseHomolog):
    """
    Experimental: namespace default xmldsig# em vez de prefixo ds:.
    Sobrescreve self.namespaces após __init__ do signxml.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.namespaces = {None: signxml_ns.ds}


def _criar_signer(sem_prefixo: bool, ambiente: str = "homologacao"):
    sig_alg, dig_alg = algoritmos_assinatura_nfse(ambiente)
    cls = _XMLSignerSemPrefixoDs if sem_prefixo else _XMLSignerNfseHomolog
    return cls(
        method=methods.enveloped,
        signature_algorithm=sig_alg,
        digest_algorithm=dig_alg,
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )


def _assinar_dps_experimental(root, inf, key_pem, cert_pem, sem_prefixo: bool) -> bytes:
    ref_id = _obter_id_elemento(inf)
    reference_uri = f"#{ref_id}"
    signer = _criar_signer(sem_prefixo=sem_prefixo)
    signed_copy = signer.sign(
        inf,
        key=key_pem,
        cert=cert_pem,
        reference_uri=reference_uri,
        id_attribute="Id",
    )
    root_exp = etree.fromstring(etree.tostring(root))
    inf_exp = root_exp.find(f"{{{NS}}}infDPS")
    _extrair_signatures_para_root(root_exp, signed_copy)
    return etree.tostring(root_exp, xml_declaration=True, encoding="UTF-8", pretty_print=False)


def _verificar_assinatura_rsa(xml_bytes: bytes) -> tuple[bool, str]:
    """Verificação RSA direta do SignedInfo (independe do prefixo ds: no signxml)."""
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes
    from cryptography import x509
    from signxml.util import add_pem_header

    root = etree.fromstring(xml_bytes)
    sig = root.find(f".//{{{NS_DS}}}Signature")
    if sig is None:
        return False, "Signature não encontrada"
    si = sig.find(f"{{{NS_DS}}}SignedInfo")
    sv = sig.find(f"{{{NS_DS}}}SignatureValue")
    cert_el = sig.find(f".//{{{NS_DS}}}X509Certificate")
    if si is None or sv is None or cert_el is None:
        return False, "SignedInfo/SignatureValue/X509Certificate ausente"
    pem = add_pem_header((cert_el.text or "").strip())
    cert = x509.load_pem_x509_certificate(pem if isinstance(pem, bytes) else pem.encode())
    si_c14n = etree.tostring(si, method="c14n", exclusive=False, with_comments=False)
    raw = base64.b64decode((sv.text or "").strip())
    sm = sig.find(f".//{{{NS_DS}}}SignatureMethod")
    alg = (sm.get("Algorithm") or "").lower() if sm is not None else ""
    hash_alg = hashes.SHA1() if "sha1" in alg else hashes.SHA256()
    try:
        cert.public_key().verify(raw, si_c14n, padding.PKCS1v15(), hash_alg)
        return True, ""
    except Exception as exc:
        return False, str(exc)


def _verificar_digest(xml_bytes: bytes) -> tuple[bool, str]:
    """DigestValue recalculado == declarado (enveloped-signature + c14n)."""
    root = etree.fromstring(xml_bytes)
    sig = root.find(f".//{{{NS_DS}}}Signature")
    if sig is None:
        return False, "Signature não encontrada"
    si = sig.find(f"{{{NS_DS}}}SignedInfo")
    ref = si.find(f"{{{NS_DS}}}Reference") if si is not None else None
    if ref is None:
        return False, "Reference não encontrada"
    declarado = (ref.find(f"{{{NS_DS}}}DigestValue").text or "").strip()
    digest_method = (ref.find(f"{{{NS_DS}}}DigestMethod").get("Algorithm") or "").lower()
    ref_uri = (ref.get("URI") or "").strip()
    ref_id = ref_uri.lstrip("#")

    working = etree.fromstring(xml_bytes)
    payload = working.xpath(f"//*[@*[local-name()='Id']=$rid]", rid=ref_id)
    if len(payload) != 1:
        return False, f"Elemento {ref_uri} não encontrado"
    payload = payload[0]

    sig_w = working.find(f".//{{{NS_DS}}}Signature")
    if sig_w is not None and sig_w.getparent() is not None:
        sig_w.getparent().remove(sig_w)

    payload = etree.fromstring(etree.tostring(payload))
    c14n = etree.tostring(payload, method="c14n", exclusive=False, with_comments=False)
    import hashlib

    if "sha1" in digest_method:
        digest = hashlib.sha1(c14n).digest()
    elif "sha256" in digest_method:
        digest = hashlib.sha256(c14n).digest()
    else:
        return False, f"DigestMethod não suportado: {digest_method}"
    recalc = base64.b64encode(digest).decode()
    if recalc != declarado:
        return False, f"declarado={declarado} recalc={recalc}"
    return True, declarado


def _scan_prefixos(xml_bytes: bytes, rotulo: str) -> dict:
    txt = xml_bytes.decode("utf-8", errors="replace")
    tags_prefix = sorted(set(re.findall(r"<\s*/?\s*([a-zA-Z0-9]+):", txt)))
    xmlns_decl = sorted(set(re.findall(r"xmlns:([a-zA-Z0-9]+)=", txt)))
    monitorados = {p: (p in tags_prefix or p in xmlns_decl) for p in PREFIXOS_MONITORADOS}
    outros = sorted(set(tags_prefix + xmlns_decl) - set(PREFIXOS_MONITORADOS))
    return {
        "rotulo": rotulo,
        "tags_prefix": tags_prefix,
        "xmlns_prefix": xmlns_decl,
        "monitorados": monitorados,
        "outros": outros,
        "tem_ds": "ds" in tags_prefix or "ds" in xmlns_decl,
        "signature_default_ns": 'Signature xmlns="http://www.w3.org/2000/09/xmldsig#"' in txt,
    }


def _formatar_scan(scan: dict) -> list[str]:
    linhas = [
        f"--- {scan['rotulo']} ---",
        f"  Tags com prefixo: {scan['tags_prefix'] or '(nenhum)'}",
        f"  xmlns: declarados: {scan['xmlns_prefix'] or '(nenhum)'}",
        f"  Signature xmlns default xmldsig#: {scan['signature_default_ns']}",
        "  PREFIXOS MONITORADOS:",
    ]
    for p in PREFIXOS_MONITORADOS:
        status = "SIM" if scan["monitorados"].get(p) else "nao"
        linhas.append(f"    {p}: {status}")
    if scan["outros"]:
        linhas.append(f"  Outros prefixos: {scan['outros']}")
    return linhas


def _avaliar(xml_bytes: bytes, rotulo: str) -> dict:
    ok_sig, err_sig = verificar_assinatura(xml_bytes)
    ok_rsa, err_rsa = _verificar_assinatura_rsa(xml_bytes)
    ok_dig, info_dig = _verificar_digest(xml_bytes)
    scan = _scan_prefixos(xml_bytes, rotulo)
    return {
        "rotulo": rotulo,
        "assinatura_valida": ok_sig,
        "assinatura_rsa_valida": ok_rsa,
        "digest_valido": ok_dig,
        "erro_assinatura": err_sig,
        "erro_rsa": err_rsa,
        "info_digest": info_dig,
        "scan": scan,
    }


def main() -> int:
    config, nota = _config_nota()
    pfx, senha = _cert_teste()
    key_pem, cert_pem = carregar_pfx(pfx, senha)

    root_padrao, inf_padrao, _, _, _ = montar_dps_xml(config, nota)
    root_sem, inf_sem, _, _, _ = montar_dps_xml(config, nota)

    xml_padrao = _assinar_dps_experimental(root_padrao, inf_padrao, key_pem, cert_pem, sem_prefixo=False)
    xml_sem = _assinar_dps_experimental(root_sem, inf_sem, key_pem, cert_pem, sem_prefixo=True)

    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PADRAO.write_bytes(xml_padrao)
    OUT_SEM_PREFIXO.write_bytes(xml_sem)
    OUT_POST.write_bytes(xml_padrao)

    res_padrao = _avaliar(xml_padrao, "Padrão signxml (ds:)")
    res_sem = _avaliar(xml_sem, "Experimental namespace default xmldsig#")

    linhas = [
        "==================================",
        "TESTE ASSINATURA SEM PREFIXO ds:",
        "==================================",
        "",
        "=== PADRÃO signxml (ds:) ===",
        f"  Arquivo: {OUT_PADRAO}",
        f"  Assinatura válida (XMLVerifier): {res_padrao['assinatura_valida']}",
        f"  Assinatura válida (RSA direto):  {res_padrao['assinatura_rsa_valida']}",
        f"  Digest válido:                   {res_padrao['digest_valido']}",
    ]
    if res_padrao["erro_assinatura"]:
        linhas.append(f"  Erro assinatura: {res_padrao['erro_assinatura']}")
    if not res_padrao["digest_valido"]:
        linhas.append(f"  Erro digest: {res_padrao['info_digest']}")
    linhas.extend(_formatar_scan(res_padrao["scan"]))

    linhas.extend(
        [
            "",
            "=== EXPERIMENTAL namespace default xmldsig# ===",
            f"  Arquivo: {OUT_SEM_PREFIXO}",
            f"  Assinatura válida (XMLVerifier): {res_sem['assinatura_valida']}",
            f"  Assinatura válida (RSA direto):  {res_sem['assinatura_rsa_valida']}",
            f"  Digest válido:                   {res_sem['digest_valido']}",
        ]
    )
    if res_sem["erro_assinatura"] and not res_sem["assinatura_rsa_valida"]:
        linhas.append(f"  Erro assinatura: {res_sem['erro_assinatura']}")
    elif res_sem["erro_assinatura"] and res_sem["assinatura_rsa_valida"]:
        linhas.append(
            f"  XMLVerifier falhou (limitação signxml com ds: xpath): {res_sem['erro_assinatura']}"
        )
    if not res_sem["digest_valido"]:
        linhas.append(f"  Erro digest: {res_sem['info_digest']}")
    linhas.extend(_formatar_scan(res_sem["scan"]))

    linhas.extend(
        [
            "",
            "=== SIMULAÇÃO PRÉ-POST ===",
            f"  XML gravado em: {OUT_POST}",
        ]
    )
    scan_post = _scan_prefixos(OUT_POST.read_bytes(), "nfse_post_final.xml (padrão ds:)")
    linhas.extend(_formatar_scan(scan_post))
    linhas.append("")
    linhas.append("PREFIXOS ENCONTRADOS (consolidado nfse_post_final.xml):")
    todos = sorted(set(scan_post["tags_prefix"] + scan_post["xmlns_prefix"]))
    if todos:
        for p in todos:
            linhas.append(f"  {p}:")
    else:
        linhas.append("  (nenhum prefixo)")

    assinada_real = DEBUG_DIR / "nfse_assinada.xml"
    if assinada_real.is_file():
        linhas.extend(["", "=== nfse_assinada.xml (emissão real) ==="])
        scan_real = _scan_prefixos(assinada_real.read_bytes(), "nfse_assinada.xml")
        linhas.extend(_formatar_scan(scan_real))
        ok_real, _ = verificar_assinatura(assinada_real.read_bytes())
        linhas.append(f"  XMLVerifier emissão real: {ok_real}")

    linhas.extend(["", "=== CONCLUSÃO ==="])
    sem_prefixo_ok = (
        res_sem["assinatura_rsa_valida"]
        and res_sem["digest_valido"]
        and not res_sem["scan"]["tem_ds"]
    )
    if sem_prefixo_ok:
        linhas.extend(
            [
                "signxml PODE assinar sem prefixo ds: usando self.namespaces = {None: xmldsig#}.",
                "Assinatura RSA + Digest válidos; XML sem prefixo ds:.",
                "XMLVerifier falha apenas porque signxml procura filhos com prefixo ds: internamente.",
                "",
                "Próximo passo (futuro, NÃO agora):",
                "  - Aplicar _XMLSignerSemPrefixoDs em signer.py (antes do sign, não na serialização).",
                "  - Manter serializar_dps_assinado() com etree.tostring direto.",
            ]
        )
    elif res_sem["assinatura_rsa_valida"] and res_sem["scan"]["tem_ds"]:
        linhas.append(
            "Assinatura RSA válida mas ainda contém prefixo ds: — ajuste de namespaces insuficiente."
        )
    else:
        linhas.extend(
            [
                "Assinatura experimental sem ds: NÃO validou (RSA).",
                "Manter fluxo atual (ds:) até investigar ajuste adicional no signxml.",
            ]
        )

    texto = "\n".join(linhas)
    RELATORIO.write_text(texto + "\n", encoding="utf-8")
    print(texto)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
