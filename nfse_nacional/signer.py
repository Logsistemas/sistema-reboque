from lxml import etree

from nfse_nacional.constants import NS_DS


def assinar_xml(elemento_raiz, private_key, cert_pem):
    """Assina XML NFS-e Nacional — Signature irmã do elemento inf* referenciado por Id."""
    from signxml import XMLSigner, methods

    ref_id = elemento_raiz.get("Id")
    if not ref_id:
        raise ValueError("Elemento a assinar deve possuir atributo Id")

    signer = XMLSigner(
        method=methods.enveloped,
        signature_algorithm="rsa-sha256",
        digest_algorithm="sha256",
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )
    signed = signer.sign(
        elemento_raiz,
        key=private_key,
        cert=cert_pem,
        reference_uri={"uri": f"#{ref_id}"},
    )
    # signxml enveloped coloca Signature dentro do pai — mover para irmã se necessário
    parent = signed.getparent()
    if parent is not None:
        sigs = parent.findall(f"{{{NS_DS}}}Signature")
        for sig in sigs:
            if sig.getparent() is not signed:
                parent.remove(sig)
                parent.append(sig)
    return parent if parent is not None else signed


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
