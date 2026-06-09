#!/usr/bin/env python3
"""
Diagnóstico E1228 — testa remoção do prefixo ds: na assinatura XMLDSIG
sem alterar emissão.

Uso:
    python scripts/test_nfse_sem_prefixo.py
"""
from __future__ import annotations

import difflib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lxml import etree

from nfse_nacional.constants import NS, NS_DS
from nfse_nacional.signature_flow_audit import verificar_assinatura

DEBUG_DIR = ROOT / "debug"
ORIGINAL = DEBUG_DIR / "nfse_assinada.xml"
SEM_PREFIXO = DEBUG_DIR / "nfse_assinada_sem_prefixo.xml"
RELATORIO = DEBUG_DIR / "resultado_teste_sem_prefixo.txt"


def _local(tag) -> str:
    return etree.QName(tag).localname


def _clonar_subarvore_xmldsig(origem: etree._Element, declarar_ns_raiz: bool = False) -> etree._Element:
    """Clona elemento XMLDSIG sem prefixo ds: (namespace default xmldsig#)."""
    if declarar_ns_raiz:
        novo = etree.Element(etree.QName(NS_DS, _local(origem.tag)), nsmap={None: NS_DS})
    else:
        novo = etree.Element(etree.QName(NS_DS, _local(origem.tag)))
    for k, v in origem.attrib.items():
        nome = etree.QName(k).localname if "}" in str(k) else k
        novo.set(nome, v)
    if origem.text:
        novo.text = origem.text
    for filho in origem:
        novo.append(_clonar_subarvore_xmldsig(filho, declarar_ns_raiz=False))
        if filho.tail:
            novo[-1].tail = filho.tail
    return novo


def _obter_signature(root: etree._Element) -> etree._Element | None:
    sig = root.find(f"{{{NS_DS}}}Signature")
    if sig is not None:
        return sig
    nodes = root.findall(f".//{{{NS_DS}}}Signature")
    return nodes[0] if nodes else None


def _signedinfo_c14n(root: etree._Element) -> str:
    sig = _obter_signature(root)
    if sig is None:
        return ""
    si = sig.find(f"{{{NS_DS}}}SignedInfo")
    if si is None:
        return ""
    return etree.tostring(si, method="c14n", exclusive=False, with_comments=False).decode(
        "utf-8", errors="replace"
    )


def criar_copia_sem_prefixo(xml_bytes: bytes) -> bytes:
    """
    Remove prefixo ds: do bloco Signature, declarando xmlns default xmldsig#
    apenas no elemento Signature. infDPS permanece intacto.
    """
    root = etree.fromstring(xml_bytes)
    sig = _obter_signature(root)
    if sig is None:
        raise ValueError("Signature não encontrada em nfse_assinada.xml")

    parent = sig.getparent()
    if parent is None:
        raise ValueError("Signature sem elemento pai")

    parent.remove(sig)
    parent.append(_clonar_subarvore_xmldsig(sig, declarar_ns_raiz=True))

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", pretty_print=False)


def _analise_prefixos(xml_bytes: bytes) -> dict:
    txt = xml_bytes.decode("utf-8")
    import re

    return {
        "tem_ds_prefixo": bool(re.search(r"<\s*/?\s*ds:", txt)),
        "tem_xmlns_ds": 'xmlns:ds=' in txt,
        "tem_signature_default_ns": 'Signature xmlns="http://www.w3.org/2000/09/xmldsig#"' in txt
        or "<Signature xmlns='http://www.w3.org/2000/09/xmldsig#'" in txt,
        "inicio": txt[:500],
    }


