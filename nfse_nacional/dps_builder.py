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
    ns = NS
    if el.tag.startswith("{"):
        ns = el.tag[1 : el.tag.index("}")]
    node = etree.SubElement(el, f"{{{ns}}}{tag}")
    if text is not None and str(text) != "":
        node.text = str(text)
    return node


def extrair_trecho_cserv(dps_root):
    """Retorna XML do grupo cServ (para log/debug antes do envio)."""
    cs = dps_root.find(f".//{{{NS}}}cServ")
    if cs is None:
        return ""
    return etree.tostring(cs, encoding="unicode", pretty_print=False)


def extrair_codigos_cserv(dps_root):
    """Retorna cTribNac, cTribMun (vazio se ausente) e NBS do grupo cServ."""
    cs = dps_root.find(f".//{{{NS}}}cServ")
    if cs is None:
        return {"cTribNac": "", "cTribMun": "", "NBS": ""}

    def _txt(tag):
        el = cs.find(f"{{{NS}}}{tag}")
        return (el.text or "").strip() if el is not None else ""

    return {"cTribNac": _txt("cTribNac"), "cTribMun": _txt("cTribMun"), "NBS": _txt("cNBS")}


def extrair_trecho_tributos(dps_root):
    """Retorna XML do grupo trib/valores (tributos) para log antes do envio."""
    trib = dps_root.find(f".//{{{NS}}}trib")
    if trib is None:
        return ""
    return etree.tostring(trib, encoding="unicode", pretty_print=False)


def _campo_preenchido(val):
    return bool(str(val or "").strip())


def _resolver_c_trib_mun(config, nota, imp):
    """
    cTribMun (0-1): só quando informado explicitamente na nota ou config.
    Não deriva do código nacional; exige exatamente 3 dígitos (TCCodTribMun).
    """
    for fonte in (
        nota.get("codigo_trib_municipal"),
        nota.get("codigo_servico_municipal"),
        imp.get("codigo_trib_municipal"),
        imp.get("codigo_servico_municipal"),
        config.get("codigo_trib_municipal"),
        config.get("codigo_servico_municipal"),
    ):
        if not _campo_preenchido(fonte):
            continue
        cod = so_digitos(fonte)
        if len(cod) == 3:
            return cod
    return None


def _tem_valor(v):
    if v is None or v == "":
        return False
    try:
        return float(v) != 0
    except (TypeError, ValueError):
        return bool(str(v).strip())


def _montar_tot_trib(trib, config, imp, ali_iss):
    """
    totTrib é obrigatório no schema (1-1). Choice interno:
    vTotTrib | pTotTrib | indTotTrib | pTotTribSN.
    """
    op_simp = _regime_op_simp(config.get("regime_tributario"))

    v_fed = imp.get("v_tot_trib_fed")
    v_est = imp.get("v_tot_trib_est")
    v_mun = imp.get("v_tot_trib_mun")
    p_fed = imp.get("p_tot_trib_fed")
    p_est = imp.get("p_tot_trib_est")
    p_mun = imp.get("p_tot_trib_mun")
    ind = imp.get("ind_tot_trib")
    p_sn = imp.get("p_tot_trib_sn")

    has_v = _tem_valor(v_fed) or _tem_valor(v_est) or _tem_valor(v_mun)
    has_p = _tem_valor(p_fed) or _tem_valor(p_est) or _tem_valor(p_mun)
    has_ind = ind is not None and str(ind).strip() != ""

    if op_simp == "3" and not p_sn and _tem_valor(ali_iss):
        p_sn = ali_iss
    has_p_sn = op_simp == "3" and _tem_valor(p_sn)

    tot = _sub(trib, "totTrib")

    if has_v:
        vt = _sub(tot, "vTotTrib")
        _sub(vt, "vTotTribFed", _fmt_decimal(v_fed or 0, 2))
        _sub(vt, "vTotTribEst", _fmt_decimal(v_est or 0, 2))
        _sub(vt, "vTotTribMun", _fmt_decimal(v_mun or 0, 2))
    elif has_p:
        pt = _sub(tot, "pTotTrib")
        _sub(pt, "pTotTribFed", _fmt_decimal(p_fed or 0, 2))
        _sub(pt, "pTotTribEst", _fmt_decimal(p_est or 0, 2))
        _sub(pt, "pTotTribMun", _fmt_decimal(p_mun or 0, 2))
    elif has_p_sn:
        _sub(tot, "pTotTribSN", _fmt_decimal(p_sn, 2))
    else:
        _sub(tot, "indTotTrib", str(ind).strip() if has_ind else "0")

    return tot


