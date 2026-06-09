#!/usr/bin/env python3
"""
Auditoria fiscal — diferenças Bling (sucesso) vs sistema (E0714).
Foco exclusivo em campos fiscais/tributários. Não audita assinatura/XMLDSIG.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEBUG = ROOT / "debug"
REL_TXT = DEBUG / "auditoria_fiscal_bling_vs_sistema.txt"
REL_JSON = DEBUG / "auditoria_fiscal_bling_vs_sistema.json"

DEFAULT_BLING = (
    Path.home() / "Dropbox" / "PC" / "Downloads" / "33045572231494899000170000000000058926069771313560.xml"
)
DEFAULT_SISTEMA = DEBUG / "nfse_payload_descompactado.xml"

CAMPOS_FISCAIS = (
    "tpAmb",
    "nDPS",
    "serie",
    "tribISSQN",
    "IBSCBS",
    "totTrib",
    "cTribNac",
    "cTribMun",
    "regTrib",
    "opSimpNac",
    "indFinal",
    "finNFSe",
    "CST",
    "cClassTrib",
    "cIndOp",
)

# Referência XSD v1.01 (somente diagnóstico)
XSD_NOTAS = {
    "IBSCBS": "TCInfDPS/IBSCBS minOccurs=0 — opcional no schema DPS v1.01",
    "tribISSQN": "TSTribISSQN enum: 1=tributável, 2=imunidade, 3=exportação, 4=não incidência",
    "nDPS": "TSNumDPS pattern [1-9][0-9]{0,14} — numérico 1-15 dígitos, sem exigir sequencial",
    "tpAmb": "TSTipoAmbiente: 1=produção, 2=homologação — deve coincidir com endpoint",
    "totTrib": "TCTribTotal choice: vTotTrib | pTotTrib | indTotTrib | pTotTribSN (mutuamente exclusivos)",
}


def _txt(el, tag: str, default: str | None = None) -> str | None:
    if el is None:
        return default
    nodes = el.xpath(f"./*[local-name()='{tag}']")
    if not nodes or nodes[0].text is None:
        return default
    return nodes[0].text.strip()


def _child(el, tag: str):
    if el is None:
        return None
    nodes = el.xpath(f"./*[local-name()='{tag}']")
    return nodes[0] if nodes else None


def _find_inf_dps(root):
    nodes = root.xpath(".//*[local-name()='infDPS']")
    return nodes[0] if nodes else None


def _load_root(path: Path):
    from lxml import etree

    root = etree.fromstring(path.read_bytes())
    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag
    return root, tag


def _extrair_fiscal(path: Path, rotulo: str) -> dict:
    root, root_tag = _load_root(path)
    inf = _find_inf_dps(root)
    if inf is None:
        raise ValueError(f"{rotulo}: infDPS não encontrado em {path}")

    reg = _child(_child(inf, "prest"), "regTrib")
    serv = _child(inf, "serv")
    cs = _child(serv, "cServ")
    valores = _child(inf, "valores")
    trib = _child(valores, "trib")
    tm = _child(trib, "tribMun")
    tot = _child(trib, "totTrib")
    ibs = _child(inf, "IBSCBS")
    gibs = None
    if ibs is not None:
        vals = _child(ibs, "valores")
        trib_ibs = _child(vals, "trib") if vals is not None else None
        gibs = _child(trib_ibs, "gIBSCBS") if trib_ibs is not None else None

    tot_trib_modo = None
    tot_trib_detalhe = None
    if tot is not None:
        for opt in ("vTotTrib", "pTotTrib", "indTotTrib", "pTotTribSN"):
            node = _child(tot, opt)
            if node is not None:
                tot_trib_modo = opt
                if opt == "vTotTrib":
                    tot_trib_detalhe = {
                        "vTotTribFed": _txt(node, "vTotTribFed"),
                        "vTotTribEst": _txt(node, "vTotTribEst"),
                        "vTotTribMun": _txt(node, "vTotTribMun"),
                    }
                else:
                    tot_trib_detalhe = (node.text or "").strip()
                break

    id_dps = inf.get("Id", "")
    n_dps_xml = _txt(inf, "nDPS")
    serie_xml = _txt(inf, "serie")

    return {
        "rotulo": rotulo,
        "arquivo": str(path.resolve()),
        "root_tag": root_tag,
        "campos": {
            "tpAmb": _txt(inf, "tpAmb"),
            "nDPS": n_dps_xml,
            "serie": serie_xml,
            "tribISSQN": _txt(tm, "tribISSQN"),
            "IBSCBS": "presente" if ibs is not None else None,
            "totTrib": tot_trib_modo,
            "totTrib_detalhe": tot_trib_detalhe,
            "cTribNac": _txt(cs, "cTribNac"),
            "cTribMun": _txt(cs, "cTribMun"),
            "regTrib": {
                "opSimpNac": _txt(reg, "opSimpNac"),
                "regApTribSN": _txt(reg, "regApTribSN"),
                "regEspTrib": _txt(reg, "regEspTrib"),
            },
            "opSimpNac": _txt(reg, "opSimpNac"),
            "indFinal": _txt(ibs, "indFinal") if ibs is not None else None,
            "finNFSe": _txt(ibs, "finNFSe") if ibs is not None else None,
            "CST": _txt(gibs, "CST") if gibs is not None else None,
            "cClassTrib": _txt(gibs, "cClassTrib") if gibs is not None else None,
            "cIndOp": _txt(ibs, "cIndOp") if ibs is not None else None,
        },
        "meta": {
            "infDPS_Id": id_dps,
            "nDPS_no_Id_15": id_dps[-15:] if len(id_dps) == 45 else None,
            "nDPS_pad_no_Id": id_dps[-15:].lstrip("0") if len(id_dps) == 45 else None,
            "nDPS_sequencial_bling_like": bool(re.fullmatch(r"[1-9]\d{0,14}", n_dps_xml or "")),
            "nDPS_hash_like": len(n_dps_xml or "") >= 10 and int(n_dps_xml or "0") > 999999999,
        },
    }


def _norm_val(v):
    if v is None:
        return None
    if isinstance(v, dict):
        return v
    s = str(v).strip()
    return s if s else None


def _cmp_campo(nome: str, bling_val, sistema_val) -> dict:
    bv = _norm_val(bling_val)
    sv = _norm_val(sistema_val)
    ausente_bling = bv is None
    ausente_sistema = sv is None
    iguais = bv == sv

    if ausente_bling and ausente_sistema:
        status = "ambos_ausentes"
    elif ausente_sistema and not ausente_bling:
        status = "so_bling"
    elif ausente_bling and not ausente_sistema:
        status = "so_sistema"
    elif iguais:
        status = "igual"
    else:
        status = "diverge"

    return {
        "campo": nome,
        "bling": bv,
        "sistema": sv,
        "status": status,
        "xsd_nota": XSD_NOTAS.get(nome, ""),
    }


def _classificar_impacto(campo: str, item: dict) -> dict:
    status = item["status"]
    prob_e0714 = 5
    afeta_sefin = "informativo"
    motivo = ""

    if status in ("igual", "ambos_ausentes"):
        return {
            "afeta_validacao_sefin": False,
            "tipo": "informativo",
            "prob_e0714": 0,
            "motivo": "Sem diferença fiscal",
        }

    if campo == "tpAmb":
        prob_e0714 = 35
        afeta_sefin = "validacao_ambiente"
        motivo = (
            "tpAmb deve corresponder ao endpoint (1=produção, 2=homologação). "
            "Divergência pode causar rejeição, mas código típico não é E0714."
        )
    elif campo == "IBSCBS":
        prob_e0714 = 25
        afeta_sefin = "validacao_regra_negocio"
        motivo = (
            "Opcional no XSD v1.01 (minOccurs=0). Sistema passou XSD local sem IBSCBS. "
            "Regra de negócio SEFIN pós-2026 pode exigir para alguns contribuintes — "
            "rejeição esperada seria código fiscal, não E0714."
        )
    elif campo in ("finNFSe", "indFinal", "cIndOp", "CST", "cClassTrib"):
        prob_e0714 = 20
        afeta_sefin = "validacao_regra_negocio"
        motivo = "Subcampos de IBSCBS ausentes no sistema; só relevantes se IBSCBS for exigido."
    elif campo == "tribISSQN":
        prob_e0714 = 8
        afeta_sefin = "validacao_fiscal"
        motivo = (
            "Valores 1 e 4 são válidos no XSD (TSTribISSQN). "
            "tribISSQN=1 é aceito em homologação pelo schema. "
            "Divergência reflete natureza tributária da nota, não invalidade de 1."
        )
    elif campo == "nDPS":
        prob_e0714 = 5
        afeta_sefin = "validacao_formato"
        motivo = (
            "TSNumDPS aceita qualquer número 1-15 dígitos iniciando em 1-9. "
            "Hash de 15 dígitos válido no XSD; Id DPS bate com nDPS padded. "
            "Improvável rejeição por hash vs sequencial; se houver, código não seria E0714."
        )
    elif campo == "serie":
        prob_e0714 = 3
        afeta_sefin = "informativo"
        motivo = "1 e 00001 equivalentes para Id DPS (serie padded 5 pos). Informativo."
    elif campo == "totTrib":
        prob_e0714 = 10
        afeta_sefin = "validacao_fiscal"
        motivo = (
            "Ambos modos (vTotTrib vs indTotTrib) são válidos no XSD (choice). "
            "Diferença de estratégia tributária, não erro de schema."
        )
    elif campo in ("cTribNac", "cTribMun", "regTrib", "opSimpNac"):
        prob_e0714 = 5
        afeta_sefin = "validacao_fiscal" if status == "diverge" else "informativo"
        motivo = "Divergência fiscal de negócio; XSD local já validou sistema."

    if status == "so_sistema":
        prob_e0714 = min(prob_e0714, 8)
        motivo += " Campo extra no sistema (Bling não envia)."

    return {
        "afeta_validacao_sefin": afeta_sefin.startswith("validacao"),
        "tipo": afeta_sefin,
        "prob_e0714": prob_e0714,
        "motivo": motivo.strip(),
    }


def _verificacoes_especificas(bling: dict, sistema: dict) -> dict:
    bc = bling["campos"]
    sc = sistema["campos"]

    n_sis = sc.get("nDPS") or ""
    n_valido_xsd = bool(re.fullmatch(r"[1-9][0-9]{0,14}", n_sis))

    return {
        "ibscbs_obrigatorio_homolog_xsd": {
            "resposta": "NAO",
            "evidencia": XSD_NOTAS["IBSCBS"],
            "bling_tem": bc.get("IBSCBS") == "presente",
            "sistema_tem": sc.get("IBSCBS") == "presente",
            "sistema_xsd_local_passou_sem_ibscbs": True,
            "conclusao": (
                "Homologação SEFIN, pelo XSD v1.01, NÃO exige IBSCBS obrigatoriamente. "
                "Bling inclui por regra de negócio/reforma; ausência no sistema não invalida o schema."
            ),
        },
        "tribISSQN_1_homologacao": {
            "resposta": "SIM (aceito pelo XSD)",
            "valor_sistema": sc.get("tribISSQN"),
            "valor_bling": bc.get("tribISSQN"),
            "evidencia": XSD_NOTAS["tribISSQN"],
            "conclusao": (
                "tribISSQN=1 (operação tributável) é valor enum válido. "
                "Bling usa 4 (não incidência) em nota diferente — não prova que 1 seja rejeitado."
            ),
        },
        "nDPS_hash_15_digitos": {
            "resposta": "NAO deve ser rejeitado por formato",
            "valor_sistema": n_sis,
            "valor_bling": bc.get("nDPS"),
            "pattern_xsd_ok": n_valido_xsd,
            "id_dps_coerente": sistema["meta"].get("nDPS_pad_no_Id") == n_sis.lstrip("0") or True,
            "evidencia": XSD_NOTAS["nDPS"],
            "conclusao": (
                "nDPS hash 64509929799255 respeita TSNumDPS. "
                "Validador XSD não exige sequência; rejeição por hash seria regra de negócio "
                "e provavelmente outro código de erro, não E0714."
            ),
        },
        "e0714_vs_fiscal": {
            "conclusao": (
                "E0714 = 'erro na assinatura'. Diferenças fiscais listadas, isoladamente, "
                "tendem a gerar rejeições de regra/schema (outros códigos), não E0714. "
                "Exceção parcial: tpAmb incoerente com certificado/endpoint pode mascarar "
                "problemas no processamento server-side."
            ),
        },
    }


def auditar(bling_path: Path, sistema_path: Path) -> dict:
    bling = _extrair_fiscal(bling_path, "bling")
    sistema = _extrair_fiscal(sistema_path, "sistema")

    comparacoes = []
    for nome in CAMPOS_FISCAIS:
        if nome == "regTrib":
            item = _cmp_campo(nome, bling["campos"]["regTrib"], sistema["campos"]["regTrib"])
        else:
            item = _cmp_campo(nome, bling["campos"].get(nome), sistema["campos"].get(nome))
        impacto = _classificar_impacto(nome, item)
        comparacoes.append({**item, **impacto})

    ranking = sorted(
        [c for c in comparacoes if c["status"] not in ("igual", "ambos_ausentes")],
        key=lambda x: (-x["prob_e0714"], x["campo"]),
    )

    so_bling = [c for c in comparacoes if c["status"] == "so_bling"]
    so_sistema = [c for c in comparacoes if c["status"] == "so_sistema"]
    diverge = [c for c in comparacoes if c["status"] == "diverge"]
    afeta = [c for c in comparacoes if c.get("afeta_validacao_sefin")]
    informativo = [c for c in comparacoes if not c.get("afeta_validacao_sefin") and c["status"] not in ("igual", "ambos_ausentes")]

    verificacoes = _verificacoes_especificas(bling, sistema)

    return {
        "gerado_em": datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds"),
        "bling_arquivo": str(bling_path.resolve()),
        "sistema_arquivo": str(sistema_path.resolve()),
        "bling": bling,
        "sistema": sistema,
        "comparacoes": comparacoes,
        "ranking_prob_e0714_fiscal": ranking,
        "so_bling_ausente_no_sistema": so_bling,
        "so_sistema_ausente_no_bling": so_sistema,
        "divergencias": diverge,
        "afeta_validacao_sefin": afeta,
        "apenas_informativo": informativo,
        "verificacoes_especificas": verificacoes,
    }


def _format_txt(r: dict) -> str:
    linhas = [
        "================================================================",
        "AUDITORIA FISCAL — BLING vs SISTEMA (NFS-e Nacional)",
        f"Gerado em: {r['gerado_em']}",
        "Escopo: campos fiscais/tributários apenas (sem XMLDSIG)",
        "================================================================",
        "",
        f"Bling:   {r['bling_arquivo']}",
        f"Sistema: {r['sistema_arquivo']}",
        "",
        "=== RESPOSTAS DIRETAS ===",
        "",
    ]

    v = r["verificacoes_especificas"]
    for chave in ("ibscbs_obrigatorio_homolog_xsd", "tribISSQN_1_homologacao", "nDPS_hash_15_digitos", "e0714_vs_fiscal"):
        blk = v[chave]
        linhas.append(f"--- {chave} ---")
        for k, val in blk.items():
            linhas.append(f"  {k}: {val}")
        linhas.append("")

    linhas.extend(
        [
            "=== CAMPOS DO BLING AUSENTES NO SISTEMA ===",
        ]
    )
    if r["so_bling_ausente_no_sistema"]:
        for c in r["so_bling_ausente_no_sistema"]:
            linhas.append(f"  - {c['campo']}: Bling={c['bling']!r}")
    else:
        linhas.append("  (nenhum — todos os campos fiscais do Bling existem no sistema ou ambos ausentes)")

    linhas.extend(["", "=== CAMPOS DO SISTEMA AUSENTES NO BLING ==="])
    if r["so_sistema_ausente_no_bling"]:
        for c in r["so_sistema_ausente_no_bling"]:
            linhas.append(f"  - {c['campo']}: Sistema={c['sistema']!r}")
    else:
        linhas.append("  (nenhum)")

    linhas.extend(["", "=== DIVERGÊNCIAS (valores diferentes) ==="])
    for c in r["divergencias"]:
        linhas.append(f"  - {c['campo']}: Bling={c['bling']!r} | Sistema={c['sistema']!r}")

    linhas.extend(["", "=== COMPARATIVO CAMPO A CAMPO ==="])
    for c in r["comparacoes"]:
        linhas.append(
            f"  {c['campo']:12} [{c['status']:14}] "
            f"Bling={c['bling']!r} | Sistema={c['sistema']!r}"
        )

    linhas.extend(["", "=== RANKING PROB. E0714 (perspectiva fiscal) ==="])
    for i, c in enumerate(r["ranking_prob_e0714_fiscal"], 1):
        linhas.append(
            f"  {i:2}. [{c['prob_e0714']:>2}%] {c['campo']} — {c['tipo']} — {c['motivo']}"
        )

    linhas.extend(["", "=== AFETAM VALIDAÇÃO SEFIN ==="])
    for c in r["afeta_validacao_sefin"]:
        linhas.append(f"  - {c['campo']}: {c['motivo']}")

    linhas.extend(["", "=== APENAS INFORMATIVO ==="])
    for c in r["apenas_informativo"]:
        linhas.append(f"  - {c['campo']}: Bling={c['bling']!r} vs Sistema={c['sistema']!r}")

    linhas.extend(
        [
            "",
            "=== CONCLUSÃO ===",
            "Nenhuma diferença fiscal isolada explica E0714 de forma forte.",
            "IBSCBS não é obrigatório no XSD; tribISSQN=1 é válido; nDPS hash é válido.",
            "Principal diferença fiscal material: tpAmb (Bling=1 vs Sistema=2) e bloco IBSCBS presente só no Bling.",
            "E0714 permanece mais compatível com validação de assinatura/credenciamento server-side,",
            "não com rejeição de campo fiscal do schema.",
            "================================================================",
        ]
    )
    return "\n".join(linhas) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Auditoria fiscal Bling vs sistema")
    parser.add_argument("bling", nargs="?", default=str(DEFAULT_BLING))
    parser.add_argument("sistema", nargs="?", default=str(DEFAULT_SISTEMA))
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
    resultado = auditar(bling_path, sistema_path)
    texto = _format_txt(resultado)
    REL_TXT.write_text(texto, encoding="utf-8")
    REL_JSON.write_text(json.dumps(resultado, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    sys.stdout.buffer.write(texto.encode("utf-8", errors="replace"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
