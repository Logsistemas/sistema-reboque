"""Módulo Financeiro — contas, pagar, receber, caixa (registrado em app.py)."""
import mimetypes
import os
import uuid
from datetime import date, datetime
from urllib.parse import quote

from fastapi import Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse


def init_financeiro_tables(cur):
    cur.execute("""
        create table if not exists financeiro_contas_financeiras (
          id uuid primary key default uuid_generate_v4(),
          nome text not null,
          tipo text default 'Banco',
          banco text,
          agencia text,
          conta text,
          saldo_inicial numeric(14,2) default 0,
          saldo_atual numeric(14,2) default 0,
          status text default 'ativo',
          observacoes text,
          created_at timestamp default now(),
          updated_at timestamp default now()
        );""")
    cur.execute("""
        create table if not exists financeiro_contas_pagar (
          id uuid primary key default uuid_generate_v4(),
          fornecedor text,
          descricao text,
          categoria text,
          competencia date,
          emissao date,
          vencimento date,
          valor numeric(14,2) default 0,
          parcelas integer default 1,
          conta_financeira_id uuid,
          forma_pagamento text,
          status text default 'em_aberto',
          observacoes text,
          data_pagamento date,
          valor_pago numeric(14,2) default 0,
          created_at timestamp default now(),
          updated_at timestamp default now()
        );""")
    cur.execute("""
        create table if not exists financeiro_contas_receber (
          id uuid primary key default uuid_generate_v4(),
          cliente text,
          descricao text,
          categoria text,
          competencia date,
          emissao date,
          vencimento date,
          valor numeric(14,2) default 0,
          parcelas integer default 1,
          conta_financeira_id uuid,
          forma_recebimento text,
          status text default 'em_aberto',
          observacoes text,
          data_recebimento date,
          valor_recebido numeric(14,2) default 0,
          created_at timestamp default now(),
          updated_at timestamp default now()
        );""")
    cur.execute("""
        create table if not exists financeiro_movimentacoes (
          id uuid primary key default uuid_generate_v4(),
          conta_financeira_id uuid,
          tipo text not null,
          origem text,
          origem_id uuid,
          descricao text,
          valor numeric(14,2) default 0,
          data_movimento date default current_date,
          status text default 'confirmado',
          created_at timestamp default now()
        );""")
    cur.execute("""
        create table if not exists financeiro_anexos (
          id uuid primary key default uuid_generate_v4(),
          referencia_tipo text not null,
          referencia_id uuid not null,
          nome_arquivo text,
          nome_salvo text,
          extensao text,
          tipo text,
          caminho_arquivo text,
          mime_type text,
          created_at timestamp default now()
        );""")
    cur.execute("""
        create table if not exists financeiro_categorias (
          id uuid primary key default uuid_generate_v4(),
          natureza text not null,
          tipo_categoria text not null,
          descricao text not null,
          grupo_dre text,
          categoria_pai_id uuid references financeiro_categorias(id) on delete set null,
          ordem integer default 0,
          created_at timestamp default now(),
          updated_at timestamp default now(),
          unique (natureza, tipo_categoria, descricao)
        );""")
    for stmt in (
        "alter table financeiro_contas_pagar add column if not exists numero_documento text;",
        "alter table financeiro_contas_pagar add column if not exists tipo_pagamento text;",
        "alter table financeiro_contas_pagar add column if not exists juros numeric(14,2) default 0;",
        "alter table financeiro_contas_pagar add column if not exists desconto numeric(14,2) default 0;",
        "alter table financeiro_contas_pagar add column if not exists multa numeric(14,2) default 0;",
        "alter table financeiro_contas_pagar add column if not exists tarifa numeric(14,2) default 0;",
        "alter table financeiro_contas_receber add column if not exists numero_documento text;",
        "alter table financeiro_contas_receber add column if not exists tipo_recebimento text;",
        "alter table financeiro_movimentacoes add column if not exists categoria text;",
        "alter table financeiro_anexos add column if not exists mime_type text;",
        "alter table financeiro_anexos add column if not exists nome_salvo text;",
        "alter table financeiro_contas_pagar add column if not exists categoria_id uuid references financeiro_categorias(id);",
        "alter table financeiro_contas_receber add column if not exists categoria_id uuid references financeiro_categorias(id);",
        "alter table financeiro_movimentacoes add column if not exists categoria_id uuid references financeiro_categorias(id);",
    ):
        cur.execute(stmt)


