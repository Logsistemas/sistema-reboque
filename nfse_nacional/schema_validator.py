"""Validação local do XML DPS assinado contra o XSD oficial NFS-e v1.01."""
from __future__ import annotations

import re
import shutil
from functools import lru_cache
from pathlib import Path

from lxml import etree

XSD_DIR = Path(__file__).resolve().parent / "schemas" / "v1.01"
CACHE_DIR = XSD_DIR / ".validation_cache"
DPS_XSD = CACHE_DIR / "DPS_v1.01.xsd"

# TSSerieDPS usa ^/$ (XSD 1.1); libxml2 (XSD 1.0) trata como literais.
_SERIE_PATTERN_XSD11 = "^0{0,4}\\d{1,5}$"
_SERIE_PATTERN_XSD10 = "0{0,4}[0-9]{1,5}"


class NfseSchemaErro(ValueError):
    """XML DPS não conforme ao XSD oficial."""

    def __init__(self, erros: list[str]):
        self.erros = erros
        msg = "XML DPS inválido contra XSD NFS-e v1.01:\n" + "\n".join(f"  • {e}" for e in erros)
        super().__init__(msg)


def _normalizar_tipos_simples(conteudo: str) -> str:
    """Ajusta padrão TSSerieDPS para validação XSD 1.0 (libxml2), sem alterar semântica."""
    return conteudo.replace(
        f'<xs:pattern value="{_SERIE_PATTERN_XSD11}"/>',
        f'<xs:pattern value="{_SERIE_PATTERN_XSD10}"/>',
    )


def _preparar_cache_xsd() -> None:
    """Copia XSDs oficiais para cache com único ajuste de compatibilidade libxml2."""
    if not (XSD_DIR / "DPS_v1.01.xsd").is_file():
        raise FileNotFoundError(
            f"XSD DPS não encontrado em {XSD_DIR}. Execute: python scripts/download_nfse_xsd.py"
        )
    tipos_src = XSD_DIR / "tiposSimples_v1.01.xsd"
    tipos_dst = CACHE_DIR / "tiposSimples_v1.01.xsd"
    if CACHE_DIR.is_dir() and tipos_dst.is_file():
        if tipos_dst.read_text(encoding="utf-8") == _normalizar_tipos_simples(
            tipos_src.read_text(encoding="utf-8")
        ):
            return

    if CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)
    CACHE_DIR.mkdir(parents=True)
    for path in XSD_DIR.glob("*.xsd"):
        dst = CACHE_DIR / path.name
        if path.name == "tiposSimples_v1.01.xsd":
            dst.write_text(_normalizar_tipos_simples(path.read_text(encoding="utf-8")), encoding="utf-8")
        else:
            shutil.copy2(path, dst)


@lru_cache(maxsize=1)
def _carregar_schema() -> etree.XMLSchema:
    _preparar_cache_xsd()
    schema_doc = etree.parse(str(DPS_XSD))
    return etree.XMLSchema(schema_doc)


def _formatar_erros(schema: etree.XMLSchema) -> list[str]:
    erros = []
    for entry in schema.error_log:
        msg = re.sub(r"\s+", " ", (entry.message or "").strip())
        if entry.line:
            erros.append(f"linha {entry.line}: {msg}")
        else:
            erros.append(msg)
    return erros or ["Erro de schema não detalhado"]


def validar_dps_xml(xml: bytes | str) -> list[str]:
    """
    Valida XML DPS (com ou sem assinatura) contra DPS_v1.01.xsd.
    Retorna lista vazia se válido; caso contrário, mensagens de erro legíveis.
    """
    if isinstance(xml, str):
        xml = xml.encode("utf-8")
    schema = _carregar_schema()
    parser = etree.XMLParser(remove_blank_text=False)
    try:
        doc = etree.fromstring(xml, parser=parser)
    except etree.XMLSyntaxError as exc:
        return [f"XML malformado: {exc}"]

    if schema.validate(doc):
        return []
    return _formatar_erros(schema)


def validar_dps_xml_ou_erro(xml: bytes | str) -> None:
    """Levanta NfseSchemaErro se o XML não passar na validação XSD."""
    erros = validar_dps_xml(xml)
    if erros:
        raise NfseSchemaErro(erros)
