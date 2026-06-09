"""Auditoria do fluxo de assinatura XMLDSIG (E0714) — somente diagnóstico."""
from __future__ import annotations

import difflib
import json
import logging
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from lxml import etree

from nfse_nacional.constants import NS, NS_DS

DEBUG_DIR = Path(__file__).resolve().parents[1] / "debug"
DEBUG_JSON = DEBUG_DIR / "nfse_auditoria_fluxo_assinatura.json"
DEBUG_TXT = DEBUG_DIR / "nfse_auditoria_fluxo_assinatura.txt"

LOG = logging.getLogger("financeiro.nfse.nacional.signature_flow_audit")

C14N_20010315 = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"


def _local(tag) -> str:
    return etree.QName(tag).localname


def _para_bytes(xml) -> bytes:
    if isinstance(xml, bytes):
        return xml
    if isinstance(xml, str):
        return xml.encode("utf-8")
    return etree.tostring(xml, xml_declaration=True, encoding="UTF-8")


def _certificado_de_pem(cert_pem: bytes | str | None):
    if not cert_pem:
        return None
    from cryptography import x509
    from signxml.util import add_pem_header

    if isinstance(cert_pem, bytes):
        pem = cert_pem.decode("utf-8")
    else:
        pem = cert_pem
    if "BEGIN CERTIFICATE" not in pem:
        pem = add_pem_header(pem.strip())
    return x509.load_pem_x509_certificate(pem.encode("utf-8"))


def _certificado_do_xml(root: etree._Element):
    from cryptography import x509
    from signxml.util import add_pem_header

    nodes = root.findall(f".//{{{NS_DS}}}X509Certificate")
    if not nodes or not (nodes[0].text or "").strip():
        return None
    pem = add_pem_header(nodes[0].text.strip())
    if isinstance(pem, bytes):
        return x509.load_pem_x509_certificate(pem)
    return x509.load_pem_x509_certificate(pem.encode("utf-8"))


def verificar_assinatura(xml, cert_pem: bytes | str | None = None) -> tuple[bool, str]:
    """XMLVerifier namespace-aware (suporta Signature sem prefixo ds:)."""
    from signxml import SignatureConfiguration
    from signxml.algorithms import DigestAlgorithm, SignatureMethod
    from signxml.util import namespaces as signxml_namespaces

    from signxml import XMLVerifier

    class XMLVerifierNfse(XMLVerifier):
        """signxml usa xpath ds: — resolve xmldsig# default e filhos sem namespace pós-c14n."""

        def _find(self, element, query, require=True, xpath=""):
            from signxml.exceptions import InvalidInput

            uri = signxml_namespaces.ds
            local = query
            if ":" in query:
                prefix, _, local = query.partition(":")
                uri = signxml_namespaces.get(prefix, uri)

            result = element.find(f"{xpath}{{{uri}}}{local}")
            if result is not None:
                return result

            for child in element:
                if etree.QName(child.tag).localname == local:
                    return child

            if not require:
                return None
            raise InvalidInput(f"Expected to find XML element {local} in {element.tag}")

        def _findall(self, element, query, xpath=""):
            uri = signxml_namespaces.ds
            local = query
            if ":" in query:
                prefix, _, local = query.partition(":")
                uri = signxml_namespaces.get(prefix, uri)

            results = element.findall(f"{xpath}{{{uri}}}{local}")
            if results:
                return results
            return [c for c in element if etree.QName(c.tag).localname == local]

    xml_bytes = _para_bytes(xml)
    root = etree.fromstring(xml_bytes)
    cert = _certificado_de_pem(cert_pem) or _certificado_do_xml(root)
    config = SignatureConfiguration(
        signature_methods=frozenset({SignatureMethod.RSA_SHA1, SignatureMethod.RSA_SHA256}),
        digest_algorithms=frozenset({DigestAlgorithm.SHA1, DigestAlgorithm.SHA256}),
        require_x509=False,
    )
    try:
        XMLVerifierNfse().verify(xml_bytes, x509_cert=cert, expect_config=config)
        return True, ""
    except Exception as exc:
        return False, str(exc)


