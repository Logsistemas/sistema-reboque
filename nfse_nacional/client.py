import base64
import gzip
import hashlib
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Union
from zoneinfo import ZoneInfo

from nfse_nacional.constants import SEFIN_BASE
from nfse_nacional.signature_audit import registrar_diagnostico_assinatura
from nfse_nacional.xml_serial import (
    analisar_xml_dps,
    salvar_debug_xml_bytes,
    validar_xml_sem_prefixo,
)

log = logging.getLogger("financeiro.nfse.nacional")

XmlFinal = Union[bytes, str]


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _as_bytes(xml_final: XmlFinal) -> bytes:
    if isinstance(xml_final, bytes):
        return xml_final
    return xml_final.encode("utf-8")


def gzip_b64(xml_str: str) -> str:
    """Compacta UTF-8 → gzip → base64."""
    return gzip_b64_bytes(xml_str.encode("utf-8"))


def gzip_b64_bytes(xml_bytes: bytes) -> str:
    return base64.b64encode(gzip.compress(xml_bytes)).decode("ascii")


def gunzip_b64(data_b64: str) -> str:
    if not data_b64:
        return ""
    raw = base64.b64decode(data_b64)
    return gzip.decompress(raw).decode("utf-8")


def gunzip_b64_bytes(data_b64: str) -> bytes:
    if not data_b64:
        return b""
    return gzip.decompress(base64.b64decode(data_b64))


def preparar_envio_dps(xml_final: XmlFinal) -> tuple[Path, bytes, str, str, str, str]:
    """
    Fluxo único: valida → salva bytes finais → gzip/base64 dos mesmos bytes.
    Retorna (path, xml_bytes, dps_b64, sha256_xml_final, sha256_arquivo_debug, sha256_xml_enviado).
    """
    xml_bytes = _as_bytes(xml_final)
    validar_xml_sem_prefixo(xml_bytes)

    sha256_xml_final = _sha256_bytes(xml_bytes)
    path = salvar_debug_xml_bytes(xml_bytes)
    sha256_arquivo_debug = _sha256_file(path)

    dps_b64 = gzip_b64_bytes(xml_bytes)
    bytes_enviado = gunzip_b64_bytes(dps_b64)
    sha256_xml_enviado = _sha256_bytes(bytes_enviado)

    if sha256_xml_final != sha256_arquivo_debug:
        raise ValueError(
            "XML salvo em disco diverge do final serializado: "
            f"arquivo={sha256_arquivo_debug} final={sha256_xml_final}"
        )
    if sha256_xml_final != sha256_xml_enviado:
        raise ValueError(
            "gzip/base64 alterou o XML: "
            f"final={sha256_xml_final} enviado={sha256_xml_enviado}"
        )

    return path, xml_bytes, dps_b64, sha256_xml_final, sha256_arquivo_debug, sha256_xml_enviado


class NfseNacionalErro(Exception):
    def __init__(self, mensagem, codigos=None, detalhes=None, status_code=None):
        super().__init__(mensagem)
        self.codigos = codigos or []
        self.detalhes = detalhes or []
        self.status_code = status_code


def _extrair_erros(body: Any) -> tuple[list, str]:
    erros = []
    if isinstance(body, dict):
        for item in body.get("erros") or body.get("Erros") or []:
            if isinstance(item, dict):
                erros.append(item)
            else:
                erros.append({"Descricao": str(item)})
        msg = body.get("mensagem") or body.get("message") or ""
        if not erros and body.get("erro"):
            erros.append({"Descricao": str(body["erro"])})
        return erros, msg
    return [], str(body)


def _formatar_erros(erros, msg=""):
    partes = []
    for e in erros:
        cod = e.get("Codigo") or e.get("codigo") or ""
        desc = e.get("Descricao") or e.get("descricao") or str(e)
        comp = e.get("Complemento") or e.get("complemento") or ""
        partes.append(f"{cod}: {desc} {comp}".strip())
    if not partes and msg:
        return msg
    return "; ".join(partes) or "Erro na API NFS-e Nacional"


