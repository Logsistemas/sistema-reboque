import logging
from lxml import etree

from nfse_nacional.client import NfseNacionalClient, NfseNacionalErro
from nfse_nacional.constants import NS_DS
from nfse_nacional.dps_builder import montar_dps_xml
from nfse_nacional.evento_builder import montar_evento_cancelamento
from nfse_nacional.ids import ndps_deterministico, so_digitos
from nfse_nacional.parser import processar_resposta_emissao
from nfse_nacional.signer import carregar_pfx, extrair_cnpj_certificado

log = logging.getLogger("financeiro.nfse.nacional")


def _doc_cliente_valido(doc):
    d = so_digitos(doc)
    if not d:
        return False, "Cliente sem CPF/CNPJ"
    if len(d) == 11:
        if d == d[0] * 11:
            return False, "CPF do cliente inválido"
        return True, ""
    if len(d) == 14:
        if d == d[0] * 14:
            return False, "CNPJ do cliente inválido"
        return True, ""
    return False, "CPF/CNPJ do cliente deve ter 11 ou 14 dígitos"


def _aliquota_iss_nota(nota, config):
    imp = nota.get("impostos") or {}
    ali = imp.get("aliquota_iss")
    if ali is None or ali == "":
        ali = (config or {}).get("aliquota_iss_padrao")
    try:
        return float(ali or 0)
    except (TypeError, ValueError):
        return 0.0


def validar_config_emissao(config, cert):
    faltando = []
    if not config:
        return ["Configuração Fiscal não cadastrada"]
    for campo, label in (
        ("cnpj", "CNPJ"),
        ("inscricao_municipal", "Inscrição Municipal"),
        ("codigo_ibge_municipio", "Código IBGE do município"),
        ("cnae_principal", "CNAE Principal"),
        ("codigo_servico_nacional", "Código de serviço nacional"),
        ("regime_tributario", "Regime tributário"),
    ):
        if not (config.get(campo) or "").strip() if isinstance(config.get(campo), str) else not config.get(campo):
            faltando.append(label)
    ibge = so_digitos(config.get("codigo_ibge_municipio"))
    if ibge and (len(ibge) != 7 or ibge == "0000000"):
        faltando.append("Código IBGE válido (7 dígitos)")
    cnpj_cfg = so_digitos(config.get("cnpj"))
    if cnpj_cfg and len(cnpj_cfg) != 14:
        faltando.append("CNPJ válido (14 dígitos)")
    cod_srv = so_digitos(config.get("codigo_servico_nacional"))
    if not cod_srv or len(cod_srv) < 4:
        faltando.append("Código de serviço nacional válido")
    try:
        ali_cfg = float(config.get("aliquota_iss_padrao") or 0)
    except (TypeError, ValueError):
        ali_cfg = 0
    if ali_cfg <= 0:
        faltando.append("Alíquota ISS padrão")
    amb = (config.get("ambiente") or "homologacao").lower()
    if amb not in ("homologacao", "producao"):
        faltando.append("Ambiente (homologação ou produção)")
    if not cert or not cert.get("caminho_arquivo"):
        faltando.append("Certificado digital A1")
    elif cert.get("vencido") or cert.get("valido") is False:
        faltando.append("Certificado digital válido (não vencido)")
    return faltando


def validar_certificado_cnpj(config, cert, dec_senha_fn):
    erros = []
    if not config or not cert or not cert.get("caminho_arquivo"):
        return erros
    cnpj_cfg = so_digitos(config.get("cnpj"))
    if len(cnpj_cfg) != 14:
        return erros
    try:
        senha = dec_senha_fn(cert.get("senha_criptografada") or "")
        cnpj_cert = extrair_cnpj_certificado(cert["caminho_arquivo"], senha)
    except Exception as exc:
        return [f"Certificado A1 ilegível: {exc}"]
    if not cnpj_cert:
        return ["Não foi possível identificar o CNPJ no certificado A1"]
    if cnpj_cert != cnpj_cfg:
        erros.append(
            f"Certificado A1 (CNPJ {cnpj_cert}) não corresponde ao CNPJ configurado ({cnpj_cfg})"
        )
    return erros


def validar_nota_emissao(nota, config):
    erros = []
    if not nota:
        return ["Nota não encontrada"]
    sit = (nota.get("situacao") or "").lower()
    if sit == "emitida" and nota.get("chave_acesso"):
        erros.append("Nota já emitida")
    if sit == "cancelada":
        erros.append("Nota cancelada")
    ok_doc, msg_doc = _doc_cliente_valido(nota.get("cliente_cnpj_cpf"))
    if not ok_doc:
        erros.append(msg_doc)
    if not (nota.get("cliente_nome") or "").strip():
        erros.append("Nome/razão social do cliente")
    total = float(nota.get("total_nota") or 0)
    if total <= 0:
        erros.append("Valor total da nota maior que zero")
    cod_srv = so_digitos((config or {}).get("codigo_servico_nacional"))
    if not cod_srv:
        erros.append("Código de serviço nacional (Configuração Fiscal)")
    if _aliquota_iss_nota(nota, config) <= 0:
        erros.append("Alíquota ISS (nota ou Configuração Fiscal)")
    return erros