def verificar_digest(xml, cert_pem: bytes | str | None = None) -> tuple[bool, str]:
    """Recalcula DigestValue (enveloped-signature + c14n)."""
    import base64
    import hashlib

    xml_bytes = _para_bytes(xml)
    root = etree.fromstring(xml_bytes)
    sig = _obter_signature(root)
    if sig is None:
        return False, "Signature não encontrada"
    si = sig.find(f"{{{NS_DS}}}SignedInfo")
    ref = si.find(f"{{{NS_DS}}}Reference") if si is not None else None
    if ref is None:
        return False, "Reference não encontrada"
    declarado = (ref.find(f"{{{NS_DS}}}DigestValue").text or "").strip()
    digest_method = (ref.find(f"{{{NS_DS}}}DigestMethod").get("Algorithm") or "").lower()
    ref_id = (ref.get("URI") or "").strip().lstrip("#")

    working = etree.fromstring(xml_bytes)
    payload = working.xpath(f"//*[@*[local-name()='Id']=$rid]", rid=ref_id)
    if len(payload) != 1:
        return False, f"Elemento #{ref_id} não encontrado"
    sig_w = working.find(f".//{{{NS_DS}}}Signature")
    if sig_w is not None and sig_w.getparent() is not None:
        sig_w.getparent().remove(sig_w)
    payload = etree.fromstring(etree.tostring(payload[0]))
    c14n = etree.tostring(payload, method="c14n", exclusive=False, with_comments=False)
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


def verificar_rsa(xml, cert_pem: bytes | str | None = None) -> tuple[bool, str]:
    """Verificação RSA do SignedInfo canonical."""
    import base64

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding
    from signxml.util import add_pem_header

    xml_bytes = _para_bytes(xml)
    root = etree.fromstring(xml_bytes)
    sig = _obter_signature(root)
    if sig is None:
        return False, "Signature não encontrada"
    si = sig.find(f"{{{NS_DS}}}SignedInfo")
    sv = sig.find(f"{{{NS_DS}}}SignatureValue")
    if si is None or sv is None:
        return False, "SignedInfo/SignatureValue ausente"
    cert = _certificado_de_pem(cert_pem) or _certificado_do_xml(root)
    if cert is None:
        pem = add_pem_header(sig.find(f".//{{{NS_DS}}}X509Certificate").text.strip())
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


def _obter_signature(root: etree._Element) -> etree._Element | None:
    sig = root.find(f"{{{NS_DS}}}Signature")
    if sig is not None:
        return sig
    nodes = root.findall(f".//{{{NS_DS}}}Signature")
    return nodes[0] if nodes else None


def _snapshot_assinatura(root: etree._Element) -> dict:
    sig = _obter_signature(root)
    if sig is None:
        return {"erro": "Signature não encontrada"}

    signed_info = sig.find(f"{{{NS_DS}}}SignedInfo")
    reference = signed_info.find(f"{{{NS_DS}}}Reference") if signed_info is not None else None
    c14n_el = signed_info.find(f"{{{NS_DS}}}CanonicalizationMethod") if signed_info is not None else None
    sig_method_el = signed_info.find(f"{{{NS_DS}}}SignatureMethod") if signed_info is not None else None
    digest_method_el = reference.find(f"{{{NS_DS}}}DigestMethod") if reference is not None else None
    digest_value_el = reference.find(f"{{{NS_DS}}}DigestValue") if reference is not None else None
    sig_value_el = sig.find(f"{{{NS_DS}}}SignatureValue")

    signed_info_c14n = b""
    if signed_info is not None:
        signed_info_c14n = etree.tostring(
            signed_info, method="c14n", exclusive=False, with_comments=False
        )

    ns_herdados = []
    atual = sig
    while atual is not None:
        ns_herdados.append(
            {
                "tag": _local(atual.tag),
                "nsmap": {k or "(default)": v for k, v in (atual.nsmap or {}).items()},
            }
        )
        atual = atual.getparent()

    return {
        "CanonicalizationMethod": (c14n_el.get("Algorithm") or "") if c14n_el is not None else "",
        "SignatureMethod": (sig_method_el.get("Algorithm") or "") if sig_method_el is not None else "",
        "DigestMethod": (digest_method_el.get("Algorithm") or "") if digest_method_el is not None else "",
        "Reference_URI": (reference.get("URI") or "") if reference is not None else "",
        "DigestValue": (digest_value_el.text or "").strip() if digest_value_el is not None else "",
        "SignatureValue_inicio": (sig_value_el.text or "").strip()[:80] if sig_value_el is not None else "",
        "SignedInfo_c14n": signed_info_c14n.decode("utf-8", errors="replace"),
        "SignedInfo_c14n_len": len(signed_info_c14n),
        "Signature_nsmap": {k or "(default)": v for k, v in (sig.nsmap or {}).items()},
        "namespaces_ancestrais": ns_herdados,
    }