class NfseNacionalClient:
    def __init__(self, ambiente, pfx_path, senha):
        amb = (ambiente or "homologacao").lower()
        self.ambiente = amb if amb == "producao" else "homologacao"
        self.base_url = SEFIN_BASE.get(self.ambiente, SEFIN_BASE["homologacao"])
        self.pfx_path = pfx_path
        self.senha = senha

    def _request(self, method, path, json_body=None, audit_ctx=None):
        from requests_pkcs12 import delete, get, post

        url = f"{self.base_url}{path}"
        kwargs = {
            "pkcs12_filename": self.pfx_path,
            "pkcs12_password": self.senha,
            "headers": {"Content-Type": "application/json", "Accept": "application/json"},
            "timeout": 120,
        }
        log.info("NFS-e Nacional %s %s", method, url)
        if method == "GET":
            r = get(url, **kwargs)
        elif method == "POST":
            if audit_ctx:
                diag = audit_ctx.get("assinatura_diag") or {}
                log.warning(
                    "SEFIN POST imediato antes do requests.post | data_hora=%s | validacoes_ok=%s | "
                    "infDPS.Id=%s | Reference.URI=%s | DigestMethod=%s | SignatureMethod=%s | "
                    "DigestValue=%s | SignatureValue(início)=%s | debug_json=debug/nfse_assinatura.json",
                    audit_ctx.get("data_hora"),
                    diag.get("validacoes_ok"),
                    diag.get("infDPS_Id"),
                    diag.get("reference_uri"),
                    diag.get("digest_method"),
                    diag.get("signature_method"),
                    diag.get("digest_value"),
                    diag.get("signature_value_inicio"),
                )
                if diag.get("erros_validacao"):
                    log.error(
                        "SEFIN assinatura — falhas antes do POST: %s",
                        "; ".join(diag["erros_validacao"]),
                    )
                log.info(
                    "SEFIN POST audit | debug_path=%s | sha256_xml_final=%s | "
                    "sha256_arquivo_debug=%s | sha256_xml_enviado=%s | tamanho_bytes=%s | "
                    "gzip_b64_len=%s | tag_raiz=%s | prefixos=%s",
                    audit_ctx.get("debug_path"),
                    audit_ctx.get("sha256_xml_final"),
                    audit_ctx.get("sha256_arquivo_debug"),
                    audit_ctx.get("sha256_xml_enviado"),
                    audit_ctx.get("tamanho_bytes"),
                    audit_ctx.get("gzip_b64_len"),
                    audit_ctx.get("tag_raiz"),
                    audit_ctx.get("prefixos_tags") or "nenhum",
                )
            r = post(url, json=json_body or {}, **kwargs)
        elif method == "DELETE":
            r = delete(url, **kwargs)
        else:
            raise ValueError(f"Método HTTP não suportado: {method}")

        try:
            body = r.json() if r.content else {}
        except Exception:
            body = {"raw": r.text[:2000]}

        if r.status_code >= 400:
            erros, msg = _extrair_erros(body)
            raise NfseNacionalErro(
                _formatar_erros(erros, msg or r.text[:500]),
                codigos=[e.get("Codigo") for e in erros if e.get("Codigo")],
                detalhes=erros,
                status_code=r.status_code,
            )
        return r.status_code, body

    def emitir_dps(self, xml_final: XmlFinal) -> dict:
        path, xml_bytes, dps_b64, sha_final, sha_arquivo, sha_enviado = preparar_envio_dps(xml_final)

        from nfse_nacional.envio_audit import auditar_envio_sefin_final

        auditar_envio_sefin_final(
            xml_bytes,
            dps_b64,
            pfx_path=self.pfx_path,
            senha=self.senha,
        )

        info = analisar_xml_dps(xml_bytes)
        diag = registrar_diagnostico_assinatura(
            xml_bytes,
            pfx_path=self.pfx_path,
            senha=self.senha,
        )
        agora = datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds")
        payload = {"dpsXmlGZipB64": dps_b64}
        audit_ctx = {
            "data_hora": agora,
            "debug_path": str(path.resolve()),
            "sha256_xml_final": sha_final,
            "sha256_arquivo_debug": sha_arquivo,
            "sha256_xml_enviado": sha_enviado,
            "tamanho_bytes": len(xml_bytes),
            "gzip_b64_len": len(dps_b64),
            "tag_raiz": info["tag_raiz"],
            "prefixos_tags": info["prefixos_tags"],
            "inicio_xml": xml_bytes[:500].decode("utf-8", errors="replace").replace("\n", " "),
            "assinatura_diag": diag,
        }

        try:
            status, body = self._request("POST", "/nfse", payload, audit_ctx=audit_ctx)
        except NfseNacionalErro as exc:
            from nfse_nacional.envio_audit import registrar_resposta_sefin

            registrar_resposta_sefin(
                status_code=exc.status_code,
                codigos=exc.codigos,
                mensagem=str(exc),
                detalhes=exc.detalhes,
            )
            raise
        if status not in (200, 201):
            erros, msg = _extrair_erros(body)
            raise NfseNacionalErro(_formatar_erros(erros, msg), detalhes=erros, status_code=status)
        from nfse_nacional.envio_audit import registrar_resposta_sefin

        registrar_resposta_sefin(status_code=status, mensagem="OK", detalhes=[])
        return body

    def consultar_nfse(self, chave_acesso: str) -> dict:
        ch = "".join(c for c in str(chave_acesso) if c.isdigit())
        status, body = self._request("GET", f"/nfse/{ch}")
        return body if isinstance(body, dict) else {"data": body}

    def consultar_dps(self, id_dps: str) -> dict:
        status, body = self._request("GET", f"/dps/{id_dps}")
        return body if isinstance(body, dict) else {"data": body}

    def cancelar_nfse(self, chave_acesso: str, xml_evento_assinado: str) -> dict:
        ch = "".join(c for c in str(chave_acesso) if c.isdigit())
        payload = {"pedidoRegistroEventoXmlGZipB64": gzip_b64(xml_evento_assinado)}
        status, body = self._request("POST", f"/nfse/{ch}/eventos", payload)
        if status not in (200, 201):
            erros, msg = _extrair_erros(body)
            raise NfseNacionalErro(_formatar_erros(erros, msg), detalhes=erros, status_code=status)
        return body