def pendencias_emissao_empresa(config, cert, dec_senha_fn=None):
    pend = validar_config_emissao(config, cert)
    if not pend and dec_senha_fn:
        pend.extend(validar_certificado_cnpj(config, cert, dec_senha_fn))
    return pend


def pendencias_emissao_nota(nota, config):
    return validar_nota_emissao(nota, config)


def validar_emissao_completa(config, cert, nota, dec_senha_fn):
    pendencias = pendencias_emissao_empresa(config, cert, dec_senha_fn)
    pendencias.extend(pendencias_emissao_nota(nota, config))
    if pendencias:
        raise ValueError("Emissão bloqueada: " + "; ".join(pendencias))
    return True


def _assinar_dps(dps_root, inf_dps, pfx_path, senha):
    key_pem, cert_pem = carregar_pfx(pfx_path, senha)
    from signxml import XMLSigner, methods

    ref_id = inf_dps.get("Id")
    signer = XMLSigner(
        method=methods.enveloped,
        signature_algorithm="rsa-sha256",
        digest_algorithm="sha256",
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )
    signed_inf = signer.sign(inf_dps, key=key_pem, cert=cert_pem, reference_uri={"uri": f"#{ref_id}"})
    sigs = signed_inf.findall(f".//{{{NS_DS}}}Signature")
    for sig in sigs:
        parent = sig.getparent()
        if parent is not None:
            parent.remove(sig)
        dps_root.append(sig)
    return etree.tostring(dps_root, xml_declaration=True, encoding="UTF-8").decode("utf-8")


def _assinar_evento(root, inf, pfx_path, senha):
    key_pem, cert_pem = carregar_pfx(pfx_path, senha)
    from signxml import XMLSigner, methods

    ref_id = inf.get("Id")
    signer = XMLSigner(
        method=methods.enveloped,
        signature_algorithm="rsa-sha256",
        digest_algorithm="sha256",
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )
    signed_inf = signer.sign(inf, key=key_pem, cert=cert_pem, reference_uri={"uri": f"#{ref_id}"})
    sigs = signed_inf.findall(f".//{{{NS_DS}}}Signature")
    for sig in sigs:
        parent = sig.getparent()
        if parent is not None:
            parent.remove(sig)
        root.append(sig)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8").decode("utf-8")


def _cliente(config, cert, dec_senha_fn):
    senha = dec_senha_fn(cert.get("senha_criptografada") or "")
    return NfseNacionalClient(
        config.get("ambiente"),
        cert["caminho_arquivo"],
        senha,
    )


def emitir_nota(config, cert, nota, dec_senha_fn):
    validar_emissao_completa(config, cert, nota, dec_senha_fn)

    n_dps = ndps_deterministico(nota.get("id"), nota.get("numero_rps"))
    dps_root, inf_dps, id_dps, n_dps_val, xml_sem_assinatura = montar_dps_xml(
        config, nota, n_dps=n_dps
    )
    xml_assinado = _assinar_dps(
        dps_root, inf_dps, cert["caminho_arquivo"], dec_senha_fn(cert.get("senha_criptografada") or "")
    )

    client = _cliente(config, cert, dec_senha_fn)
    try:
        resposta = client.emitir_dps(xml_assinado)
    except NfseNacionalErro as exc:
        if exc.status_code in (408, 504, None) or "timeout" in str(exc).lower():
            log.warning("Timeout emissão — tentando recuperar DPS %s", id_dps)
            try:
                rec = client.consultar_dps(id_dps)
                if rec.get("chaveAcesso"):
                    resposta = rec
                else:
                    raise exc
            except Exception:
                raise exc
        else:
            raise

    dados = processar_resposta_emissao(resposta, config.get("ambiente"))
    dados["id_dps"] = dados.get("id_dps") or id_dps
    dados["xml_enviado"] = xml_assinado
    dados["n_dps"] = n_dps_val

    chave = (dados.get("chave_acesso") or "").strip()
    if len(so_digitos(chave)) < 50:
        raise NfseNacionalErro(
            "SEFIN não retornou chave de acesso — emissão não autorizada",
            detalhes=[resposta] if isinstance(resposta, dict) else [],
        )

    return dados


def consultar_nfse(config, cert, chave_acesso, dec_senha_fn):
    faltando = pendencias_emissao_empresa(config, cert, dec_senha_fn)
    if faltando:
        raise ValueError("Configuração incompleta: " + ", ".join(faltando))
    client = _cliente(config, cert, dec_senha_fn)
    return client.consultar_nfse(chave_acesso)


def cancelar_nfse(config, cert, nota, motivo, dec_senha_fn, codigo_motivo=1):
    faltando = pendencias_emissao_empresa(config, cert, dec_senha_fn)
    if faltando:
        raise ValueError("Configuração incompleta: " + ", ".join(faltando))
    chave = nota.get("chave_acesso")
    if not chave:
        raise ValueError("Nota sem chave de acesso — não é possível cancelar")

    root, inf, _id, _xml = montar_evento_cancelamento(config, chave, motivo, codigo_motivo)
    xml_assinado = _assinar_evento(
        root, inf, cert["caminho_arquivo"], dec_senha_fn(cert.get("senha_criptografada") or "")
    )
    client = _cliente(config, cert, dec_senha_fn)
    return client.cancelar_nfse(chave, xml_assinado)
