"""Serialização XML NFS-e Nacional — preserva assinatura signxml intacta."""
import logging
import re
from pathlib import Path

from lxml import etree

from nfse_nacional.constants import NS, NS_DS, VERSAO_DPS

LOG = logging.getLogger("financeiro.nfse.nacional.xml_serial")

DEBUG_XML_PATH = Path(__file__).resolve().parents[1] / "debug" / "nfse_ultimo_xml_enviado.xml"
DEBUG_ASSINADA_PATH = Path(__file__).resolve().parents[1] / "debug" / "nfse_assinada.xml"
DEBUG_POST_FINAL_PATH = Path(__file__).resolve().parents[1] / "debug" / "nfse_post_final.xml"


def _local(tag):
    return etree.QName(tag).localname


def serializar_dps_assinado(dps_root, cert_pem=None) -> bytes:
    """
    Serializa DPS já assinada sem reconstruir a árvore Signature.
    A assinatura XMLDSIG deve permanecer byte-a-byte equivalente ao pós-signxml.
    """
    if not dps_root.get("versao"):
        dps_root.set("versao", VERSAO_DPS)

    xml_bytes = etree.tostring(
        dps_root,
        xml_declaration=True,
        encoding="UTF-8",
        pretty_print=False,
    )
    validar_xml_sem_prefixo(xml_bytes)
    exigir_assinatura_valida(xml_bytes, cert_pem=cert_pem)

    DEBUG_POST_FINAL_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEBUG_POST_FINAL_PATH.write_bytes(xml_bytes)
    info = analisar_xml_dps(xml_bytes)
    prefixos = sorted(set(info["prefixos_tags"] + info["xmlns_prefixados"]))
    LOG.warning("ASSINATURA FINAL VÁLIDA = True")
    LOG.warning("PREFIXOS ENCONTRADOS: %s", prefixos if prefixos else "0")
    return xml_bytes


def exigir_assinatura_valida(xml_bytes, cert_pem=None) -> None:
    """XMLVerifier obrigatório — bloqueia envio se assinatura inválida."""
    from nfse_nacional.signature_flow_audit import verificar_assinatura

    ok, erro = verificar_assinatura(xml_bytes, cert_pem)
    if not ok:
        raise ValueError(
            f"Assinatura XMLDSIG inválida após serialização (envio bloqueado): {erro}"
        )


def validar_xml_sem_prefixo(xml):
    """Rejeita prefixos visíveis nas tags ou xmlns: (SEFIN E1228)."""
    xml_str = xml.decode("utf-8") if isinstance(xml, bytes) else xml
    if re.search(r"<\s*/?\s*[a-zA-Z0-9]+:", xml_str):
        trecho = re.search(r"<\s*/?\s*[a-zA-Z0-9]+:", xml_str)
        raise ValueError(
            f"XML com prefixo de namespace não permitido pela SEFIN: {trecho.group(0) if trecho else '?'}"
        )
    if re.search(r"\sxmlns:[a-zA-Z0-9]+=", xml_str):
        raise ValueError("XML com declaração xmlns:prefixo não permitida pela SEFIN (E1228)")


def salvar_debug_xml_bytes(xml_bytes: bytes) -> Path:
    """Grava bytes finais exatamente como serão enviados (sem re-encode)."""
    DEBUG_XML_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEBUG_XML_PATH.write_bytes(xml_bytes)
    return DEBUG_XML_PATH


def salvar_nfse_assinada_bytes(xml_bytes: bytes) -> Path:
    """Cópia do XML assinado exatamente como enviado à SEFIN (diagnóstico E0714)."""
    DEBUG_ASSINADA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEBUG_ASSINADA_PATH.write_bytes(xml_bytes)
    return DEBUG_ASSINADA_PATH


def _txt_el(parent, ns, local):
    if parent is None:
        return ""
    el = parent.find(f"{{{ns}}}{local}")
    return (el.text or "").strip() if el is not None else ""


def _attr_el(parent, ns, local, attr):
    if parent is None:
        return ""
    el = parent.find(f"{{{ns}}}{local}")
    return (el.get(attr) or "").strip() if el is not None else ""


def extrair_info_assinatura(xml) -> dict:
    """Extrai campos da assinatura XMLDSIG para diagnóstico antes do POST SEFIN."""
    xml_bytes = xml if isinstance(xml, bytes) else xml.encode("utf-8")
    root = etree.fromstring(xml_bytes)

    inf = root.find(f"{{{NS}}}infDPS")
    id_inf = (inf.get("Id") or "").strip() if inf is not None else ""

    sig = root.find(f"{{{NS_DS}}}Signature")
    if sig is None:
        sig = root.find(f".//{{{NS_DS}}}Signature")

    signed_info = sig.find(f"{{{NS_DS}}}SignedInfo") if sig is not None else None
    reference = signed_info.find(f"{{{NS_DS}}}Reference") if signed_info is not None else None

    digest_method = _attr_el(reference, NS_DS, "DigestMethod", "Algorithm")
    digest_value = _txt_el(reference, NS_DS, "DigestValue")
    signature_method = _attr_el(signed_info, NS_DS, "SignatureMethod", "Algorithm")
    signature_value = _txt_el(sig, NS_DS, "SignatureValue")
    reference_uri = (reference.get("URI") or "").strip() if reference is not None else ""

    return {
        "infDPS_Id": id_inf,
        "Reference_URI": reference_uri,
        "DigestMethod": digest_method,
        "DigestValue": digest_value,
        "SignatureMethod": signature_method,
        "SignatureValue": signature_value,
        "SignatureValue_inicio": signature_value[:80],
    }


def analisar_xml_dps(xml) -> dict:
    """Resumo do XML para inspeção antes do envio."""
    xml_str = xml.decode("utf-8") if isinstance(xml, bytes) else xml
    linhas = xml_str.splitlines()
    primeira = linhas[0] if linhas else xml_str[:120]
    corpo = xml_str.split("?>", 1)[-1].lstrip()
    root_match = re.search(r"^<\s*([^\s/>]+)", corpo)
    tag_raiz = root_match.group(1) if root_match else "?"
    namespaces = re.findall(r'xmlns(?::\w+)?="[^"]+"', corpo[:2500])
    prefixos = sorted(set(re.findall(r"<\s*/?\s*([a-zA-Z0-9]+):", xml_str)))
    xmlns_pref = sorted(set(re.findall(r"xmlns:([a-zA-Z0-9]+)=", xml_str)))
    return {
        "primeira_linha": primeira,
        "tag_raiz": tag_raiz,
        "namespaces": namespaces,
        "prefixos_tags": prefixos,
        "xmlns_prefixados": xmlns_pref,
    }
