"""Importação CSV de clientes para cadastro_contatos (Cadastros → Clientes)."""
import csv
import io
import re
from datetime import datetime


def register(app):
    import app as main
    from fastapi import Request, UploadFile
    from fastapi.responses import JSONResponse

    q = main.q
    one = main.one
    _txt_cad = main._txt_cad
    _status_cad = main._status_cad
    _parse_data_controle = main._parse_data_controle
    contato_cadastro_por_id = main.contato_cadastro_por_id
    resumo_contatos_cadastro = main.resumo_contatos_cadastro

    def _so_digitos(val):
        return re.sub(r"\D", "", str(val or ""))

    def _txt(val):
        if val is None:
            return ""
        s = str(val).strip()
        return re.sub(r"\s+", " ", s) if s else ""

    def _norm_header(h):
        s = _txt(h).lower()
        s = s.replace("ç", "c").replace("ã", "a").replace("á", "a").replace("à", "a")
        s = s.replace("é", "e").replace("ê", "e").replace("í", "i").replace("ó", "o")
        s = s.replace("ô", "o").replace("ú", "u").replace("õ", "o").replace("â", "a")
        return s

    def _pick(row, *keys):
        norm = {_norm_header(k): v for k, v in row.items()}
        for key in keys:
            nk = _norm_header(key)
            if nk in norm:
                val = _txt(norm[nk])
                if val:
                    return val
        return ""

    def _norm_cep(v):
        d = _so_digitos(v)
        if len(d) == 8:
            return f"{d[:5]}-{d[5:]}"
        return _txt(v)

    def _norm_uf(v):
        u = _txt(v).upper()
        return u[:2] if u else ""

    def _fmt_doc_pj(cnpj):
        d = _so_digitos(cnpj)
        if len(d) != 14:
            return _txt(cnpj)
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"

    def _fmt_doc_pf(cpf):
        d = _so_digitos(cpf)
        if len(d) != 11:
            return _txt(cpf)
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"

    def _validar_doc(tipo, doc):
        d = _so_digitos(doc)
        if not d:
            return True, ""
        if tipo == "fisica":
            if len(d) != 11:
                return False, "CPF com quantidade de dígitos inválida"
            return True, ""
        if len(d) != 14:
            return False, "CNPJ com quantidade de dígitos inválida"
        return True, ""

    def _detect_tipo(row, doc_raw):
        tp = _pick(row, "Tipo Pessoa", "Tipo pessoa", "PF/PJ", "Tipo")
        t = _norm_header(tp)
        if t in ("pf", "f", "fisica", "pessoa fisica", "pessoa física"):
            return "fisica"
        if t in ("pj", "j", "juridica", "pessoa juridica", "pessoa jurídica"):
            return "juridica"
        d = _so_digitos(doc_raw)
        if len(d) == 11:
            return "fisica"
        if len(d) == 14:
            return "juridica"
        nome = _pick(row, "Razão Social / Nome", "Razao Social / Nome", "Razão Social", "Nome")
        return "juridica" if len(nome) > 40 else "fisica"

    def _parse_status(row):
        sit = _pick(row, "Situação", "Situacao", "Status")
        if not sit:
            return None
        s = _norm_header(sit)
        if s in ("inativo", "inativa", "i", "0", "nao", "não"):
            return "inativo"
        return "ativo"

    def _parse_data(val):
        v = _txt(val)
        if not v:
            return None
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
            try:
                return datetime.strptime(v[:10], fmt).date()
            except ValueError:
                continue
        return _parse_data_controle(v)

    def _parse_csv_bytes(raw):
        for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                text = None
        if text is None:
            raise ValueError("Não foi possível ler o arquivo CSV (encoding inválido)")
        sample = text[:4096]
        delim = ";"
        if sample.count(",") > sample.count(";"):
            delim = ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delim)
        if not reader.fieldnames:
            raise ValueError("CSV sem cabeçalho")
        rows = []
        for i, row in enumerate(reader, start=2):
            if not any(_txt(v) for v in row.values()):
                continue
            rows.append({"_linha": i, **row})
        if not rows:
            raise ValueError("Nenhum registro encontrado no CSV")
        return rows

    def _map_row(row):
        doc = _pick(row, "CNPJ / CPF", "CNPJ/CPF", "CNPJ", "CPF", "Documento")
        tipo = _detect_tipo(row, doc)
        ie_isento = _pick(row, "IE Isento", "IE isento", "Isento IE")
        ie = _pick(row, "Inscrição Estadual / RG", "Inscricao Estadual / RG", "Inscrição Estadual", "IE", "RG")
        contrib = _txt(ie_isento) or ("Isento" if _norm_header(ie) in ("isento", "isenta") else "")
        razao = _pick(row, "Razão Social / Nome", "Razao Social / Nome", "Razão Social", "Razao Social")
        nome_pf = razao if tipo == "fisica" else _pick(row, "Nome", "Nome completo")
        if tipo == "fisica" and not nome_pf:
            nome_pf = razao
        obs_parts = []
        base_obs = _pick(row, "Observações", "Observacoes")
        if base_obs:
            obs_parts.append(base_obs)
        for label, *keys in (
            ("Segmento", "Segmento"),
            ("Vendedor", "Vendedor"),
            ("Regime tributário", "Regime tributário", "Regime tributario"),
        ):
            val = _pick(row, label, *keys)
            if val:
                obs_parts.append(f"{label}: {val}")
        email_nfse = _pick(
            row,
            "E-mail para envio de NFS-e",
            "E-mail para envio de NFSe",
            "Email NFSe",
            "Email NFS-e",
        )
        ok_doc, err_doc = _validar_doc(tipo, doc)
        payload = {
            "_linha": row.get("_linha"),
            "_doc_valido": ok_doc,
            "_doc_erro": err_doc,
            "codigo_cliente": _pick(row, "Código", "Codigo", "Cod"),
            "tipo_pessoa": tipo,
            "status": _parse_status(row),
            "razao_social": razao if tipo == "juridica" else "",
            "nome_fantasia": _pick(row, "Nome Fantasia", "Nome fantasia", "Fantasia"),
            "cnpj": _fmt_doc_pj(doc) if tipo == "juridica" else "",
            "cpf": _fmt_doc_pf(doc) if tipo == "fisica" else "",
            "inscricao_estadual": ie if tipo == "juridica" else "",
            "rg": ie if tipo == "fisica" else "",
            "contribuinte_icms": contrib or _pick(row, "Contribuinte ICMS"),
            "nome": nome_pf if tipo == "fisica" else "",
            "cep": _norm_cep(_pick(row, "CEP")),
            "logradouro": _pick(row, "Endereço", "Endereco", "Logradouro"),
            "numero": _pick(row, "Número", "Numero", "Nº"),
            "complemento": _pick(row, "Complemento"),
            "bairro": _pick(row, "Bairro"),
            "cidade": _pick(row, "Cidade", "Municipio", "Município"),
            "uf": _norm_uf(_pick(row, "UF", "Estado")),
            "telefone": _pick(row, "Telefone", "Fone"),
            "fax": _pick(row, "Fax"),
            "celular": _pick(row, "Celular", "Cel"),
            "email": _pick(row, "E-mail", "Email"),
            "email_nfse": email_nfse,
            "email_financeiro": email_nfse or _pick(row, "E-mail financeiro"),
            "website": _pick(row, "Website", "Site"),
            "segmento": _pick(row, "Segmento"),
            "vendedor": _pick(row, "Vendedor"),
            "condicao_pagamento": _pick(row, "Condição de pagamento", "Condicao de pagamento", "Condição pagamento"),
            "regime_tributario": _pick(row, "Regime tributário", "Regime tributario"),
            "cliente_desde": _parse_data(_pick(row, "Cliente desde", "Cliente Desde")),
            "prazo_recebimento": _pick(row, "Condição de pagamento", "Condicao de pagamento"),
            "observacoes": "\n".join(obs_parts).strip(),
            "cliente": True,
            "fornecedor": False,
        }
        if not payload["razao_social"] and not payload["nome"]:
            payload["_erro"] = "Razão social / nome obrigatório"
        return payload

    def _buscar_existente(payload):
        doc = _so_digitos(payload.get("cnpj") or payload.get("cpf"))
        if doc:
            row = one(
                """
                select id from cadastro_contatos
                 where regexp_replace(coalesce(cnpj,''), '\\D', '', 'g') = %s
                    or regexp_replace(coalesce(cpf,''), '\\D', '', 'g') = %s
                 limit 1
                """,
                (doc, doc),
            )
            if row:
                return str(row["id"])
        cod = _txt(payload.get("codigo_cliente"))
        if cod:
            row = one(
                "select id from cadastro_contatos where trim(coalesce(codigo_cliente,'')) = %s limit 1",
                (cod,),
            )
            if row:
                return str(row["id"])
        return None

    def _merge_val(novo, atual):
        n = _txt(novo)
        if n:
            return n
        if atual is None:
            return None
        if hasattr(atual, "strftime"):
            return atual
        return _txt(atual) or None

    def _upsert_contato(payload):
        cid = _buscar_existente(payload)
        if cid:
            atual = one("select * from cadastro_contatos where id=%s", (cid,))
            if not atual:
                cid = None
        fields = {
            "tipo_pessoa": _merge_val(payload["tipo_pessoa"], atual.get("tipo_pessoa") if cid else payload["tipo_pessoa"]),
            "status": _merge_val(payload.get("status"), atual.get("status") if cid else None) or _status_cad(payload.get("status") or "ativo"),
            "razao_social": _merge_val(payload.get("razao_social"), atual.get("razao_social") if cid else ""),
            "nome_fantasia": _merge_val(payload.get("nome_fantasia"), atual.get("nome_fantasia") if cid else ""),
            "cnpj": _merge_val(payload.get("cnpj"), atual.get("cnpj") if cid else ""),
            "inscricao_estadual": _merge_val(payload.get("inscricao_estadual"), atual.get("inscricao_estadual") if cid else ""),
            "contribuinte_icms": _merge_val(payload.get("contribuinte_icms"), atual.get("contribuinte_icms") if cid else ""),
            "nome": _merge_val(payload.get("nome"), atual.get("nome") if cid else ""),
            "cpf": _merge_val(payload.get("cpf"), atual.get("cpf") if cid else ""),
            "rg": _merge_val(payload.get("rg"), atual.get("rg") if cid else ""),
            "cep": _merge_val(payload.get("cep"), atual.get("cep") if cid else ""),
            "logradouro": _merge_val(payload.get("logradouro"), atual.get("logradouro") if cid else ""),
            "numero": _merge_val(payload.get("numero"), atual.get("numero") if cid else ""),
            "complemento": _merge_val(payload.get("complemento"), atual.get("complemento") if cid else ""),
            "bairro": _merge_val(payload.get("bairro"), atual.get("bairro") if cid else ""),
            "cidade": _merge_val(payload.get("cidade"), atual.get("cidade") if cid else ""),
            "uf": _merge_val(payload.get("uf"), atual.get("uf") if cid else ""),
            "email": _merge_val(payload.get("email"), atual.get("email") if cid else ""),
            "email_financeiro": _merge_val(payload.get("email_financeiro"), atual.get("email_financeiro") if cid else ""),
            "email_nfse": _merge_val(payload.get("email_nfse"), atual.get("email_nfse") if cid else ""),
            "telefone": _merge_val(payload.get("telefone"), atual.get("telefone") if cid else ""),
            "fax": _merge_val(payload.get("fax"), atual.get("fax") if cid else ""),
            "celular": _merge_val(payload.get("celular"), atual.get("celular") if cid else ""),
            "website": _merge_val(payload.get("website"), atual.get("website") if cid else ""),
            "codigo_cliente": _merge_val(payload.get("codigo_cliente"), atual.get("codigo_cliente") if cid else ""),
            "segmento": _merge_val(payload.get("segmento"), atual.get("segmento") if cid else ""),
            "vendedor": _merge_val(payload.get("vendedor"), atual.get("vendedor") if cid else ""),
            "condicao_pagamento": _merge_val(payload.get("condicao_pagamento"), atual.get("condicao_pagamento") if cid else ""),
            "regime_tributario": _merge_val(payload.get("regime_tributario"), atual.get("regime_tributario") if cid else ""),
            "prazo_recebimento": _merge_val(payload.get("prazo_recebimento"), atual.get("prazo_recebimento") if cid else ""),
            "observacoes": _merge_val(payload.get("observacoes"), atual.get("observacoes") if cid else ""),
            "cliente_desde": payload.get("cliente_desde") or (atual.get("cliente_desde") if cid else None),
            "cliente": True,
            "fornecedor": bool(atual.get("fornecedor")) if cid else False,
        }
        if cid:
            q(
                """
                update cadastro_contatos set
                  tipo_pessoa=%s, status=%s, razao_social=%s, nome_fantasia=%s, cnpj=%s,
                  inscricao_estadual=%s, contribuinte_icms=%s, nome=%s, cpf=%s, rg=%s,
                  cep=%s, logradouro=%s, numero=%s, complemento=%s, bairro=%s, cidade=%s, uf=%s,
                  email=%s, email_financeiro=%s, email_nfse=%s, telefone=%s, fax=%s, celular=%s,
                  website=%s, codigo_cliente=%s, segmento=%s, vendedor=%s, condicao_pagamento=%s,
                  regime_tributario=%s, prazo_recebimento=%s, observacoes=%s, cliente_desde=%s,
                  cliente=%s, fornecedor=%s, updated_at=now()
                where id=%s
                """,
                (
                    fields["tipo_pessoa"],
                    fields["status"],
                    fields["razao_social"],
                    fields["nome_fantasia"],
                    fields["cnpj"],
                    fields["inscricao_estadual"],
                    fields["contribuinte_icms"],
                    fields["nome"],
                    fields["cpf"],
                    fields["rg"],
                    fields["cep"],
                    fields["logradouro"],
                    fields["numero"],
                    fields["complemento"],
                    fields["bairro"],
                    fields["cidade"],
                    fields["uf"],
                    fields["email"],
                    fields["email_financeiro"],
                    fields["email_nfse"],
                    fields["telefone"],
                    fields["fax"],
                    fields["celular"],
                    fields["website"],
                    fields["codigo_cliente"],
                    fields["segmento"],
                    fields["vendedor"],
                    fields["condicao_pagamento"],
                    fields["regime_tributario"],
                    fields["prazo_recebimento"],
                    fields["observacoes"],
                    fields["cliente_desde"],
                    fields["cliente"],
                    fields["fornecedor"],
                    cid,
                ),
            )
            return "atualizado", cid
        row = one(
            """
            insert into cadastro_contatos (
              tipo_pessoa, status, razao_social, nome_fantasia, cnpj, inscricao_estadual, contribuinte_icms,
              nome, cpf, rg, cep, logradouro, numero, complemento, bairro, cidade, uf,
              email, email_financeiro, email_nfse, telefone, fax, celular, website,
              codigo_cliente, segmento, vendedor, condicao_pagamento, regime_tributario,
              prazo_recebimento, observacoes, cliente_desde, cliente, fornecedor, updated_at
            ) values (
              %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
              %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now()
            ) returning id
            """,
            (
                fields["tipo_pessoa"],
                fields["status"],
                fields["razao_social"],
                fields["nome_fantasia"],
                fields["cnpj"],
                fields["inscricao_estadual"],
                fields["contribuinte_icms"],
                fields["nome"],
                fields["cpf"],
                fields["rg"],
                fields["cep"],
                fields["logradouro"],
                fields["numero"],
                fields["complemento"],
                fields["bairro"],
                fields["cidade"],
                fields["uf"],
                fields["email"],
                fields["email_financeiro"],
                fields["email_nfse"],
                fields["telefone"],
                fields["fax"],
                fields["celular"],
                fields["website"],
                fields["codigo_cliente"],
                fields["segmento"],
                fields["vendedor"],
                fields["condicao_pagamento"],
                fields["regime_tributario"],
                fields["prazo_recebimento"],
                fields["observacoes"],
                fields["cliente_desde"],
                True,
                False,
            ),
        )
        return "inserido", str(row["id"])

    def _analisar(rows):
        novos = atualizacoes = ignorados = 0
        avisos = []
        amostra = []
        for row in rows:
            p = _map_row(row)
            if p.get("_erro"):
                ignorados += 1
                avisos.append({"linha": p.get("_linha"), "msg": p["_erro"]})
                continue
            if not p.get("_doc_valido") and (p.get("cnpj") or p.get("cpf")):
                avisos.append({"linha": p.get("_linha"), "msg": p.get("_doc_erro") or "Documento inválido"})
            ex = _buscar_existente(p)
            acao = "atualizar" if ex else "inserir"
            if ex:
                atualizacoes += 1
            else:
                novos += 1
            if len(amostra) < 8:
                amostra.append(
                    {
                        "linha": p.get("_linha"),
                        "nome": p.get("razao_social") or p.get("nome") or p.get("nome_fantasia") or "—",
                        "documento": p.get("cnpj") or p.get("cpf") or "—",
                        "cidade": p.get("cidade") or "—",
                        "acao": acao,
                    }
                )
        return {
            "total": len(rows),
            "novos": novos,
            "atualizacoes": atualizacoes,
            "ignorados": ignorados,
            "avisos": avisos[:50],
            "amostra": amostra,
        }

    def _executar(rows):
        inseridos = atualizados = ignorados = 0
        erros = []
        detalhes = []
        for row in rows:
            p = _map_row(row)
            linha = p.get("_linha")
            if p.get("_erro"):
                ignorados += 1
                erros.append({"linha": linha, "msg": p["_erro"]})
                continue
            try:
                acao, cid = _upsert_contato(p)
                if acao == "inserido":
                    inseridos += 1
                else:
                    atualizados += 1
                detalhes.append(
                    {
                        "linha": linha,
                        "acao": acao,
                        "id": cid,
                        "nome": p.get("razao_social") or p.get("nome") or "—",
                    }
                )
            except Exception as exc:
                ignorados += 1
                erros.append({"linha": linha, "msg": str(exc)})
        return {
            "inseridos": inseridos,
            "atualizados": atualizados,
            "ignorados": ignorados,
            "erros": erros[:100],
            "detalhes": detalhes[:100],
        }

    async def _ler_arquivo(request: Request):
        form = await request.form()
        arquivo = form.get("arquivo")
        if not arquivo or not getattr(arquivo, "filename", None):
            raise ValueError("Selecione um arquivo CSV")
        raw = await arquivo.read()
        if not raw:
            raise ValueError("Arquivo vazio")
        return _parse_csv_bytes(raw)

    @app.post("/api/cadastros/clientes/import/preview")
    async def api_import_clientes_preview(request: Request):
        try:
            rows = await _ler_arquivo(request)
            res = _analisar(rows)
            return {"ok": True, **res}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, status_code=400)

    @app.post("/api/cadastros/clientes/import")
    async def api_import_clientes_confirm(request: Request):
        try:
            rows = await _ler_arquivo(request)
            res = _executar(rows)
            kpis = resumo_contatos_cadastro(cliente=True)
            return {"ok": True, **res, "kpis": kpis}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, status_code=400)

    def _payload_fiscal_contato(item):
        """Payload completo para preenchimento NFS-e (aliases compatíveis)."""
        doc = (item.get("cnpj") or "").strip() or (item.get("cpf") or "").strip()
        ie = (item.get("inscricao_estadual") or "").strip() or (item.get("rg") or "").strip()
        razao = (item.get("razao_social") or "").strip()
        nome_pf = (item.get("nome") or "").strip()
        fantasia = (item.get("nome_fantasia") or "").strip()
        nome_exibir = razao or nome_pf or fantasia
        email_nfse = (item.get("email_nfse") or "").strip()
        email = (item.get("email") or "").strip()
        tel = (item.get("telefone") or "").strip()
        cel = (item.get("celular") or "").strip()
        cidade = (item.get("cidade") or "").strip()
        return {
            "id": item["id"],
            "codigo_cliente": item.get("codigo_cliente") or "",
            "tipo_pessoa": item.get("tipo_pessoa"),
            "nome": nome_exibir,
            "razao_social": razao or nome_exibir,
            "nome_fantasia": fantasia,
            "cpf_cnpj": doc,
            "cnpj_cpf": doc,
            "documento": doc,
            "cnpj": (item.get("cnpj") or "").strip(),
            "cpf": (item.get("cpf") or "").strip(),
            "inscricao_estadual": ie,
            "inscricao_municipal": (item.get("inscricao_municipal") or "").strip(),
            "ie_rg": ie,
            "contribuinte_icms": item.get("contribuinte_icms") or "",
            "endereco": (item.get("logradouro") or "").strip(),
            "logradouro": (item.get("logradouro") or "").strip(),
            "numero": (item.get("numero") or "").strip(),
            "complemento": (item.get("complemento") or "").strip(),
            "bairro": (item.get("bairro") or "").strip(),
            "cep": (item.get("cep") or "").strip(),
            "cidade": cidade,
            "municipio": cidade,
            "uf": (item.get("uf") or "").strip(),
            "telefone": tel,
            "celular": cel,
            "fone": tel or cel,
            "email_nfse": email_nfse,
            "email": email,
            "regime_tributario": (item.get("regime_tributario") or "").strip(),
            "condicao_pagamento": (item.get("condicao_pagamento") or item.get("prazo_recebimento") or "").strip(),
        }

    @app.get("/api/cadastros/contatos/{cid}/fiscal")
    def api_contato_fiscal_nfse(cid: str):
        """Dados fiscais do cliente para emissão NFS-e."""
        item = contato_cadastro_por_id(cid)
        if not item:
            return JSONResponse({"ok": False, "erro": "Cliente não encontrado"}, 404)
        return {"ok": True, "item": _payload_fiscal_contato(item)}
