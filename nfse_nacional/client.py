import base64
import gzip
import json
import logging
from typing import Any

from nfse_nacional.constants import SEFIN_BASE

log = logging.getLogger("financeiro.nfse.nacional")


class NfseNacionalErro(Exception):
    def __init__(self, mensagem, codigos=None, detalhes=None, status_code=None):
        super().__init__(mensagem)
        self.codigos = codigos or []
        self.detalhes = detalhes or []
        self.status_code = status_code


def gzip_b64(xml_str: str) -> str:
    raw = gzip.compress(xml_str.encode("utf-8"))
    return base64.b64encode(raw).decode("ascii")


def gunzip_b64(data_b64: str) -> str:
    if not data_b64:
        return ""
    raw = base64.b64decode(data_b64)
    return gzip.decompress(raw).decode("utf-8")


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
        # Só usa produção se explicitamente configurado; qualquer outro valor → homologação.
        self.ambiente = amb if amb == "producao" else "homologacao"
        self.base_url = SEFIN_BASE.get(self.ambiente, SEFIN_BASE["homologacao"])
        self.pfx_path = pfx_path
        self.senha = senha

    def _request(self, method, path, json_body=None):
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

    def emitir_dps(self, xml_assinado: str) -> dict:
        payload = {"dpsXmlGZipB64": gzip_b64(xml_assinado)}
        status, body = self._request("POST", "/nfse", payload)
        if status not in (200, 201):
            erros, msg = _extrair_erros(body)
            raise NfseNacionalErro(_formatar_erros(erros, msg), detalhes=erros, status_code=status)
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
