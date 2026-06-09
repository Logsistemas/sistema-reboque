"""Auditoria definitiva do payload enviado à SEFIN (E0714) — bloqueia POST se divergir."""
from __future__ import annotations

import base64
import gzip
import hashlib
import logging
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from nfse_nacional.signature_flow_audit import (
    verificar_assinatura,
    verificar_digest,
    verificar_rsa,
)
from nfse_nacional.xml_serial import (
    DEBUG_POST_FINAL_PATH,
    analisar_xml_dps,
    extrair_info_assinatura,
)

LOG = logging.getLogger("financeiro.nfse.nacional.envio_audit")

DEBUG_DIR = Path(__file__).resolve().parents[1] / "debug"
DEBUG_PAYLOAD_DESC = DEBUG_DIR / "nfse_payload_descompactado.xml"
DEBUG_RELATORIO = DEBUG_DIR / "auditoria_envio_sefin_final.txt"


def _gunzip_b64(data_b64: str) -> bytes:
    return gzip.decompress(base64.b64decode(data_b64))


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _verificar_todos(xml_bytes: bytes, rotulo: str) -> dict:
    ok_xml, err_xml = verificar_assinatura(xml_bytes)
    ok_dig, info_dig = verificar_digest(xml_bytes)
    ok_rsa, err_rsa = verificar_rsa(xml_bytes)
    return {
        "rotulo": rotulo,
        "xmlverifier": ok_xml,
        "digest": ok_dig,
        "rsa": ok_rsa,
        "erro_xmlverifier": err_xml,
        "erro_digest": info_dig if not ok_dig else "",
        "erro_rsa": err_rsa,
    }


def auditar_envio_sefin_final(
    xml_final: bytes,
    dps_b64: str,
    *,
    pfx_path: str | None = None,
    senha: str | None = None,
) -> dict:
    """
    Compara hashes e valida assinatura em cada estágio do payload.
    Grava debug/nfse_payload_descompactado.xml e auditoria_envio_sefin_final.txt.
    Levanta ValueError se qualquer verificação falhar (bloqueia POST).
    """
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)

    hash_xml_final = _sha256(xml_final)
    hash_debug_post = (
        _sha256(DEBUG_POST_FINAL_PATH.read_bytes()) if DEBUG_POST_FINAL_PATH.is_file() else ""
    )

    payload_gzip_raw = __import__("base64").b64decode(dps_b64)
    hash_payload_gzip = _sha256(payload_gzip_raw)

    payload_descompactado = _gunzip_b64(dps_b64)
    DEBUG_PAYLOAD_DESC.write_bytes(payload_descompactado)
    hash_payload_descompactado = _sha256(payload_descompactado)

    hashes_iguais = (
        hash_xml_final == hash_debug_post == hash_payload_descompactado
        and hash_xml_final == hash_payload_descompactado
    )

    ver_xml_final = _verificar_todos(xml_final, "xml_final_assinado")
    ver_debug = (
        _verificar_todos(DEBUG_POST_FINAL_PATH.read_bytes(), "debug/nfse_post_final.xml")
        if DEBUG_POST_FINAL_PATH.is_file()
        else {"rotulo": "debug/nfse_post_final.xml", "xmlverifier": False, "digest": False, "rsa": False, "erro_xmlverifier": "arquivo ausente", "erro_digest": "", "erro_rsa": ""}
    )
    ver_payload = _verificar_todos(payload_descompactado, "payload_descompactado")

    info = analisar_xml_dps(xml_final)
    sig = extrair_info_assinatura(xml_final)
    prefixos = sorted(set(info["prefixos_tags"] + info["xmlns_prefixados"]))

    linhas = [
        "==================================",
        "AUDITORIA ENVIO SEFIN — DEFINITIVA",
        f"Gerado em: {datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat(timespec='seconds')}",
        "==================================",
        "",
        "=== HASH SHA256 (4 obrigatórios) ===",
        f"hash_xml_final:              {hash_xml_final}",
        f"hash_debug_file:             {hash_debug_post or '(ausente)'}",
        f"hash_payload_gzip_raw:       {hash_payload_gzip}",
        f"hash_payload_descompactado:  {hash_payload_descompactado}",
        f"hashes_xml_iguais:           {hashes_iguais}",
        "",
        "=== TAMANHOS ===",
        f"tamanho_xml_final_bytes:     {len(xml_final)}",
        f"tamanho_gzip_raw_bytes:      {len(payload_gzip_raw)}",
        f"tamanho_payload_descompactado: {len(payload_descompactado)}",
        f"tamanho_dpsXmlGZipB64:       {len(dps_b64)}",
        "",
        "=== ASSINATURA ===",
        f"SignatureMethod: {sig.get('SignatureMethod', '')}",
        f"DigestMethod:    {sig.get('DigestMethod', '')}",
        f"Reference.URI:   {sig.get('Reference_URI', '')}",
        f"infDPS.Id:       {sig.get('infDPS_Id', '')}",
        "",
        "=== PREFIXOS ===",
        f"PREFIXOS ENCONTRADOS: {prefixos if prefixos else '0'}",
        "",
        "=== XMLVerifier / Digest / RSA ===",
    ]

    erros: list[str] = []
    for ver in (ver_xml_final, ver_debug, ver_payload):
        linhas.extend(
            [
                f"--- {ver['rotulo']} ---",
                f"  XMLVerifier: {ver['xmlverifier']}",
                f"  Digest:      {ver['digest']}",
                f"  RSA:         {ver['rsa']}",
            ]
        )
        if ver.get("erro_xmlverifier") and not ver["xmlverifier"]:
            linhas.append(f"  Erro XMLVerifier: {ver['erro_xmlverifier']}")
        if ver.get("erro_digest") and not ver["digest"]:
            linhas.append(f"  Erro Digest: {ver['erro_digest']}")
        if ver.get("erro_rsa") and not ver["rsa"]:
            linhas.append(f"  Erro RSA: {ver['erro_rsa']}")

        if not ver["xmlverifier"]:
            erros.append(f"XMLVerifier falhou em {ver['rotulo']}: {ver.get('erro_xmlverifier')}")
        if not ver["digest"]:
            erros.append(f"Digest falhou em {ver['rotulo']}: {ver.get('erro_digest')}")
        if not ver["rsa"]:
            erros.append(f"RSA falhou em {ver['rotulo']}: {ver.get('erro_rsa')}")

    if not hashes_iguais:
        erros.append(
            "Hashes SHA256 divergentes entre xml_final, nfse_post_final.xml e payload descompactado"
        )
    if prefixos:
        erros.append(f"Prefixos proibidos encontrados: {prefixos}")

    linhas.extend(
        [
            "",
            "=== ARQUIVOS ===",
            f"debug/nfse_post_final.xml:          {DEBUG_POST_FINAL_PATH.resolve()}",
            f"debug/nfse_payload_descompactado.xml: {DEBUG_PAYLOAD_DESC.resolve()}",
            "",
            "=== RESULTADO ===",
            f"APTO PARA POST: {len(erros) == 0}",
        ]
    )
    if erros:
        linhas.append("")
        linhas.append("ERROS (POST BLOQUEADO):")
        for e in erros:
            linhas.append(f"  - {e}")

    texto = "\n".join(linhas)
    DEBUG_RELATORIO.write_text(texto + "\n", encoding="utf-8")
    LOG.warning("%s", texto)

    resultado = {
        "hash_xml_final": hash_xml_final,
        "hash_debug_file": hash_debug_post,
        "hash_payload_gzip_raw": hash_payload_gzip,
        "hash_payload_descompactado": hash_payload_descompactado,
        "hashes_iguais": hashes_iguais,
        "prefixos": prefixos,
        "ver_xml_final": ver_xml_final,
        "ver_debug": ver_debug,
        "ver_payload": ver_payload,
        "apto_post": len(erros) == 0,
        "erros": erros,
        "relatorio_path": str(DEBUG_RELATORIO.resolve()),
    }

    if erros:
        raise ValueError(
            "Auditoria envio SEFIN falhou — POST bloqueado:\n" + "\n".join(f"  • {e}" for e in erros)
        )

    return resultado


