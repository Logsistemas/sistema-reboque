#!/usr/bin/env python3
"""
Comparação definitiva XML NFS-e Nacional — Bling (sucesso) vs sistema (E0714).
Somente diagnóstico; não altera emissão.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEBUG = ROOT / "debug"
REL_TXT = DEBUG / "comparativo_bling_vs_sistema.txt"
REL_JSON = DEBUG / "comparativo_bling_vs_sistema.json"

DEFAULT_BLING = Path.home() / "Downloads" / "33045572231494899000170000000000058926069771313560.xml"
DEFAULT_SISTEMA = DEBUG / "nfse_payload_descompactado.xml"

NS_NFSE = "http://www.sped.fazenda.gov.br/nfse"
NS_DS = "http://www.w3.org/2000/09/xmldsig#"

SEFIN_URL = {
    "1": "https://sefin.nfse.gov.br/SefinNacional/nfse",
    "2": "https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse",
}


def _local(tag: str) -> str:
    return f"*[local-name()='{tag}']"


def _txt(el, tag: str, default: str = "") -> str:
    if el is None:
        return default
    nodes = el.xpath(f"./*[local-name()='{tag}']")
    if not nodes or nodes[0].text is None:
        return default
    return nodes[0].text.strip()


def _all_txt(el, tag: str) -> list[str]:
    if el is None:
        return []
    return [(n.text or "").strip() for n in el.xpath(f".//*[local-name()='{tag}']") if (n.text or "").strip()]


def _child(el, tag: str):
    if el is None:
        return None
    nodes = el.xpath(f"./*[local-name()='{tag}']")
    return nodes[0] if nodes else None


def _children_tags(el) -> list[str]:
    if el is None:
        return []
    return [el.tag.split("}")[-1] if "}" in el.tag else el.tag for el in el]


def _flatten_tree(el, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    if el is None:
        return out
    tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
    path = f"{prefix}/{tag}" if prefix else tag
    if el.text and el.text.strip() and not list(el):
        out[path] = el.text.strip()
    for child in el:
        out.update(_flatten_tree(child, path))
    return out


def _load_xml(path: Path):
    from lxml import etree

    data = path.read_bytes()
    root = etree.fromstring(data)
    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag
    return root, tag, len(data)


def _find_inf_dps(root):
    nodes = root.xpath(".//*[local-name()='infDPS']")
    return nodes[0] if nodes else None


def _find_inf_nfse(root):
    nodes = root.xpath(".//*[local-name()='infNFSe']")
    return nodes[0] if nodes else None


def _find_dps_root(root):
    if root.tag.endswith("DPS") or root.tag.split("}")[-1] == "DPS":
        return root
    nodes = root.xpath(".//*[local-name()='DPS']")
    return nodes[0] if nodes else None


def _parse_id_dps(id_dps: str) -> dict:
    id_dps = (id_dps or "").strip()
    out = {
        "valor": id_dps,
        "tamanho": len(id_dps),
        "valido_formato": False,
        "prefixo": "",
        "cMun": "",
        "tpInsc": "",
        "inscFederal": "",
        "serie": "",
        "nDPS_id": "",
        "id_recomposto": "",
        "bate_com_gerar_id_dps": False,
    }
    if not id_dps.startswith("DPS") or len(id_dps) != 45:
        return out
    body = id_dps[3:]
    if not body.isdigit():
        return out
    out.update(
        {
            "valido_formato": True,
            "prefixo": "DPS",
            "cMun": body[0:7],
            "tpInsc": body[7:8],
            "inscFederal": body[8:22],
            "serie": body[22:27],
            "nDPS_id": body[27:42],
        }
    )
    try:
        from nfse_nacional.ids import gerar_id_dps

        out["id_recomposto"] = gerar_id_dps(out["cMun"], out["inscFederal"], out["serie"], out["nDPS_id"])
        out["bate_com_gerar_id_dps"] = out["id_recomposto"] == id_dps
    except Exception as exc:
        out["erro_recompor"] = str(exc)
    return out


def _extract_prest(inf) -> dict:
    prest = _child(inf, "prest")
    reg = _child(prest, "regTrib")
    return {
        "CNPJ": _txt(prest, "CNPJ"),
        "CPF": _txt(prest, "CPF"),
        "IM": _txt(prest, "IM"),
        "fone": _txt(prest, "fone"),
        "email": _txt(prest, "email"),
        "opSimpNac": _txt(reg, "opSimpNac"),
        "regApTribSN": _txt(reg, "regApTribSN"),
        "regEspTrib": _txt(reg, "regEspTrib"),
        "tags_presentes": _children_tags(prest),
    }


def _extract_toma(inf) -> dict:
    toma = _child(inf, "toma")
    end = _child(toma, "end") or _child(toma, "endNac") or _child(toma, "endExt")
    end_nac = _child(end, "endNac") if end is not None else None
    alvo = end_nac or end
    return {
        "CNPJ": _txt(toma, "CNPJ"),
        "CPF": _txt(toma, "CPF"),
        "xNome": _txt(toma, "xNome"),
        "fone": _txt(toma, "fone"),
        "email": _txt(toma, "email"),
        "xLgr": _txt(alvo, "xLgr"),
        "nro": _txt(alvo, "nro"),
        "xBairro": _txt(alvo, "xBairro"),
        "cMun": _txt(alvo, "cMun"),
        "CEP": _txt(alvo, "CEP"),
        "UF": _txt(alvo, "UF"),
        "tags_presentes": _children_tags(toma),
    }


def _extract_serv(inf) -> dict:
    serv = _child(inf, "serv")
    loc = _child(serv, "locPrest")
    cs = _child(serv, "cServ")
    return {
        "cLocPrestacao": _txt(loc, "cLocPrestacao"),
        "cTribNac": _txt(cs, "cTribNac"),
        "cTribMun": _txt(cs, "cTribMun"),
        "xDescServ": _txt(cs, "xDescServ"),
        "cNBS": _txt(cs, "cNBS"),
        "cIntContrib": _txt(cs, "cIntContrib"),
    }


def _extract_valores(inf) -> dict:
    valores = _child(inf, "valores")
    vsp = _child(valores, "vServPrest")
    trib = _child(valores, "trib")
    tm = _child(trib, "tribMun")
    tt = _child(trib, "totTrib")
    return {
        "vServ": _txt(vsp, "vServ"),
        "tribISSQN": _txt(tm, "tribISSQN"),
        "tpRetISSQN": _txt(tm, "tpRetISSQN"),
        "pAliq": _txt(tm, "pAliq"),
        "vTotTrib": _txt(tt, "vTotTrib"),
        "indTotTrib": _txt(tt, "indTotTrib"),
        "pTotTribSN": _txt(tt, "pTotTribSN"),
        "totTrib_tags": _children_tags(tt),
        "trib_tags": _children_tags(trib),
    }


def _extract_ibscbs(inf) -> dict:
    ibs = _child(inf, "IBSCBS")
    if ibs is None:
        return {"presente": False}
    flat = _flatten_tree(ibs)
    return {
        "presente": True,
        "finNFSe": _txt(ibs, "finNFSe"),
        "indFinal": _txt(ibs, "indFinal"),
        "cIndOp": _txt(ibs, "cIndOp"),
        "indDest": _txt(ibs, "indDest"),
        "CST": _all_txt(ibs, "CST"),
        "cClassTrib": _all_txt(ibs, "cClassTrib"),
        "campos": flat,
    }


def _extract_signature_on(root) -> dict:
    sigs = root.xpath(".//*[local-name()='Signature']")
    if not sigs:
        return {"presente": False}
    sig = sigs[0]
    si = sig.xpath("./*[local-name()='SignedInfo']")
    si = si[0] if si else None
    ref = si.xpath("./*[local-name()='Reference']") if si is not None else []
    ref = ref[0] if ref else None
    x509 = sig.xpath(".//*[local-name()='X509Certificate']")
    certs_b64 = [(x.text or "").replace("\n", "").replace("\r", "") for x in x509]
    cert_lens = [len(c) for c in certs_b64 if c]
    parent_tag = sig.getparent().tag.split("}")[-1] if sig.getparent() is not None else ""
    sig_ns = sig.nsmap
    prefixos = [k for k in (sig_ns or {}) if k]
    def _algo(parent, tag):
        if parent is None:
            return ""
        nodes = parent.xpath(f"./*[local-name()='{tag}']")
        if not nodes:
            return ""
        node = nodes[0]
        return node.get("Algorithm", "") or (node.text or "").strip()

    transforms = []
    if ref is not None:
        for tr in ref.xpath(".//*[local-name()='Transform']"):
            alg = tr.get("Algorithm", "")
            if alg and alg not in transforms:
                transforms.append(alg)

    return {
        "presente": True,
        "parent_element": parent_tag,
        "posicao": "filho_direto_" + parent_tag,
        "namespace": sig.nsmap.get(None, sig.nsmap.get("ds", "")),
        "prefixos": prefixos,
        "CanonicalizationMethod": _algo(si, "CanonicalizationMethod"),
        "SignatureMethod": _algo(si, "SignatureMethod"),
        "DigestMethod": _algo(ref, "DigestMethod"),
        "Reference_URI": ref.get("URI", "") if ref is not None else "",
        "Transforms": transforms,
        "DigestValue_len": len(_txt(ref, "DigestValue")),
        "SignatureValue_len": len(_txt(sig, "SignatureValue")),
        "X509Certificate_count": len(certs_b64),
        "X509Certificate_chars": cert_lens,
        "KeyInfo_presente": _child(sig, "KeyInfo") is not None,
    }


def _extract_doc(path: Path, rotulo: str) -> dict:
    root, root_tag, size = _load_xml(path)
    inf_nfse = _find_inf_nfse(root)
    dps_root = _find_dps_root(root)
    inf = _find_inf_dps(root)

    tp_amb = _txt(inf, "tpAmb") if inf is not None else _txt(inf_nfse, "tpAmb")
    amb_label = "producao" if tp_amb == "1" else "homologacao" if tp_amb == "2" else f"desconhecido({tp_amb})"

    id_dps = inf.get("Id", "") if inf is not None else ""
    id_parse = _parse_id_dps(id_dps)

    chave_arquivo = re.sub(r"\D", "", path.stem)
    chave_50 = chave_arquivo[:50] if len(chave_arquivo) >= 50 else chave_arquivo

    return {
        "rotulo": rotulo,
        "arquivo": str(path.resolve()),
        "bytes": size,
        "root_tag": root_tag,
        "tipo_documento": (
            "NFSe_autorizada" if root_tag == "NFSe" else "DPS_envio" if root_tag == "DPS" else root_tag
        ),
        "versao_raiz": root.get("versao", ""),
        "ambiente": {
            "tpAmb": tp_amb,
            "label": amb_label,
            "endpoint_esperado": SEFIN_URL.get(tp_amb, ""),
            "ambGer_nfse": _txt(inf_nfse, "ambGer"),
            "tpEmis_nfse": _txt(inf_nfse, "tpEmis"),
        },
        "chave_arquivo_nome": chave_50,
        "inf_nfse": {
            "presente": inf_nfse is not None,
            "nNFSe": _txt(inf_nfse, "nNFSe"),
            "verAplic": _txt(inf_nfse, "verAplic"),
            "ambGer": _txt(inf_nfse, "ambGer"),
            "dhProc": _txt(inf_nfse, "dhProc"),
        },
        "id_dps": {
            **id_parse,
            "infDPS_Id_attr": id_dps,
            "nDPS_elemento": _txt(inf, "nDPS"),
            "serie_elemento": _txt(inf, "serie"),
            "cLocEmi": _txt(inf, "cLocEmi"),
            "bate_id_com_elementos": (
                id_parse.get("id_recomposto") == id_dps if id_parse.get("valido_formato") else None
            ),
        },
        "numeracao": {
            "serie": _txt(inf, "serie"),
            "nDPS": _txt(inf, "nDPS"),
            "dCompet": _txt(inf, "dCompet"),
            "dhEmi": _txt(inf, "dhEmi"),
            "verAplic": _txt(inf, "verAplic"),
            "tpEmit": _txt(inf, "tpEmit"),
            "cLocEmi": _txt(inf, "cLocEmi"),
        },
        "prestador": _extract_prest(inf),
        "tomador": _extract_toma(inf),
        "servico": _extract_serv(inf),
        "valores": _extract_valores(inf),
        "ibscbs": _extract_ibscbs(inf),
        "assinatura_dps": _extract_signature_on(dps_root or root),
        "assinatura_nfse": _extract_signature_on(root) if root_tag == "NFSe" else {"presente": False},
        "elementos_infDPS": _children_tags(inf),
        "flat_infDPS": _flatten_tree(inf),
    }


def _cmp_section(bling: dict, sistema: dict, section: str, fields: list[str]) -> list[dict]:
    diffs = []
    b = bling.get(section) or {}
    s = sistema.get(section) or {}
    for f in fields:
        bv, sv = b.get(f, ""), s.get(f, "")
        if str(bv) != str(sv):
            diffs.append(
                {
                    "secao": section,
                    "campo": f,
                    "bling": bv,
                    "sistema": sv,
                    "igual": False,
                }
            )
    return diffs


def _cmp_tags(bling_tags: list, sistema_tags: list, secao: str) -> dict:
    bs, ss = set(bling_tags or []), set(sistema_tags or [])
    return {
        "secao": secao,
        "so_bling": sorted(bs - ss),
        "so_sistema": sorted(ss - bs),
        "comuns": sorted(bs & ss),
    }


def _score_e0714(diff: dict) -> int:
    """Maior = mais provável causar E0714."""
    sec = diff.get("secao", "")
    campo = diff.get("campo", "")
    key = f"{sec}.{campo}"

    alta = {
        "ambiente.tpAmb",
        "assinatura_dps.X509Certificate_count",
        "assinatura_dps.SignatureMethod",
        "assinatura_dps.DigestMethod",
        "assinatura_dps.CanonicalizationMethod",
        "assinatura_dps.Reference_URI",
        "assinatura_dps.Transforms",
        "assinatura_dps.prefixos",
        "id_dps.valido_formato",
        "id_dps.bate_com_gerar_id_dps",
        "tipo_documento",
    }
    media = {
        "id_dps.nDPS_id",
        "numeracao.nDPS",
        "numeracao.verAplic",
        "numeracao.serie",
        "ibscbs.presente",
        "prestador.IM",
        "prestador.fone",
        "prestador.email",
        "tomador.tags_presentes",
        "valores.indTotTrib",
    }
    baixa = {
        "numeracao.dhEmi",
        "numeracao.dCompet",
        "servico.xDescServ",
        "valores.vServ",
    }

    if key in alta or campo in alta:
        return 90
    if sec in ("assinatura_dps", "assinatura_nfse"):
        return 85
    if key in media or campo in media:
        return 55
    if key in baixa:
        return 20
    if sec == "tags":
        return 35
    return 40


def comparar(bling_path: Path, sistema_path: Path) -> dict:
    bling = _extract_doc(bling_path, "bling")
    sistema = _extract_doc(sistema_path, "sistema")

    diffs: list[dict] = []
    diffs.extend(
        _cmp_section(
            bling,
            sistema,
            "ambiente",
            ["tpAmb", "label", "endpoint_esperado", "ambGer_nfse"],
        )
    )
    diffs.extend(
        _cmp_section(
            bling,
            sistema,
            "id_dps",
            [
                "valor",
                "tamanho",
                "valido_formato",
                "cMun",
                "tpInsc",
                "inscFederal",
                "serie",
                "nDPS_id",
                "bate_com_gerar_id_dps",
                "nDPS_elemento",
                "serie_elemento",
            ],
        )
    )
    diffs.extend(
        _cmp_section(
            bling,
            sistema,
            "numeracao",
            ["serie", "nDPS", "dCompet", "dhEmi", "verAplic", "tpEmit", "cLocEmi"],
        )
    )
    diffs.extend(
        _cmp_section(
            bling,
            sistema,
            "prestador",
            ["CNPJ", "IM", "fone", "email", "opSimpNac", "regApTribSN", "regEspTrib"],
        )
    )
    diffs.extend(
        _cmp_section(
            bling,
            sistema,
            "tomador",
            ["CNPJ", "CPF", "xNome", "fone", "email", "xLgr", "nro", "xBairro", "cMun", "CEP", "UF"],
        )
    )
    diffs.extend(
        _cmp_section(
            bling,
            sistema,
            "servico",
            ["cLocPrestacao", "cTribNac", "cTribMun", "xDescServ", "cNBS", "cIntContrib"],
        )
    )
    diffs.extend(
        _cmp_section(
            bling,
            sistema,
            "valores",
            ["vServ", "tribISSQN", "tpRetISSQN", "pAliq", "vTotTrib", "indTotTrib", "pTotTribSN"],
        )
    )
    diffs.extend(
        _cmp_section(
            bling,
            sistema,
            "ibscbs",
            ["presente", "finNFSe", "indFinal", "cIndOp", "indDest"],
        )
    )
    diffs.extend(
        _cmp_section(
            bling,
            sistema,
            "assinatura_dps",
            [
                "CanonicalizationMethod",
                "SignatureMethod",
                "DigestMethod",
                "Reference_URI",
                "Transforms",
                "X509Certificate_count",
                "prefixos",
                "parent_element",
            ],
        )
    )

    if bling["tipo_documento"] != sistema["tipo_documento"]:
        diffs.append(
            {
                "secao": "meta",
                "campo": "tipo_documento",
                "bling": bling["tipo_documento"],
                "sistema": sistema["tipo_documento"],
                "igual": False,
                "nota": "Bling pode exportar NFSe autorizada; sistema envia DPS",
            }
        )

    tags_prest = _cmp_tags(bling["prestador"].get("tags_presentes"), sistema["prestador"].get("tags_presentes"), "prestador")
    tags_toma = _cmp_tags(bling["tomador"].get("tags_presentes"), sistema["tomador"].get("tags_presentes"), "tomador")
    tags_tot = _cmp_tags(bling["valores"].get("totTrib_tags"), sistema["valores"].get("totTrib_tags"), "totTrib")

    for item in (tags_prest, tags_toma, tags_tot):
        if item["so_bling"] or item["so_sistema"]:
            diffs.append(
                {
                    "secao": "tags",
                    "campo": item["secao"],
                    "bling": item["so_bling"],
                    "sistema": item["so_sistema"],
                    "igual": False,
                }
            )

    for d in diffs:
        d["score_e0714"] = _score_e0714(d)

    diffs_sorted = sorted(diffs, key=lambda x: -x["score_e0714"])

    top5 = diffs_sorted[:5]
    mais_provavel = top5[0] if top5 else None

    recomendacao = _recomendacao(bling, sistema, diffs_sorted, mais_provavel)

    return {
        "gerado_em": datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds"),
        "bling_arquivo": str(bling_path.resolve()),
        "sistema_arquivo": str(sistema_path.resolve()),
        "bling": bling,
        "sistema": sistema,
        "diferencas": diffs_sorted,
        "total_diferencas": len(diffs_sorted),
        "top5_diferencas": top5,
        "mais_provavel_e0714": mais_provavel,
        "recomendacao": recomendacao,
        "tags_prestador": tags_prest,
        "tags_tomador": tags_toma,
        "tags_totTrib": tags_tot,
    }


def _recomendacao(bling, sistema, diffs, mais_provavel) -> str:
    if bling["tipo_documento"] == "NFSe_autorizada" and sistema["tipo_documento"] == "DPS_envio":
        base = (
            "Bling exporta NFSe autorizada (pós-processamento SEFIN); o sistema envia DPS. "
            "Compare principalmente o bloco infDPS embutido no XML Bling com o DPS do sistema. "
        )
    else:
        base = ""

    if mais_provavel:
        mp = mais_provavel
        if mp.get("secao") == "assinatura_dps" and mp.get("campo") == "X509Certificate_count":
            return base + (
                "Prioridade: alinhar KeyInfo/X509Certificate ao Bling (quantidade de certificados no XML assinado). "
                "Se Bling envia cadeia no X509Data e o sistema só o leaf, testar inclusão da cadeia no XML assinado."
            )
        if mp.get("secao") == "id_dps" or mp.get("campo") in ("nDPS", "nDPS_id"):
            return base + (
                "Prioridade: alinhar geração de nDPS/infDPS.Id ao padrão Bling (numeração sequencial por série, "
                "não hash determinístico). Validar se SEFIN rejeita IDs fora de sequência esperada pelo emitente."
            )
        if mp.get("secao") == "ambiente":
            return base + "Prioridade: confirmar tpAmb/endpoint — emissão deve usar o mesmo ambiente em que o Bling foi autorizado."
        if mp.get("secao") == "ibscbs":
            return base + "Prioridade: verificar se o período exige bloco IBSCBS na DPS; replicar estrutura do Bling se obrigatório."
        if mp.get("secao") == "tags":
            return base + (
                f"Prioridade: campos presentes no Bling e ausentes no sistema ({mp.get('bling')}) — "
                "avaliar se são exigidos pelo validador SEFIN para o município/regime."
            )

    if not diffs:
        return base + (
            "Nenhuma diferença material nos campos comparados. E0714 provavelmente não é estrutura XML/DPS, "
            "e sim credenciamento SEFIN ou validação server-side do certificado/emitente."
        )

    return base + (
        "Revisar as diferenças de maior score no relatório; alinhar primeiro assinatura (X509/Transforms) "
        "e numeração infDPS.Id, depois campos opcionais do tomador/prestador."
    )


def _format_txt(resultado: dict) -> str:
    b = resultado["bling"]
    s = resultado["sistema"]
    linhas = [
        "================================================================",
        "COMPARATIVO DEFINITIVO — XML BLING vs SISTEMA (NFS-e Nacional)",
        f"Gerado em: {resultado['gerado_em']}",
        "================================================================",
        "",
        "=== ARQUIVOS ===",
        f"Bling:   {resultado['bling_arquivo']}",
        f"         tipo={b['tipo_documento']} | root={b['root_tag']} | {b['bytes']} bytes",
        f"Sistema: {resultado['sistema_arquivo']}",
        f"         tipo={s['tipo_documento']} | root={s['root_tag']} | {s['bytes']} bytes",
        "",
        "=== 1. AMBIENTE ===",
        f"tpAmb Bling:    {b['ambiente']['tpAmb']} ({b['ambiente']['label']})",
        f"tpAmb Sistema:  {s['ambiente']['tpAmb']} ({s['ambiente']['label']})",
        f"ambGer (NFSe):  Bling={b['ambiente']['ambGer_nfse'] or '—'} | Sistema={s['ambiente']['ambGer_nfse'] or '—'}",
        f"Endpoint Bling:    {b['ambiente']['endpoint_esperado']}",
        f"Endpoint Sistema:  {s['ambiente']['endpoint_esperado']}",
        "",
        "=== 2. ID DPS (infDPS.Id) ===",
    ]
    for rotulo, doc in (("Bling", b), ("Sistema", s)):
        idd = doc["id_dps"]
        linhas.extend(
            [
                f"--- {rotulo} ---",
                f"  infDPS.Id:     {idd['valor']}",
                f"  tamanho:       {idd['tamanho']} (esperado 45)",
                f"  valido_formato:{idd['valido_formato']}",
                f"  cMun:          {idd['cMun']}",
                f"  tpInsc:        {idd['tpInsc']}",
                f"  CNPJ:          {idd['inscFederal']}",
                f"  serie (Id):    {idd['serie']}",
                f"  nDPS (Id):     {idd['nDPS_id']}",
                f"  serie (XML):   {idd['serie_elemento']}",
                f"  nDPS (XML):    {idd['nDPS_elemento']}",
                f"  id_recomposto: {idd.get('id_recomposto', '')}",
                f"  bate gerar_id_dps: {idd.get('bate_com_gerar_id_dps')}",
                "",
            ]
        )

    padrao_bling = b["id_dps"]["valido_formato"] and b["id_dps"].get("bate_com_gerar_id_dps")
    padrao_sis = s["id_dps"]["valido_formato"] and s["id_dps"].get("bate_com_gerar_id_dps")
    linhas.append(f"Padrao TSIdDPS Bling:   {'SIM' if padrao_bling else 'NAO/parcial'}")
    linhas.append(f"Padrao TSIdDPS Sistema: {'SIM' if padrao_sis else 'NAO/parcial'}")
    linhas.append("")

    sections = [
        ("3. NUMERACAO", "numeracao", ["serie", "nDPS", "dCompet", "dhEmi", "verAplic"]),
        ("4. PRESTADOR", "prestador", ["CNPJ", "IM", "fone", "email", "opSimpNac", "regEspTrib"]),
        ("5. TOMADOR", "tomador", ["CNPJ", "xNome", "fone", "email", "cMun", "CEP"]),
        ("6. SERVICO", "servico", ["cLocPrestacao", "cTribNac", "cTribMun", "xDescServ", "cNBS"]),
        ("7. VALORES", "valores", ["vServ", "tribISSQN", "tpRetISSQN", "pAliq", "indTotTrib", "vTotTrib"]),
    ]
    for titulo, key, fields in sections:
        linhas.append(f"=== {titulo} ===")
        for f in fields:
            bv = (b.get(key) or {}).get(f, "")
            sv = (s.get(key) or {}).get(f, "")
            mark = " =" if str(bv) == str(sv) else " !="
            linhas.append(f"  {f}:{mark} Bling={bv!r} | Sistema={sv!r}")
        linhas.append("")

    linhas.extend(
        [
            "=== 8. IBSCBS ===",
            f"  Bling presente:   {b['ibscbs'].get('presente')}",
            f"  Sistema presente: {s['ibscbs'].get('presente')}",
            f"  finNFSe Bling:    {b['ibscbs'].get('finNFSe', '—')}",
            f"  finNFSe Sistema:  {s['ibscbs'].get('finNFSe', '—')}",
            "",
            "=== 9. ASSINATURA DPS ===",
        ]
    )
    for rotulo, doc in (("Bling", b), ("Sistema", s)):
        sig = doc["assinatura_dps"]
        linhas.extend(
            [
                f"--- {rotulo} ---",
                f"  parent:              {sig.get('parent_element')}",
                f"  prefixos:            {sig.get('prefixos') or '0'}",
                f"  Canonicalization:    {sig.get('CanonicalizationMethod')}",
                f"  SignatureMethod:     {sig.get('SignatureMethod')}",
                f"  DigestMethod:        {sig.get('DigestMethod')}",
                f"  Reference.URI:       {sig.get('Reference_URI')}",
                f"  Transforms:          {sig.get('Transforms')}",
                f"  X509Certificate qty: {sig.get('X509Certificate_count')}",
                f"  X509 sizes (chars):  {sig.get('X509Certificate_chars')}",
                "",
            ]
        )

    linhas.extend(
        [
            "=== 10. DIFERENÇAS (todas) ===",
        ]
    )
    for d in resultado["diferencas"]:
        linhas.append(
            f"  [{d['score_e0714']:>2}] {d['secao']}.{d['campo']}: "
            f"Bling={d.get('bling')!r} | Sistema={d.get('sistema')!r}"
        )

    linhas.extend(
        [
            "",
            "=== TOP 5 DIFERENÇAS MAIS IMPORTANTES ===",
        ]
    )
    for i, d in enumerate(resultado["top5_diferencas"], 1):
        linhas.append(
            f"  {i}. [{d['score_e0714']}] {d['secao']}.{d['campo']}: "
            f"Bling={d.get('bling')!r} → Sistema={d.get('sistema')!r}"
        )

    mp = resultado["mais_provavel_e0714"]
    linhas.extend(
        [
            "",
            "=== CAUSA MAIS PROVÁVEL E0714 ===",
            f"  {mp['secao']}.{mp['campo']}" if mp else "  (sem diferenças detectadas)",
            "",
            "=== RECOMENDAÇÃO ===",
            resultado["recomendacao"],
            "",
            "=== NOTA ===",
            "Diferenças de dhEmi, nDPS e conteúdo da nota são esperadas entre emissões distintas.",
            "Foco E0714: perfil de assinatura, tpAmb, formato infDPS.Id e campos exigidos pelo validador.",
            "================================================================",
        ]
    )
    return "\n".join(linhas) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Comparar XML Bling vs sistema NFS-e Nacional")
    parser.add_argument(
        "bling",
        nargs="?",
        default=str(DEFAULT_BLING),
        help=f"XML Bling (default: {DEFAULT_BLING})",
    )
    parser.add_argument(
        "sistema",
        nargs="?",
        default=str(DEFAULT_SISTEMA),
        help=f"XML sistema (default: {DEFAULT_SISTEMA})",
    )
    args = parser.parse_args()

    bling_path = Path(args.bling).expanduser().resolve()
    sistema_path = Path(args.sistema).expanduser().resolve()

    if not bling_path.is_file():
        sys.stderr.write(f"Arquivo Bling não encontrado: {bling_path}\n")
        return 1
    if not sistema_path.is_file():
        sys.stderr.write(f"Arquivo sistema não encontrado: {sistema_path}\n")
        return 1

    DEBUG.mkdir(parents=True, exist_ok=True)
    resultado = comparar(bling_path, sistema_path)
    texto = _format_txt(resultado)
    REL_TXT.write_text(texto, encoding="utf-8")
    REL_JSON.write_text(json.dumps(resultado, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    sys.stdout.buffer.write(texto.encode("utf-8", errors="replace"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