def register(app, templates):
    import app as main

    q = main.q
    one = main.one
    fmt_moeda = main.fmt_moeda
    dt_str = main.dt_str
    _parse_data = main._parse_data_controle
    _num = main._num_controle
    _txt = main._txt_controle
    _status = main._status_cad
    UPLOAD = getattr(main, "FINANCEIRO_UPLOAD_DIR", os.path.join("static", "uploads", "financeiro"))

    os.makedirs(UPLOAD, exist_ok=True)

    def _fmt_valor(v):
        return fmt_moeda(float(v or 0))

    def _status_efetivo_pagar(item):
        st = (item.get("status") or "em_aberto").lower()
        if st == "em_aberto" and item.get("vencimento"):
            v = item["vencimento"]
            if hasattr(v, "strftime"):
                if v < date.today():
                    return "atrasado"
        return st

    def _status_efetivo_receber(item):
        return _status_efetivo_pagar(item)

    def atualizar_saldo_conta(cid, delta):
        q(
            "update financeiro_contas_financeiras set saldo_atual = coalesce(saldo_atual,0) + %s, updated_at=now() where id=%s",
            (float(delta), str(cid)),
        )

    def criar_movimentacao(conta_id, tipo, origem, origem_id, descricao, valor, data_mov=None, categoria_id=None, categoria=None):
        cat_id = (categoria_id or "").strip() or None
        cat_txt = _txt(categoria)
        if cat_id and not cat_txt:
            cat_row = categoria_por_id(cat_id)
            if cat_row:
                cat_txt = cat_row.get("descricao")
        row = one(
            """
            insert into financeiro_movimentacoes (
              conta_financeira_id, tipo, origem, origem_id, descricao, valor, data_movimento, status,
              categoria_id, categoria
            ) values (%s,%s,%s,%s,%s,%s,%s,'confirmado',%s,%s) returning id
            """,
            (
                str(conta_id),
                tipo,
                origem,
                str(origem_id) if origem_id else None,
                _txt(descricao, 500),
                float(valor),
                data_mov or date.today(),
                cat_id,
                cat_txt,
            ),
        )
        delta = float(valor) if tipo == "entrada" else -float(valor)
        atualizar_saldo_conta(conta_id, delta)
        return str(row["id"]) if row else None

    def normalizar_conta_fin(r):
        if not r:
            return None
        i = dict(r)
        i["id"] = str(i["id"])
        i["saldo_inicial"] = float(i.get("saldo_inicial") or 0)
        i["saldo_atual"] = float(i.get("saldo_atual") or 0)
        i["saldo_inicial_fmt"] = _fmt_valor(i["saldo_inicial"])
        i["saldo_atual_fmt"] = _fmt_valor(i["saldo_atual"])
        i["status"] = _status(i.get("status"))
        return i

    def listar_contas_financeiras():
        return [normalizar_conta_fin(r) for r in q(
            "select * from financeiro_contas_financeiras order by nome asc", fetch=True
        )]

    def conta_fin_por_id(cid):
        return normalizar_conta_fin(one("select * from financeiro_contas_financeiras where id=%s", (str(cid),)))

    def salvar_conta_fin(payload):
        p = payload or {}
        cid = (p.get("id") or "").strip()
        nome = _txt(p.get("nome"))
        if not nome:
            raise ValueError("Nome da conta é obrigatório")
        saldo_ini = _num(p.get("saldo_inicial"))
        saldo_atual_in = p.get("saldo_atual")
        if saldo_atual_in is None or str(saldo_atual_in).strip() == "":
            saldo_atual = saldo_ini
        else:
            saldo_atual = _num(saldo_atual_in, saldo_ini)
        tipo = _txt(p.get("tipo")) or "Banco"
        banco = _txt(p.get("banco"))
        agencia = _txt(p.get("agencia"))
        conta = _txt(p.get("conta"))
        status = _status(p.get("status"))
        observacoes = _txt(p.get("observacoes"))
        if cid:
            row_old = one("select saldo_inicial, saldo_atual from financeiro_contas_financeiras where id=%s", (cid,))
            saldo_atual = float(row_old.get("saldo_atual") or 0) if row_old else saldo_ini
            if row_old and float(row_old.get("saldo_inicial") or 0) != saldo_ini:
                diff_ini = saldo_ini - float(row_old.get("saldo_inicial") or 0)
                saldo_atual += diff_ini
            q(
                """
                update financeiro_contas_financeiras set
                  nome=%s, tipo=%s, banco=%s, agencia=%s, conta=%s,
                  saldo_inicial=%s, saldo_atual=%s, status=%s, observacoes=%s, updated_at=now()
                where id=%s
                """,
                (
                    nome,
                    tipo,
                    banco,
                    agencia,
                    conta,
                    saldo_ini,
                    saldo_atual,
                    status,
                    observacoes,
                    cid,
                ),
            )
        else:
            row = one(
                """
                insert into financeiro_contas_financeiras (
                  nome, tipo, banco, agencia, conta, saldo_inicial, saldo_atual, status, observacoes, updated_at
                ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,now()) returning id
                """,
                (
                    nome,
                    tipo,
                    banco,
                    agencia,
                    conta,
                    saldo_ini,
                    saldo_atual,
                    status,
                    observacoes,
                ),
            )
            cid = str(row["id"])
        return conta_fin_por_id(cid)

    def excluir_conta_fin(cid):
        q("delete from financeiro_contas_financeiras where id=%s", (str(cid),))

    def _anexo_caminho_fisico(caminho_arquivo):
        p = (caminho_arquivo or "").strip().lstrip("/")
        if not p:
            return ""
        if p.startswith("static/"):
            return p
        return os.path.join("static", p)

    def normalizar_anexo(a):
        if not a:
            return None
        row = dict(a)
        row["id"] = str(row["id"])
        row["referencia_id"] = str(row.get("referencia_id") or "")
        row["created_at_fmt"] = dt_str(row.get("created_at"))
        caminho = (row.get("caminho_arquivo") or "").strip()
        if caminho and not caminho.startswith("/"):
            caminho = f"/{caminho}"
        row["caminho_arquivo"] = caminho
        row["url_download"] = f"/api/financeiro/anexos/{row['id']}/download"
        row["mime_type"] = row.get("mime_type") or ""
        row["nome_salvo"] = row.get("nome_salvo") or ""
        return row

    def _meta_anexos_item(i, r, com_lista=False):
        if com_lista and i.get("anexos"):
            qtd = len(i["anexos"])
        else:
            qtd = int(r.get("qtd_anexos") or 0)
        i["qtd_anexos"] = qtd
        i["tem_anexos"] = qtd > 0
        return i

    def listar_anexos(tipo, rid):
        rows = q(
            "select * from financeiro_anexos where referencia_tipo=%s and referencia_id=%s order by created_at desc",
            (tipo, str(rid)),
            fetch=True,
        )
        return [normalizar_anexo(r) for r in rows]

    async def salvar_anexo(tipo, rid, form, arquivo):
        if not arquivo or not getattr(arquivo, "filename", None):
            raise ValueError("Arquivo obrigatório")
        pasta = os.path.join(UPLOAD, tipo, str(rid))
        os.makedirs(pasta, exist_ok=True)
        ext = os.path.splitext(arquivo.filename)[1].lower()
        fname = f"{uuid.uuid4().hex}{ext}"
        path = os.path.join(pasta, fname)
        content = await arquivo.read()
        if not content:
            raise ValueError("Arquivo vazio")
        with open(path, "wb") as f:
            f.write(content)
        if not os.path.isfile(path):
            raise ValueError("Falha ao gravar arquivo no servidor")
        caminho = f"/static/uploads/financeiro/{tipo}/{rid}/{fname}"
        nome = _txt(form.get("nome")) or arquivo.filename
        tipo_doc = _txt(form.get("tipo")) or "Outros"
        mime = getattr(arquivo, "content_type", None) or mimetypes.guess_type(arquivo.filename)[0] or "application/octet-stream"
        row = one(
            """
            insert into financeiro_anexos (
              referencia_tipo, referencia_id, nome_arquivo, nome_salvo, extensao, tipo, caminho_arquivo, mime_type
            ) values (%s,%s,%s,%s,%s,%s,%s,%s) returning id
            """,
            (tipo, str(rid), nome, fname, ext.lstrip("."), tipo_doc, caminho, mime),
        )
        if not row:
            raise ValueError("Falha ao registrar anexo no banco")
        return str(row["id"])

    def excluir_anexo(aid):
        row = one("select * from financeiro_anexos where id=%s", (str(aid),))
        if not row:
            raise ValueError("Anexo não encontrado")
        path = _anexo_caminho_fisico(row.get("caminho_arquivo"))
        if path and os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass
        q("delete from financeiro_anexos where id=%s", (str(aid),))
        return dict(row)

    def anexo_por_id(aid):
        row = one("select * from financeiro_anexos where id=%s", (str(aid),))
        return normalizar_anexo(row) if row else None

    def categoria_por_id(cid):
        if not cid:
            return None
        row = one(
            """
            select cat.*, pai.descricao as pai_descricao
              from financeiro_categorias cat
              left join financeiro_categorias pai on pai.id = cat.categoria_pai_id
             where cat.id=%s
            """,
            (str(cid),),
        )
        return normalizar_categoria(row) if row else None

    def normalizar_categoria(r):
        if not r:
            return None
        c = dict(r)
        c["id"] = str(c["id"])
        if c.get("categoria_pai_id"):
            c["categoria_pai_id"] = str(c["categoria_pai_id"])
        desc = (c.get("descricao") or "").strip()
        pai = (c.get("pai_descricao") or "").strip()
        if c.get("tipo_categoria") == "Subcategoria" and pai:
            c["label"] = f"{pai} › {desc}"
        else:
            c["label"] = desc
        c["grupo_dre"] = (c.get("grupo_dre") or "").strip()
        return c

    def _aplicar_categoria_item(i):
        if not i:
            return i
        if i.get("categoria_id"):
            i["categoria_id"] = str(i["categoria_id"])
        else:
            i["categoria_id"] = None
        desc = (i.get("categoria_desc") or i.get("categoria") or "").strip()
        pai = (i.get("categoria_pai_desc") or "").strip()
        tipo_cat = (i.get("categoria_tipo") or "").strip()
        if tipo_cat == "Subcategoria" and pai and desc:
            i["categoria_label"] = f"{pai} › {desc}"
        elif desc:
            i["categoria_label"] = desc
        else:
            i["categoria_label"] = "-"
        if i.get("categoria_grupo_dre"):
            i["grupo_dre"] = i["categoria_grupo_dre"]
        if desc:
            i["categoria"] = desc
        for k in ("categoria_desc", "categoria_pai_desc", "categoria_tipo", "categoria_grupo_dre"):
            i.pop(k, None)
        return i

    def _resolver_categoria_payload(payload, item=None, natureza="Despesa"):
        payload = payload or {}
        cid = (payload.get("categoria_id") or "").strip()
        if not cid and item:
            cid = (item.get("categoria_id") or "").strip()
        if cid:
            cat = categoria_por_id(cid)
            if not cat:
                raise ValueError("Categoria não encontrada")
            if natureza and cat.get("natureza") != natureza:
                raise ValueError(f"Categoria deve ser de natureza {natureza}")
            return str(cat["id"]), cat.get("descricao") or "", cat.get("grupo_dre") or ""
        txt = _txt(payload.get("categoria")) or _txt((item or {}).get("categoria"))
        if txt:
            row = one(
                """
                select id, descricao, grupo_dre from financeiro_categorias
                 where natureza=%s and descricao ilike %s
                 order by ordem asc limit 1
                """,
                (natureza, txt),
            )
            if row:
                return str(row["id"]), row["descricao"], row.get("grupo_dre") or ""
        return None, txt, None

    def listar_categorias_hierarquia(natureza=None):
        wh, params = [], []
        if natureza:
            wh.append("natureza = %s")
            params.append(natureza)
        where = f"where {' and '.join(wh)}" if wh else ""
        rows = q(
            f"select * from financeiro_categorias {where} order by ordem asc, descricao asc",
            tuple(params) if params else None,
            fetch=True,
        )
        by_id = {}
        grupos = []
        for r in rows:
            rid = str(r["id"])
            by_id[rid] = {
                "id": rid,
                "natureza": r.get("natureza") or "",
                "tipo_categoria": r.get("tipo_categoria") or "",
                "descricao": r.get("descricao") or "",
                "grupo_dre": r.get("grupo_dre") or "",
                "categoria_pai_id": str(r["categoria_pai_id"]) if r.get("categoria_pai_id") else None,
                "subcategorias": [],
            }
        for r in rows:
            c = by_id[str(r["id"])]
            if r.get("tipo_categoria") == "Categoria Principal":
                grupos.append(c)
            elif c["categoria_pai_id"] and c["categoria_pai_id"] in by_id:
                by_id[c["categoria_pai_id"]]["subcategorias"].append(
                    {k: v for k, v in c.items() if k != "subcategorias"}
                )
            else:
                grupos.append(c)
        flat = []
        for g in grupos:
            flat.append(
                {
                    "id": g["id"],
                    "descricao": g["descricao"],
                    "label": g["descricao"],
                    "grupo_dre": g.get("grupo_dre") or "",
                    "tipo_categoria": g.get("tipo_categoria") or "",
                    "nivel": "principal",
                }
            )
            for s in g.get("subcategorias", []):
                flat.append(
                    {
                        **s,
                        "label": f"{g['descricao']} › {s['descricao']}",
                        "nivel": "sub",
                        "pai_descricao": g["descricao"],
                    }
                )
        return {"grupos": grupos, "flat": flat}

    def preview_dre_agrupamento(filtros=None):
        f = filtros or {}
        wh = [
            "m.categoria_id is not null",
            "coalesce(cat.grupo_dre, '') <> ''",
            "cat.grupo_dre <> 'Não exibir DRE'",
        ]
        params = []
        if f.get("data_ini"):
            wh.append("m.data_movimento >= %s")
            params.append(_parse_data(f["data_ini"]))
        if f.get("data_fim"):
            wh.append("m.data_movimento <= %s")
            params.append(_parse_data(f["data_fim"]))
        rows = q(
            f"""
            select cat.grupo_dre,
                   cat.natureza,
                   coalesce(sum(m.valor) filter (where m.tipo = 'entrada'), 0) as entradas,
                   coalesce(sum(m.valor) filter (where m.tipo = 'saida'), 0) as saidas,
                   count(*)::int as qtd_movimentos
              from financeiro_movimentacoes m
              join financeiro_categorias cat on cat.id = m.categoria_id
             where {' and '.join(wh)}
             group by cat.grupo_dre, cat.natureza
             order by cat.natureza desc, cat.grupo_dre asc
            """,
            tuple(params) if params else None,
            fetch=True,
        )
        out = []
        for r in rows or []:
            ent = float(r.get("entradas") or 0)
            sai = float(r.get("saidas") or 0)
            out.append(
                {
                    "grupo_dre": r.get("grupo_dre") or "",
                    "natureza": r.get("natureza") or "",
                    "entradas": ent,
                    "entradas_fmt": _fmt_valor(ent),
                    "saidas": sai,
                    "saidas_fmt": _fmt_valor(sai),
                    "saldo": ent - sai,
                    "saldo_fmt": _fmt_valor(ent - sai),
                    "qtd_movimentos": int(r.get("qtd_movimentos") or 0),
                }
            )
        return out

    _SQL_CAT_SELECT = """
        cat.descricao as categoria_desc,
        cat.grupo_dre as categoria_grupo_dre,
        cat.tipo_categoria as categoria_tipo,
        cat_pai.descricao as categoria_pai_desc
    """

    _SQL_CAT_JOIN = """
        left join financeiro_categorias cat on cat.id = {alias}.categoria_id
        left join financeiro_categorias cat_pai on cat_pai.id = cat.categoria_pai_id
    """

    def normalizar_pagar(r, com_anexos=False):
        if not r:
            return None
        i = dict(r)
        i["id"] = str(i["id"])
        if i.get("conta_financeira_id"):
            i["conta_financeira_id"] = str(i["conta_financeira_id"])
        i["valor"] = float(i.get("valor") or 0)
        i["valor_fmt"] = _fmt_valor(i["valor"])
        i["valor_pago"] = float(i.get("valor_pago") or 0)
        i["valor_pago_fmt"] = _fmt_valor(i.get("valor_pago"))
        i["juros"] = float(i.get("juros") or 0)
        i["desconto"] = float(i.get("desconto") or 0)
        i["multa"] = float(i.get("multa") or 0)
        i["tarifa"] = float(i.get("tarifa") or 0)
        i["status"] = _status_efetivo_pagar(i)
        i["conta_nome"] = i.get("conta_nome") or "-"
        for d in ("competencia", "emissao", "vencimento", "data_pagamento"):
            v = i.get(d)
            if v and hasattr(v, "strftime"):
                i[d] = v.strftime("%Y-%m-%d")
                i[d + "_fmt"] = v.strftime("%d/%m/%Y")
        if com_anexos:
            i["anexos"] = listar_anexos("pagar", i["id"])
        _meta_anexos_item(i, r, com_lista=com_anexos)
        i["historico"] = (i.get("descricao") or "").strip() or "-"
        return _aplicar_categoria_item(i)

    def _filtros_sql_pagar(filtros=None):
        f = filtros or {}
        wh = ["coalesce(p.status,'') <> 'cancelado'"]
        params = []
        sit = (f.get("situacao") or "").lower()
        if sit == "em_aberto":
            wh.append("p.status = 'em_aberto'")
        elif sit == "pago":
            wh.append("p.status = 'pago'")
        elif sit == "vencido":
            wh.append("p.status = 'em_aberto' and p.vencimento < current_date")
        if f.get("categoria"):
            wh.append(
                """(
                  coalesce(p.categoria,'') ilike %s
                  or coalesce(cat.descricao,'') ilike %s
                  or coalesce(cat_pai.descricao,'') ilike %s
                )"""
            )
            b = f"%{f['categoria']}%"
            params.extend([b, b, b])
        if f.get("tipo_pagamento"):
            wh.append("coalesce(p.tipo_pagamento,'') ilike %s")
            params.append(f"%{f['tipo_pagamento']}%")
        if f.get("forma_pagamento"):
            wh.append("coalesce(p.forma_pagamento,'') ilike %s")
            params.append(f"%{f['forma_pagamento']}%")
        if f.get("valor_min") not in (None, ""):
            wh.append("p.valor >= %s")
            params.append(_num(f.get("valor_min")))
        if f.get("valor_max") not in (None, ""):
            wh.append("p.valor <= %s")
            params.append(_num(f.get("valor_max")))
        if f.get("numero_documento"):
            wh.append("coalesce(p.numero_documento,'') ilike %s")
            params.append(f"%{f['numero_documento']}%")
        if f.get("conta_financeira_id"):
            wh.append("p.conta_financeira_id = %s")
            params.append(str(f["conta_financeira_id"]))
        if f.get("data_ini"):
            wh.append("p.vencimento >= %s")
            params.append(_parse_data(f["data_ini"]))
        if f.get("data_fim"):
            wh.append("p.vencimento <= %s")
            params.append(_parse_data(f["data_fim"]))
        if f.get("busca"):
            wh.append(
                """(
                  coalesce(p.fornecedor,'') ilike %s or coalesce(p.descricao,'') ilike %s
                  or coalesce(p.observacoes,'') ilike %s or coalesce(p.numero_documento,'') ilike %s
                )"""
            )
            b = f"%{f['busca']}%"
            params.extend([b, b, b, b])
        return " and ".join(wh), params

    def resumo_painel_pagar(filtros=None):
        where, params = _filtros_sql_pagar(filtros)
        row = one(
            f"""
            select count(*)::int as qtd, coalesce(sum(p.valor),0) as total
              from financeiro_contas_pagar p
              {_SQL_CAT_JOIN.format(alias='p')}
             where {where}
            """,
            tuple(params) if params else None,
        ) or {}
        total = float(row.get("total") or 0)
        return {
            "quantidade": int(row.get("qtd") or 0),
            "valor_total": total,
            "valor_total_fmt": _fmt_valor(total),
        }

    def listar_pagar(filtros=None):
        where, params = _filtros_sql_pagar(filtros)
        rows = q(
            f"""
            select p.*, c.nome as conta_nome,
                   coalesce(a.qtd_anexos, 0) as qtd_anexos,
                   {_SQL_CAT_SELECT}
              from financeiro_contas_pagar p
              left join financeiro_contas_financeiras c on c.id = p.conta_financeira_id
              {_SQL_CAT_JOIN.format(alias='p')}
              left join (
                select referencia_id, count(*)::int as qtd_anexos
                  from financeiro_anexos
                 where referencia_tipo = 'pagar'
                 group by referencia_id
              ) a on a.referencia_id = p.id
             where {where}
             order by p.vencimento asc nulls last, p.created_at desc
            """,
            tuple(params) if params else None,
            fetch=True,
        )
        return [normalizar_pagar(r) for r in rows]

    def pagar_por_id(pid):
        r = one(
            f"""
            select p.*, c.nome as conta_nome,
                   {_SQL_CAT_SELECT}
              from financeiro_contas_pagar p
              left join financeiro_contas_financeiras c on c.id = p.conta_financeira_id
              {_SQL_CAT_JOIN.format(alias='p')}
             where p.id=%s
            """,
            (str(pid),),
        )
        return normalizar_pagar(r, com_anexos=True) if r else None

    def salvar_pagar(payload):
        p = payload or {}
        pid = (p.get("id") or "").strip()
        valor = _num(p.get("valor"))
        if valor <= 0:
            raise ValueError("Valor deve ser maior que zero")
        status_req = (p.get("status") or "em_aberto").lower()
        if pid:
            atual = pagar_por_id(pid)
            if not atual:
                raise ValueError("Conta a pagar não encontrada")
            st_atual = atual.get("status")
            if status_req == "pago" and st_atual != "pago":
                raise ValueError("Use Baixar/Pagar para quitar — o cadastro não altera o banco.")
            if st_atual == "pago" and status_req != "pago":
                status_req = "pago"
            else:
                status_req = st_atual if st_atual in ("pago", "cancelado") else status_req
        else:
            status_req = "em_aberto"
        categoria_id, categoria_txt, _ = _resolver_categoria_payload(p, natureza="Despesa")
        params = (
            _txt(p.get("fornecedor")),
            _txt(p.get("descricao")),
            categoria_txt,
            categoria_id,
            _parse_data(p.get("competencia")),
            _parse_data(p.get("emissao")),
            _parse_data(p.get("vencimento")),
            valor,
            int(_num(p.get("parcelas"), 1)) or 1,
            (p.get("conta_financeira_id") or "").strip() or None,
            _txt(p.get("forma_pagamento")),
            _txt(p.get("tipo_pagamento")),
            _txt(p.get("numero_documento")),
            status_req,
            _txt(p.get("observacoes")),
        )
        if pid:
            q(
                """
                update financeiro_contas_pagar set
                  fornecedor=%s, descricao=%s, categoria=%s, categoria_id=%s, competencia=%s, emissao=%s, vencimento=%s,
                  valor=%s, parcelas=%s, conta_financeira_id=%s, forma_pagamento=%s,
                  tipo_pagamento=%s, numero_documento=%s, status=%s,
                  observacoes=%s, updated_at=now()
                where id=%s
                """,
                params + (pid,),
            )
        else:
            row = one(
                """
                insert into financeiro_contas_pagar (
                  fornecedor, descricao, categoria, categoria_id, competencia, emissao, vencimento,
                  valor, parcelas, conta_financeira_id, forma_pagamento,
                  tipo_pagamento, numero_documento, status, observacoes, updated_at
                ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now()) returning id
                """,
                params,
            )
            pid = str(row["id"])
        return pagar_por_id(pid)

    def _valor_pago_baixa(valor_orig, payload):
        juros = _num(payload.get("juros"), 0)
        desconto = _num(payload.get("desconto"), 0)
        multa = _num(payload.get("multa"), 0)
        tarifa = _num(payload.get("tarifa"), 0)
        vp_raw = payload.get("valor_pago")
        if vp_raw in (None, ""):
            vp_raw = payload.get("valor")
        if vp_raw not in (None, ""):
            vp = _num(vp_raw, 0)
        else:
            vp = float(valor_orig or 0) + juros + multa + tarifa - desconto
        if vp < 0:
            raise ValueError("Valor pago não pode ser negativo")
        return vp, juros, desconto, multa, tarifa

    def baixa_lote_pagar(ids, payload=None):
        payload = payload or {}
        if payload.get("itens"):
            return _baixa_lote_pagar_detalhado(payload)
        ok, erros = [], []
        for pid in ids or []:
            try:
                baixa_pagar(str(pid), payload)
                ok.append(str(pid))
            except Exception as exc:
                erros.append({"id": str(pid), "erro": str(exc)})
        return ok, erros

    def _baixa_lote_pagar_detalhado(payload):
        itens = payload.get("itens") or []
        agrupado = str(payload.get("agrupado") or "").lower() in ("1", "true", "on", "sim")
        cat_unica = str(payload.get("categoria_unica", "true")).lower() not in ("0", "false", "off", "nao", "não")
        conta_global = (payload.get("conta_financeira_id") or "").strip()
        data_global = payload.get("data_pagamento")
        cat_global = _txt(payload.get("categoria"))
        cat_global_id = (payload.get("categoria_id") or "").strip()
        hist_global = _txt(payload.get("historico"))
        if agrupado and not conta_global:
            for it in itens:
                cid = (it.get("conta_financeira_id") or "").strip()
                if cid:
                    conta_global = cid
                    break
        ok, erros, pend_mov = [], [], []

        for it in itens:
            pid = str(it.get("id") or "").strip()
            if not pid:
                continue
            item_payload = dict(payload)
            item_payload.update(it)
            if cat_unica and cat_global_id and not (it.get("categoria_id") or "").strip():
                item_payload["categoria_id"] = cat_global_id
            elif cat_unica and cat_global and not _txt(it.get("categoria")):
                item_payload["categoria"] = cat_global
            if conta_global and not (item_payload.get("conta_financeira_id") or "").strip():
                item_payload["conta_financeira_id"] = conta_global
            if data_global and not item_payload.get("data_pagamento"):
                item_payload["data_pagamento"] = data_global
            if hist_global and not _txt(it.get("historico")):
                item_payload["historico"] = hist_global
            try:
                res = baixa_pagar(pid, item_payload, skip_movimentacao=agrupado)
                ok.append(pid)
                if agrupado:
                    pend_mov.append(res)
            except Exception as exc:
                erros.append({"id": pid, "erro": str(exc)})

        if agrupado and pend_mov:
            conta_id = conta_global or pend_mov[0].get("conta_id")
            if not conta_id:
                raise ValueError("Selecione a conta financeira de destino")
            total = sum(float(p.get("valor_pago") or 0) for p in pend_mov)
            data_pg = _parse_data(data_global) or pend_mov[0].get("data_pg") or date.today()
            hist = hist_global or f"Baixa agrupada — {len(pend_mov)} lançamento(s)"
            cat_id_lote = cat_global_id or pend_mov[0].get("categoria_id")
            cat_txt_lote = cat_global or pend_mov[0].get("categoria")
            criar_movimentacao(
                conta_id,
                "saida",
                "pagamento_lote",
                pend_mov[0].get("id"),
                hist,
                total,
                data_pg,
                categoria_id=cat_id_lote,
                categoria=cat_txt_lote,
            )
        return ok, erros

    def baixa_pagar(pid, payload=None, skip_movimentacao=False):
        payload = payload or {}
        item = pagar_por_id(pid)
        if not item:
            raise ValueError("Conta a pagar não encontrada")
        if item["status"] == "pago":
            raise ValueError("Esta conta já foi baixada")
        if item["status"] == "cancelado":
            raise ValueError("Lançamento cancelado")
        conta_id = (payload.get("conta_financeira_id") or item.get("conta_financeira_id") or "").strip()
        if not conta_id:
            raise ValueError("Selecione a conta financeira de destino")
        valor_pago, juros, desconto, multa, tarifa = _valor_pago_baixa(item["valor"], payload)
        data_pg = _parse_data(payload.get("data_pagamento"))
        if not data_pg:
            raise ValueError("Informe a data do pagamento")
        categoria_id, categoria, _ = _resolver_categoria_payload(payload, item, natureza="Despesa")
        historico = _txt(payload.get("historico")) or item.get("descricao") or item.get("fornecedor") or "Pagamento"
        q(
            """
            update financeiro_contas_pagar set
              status='pago', data_pagamento=%s, valor_pago=%s,
              juros=%s, desconto=%s, multa=%s, tarifa=%s,
              conta_financeira_id=%s, categoria=%s, categoria_id=%s, updated_at=now()
            where id=%s
            """,
            (
                data_pg,
                valor_pago,
                juros,
                desconto,
                multa,
                tarifa,
                conta_id,
                categoria,
                categoria_id,
                str(pid),
            ),
        )
        if not skip_movimentacao:
            criar_movimentacao(
                conta_id,
                "saida",
                "pagamento",
                pid,
                historico,
                valor_pago,
                data_pg,
                categoria_id=categoria_id,
                categoria=categoria,
            )
        return {
            "id": str(pid),
            "valor_pago": valor_pago,
            "conta_id": conta_id,
            "data_pg": data_pg,
            "historico": historico,
            "categoria_id": categoria_id,
            "categoria": categoria,
        }

    def excluir_pagar(pid):
        q("delete from financeiro_anexos where referencia_tipo='pagar' and referencia_id=%s", (str(pid),))
        q("delete from financeiro_contas_pagar where id=%s", (str(pid),))

    def normalizar_receber(r, com_anexos=False):
        if not r:
            return None
        i = dict(r)
        i["id"] = str(i["id"])
        if i.get("conta_financeira_id"):
            i["conta_financeira_id"] = str(i["conta_financeira_id"])
        i["valor"] = float(i.get("valor") or 0)
        i["valor_fmt"] = _fmt_valor(i["valor"])
        i["status"] = _status_efetivo_receber(i)
        i["conta_nome"] = i.get("conta_nome") or "-"
        for d in ("competencia", "emissao", "vencimento", "data_recebimento"):
            v = i.get(d)
            if v and hasattr(v, "strftime"):
                i[d] = v.strftime("%Y-%m-%d")
                i[d + "_fmt"] = v.strftime("%d/%m/%Y")
        if com_anexos:
            i["anexos"] = listar_anexos("receber", i["id"])
        _meta_anexos_item(i, r, com_lista=com_anexos)
        i["historico"] = (i.get("descricao") or "").strip() or "-"
        return _aplicar_categoria_item(i)

    def _filtros_sql_receber(filtros=None):
        f = filtros or {}
        wh = ["coalesce(r.status,'') <> 'cancelado'"]
        params = []
        sit = (f.get("situacao") or "").lower()
        if sit == "em_aberto":
            wh.append("r.status = 'em_aberto'")
        elif sit == "recebido":
            wh.append("r.status = 'recebido'")
        elif sit == "vencido":
            wh.append("r.status = 'em_aberto' and r.vencimento < current_date")
        if f.get("categoria"):
            wh.append(
                """(
                  coalesce(r.categoria,'') ilike %s
                  or coalesce(cat.descricao,'') ilike %s
                  or coalesce(cat_pai.descricao,'') ilike %s
                )"""
            )
            b = f"%{f['categoria']}%"
            params.extend([b, b, b])
        if f.get("tipo_recebimento"):
            wh.append("coalesce(r.tipo_recebimento,'') ilike %s")
            params.append(f"%{f['tipo_recebimento']}%")
        if f.get("forma_recebimento"):
            wh.append("coalesce(r.forma_recebimento,'') ilike %s")
            params.append(f"%{f['forma_recebimento']}%")
        if f.get("valor_min") not in (None, ""):
            wh.append("r.valor >= %s")
            params.append(_num(f.get("valor_min")))
        if f.get("valor_max") not in (None, ""):
            wh.append("r.valor <= %s")
            params.append(_num(f.get("valor_max")))
        if f.get("numero_documento"):
            wh.append("coalesce(r.numero_documento,'') ilike %s")
            params.append(f"%{f['numero_documento']}%")
        if f.get("conta_financeira_id"):
            wh.append("r.conta_financeira_id = %s")
            params.append(str(f["conta_financeira_id"]))
        if f.get("data_ini"):
            wh.append("r.vencimento >= %s")
            params.append(_parse_data(f["data_ini"]))
        if f.get("data_fim"):
            wh.append("r.vencimento <= %s")
            params.append(_parse_data(f["data_fim"]))
        if f.get("busca"):
            wh.append(
                """(
                  coalesce(r.cliente,'') ilike %s or coalesce(r.descricao,'') ilike %s
                  or coalesce(r.observacoes,'') ilike %s or coalesce(r.numero_documento,'') ilike %s
                )"""
            )
            b = f"%{f['busca']}%"
            params.extend([b, b, b, b])
        return " and ".join(wh), params

    def resumo_painel_receber(filtros=None):
        where, params = _filtros_sql_receber(filtros)
        row = one(
            f"""
            select count(*)::int as qtd, coalesce(sum(r.valor),0) as total
              from financeiro_contas_receber r
              {_SQL_CAT_JOIN.format(alias='r')}
             where {where}
            """,
            tuple(params) if params else None,
        ) or {}
        total = float(row.get("total") or 0)
        return {
            "quantidade": int(row.get("qtd") or 0),
            "valor_total": total,
            "valor_total_fmt": _fmt_valor(total),
        }

    def listar_receber(filtros=None):
        where, params = _filtros_sql_receber(filtros)
        rows = q(
            f"""
            select r.*, c.nome as conta_nome,
                   coalesce(a.qtd_anexos, 0) as qtd_anexos,
                   {_SQL_CAT_SELECT}
              from financeiro_contas_receber r
              left join financeiro_contas_financeiras c on c.id = r.conta_financeira_id
              {_SQL_CAT_JOIN.format(alias='r')}
              left join (
                select referencia_id, count(*)::int as qtd_anexos
                  from financeiro_anexos
                 where referencia_tipo = 'receber'
                 group by referencia_id
              ) a on a.referencia_id = r.id
             where {where}
             order by r.vencimento asc nulls last, r.created_at desc
            """,
            tuple(params) if params else None,
            fetch=True,
        )
        return [normalizar_receber(r) for r in rows]

    def receber_por_id(rid):
        r = one(
            f"""
            select r.*, c.nome as conta_nome,
                   {_SQL_CAT_SELECT}
              from financeiro_contas_receber r
              left join financeiro_contas_financeiras c on c.id = r.conta_financeira_id
              {_SQL_CAT_JOIN.format(alias='r')}
             where r.id=%s
            """,
            (str(rid),),
        )
        return normalizar_receber(r, com_anexos=True) if r else None

    def salvar_receber(payload):
        p = payload or {}
        rid = (p.get("id") or "").strip()
        valor = _num(p.get("valor"))
        if valor <= 0:
            raise ValueError("Valor deve ser maior que zero")
        status_req = (p.get("status") or "em_aberto").lower()
        if rid:
            atual = receber_por_id(rid)
            if not atual:
                raise ValueError("Conta a receber não encontrada")
            st_atual = atual.get("status")
            if status_req == "recebido" and st_atual != "recebido":
                raise ValueError("Use Receber/Baixar para quitar — o cadastro não altera o banco.")
            if st_atual == "recebido" and status_req != "recebido":
                status_req = "recebido"
            else:
                status_req = st_atual if st_atual in ("recebido", "cancelado") else status_req
        else:
            status_req = "em_aberto"
        categoria_id, categoria_txt, _ = _resolver_categoria_payload(p, natureza="Receita")
        params = (
            _txt(p.get("cliente")),
            _txt(p.get("descricao")),
            categoria_txt,
            categoria_id,
            _parse_data(p.get("competencia")),
            _parse_data(p.get("emissao")),
            _parse_data(p.get("vencimento")),
            valor,
            int(_num(p.get("parcelas"), 1)) or 1,
            (p.get("conta_financeira_id") or "").strip() or None,
            _txt(p.get("forma_recebimento")),
            _txt(p.get("tipo_recebimento")),
            _txt(p.get("numero_documento")),
            status_req,
            _txt(p.get("observacoes")),
        )
        if rid:
            q(
                """
                update financeiro_contas_receber set
                  cliente=%s, descricao=%s, categoria=%s, categoria_id=%s, competencia=%s, emissao=%s, vencimento=%s,
                  valor=%s, parcelas=%s, conta_financeira_id=%s, forma_recebimento=%s,
                  tipo_recebimento=%s, numero_documento=%s, status=%s,
                  observacoes=%s, updated_at=now()
                where id=%s
                """,
                params + (rid,),
            )
        else:
            row = one(
                """
                insert into financeiro_contas_receber (
                  cliente, descricao, categoria, categoria_id, competencia, emissao, vencimento,
                  valor, parcelas, conta_financeira_id, forma_recebimento,
                  tipo_recebimento, numero_documento, status, observacoes, updated_at
                ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now()) returning id
                """,
                params,
            )
            rid = str(row["id"])
        return receber_por_id(rid)

    def baixa_lote_receber(ids, payload=None):
        ok, erros = [], []
        for rid in ids or []:
            try:
                baixa_receber(str(rid), payload)
                ok.append(str(rid))
            except Exception as exc:
                erros.append({"id": str(rid), "erro": str(exc)})
        return ok, erros

    def baixa_receber(rid, payload=None):
        payload = payload or {}
        item = receber_por_id(rid)
        if not item:
            raise ValueError("Conta a receber não encontrada")
        if item["status"] == "recebido":
            raise ValueError("Já está recebida")
        if item["status"] == "cancelado":
            raise ValueError("Lançamento cancelado")
        conta_id = (payload.get("conta_financeira_id") or item.get("conta_financeira_id") or "").strip()
        if not conta_id:
            raise ValueError("Selecione a conta financeira de entrada")
        valor = _num(payload.get("valor"), item["valor"])
        data_rc = _parse_data(payload.get("data_recebimento")) or date.today()
        categoria_id, categoria, _ = _resolver_categoria_payload(payload, item, natureza="Receita")
        q(
            """
            update financeiro_contas_receber set
              status='recebido', data_recebimento=%s, valor_recebido=%s,
              conta_financeira_id=%s, categoria=%s, categoria_id=%s, updated_at=now()
            where id=%s
            """,
            (data_rc, valor, conta_id, categoria, categoria_id, str(rid)),
        )
        desc = item.get("descricao") or item.get("cliente") or "Recebimento"
        criar_movimentacao(
            conta_id,
            "entrada",
            "recebimento",
            rid,
            desc,
            valor,
            data_rc,
            categoria_id=categoria_id,
            categoria=categoria,
        )
        return receber_por_id(rid)

    def excluir_receber(rid):
        q("delete from financeiro_anexos where referencia_tipo='receber' and referencia_id=%s", (str(rid),))
        q("delete from financeiro_contas_receber where id=%s", (str(rid),))

    def _filtros_sql_movimentacoes(filtros=None, incluir_aba=True):
        f = filtros or {}
        wh = ["1=1"]
        params = []
        if f.get("conta_financeira_id"):
            wh.append("m.conta_financeira_id = %s")
            params.append(str(f["conta_financeira_id"]))
        if incluir_aba:
            aba = (f.get("aba") or "movimentacoes").lower()
            if aba == "entradas":
                wh.append("m.tipo = 'entrada'")
            elif aba == "saidas":
                wh.append("m.tipo = 'saida'")
        if f.get("data_ini"):
            wh.append("m.data_movimento >= %s")
            params.append(_parse_data(f["data_ini"]))
        if f.get("data_fim"):
            wh.append("m.data_movimento <= %s")
            params.append(_parse_data(f["data_fim"]))
        if f.get("busca"):
            wh.append(
                """(
                  coalesce(m.descricao,'') ilike %s or coalesce(m.categoria,'') ilike %s
                  or coalesce(cat.descricao,'') ilike %s or coalesce(cat_pai.descricao,'') ilike %s
                  or coalesce(pg.fornecedor,'') ilike %s or coalesce(rc.cliente,'') ilike %s
                )"""
            )
            b = f"%{f['busca']}%"
            params.extend([b, b, b, b, b, b])
        return " and ".join(wh), params

    def resumo_painel_caixa(filtros=None):
        f = filtros or {}
        conta_id = (f.get("conta_financeira_id") or "").strip()
        conta = conta_fin_por_id(conta_id) if conta_id else None
        f_resumo = {k: v for k, v in f.items() if k != "aba"}
        where, params = _filtros_sql_movimentacoes(f_resumo, incluir_aba=False)
        row = one(
            f"""
            select
              count(*)::int as qtd,
              coalesce(sum(m.valor) filter (where m.tipo='entrada'),0) as entradas,
              coalesce(sum(m.valor) filter (where m.tipo='saida'),0) as saidas
            from financeiro_movimentacoes m
            {_SQL_CAT_JOIN.format(alias='m')}
            left join financeiro_contas_pagar pg on pg.id = m.origem_id and m.origem in ('pagamento', 'pagamento_lote')
            left join financeiro_contas_receber rc on rc.id = m.origem_id and m.origem = 'recebimento'
            where {where}
            """,
            tuple(params) if params else None,
        ) or {}
        entradas = float(row.get("entradas") or 0)
        saidas = float(row.get("saidas") or 0)
        saldo_atual = float(conta.get("saldo_atual") or 0) if conta else 0
        saldo_ini = float(conta.get("saldo_inicial") or 0) if conta else 0
        tem_periodo = bool(f.get("data_ini") or f.get("data_fim"))
        if conta and tem_periodo:
            saldo_final = saldo_ini + entradas - saidas
        elif conta:
            saldo_final = saldo_atual
        else:
            saldo_final = 0
        return {
            "quantidade": int(row.get("qtd") or 0),
            "conta_id": conta_id or None,
            "saldo_atual": saldo_atual,
            "saldo_atual_fmt": _fmt_valor(saldo_atual),
            "saldo_inicial": saldo_ini,
            "saldo_inicial_fmt": _fmt_valor(saldo_ini),
            "entradas": entradas,
            "entradas_fmt": _fmt_valor(entradas),
            "saidas": saidas,
            "saidas_fmt": _fmt_valor(saidas),
            "saldo_final": saldo_final,
            "saldo_final_fmt": _fmt_valor(saldo_final),
        }

    def listar_movimentacoes(filtros=None):
        where, params = _filtros_sql_movimentacoes(filtros)
        rows = q(
            f"""
            select m.*, c.nome as conta_nome,
                   coalesce(pg.fornecedor, rc.cliente) as parte_nome,
                   {_SQL_CAT_SELECT}
              from financeiro_movimentacoes m
              left join financeiro_contas_financeiras c on c.id = m.conta_financeira_id
              {_SQL_CAT_JOIN.format(alias='m')}
              left join financeiro_contas_pagar pg on pg.id = m.origem_id and m.origem in ('pagamento', 'pagamento_lote')
              left join financeiro_contas_receber rc on rc.id = m.origem_id and m.origem = 'recebimento'
             where {where}
             order by m.data_movimento desc, m.created_at desc
            """,
            tuple(params) if params else None,
            fetch=True,
        )
        out = []
        for r in rows:
            m = dict(r)
            m["id"] = str(m["id"])
            if m.get("conta_financeira_id"):
                m["conta_financeira_id"] = str(m["conta_financeira_id"])
            m["valor"] = float(m.get("valor") or 0)
            m["valor_fmt"] = _fmt_valor(m["valor"])
            m["historico"] = (m.get("descricao") or "").strip() or "-"
            m = _aplicar_categoria_item(m)
            m["parte_nome"] = m.get("parte_nome") or "-"
            dv = m.get("data_movimento")
            if dv and hasattr(dv, "strftime"):
                m["data_movimento"] = dv.strftime("%Y-%m-%d")
                m["data_movimento_fmt"] = dv.strftime("%d/%m/%Y")
            elif isinstance(dv, str) and len(dv) >= 10:
                m["data_movimento"] = dv[:10]
                p = m["data_movimento"].split("-")
                if len(p) == 3:
                    m["data_movimento_fmt"] = f"{p[2]}/{p[1]}/{p[0]}"
            m["created_at_fmt"] = dt_str(m.get("created_at"))
            out.append(m)
        return out

    def salvar_movimentacao_manual(payload):
        p = payload or {}
        conta_id = (p.get("conta_financeira_id") or "").strip()
        if not conta_id:
            raise ValueError("Conta financeira obrigatória")
        tipo = (p.get("tipo") or "entrada").lower()
        if tipo not in ("entrada", "saida"):
            raise ValueError("Tipo inválido")
        valor = _num(p.get("valor"))
        if valor <= 0:
            raise ValueError("Valor inválido")
        data_mov = _parse_data(p.get("data_movimento")) or date.today()
        desc = _txt(p.get("descricao")) or "Lançamento manual"
        natureza = "Receita" if tipo == "entrada" else "Despesa"
        categoria_id, categoria, _ = _resolver_categoria_payload(p, natureza=natureza)
        mid = criar_movimentacao(
            conta_id,
            tipo,
            "manual",
            None,
            desc,
            valor,
            data_mov,
            categoria_id=categoria_id,
            categoria=categoria,
        )
        row = one(
            f"""
            select m.*, c.nome as conta_nome, {_SQL_CAT_SELECT}
              from financeiro_movimentacoes m
              left join financeiro_contas_financeiras c on c.id = m.conta_financeira_id
              {_SQL_CAT_JOIN.format(alias='m')}
             where m.id=%s
            """,
            (mid,),
        )
        if row:
            m = dict(row)
            m["id"] = str(m["id"])
            m["valor"] = float(m.get("valor") or 0)
            m["valor_fmt"] = _fmt_valor(m["valor"])
            return _aplicar_categoria_item(m)
        return None

    def resumo_hub_financeiro():
        pagar = one(
            """
            select
              coalesce(sum(valor) filter (where status='em_aberto'),0) as aberto,
              coalesce(sum(valor) filter (where status='em_aberto' and vencimento < current_date),0) as vencido_pagar,
              coalesce(sum(valor_pago) filter (
                where status='pago' and date_trunc('month', data_pagamento) = date_trunc('month', current_date)
              ),0) as pago_mes
            from financeiro_contas_pagar
            where status <> 'cancelado'
            """
        ) or {}
        receber = one(
            """
            select
              coalesce(sum(valor) filter (where status='em_aberto'),0) as aberto,
              coalesce(sum(valor) filter (where status='em_aberto' and vencimento < current_date),0) as vencido_receber,
              coalesce(sum(valor_recebido) filter (
                where status='recebido' and date_trunc('month', data_recebimento) = date_trunc('month', current_date)
              ),0) as recebido_mes
            from financeiro_contas_receber
            where status <> 'cancelado'
            """
        ) or {}
        saldo = one(
            "select coalesce(sum(saldo_atual),0) as total from financeiro_contas_financeiras where coalesce(status,'ativo')='ativo'"
        ) or {}
        return {
            "total_pagar": float(pagar.get("aberto") or 0),
            "total_receber": float(receber.get("aberto") or 0),
            "saldo_caixa": float(saldo.get("total") or 0),
            "vencidos": float(pagar.get("vencido_pagar") or 0) + float(receber.get("vencido_receber") or 0),
            "pago_mes": float(pagar.get("pago_mes") or 0),
            "recebido_mes": float(receber.get("recebido_mes") or 0),
            "total_pagar_fmt": _fmt_valor(pagar.get("aberto")),
            "total_receber_fmt": _fmt_valor(receber.get("aberto")),
            "saldo_caixa_fmt": _fmt_valor(saldo.get("total")),
            "vencidos_fmt": _fmt_valor(float(pagar.get("vencido_pagar") or 0) + float(receber.get("vencido_receber") or 0)),
            "pago_mes_fmt": _fmt_valor(pagar.get("pago_mes")),
            "recebido_mes_fmt": _fmt_valor(receber.get("recebido_mes")),
        }

    def historico_lancamento(tipo, lid):
        movs = q(
            """
            select m.*, c.nome as conta_nome from financeiro_movimentacoes m
            left join financeiro_contas_financeiras c on c.id = m.conta_financeira_id
            where origem=%s and origem_id=%s order by created_at desc
            """,
            ("pagamento" if tipo == "pagar" else "recebimento", str(lid)),
            fetch=True,
        )
        out = []
        for m in movs:
            h = dict(m, id=str(m["id"]))
            h["valor_fmt"] = _fmt_valor(h.get("valor"))
            dv = h.get("data_movimento")
            if dv and hasattr(dv, "strftime"):
                h["data_movimento_fmt"] = dv.strftime("%d/%m/%Y")
            out.append(h)
        return out

    MODULOS = [
        {"titulo": "Contas a Pagar", "icone": "📤", "descricao": "Despesas, fornecedores e pagamentos.", "rota": "/financeiro/contas-a-pagar"},
        {"titulo": "Contas a Receber", "icone": "📥", "descricao": "Receitas, clientes e cobranças.", "rota": "/financeiro/contas-a-receber"},
        {"titulo": "Caixa e Bancos", "icone": "🏦", "descricao": "Movimentações, entradas e saídas consolidadas.", "rota": "/financeiro/caixa-e-bancos"},
        {"titulo": "Notas Fiscais de Entrada", "icone": "📥", "descricao": "Importação de XML NF-e e lançamento em contas a pagar.", "rota": "/financeiro/notas-entrada"},
        {"titulo": "Contas Financeiras", "icone": "💳", "descricao": "Bancos, caixa físico e carteiras.", "rota": "/financeiro/contas-financeiras"},
    ]

    def tpl_ctx(request, extra=None):
        ctx = {"request": request, "nav_ativo": "financeiro", "nav_som": False}
        if extra:
            ctx.update(extra)
        return ctx

    @app.get("/financeiro", response_class=HTMLResponse)
    def financeiro_home(request: Request):
        k = resumo_hub_financeiro()
        mods = [{**m, "indicador": m["titulo"][:12]} for m in MODULOS]
        return templates.TemplateResponse("financeiro/hub.html", tpl_ctx(request, {"modulos": mods, "kpis": k}))

    @app.get("/financeiro/contas-financeiras", response_class=HTMLResponse)
    def fin_pagina_contas(request: Request):
        return templates.TemplateResponse("financeiro/contas_financeiras.html", tpl_ctx(request, {"kpis": resumo_hub_financeiro()}))

    @app.get("/financeiro/contas-a-pagar", response_class=HTMLResponse)
    def fin_pagina_pagar(request: Request):
        return templates.TemplateResponse("financeiro/contas_a_pagar.html", tpl_ctx(request, {"kpis": resumo_hub_financeiro()}))

    @app.get("/financeiro/contas-a-receber", response_class=HTMLResponse)
    def fin_pagina_receber(request: Request):
        return templates.TemplateResponse("financeiro/contas_a_receber.html", tpl_ctx(request, {"kpis": resumo_hub_financeiro()}))

    @app.get("/financeiro/caixa-e-bancos", response_class=HTMLResponse)
    def fin_pagina_caixa(request: Request):
        return templates.TemplateResponse("financeiro/caixa_e_bancos.html", tpl_ctx(request, {"kpis": resumo_hub_financeiro()}))

    # --- APIs contas financeiras ---
    @app.get("/api/financeiro/contas-financeiras")
    def api_fin_lista_contas():
        return {"ok": True, "itens": listar_contas_financeiras()}

    @app.get("/api/financeiro/contas-financeiras/{cid}")
    def api_fin_get_conta(cid: str):
        item = conta_fin_por_id(cid)
        if not item:
            return JSONResponse({"ok": False, "erro": "Não encontrada"}, 404)
        return {"ok": True, "item": item}

    @app.post("/api/financeiro/contas-financeiras")
    async def api_fin_post_conta(request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        try:
            return {"ok": True, "item": salvar_conta_fin(p)}
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.put("/api/financeiro/contas-financeiras/{cid}")
    async def api_fin_put_conta(cid: str, request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        p["id"] = cid
        try:
            return {"ok": True, "item": salvar_conta_fin(p)}
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.delete("/api/financeiro/contas-financeiras/{cid}")
    def api_fin_del_conta(cid: str):
        try:
            excluir_conta_fin(cid)
            return {"ok": True}
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.get("/api/financeiro/categorias")
    def api_fin_categorias(request: Request):
        natureza = (request.query_params.get("natureza") or "").strip() or None
        data = listar_categorias_hierarquia(natureza)
        return {"ok": True, **data}

    @app.get("/api/financeiro/dre/agrupamento")
    def api_fin_dre_agrupamento(request: Request):
        filtros = {
            "data_ini": request.query_params.get("data_ini"),
            "data_fim": request.query_params.get("data_fim"),
        }
        return {"ok": True, "grupos": preview_dre_agrupamento(filtros)}

    def _filtros_query(request: Request):
        qparams = request.query_params
        return {k: (qparams.get(k) or "").strip() or None for k in (
            "situacao", "categoria", "tipo_pagamento", "tipo_recebimento",
            "forma_pagamento", "forma_recebimento", "valor_min", "valor_max",
            "numero_documento", "conta_financeira_id", "busca", "data_ini", "data_fim", "aba",
        )}

    # --- APIs pagar ---
    @app.get("/api/financeiro/contas-pagar")
    def api_fin_lista_pagar(request: Request):
        filtros = _filtros_query(request)
        return {
            "ok": True,
            "itens": listar_pagar(filtros),
            "contas": listar_contas_financeiras(),
            "painel": resumo_painel_pagar(filtros),
            "kpis": resumo_hub_financeiro(),
        }

    @app.post("/api/financeiro/contas-pagar/baixa-lote")
    async def api_fin_baixa_lote_pagar(request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        ids = p.get("ids") or []
        if p.get("itens"):
            ok, erros = baixa_lote_pagar([], p)
        else:
            ok, erros = baixa_lote_pagar(ids, p)
        return {
            "ok": len(erros) == 0,
            "baixados": ok,
            "erros": erros,
            "kpis": resumo_hub_financeiro(),
            "painel": resumo_painel_pagar(),
            "mensagem": f"{len(ok)} pagamento(s) baixado(s)" if ok else "Nenhum pagamento baixado",
        }

    @app.get("/api/financeiro/contas-pagar/{pid}")
    def api_fin_get_pagar(pid: str):
        item = pagar_por_id(pid)
        if not item:
            return JSONResponse({"ok": False, "erro": "Não encontrado"}, 404)
        item["historico"] = historico_lancamento("pagar", pid)
        return {"ok": True, "item": item, "contas": listar_contas_financeiras()}

    @app.post("/api/financeiro/contas-pagar")
    async def api_fin_post_pagar(request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        try:
            return {
                "ok": True,
                "item": salvar_pagar(p),
                "painel": resumo_painel_pagar(),
                "kpis": resumo_hub_financeiro(),
            }
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.put("/api/financeiro/contas-pagar/{pid}")
    async def api_fin_put_pagar(pid: str, request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        p["id"] = pid
        try:
            return {
                "ok": True,
                "item": salvar_pagar(p),
                "painel": resumo_painel_pagar(),
                "kpis": resumo_hub_financeiro(),
            }
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.delete("/api/financeiro/contas-pagar/{pid}")
    def api_fin_del_pagar(pid: str):
        try:
            excluir_pagar(pid)
            return {"ok": True, "kpis": resumo_hub_financeiro()}
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.post("/api/financeiro/contas-pagar/{pid}/baixa")
    async def api_fin_baixa_pagar(pid: str, request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        try:
            baixa_pagar(pid, p)
            return {
                "ok": True,
                "item": pagar_por_id(pid),
                "painel": resumo_painel_pagar(),
                "kpis": resumo_hub_financeiro(),
                "mensagem": "Pagamento baixado com sucesso",
            }
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.post("/api/financeiro/contas-pagar/{pid}/anexos")
    async def api_fin_anexo_pagar(pid: str, request: Request):
        if not pagar_por_id(pid):
            return JSONResponse({"ok": False, "erro": "Conta a pagar não encontrada"}, 404)
        form = await request.form()
        try:
            await salvar_anexo("pagar", pid, form, form.get("arquivo"))
            return {"ok": True, "anexos": listar_anexos("pagar", pid)}
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.get("/api/financeiro/anexos/{aid}/download")
    def api_fin_download_anexo(aid: str):
        anexo = anexo_por_id(aid)
        if not anexo:
            return JSONResponse({"ok": False, "erro": "Anexo não encontrado"}, 404)
        path = _anexo_caminho_fisico(anexo.get("caminho_arquivo"))
        if not path or not os.path.isfile(path):
            return JSONResponse({"ok": False, "erro": "Arquivo não encontrado no servidor"}, 404)
        mime = anexo.get("mime_type") or mimetypes.guess_type(path)[0] or "application/octet-stream"
        nome = anexo.get("nome_arquivo") or os.path.basename(path)
        disp = quote(nome)
        headers = {"Content-Disposition": f"inline; filename=\"{nome}\"; filename*=UTF-8''{disp}"}
        return FileResponse(path, media_type=mime, filename=nome, headers=headers)

    @app.delete("/api/financeiro/anexos/{aid}")
    def api_fin_excluir_anexo(aid: str):
        try:
            row = excluir_anexo(aid)
            return {
                "ok": True,
                "anexos": listar_anexos(row["referencia_tipo"], row["referencia_id"]),
            }
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    # --- APIs receber ---
    @app.get("/api/financeiro/contas-receber")
    def api_fin_lista_receber(request: Request):
        filtros = _filtros_query(request)
        return {
            "ok": True,
            "itens": listar_receber(filtros),
            "contas": listar_contas_financeiras(),
            "painel": resumo_painel_receber(filtros),
            "kpis": resumo_hub_financeiro(),
        }

    @app.post("/api/financeiro/contas-receber/baixa-lote")
    async def api_fin_baixa_lote_receber(request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        ok, erros = baixa_lote_receber(p.get("ids") or [], p)
        return {
            "ok": len(erros) == 0,
            "baixados": ok,
            "erros": erros,
            "kpis": resumo_hub_financeiro(),
            "painel": resumo_painel_receber(),
        }

    @app.get("/api/financeiro/contas-receber/{rid}")
    def api_fin_get_receber(rid: str):
        item = receber_por_id(rid)
        if not item:
            return JSONResponse({"ok": False, "erro": "Não encontrado"}, 404)
        item["historico"] = historico_lancamento("receber", rid)
        return {"ok": True, "item": item, "contas": listar_contas_financeiras()}

    @app.post("/api/financeiro/contas-receber")
    async def api_fin_post_receber(request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        try:
            return {
                "ok": True,
                "item": salvar_receber(p),
                "painel": resumo_painel_receber(),
                "kpis": resumo_hub_financeiro(),
            }
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.put("/api/financeiro/contas-receber/{rid}")
    async def api_fin_put_receber(rid: str, request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        p["id"] = rid
        try:
            return {
                "ok": True,
                "item": salvar_receber(p),
                "painel": resumo_painel_receber(),
                "kpis": resumo_hub_financeiro(),
            }
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.delete("/api/financeiro/contas-receber/{rid}")
    def api_fin_del_receber(rid: str):
        try:
            excluir_receber(rid)
            return {"ok": True, "kpis": resumo_hub_financeiro()}
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.post("/api/financeiro/contas-receber/{rid}/baixa")
    async def api_fin_baixa_receber(rid: str, request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        try:
            return {
                "ok": True,
                "item": baixa_receber(rid, p),
                "painel": resumo_painel_receber(),
                "kpis": resumo_hub_financeiro(),
            }
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    @app.post("/api/financeiro/contas-receber/{rid}/anexos")
    async def api_fin_anexo_receber(rid: str, request: Request):
        if not receber_por_id(rid):
            return JSONResponse({"ok": False, "erro": "Conta a receber não encontrada"}, 404)
        form = await request.form()
        try:
            await salvar_anexo("receber", rid, form, form.get("arquivo"))
            return {"ok": True, "anexos": listar_anexos("receber", rid)}
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)

    # --- APIs movimentações ---
    @app.get("/api/financeiro/movimentacoes")
    def api_fin_movimentacoes(request: Request):
        filtros = _filtros_query(request)
        contas = listar_contas_financeiras()
        return {
            "ok": True,
            "itens": listar_movimentacoes(filtros),
            "contas": contas,
            "painel": resumo_painel_caixa(filtros),
            "kpis": resumo_hub_financeiro(),
        }

    @app.post("/api/financeiro/movimentacoes")
    async def api_fin_post_mov(request: Request):
        try:
            p = await request.json()
        except Exception:
            p = {}
        try:
            salvar_movimentacao_manual(p)
            filtros = {"conta_financeira_id": p.get("conta_financeira_id"), "aba": p.get("aba")}
            return {
                "ok": True,
                "itens": listar_movimentacoes(filtros),
                "painel": resumo_painel_caixa(filtros),
                "kpis": resumo_hub_financeiro(),
            }
        except Exception as e:
            return JSONResponse({"ok": False, "erro": str(e)}, 400)
