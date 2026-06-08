"""Configuração Fiscal — infraestrutura NFS-e (cadastro, certificado, sem emissão)."""
import base64
import hashlib
import os
import re
import uuid
from datetime import date

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, RedirectResponse


def init_config_fiscal_tables(cur):
    cur.execute("""
        create table if not exists financeiro_config_fiscal (
          id uuid primary key default uuid_generate_v4(),
          razao_social text,
          nome_fantasia text,
          cnpj text,
          inscricao_municipal text,
          inscricao_estadual text,
          cnae_principal text,
          codigo_servico_municipal text,
          municipio_emissao text,
          regime_tributario text,
          aliquota_iss_padrao numeric(8,4) default 0,
          ambiente text default 'homologacao',
          created_at timestamp default now(),
          updated_at timestamp default now()
        );""")
    cur.execute("""
        create table if not exists financeiro_config_fiscal_certificado (
          id uuid primary key default uuid_generate_v4(),
          config_fiscal_id uuid references financeiro_config_fiscal(id) on delete set null,
          tipo text default 'a1_servidor',
          caminho_arquivo text,
          senha_criptografada text,
          validade date,
          razao_social text,
          cnpj text,
          subject text,
          ativo boolean default true,
          created_at timestamp default now(),
          updated_at timestamp default now()
        );""")
    cur.execute(
        "create index if not exists idx_fcf_cert_ativo on financeiro_config_fiscal_certificado(ativo);"
    )
    alters = [
        "alter table financeiro_config_fiscal add column if not exists codigo_ibge_municipio text;",
        "alter table financeiro_config_fiscal add column if not exists codigo_servico_nacional text;",
        "alter table financeiro_config_fiscal add column if not exists uf_municipio text;",
    ]
    for stmt in alters:
        cur.execute(stmt)


def _cert_key():
    seed = os.getenv("DATABASE_URL", "essencia-fiscal-local")
    return base64.urlsafe_b64encode(hashlib.sha256(seed.encode()).digest())


def _enc_senha(s):
    if not s:
        return ""
    raw = s.encode("utf-8")
    key = _cert_key()
    xored = bytes(b ^ key[i % len(key)] for i, b in enumerate(raw))
    return base64.urlsafe_b64encode(xored).decode()


def _dec_senha(enc):
    if not enc:
        return ""
    key = _cert_key()
    raw = base64.urlsafe_b64decode(enc.encode())
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(raw)).decode()


def _so_digitos(v):
    return re.sub(r"\D", "", str(v or ""))


def ler_certificado_info(pfx_path, senha):
    info = {
        "validade": None,
        "emissao": None,
        "razao_social": "",
        "titular": "",
        "cnpj": "",
        "emissor": "ICP-Brasil",
        "subject": "",
        "valido": False,
    }
    try:
        from cryptography.hazmat.primitives.serialization import pkcs12

        with open(pfx_path, "rb") as f:
            data = f.read()
        pwd = senha.encode() if senha else None
        _key, cert, _ = pkcs12.load_key_and_certificates(data, pwd)
        if cert:
            info["valido"] = True
            info["subject"] = cert.subject.rfc4514_string()
            na = cert.not_valid_after_utc if hasattr(cert, "not_valid_after_utc") else cert.not_valid_after
            nb = cert.not_valid_before_utc if hasattr(cert, "not_valid_before_utc") else cert.not_valid_before
            info["validade"] = na.date() if na else None
            info["emissao"] = nb.date() if nb else None
            for attr in cert.subject:
                oid = attr.oid._name if hasattr(attr.oid, "_name") else str(attr.oid)
                if oid in ("commonName", "organizationName"):
                    info["razao_social"] = info["razao_social"] or attr.value
            info["titular"] = _titular_do_subject(info["subject"])
            if cert.issuer:
                for attr in cert.issuer:
                    oid = attr.oid._name if hasattr(attr.oid, "_name") else str(attr.oid)
                    if oid in ("organizationName", "commonName"):
                        info["emissor"] = attr.value
                        break
            try:
                from nfse_nacional.signer import extrair_cnpj_certificado

                info["cnpj"] = extrair_cnpj_certificado(pfx_path, senha) or ""
            except Exception:
                cn = _so_digitos(info["subject"])
                if len(cn) >= 14:
                    info["cnpj"] = cn[:14]
    except ImportError:
        info["subject"] = "Instale cryptography para validação automática"
    except Exception as exc:
        info["subject"] = f"Erro ao ler certificado: {exc}"
    return info


