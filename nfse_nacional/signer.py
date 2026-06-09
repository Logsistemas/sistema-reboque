import logging

from lxml import etree
from signxml import XMLSigner, methods

from nfse_nacional.constants import NS, NS_DS, algoritmos_assinatura_nfse
from nfse_nacional.xml_serial import serializar_dps_assinado, validar_xml_sem_prefixo

log = logging.getLogger("financeiro.nfse.nacional.signer")


class _XMLSignerSemPrefixoDs(XMLSigner):
    """
    SEFIN E1228 — assina com namespace default xmldsig# (sem prefixo ds:).
    SHA-1 (homologação) e SHA-256 (produção).
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.namespaces = {None: NS_DS}

    def check_deprecated_methods(self):
        if "SHA1" in self.sign_alg.name or "SHA1" in self.digest_alg.name:
            return
        super().check_deprecated_methods()


def _local(tag):
    return etree.QName(tag).localname


def _obter_id_elemento(elemento):
    """Lê atributo Id (NFS-e Nacional exige Id maiúsculo)."""
    ref_id = elemento.get("Id") or elemento.get("id")
    if not ref_id:
        for k, v in (elemento.attrib or {}).items():
            if k == "Id" or k.endswith("}Id"):
                ref_id = v
                break
    return (ref_id or "").strip()


def _extrair_signatures_para_root(root, signed_element):
    """signxml 4.x retorna cópia do elemento — anexa Signature ao root (irmã de infDPS)."""
    sigs = list(signed_element.findall(f".//{{{NS_DS}}}Signature"))
    for sig in sigs:
        parent = sig.getparent()
        if parent is not None:
            parent.remove(sig)
        root.append(sig)
    return root


def assinar_inf_elemento(root, inf_element, key_pem, cert_pem, rotulo="inf", ambiente=None):
    """
    Assina infDPS / infEvento com XMLDSIG.
    reference_uri deve ser string '#{Id}' — signxml 4.x não aceita dict.
    """
    from signxml import methods

    ref_id = _obter_id_elemento(inf_element)
    if not ref_id:
        raise ValueError(f"Elemento {rotulo} sem atributo Id para assinatura")

    reference_uri = f"#{ref_id}"
    xml_antes = etree.tostring(root, xml_declaration=True, encoding="UTF-8").decode("utf-8")

    log.info(
        "Assinatura XMLDSIG | rotulo=%s | id=%s | reference_uri=%s | xml_antes_len=%s",
        rotulo,
        ref_id,
        reference_uri,
        len(xml_antes),
    )
    log.debug("XML antes da assinatura (%s):\n%s", rotulo, xml_antes[:4000])

    sig_alg, dig_alg = algoritmos_assinatura_nfse(ambiente)
    log.info(
        "Assinatura XMLDSIG algoritmos | ambiente=%s | signature=%s | digest=%s",
        ambiente or "homologacao",
        sig_alg,
        dig_alg,
    )

    signer = _XMLSignerSemPrefixoDs(
        method=methods.enveloped,
        signature_algorithm=sig_alg,
        digest_algorithm=dig_alg,
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )
    signed_copy = signer.sign(
        inf_element,
        key=key_pem,
        cert=cert_pem,
        reference_uri=reference_uri,
        id_attribute="Id",
    )

    auditor = None
    if _local(root.tag) == "DPS":
        try:
            from nfse_nacional.signature_flow_audit import SignatureFlowAuditor

            auditor = SignatureFlowAuditor(cert_pem=cert_pem)
            signed_copy_audit = etree.fromstring(etree.tostring(signed_copy))
            auditor.registrar_apos_sign(signed_copy_audit)
        except Exception as exc:
            log.warning("Auditoria fluxo assinatura (pós-sign) falhou: %s", exc)
            auditor = None

    _extrair_signatures_para_root(root, signed_copy)

    if auditor is not None:
        try:
            auditor.registrar_apos_mover(root)
        except Exception as exc:
            log.warning("Auditoria fluxo assinatura (pós-mover) falhou: %s", exc)
            auditor = None

    if _local(root.tag) == "DPS":
        xml_bytes = serializar_dps_assinado(root, cert_pem=cert_pem)
    else:
        xml_bytes = etree.tostring(root, xml_declaration=True, encoding="UTF-8")
        validar_xml_sem_prefixo(xml_bytes)

    if auditor is not None:
        try:
            auditor.registrar_apos_serializacao(xml_bytes)
            auditor.finalizar()
        except Exception as exc:
            log.warning("Auditoria fluxo assinatura (pós-serialização) falhou: %s", exc)

    log.info(
        "XML assinado final (%s) | len=%s | inicio=%s",
        rotulo,
        len(xml_bytes),
        xml_bytes[:500].decode("utf-8", errors="replace").replace("\n", " "),
    )
    ref_b = reference_uri.encode("utf-8")
    if ref_b not in xml_bytes:
        raise ValueError(
            f"Assinatura XMLDSIG não gerou Reference {reference_uri} no XML final"
        )
    if b"#uri" in xml_bytes:
        raise ValueError("Assinatura XMLDSIG inválida: Reference URI='#uri' detectado")
    return xml_bytes


def assinar_dps(dps_root, inf_dps, pfx_path, senha, ambiente=None):
    key_pem, cert_pem = carregar_pfx(pfx_path, senha)
    return assinar_inf_elemento(
        dps_root, inf_dps, key_pem, cert_pem, rotulo="infDPS", ambiente=ambiente
    )


def assinar_evento(root, inf_evento, pfx_path, senha, ambiente=None):
    key_pem, cert_pem = carregar_pfx(pfx_path, senha)
    return assinar_inf_elemento(
        root, inf_evento, key_pem, cert_pem, rotulo="infEvento", ambiente=ambiente
    )


def assinar_xml(elemento_raiz, private_key, cert_pem):
    """Compat — assina elemento com Id e mantém Signature como irmã quando possível."""
    ref_id = _obter_id_elemento(elemento_raiz)
    if not ref_id:
        raise ValueError("Elemento a assinar deve possuir atributo Id")
    parent = elemento_raiz.getparent()
    root = parent if parent is not None else elemento_raiz
    return assinar_inf_elemento(root, elemento_raiz, private_key, cert_pem)


def carregar_pfx(pfx_path, senha):
    from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption, pkcs12

    with open(pfx_path, "rb") as f:
        data = f.read()
    pwd = senha.encode() if senha else None
    private_key, cert, _ = pkcs12.load_key_and_certificates(data, pwd)
    if not private_key or not cert:
        raise ValueError("Certificado A1 inválido ou senha incorreta")
    key_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    cert_pem = cert.public_bytes(Encoding.PEM)
    return key_pem, cert_pem


def extrair_cnpj_certificado(pfx_path, senha):
    """Extrai CNPJ (14 dígitos) do subject do certificado A1."""
    import re

    from cryptography.hazmat.primitives.serialization import pkcs12

    with open(pfx_path, "rb") as f:
        data = f.read()
    pwd = senha.encode() if senha else None
    _key, cert, _ = pkcs12.load_key_and_certificates(data, pwd)
    if not cert:
        return ""
    subject = cert.subject.rfc4514_string()
    for attr in cert.subject:
        oid = attr.oid._name if hasattr(attr.oid, "_name") else str(attr.oid)
        val = re.sub(r"\D", "", str(attr.value or ""))
        if oid in ("serialNumber", "organizationIdentifier") and len(val) >= 14:
            return val[:14]
    digits = re.sub(r"\D", "", subject)
    if len(digits) >= 14:
        return digits[:14]
    return ""