def registrar_resposta_sefin(
    *,
    status_code: int | None = None,
    codigos: list | None = None,
    mensagem: str = "",
    detalhes: list | None = None,
) -> None:
    """Acrescenta resposta SEFIN ao relatório definitivo (pós-POST)."""
    if not DEBUG_RELATORIO.is_file():
        return
    linhas = [
        "",
        "=== RESPOSTA SEFIN (pós-POST) ===",
        f"status_http: {status_code}",
        f"codigos: {', '.join(str(c) for c in (codigos or []) if c) or '(nenhum)'}",
        f"mensagem: {mensagem or '(vazia)'}",
    ]
    for item in detalhes or []:
        if isinstance(item, dict):
            cod = item.get("Codigo") or item.get("codigo") or ""
            desc = item.get("Descricao") or item.get("descricao") or ""
            comp = item.get("Complemento") or item.get("complemento") or ""
            linhas.append(f"  - {cod}: {desc} {comp}".strip())
    if codigos and "E0714" in [str(c) for c in codigos]:
        linhas.extend(
            [
                "",
                "=== CONCLUSÃO AUDITORIA ===",
                "Payload gzip/base64 comprovadamente idêntico ao XML assinado (hashes iguais).",
                "Roundtrip descompactado passa XMLVerifier, Digest e RSA localmente.",
                "E0714 neste cenário NÃO é corrupção de bytes no client.py — investigar validador SEFIN,",
                "cadeia ICP-Brasil no servidor, credenciamento do certificado ou divergência de ambiente.",
            ]
        )
    texto = DEBUG_RELATORIO.read_text(encoding="utf-8").rstrip() + "\n" + "\n".join(linhas) + "\n"
    DEBUG_RELATORIO.write_text(texto, encoding="utf-8")
