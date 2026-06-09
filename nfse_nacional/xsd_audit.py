"""Auditoria XSD completa do XML DPS NFS-e Nacional v1.01 (diagnostico E0714)."""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from lxml import etree

from nfse_nacional.constants import NS, NS_DS
from nfse_nacional.schema_validator import (
    CACHE_DIR,
    XSD_DIR,
    _carregar_schema,
    _formatar_erros,
    _preparar_cache_xsd,
    validar_dps_xml,
)

DEBUG_DIR = Path(__file__).resolve().parents[1] / "debug"
DEBUG_TXT = DEBUG_DIR / "auditoria_xsd_completa.txt"
DEBUG_JSON = DEBUG_DIR / "auditoria_xsd_completa.json"

XSD_NS = "http://www.w3.org/2001/XMLSchema"
DS_PREFIX = "ds"

XML_CANDIDATES = (
    DEBUG_DIR / "nfse_payload_descompactado.xml",
    DEBUG_DIR / "nfse_post_final.xml",
    DEBUG_DIR / "nfse_assinada.xml",
)

LAYOUT_VERSAO = "1.01"
VERSAO_APLIC_ESPERADA = "1.00"

# Mapeamento raiz elemento DPS -> tipo XSD
ROOT_ELEMENT_TYPES = {
    "DPS": "TCDPS",
    "infDPS": "TCInfDPS",
}

XSD_DEPENDENCIAS = (
    "DPS_v1.01.xsd",
    "tiposComplexos_v1.01.xsd",
    "tiposSimples_v1.01.xsd",
    "xmldsig-core-schema.xsd",
)


def _local(tag) -> str:
    return etree.QName(tag).localname


def _ns(tag) -> str:
    return etree.QName(tag).namespace or ""


def _xpath_local(elem, local: str):
    return elem.find(f"{{{NS}}}{local}") if _ns(elem.tag) == NS else None


class XsdModel:
    """Indice de complexTypes e sequencias do layout v1.01."""

    def __init__(self, xsd_dir: Path):
        self.complex_types: dict[str, list[dict]] = {}
        self.element_types: dict[tuple[str, str], str] = {}  # (parent_type, child_name) -> child_type
        self.choice_elements: set[tuple[str, str]] = set()  # (parent_type, child_name)
        self._parse_dir(xsd_dir)

    def _parse_dir(self, xsd_dir: Path) -> None:
        for path in sorted(xsd_dir.glob("*.xsd")):
            if path.name.startswith("."):
                continue
            self._parse_file(path)

    def _parse_file(self, path: Path) -> None:
        root = etree.parse(str(path)).getroot()
        for ct in root.findall(f".//{{{XSD_NS}}}complexType"):
            name = ct.get("name")
            if not name:
                continue
            elems = self._extract_sequence(ct)
            if elems:
                self.complex_types[name] = elems
                for el in elems:
                    if el.get("type"):
                        self.element_types[(name, el["name"])] = el["type"]
                    if el.get("choice"):
                        self.choice_elements.add((name, el["name"]))

    def _extract_sequence(self, complex_type) -> list[dict]:
        seq = complex_type.find(f"{{{XSD_NS}}}sequence")
        if seq is None:
            choice = complex_type.find(f"{{{XSD_NS}}}choice")
            if choice is not None:
                return self._extract_choice(choice)
            return []

        out: list[dict] = []
        for child in seq:
            if not isinstance(child.tag, str):
                continue
            if _local(child.tag) == "element":
                ref = child.get("ref") or ""
                ref_name = ref.split(":")[-1] if ref else child.get("name", "")
                out.append(
                    {
                        "name": ref_name,
                        "type": child.get("type", "").split(":")[-1],
                        "minOccurs": child.get("minOccurs", "1"),
                        "maxOccurs": child.get("maxOccurs", "1"),
                        "ref": ref,
                    }
                )
            elif isinstance(child.tag, str) and _local(child.tag) == "choice":
                out.extend(self._extract_choice(child))
        return out

    def _extract_choice(self, choice) -> list[dict]:
        out: list[dict] = []
        for child in choice:
            if not isinstance(child.tag, str):
                continue
            if _local(child.tag) == "element":
                out.append(
                    {
                        "name": child.get("name", ""),
                        "type": child.get("type", "").split(":")[-1],
                        "minOccurs": choice.get("minOccurs", child.get("minOccurs", "0")),
                        "maxOccurs": child.get("maxOccurs", "1"),
                        "choice": True,
                    }
                )
        return out

    def child_type(self, parent_type: str, child_name: str) -> str | None:
        t = self.element_types.get((parent_type, child_name))
        if t:
            return t
        for el in self.complex_types.get(parent_type, []):
            if el["name"] == child_name and el.get("type"):
                return el["type"]
        return None


