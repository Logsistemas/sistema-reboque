"""Auditoria de certificado A1 e cadeia ICP-Brasil (diagnóstico E0714)."""
from __future__ import annotations

import base64
import re
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.serialization import pkcs12
from lxml import etree

from nfse_nacional.constants import NS_DS
from nfse_nacional.signer import extrair_cnpj_certificado

DEBUG_DIR = Path(__file__).resolve().parents[1] / "debug"
DEBUG_RELATORIO = DEBUG_DIR / "auditoria_certificado_icp.txt"

XML_CANDIDATES = (
    DEBUG_DIR / "nfse_payload_descompactado.xml",
    DEBUG_DIR / "nfse_post_final.xml",
    DEBUG_DIR / "nfse_assinada.xml",
)


def _fmt_dt(dt) -> str:
    if dt is None:
        return "(ausente)"
    if hasattr(dt, "astimezone"):
        return dt.astimezone(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds")
    return str(dt)


def _extensao_nome(ext) -> str:
    try:
        return ext.oid._name or ext.oid.dotted_string
    except Exception:
        return str(ext.oid)


def _key_usage(cert: x509.Certificate) -> list[str]:
    try:
        ku = cert.extensions.get_extension_for_class(x509.KeyUsage).value
        flags = []
        mapping = (
            ("digital_signature", "digitalSignature"),
            ("content_commitment", "nonRepudiation"),
            ("key_encipherment", "keyEncipherment"),
            ("data_encipherment", "dataEncipherment"),
            ("key_agreement", "keyAgreement"),
            ("key_cert_sign", "keyCertSign"),
            ("crl_sign", "cRLSign"),
        )
        for attr, label in mapping:
            if getattr(ku, attr, False):
                flags.append(label)
        if ku.key_agreement:
            if ku.encipher_only:
                flags.append("encipherOnly")
            if ku.decipher_only:
                flags.append("decipherOnly")
        return flags
    except x509.ExtensionNotFound:
        return []
    except Exception as exc:
        return [f"(erro: {exc})"]


def _extended_key_usage(cert: x509.Certificate) -> list[str]:
    try:
        eku = cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value
        out = []
        for oid in eku:
            name = oid._name if hasattr(oid, "_name") and oid._name else oid.dotted_string
            out.append(name or oid.dotted_string)
        return out
    except x509.ExtensionNotFound:
        return []
    except Exception as exc:
        return [f"(erro: {exc})"]


def _resumo_certificado(cert: x509.Certificate, rotulo: str) -> dict:
    return {
        "rotulo": rotulo,
        "subject": cert.subject.rfc4514_string(),
        "issuer": cert.issuer.rfc4514_string(),
        "serial": str(cert.serial_number),
        "not_before": cert.not_valid_before_utc,
        "not_after": cert.not_valid_after_utc,
        "key_usage": _key_usage(cert),
        "extended_key_usage": _extended_key_usage(cert),
        "sha256_fingerprint": cert.fingerprint(hashes.SHA256()).hex(),
    }


def _carregar_pfx(pfx_path: str, senha: str) -> tuple:
    with open(pfx_path, "rb") as f:
        data = f.read()
    pwd = senha.encode() if senha else None
    private_key, cert, chain = pkcs12.load_key_and_certificates(data, pwd)
    if not cert:
        raise ValueError("PFX sem certificado principal")
    return private_key, cert, list(chain or [])


def _contar_x509_no_xml(xml_path: Path | None) -> dict:
    if not xml_path or not xml_path.is_file():
        return {
            "arquivo": str(xml_path or ""),
            "x509_count": 0,
            "thumbprints": [],
            "erro": "arquivo XML ausente",
        }
    xml_bytes = xml_path.read_bytes()
    root = etree.fromstring(xml_bytes)
    nodes = root.findall(f".//{{{NS_DS}}}X509Certificate")
    if not nodes:
        nodes = [el for el in root.iter() if etree.QName(el.tag).localname == "X509Certificate"]
    thumbprints = []
    for i, node in enumerate(nodes):
        raw_b64 = re.sub(r"\s+", "", (node.text or ""))
        try:
            der = base64.b64decode(raw_b64)
            c = x509.load_der_x509_certificate(der)
            thumbprints.append(
                {
                    "indice": i + 1,
                    "subject": c.subject.rfc4514_string(),
                    "issuer": c.issuer.rfc4514_string(),
                    "serial": str(c.serial_number),
                }
            )
        except Exception as exc:
            thumbprints.append({"indice": i + 1, "erro": str(exc)})
    return {
        "arquivo": str(xml_path.resolve()),
        "x509_count": len(nodes),
        "thumbprints": thumbprints,
        "erro": "",
    }


def auditar_certificado_icp(
    pfx_path: str,
    senha: str,
    *,
    xml_path: Path | None = None,
) -> dict:
    """
    Diagnóstico do PFX e dos X509Certificate embutidos no XML assinado.
    Grava debug/auditoria_certificado_icp.txt
    """
    _, cert, chain = _carregar_pfx(pfx_path, senha)
    chain_len = len(chain)
    cnpj = extrair_cnpj_certificado(pfx_path, senha)

    xml_usado = xml_path
    if xml_usado is None:
        for cand in XML_CANDIDATES:
            if cand.is_file():
                xml_usado = cand
                break

    xml_info = _contar_x509_no_xml(xml_usado)
    agora = datetime.now(timezone.utc)
    expirado = agora > cert.not_valid_after_utc

    intermediarios = [_resumo_certificado(c, f"intermediario_{i + 1}") for i, c in enumerate(chain)]

    recomendacoes: list[str] = []
    if chain_len == 0:
        recomendacoes.append(
            "Possível causa do E0714: XML assinado contém apenas certificado final sem cadeia intermediária."
        )
        recomendacoes.append(
            "O PFX não inclui certificados intermediários (chain_len=0). Verifique se o arquivo exportado "
            "inclui a cadeia completa ICP-Brasil (AC SAFEWEB RFB v5 ate ICP-Brasil)."
        )
    if xml_info["x509_count"] == 1:
        recomendacoes.append(
            "O XMLDSIG contém exatamente 1 elemento X509Certificate (padrão EndCertOnly exigido pelo manual NFS-e)."
        )
        if chain_len == 0:
            recomendacoes.append(
                "Com EndCertOnly, a SEFIN deve montar a cadeia a partir dos repositórios ICP-Brasil do servidor. "
                "Se o validador SEFIN não tiver os intermediários, a assinatura pode falhar com E0714."
            )
    elif xml_info["x509_count"] > 1:
        recomendacoes.append(
            f"O XML contém {xml_info['x509_count']} X509Certificate — manual NFS-e exige EndCertOnly (apenas certificado final)."
        )
    elif xml_info["x509_count"] == 0:
        recomendacoes.append("Nenhum X509Certificate encontrado no XML analisado.")

    if expirado:
        recomendacoes.append("Certificado principal EXPIRADO — emissão e validação de assinatura devem falhar.")

    eku = _extended_key_usage(cert)
    if eku and not any("clientAuth" in e or "1.3.6.1.5.5.7.3.2" in e for e in eku):
        recomendacoes.append("Extended Key Usage não inclui clientAuth — mTLS SEFIN pode falhar.")

    linhas = [
        "==================================",
        "AUDITORIA CERTIFICADO ICP-BRASIL — NFS-e Nacional",
        f"Gerado em: {datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat(timespec='seconds')}",
        "==================================",
        "",
        "=== ARQUIVO PFX ===",
        f"caminho: {Path(pfx_path).resolve()}",
        f"tamanho_bytes: {Path(pfx_path).stat().st_size}",
        "",
        "=== CERTIFICADO PRINCIPAL (leaf) ===",
        f"subject: {cert.subject.rfc4514_string()}",
        f"issuer:  {cert.issuer.rfc4514_string()}",
        f"serial:  {cert.serial_number}",
        f"validade_inicio: {_fmt_dt(cert.not_valid_before_utc)}",
        f"validade_fim:    {_fmt_dt(cert.not_valid_after_utc)}",
        f"expirado: {expirado}",
        f"CNPJ: {cnpj or '(não identificado)'}",
        f"key_usage: {', '.join(_key_usage(cert)) or '(nenhum)'}",
        f"extended_key_usage: {', '.join(eku) or '(nenhum)'}",
        f"sha256_fingerprint: {cert.fingerprint(hashes.SHA256()).hex()}",
        "",
        "=== CADEIA NO PFX ===",
        f"chain_len: {chain_len}",
    ]

    if chain_len == 0:
        linhas.append("intermediarios: (nenhum — PFX contém apenas certificado final)")
    else:
        linhas.append(f"intermediarios_encontrados: {chain_len}")
        for item in intermediarios:
            linhas.extend(
                [
                    "",
                    f"--- {item['rotulo']} ---",
                    f"  subject: {item['subject']}",
                    f"  issuer:  {item['issuer']}",
                    f"  serial:  {item['serial']}",
                    f"  validade: {_fmt_dt(item['not_before'])} ate {_fmt_dt(item['not_after'])}",
                    f"  sha256: {item['sha256_fingerprint']}",
                ]
            )

    linhas.extend(
        [
            "",
            "=== XML ASSINADO (X509Data) ===",
            f"arquivo_analisado: {xml_info['arquivo'] or '(ausente)'}",
            f"X509Certificate_count: {xml_info['x509_count']}",
        ]
    )
    if xml_info.get("erro"):
        linhas.append(f"erro_xml: {xml_info['erro']}")
    for tp in xml_info["thumbprints"]:
        if "erro" in tp:
            linhas.append(f"  cert[{tp['indice']}]: ERRO — {tp['erro']}")
        else:
            linhas.extend(
                [
                    f"  cert[{tp['indice']}] subject: {tp['subject']}",
                    f"  cert[{tp['indice']}] issuer:  {tp['issuer']}",
                    f"  cert[{tp['indice']}] serial:  {tp['serial']}",
                ]
            )

    linhas.extend(
        [
            "",
            "=== COMPARACAO PFX x XML ===",
        ]
    )
    if xml_info["x509_count"] == 1 and xml_info["thumbprints"] and "serial" in xml_info["thumbprints"][0]:
        xml_serial = xml_info["thumbprints"][0]["serial"]
        pfx_serial = str(cert.serial_number)
        linhas.append(f"serial_pfx:  {pfx_serial}")
        linhas.append(f"serial_xml:  {xml_serial}")
        linhas.append(f"serial_coincide: {xml_serial == pfx_serial}")
    else:
        linhas.append("serial_coincide: (não comparável — XML ausente ou múltiplos certs)")

    linhas.extend(
        [
            "",
            "=== RECOMENDAÇÕES ===",
        ]
    )
    if recomendacoes:
        for r in recomendacoes:
            linhas.append(f"- {r}")
    else:
        linhas.append("- Nenhuma anomalia estrutural detectada na cadeia PFX/XML.")

    linhas.extend(
        [
            "",
            "=== RESULTADO ===",
            f"PFX com cadeia intermediária: {'Sim' if chain_len > 0 else 'Não'}",
            f"XML EndCertOnly (1 X509Certificate): {'Sim' if xml_info['x509_count'] == 1 else 'Não'}",
        ]
    )

    texto = "\n".join(linhas)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_RELATORIO.write_text(texto + "\n", encoding="utf-8")

    return {
        "relatorio_path": str(DEBUG_RELATORIO.resolve()),
        "chain_len": chain_len,
        "cnpj": cnpj,
        "x509_count": xml_info["x509_count"],
        "recomendacoes": recomendacoes,
        "texto": texto,
    }
