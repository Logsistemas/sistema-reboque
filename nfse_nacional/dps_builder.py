from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from lxml import etree

from nfse_nacional.constants import NS, TP_AMB, VERSAO_DPS, VER_APLIC
from nfse_nacional.ids import gerar_id_dps, pad_ndps, pad_serie, so_digitos


def _fmt_decimal(v, casas=2):
    return f"{Decimal(str(v or 0)):.{casas}f}"


def _dh_emi(dt=None):
    tz = ZoneInfo("America/Sao_Paulo")
    if dt is None:
        d = datetime.now(tz)
    elif isinstance(dt, date) and not isinstance(dt, datetime):
        d = datetime(dt.year, dt.month, dt.day, 12, 0, 0, tzinfo=tz)
    else:
        d = dt.astimezone(tz) if hasattr(dt, "astimezone") else datetime.now(tz)
    return d.strftime("%Y-%m-%dT%H:%M:%S%z")[:-2] + ":" + d.strftime("%Y-%m-%dT%H:%M:%S%z")[-2:]


def _regime_op_simp(regime):
    r = (regime or "").lower()
    if "mei" in r:
        return "2"
    if "simples" in r:
        return "3"
    return "1"


def _sub(el, tag, text=None):
    node = etree.SubElement(el, tag)
    if text is not None and str(text) != "":
        node.text = str(text)
    return node


def montar_dps_xml(config, nota, id_dps=None, n_dps=None):
    """Monta XML DPS (sem assinatura) a partir da config fiscal e nota de serviço."""
    ambiente = (config.get("ambiente") or "homologacao").lower()
    tp_amb = str(TP_AMB.get(ambiente, 2))
    c_mun = so_digitos(config.get("codigo_ibge_municipio")).zfill(7)[-7:]
    if not c_mun or c_mun == "0000000":
        raise ValueError("Código IBGE do município de emissão é obrigatório na Configuração Fiscal")
    cnpj_prest = so_digitos(config.get("cnpj"))
    if len(cnpj_prest) != 14:
        raise ValueError("CNPJ do prestador inválido na Configuração Fiscal")
    serie = pad_serie(nota.get("serie_rps") or "1")
    n_dps = pad_ndps(n_dps or nota.get("numero_rps") or "1")
    id_dps = id_dps or gerar_id_dps(c_mun, cnpj_prest, serie, n_dps)

    emissao = nota.get("data_emissao")
    if hasattr(emissao, "strftime"):
        d_compet = emissao.strftime("%Y-%m-%d")
    else:
        d_compet = str(emissao or date.today())[:10]

    itens = nota.get("itens") or []
    desc = "; ".join(
        (i.get("descricao") or "").strip() for i in itens if (i.get("descricao") or "").strip()
    ) or "Serviço prestado"
    if len(desc) > 2000:
        desc = desc[:2000]

    v_serv = _fmt_decimal(nota.get("total_nota") or nota.get("total_servicos") or 0)
    imp = nota.get("impostos") or {}
    ali_iss = imp.get("aliquota_iss") or config.get("aliquota_iss_padrao") or 0
    reter_iss = bool(imp.get("reter_iss"))
    tp_ret = "2" if reter_iss else "1"

    c_trib_nac = so_digitos(config.get("codigo_servico_nacional") or config.get("codigo_servico_municipal"))
    if not c_trib_nac:
        raise ValueError("Código de serviço nacional é obrigatório na Configuração Fiscal")
    c_trib_nac = c_trib_nac.zfill(6)[-6:]

    c_trib_mun = so_digitos(config.get("codigo_servico_municipal") or config.get("codigo_trib_municipal"))
    c_trib_mun = (c_trib_mun or "001").zfill(3)[-3:]

    cnae = so_digitos(config.get("cnae_principal") or imp.get("codigo_cnae"))
    nbs = so_digitos(imp.get("nbs") or "")

    dps = etree.Element("{%s}DPS" % NS, nsmap={None: NS})
    dps.set("versao", VERSAO_DPS)
    inf = etree.SubElement(dps, "{%s}infDPS" % NS)
    inf.set("Id", id_dps)

    _sub(inf, "tpAmb", tp_amb)
    _sub(inf, "dhEmi", _dh_emi())
    _sub(inf, "verAplic", VER_APLIC)
    _sub(inf, "serie", serie)
    _sub(inf, "nDPS", n_dps.lstrip("0") or "1")
    _sub(inf, "dCompet", d_compet)
    _sub(inf, "tpEmit", "1")
    _sub(inf, "cLocEmi", c_mun)

    prest = _sub(inf, "prest")
    _sub(prest, "CNPJ", cnpj_prest)
    if config.get("inscricao_municipal"):
        _sub(prest, "IM", so_digitos(config.get("inscricao_municipal")))
    reg = _sub(prest, "regTrib")
    _sub(reg, "opSimpNac", _regime_op_simp(config.get("regime_tributario")))
    _sub(reg, "regApTribSN", "1")
    _sub(reg, "regEspTrib", "0")

    doc_toma = so_digitos(nota.get("cliente_cnpj_cpf"))
    if doc_toma:
        toma = _sub(inf, "toma")
        if len(doc_toma) == 14:
            _sub(toma, "CNPJ", doc_toma)
        elif len(doc_toma) == 11:
            _sub(toma, "CPF", doc_toma)
        nome = (nota.get("cliente_nome") or "").strip()
        if nome:
            _sub(toma, "xNome", nome[:150])
        if nota.get("cliente_fone"):
            _sub(toma, "fone", so_digitos(nota.get("cliente_fone"))[:15])
        if nota.get("cliente_email"):
            _sub(toma, "email", str(nota.get("cliente_email"))[:80])

    serv = _sub(inf, "serv")
    loc = _sub(serv, "locPrest")
    loc_mun = so_digitos(nota.get("municipio_prestacao_ibge") or c_mun)
    _sub(loc, "cLocPrestacao", loc_mun.zfill(7)[-7:])
    cs = _sub(serv, "cServ")
    _sub(cs, "cTribNac", c_trib_nac)
    _sub(cs, "cTribMun", c_trib_mun)
    _sub(cs, "xDescServ", desc)
    if cnae:
        _sub(cs, "cCNAE", cnae[:7])
    if nbs:
        _sub(cs, "cNBS", nbs[:9])

    valores = _sub(inf, "valores")
    vsp = _sub(valores, "vServPrest")
    _sub(vsp, "vServ", v_serv)
    trib = _sub(valores, "trib")
    tm = _sub(trib, "tribMun")
    _sub(tm, "tribISSQN", "1")
    _sub(tm, "tpRetISSQN", tp_ret)
    if ali_iss:
        _sub(tm, "pAliq", _fmt_decimal(ali_iss, 2))
    tot = _sub(trib, "totTrib")
    if _regime_op_simp(config.get("regime_tributario")) == "3":
        _sub(tot, "pTotTribSN", _fmt_decimal(ali_iss or 6, 2))

    xml_bytes = etree.tostring(dps, xml_declaration=True, encoding="UTF-8")
    return dps, inf, id_dps, n_dps, xml_bytes.decode("utf-8")
