import re
from lxml import etree

from nfse_nacional.constants import DANFSE_BASE, NS
from nfse_nacional.client import gunzip_b64


def _txt(el, path, ns=NS):
    if el is None:
        return ""
    found = el.find(path, namespaces={"n": ns}) if "{" not in path else el.find(path)
    if found is None:
        found = el.find(f".//n:{path.split('}')[-1]}", namespaces={"n": ns}) if "}" in path else el.find(f".//{path}")
    return (found.text or "").strip() if found is not None else ""


def extrair_dados_nfse_xml(xml_str):
    out = {
        "numero_nfse": "",
        "codigo_verificacao": "",
        "chave_acesso": "",
    }
    if not xml_str:
        return out
    try:
        root = etree.fromstring(xml_str.encode("utf-8"))
    except Exception:
        return out
    nsmap = root.nsmap.get(None) or NS
    # nNFSe, cVerif, chNFSe ou similar
    for tag in ("nNFSe", "nDFSe", "nNFS"):
        nodes = root.findall(f".//{{{nsmap}}}{tag}")
        if nodes and nodes[0].text:
            out["numero_nfse"] = nodes[0].text.strip()
            break
    for tag in ("cVerif", "cDV", "codVerif"):
        nodes = root.findall(f".//{{{nsmap}}}{tag}")
        if nodes and nodes[0].text:
            out["codigo_verificacao"] = nodes[0].text.strip()
            break
    for tag in ("chNFSe", "chaveAcesso", "infNFSe"):
        nodes = root.findall(f".//{{{nsmap}}}{tag}")
        for n in nodes:
            if n.text and len(re.sub(r"\D", "", n.text)) >= 50:
                out["chave_acesso"] = re.sub(r"\D", "", n.text)[:50]
                break
            ch = n.get("Id") or n.get("id")
            if ch and len(re.sub(r"\D", "", ch)) >= 50:
                out["chave_acesso"] = re.sub(r"\D", "", ch)[:50]
                break
    return out


def processar_resposta_emissao(resposta_api, ambiente):
    amb = (ambiente or "homologacao").lower()
    chave = resposta_api.get("chaveAcesso") or resposta_api.get("chave_acesso") or ""
    id_dps = resposta_api.get("idDps") or resposta_api.get("idDPS") or ""
    protocolo = resposta_api.get("dataHoraProcessamento") or id_dps
    xml_nfse = ""
    if resposta_api.get("nfseXmlGZipB64"):
        xml_nfse = gunzip_b64(resposta_api["nfseXmlGZipB64"])
    dados = extrair_dados_nfse_xml(xml_nfse)
    if chave:
        dados["chave_acesso"] = re.sub(r"\D", "", str(chave))[:50]
    link = ""
    if dados.get("chave_acesso"):
        base = DANFSE_BASE.get(amb, DANFSE_BASE["homologacao"])
        link = f"{base}/{dados['chave_acesso']}"
    if not dados.get("codigo_verificacao") and dados.get("chave_acesso"):
        dados["codigo_verificacao"] = dados["chave_acesso"][-8:]
    return {
        "chave_acesso": dados.get("chave_acesso") or "",
        "numero_nfse": dados.get("numero_nfse") or "",
        "codigo_verificacao": dados.get("codigo_verificacao") or "",
        "protocolo": protocolo or "",
        "id_dps": id_dps or "",
        "link_nfse": link,
        "xml_retorno": xml_nfse,
    }
