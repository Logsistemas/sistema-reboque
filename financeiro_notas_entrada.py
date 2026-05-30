"""Notas Fiscais de Entrada — importação XML NF-e e vínculo com Contas a Pagar."""
import os
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import date, datetime

from fastapi import Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse


def init_notas_entrada_tables(cur):
    cur.execute("""
        create table if not exists financeiro_notas_entrada (
          id uuid primary key default uuid_generate_v4(),
          loja_unidade text,
          numero text,
          serie text,
          chave_acesso text unique,
          data_emissao date,
          data_entrada date,
          cnpj_fornecedor text,
          nome_fornecedor text,
          endereco_fornecedor text,
          contato_id uuid,
          valor_total numeric(14,2) default 0,
          valor_impostos numeric(14,2) default 0,
          situacao text default 'registrada',
          vinculacao text default 'nao_vinculado',
          produto_resumo text,
          lote text,
          uf text,
          forma_pagamento text,
          xml_caminho text,
          xml_conteudo text,
          created_at timestamp default now(),
          updated_at timestamp default now()
        );""")
    cur.execute("""
        create table if not exists financeiro_notas_entrada_itens (
          id uuid primary key default uuid_generate_v4(),
          nota_id uuid not null references financeiro_notas_entrada(id) on delete cascade,
          sequencia integer default 1,
          codigo text,
          descricao text,
          ncm text,
          cfop text,
          unidade text,
          quantidade numeric(14,4) default 0,
          valor_unitario numeric(14,4) default 0,
          valor_total numeric(14,2) default 0
        );""")
    cur.execute("""
        create table if not exists financeiro_notas_entrada_parcelas (
          id uuid primary key default uuid_generate_v4(),
          nota_id uuid not null references financeiro_notas_entrada(id) on delete cascade,
          numero_parcela text,
          vencimento date,
          valor numeric(14,2) default 0,
          conta_pagar_id uuid
        );""")
    cur.execute(
        "alter table financeiro_contas_pagar add column if not exists nota_entrada_id uuid;"
    )


