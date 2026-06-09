"""Diagnóstico da assinatura XMLDSIG antes do POST à SEFIN (E0714)."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from lxml import etree

from nfse_nacional.constants import NS, NS_DS
from nfse_nacional.signer import extrair_cnpj_certificado
from nfse_nacional.xml_serial import salvar_nfse_assinada_bytes

DEBUG_DIR = Path(__file__).resolve().parents[1] / "debug"
DEBUG_ASSINATURA_JSON = DEBUG_DIR / "nfse_assinatura.json"
DEBUG_ASSINATURA_LOG = DEBUG_DIR / "nfse_assinatura.log"

LOG_NFSE = logging.getLogger("financeiro.nfse")
LOG_NACIONAL = logging.getLogger("financeiro.nfse.nacional")

RSA_SIGNATURE_MARKERS = ("rsa-sha256", "rsa-sha1")
DIGEST_MARKERS = ("sha256", "sha1")


def _as_bytes(xml) -> bytes:
    return xml if isinstance(xml, bytes) else xml.encode("utf-8")


def _cert_info(pfx_path: str | None, senha: str | None) -> tuple[str, str, str]:
    if not pfx_path:
        return "", "", ""
    try:
        from cryptography.hazmat.primitives.serialization import pkcs12

        with open(pfx_path, "rb") as f:
            data = f.read()
        pwd = senha.encode() if senha else None
        _key, cert, _ = pkcs12.load_key_and_certificates(data, pwd)
        if not cert:
            return "", "", ""
        subject = cert.subject.rfc4514_string()
        serial = str(cert.serial_number)
        cnpj = extrair_cnpj_certificado(pfx_path, senha or "")
        return subject, serial, cnpj
    except Exception as exc:
        return f"(erro ao ler certificado: {exc})", "", ""


def _algoritmo_ok(valor: str, marcadores: tuple[str, ...]) -> bool:
    v = (valor or "").lower()
    return bool(v) and any(m in v for m in marcadores)


def diagnosticar_assinatura_dps(
    xml,
    pfx_path: str | None = None,
    senha: str | None = None,
) -> dict:
    """Extrai assinatura, certificado e validações estruturais (sem alterar o XML)."""
    xml_bytes = _as_bytes(xml)
    root = etree.fromstring(xml_bytes)

    inf = root.find(f"{{{NS}}}infDPS")
    id_inf = (inf.get("Id") or "").strip() if inf is not None else ""

    signatures = root.findall(f".//{{{NS_DS}}}Signature")
    digest_values = root.findall(f".//{{{NS_DS}}}DigestValue")
    signature_values = root.findall(f".//{{{NS_DS}}}SignatureValue")

    sig = signatures[0] if len(signatures) == 1 else (signatures[0] if signatures else None)
    signed_info = sig.find(f"{{{NS_DS}}}SignedInfo") if sig is not None else None
    reference = signed_info.find(f"{{{NS_DS}}}Reference") if signed_info is not None else None

    reference_uri = (reference.get("URI") or "").strip() if reference is not None else ""

    digest_method_el = reference.find(f"{{{NS_DS}}}DigestMethod") if reference is not None else None
    digest_method = (digest_method_el.get("Algorithm") or "").strip() if digest_method_el is not None else ""

    signature_method_el = (
        signed_info.find(f"{{{NS_DS}}}SignatureMethod") if signed_info is not None else None
    )
    signature_method = (
        (signature_method_el.get("Algorithm") or "").strip() if signature_method_el is not None else ""
    )

    digest_value = ""
    if digest_values:
        digest_value = (digest_values[0].text or "").strip()

    signature_value = ""
    if signature_values:
        signature_value = (signature_values[0].text or "").strip()

    cert_subject, cert_serial, cert_cnpj = _cert_info(pfx_path, senha)

    erros: list[str] = []
    esperado_uri = f"#{id_inf}" if id_inf else ""
    if not id_inf:
        erros.append("infDPS sem atributo Id")
    if reference_uri != esperado_uri:
        erros.append(
            f'Reference.URI diverge de infDPS.Id: URI="{reference_uri}" esperado="{esperado_uri}"'
        )
    if len(signatures) != 1:
        erros.append(f"Esperado exatamente 1 elemento Signature, encontrado {len(signatures)}")
    if len(digest_values) != 1:
        erros.append(f"Esperado exatamente 1 DigestValue, encontrado {len(digest_values)}")
    if len(signature_values) != 1:
        erros.append(f"Esperado exatamente 1 SignatureValue, encontrado {len(signature_values)}")
    if not _algoritmo_ok(signature_method, RSA_SIGNATURE_MARKERS):
        erros.append(
            f"SignatureMethod não é RSA-SHA256/RSA-SHA1: {signature_method or '(vazio)'}"
        )
    if not _algoritmo_ok(digest_method, DIGEST_MARKERS):
        erros.append(f"DigestMethod não é SHA256/SHA1: {digest_method or '(vazio)'}")

    return {
        "infDPS_Id": id_inf,
        "reference_uri": reference_uri,
        "digest_method": digest_method,
        "signature_method": signature_method,
        "digest_value": digest_value,
        "signature_value_inicio": signature_value[:50],
        "cert_subject": cert_subject,
        "cert_serial": cert_serial,
        "cert_cnpj": cert_cnpj,
        "validacoes_ok": len(erros) == 0,
        "erros_validacao": erros,
        "contagens": {
            "Signature": len(signatures),
            "DigestValue": len(digest_values),
            "SignatureValue": len(signature_values),
        },
    }


def _formatar_log(diag: dict, path_xml: Path, path_json: Path) -> str:
    linhas = [
        f"=== SEFIN assinatura antes do POST | {datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat(timespec='seconds')} ===",
        f"infDPS.Id={diag.get('infDPS_Id', '')}",
        f"Reference.URI={diag.get('reference_uri', '')}",
        f"DigestMethod={diag.get('digest_method', '')}",
        f"SignatureMethod={diag.get('signature_method', '')}",
        f"DigestValue={diag.get('digest_value', '')}",
        f"SignatureValue(início dos primeiros 50 caracteres)={diag.get('signature_value_inicio', '')}",
        f"cert_subject={diag.get('cert_subject', '')}",
        f"cert_serial={diag.get('cert_serial', '')}",
        f"cert_cnpj={diag.get('cert_cnpj', '')}",
        f"validacoes_ok={diag.get('validacoes_ok')}",
        f"debug_xml={path_xml.resolve()}",
        f"debug_json={path_json.resolve()}",
    ]
    if diag.get("erros_validacao"):
        linhas.append("ERROS VALIDACAO ASSINATURA:")
        for err in diag["erros_validacao"]:
            linhas.append(f"  - {err}")
    return "\n".join(linhas)


def _persistir_log_texto(texto: str) -> None:
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    with DEBUG_ASSINATURA_LOG.open("a", encoding="utf-8") as f:
        f.write(texto + "\n\n")


def registrar_diagnostico_assinatura(
    xml,
    pfx_path: str | None = None,
    senha: str | None = None,
) -> dict:
    """
    Salva debug/nfse_assinada.xml e debug/nfse_assinatura.json,
    registra log (WARNING + arquivo) antes do POST SEFIN.
    """
    xml_bytes = _as_bytes(xml)
    path_xml = salvar_nfse_assinada_bytes(xml_bytes)
    diag = diagnosticar_assinatura_dps(xml_bytes, pfx_path, senha)

    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    payload_json = {
        "infDPS_Id": diag["infDPS_Id"],
        "reference_uri": diag["reference_uri"],
        "digest_method": diag["digest_method"],
        "signature_method": diag["signature_method"],
        "digest_value": diag["digest_value"],
        "signature_value_inicio": diag["signature_value_inicio"],
        "cert_subject": diag["cert_subject"],
        "cert_serial": diag["cert_serial"],
        "cert_cnpj": diag["cert_cnpj"],
        "validacoes_ok": diag["validacoes_ok"],
        "erros_validacao": diag["erros_validacao"],
        "contagens": diag["contagens"],
        "debug_xml": str(path_xml.resolve()),
        "gerado_em": datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds"),
    }
    DEBUG_ASSINATURA_JSON.write_text(
        json.dumps(payload_json, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    texto = _formatar_log(diag, path_xml, DEBUG_ASSINATURA_JSON)
    _persistir_log_texto(texto)

    # WARNING garante visibilidade no console uvicorn (root default).
    for logger in (LOG_NFSE, LOG_NACIONAL):
        logger.warning("%s", texto)

    if not diag["validacoes_ok"]:
        msg_erro = "Validação estrutural da assinatura falhou antes do POST SEFIN:\n" + "\n".join(
            f"  • {e}" for e in diag["erros_validacao"]
        )
        for logger in (LOG_NFSE, LOG_NACIONAL):
            logger.error("%s", msg_erro)

    return diag