def _recomendacao(original_ok: bool, sem_prefixo_ok: bool) -> list[str]:
    linhas = ["", "=== RECOMENDAÇÃO PARA serializar_dps_assinado() ===", ""]
    if sem_prefixo_ok:
        linhas.extend(
            [
                "A assinatura PERMANECE VÁLIDA sem o prefixo ds:.",
                "",
                "Alterações sugeridas em serializar_dps_assinado():",
                "  1. Manter etree.tostring(dps_root) para infDPS (não reconstruir).",
                "  2. Apenas o bloco Signature pode ser re-serializado com:",
                "     - clonar subárvore XMLDSIG com nsmap={None: NS_DS} no elemento raiz Signature",
                "     - filhos no namespace xmldsig# sem prefixo ds:",
                "  3. NÃO alterar SignedInfo/DigestValue/SignatureValue — apenas namespace de serialização.",
                "  4. Executar XMLVerifier após a transformação (já implementado).",
            ]
        )
    else:
        linhas.extend(
            [
                "A assinatura NÃO permanece válida após remover o prefixo ds: post-assinatura.",
                "",
                "Conclusão:",
                "  - Não é possível remover ds: após signer.sign() sem recalcular SignatureValue.",
                "  - A canonicalização do SignedInfo inclui o contexto de namespaces com ds: prefix.",
                "",
                "Alternativas para resolver E1228 sem quebrar E0714:",
                "  A) Assinar já com Signature em namespace default (sem ds:) — exige ajuste no signxml",
                "     ANTES da assinatura, não após serializar_dps_assinado().",
                "  B) Negociar/validar se SEFIN aceita prefixo ds: (padrão XMLDSIG W3C).",
                "  C) Re-assinar após transformação de namespace (recalcular digest + signature).",
            ]
        )
    if original_ok and not sem_prefixo_ok:
        linhas.extend(
            [
                "",
                "Manter serialização atual (etree.tostring direto) para preservar assinatura.",
            ]
        )
    return linhas


def main() -> int:
    if not ORIGINAL.is_file():
        raise SystemExit(f"Arquivo não encontrado: {ORIGINAL}")

    xml_original = ORIGINAL.read_bytes()
    xml_sem_prefixo = criar_copia_sem_prefixo(xml_original)

    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    SEM_PREFIXO.write_bytes(xml_sem_prefixo)

    ok_original, err_original = verificar_assinatura(xml_original)
    ok_sem, err_sem = verificar_assinatura(xml_sem_prefixo)

    c14n_orig = _signedinfo_c14n(etree.fromstring(xml_original))
    c14n_sem = _signedinfo_c14n(etree.fromstring(xml_sem_prefixo))
    c14n_igual = c14n_orig == c14n_sem

    info_orig = _analise_prefixos(xml_original)
    info_sem = _analise_prefixos(xml_sem_prefixo)

    linhas = [
        "==================================",
        "TESTE REMOÇÃO PREFIXO ds: (E1228)",
        "==================================",
        "",
        f"Arquivo original:     {ORIGINAL}",
        f"Arquivo experimental: {SEM_PREFIXO}",
        "",
        f"Assinatura original válida:    {ok_original}",
    ]
    if err_original:
        linhas.append(f"  Erro original: {err_original}")
    linhas.append(f"Assinatura sem prefixo válida: {ok_sem}")
    if err_sem:
        linhas.append(f"  Erro sem prefixo: {err_sem}")
    linhas.extend(
        [
            "",
            "--- Análise original ---",
            f"  ds: prefixo em tags: {info_orig['tem_ds_prefixo']}",
            f"  xmlns:ds declarado:  {info_orig['tem_xmlns_ds']}",
            "",
            "--- Análise sem prefixo ---",
            f"  ds: prefixo em tags: {info_sem['tem_ds_prefixo']}",
            f"  xmlns:ds declarado:  {info_sem['tem_xmlns_ds']}",
            f"  Signature xmlns default xmldsig#: {info_sem['tem_signature_default_ns']}",
            "",
            f"SignedInfo c14n idêntico: {c14n_igual}",
        ]
    )

    if not c14n_igual:
        linhas.append("")
        linhas.append("--- Diff SignedInfo canonical (original vs sem prefixo) ---")
        diff = difflib.unified_diff(
            c14n_orig.splitlines(),
            c14n_sem.splitlines(),
            fromfile="original",
            tofile="sem_prefixo",
            lineterm="",
        )
        for ln in list(diff)[:40]:
            linhas.append(f"  {ln}")
        linhas.append(f"  (tamanho original={len(c14n_orig)} sem_prefixo={len(c14n_sem)})")

    linhas.extend(_recomendacao(ok_original, ok_sem))

    texto = "\n".join(linhas)
    RELATORIO.write_text(texto + "\n", encoding="utf-8")
    print(texto)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