def _validar_xsd_oficial_bruto(xml_bytes: bytes) -> tuple[bool, list[str]]:
    """Valida contra XSD oficial sem cache (pode falhar em TSSerieDPS no libxml2)."""
    schema_path = XSD_DIR / "DPS_v1.01.xsd"
    if not schema_path.is_file():
        return False, ["XSD oficial ausente"]
    try:
        schema = etree.XMLSchema(etree.parse(str(schema_path)))
        doc = etree.fromstring(xml_bytes)
        ok = schema.validate(doc)
        return ok, [] if ok else _formatar_erros(schema)
    except etree.XMLSchemaParseError as exc:
        return False, [f"Erro ao parsear XSD oficial: {exc}"]
    except Exception as exc:
        return False, [str(exc)]


def _validar_xsd_cache(xml_bytes: bytes) -> tuple[bool, list[str]]:
    _preparar_cache_xsd()
    schema = _carregar_schema()
    doc = etree.fromstring(xml_bytes)
    ok = schema.validate(doc)
    return ok, [] if ok else _formatar_erros(schema)


def _filhos_nfse(elem) -> list:
    return [c for c in elem if _local(c.tag) != "Signature" and _ns(c.tag) in (NS, "")]


def _verificar_ordem(parent, parent_type: str, model: XsdModel, path: str) -> list[dict]:
    divergencias: list[dict] = []
    expected = model.complex_types.get(parent_type, [])
    if not expected:
        return divergencias

    expected_names = [e["name"] for e in expected if e.get("name")]
    actual_elems = _filhos_nfse(parent)
    actual_names = [_local(c.tag) for c in actual_elems]

    # Ordem: actual_names deve ser subsequencia ordenada de expected_names
    idx = 0
    for name in actual_names:
        while idx < len(expected_names) and expected_names[idx] != name:
            idx += 1
        if idx >= len(expected_names):
            divergencias.append(
                {
                    "tipo": "elemento_nao_esperado",
                    "path": path,
                    "elemento": name,
                    "esperado_apos": expected_names,
                }
            )
            break
        idx += 1

    if actual_names != [n for n in expected_names if n in actual_names]:
        # ordem explicita divergente
        esperada_filtrada = [n for n in expected_names if n in actual_names]
        if actual_names != esperada_filtrada:
            divergencias.append(
                {
                    "tipo": "ordem_elementos",
                    "path": path,
                    "parent_type": parent_type,
                    "ordem_atual": actual_names,
                    "ordem_esperada": esperada_filtrada,
                }
            )

    for child in actual_elems:
        cname = _local(child.tag)
        child_path = f"{path}/{cname}"
        child_type = model.child_type(parent_type, cname)
        if child_type and child_type in model.complex_types:
            divergencias.extend(_verificar_ordem(child, child_type, model, child_path))

    return divergencias


def _opcionais_presentes(parent, parent_type: str, model: XsdModel, path: str) -> list[dict]:
    presentes: list[dict] = []
    expected = model.complex_types.get(parent_type, [])
    actual_names = {_local(c.tag) for c in _filhos_nfse(parent)}

    for el in expected:
        min_occ = el.get("minOccurs", "1")
        if (parent_type, el["name"]) in model.choice_elements:
            continue
        if min_occ == "0" and el["name"] in actual_names:
            presentes.append(
                {
                    "path": f"{path}/{el['name']}",
                    "elemento": el["name"],
                    "parent_type": parent_type,
                    "minOccurs": 0,
                    "categoria": "opcional",
                    "observacao": "Elemento opcional presente no XML (minOccurs=0)",
                }
            )

    for child in _filhos_nfse(parent):
        cname = _local(child.tag)
        child_type = model.child_type(parent_type, cname)
        if child_type and child_type in model.complex_types:
            presentes.extend(
                _opcionais_presentes(child, child_type, model, f"{path}/{cname}")
            )

    return presentes