def _titular_do_subject(subject):
    subj = subject or ""
    if "CN=" not in subj:
        return ""
    cn = subj.split("CN=", 1)[1].split(",", 1)[0]
    if ":" in cn:
        return cn.split(":", 1)[0].strip()
    return cn.strip()


def _dias_restantes_cert(validade):
    if not validade:
        return None
    if hasattr(validade, "date"):
        validade = validade.date()
    return (validade - date.today()).days


def _alerta_certificado(validade, presente=True):
    if not presente:
        return {"nivel": "ausente", "mensagem": "Certificado não configurado", "bloqueia_emissao": True}
    dias = _dias_restantes_cert(validade)
    if dias is None:
        return {"nivel": "indefinido", "mensagem": "Validade do certificado não identificada", "bloqueia_emissao": False}
    if dias < 0:
        return {
            "nivel": "vencido",
            "mensagem": "Certificado vencido. Emissão NFS-e bloqueada.",
            "bloqueia_emissao": True,
            "dias_restantes": dias,
        }
    if dias == 0:
        return {
            "nivel": "vencido",
            "mensagem": "Certificado vence hoje. Emissão NFS-e bloqueada.",
            "bloqueia_emissao": True,
            "dias_restantes": 0,
        }
    if dias <= 30:
        return {
            "nivel": "critico",
            "mensagem": f"Certificado próximo do vencimento ({dias} dias restantes).",
            "bloqueia_emissao": False,
            "dias_restantes": dias,
        }
    if dias <= 90:
        return {
            "nivel": "atencao",
            "mensagem": f"Atenção: certificado vence em {dias} dias.",
            "bloqueia_emissao": False,
            "dias_restantes": dias,
        }
    return {
        "nivel": "ok",
        "mensagem": f"Certificado válido ({dias} dias restantes).",
        "bloqueia_emissao": False,
        "dias_restantes": dias,
    }


def _fmt_cnpj_static(v):
    d = _so_digitos(v)
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return v or ""


def enriquecer_certificado(cert_row, config=None):
    """Metadados públicos do certificado para o painel fiscal."""
    if not cert_row:
        alerta = _alerta_certificado(None, presente=False)
        return None
    c = dict(cert_row)
    val = c.get("validade")
    hoje = date.today()
    if hasattr(val, "date"):
        val = val.date()
    titular = _titular_do_subject(c.get("subject") or "") or c.get("razao_social") or ""
    dias = _dias_restantes_cert(val)
    alerta = _alerta_certificado(val, presente=True)
    cnpj = _so_digitos(c.get("cnpj"))
    cfg_cnpj = _so_digitos((config or {}).get("cnpj"))
    c.update(
        {
            "titular": titular,
            "cnpj_fmt": _fmt_cnpj_static(cnpj),
            "validade_fmt": val.strftime("%d/%m/%Y") if val else "",
            "emissao_fmt": "",
            "emissor": "ICP-Brasil",
            "dias_restantes": dias,
            "valido": bool(val and val >= hoje),
            "vencido": bool(val and val < hoje),
            "alerta": alerta,
            "cnpj_confere_empresa": (not cfg_cnpj or not cnpj or cnpj == cfg_cnpj),
        }
    )
    if c.get("subject") and "O=" in c["subject"]:
        for part in c["subject"].split(","):
            if part.strip().startswith("O="):
                c["emissor"] = part.strip()[2:]
                break
    return c