def _diff_signedinfo(antes: dict, depois: dict) -> list[str]:
    linhas: list[str] = []
    campos = (
        "CanonicalizationMethod",
        "SignatureMethod",
        "DigestMethod",
        "Reference_URI",
        "DigestValue",
        "SignatureValue_inicio",
    )
    for campo in campos:
        a = antes.get(campo, "")
        b = depois.get(campo, "")
        if a != b:
            linhas.append(f"  {campo}:")
            linhas.append(f"    antes:  {a}")
            linhas.append(f"    depois: {b}")

    if antes.get("Signature_nsmap") != depois.get("Signature_nsmap"):
        linhas.append("  Signature_nsmap:")
        linhas.append(f"    antes:  {antes.get('Signature_nsmap')}")
        linhas.append(f"    depois: {depois.get('Signature_nsmap')}")

    c14n_a = antes.get("SignedInfo_c14n", "")
    c14n_b = depois.get("SignedInfo_c14n", "")
    if c14n_a != c14n_b:
        linhas.append("  SignedInfo canonical (diff unified):")
        diff = difflib.unified_diff(
            c14n_a.splitlines(),
            c14n_b.splitlines(),
            fromfile="antes",
            tofile="depois",
            lineterm="",
        )
        for ln in list(diff)[:80]:
            linhas.append(f"    {ln}")
        if len(c14n_a) != len(c14n_b):
            linhas.append(f"    (tamanho antes={len(c14n_a)} depois={len(c14n_b)})")

    return linhas or ["  (nenhuma diferença detectada nos campos inspecionados)"]