def register(app, templates):
    import app as main

    q = main.q
    one = main.one
    fmt_moeda = main.fmt_moeda
    dt_str = main.dt_str
    _parse_data = main._parse_data_controle
    _num = main._num_controle
    _txt = main._txt_controle
    salvar_contato = main.salvar_contato_cadastro
    UPLOAD_BASE = getattr(main, "FINANCEIRO_UPLOAD_DIR", os.path.join("static", "uploads", "financeiro"))
    NOTAS_DIR = os.path.join(UPLOAD_BASE, "notas-entrada")
    os.makedirs(NOTAS_DIR, exist_ok=True)

    def _local(tag):
        return tag.split("}")[-1] if "}" in tag else tag

    def _find_first(root, name):
        for el in root.iter():
            if _local(el.tag) == name:
                return el
        return None

    def _find_all_parent(root, parent_name, child_name):
        out = []
        for el in root.iter():
            if _local(el.tag) != parent_name:
                continue
            for ch in el:
                if _local(ch.tag) == child_name:
                    out.append(ch)
        return out

    def _text(node, name, default=""):
        if node is None:
            return default
        for ch in node:
            if _local(ch.tag) == name:
                return (ch.text or "").strip()
        sub = _find_first(node, name)
        return (sub.text or "").strip() if sub is not None else default

    def _parse_nfe_xml(xml_bytes):
        if not xml_bytes or not xml_bytes.strip():
            raise ValueError("Arquivo XML vazio")
        raw = xml_bytes
        if raw[:3] == b"\xef\xbb\xbf":
            raw = raw[3:]
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("latin-1", errors="replace")
        try:
            root = ET.fromstring(text)
        except ET.ParseError as exc:
            raise ValueError(f"XML inválido. Verifique se o arquivo é uma NF-e válida. ({exc})") from exc

        inf = None
        for el in root.iter():
            if _local(el.tag) == "infNFe":
                inf = el
                break
        if inf is None:
            raise ValueError("Arquivo não é uma NF-e válida (estrutura infNFe não encontrada)")

        chave = (inf.attrib.get("Id") or "").replace("NFe", "").strip()
        if len(chave) != 44:
            prot = _find_first(root, "protNFe")
            inf_prot = _find_first(prot, "infProt") if prot is not None else None
            if inf_prot is not None:
                chave = _text(inf_prot, "chNFe") or chave
        if len(chave) != 44:
            chave = chave or ""

        ide = _find_first(inf, "ide")
        emit = _find_first(inf, "emit")
        total = _find_first(inf, "total")
        icms_tot = _find_first(total, "ICMSTot") if total is not None else _find_first(inf, "ICMSTot")

        numero = _text(ide, "nNF")
        serie = _text(ide, "serie")
        dh_emi = _text(ide, "dhEmi") or _text(ide, "dEmi")
        dh_ent = _text(ide, "dhSaiEnt") or _text(ide, "dSaiEnt") or dh_emi

        def parse_dt(s):
            if not s:
                return None
            s = s.strip()
            if "T" in s:
                s = s.split("T")[0]
            if len(s) == 10 and s[4] == "-":
                return s
            m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
            if m:
                return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
            m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s)
            if m:
                return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
            return _parse_data(s)

        cnpj = re.sub(r"\D", "", _text(emit, "CNPJ") or _text(emit, "CPF"))
        nome = _text(emit, "xNome") or _text(emit, "xFant")
        ender = _find_first(emit, "enderEmit")
        endereco_parts = []
        if ender is not None:
            for fld in ("xLgr", "nro", "xBairro", "xMun", "UF"):
                v = _text(ender, fld)
                if v:
                    endereco_parts.append(v)
        endereco = ", ".join(endereco_parts)
        uf = _text(ender, "UF") if ender is not None else ""

        valor_total = _num(_text(icms_tot, "vNF") or _text(icms_tot, "vProd"), 0)
        valor_impostos = _num(_text(icms_tot, "vICMS"), 0) + _num(_text(icms_tot, "vIPI"), 0)

        itens = []
        seq = 0
        for el in inf:
            if _local(el.tag) != "det":
                continue
            prod = _find_first(el, "prod")
            if prod is None:
                continue
            seq += 1
            itens.append({
                "sequencia": int(_num(_text(el, "nItem"), seq) or seq),
                "codigo": _text(prod, "cProd"),
                "descricao": _text(prod, "xProd"),
                "ncm": _text(prod, "NCM"),
                "cfop": _text(prod, "CFOP"),
                "unidade": _text(prod, "uCom"),
                "quantidade": _num(_text(prod, "qCom"), 0),
                "valor_unitario": _num(_text(prod, "vUnCom"), 0),
                "valor_total": _num(_text(prod, "vProd"), 0),
            })

        parcelas = []
        cobr = _find_first(inf, "cobr")
        dup_nodes = []
        if cobr is not None:
            for ch in cobr:
                if _local(ch.tag) == "dup":
                    dup_nodes.append(ch)
        if not dup_nodes:
            for dup in root.iter():
                if _local(dup.tag) == "dup":
                    dup_nodes.append(dup)
        for dup in dup_nodes:
            venc = parse_dt(_text(dup, "dVenc"))
            valor_dup = _num(_text(dup, "vDup"), 0)
            if valor_dup <= 0:
                continue
            parcelas.append({
                "numero_parcela": _text(dup, "nDup") or str(len(parcelas) + 1).zfill(3),
                "vencimento": venc,
                "valor": valor_dup,
            })

        pag = _find_first(inf, "pag")
        forma = ""
        if pag is not None:
            det_pag = _find_first(pag, "detPag")
            if det_pag is not None:
                forma = _text(det_pag, "tPag") or _text(det_pag, "xPag")

        produto_resumo = itens[0]["descricao"] if itens else ""
        if not chave:
            raise ValueError("Chave de acesso da NF-e não encontrada no XML")

        return {
            "chave_acesso": chave,
            "numero": numero,
            "serie": serie,
            "data_emissao": parse_dt(dh_emi),
            "data_entrada": parse_dt(dh_ent) or date.today().isoformat(),
            "cnpj_fornecedor": cnpj,
            "nome_fornecedor": nome,
            "endereco_fornecedor": endereco,
            "uf": uf,
            "valor_total": valor_total,
            "valor_impostos": valor_impostos,
            "forma_pagamento": forma,
            "produto_resumo": produto_resumo,
            "itens": itens,
            "parcelas": parcelas,
        }

    def _fmt_valor(v):
        return fmt_moeda(float(v or 0))

    def _label_situacao(s):
        return {"registrada": "Registrada", "pendente": "Pendente", "cancelada": "Cancelada"}.get(s, s)

    def _label_vinculacao(v):
        return {
            "nao_vinculado": "Não vinculado",
            "lancado_contas_pagar": "Lançado em contas a pagar",
        }.get(v, v)

    def normalizar_nota(row, resumo=False):
        if not row:
            return None
        n = dict(row)
        n["id"] = str(n["id"])
        if n.get("contato_id"):
            n["contato_id"] = str(n["contato_id"])
        n["valor_total"] = float(n.get("valor_total") or 0)
        n["valor_total_fmt"] = _fmt_valor(n["valor_total"])
        n["valor_impostos_fmt"] = _fmt_valor(n.get("valor_impostos"))
        for d in ("data_emissao", "data_entrada"):
            v = n.get(d)
            if v and hasattr(v, "strftime"):
                n[d] = v.strftime("%Y-%m-%d")
                n[d + "_fmt"] = v.strftime("%d/%m/%Y")
        n["situacao_label"] = _label_situacao(n.get("situacao"))
        n["vinculacao_label"] = _label_vinculacao(n.get("vinculacao"))
        n["numero_nota"] = f"{n.get('numero') or '—'}/{n.get('serie') or '—'}"
        n["created_at_fmt"] = dt_str(n.get("created_at"))
        if resumo:
            return n
        return n

    def buscar_contato_por_cnpj(cnpj):
        cnpj = re.sub(r"\D", "", cnpj or "")
        if not cnpj:
            return None
        return one(
            """
            select id, coalesce(fornecedor, false) as fornecedor,
                   coalesce(razao_social, nome_fantasia, '') as nome
              from cadastro_contatos
             where regexp_replace(coalesce(cnpj,''), '[^0-9]', '', 'g') = %s
             limit 1
            """,
            (cnpj,),
        )

    def nome_fornecedor_nota(nota):
        if nota.get("contato_id"):
            row = one(
                "select coalesce(razao_social, nome_fantasia, '') as nome from cadastro_contatos where id=%s",
                (str(nota["contato_id"]),),
            )
            if row and row.get("nome"):
                return row["nome"]
        return nota.get("nome_fornecedor") or "Fornecedor"

    def criar_fornecedor(dados):
        row = buscar_contato_por_cnpj(dados.get("cnpj_fornecedor"))
        if row:
            cid = str(row["id"])
            if not row.get("fornecedor"):
                q(
                    "update cadastro_contatos set fornecedor=true, updated_at=now() where id=%s",
                    (cid,),
                )
            return cid
        contato = salvar_contato({
            "tipo_pessoa": "juridica",
            "razao_social": dados.get("nome_fornecedor") or "Fornecedor NF-e",
            "nome_fantasia": dados.get("nome_fornecedor"),
            "cnpj": dados.get("cnpj_fornecedor"),
            "observacoes": dados.get("endereco_fornecedor"),
            "uf": dados.get("uf"),
            "fornecedor": True,
            "cliente": False,
            "status": "ativo",
        })
        return contato["id"]

    def _filtros_notas(f):
        f = f or {}
        wh = ["1=1"]
        params = []
        if f.get("situacao"):
            wh.append("n.situacao = %s")
            params.append(f["situacao"])
        if f.get("vinculacao"):
            wh.append("n.vinculacao = %s")
            params.append(f["vinculacao"])
        if f.get("produto"):
            wh.append("coalesce(n.produto_resumo,'') ilike %s")
            params.append(f"%{f['produto']}%")
        if f.get("lote"):
            wh.append("coalesce(n.lote,'') ilike %s")
            params.append(f"%{f['lote']}%")
        if f.get("uf"):
            wh.append("coalesce(n.uf,'') ilike %s")
            params.append(f"%{f['uf']}%")
        if f.get("busca"):
            wh.append(
                """(
                  coalesce(n.numero,'') ilike %s or coalesce(n.nome_fornecedor,'') ilike %s
                  or coalesce(n.chave_acesso,'') ilike %s or coalesce(n.cnpj_fornecedor,'') ilike %s
                )"""
            )
            b = f"%{f['busca']}%"
            params.extend([b, b, b, b])
        if f.get("data_ini"):
            wh.append("n.data_entrada >= %s")
            params.append(_parse_data(f["data_ini"]))
        if f.get("data_fim"):
            wh.append("n.data_entrada <= %s")
            params.append(_parse_data(f["data_fim"]))
        return " and ".join(wh), params

    def resumo_painel_notas(filtros=None):
        where, params = _filtros_notas(filtros)
        row = one(
            f"""
            select count(*)::int as qtd, coalesce(sum(valor_total),0) as total
              from financeiro_notas_entrada n where {where}
            """,
            tuple(params) if params else None,
        ) or {}
        total = float(row.get("total") or 0)
        return {
            "quantidade": int(row.get("qtd") or 0),
            "valor_total": total,
            "valor_total_fmt": _fmt_valor(total),
        }

    def listar_notas(filtros=None):
        where, params = _filtros_notas(filtros)
        rows = q(
            f"""
            select n.* from financeiro_notas_entrada n
             where {where}
             order by n.data_entrada desc nulls last, n.created_at desc
            """,
            tuple(params) if params else None,
            fetch=True,
        )
        return [normalizar_nota(r, resumo=True) for r in rows]

    def nota_por_id(nid):
        row = one("select * from financeiro_notas_entrada where id=%s", (str(nid),))
        if not row:
            return None
        n = normalizar_nota(row)
        itens = q(
            "select * from financeiro_notas_entrada_itens where nota_id=%s order by sequencia",
            (str(nid),),
            fetch=True,
        )
        n["itens"] = []
        for it in itens:
            i = dict(it)
            i["id"] = str(i["id"])
            i["valor_total_fmt"] = _fmt_valor(i.get("valor_total"))
            n["itens"].append(i)
        parcelas = q(
            "select * from financeiro_notas_entrada_parcelas where nota_id=%s order by vencimento",
            (str(nid),),
            fetch=True,
        )
        n["parcelas"] = []
        contas_vinc = []
        for p in parcelas:
            pr = dict(p)
            pr["id"] = str(pr["id"])
            pr["valor_fmt"] = _fmt_valor(pr.get("valor"))
            if pr.get("vencimento") and hasattr(pr["vencimento"], "strftime"):
                pr["vencimento_fmt"] = pr["vencimento"].strftime("%d/%m/%Y")
            if pr.get("conta_pagar_id"):
                pr["conta_pagar_id"] = str(pr["conta_pagar_id"])
                cp = one(
                    "select id, fornecedor, valor, status, vencimento from financeiro_contas_pagar where id=%s",
                    (pr["conta_pagar_id"],),
                )
                if cp:
                    contas_vinc.append({
                        "id": str(cp["id"]),
                        "fornecedor": cp.get("fornecedor"),
                        "valor_fmt": _fmt_valor(cp.get("valor")),
                        "status": cp.get("status"),
                    })
            n["parcelas"].append(pr)
        n["contas_pagar_vinculadas"] = contas_vinc
        n["tem_xml"] = bool(n.get("xml_caminho") or n.get("xml_conteudo"))
        return n

    def listar_contas_financeiras():
        rows = q(
            """
            select id, nome, saldo_atual, tipo
              from financeiro_contas_financeiras
             where coalesce(status,'ativo')='ativo'
             order by nome asc
            """,
            fetch=True,
        )
        out = []
        for r in rows or []:
            c = {"id": str(r["id"]), "nome": r.get("nome") or "Conta"}
            c["saldo_atual_fmt"] = _fmt_valor(r.get("saldo_atual"))
            out.append(c)
        return out

    def _validar_conta_financeira(conta_id):
        cid = (conta_id or "").strip() or None
        if not cid:
            return None
        row = one(
            "select id from financeiro_contas_financeiras where id=%s and coalesce(status,'ativo')='ativo'",
            (cid,),
        )
        if not row:
            raise ValueError("Conta financeira inválida ou inativa")
        return cid

    def lancar_contas_pagar_nota(nid, conta_financeira_id=None, forcar=False):
        nota = nota_por_id(nid)
        if not nota:
            raise ValueError("Nota não encontrada")
        if nota.get("vinculacao") == "lancado_contas_pagar" and not forcar:
            raise ValueError("Esta nota já foi lançada em Contas a Pagar")
        if nota.get("situacao") == "cancelada":
            raise ValueError("Nota cancelada")

        conta_fin_id = _validar_conta_financeira(conta_financeira_id)

        parcelas_db = q(
            "select * from financeiro_notas_entrada_parcelas where nota_id=%s order by vencimento",
            (str(nid),),
            fetch=True,
        )
        if not parcelas_db:
            parcelas_db = [{
                "id": None,
                "numero_parcela": "001",
                "vencimento": nota.get("data_entrada"),
                "valor": nota["valor_total"],
            }]

        fornecedor = nome_fornecedor_nota(nota)
        num_nf = nota.get("numero") or "—"
        hist_base = f"NF-e nº {num_nf} - {fornecedor}"
        criados = []
        qtd_parcelas = len([p for p in parcelas_db if float(p.get("valor") or 0) > 0]) or 1

        for pr in parcelas_db:
            if pr.get("conta_pagar_id"):
                continue
            valor = float(pr.get("valor") or 0)
            if valor <= 0:
                continue
            venc = pr.get("vencimento")
            if venc and hasattr(venc, "strftime"):
                venc = venc.strftime("%Y-%m-%d")
            nparc = pr.get("numero_parcela") or ""
            desc = hist_base if qtd_parcelas <= 1 else f"{hist_base} — parc. {nparc}"
            row = one(
                """
                insert into financeiro_contas_pagar (
                  fornecedor, descricao, categoria, emissao, vencimento, valor, parcelas,
                  conta_financeira_id, forma_pagamento, status, observacoes, numero_documento,
                  nota_entrada_id, updated_at
                ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,'em_aberto',%s,%s,%s,now()) returning id
                """,
                (
                    fornecedor,
                    desc,
                    "NF-e Entrada",
                    _parse_data(nota.get("data_emissao")),
                    _parse_data(venc) or date.today(),
                    valor,
                    qtd_parcelas,
                    conta_fin_id,
                    nota.get("forma_pagamento"),
                    f"Importado da NF-e. Chave {nota.get('chave_acesso') or ''}".strip(),
                    num_nf,
                    str(nid),
                ),
            )
            pid = str(row["id"])
            if pr.get("id"):
                q(
                    "update financeiro_notas_entrada_parcelas set conta_pagar_id=%s where id=%s",
                    (pid, str(pr["id"])),
                )
            criados.append(pid)

        if not criados:
            raise ValueError("Nenhuma parcela pendente para lançar")

        q(
            "update financeiro_notas_entrada set vinculacao='lancado_contas_pagar', situacao='registrada', updated_at=now() where id=%s",
            (str(nid),),
        )
        return criados

    def importar_xml_nfe(xml_bytes, loja_unidade="", lancar_cp=False, conta_financeira_id=None):
        dados = _parse_nfe_xml(xml_bytes)
        exist = one(
            "select id from financeiro_notas_entrada where chave_acesso=%s",
            (dados["chave_acesso"],),
        )
        if exist:
            raise ValueError("XML já importado (chave de acesso duplicada)")

        contato_id = criar_fornecedor(dados)
        row = one(
            """
            insert into financeiro_notas_entrada (
              loja_unidade, numero, serie, chave_acesso, data_emissao, data_entrada,
              cnpj_fornecedor, nome_fornecedor, endereco_fornecedor, contato_id,
              valor_total, valor_impostos, situacao, vinculacao, produto_resumo, uf,
              forma_pagamento, updated_at
            ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'registrada','nao_vinculado',%s,%s,%s,now())
            returning id
            """,
            (
                _txt(loja_unidade),
                dados["numero"],
                dados["serie"],
                dados["chave_acesso"],
                _parse_data(dados["data_emissao"]),
                _parse_data(dados["data_entrada"]),
                dados["cnpj_fornecedor"],
                dados["nome_fornecedor"],
                dados["endereco_fornecedor"],
                contato_id,
                dados["valor_total"],
                dados["valor_impostos"],
                dados["produto_resumo"],
                dados["uf"],
                dados["forma_pagamento"],
            ),
        )
        nid = str(row["id"])
        pasta = os.path.join(NOTAS_DIR, nid)
        os.makedirs(pasta, exist_ok=True)
        fname = f"{dados['chave_acesso']}.xml"
        fpath = os.path.join(pasta, fname)
        with open(fpath, "wb") as f:
            f.write(xml_bytes)
        caminho = f"/static/uploads/financeiro/notas-entrada/{nid}/{fname}"
        q(
            "update financeiro_notas_entrada set xml_caminho=%s, xml_conteudo=%s where id=%s",
            (caminho, xml_bytes.decode("utf-8", errors="replace")[:500000], nid),
        )

        for it in dados["itens"]:
            one(
                """
                insert into financeiro_notas_entrada_itens (
                  nota_id, sequencia, codigo, descricao, ncm, cfop, unidade,
                  quantidade, valor_unitario, valor_total
                ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    nid,
                    int(it.get("sequencia") or 1),
                    it.get("codigo"),
                    it.get("descricao"),
                    it.get("ncm"),
                    it.get("cfop"),
                    it.get("unidade"),
                    it.get("quantidade"),
                    it.get("valor_unitario"),
                    it.get("valor_total"),
                ),
            )

        parcelas_data = dados["parcelas"]
        if not parcelas_data:
            parcelas_data = [{
                "numero_parcela": "001",
                "vencimento": dados["data_entrada"],
                "valor": dados["valor_total"],
            }]
        for pr in parcelas_data:
            one(
                """
                insert into financeiro_notas_entrada_parcelas (nota_id, numero_parcela, vencimento, valor)
                values (%s,%s,%s,%s)
                """,
                (nid, pr.get("numero_parcela"), _parse_data(pr.get("vencimento")), pr.get("valor")),
            )

        if lancar_cp:
            lancar_contas_pagar_nota(nid, conta_financeira_id=conta_financeira_id)

        return nota_por_id(nid)

    def excluir_nota(nid):
        nota = nota_por_id(nid)
        if not nota:
            raise ValueError("Nota não encontrada")
        if nota.get("vinculacao") == "lancado_contas_pagar":
            raise ValueError("Não é possível excluir: nota já lançada em Contas a Pagar")
        if nota.get("xml_caminho"):
            rel = nota["xml_caminho"].lstrip("/").replace("/", os.sep)
            if os.path.isfile(rel):
                try:
                    os.remove(rel)
                except OSError:
                    pass
        q("delete from financeiro_notas_entrada where id=%s", (str(nid),))

    def tpl_ctx(request, extra=None):
        ctx = {"request": request, "nav_ativo": "financeiro", "nav_som": False}
        if extra:
            ctx.update(extra)
        return ctx

    def _kpis_fallback():
        z = 0.0
        fz = _fmt_valor(0)
        return {
            "a_pagar_aberto": z,
            "a_receber_aberto": z,
            "saldo_bancos": z,
            "vencidos": z,
            "pago_mes": z,
            "recebido_mes": z,
            "total_pagar": z,
            "total_receber": z,
            "saldo_caixa": z,
            "total_pagar_fmt": fz,
            "total_receber_fmt": fz,
            "saldo_caixa_fmt": fz,
            "vencidos_fmt": fz,
            "pago_mes_fmt": fz,
            "recebido_mes_fmt": fz,
        }

    def _kpis_safe():
        try:
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
                """
                select coalesce(sum(saldo_atual),0) as total
                  from financeiro_contas_financeiras
                 where coalesce(status,'ativo')='ativo'
                """
            ) or {}
            tp = float(pagar.get("aberto") or 0)
            tr = float(receber.get("aberto") or 0)
            sc = float(saldo.get("total") or 0)
            venc = float(pagar.get("vencido_pagar") or 0) + float(receber.get("vencido_receber") or 0)
            pm = float(pagar.get("pago_mes") or 0)
            rm = float(receber.get("recebido_mes") or 0)
            return {
                "a_pagar_aberto": tp,
                "a_receber_aberto": tr,
                "saldo_bancos": sc,
                "vencidos": venc,
                "pago_mes": pm,
                "recebido_mes": rm,
                "total_pagar": tp,
                "total_receber": tr,
                "saldo_caixa": sc,
                "total_pagar_fmt": _fmt_valor(tp),
                "total_receber_fmt": _fmt_valor(tr),
                "saldo_caixa_fmt": _fmt_valor(sc),
                "vencidos_fmt": _fmt_valor(venc),
                "pago_mes_fmt": _fmt_valor(pm),
                "recebido_mes_fmt": _fmt_valor(rm),
            }
        except Exception:
            return _kpis_fallback()

    @app.get("/financeiro/notas-entrada", response_class=HTMLResponse)
    def pagina_notas_entrada(request: Request):
        return templates.TemplateResponse(
            "financeiro/notas_entrada.html",
            tpl_ctx(request, {"kpis": _kpis_safe()}),
        )

    @app.get("/api/financeiro/notas-entrada")
    def api_lista_notas(request: Request):
        qp = request.query_params
        filtros = {
            "situacao": qp.get("situacao"),
            "vinculacao": qp.get("vinculacao"),
            "produto": qp.get("produto"),
            "lote": qp.get("lote"),
            "uf": qp.get("uf"),
            "busca": qp.get("busca"),
            "data_ini": qp.get("data_ini"),
            "data_fim": qp.get("data_fim"),
        }
        return {
            "ok": True,
            "itens": listar_notas(filtros),
            "painel": resumo_painel_notas(filtros),
            "contas": listar_contas_financeiras(),
        }

    @app.get("/api/financeiro/notas-entrada/{nid}")
    def api_get_nota(nid: str):
        item = nota_por_id(nid)
        if not item:
            return JSONResponse({"ok": False, "erro": "Nota não encontrada"}, 404)
        return {"ok": True, "item": item}

    @app.post("/api/financeiro/notas-entrada/importar-xml")
    async def api_importar_xml(request: Request):
        form = await request.form()
        arquivo = form.get("arquivo")
        if not arquivo or not getattr(arquivo, "filename", None):
            return JSONResponse({"ok": False, "erro": "Arquivo XML obrigatório"}, 400)
        fn = (arquivo.filename or "").lower()
        if not fn.endswith(".xml"):
            return JSONResponse({"ok": False, "erro": "Envie apenas arquivo .xml"}, 400)
        loja = (form.get("loja_unidade") or "").strip()
        lancar = str(form.get("lancar_contas_pagar") or "").lower() in ("1", "true", "on", "sim")
        conta_fin = (form.get("conta_financeira_id") or "").strip() or None
        try:
            content = await arquivo.read()
            if not content.strip():
                return JSONResponse({"ok": False, "erro": "Arquivo XML vazio"}, 400)
            item = importar_xml_nfe(content, loja, lancar, conta_fin)
            msg = "NF-e importada com sucesso"
            if lancar and item.get("vinculacao") == "lancado_contas_pagar":
                msg = "NF-e importada e lançada em Contas a Pagar"
            return {
                "ok": True,
                "item": item,
                "painel": resumo_painel_notas(),
                "contas": listar_contas_financeiras(),
                "mensagem": msg,
            }
        except ValueError as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": f"Falha ao importar XML: {exc}"}, 400)

    @app.post("/api/financeiro/notas-entrada/{nid}/lancar-contas-pagar")
    async def api_lancar_cp(nid: str, request: Request):
        payload = {}
        try:
            if "application/json" in (request.headers.get("content-type") or ""):
                payload = await request.json()
        except Exception:
            payload = {}
        conta_fin = (payload.get("conta_financeira_id") or "").strip() or None
        try:
            ids = lancar_contas_pagar_nota(nid, conta_financeira_id=conta_fin)
            return {
                "ok": True,
                "contas_pagar_ids": ids,
                "item": nota_por_id(nid),
                "painel": resumo_painel_notas(),
                "mensagem": f"{len(ids)} conta(s) a pagar gerada(s) em aberto",
            }
        except ValueError as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.delete("/api/financeiro/notas-entrada/{nid}")
    def api_delete_nota(nid: str):
        try:
            excluir_nota(nid)
            return {"ok": True, "painel": resumo_painel_notas()}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.get("/api/financeiro/notas-entrada/{nid}/xml")
    def api_download_xml(nid: str):
        nota = nota_por_id(nid)
        if not nota or not nota.get("xml_caminho"):
            return JSONResponse({"ok": False, "erro": "XML não disponível"}, 404)
        rel = nota["xml_caminho"].lstrip("/").replace("/", os.sep)
        if not os.path.isfile(rel):
            return JSONResponse({"ok": False, "erro": "Arquivo não encontrado"}, 404)
        return FileResponse(rel, media_type="application/xml", filename=f"nfe_{nota.get('chave_acesso')}.xml")
