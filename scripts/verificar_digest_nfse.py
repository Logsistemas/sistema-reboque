#!/usr/bin/env python3
"""
Diagnóstico E0714 — verifica se o DigestValue em debug/nfse_assinada.xml
corresponde ao XML final enviado à SEFIN (padrão XMLDSIG).
Somente leitura; não altera emissão.
"""
from __future__ import annotations

import base64
import difflib
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lxml import etree

from nfse_nacional.constants import NS, NS_DS

DEBUG_DIR = ROOT / "debug"
XML_PATH = DEBUG_DIR / "nfse_assinada.xml"
REPORT_PATH = DEBUG_DIR / "resultado_verificacao_digest.txt"

C14N_20010315 = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"


def _local(tag: str) -> str:
    return etree.QName(tag).localname


def _carregar_xml() -> tuple[bytes, etree._Element]:
    if not XML_PATH.is_file():
        raise SystemExit(f"Arquivo não encontrado: {XML_PATH}")
    xml_bytes = XML_PATH.read_bytes()
    root = etree.fromstring(xml_bytes)
    return xml_bytes, root


def _extrair_assinatura(root: etree._Element) -> dict:
    inf = root.find(f"{{{NS}}}infDPS")
    id_inf = (inf.get("Id") or "").strip() if inf is not None else ""

    signatures = root.findall(f".//{{{NS_DS}}}Signature")
    if len(signatures) != 1:
        raise ValueError(f"Esperado 1 Signature, encontrado {len(signatures)}")

    sig = signatures[0]
    signed_info = sig.find(f"{{{NS_DS}}}SignedInfo")
    reference = signed_info.find(f"{{{NS_DS}}}Reference") if signed_info is not None else None

    reference_uri = (reference.get("URI") or "").strip() if reference is not None else ""

    digest_method_el = reference.find(f"{{{NS_DS}}}DigestMethod") if reference is not None else None
    digest_method = (digest_method_el.get("Algorithm") or "").strip() if digest_method_el is not None else ""

    digest_value_el = reference.find(f"{{{NS_DS}}}DigestValue") if reference is not None else None
    digest_value = (digest_value_el.text or "").strip() if digest_value_el is not None else ""

    signature_method_el = (
        signed_info.find(f"{{{NS_DS}}}SignatureMethod") if signed_info is not None else None
    )
    signature_method = (
        (signature_method_el.get("Algorithm") or "").strip() if signature_method_el is not None else ""
    )

    transforms = []
    if reference is not None:
        for tr in reference.findall(f"{{{NS_DS}}}Transforms/{{{NS_DS}}}Transform"):
            transforms.append((tr.get("Algorithm") or "").strip())

    return {
        "infDPS_Id": id_inf,
        "reference_uri": reference_uri,
        "digest_method": digest_method,
        "digest_value": digest_value,
        "signature_method": signature_method,
        "transforms": transforms,
    }


def _resolver_referencia(doc_root: etree._Element, uri: str) -> etree._Element:
    if not uri.startswith("#"):
        raise ValueError(f"Reference.URI não suportada: {uri}")
    ref_id = uri[1:]
    for attr in ("Id", "ID", "id", "xml:id"):
        results = doc_root.xpath(f"//*[@*[local-name()='{attr}']=$rid]", rid=ref_id)
        if len(results) == 1:
            return results[0]
        if len(results) > 1:
            raise ValueError(f"URI ambígua {uri}: {len(results)} nós")
    raise ValueError(f"Elemento não encontrado para {uri}")


def _remover_signature(signature: etree._Element) -> None:
    parent = signature.getparent()
    if parent is None:
        return
    tail = signature.tail
    parent.remove(signature)
    if tail:
        if len(parent):
            last = parent[-1]
            last.tail = (last.tail or "") + tail
        else:
            parent.text = (parent.text or "") + tail