class SignatureFlowAuditor:
    """Registra validade XMLDSIG em cada etapa pós-sign."""

    ETAPAS = (
        "apos_sign",
        "apos_mover_signature",
        "apos_serializacao",
    )

    def __init__(self, cert_pem: bytes | str | None = None):
        self.cert_pem = cert_pem
        self.registros: dict[str, dict] = {}
        self._snapshots: dict[str, dict] = {}

    def _registrar(self, etapa: str, xml, descricao: str) -> None:
        valido, erro = verificar_assinatura(xml, self.cert_pem)
        root = etree.fromstring(_para_bytes(xml))
        snap = _snapshot_assinatura(root)
        self.registros[etapa] = {
            "descricao": descricao,
            "valido": valido,
            "erro": erro,
            "snapshot": snap,
        }
        self._snapshots[etapa] = snap
        LOG.warning(
            "AUDITORIA ASSINATURA | %s | valido=%s | erro=%s",
            etapa,
            valido,
            erro or "-",
        )

    def registrar_apos_sign(self, signed_copy: etree._Element) -> None:
        self._registrar(
            "apos_sign",
            signed_copy,
            "Imediatamente após signer.sign() (signed_copy)",
        )

    def registrar_apos_mover(self, dps_root: etree._Element) -> None:
        self._registrar(
            "apos_mover_signature",
            dps_root,
            "Após _extrair_signatures_para_root() (Signature irmã de infDPS)",
        )

    def registrar_apos_serializacao(self, xml_bytes: bytes) -> None:
        self._registrar(
            "apos_serializacao",
            xml_bytes,
            "Após serializar_dps_assinado() (XML final bytes)",
        )

    def _etapa_quebra(self) -> str | None:
        ordem = list(self.ETAPAS)
        for i, etapa in enumerate(ordem):
            if not self.registros.get(etapa, {}).get("valido"):
                if i == 0:
                    return etapa
                prev = ordem[i - 1]
                if self.registros.get(prev, {}).get("valido"):
                    return etapa
                return etapa
        return None

    def finalizar(self) -> dict:
        quebra = self._etapa_quebra()
        linhas = [
            "==================================",
            "AUDITORIA FLUXO ASSINATURA NFS-E",
            f"Gerado em: {datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat(timespec='seconds')}",
            "==================================",
            "",
            f"ASSINATURA VÁLIDA APÓS SIGN = {self.registros.get('apos_sign', {}).get('valido')}",
            f"ASSINATURA VÁLIDA APÓS MOVER SIGNATURE = {self.registros.get('apos_mover_signature', {}).get('valido')}",
            f"ASSINATURA VÁLIDA APÓS SERIALIZAÇÃO = {self.registros.get('apos_serializacao', {}).get('valido')}",
            "",
        ]

        for chave, label in (
            ("apos_sign", "Após signer.sign()"),
            ("apos_mover_signature", "Após _extrair_signatures_para_root()"),
            ("apos_serializacao", "Após serializar_dps_assinado()"),
        ):
            reg = self.registros.get(chave, {})
            linhas.append(f"--- {label} ---")
            linhas.append(f"  Válida: {reg.get('valido')}")
            if reg.get("erro"):
                linhas.append(f"  Erro: {reg.get('erro')}")
            snap = reg.get("snapshot") or {}
            if snap.get("CanonicalizationMethod"):
                linhas.append(f"  CanonicalizationMethod: {snap['CanonicalizationMethod']}")
            if snap.get("SignatureMethod"):
                linhas.append(f"  SignatureMethod: {snap['SignatureMethod']}")
            if snap.get("Signature_nsmap"):
                linhas.append(f"  Signature nsmap: {snap['Signature_nsmap']}")
            linhas.append("")

        if quebra:
            linhas.append(f"ETAPA EM QUE A ASSINATURA QUEBRA: {quebra}")
        else:
            linhas.append("ETAPA EM QUE A ASSINATURA QUEBRA: (nenhuma — válida em todas)")

        if (
            self.registros.get("apos_mover_signature", {}).get("valido")
            and not self.registros.get("apos_serializacao", {}).get("valido")
        ):
            linhas.append("")
            linhas.append("--- DIFERENÇAS SignedInfo (mover -> serialização) ---")
            linhas.extend(
                _diff_signedinfo(
                    self._snapshots.get("apos_mover_signature", {}),
                    self._snapshots.get("apos_serializacao", {}),
                )
            )

        texto = "\n".join(linhas)
        payload = {
            "gerado_em": datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds"),
            "apos_sign": self.registros.get("apos_sign"),
            "apos_mover_signature": self.registros.get("apos_mover_signature"),
            "apos_serializacao": self.registros.get("apos_serializacao"),
            "etapa_quebra": quebra,
            "resumo": {
                "ASSINATURA_VALIDA_APOS_SIGN": self.registros.get("apos_sign", {}).get("valido"),
                "ASSINATURA_VALIDA_APOS_MOVER_SIGNATURE": self.registros.get(
                    "apos_mover_signature", {}
                ).get("valido"),
                "ASSINATURA_VALIDA_APOS_SERIALIZACAO": self.registros.get(
                    "apos_serializacao", {}
                ).get("valido"),
            },
        }

        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        DEBUG_TXT.write_text(texto + "\n", encoding="utf-8")
        DEBUG_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        LOG.warning("%s", texto)
        return payload


def auditar_fluxo_assinatura_dps(
    signed_copy,
    dps_root,
    xml_bytes: bytes,
    cert_pem: bytes | str | None = None,
) -> dict:
    """Atalho: audita as 3 etapas e grava debug/."""
    auditor = SignatureFlowAuditor(cert_pem=cert_pem)
    auditor.registrar_apos_sign(signed_copy)
    auditor.registrar_apos_mover(dps_root)
    auditor.registrar_apos_serializacao(xml_bytes)
    return auditor.finalizar()