def _tem_trib_fed(imp):
    if imp.get("reter_csll_pis_cofins") or imp.get("reter_inss"):
        return True
    for chave in (
        "v_ret_cp",
        "v_ret_irrf",
        "v_ret_csll",
        "v_pis",
        "v_cofins",
        "p_aliq_pis",
        "p_aliq_cofins",
        "v_bc_pis_cofins",
    ):
        if _tem_valor(imp.get(chave)):
            return True
    cst = str(imp.get("cst_pis_cofins") or "").strip()
    return bool(cst and cst not in ("00", "0"))


def _montar_trib_fed(trib, imp, v_serv):
    """tribFed (0-1) — PIS/COFINS e retenções federais quando informadas na nota."""
    if not _tem_trib_fed(imp):
        return None

    tf = _sub(trib, "tribFed")
    cst = str(imp.get("cst_pis_cofins") or "00").zfill(2)[-2:]
    pc = _sub(tf, "piscofins")
    _sub(pc, "CST", cst)

    v_bc = imp.get("v_bc_pis_cofins") or v_serv
    if cst in ("01", "02", "03", "04", "05", "06", "07") or (
        cst in ("49", "99") and _tem_valor(v_bc)
    ):
        _sub(pc, "vBCPisCofins", _fmt_decimal(v_bc, 2))
    if _tem_valor(imp.get("p_aliq_pis")):
        _sub(pc, "pAliqPis", _fmt_decimal(imp.get("p_aliq_pis"), 2))
    if _tem_valor(imp.get("p_aliq_cofins")):
        _sub(pc, "pAliqCofins", _fmt_decimal(imp.get("p_aliq_cofins"), 2))
    if _tem_valor(imp.get("v_pis")):
        _sub(pc, "vPis", _fmt_decimal(imp.get("v_pis"), 2))
    if _tem_valor(imp.get("v_cofins")):
        _sub(pc, "vCofins", _fmt_decimal(imp.get("v_cofins"), 2))
    if imp.get("reter_csll_pis_cofins"):
        _sub(pc, "tpRetPisCofins", "1")

    if _tem_valor(imp.get("v_ret_cp")):
        _sub(tf, "vRetCP", _fmt_decimal(imp.get("v_ret_cp"), 2))
    if _tem_valor(imp.get("v_ret_irrf")):
        _sub(tf, "vRetIRRF", _fmt_decimal(imp.get("v_ret_irrf"), 2))
    if _tem_valor(imp.get("v_ret_csll")):
        _sub(tf, "vRetCSLL", _fmt_decimal(imp.get("v_ret_csll"), 2))

    return tf


def _montar_bloco_tributos(trib, config, imp, ali_iss, tp_ret, v_serv):
    """
    Ordem schema TCInfoTributacao: tribMun → tribFed (opcional) → totTrib (obrigatório).
    """
    tm = _sub(trib, "tribMun")
    _sub(tm, "tribISSQN", "1")
    _sub(tm, "tpRetISSQN", tp_ret)
    if ali_iss:
        _sub(tm, "pAliq", _fmt_decimal(ali_iss, 2))

    _montar_trib_fed(trib, imp, v_serv)
    _montar_tot_trib(trib, config, imp, ali_iss)


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

    c_trib_nac = so_digitos(config.get("codigo_servico_nacional"))
    if not c_trib_nac:
        raise ValueError("Código de serviço nacional é obrigatório na Configuração Fiscal")
    c_trib_nac = c_trib_nac.zfill(6)[-6:]

    c_trib_mun = _resolver_c_trib_mun(config, nota, imp)

    nbs = so_digitos(imp.get("nbs") or "")
    c_int_contrib = (imp.get("codigo_interno_contrib") or imp.get("codigo_interno") or "").strip()

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
    op_simp = _regime_op_simp(config.get("regime_tributario"))
    _sub(reg, "opSimpNac", op_simp)
    if op_simp == "3":
        _sub(reg, "regApTribSN", str(imp.get("reg_ap_trib_sn") or config.get("reg_ap_trib_sn") or "1"))
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
    if c_trib_mun:
        _sub(cs, "cTribMun", c_trib_mun)
    _sub(cs, "xDescServ", desc)
    if nbs:
        _sub(cs, "cNBS", nbs.zfill(9)[-9:])
    if c_int_contrib:
        _sub(cs, "cIntContrib", c_int_contrib[:20])

    valores = _sub(inf, "valores")
    vsp = _sub(valores, "vServPrest")
    _sub(vsp, "vServ", v_serv)
    trib = _sub(valores, "trib")
    _montar_bloco_tributos(trib, config, imp, ali_iss, tp_ret, v_serv)

    xml_bytes = etree.tostring(dps, xml_declaration=True, encoding="UTF-8")
    return dps, inf, id_dps, n_dps, xml_bytes.decode("utf-8")