def _aplicar_transforms(
    doc_root: etree._Element,
    payload: etree._Element,
    signature: etree._Element,
    transforms: list[str],
) -> bytes:
    """Réplica do fluxo signxml XMLVerifier._apply_transforms."""
    working = etree.fromstring(etree.tostring(doc_root))

    sig_nodes = working.findall(f".//{{{NS_DS}}}Signature")
    sig_ref = sig_nodes[0] if sig_nodes else None

    payload = _resolver_referencia(working, f"#{payload.get('Id') or payload.get('ID')}")

    for alg in transforms:
        if alg == ENVELOPED and sig_ref is not None:
            _remover_signature(sig_ref)

    payload = etree.fromstring(etree.tostring(payload))

    c14n_applied = False
    for alg in transforms:
        if alg == C14N_20010315:
            payload = etree.fromstring(etree.tostring(payload))
            c14n = etree.tostring(payload, method="c14n", exclusive=False, with_comments=False)
            c14n_applied = True
            return c14n

    if not c14n_applied:
        payload = etree.fromstring(etree.tostring(payload))
        return etree.tostring(payload, method="c14n", exclusive=False, with_comments=False)

    return etree.tostring(payload, method="c14n", exclusive=False, with_comments=False)


def _hash_digest(data: bytes, digest_method: str) -> str:
    dm = digest_method.lower()
    if "sha1" in dm:
        digest = hashlib.sha1(data).digest()
    elif "sha256" in dm:
        digest = hashlib.sha256(data).digest()
    else:
        raise ValueError(f"DigestMethod não suportado: {digest_method}")
    return base64.b64encode(digest).decode("ascii")


def _recalcular_digest(root: etree._Element, meta: dict) -> tuple[str, bytes]:
    """Recalcula DigestValue conforme transforms declarados (XMLDSIG)."""
    signatures = root.findall(f".//{{{NS_DS}}}Signature")
    sig = signatures[0]
    inf = _resolver_referencia(root, meta["reference_uri"])
    c14n_bytes = _aplicar_transforms(root, inf, sig, meta["transforms"])
    recalc = _hash_digest(c14n_bytes, meta["digest_method"])
    return recalc, c14n_bytes


def _certificado_do_xml(root: etree._Element):
    from cryptography import x509
    from signxml.util import add_pem_header

    cert_nodes = root.findall(f".//{{{NS_DS}}}X509Certificate")
    if not cert_nodes or not (cert_nodes[0].text or "").strip():
        return None
    pem = add_pem_header(cert_nodes[0].text.strip())
    return x509.load_pem_x509_certificate(pem)


def _verificar_assinatura_local(xml_bytes: bytes, root: etree._Element) -> tuple[bool, str]:
    from signxml import XMLVerifier, SignatureConfiguration
    from signxml.algorithms import DigestAlgorithm, SignatureMethod

    config = SignatureConfiguration(
        signature_methods=frozenset(
            {SignatureMethod.RSA_SHA1, SignatureMethod.RSA_SHA256}
        ),
        digest_algorithms=frozenset({DigestAlgorithm.SHA1, DigestAlgorithm.SHA256}),
        require_x509=False,
    )
    cert = _certificado_do_xml(root)
    try:
        XMLVerifier().verify(
            xml_bytes,
            x509_cert=cert,
            expect_config=config,
        )
        return True, ""
    except Exception as exc:
        return False, str(exc)


def _diff_texto(a: str, b: str, label_a: str, label_b: str) -> list[str]:
    linhas = []
    diff = difflib.unified_diff(
        a.splitlines(keepends=True),
        b.splitlines(keepends=True),
        fromfile=label_a,
        tofile=label_b,
        lineterm="",
    )
    bloco = list(diff)
    if not bloco:
        linhas.append("(sem diferenças linha a linha)")
    else:
        linhas.extend(bloco[:200])
        if len(bloco) > 200:
            linhas.append(f"... ({len(bloco) - 200} linhas omitidas)")
    return linhas


def _determinar_cenario(match: bool, assinatura_ok: bool) -> str:
    if not match:
        return "A) Digest divergente após serialização"
    if assinatura_ok:
        return "B) Digest válido e assinatura válida localmente"
    return "C) Assinatura inválida localmente"