def _elementos_desconhecidos(parent, parent_type: str, model: XsdModel, path: str) -> list[dict]:
    desconhecidos: list[dict] = []
    expected_names = {e["name"] for e in model.complex_types.get(parent_type, [])}

    for child in _filhos_nfse(parent):
        cname = _local(child.tag)
        if cname not in expected_names:
            desconhecidos.append(
                {
                    "path": f"{path}/{cname}",
                    "elemento": cname,
                    "parent_type": parent_type,
                }
            )
            continue
        child_type = model.child_type(parent_type, cname)
        if child_type and child_type in model.complex_types:
            desconhecidos.extend(
                _elementos_desconhecidos(child, child_type, model, f"{path}/{cname}")
            )

    return desconhecidos


def _extrair_metadados(xml_bytes: bytes) -> dict:
    root = etree.fromstring(xml_bytes)
    inf = root.find(f"{{{NS}}}infDPS")
    meta = {
        "tag_raiz": _local(root.tag),
        "versao_dps": root.get("versao", ""),
        "namespace_nfse": root.nsmap.get(None, ""),
        "tem_assinatura": root.find(f".//{{{NS_DS}}}Signature") is not None
        or any(_local(c.tag) == "Signature" for c in root.iter()),
    }
    if inf is not None:
        meta["infDPS_Id"] = inf.get("Id", "")
        meta["tpAmb"] = (inf.find(f"{{{NS}}}tpAmb").text or "").strip() if inf.find(f"{{{NS}}}tpAmb") is not None else ""
        meta["verAplic"] = (inf.find(f"{{{NS}}}verAplic").text or "").strip() if inf.find(f"{{{NS}}}verAplic") is not None else ""
        meta["serie"] = (inf.find(f"{{{NS}}}serie").text or "").strip() if inf.find(f"{{{NS}}}serie") is not None else ""
        c_serv = inf.find(f".//{{{NS}}}cServ")
        if c_serv is not None:
            for tag in ("cTribNac", "cTribMun", "cNBS", "xDescServ"):
                el = c_serv.find(f"{{{NS}}}{tag}")
                meta[tag] = (el.text or "").strip() if el is not None else None
    return meta


def _arvore_elementos(elem, depth=0, max_depth=8) -> list[str]:
    linhas = []
    if depth > max_depth:
        return linhas
    indent = "  " * depth
    for child in elem:
        loc = _local(child.tag)
        ns = _ns(child.tag)
        ns_hint = " (xmldsig)" if ns == NS_DS or loc == "Signature" else ""
        txt = (child.text or "").strip()
        attr = ""
        if child.get("Id"):
            attr = f' Id="{child.get("Id")}"'
        elif child.get("Algorithm"):
            attr = f' Algorithm="{child.get("Algorithm")[:40]}..."'
        val = f" = {txt[:60]}" if txt and not list(child) and len(txt) < 80 else ""
        linhas.append(f"{indent}{loc}{ns_hint}{attr}{val}")
        linhas.extend(_arvore_elementos(child, depth + 1, max_depth))
    return linhas


