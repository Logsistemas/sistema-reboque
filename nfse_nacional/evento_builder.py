from datetime import datetime
from zoneinfo import ZoneInfo

from lxml import etree

from nfse_nacional.constants import NS, TP_AMB, VER_APLIC
from nfse_nacional.ids import gerar_id_evento_cancelamento, so_digitos


def _sub(el, tag, text=None):
    node = etree.SubElement(el, tag)
    if text is not None:
        node.text = str(text)
    return node


def _dh_evento():
    tz = ZoneInfo("America/Sao_Paulo")
    d = datetime.now(tz)
    s = d.strftime("%Y-%m-%dT%H:%M:%S%z")
    return s[:-2] + ":" + s[-2:]


def montar_evento_cancelamento(config, chave_acesso, motivo_descricao, codigo_motivo=1, seq=1):
    ambiente = (config.get("ambiente") or "homologacao").lower()
    tp_amb = str(TP_AMB.get(ambiente, 2))
    cnpj = so_digitos(config.get("cnpj"))
    if len(cnpj) != 14:
        raise ValueError("CNPJ do prestador inválido")
    x_motivo = (motivo_descricao or "Cancelamento solicitado pelo emitente").strip()
    if len(x_motivo) < 15:
        x_motivo = (x_motivo + " — conforme solicitado").strip()[:255]
    if len(x_motivo) < 15:
        x_motivo = "Cancelamento de NFS-e conforme solicitado pelo emitente."

    id_ped = gerar_id_evento_cancelamento(chave_acesso, seq)

    root = etree.Element("{%s}pedRegEvento" % NS, nsmap={None: NS})
    root.set("versao", VER_APLIC)
    inf = etree.SubElement(root, "{%s}infPedReg" % NS)
    inf.set("Id", id_ped)

    _sub(inf, "tpAmb", tp_amb)
    _sub(inf, "verAplic", VER_APLIC)
    _sub(inf, "dhEvento", _dh_evento())
    _sub(inf, "CNPJAutor", cnpj)
    _sub(inf, "chNFSe", so_digitos(chave_acesso))
    ev = _sub(inf, "e101101")
    _sub(ev, "xDesc", "Cancelamento de NFS-e")
    _sub(ev, "cMotivo", str(int(codigo_motivo)))
    _sub(ev, "xMotivo", x_motivo[:255])

    xml_str = etree.tostring(root, xml_declaration=True, encoding="UTF-8").decode("utf-8")
    return root, inf, id_ped, xml_str