def register(app, templates):
    import app as main

    q = main.q
    one = main.one
    _txt = main._txt_controle
    _num = main._num_controle

    UPLOAD_BASE = getattr(main, "FINANCEIRO_UPLOAD_DIR", os.path.join("static", "uploads", "financeiro"))
    CERT_DIR = os.path.join(UPLOAD_BASE, "config_fiscal", "certificados")
    os.makedirs(CERT_DIR, exist_ok=True)

    REGIMES = (
        "Simples Nacional",
        "Lucro Presumido",
        "Lucro Real",
        "Regime Normal",
        "MEI",
        "Outro",
    )

    def tpl_ctx(request, extra=None):
        ctx = {"request": request, "nav_ativo": "financeiro", "nav_som": False, "regimes": REGIMES}
        if extra:
            ctx.update(extra)
        return ctx

    def _fmt_data(d):
        if not d:
            return ""
        if hasattr(d, "strftime"):
            return d.strftime("%d/%m/%Y")
        return str(d)

    def _fmt_cnpj(v):
        d = _so_digitos(v)
        if len(d) == 14:
            return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
        return v or ""

    def _normalizar_config(row):
        if not row:
            return None
        c = dict(row)
        c["id"] = str(c["id"])
        c["aliquota_iss_padrao"] = float(c.get("aliquota_iss_padrao") or 0)
        c["ambiente"] = (c.get("ambiente") or "homologacao").lower()
        c["cnpj_fmt"] = _fmt_cnpj(c.get("cnpj"))
        return c

    def _normalizar_cert(row, public=True, config=None):
        if not row:
            return None
        c = dict(row)
        c["id"] = str(c["id"])
        if c.get("config_fiscal_id"):
            c["config_fiscal_id"] = str(c["config_fiscal_id"])
        val = c.get("validade")
        hoje = date.today()
        c["validade_fmt"] = _fmt_data(val)
        c["valido"] = bool(val and val >= hoje)
        c["vencido"] = bool(val and val < hoje)
        if public:
            c.pop("senha_criptografada", None)
            c.pop("caminho_arquivo", None)
        cfg = config if config is not None else obter_config()
        enriched = enriquecer_certificado(c if not public else {**c, "validade": val}, cfg)
        if enriched:
            c.update({k: enriched.get(k) for k in (
                "titular", "cnpj_fmt", "dias_restantes", "alerta", "cnpj_confere_empresa", "emissor", "emissao_fmt"
            ) if k in enriched})
        return c

    def _painel_emissao(config, cert, pendencias, comunicacao=None):
        cfg = config or {}
        cert_pub = _normalizar_cert(cert, public=True, config=config) if cert else None
        amb = (cfg.get("ambiente") or "homologacao").lower()
        cert_ok = bool(cert_pub and cert_pub.get("valido") and cert_pub.get("cnpj_confere_empresa", True))
        if cert_pub and cert_pub.get("alerta", {}).get("bloqueia_emissao"):
            cert_ok = False
        return {
            "empresa_pronta": not pendencias,
            "pendencias": pendencias,
            "ambiente": amb,
            "ambiente_label": "Homologação" if amb != "producao" else "Produção",
            "empresa_apta_label": "Apta" if not pendencias else "Não apta",
            "certificado_valido": cert_ok,
            "certificado_label": (
                "Válido" if cert_ok else ("Vencido" if cert_pub and cert_pub.get("vencido") else "Inválido / ausente")
            ),
            "comunicacao_ok": comunicacao.get("ok") if comunicacao else None,
            "comunicacao_label": (
                (comunicacao.get("mensagem") or ("OK" if comunicacao.get("ok") else "Falha"))
                if comunicacao
                else "Não testada"
            ),
        }

    def obter_config():
        row = one("select * from financeiro_config_fiscal order by updated_at desc limit 1")
        return _normalizar_config(row)

    def certificado_ativo():
        row = one(
            """
            select * from financeiro_config_fiscal_certificado
             where coalesce(ativo, true) = true
             order by updated_at desc limit 1
            """
        )
        return _normalizar_cert(row, public=False)

    def certificado_ativo_publico():
        cfg = obter_config()
        row = one(
            """
            select * from financeiro_config_fiscal_certificado
             where coalesce(ativo, true) = true
             order by updated_at desc limit 1
            """
        )
        return _normalizar_cert(row, public=True, config=cfg)

    def _montar_resposta_fiscal(comunicacao=None):
        import financeiro_config_fiscal as fcf
        from nfse_nacional.service import pendencias_emissao_empresa

        config = obter_config()
        cert = certificado_ativo()
        pend = pendencias_emissao_empresa(config, cert, fcf._dec_senha)
        cert_pub = certificado_ativo_publico()
        if cert and cert.get("caminho_arquivo"):
            try:
                info = ler_certificado_info(
                    cert["caminho_arquivo"],
                    _dec_senha(cert.get("senha_criptografada") or ""),
                )
                if cert_pub:
                    cert_pub["emissao_fmt"] = _fmt_data(info.get("emissao"))
                    if info.get("emissor"):
                        cert_pub["emissor"] = info.get("emissor")
            except Exception:
                pass
        emissao = _painel_emissao(config, cert, pend, comunicacao)
        return {
            "ok": True,
            "config": config,
            "certificado": cert_pub,
            "emissao": emissao,
        }

    def salvar_config(payload):
        p = payload or {}
        razao = _txt(p.get("razao_social"))
        if not razao:
            raise ValueError("Razão Social é obrigatória")
        cnpj = _so_digitos(p.get("cnpj"))
        if cnpj and len(cnpj) not in (11, 14):
            raise ValueError("CNPJ/CPF inválido")
        amb = (_txt(p.get("ambiente")) or "homologacao").lower()
        if amb not in ("homologacao", "producao"):
            amb = "homologacao"
        regime = _txt(p.get("regime_tributario"))
        if regime and regime not in REGIMES:
            regime = regime[:120]
        atual = obter_config()
        params = (
            razao,
            _txt(p.get("nome_fantasia")),
            cnpj or None,
            _txt(p.get("inscricao_municipal")),
            _txt(p.get("inscricao_estadual")),
            _txt(p.get("cnae_principal")),
            _txt(p.get("codigo_servico_municipal")),
            _txt(p.get("codigo_servico_nacional")),
            _txt(p.get("municipio_emissao")),
            _so_digitos(p.get("codigo_ibge_municipio")) or None,
            (_txt(p.get("uf_municipio")) or "")[:2].upper() or None,
            regime or None,
            _num(p.get("aliquota_iss_padrao")),
            amb,
        )
        if atual:
            q(
                """
                update financeiro_config_fiscal set
                  razao_social=%s, nome_fantasia=%s, cnpj=%s,
                  inscricao_municipal=%s, inscricao_estadual=%s,
                  cnae_principal=%s, codigo_servico_municipal=%s,
                  codigo_servico_nacional=%s, municipio_emissao=%s,
                  codigo_ibge_municipio=%s, uf_municipio=%s,
                  regime_tributario=%s, aliquota_iss_padrao=%s, ambiente=%s, updated_at=now()
                where id=%s
                """,
                params + (atual["id"],),
            )
            cid = atual["id"]
        else:
            row = one(
                """
                insert into financeiro_config_fiscal (
                  razao_social, nome_fantasia, cnpj, inscricao_municipal, inscricao_estadual,
                  cnae_principal, codigo_servico_municipal, codigo_servico_nacional,
                  municipio_emissao, codigo_ibge_municipio, uf_municipio,
                  regime_tributario, aliquota_iss_padrao, ambiente, updated_at
                ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now()) returning id
                """,
                params,
            )
            cid = str(row["id"])
        cert = certificado_ativo()
        if cert and not cert.get("config_fiscal_id"):
            q(
                "update financeiro_config_fiscal_certificado set config_fiscal_id=%s where id=%s",
                (cid, cert["id"]),
            )
        return obter_config()

    def salvar_certificado(arquivo_bytes, filename, senha, config_id=None):
        if not arquivo_bytes:
            raise ValueError("Arquivo vazio")
        ext = os.path.splitext(filename or "")[1].lower()
        if ext not in (".pfx", ".p12"):
            raise ValueError("Formato inválido. Use .pfx ou .p12")
        fname = f"cert_{uuid.uuid4().hex}{ext}"
        path = os.path.join(CERT_DIR, fname)
        with open(path, "wb") as f:
            f.write(arquivo_bytes)
        info = ler_certificado_info(path, senha)
        if not info.get("valido"):
            os.remove(path)
            msg = info.get("subject") or "Certificado inválido ou senha incorreta"
            raise ValueError(msg)
        cfg = obter_config()
        cnpj_cert = _so_digitos(info.get("cnpj"))
        cnpj_cfg = _so_digitos(cfg.get("cnpj")) if cfg else ""
        if cnpj_cfg and cnpj_cert and cnpj_cert != cnpj_cfg:
            os.remove(path)
            raise ValueError(
                f"Certificado pertence ao CNPJ {_fmt_cnpj(cnpj_cert)} — "
                f"diferente do configurado ({_fmt_cnpj(cnpj_cfg)}). Não foi salvo."
            )
        cfg_id = config_id or (cfg["id"] if cfg else None)
        q("update financeiro_config_fiscal_certificado set ativo=false where coalesce(ativo,true)=true")
        row = one(
            """
            insert into financeiro_config_fiscal_certificado (
              config_fiscal_id, tipo, caminho_arquivo, senha_criptografada,
              validade, razao_social, cnpj, subject, ativo, updated_at
            ) values (%s,'a1_servidor',%s,%s,%s,%s,%s,%s,true,now()) returning id
            """,
            (
                cfg_id,
                path.replace("\\", "/"),
                _enc_senha(senha),
                info.get("validade"),
                info.get("titular") or info.get("razao_social"),
                info.get("cnpj"),
                info.get("subject"),
            ),
        )
        return _normalizar_cert(
            one("select * from financeiro_config_fiscal_certificado where id=%s", (str(row["id"]),))
        )

    # --- Páginas ---
    @app.get("/financeiro/configuracao-fiscal", response_class=HTMLResponse)
    def pagina_config_fiscal(request: Request):
        return templates.TemplateResponse(
            "financeiro/config_fiscal.html",
            tpl_ctx(request, {"config": obter_config(), "certificado": certificado_ativo_publico()}),
        )

    @app.get("/configuracoes/certificado-digital")
    def redirect_certificado_antigo():
        return RedirectResponse(url="/financeiro/configuracao-fiscal", status_code=302)

    # --- API Config ---
    @app.get("/api/financeiro/configuracao-fiscal")
    def api_get_config_fiscal():
        return _montar_resposta_fiscal()

    @app.put("/api/financeiro/configuracao-fiscal")
    async def api_put_config_fiscal(request: Request):
        try:
            p = await request.json()
            salvar_config(p)
            return _montar_resposta_fiscal()
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.post("/api/financeiro/configuracao-fiscal/certificado")
    async def api_upload_cert_fiscal(request: Request):
        try:
            form = await request.form()
            arquivo = form.get("arquivo")
            senha = _txt(form.get("senha"))
            if not arquivo or not getattr(arquivo, "filename", None):
                raise ValueError("Selecione o arquivo .pfx ou .p12")
            raw = await arquivo.read()
            cfg = obter_config()
            salvar_certificado(raw, arquivo.filename, senha, cfg["id"] if cfg else None)
            return _montar_resposta_fiscal()
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.post("/api/financeiro/configuracao-fiscal/certificado/validar")
    async def api_validar_cert_fiscal(request: Request):
        """Valida certificado ativo ou arquivo enviado (sem salvar)."""
        try:
            cfg = obter_config()
            cnpj_cfg = _so_digitos(cfg.get("cnpj")) if cfg else ""
            content_type = request.headers.get("content-type", "")
            if content_type.startswith("multipart/form-data"):
                form = await request.form()
                arquivo = form.get("arquivo")
                senha = _txt(form.get("senha"))
                if not arquivo or not getattr(arquivo, "filename", None):
                    cert = certificado_ativo()
                    if not cert or not cert.get("caminho_arquivo"):
                        raise ValueError("Nenhum certificado configurado")
                    senha = _dec_senha(cert.get("senha_criptografada") or "")
                    info = ler_certificado_info(cert["caminho_arquivo"], senha)
                    path = cert["caminho_arquivo"]
                else:
                    import tempfile

                    raw = await arquivo.read()
                    ext = os.path.splitext(arquivo.filename or "")[1].lower() or ".pfx"
                    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                        tmp.write(raw)
                        path = tmp.name
                    try:
                        info = ler_certificado_info(path, senha)
                    finally:
                        try:
                            os.remove(path)
                        except OSError:
                            pass
            else:
                cert = certificado_ativo()
                if not cert or not cert.get("caminho_arquivo"):
                    raise ValueError("Nenhum certificado configurado")
                senha = _dec_senha(cert.get("senha_criptografada") or "")
                info = ler_certificado_info(cert["caminho_arquivo"], senha)

            if not info.get("valido"):
                raise ValueError(info.get("subject") or "Certificado inválido ou senha incorreta")
            cnpj_cert = _so_digitos(info.get("cnpj"))
            confere = not cnpj_cfg or not cnpj_cert or cnpj_cert == cnpj_cfg
            alerta = _alerta_certificado(info.get("validade"), presente=True)
            return {
                "ok": True,
                "validacao": {
                    "titular": info.get("titular") or info.get("razao_social"),
                    "cnpj": cnpj_cert,
                    "cnpj_fmt": _fmt_cnpj(cnpj_cert),
                    "emissor": info.get("emissor"),
                    "emissao_fmt": _fmt_data(info.get("emissao")),
                    "validade_fmt": _fmt_data(info.get("validade")),
                    "dias_restantes": _dias_restantes_cert(info.get("validade")),
                    "cnpj_confere_empresa": confere,
                    "alerta": alerta,
                    "valido": alerta.get("nivel") not in ("vencido", "ausente"),
                },
            }
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.post("/api/financeiro/configuracao-fiscal/testar-comunicacao")
    def api_testar_comunicacao_nfse():
        """Testa mTLS com a SEFIN (sem emitir nota)."""
        import financeiro_config_fiscal as fcf
        from nfse_nacional.client import NfseNacionalClient, NfseNacionalErro

        try:
            config = obter_config()
            cert = certificado_ativo()
            if not config:
                raise ValueError("Configure os dados fiscais antes do teste")
            if not cert or not cert.get("caminho_arquivo"):
                raise ValueError("Certificado A1 não configurado")
            if cert.get("vencido"):
                raise ValueError("Certificado vencido — emissão bloqueada")
            senha = fcf._dec_senha(cert.get("senha_criptografada") or "")
            client = NfseNacionalClient(
                config.get("ambiente"),
                cert["caminho_arquivo"],
                senha,
            )
            try:
                client._request("GET", "/" + "0" * 50)
            except NfseNacionalErro as exc:
                if exc.status_code in (400, 404, 405, 422):
                    comunicacao = {
                        "ok": True,
                        "mensagem": "Comunicação com SEFIN OK (servidor respondeu)",
                    }
                else:
                    comunicacao = {"ok": False, "mensagem": str(exc)}
            else:
                comunicacao = {"ok": True, "mensagem": "Comunicação com SEFIN OK"}
            resp = _montar_resposta_fiscal(comunicacao)
            resp["comunicacao"] = comunicacao
            return resp
        except Exception as exc:
            return JSONResponse(
                {
                    "ok": False,
                    "erro": str(exc),
                    "comunicacao": {"ok": False, "mensagem": str(exc)},
                },
                400,
            )

    @app.get("/api/financeiro/configuracao-fiscal/certificado/exportar")
    def api_export_cert_fiscal():
        c = certificado_ativo()
        if not c or not c.get("caminho_arquivo"):
            return JSONResponse({"ok": False, "erro": "Nenhum certificado ativo"}, 404)
        path = c["caminho_arquivo"]
        if not os.path.isfile(path):
            return JSONResponse({"ok": False, "erro": "Arquivo não encontrado"}, 404)
        return FileResponse(path, filename=os.path.basename(path), media_type="application/x-pkcs12")

    # Compatibilidade NFS-e (rotas antigas redirecionam leitura)
    @app.get("/api/configuracoes/certificado-digital")
    def api_get_cert_legacy():
        c = certificado_ativo_publico()
        return {"ok": True, "certificado": c}

    @app.post("/api/configuracoes/certificado-digital")
    async def api_upload_cert_legacy(request: Request):
        return await api_upload_cert_fiscal(request)

    @app.get("/api/configuracoes/certificado-digital/exportar")
    def api_export_cert_legacy():
        return api_export_cert_fiscal()

    return {
        "obter_config": obter_config,
        "certificado_ativo": certificado_ativo,
        "certificado_ativo_publico": certificado_ativo_publico,
        "ler_certificado_info": ler_certificado_info,
    }