def auditar_xsd_completa(xml_bytes: bytes | None = None, xml_path: Path | None = None) -> dict:
    """
    Audita XML DPS contra XSD oficial v1.01.
    Grava debug/auditoria_xsd_completa.txt e .json
    """
    path_usado = xml_path
    if xml_bytes is None:
        for cand in XML_CANDIDATES:
            if cand.is_file():
                path_usado = cand
                xml_bytes = cand.read_bytes()
                break
    if xml_bytes is None:
        raise FileNotFoundError("Nenhum XML DPS encontrado em debug/")

    model = XsdModel(XSD_DIR)
    root = etree.fromstring(xml_bytes)

    ok_cache, erros_cache = _validar_xsd_cache(xml_bytes)
    ok_oficial, erros_oficial = _validar_xsd_oficial_bruto(xml_bytes)
    erros_validador = validar_dps_xml(xml_bytes)

    meta = _extrair_metadados(xml_bytes)

    dps_type = ROOT_ELEMENT_TYPES["DPS"]
    inf = root.find(f"{{{NS}}}infDPS")
    inf_type = ROOT_ELEMENT_TYPES["infDPS"]

    ordem_div = _verificar_ordem(root, dps_type, model, "/DPS")
    if inf is not None:
        ordem_div.extend(_verificar_ordem(inf, inf_type, model, "/DPS/infDPS"))

    opcionais = []
    if inf is not None:
        opcionais = _opcionais_presentes(inf, inf_type, model, "/DPS/infDPS")

    desconhecidos = _verificar_ordem_desconhecidos(root, dps_type, model)
    if inf is not None:
        desconhecidos.extend(_elementos_desconhecidos(inf, inf_type, model, "/DPS/infDPS"))

    # Campos fiscais conhecidos do contexto E0714
    campos_fiscais = {
        "cTribNac": meta.get("cTribNac"),
        "cTribMun": meta.get("cTribMun"),
        "cNBS": meta.get("cNBS"),
        "cTribMun_no_xml": meta.get("cTribMun") is not None,
    }

    comparacao_layout = {
        "layout_xsd": LAYOUT_VERSAO,
        "versao_atributo_dps": meta.get("versao_dps"),
        "verAplic_xml": meta.get("verAplic"),
        "verAplic_esperado_manual": VERSAO_APLIC_ESPERADA,
        "versao_dps_confere": meta.get("versao_dps") in ("1.00", "1.01"),
        "observacao_versao": (
            "Atributo versao='1.00' no DPS e compativel com XSD v1.01 (TVerNFSe)."
            if meta.get("versao_dps") == "1.00"
            else f"versao={meta.get('versao_dps')}"
        ),
    }

    xsd_files = []
    for nome in XSD_DEPENDENCIAS:
        p = XSD_DIR / nome
        xsd_files.append(
            {
                "arquivo": nome,
                "existe": p.is_file(),
                "bytes": p.stat().st_size if p.is_file() else 0,
            }
        )

    resultado = {
        "gerado_em": datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds"),
        "xml_arquivo": str(path_usado.resolve()) if path_usado else "",
        "xml_bytes": len(xml_bytes),
        "layout": LAYOUT_VERSAO,
        "xsd_dependencias": xsd_files,
        "xsd_cache_dir": str(CACHE_DIR.resolve()),
        "validacao": {
            "xsd_cache_libxml2": {"valido": ok_cache, "erros": erros_cache},
            "xsd_oficial_bruto": {"valido": ok_oficial, "erros": erros_oficial},
            "schema_validator_modulo": {"valido": len(erros_validador) == 0, "erros": erros_validador},
        },
        "metadados_xml": meta,
        "campos_fiscais": campos_fiscais,
        "comparacao_layout": comparacao_layout,
        "ordem_elementos_divergencias": ordem_div,
        "elementos_opcionais_presentes": opcionais,
        "elementos_desconhecidos": desconhecidos,
        "arvore_xml": _arvore_elementos(root),
        "resumo": {
            "xsd_valido": ok_cache and len(erros_validador) == 0,
            "divergencias_ordem": len(ordem_div),
            "elementos_opcionais_count": len(opcionais),
            "elementos_desconhecidos_count": len(desconhecidos),
        },
    }

    linhas = [
        "==================================",
        "AUDITORIA XSD COMPLETA — NFS-e Nacional DPS v1.01",
        f"Gerado em: {resultado['gerado_em']}",
        "==================================",
        "",
        "=== ARQUIVO XML ===",
        f"origem: {resultado['xml_arquivo']}",
        f"tamanho_bytes: {resultado['xml_bytes']}",
        f"layout_xsd: {LAYOUT_VERSAO}",
        "",
        "=== XSDs OFICIAIS UTILIZADOS ===",
    ]
    for xf in xsd_files:
        linhas.append(f"  - {xf['arquivo']}: {'OK' if xf['existe'] else 'AUSENTE'} ({xf['bytes']} bytes)")
    linhas.extend(
        [
            f"cache_validacao: {CACHE_DIR}",
            "",
            "=== VALIDACAO XSD ===",
            f"xsd_cache_libxml2 (compativel): {'VALIDO' if ok_cache else 'INVALIDO'}",
        ]
    )
    for e in erros_cache:
        linhas.append(f"  ERRO cache: {e}")
    linhas.append(f"xsd_oficial_bruto (sem ajuste TSSerieDPS): {'VALIDO' if ok_oficial else 'INVALIDO'}")
    for e in erros_oficial:
        linhas.append(f"  ERRO oficial: {e}")
    if not ok_oficial and ok_cache and len(erros_oficial) == 1 and "serie" in erros_oficial[0].lower():
        linhas.append(
            "  NOTA: Falha no XSD bruto pode ser falso positivo libxml2 (pattern ^/$ em TSSerieDPS)."
        )
    linhas.extend(
        [
            "",
            "=== METADADOS XML ===",
            f"versao DPS: {meta.get('versao_dps')}",
            f"infDPS.Id: {meta.get('infDPS_Id')}",
            f"tpAmb: {meta.get('tpAmb')}",
            f"verAplic: {meta.get('verAplic')}",
            f"serie: {meta.get('serie')}",
            f"assinatura presente: {meta.get('tem_assinatura')}",
            "",
            "=== CAMPOS FISCAIS (contexto E0714) ===",
            f"cTribNac: {campos_fiscais.get('cTribNac')}",
            f"cTribMun: {campos_fiscais.get('cTribMun')} (presente={campos_fiscais.get('cTribMun_no_xml')})",
            f"cNBS: {campos_fiscais.get('cNBS')}",
            "",
            "=== COMPARACAO LAYOUT SEFIN ===",
            f"versao_atributo: {comparacao_layout.get('versao_atributo_dps')}",
            f"observacao: {comparacao_layout.get('observacao_versao')}",
            "",
            "=== ORDEM DOS ELEMENTOS ===",
        ]
    )
    if ordem_div:
        for d in ordem_div:
            linhas.append(f"  DIVERGENCIA [{d['tipo']}] {d.get('path')}: {d}")
    else:
        linhas.append("  Nenhuma divergencia de ordem detectada (conforme sequencias XSD v1.01).")

    linhas.extend(["", "=== ELEMENTOS OPCIONAIS PRESENTES ==="])
    if opcionais:
        for o in opcionais:
            linhas.append(f"  - {o['path']} (minOccurs=0, parent={o['parent_type']})")
    else:
        linhas.append("  Nenhum elemento opcional extra alem dos obrigatorios.")

    linhas.extend(["", "=== ELEMENTOS DESCONHECIDOS / FORA DO XSD ==="])
    if desconhecidos:
        for d in desconhecidos:
            linhas.append(f"  - {d['path']} (parent={d['parent_type']})")
    else:
        linhas.append("  Nenhum elemento fora do XSD detectado na arvore DPS.")

    linhas.extend(["", "=== ARVORE XML (DPS) ==="])
    linhas.extend(resultado["arvore_xml"])

    linhas.extend(
        [
            "",
            "=== RESULTADO ===",
            f"XSD valido (cache): {ok_cache}",
            f"Divergencias ordem: {len(ordem_div)}",
            f"Opcionais presentes: {len(opcionais)}",
            f"Elementos desconhecidos: {len(desconhecidos)}",
        ]
    )

    texto = "\n".join(linhas)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_TXT.write_text(texto + "\n", encoding="utf-8")
    DEBUG_JSON.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")

    resultado["relatorio_txt"] = str(DEBUG_TXT.resolve())
    resultado["relatorio_json"] = str(DEBUG_JSON.resolve())
    resultado["texto"] = texto
    return resultado


def _verificar_ordem_desconhecidos(root, dps_type: str, model: XsdModel) -> list[dict]:
    return _elementos_desconhecidos(root, dps_type, model, "/DPS")