def main() -> int:
    saida: list[str] = []

    xml_bytes, root = _carregar_xml()
    meta = _extrair_assinatura(root)

    digest_xml = meta["digest_value"]
    digest_recalc, c14n_bytes = _recalcular_digest(root, meta)
    match = digest_xml == digest_recalc
    assinatura_ok, erro_verify = _verificar_assinatura_local(xml_bytes, root)
    cenario = _determinar_cenario(match, assinatura_ok)

    saida.append("==================================")
    saida.append("DIAGNÓSTICO NFS-E")
    saida.append("==================================")
    saida.append("")
    saida.append(f"infDPS.Id:")
    saida.append(meta["infDPS_Id"])
    saida.append(f"Reference.URI:")
    saida.append(meta["reference_uri"])
    saida.append(f"DigestMethod:")
    saida.append(meta["digest_method"])
    saida.append(f"SignatureMethod:")
    saida.append(meta["signature_method"])
    saida.append("")
    saida.append(f"Digest XML:")
    saida.append(digest_xml)
    saida.append("")
    saida.append(f"Digest Recalculado:")
    saida.append(digest_recalc)
    saida.append("")
    saida.append(f"MATCH:")
    saida.append(str(match))
    saida.append("")
    saida.append("==================================")
    saida.append("")
    saida.append(f"Assinatura válida localmente:")
    saida.append(str(assinatura_ok))
    if not assinatura_ok and erro_verify:
        saida.append(f"Erro XMLVerifier: {erro_verify}")
    if match and not assinatura_ok:
        saida.append("")
        saida.append(
            "Nota: DigestValue confere com o XML final, mas a verificação RSA "
            "do SignedInfo falhou (possível alteração do bloco Signature na serialização)."
        )
    saida.append("")
    saida.append(f"CENÁRIO: {cenario}")
    saida.append("")

    if not match:
        saida.append("--- DETALHAMENTO (MATCH=False) ---")
        saida.append("")
        saida.append(f"Transforms declarados: {meta['transforms']}")
        saida.append(f"Tamanho XML final enviado: {len(xml_bytes)} bytes")
        saida.append(f"Tamanho canonical infDPS (pós-transforms): {len(c14n_bytes)} bytes")
        saida.append("")
        saida.append("XML usado no cálculo (canonical infDPS, pós-transforms):")
        try:
            c14n_txt = c14n_bytes.decode("utf-8")
        except UnicodeDecodeError:
            c14n_txt = repr(c14n_bytes[:2000])
        saida.append(c14n_txt[:8000])
        if len(c14n_txt) > 8000:
            saida.append(f"... ({len(c14n_txt) - 8000} caracteres omitidos)")
        saida.append("")
        saida.append("XML final enviado (debug/nfse_assinada.xml):")
        try:
            final_txt = xml_bytes.decode("utf-8")
        except UnicodeDecodeError:
            final_txt = repr(xml_bytes[:2000])
        saida.append(final_txt[:8000])
        if len(final_txt) > 8000:
            saida.append(f"... ({len(final_txt) - 8000} caracteres omitidos)")
        saida.append("")
        saida.append("Diferenças (canonical infDPS vs trecho infDPS extraído do XML final):")
        inf_final = root.find(f"{{{NS}}}infDPS")
        if inf_final is not None:
            inf_raw_c14n = etree.tostring(
                inf_final, method="c14n", exclusive=False, with_comments=False
            ).decode("utf-8")
            saida.extend(
                _diff_texto(
                    c14n_txt,
                    inf_raw_c14n,
                    "canonical_pos_transforms",
                    "infDPS_c14n_direto_sem_transforms",
                )
            )
        else:
            saida.append("(infDPS não encontrado no XML final)")

    texto = "\n".join(saida)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(texto + "\n", encoding="utf-8")
    print(texto)
    return 0 if match and assinatura_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
