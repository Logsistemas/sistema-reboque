"""Notas de Serviço / NFS-e — módulo isolado (inspirado Bling)."""
import base64
import hashlib
import io
import logging
import os
import re
import uuid
from datetime import date, datetime, timedelta

from fastapi import Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, Response

log_nfse = logging.getLogger("financeiro.nfse")


def init_nfse_tables(cur):
    cur.execute("""
        create table if not exists financeiro_notas_servico (
          id uuid primary key default uuid_generate_v4(),
          situacao text default 'pendente',
          numero_rps text,
          serie_rps text default '1',
          numero_nfse text,
          data_emissao date,
          natureza_operacao text,
          contato_id uuid,
          cliente_nome text,
          cliente_cnpj_cpf text,
          cliente_ie text,
          cliente_im text,
          cliente_consumidor_gov boolean default false,
          cliente_tipo_operacao text,
          cliente_cep text,
          cliente_uf text,
          cliente_municipio text,
          cliente_bairro text,
          cliente_endereco text,
          cliente_numero text,
          cliente_complemento text,
          cliente_fone text,
          cliente_email text,
          municipio_prestacao text,
          total_servicos numeric(14,2) default 0,
          base_calculo numeric(14,2) default 0,
          desconto_incondicional numeric(14,2) default 0,
          total_nota numeric(14,2) default 0,
          vendedor text,
          comissao_pct numeric(8,4) default 0,
          comissao_valor numeric(14,2) default 0,
          condicao_pagamento text,
          categoria_id uuid,
          categoria_txt text,
          vinculacao_cr text default 'nao_vinculado',
          observacoes text,
          erro_emissao text,
          created_at timestamp default now(),
          updated_at timestamp default now()
        );""")
    cur.execute("""
        create table if not exists financeiro_notas_servico_itens (
          id uuid primary key default uuid_generate_v4(),
          nota_id uuid not null references financeiro_notas_servico(id) on delete cascade,
          sequencia integer default 1,
          descricao text,
          valor numeric(14,2) default 0
        );""")
    cur.execute("""
        create table if not exists financeiro_notas_servico_impostos (
          id uuid primary key default uuid_generate_v4(),
          nota_id uuid not null unique references financeiro_notas_servico(id) on delete cascade,
          codigo_tributacao text,
          codigo_cnae text,
          codigo_trib_municipal text,
          nbs text,
          indicador_operacao text,
          aliquota_iss numeric(8,4) default 0,
          valor_iss numeric(14,2) default 0,
          reter_iss boolean default false,
          descontar_iss boolean default false,
          reter_inss boolean default false,
          reter_csll_pis_cofins boolean default false,
          valor_ibpt numeric(14,2) default 0,
          valor_aprox_tributos numeric(14,2) default 0,
          cst_ibs_cbs text,
          classificacao_tributaria_ibs_cbs text
        );""")
    cur.execute("""
        create table if not exists financeiro_notas_servico_parcelas (
          id uuid primary key default uuid_generate_v4(),
          nota_id uuid not null references financeiro_notas_servico(id) on delete cascade,
          numero_parcela text,
          vencimento date,
          valor numeric(14,2) default 0,
          conta_receber_id uuid
        );""")
    cur.execute("""
        create table if not exists financeiro_notas_servico_cr_vinculos (
          id uuid primary key default uuid_generate_v4(),
          nota_id uuid not null references financeiro_notas_servico(id) on delete cascade,
          conta_receber_id uuid not null,
          estornado_at timestamp,
          created_at timestamp default now()
        );""")
    cur.execute("""
        create table if not exists financeiro_certificados_digitais (
          id uuid primary key default uuid_generate_v4(),
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
    alters = [
        "alter table financeiro_contas_receber add column if not exists nota_servico_id uuid;",
        "alter table financeiro_notas_servico add column if not exists dias_pagamento integer default 0;",
        "alter table financeiro_notas_servico add column if not exists quantidade_parcelas integer default 1;",
        "alter table financeiro_notas_servico add column if not exists intervalo_parcelas integer default 30;",
        "alter table financeiro_notas_servico add column if not exists chave_acesso text;",
        "alter table financeiro_notas_servico add column if not exists codigo_verificacao text;",
        "alter table financeiro_notas_servico add column if not exists protocolo text;",
        "alter table financeiro_notas_servico add column if not exists link_nfse text;",
        "alter table financeiro_notas_servico add column if not exists id_dps text;",
        "alter table financeiro_notas_servico add column if not exists xml_enviado text;",
        "alter table financeiro_notas_servico add column if not exists xml_retorno text;",
        "create index if not exists idx_nfse_situacao on financeiro_notas_servico(situacao);",
        "create index if not exists idx_nfse_contato on financeiro_notas_servico(contato_id);",
        "create index if not exists idx_nfse_cr_vinc on financeiro_notas_servico_cr_vinculos(nota_id);",
    ]
    for stmt in alters:
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
    contato_por_id = main.contato_cadastro_por_id
    UPLOAD_BASE = getattr(main, "FINANCEIRO_UPLOAD_DIR", os.path.join("static", "uploads", "financeiro"))
    NFSE_DIR = os.path.join(UPLOAD_BASE, "nfse")
    CERT_DIR = os.path.join(UPLOAD_BASE, "certificados")
    os.makedirs(NFSE_DIR, exist_ok=True)
    os.makedirs(CERT_DIR, exist_ok=True)

    def tpl_ctx(request, extra=None):
        ctx = {"request": request, "nav_ativo": "financeiro", "nav_som": False}
        if extra:
            ctx.update(extra)
        return ctx

    def _fmt_valor(v):
        return fmt_moeda(float(v or 0))

    def _fmt_data(d):
        if not d:
            return ""
        if hasattr(d, "strftime"):
            return d.strftime("%d/%m/%Y")
        return str(d)

    def _so_digitos(v):
        return re.sub(r"\D", "", str(v or ""))

    def _cert_key():
        seed = os.getenv("DATABASE_URL", "essencia-nfse-local")
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

    def _ler_cert_info(pfx_path, senha):
        info = {"validade": None, "razao_social": "", "cnpj": "", "subject": "", "valido": False}
        try:
            from cryptography.hazmat.primitives.serialization import pkcs12
            from cryptography import x509

            with open(pfx_path, "rb") as f:
                data = f.read()
            pwd = senha.encode() if senha else None
            key, cert, _ = pkcs12.load_key_and_certificates(data, pwd)
            if cert:
                info["valido"] = True
                info["subject"] = cert.subject.rfc4514_string()
                na = cert.not_valid_after_utc if hasattr(cert, "not_valid_after_utc") else cert.not_valid_after
                info["validade"] = na.date() if na else None
                for attr in cert.subject:
                    oid = attr.oid._name if hasattr(attr.oid, "_name") else str(attr.oid)
                    if oid in ("commonName", "organizationName"):
                        info["razao_social"] = info["razao_social"] or attr.value
                    if oid == "commonName" and not info["razao_social"]:
                        info["razao_social"] = attr.value
                cn = _so_digitos(info["subject"])
                if len(cn) >= 14:
                    info["cnpj"] = cn[:14]
        except ImportError:
            info["subject"] = "Instale cryptography para validação automática"
        except Exception as exc:
            info["subject"] = f"Erro ao ler certificado: {exc}"
        return info

    def _proximo_rps():
        row = one(
            """
            select coalesce(max(nullif(regexp_replace(coalesce(numero_rps,''), '\\D', '', 'g'), '')::bigint), 0) + 1 as n
              from financeiro_notas_servico
            """
        )
        return str(int(row.get("n") or 1))

    def _calc_totais(payload, itens):
        total_srv = sum(float(i.get("valor") or 0) for i in (itens or []))
        desc = _num(payload.get("desconto_incondicional"))
        base = _num(payload.get("base_calculo")) or total_srv
        total = _num(payload.get("total_nota")) or max(0, base - desc)
        ali = _num(payload.get("aliquota_iss"))
        valor_iss = _num(payload.get("valor_iss"))
        if not valor_iss and ali and base:
            valor_iss = round(base * ali / 100, 2)
        com_pct = _num(payload.get("comissao_pct"))
        com_val = _num(payload.get("comissao_valor"))
        if not com_val and com_pct and total:
            com_val = round(total * com_pct / 100, 2)
        return total_srv, base, desc, total, valor_iss, com_val

    def _payload_nota(p):
        p = p or {}
        itens = p.get("itens") or []
        if not itens and p.get("servico_descricao"):
            itens = [{"descricao": p.get("servico_descricao"), "valor": p.get("servico_valor") or p.get("total_nota")}]
        total_srv, base, desc, total, valor_iss, com_val = _calc_totais(p, itens)
        if total <= 0 and total_srv > 0:
            total = max(0, total_srv - desc)
        if not p.get("cliente_nome"):
            raise ValueError("Cliente é obrigatório")
        if total <= 0:
            raise ValueError("Valor total da nota deve ser maior que zero")
        return p, itens, total_srv, base, desc, total, valor_iss, com_val

    def _salvar_impostos(nid, p, valor_iss):
        imp = p.get("impostos") or p
        q(
            """
            insert into financeiro_notas_servico_impostos (
              nota_id, codigo_tributacao, codigo_cnae, codigo_trib_municipal, nbs, indicador_operacao,
              aliquota_iss, valor_iss, reter_iss, descontar_iss, reter_inss, reter_csll_pis_cofins,
              valor_ibpt, valor_aprox_tributos, cst_ibs_cbs, classificacao_tributaria_ibs_cbs
            ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            on conflict (nota_id) do update set
              codigo_tributacao=excluded.codigo_tributacao,
              codigo_cnae=excluded.codigo_cnae,
              codigo_trib_municipal=excluded.codigo_trib_municipal,
              nbs=excluded.nbs,
              indicador_operacao=excluded.indicador_operacao,
              aliquota_iss=excluded.aliquota_iss,
              valor_iss=excluded.valor_iss,
              reter_iss=excluded.reter_iss,
              descontar_iss=excluded.descontar_iss,
              reter_inss=excluded.reter_inss,
              reter_csll_pis_cofins=excluded.reter_csll_pis_cofins,
              valor_ibpt=excluded.valor_ibpt,
              valor_aprox_tributos=excluded.valor_aprox_tributos,
              cst_ibs_cbs=excluded.cst_ibs_cbs,
              classificacao_tributaria_ibs_cbs=excluded.classificacao_tributaria_ibs_cbs
            """,
            (
                str(nid),
                _txt(imp.get("codigo_tributacao")),
                _txt(imp.get("codigo_cnae")),
                _txt(imp.get("codigo_trib_municipal")),
                _txt(imp.get("nbs")),
                _txt(imp.get("indicador_operacao")),
                _num(imp.get("aliquota_iss")),
                valor_iss,
                bool(imp.get("reter_iss")),
                bool(imp.get("descontar_iss")),
                bool(imp.get("reter_inss")),
                bool(imp.get("reter_csll_pis_cofins")),
                _num(imp.get("valor_ibpt")),
                _num(imp.get("valor_aprox_tributos")),
                _txt(imp.get("cst_ibs_cbs")),
                _txt(imp.get("classificacao_tributaria_ibs_cbs")),
            ),
        )

    def _salvar_itens(nid, itens):
        q("delete from financeiro_notas_servico_itens where nota_id=%s", (str(nid),))
        for i, item in enumerate(itens or [], start=1):
            desc = _txt(item.get("descricao"))
            val = _num(item.get("valor"))
            if not desc:
                continue
            q(
                """
                insert into financeiro_notas_servico_itens (nota_id, sequencia, descricao, valor)
                values (%s,%s,%s,%s)
                """,
                (str(nid), i, desc, val),
            )

    def _salvar_parcelas(nid, parcelas, manter_cr=False):
        existentes = q(
            "select id, conta_receber_id from financeiro_notas_servico_parcelas where nota_id=%s",
            (str(nid),),
            fetch=True,
        ) or []
        cr_map = {str(r["id"]): r.get("conta_receber_id") for r in existentes if r.get("conta_receber_id")}
        if not manter_cr:
            q("delete from financeiro_notas_servico_parcelas where nota_id=%s and conta_receber_id is null", (str(nid),))
        else:
            q("delete from financeiro_notas_servico_parcelas where nota_id=%s and conta_receber_id is null", (str(nid),))
        for i, pr in enumerate(parcelas or [], start=1):
            q(
                """
                insert into financeiro_notas_servico_parcelas (nota_id, numero_parcela, vencimento, valor, conta_receber_id)
                values (%s,%s,%s,%s,%s)
                """,
                (
                    str(nid),
                    _txt(pr.get("numero_parcela")) or str(i).zfill(3),
                    _parse_data(pr.get("vencimento")),
                    _num(pr.get("valor")),
                    cr_map.get(str(pr.get("id"))) if manter_cr else None,
                ),
            )

    def salvar_nota(payload):
        p, itens, total_srv, base, desc, total, valor_iss, com_val = _payload_nota(payload)
        nid = _txt(p.get("id"))
        situacao = (_txt(p.get("situacao")) or "pendente").lower()
        if situacao not in ("pendente", "emitida", "cancelada", "erro"):
            situacao = "pendente"
        params = (
            situacao,
            _txt(p.get("numero_rps")) or _proximo_rps(),
            _txt(p.get("serie_rps")) or "1",
            _txt(p.get("numero_nfse")),
            _parse_data(p.get("data_emissao")) or date.today(),
            _txt(p.get("natureza_operacao")) or "Tributação no município",
            (_txt(p.get("contato_id")) or None),
            _txt(p.get("cliente_nome")),
            _txt(p.get("cliente_cnpj_cpf")),
            _txt(p.get("cliente_ie")),
            _txt(p.get("cliente_im")),
            bool(p.get("cliente_consumidor_gov")),
            _txt(p.get("cliente_tipo_operacao")),
            _txt(p.get("cliente_cep")),
            _txt(p.get("cliente_uf")),
            _txt(p.get("cliente_municipio")),
            _txt(p.get("cliente_bairro")),
            _txt(p.get("cliente_endereco")),
            _txt(p.get("cliente_numero")),
            _txt(p.get("cliente_complemento")),
            _txt(p.get("cliente_fone")),
            _txt(p.get("cliente_email")),
            _txt(p.get("municipio_prestacao")),
            total_srv,
            base,
            desc,
            total,
            _txt(p.get("vendedor")),
            _num(p.get("comissao_pct")),
            com_val,
            _txt(p.get("condicao_pagamento")),
            max(0, int(p.get("dias_pagamento") or 0)),
            max(1, int(p.get("quantidade_parcelas") or 1)),
            max(1, int(p.get("intervalo_parcelas") or 30)),
            (_txt(p.get("categoria_id")) or None),
            _txt(p.get("categoria_txt")),
            _txt(p.get("observacoes")),
        )
        if nid:
            atual = one("select situacao, vinculacao_cr, numero_nfse from financeiro_notas_servico where id=%s", (nid,))
            if not atual:
                raise ValueError("Nota não encontrada")
            if atual.get("vinculacao_cr") == "lancado_contas_receber":
                pass
            q(
                """
                update financeiro_notas_servico set
                  situacao=%s, numero_rps=%s, serie_rps=%s, numero_nfse=%s, data_emissao=%s,
                  natureza_operacao=%s, contato_id=%s, cliente_nome=%s, cliente_cnpj_cpf=%s,
                  cliente_ie=%s, cliente_im=%s, cliente_consumidor_gov=%s, cliente_tipo_operacao=%s,
                  cliente_cep=%s, cliente_uf=%s, cliente_municipio=%s, cliente_bairro=%s,
                  cliente_endereco=%s, cliente_numero=%s, cliente_complemento=%s, cliente_fone=%s,
                  cliente_email=%s, municipio_prestacao=%s, total_servicos=%s, base_calculo=%s,
                  desconto_incondicional=%s, total_nota=%s, vendedor=%s, comissao_pct=%s,
                  comissao_valor=%s, condicao_pagamento=%s, dias_pagamento=%s,
                  quantidade_parcelas=%s, intervalo_parcelas=%s,
                  categoria_id=%s, categoria_txt=%s, observacoes=%s, updated_at=now()
                where id=%s
                """,
                params + (nid,),
            )
        else:
            row = one(
                """
                insert into financeiro_notas_servico (
                  situacao, numero_rps, serie_rps, numero_nfse, data_emissao, natureza_operacao,
                  contato_id, cliente_nome, cliente_cnpj_cpf, cliente_ie, cliente_im,
                  cliente_consumidor_gov, cliente_tipo_operacao, cliente_cep, cliente_uf,
                  cliente_municipio, cliente_bairro, cliente_endereco, cliente_numero,
                  cliente_complemento, cliente_fone, cliente_email, municipio_prestacao,
                  total_servicos, base_calculo, desconto_incondicional, total_nota,
                  vendedor, comissao_pct, comissao_valor, condicao_pagamento,
                  dias_pagamento, quantidade_parcelas, intervalo_parcelas,
                  categoria_id, categoria_txt, observacoes, updated_at
                ) values (
                  %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                  %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now()
                ) returning id
                """,
                params,
            )
            nid = str(row["id"])
        _salvar_itens(nid, itens)
        _salvar_impostos(nid, p, valor_iss)
        parcelas = p.get("parcelas") or []
        vinc = one("select vinculacao_cr from financeiro_notas_servico where id=%s", (nid,))
        _salvar_parcelas(nid, parcelas, manter_cr=vinc and vinc.get("vinculacao_cr") == "lancado_contas_receber")
        return nota_por_id(nid)

    def nota_por_id(nid):
        row = one("select * from financeiro_notas_servico where id=%s", (str(nid),))
        if not row:
            return None
        n = dict(row)
        n["id"] = str(n["id"])
        if n.get("contato_id"):
            n["contato_id"] = str(n["contato_id"])
        if n.get("categoria_id"):
            n["categoria_id"] = str(n["categoria_id"])
        n["total_nota_fmt"] = _fmt_valor(n.get("total_nota"))
        n["total_servicos_fmt"] = _fmt_valor(n.get("total_servicos"))
        n["data_emissao_fmt"] = _fmt_data(n.get("data_emissao"))
        n["numero_exibicao"] = n.get("numero_nfse") or n.get("numero_rps") or "—"
        if n.get("link_nfse"):
            n["link_nfse"] = str(n["link_nfse"])
        n["itens"] = q(
            "select * from financeiro_notas_servico_itens where nota_id=%s order by sequencia",
            (str(nid),),
            fetch=True,
        ) or []
        for it in n["itens"]:
            it["id"] = str(it["id"])
            it["valor_fmt"] = _fmt_valor(it.get("valor"))
        imp = one("select * from financeiro_notas_servico_impostos where nota_id=%s", (str(nid),))
        n["impostos"] = dict(imp) if imp else {}
        if n["impostos"].get("id"):
            n["impostos"]["id"] = str(n["impostos"]["id"])
        n["parcelas"] = q(
            "select * from financeiro_notas_servico_parcelas where nota_id=%s order by vencimento, numero_parcela",
            (str(nid),),
            fetch=True,
        ) or []
        for pr in n["parcelas"]:
            pr["id"] = str(pr["id"])
            pr["valor_fmt"] = _fmt_valor(pr.get("valor"))
            if pr.get("vencimento") and hasattr(pr["vencimento"], "strftime"):
                pr["vencimento_fmt"] = pr["vencimento"].strftime("%d/%m/%Y")
                pr["vencimento"] = pr["vencimento"].strftime("%Y-%m-%d")
            if pr.get("conta_receber_id"):
                pr["conta_receber_id"] = str(pr["conta_receber_id"])
        vinculos = q(
            """
            select v.*, r.status as cr_status, r.descricao as cr_descricao
              from financeiro_notas_servico_cr_vinculos v
              left join financeiro_contas_receber r on r.id = v.conta_receber_id
             where v.nota_id=%s and v.estornado_at is null
             order by v.created_at
            """,
            (str(nid),),
            fetch=True,
        ) or []
        n["vinculos_cr"] = []
        for v in vinculos:
            v["id"] = str(v["id"])
            v["conta_receber_id"] = str(v["conta_receber_id"])
            n["vinculos_cr"].append(v)
        return n

    def listar_notas(filtros=None):
        q(
            """
            update financeiro_notas_servico n
               set vinculacao_cr = 'lancado_contas_receber', updated_at = now()
             where exists (
               select 1 from financeiro_notas_servico_cr_vinculos v
                where v.nota_id = n.id and v.estornado_at is null
             )
               and coalesce(n.vinculacao_cr, '') <> 'lancado_contas_receber'
            """
        )
        q(
            """
            update financeiro_notas_servico n
               set vinculacao_cr = 'nao_vinculado', updated_at = now()
             where coalesce(n.vinculacao_cr, '') = 'lancado_contas_receber'
               and not exists (
                 select 1 from financeiro_notas_servico_cr_vinculos v
                  where v.nota_id = n.id and v.estornado_at is null
               )
            """
        )
        f = filtros or {}
        wh = ["1=1"]
        params = []
        sit = _txt(f.get("situacao"))
        if sit:
            wh.append("n.situacao=%s")
            params.append(sit)
        busca = _txt(f.get("busca"))
        if busca:
            wh.append(
                "(n.cliente_nome ilike %s or coalesce(n.numero_nfse,'') ilike %s or coalesce(n.numero_rps,'') ilike %s)"
            )
            like = f"%{busca}%"
            params.extend([like, like, like])
        di = _parse_data(f.get("data_ini"))
        df = _parse_data(f.get("data_fim"))
        if di:
            wh.append("n.data_emissao >= %s")
            params.append(di)
        if df:
            wh.append("n.data_emissao <= %s")
            params.append(df)
        where = " and ".join(wh)
        rows = q(
            f"""
            select n.* from financeiro_notas_servico n
             where {where}
             order by n.data_emissao desc nulls last, n.created_at desc
            """,
            tuple(params) if params else None,
            fetch=True,
        ) or []
        itens = []
        total_val = 0
        for r in rows:
            n = nota_por_id(r["id"])
            if n:
                itens.append(n)
                total_val += float(n.get("total_nota") or 0)
        return {
            "itens": itens,
            "painel": {"quantidade": len(itens), "valor_total": total_val, "valor_total_fmt": _fmt_valor(total_val)},
        }

    def _resolver_categoria(p):
        cid = _txt(p.get("categoria_id")) or None
        ctxt = _txt(p.get("categoria_txt"))
        if cid:
            row = one(
                "select id, descricao from financeiro_categorias where id=%s and coalesce(natureza,'') ilike 'Receita'",
                (cid,),
            )
            if row:
                return str(row["id"]), row.get("descricao") or ctxt or "Receita"
        if ctxt:
            row = one(
                "select id, descricao from financeiro_categorias where descricao ilike %s and coalesce(natureza,'') ilike 'Receita' limit 1",
                (ctxt,),
            )
            if row:
                return str(row["id"]), row.get("descricao")
        return cid, ctxt or "RECEITA COM SERVIÇOS"

    def _data_emissao_nota(nota):
        base = nota.get("data_emissao") or date.today()
        if hasattr(base, "strftime"):
            return base
        return _parse_data(base) or date.today()

    def _extrair_qtd_parcelas(nota):
        qp = nota.get("quantidade_parcelas")
        if qp is not None and int(qp or 0) > 0:
            return max(1, int(qp))
        cond = _txt(nota.get("condicao_pagamento")).lower()
        if not cond:
            return 1
        for pat in (r"(\d+)\s*x\b", r"(\d+)\s*parcel", r"(\d+)\s*vezes"):
            m = re.search(pat, cond)
            if m:
                return max(1, int(m.group(1)))
        return 1

    def _historico_cr(nota):
        num_rps = _txt(nota.get("numero_rps")) or "—"
        num_nfse = _txt(nota.get("numero_nfse"))
        if num_nfse:
            return f"Cobrança de serviço ref. RPS nº {num_rps} / NFS-e nº {num_nfse}"
        return f"Cobrança de serviço ref. RPS nº {num_rps}"

    def _valid_uuid(v):
        if not v:
            return None
        try:
            return str(uuid.UUID(str(v)))
        except (ValueError, AttributeError):
            return None

    def _gerar_parcelas_padrao(nota, qtd=None, intervalo_dias=None):
        qtd = max(1, int(qtd or _extrair_qtd_parcelas(nota)))
        dias_pag = max(0, int(nota.get("dias_pagamento") or 0))
        intervalo = max(1, int(intervalo_dias or nota.get("intervalo_parcelas") or 30))
        total = float(nota.get("total_nota") or 0)
        if total <= 0:
            return []
        val_p = round(total / qtd, 2)
        resto = round(total - val_p * qtd, 2)
        base = _data_emissao_nota(nota)
        primeira = base + timedelta(days=dias_pag)
        out = []
        for i in range(qtd):
            venc = primeira + timedelta(days=intervalo * i)
            val = val_p + (resto if i == qtd - 1 else 0)
            out.append({"numero_parcela": str(i + 1).zfill(3), "vencimento": venc.strftime("%Y-%m-%d"), "valor": val})
        return out

    def _sincronizar_vinculacao_cr(nid):
        ativos = one(
            """
            select count(*)::int as c from financeiro_notas_servico_cr_vinculos
             where nota_id=%s and estornado_at is null
            """,
            (str(nid),),
        )
        if int(ativos.get("c") or 0) > 0:
            q(
                "update financeiro_notas_servico set vinculacao_cr='lancado_contas_receber', updated_at=now() where id=%s",
                (str(nid),),
            )
            return "lancado_contas_receber"
        q(
            """
            update financeiro_notas_servico
               set vinculacao_cr='nao_vinculado', updated_at=now()
             where id=%s and coalesce(vinculacao_cr,'')='lancado_contas_receber'
            """,
            (str(nid),),
        )
        return "nao_vinculado"

    def _reset_parcelas_para_lancamento(nid):
        q(
            """
            update financeiro_notas_servico_parcelas p
               set conta_receber_id = null
             where p.nota_id = %s
               and p.conta_receber_id is not null
               and not exists (
                 select 1 from financeiro_notas_servico_cr_vinculos v
                  where v.conta_receber_id = p.conta_receber_id
                    and v.estornado_at is null
               )
            """,
            (str(nid),),
        )

    def lancar_contas_receber(nid, conta_financeira_id=None):
        nota = nota_por_id(nid)
        if not nota:
            raise ValueError("Nota não encontrada")

        _sincronizar_vinculacao_cr(nid)
        nota = nota_por_id(nid)

        situacao = (nota.get("situacao") or "pendente").lower()
        if situacao == "cancelada":
            raise ValueError("Não é possível lançar em Contas a Receber uma NFS-e cancelada.")
        if situacao not in ("pendente", "emitida", "erro"):
            raise ValueError(
                f"Situação «{situacao}» não permite lançamento. Apenas notas Pendentes, Emitidas ou com Erro de emissão podem ser lançadas."
            )

        if nota.get("vinculacao_cr") == "lancado_contas_receber":
            raise ValueError("Esta nota já possui lançamento em Contas a Receber.")
        vinc_ativos = one(
            """
            select count(*)::int as c from financeiro_notas_servico_cr_vinculos
             where nota_id=%s and estornado_at is null
            """,
            (str(nid),),
        )
        if int(vinc_ativos.get("c") or 0) > 0:
            _sincronizar_vinculacao_cr(nid)
            raise ValueError("Esta nota já possui lançamento em Contas a Receber.")

        total_nota = float(nota.get("total_nota") or 0)
        if total_nota <= 0:
            raise ValueError("Valor total da nota deve ser maior que zero para lançar em Contas a Receber.")

        _reset_parcelas_para_lancamento(nid)
        nota = nota_por_id(nid)

        cat_id, cat_txt = _resolver_categoria(nota)
        cat_id = _valid_uuid(cat_id)
        parcelas = nota.get("parcelas") or []
        pendentes = [p for p in parcelas if not p.get("conta_receber_id") and float(p.get("valor") or 0) > 0]
        if not pendentes:
            qtd = _extrair_qtd_parcelas(nota)
            intervalo = max(1, int(nota.get("intervalo_parcelas") or 30))
            geradas = _gerar_parcelas_padrao(nota, qtd, intervalo)
            if not geradas:
                raise ValueError("Não foi possível gerar parcelas para lançamento.")
            _salvar_parcelas(nid, geradas)
        nota = nota_por_id(nid)
        pendentes = [
            p for p in (nota.get("parcelas") or [])
            if not p.get("conta_receber_id") and float(p.get("valor") or 0) > 0
        ]
        if not pendentes:
            emissao = _data_emissao_nota(nota)
            dias_pag = max(0, int(nota.get("dias_pagamento") or 0))
            pendentes = [
                {
                    "numero_parcela": "001",
                    "vencimento": (emissao + timedelta(days=dias_pag)).strftime("%Y-%m-%d"),
                    "valor": nota["total_nota"],
                }
            ]

        num_rps = _txt(nota.get("numero_rps")) or "—"
        cliente = nota.get("cliente_nome") or "Cliente"
        emissao = _data_emissao_nota(nota)
        criados = []
        vencimentos = []
        total_p = len(pendentes)
        hist_base = _historico_cr(nota)

        for idx, pr in enumerate(pendentes, start=1):
            valor = float(pr.get("valor") or 0)
            if valor <= 0:
                continue
            venc = _parse_data(pr.get("vencimento")) or emissao
            n_parc = pr.get("numero_parcela") or str(idx).zfill(3)
            if total_p > 1:
                desc = f"{hist_base} — Parc. {n_parc} ({idx}/{total_p})"
            else:
                desc = hist_base
            row = one(
                """
                insert into financeiro_contas_receber (
                  cliente, descricao, categoria, categoria_id, competencia, emissao, vencimento,
                  valor, parcelas, conta_financeira_id, forma_recebimento, tipo_recebimento,
                  numero_documento, status, observacoes, nota_servico_id, updated_at
                ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'em_aberto',%s,%s,now()) returning id
                """,
                (
                    cliente,
                    desc,
                    cat_txt,
                    cat_id,
                    emissao,
                    emissao,
                    venc,
                    valor,
                    total_p,
                    conta_financeira_id,
                    nota.get("condicao_pagamento") or "À vista",
                    "NFS-e",
                    num_rps,
                    f"Gerado automaticamente da NFS-e/RPS {num_rps}.",
                    str(nid),
                ),
            )
            rid = str(row["id"])
            q(
                """
                insert into financeiro_notas_servico_cr_vinculos (nota_id, conta_receber_id)
                values (%s,%s)
                """,
                (str(nid), rid),
            )
            if pr.get("id"):
                q(
                    "update financeiro_notas_servico_parcelas set conta_receber_id=%s where id=%s",
                    (rid, str(pr["id"])),
                )
            criados.append(rid)
            vencimentos.append(venc.strftime("%Y-%m-%d") if hasattr(venc, "strftime") else str(venc))

        if not criados:
            raise ValueError("Nenhuma parcela válida para lançar em Contas a Receber.")
        q(
            "update financeiro_notas_servico set vinculacao_cr='lancado_contas_receber', updated_at=now() where id=%s",
            (str(nid),),
        )
        log_nfse.info(
            "NFS-e lançada em Contas a Receber | nota_servico_id=%s | contato_id=%s | cliente=%s | "
            "valor_total=%s | vencimentos=%s | parcelas_criadas=%s | contas_receber_ids=%s",
            str(nid),
            nota.get("contato_id"),
            cliente,
            total_nota,
            vencimentos,
            len(criados),
            criados,
        )
        return criados

    def estornar_contas_receber(nid):
        nota = nota_por_id(nid)
        if not nota:
            raise ValueError("Nota não encontrada")
        if nota.get("vinculacao_cr") != "lancado_contas_receber":
            raise ValueError("Nota não possui lançamento em Contas a Receber")
        vinculos = nota.get("vinculos_cr") or []
        if not vinculos:
            raise ValueError("Nenhum vínculo ativo encontrado")
        bloqueados = []
        for v in vinculos:
            rid = v.get("conta_receber_id")
            st = (v.get("cr_status") or "").lower()
            baixas = one(
                "select count(*)::int as c from financeiro_baixas_receber where conta_receber_id=%s",
                (rid,),
            )
            if int(baixas.get("c") or 0) > 0 or st in ("recebido", "parcialmente_recebido"):
                bloqueados.append(rid)
        if bloqueados:
            raise ValueError(
                "Existem recebimentos ou baixas vinculados. Estorne as baixas antes ou cancele manualmente."
            )
        for v in vinculos:
            rid = v.get("conta_receber_id")
            q("delete from financeiro_contas_receber where id=%s and coalesce(status,'em_aberto')='em_aberto'", (rid,))
            q(
                "update financeiro_notas_servico_cr_vinculos set estornado_at=now() where id=%s",
                (str(v["id"]),),
            )
            q(
                "update financeiro_notas_servico_parcelas set conta_receber_id=null where conta_receber_id=%s",
                (rid,),
            )
        q(
            "update financeiro_notas_servico set vinculacao_cr='nao_vinculado', updated_at=now() where id=%s",
            (str(nid),),
        )
        return True

    def clonar_nota(nid):
        orig = nota_por_id(nid)
        if not orig:
            raise ValueError("Nota não encontrada")
        payload = {
            "situacao": "pendente",
            "numero_rps": _proximo_rps(),
            "serie_rps": orig.get("serie_rps") or "1",
            "numero_nfse": "",
            "data_emissao": date.today().strftime("%Y-%m-%d"),
            "natureza_operacao": orig.get("natureza_operacao"),
            "contato_id": orig.get("contato_id"),
            "cliente_nome": orig.get("cliente_nome"),
            "cliente_cnpj_cpf": orig.get("cliente_cnpj_cpf"),
            "cliente_ie": orig.get("cliente_ie"),
            "cliente_im": orig.get("cliente_im"),
            "cliente_consumidor_gov": orig.get("cliente_consumidor_gov"),
            "cliente_tipo_operacao": orig.get("cliente_tipo_operacao"),
            "cliente_cep": orig.get("cliente_cep"),
            "cliente_uf": orig.get("cliente_uf"),
            "cliente_municipio": orig.get("cliente_municipio"),
            "cliente_bairro": orig.get("cliente_bairro"),
            "cliente_endereco": orig.get("cliente_endereco"),
            "cliente_numero": orig.get("cliente_numero"),
            "cliente_complemento": orig.get("cliente_complemento"),
            "cliente_fone": orig.get("cliente_fone"),
            "cliente_email": orig.get("cliente_email"),
            "municipio_prestacao": orig.get("municipio_prestacao"),
            "desconto_incondicional": orig.get("desconto_incondicional"),
            "base_calculo": orig.get("base_calculo"),
            "vendedor": orig.get("vendedor"),
            "comissao_pct": orig.get("comissao_pct"),
            "condicao_pagamento": orig.get("condicao_pagamento"),
            "dias_pagamento": orig.get("dias_pagamento") or 0,
            "quantidade_parcelas": orig.get("quantidade_parcelas") or 1,
            "intervalo_parcelas": orig.get("intervalo_parcelas") or 30,
            "categoria_id": orig.get("categoria_id"),
            "categoria_txt": orig.get("categoria_txt"),
            "observacoes": orig.get("observacoes"),
            "itens": [{"descricao": i.get("descricao"), "valor": i.get("valor")} for i in orig.get("itens") or []],
            "impostos": orig.get("impostos") or {},
            "parcelas": [],
        }
        return salvar_nota(payload)

    def alterar_situacao(nid, situacao):
        sit = (situacao or "").lower()
        if sit not in ("pendente", "emitida", "cancelada", "erro"):
            raise ValueError("Situação inválida")
        q(
            "update financeiro_notas_servico set situacao=%s, updated_at=now() where id=%s",
            (sit, str(nid)),
        )
        return nota_por_id(nid)

    def excluir_notas(ids):
        removidos = 0
        for nid in ids:
            nota = one("select vinculacao_cr, situacao from financeiro_notas_servico where id=%s", (str(nid),))
            if not nota:
                continue
            if nota.get("vinculacao_cr") == "lancado_contas_receber":
                raise ValueError("Nota com lançamento em Contas a Receber não pode ser excluída. Estorne antes.")
            q("delete from financeiro_notas_servico where id=%s", (str(nid),))
            removidos += 1
        return removidos

    def certificado_ativo():
        row = one(
            """
            select * from financeiro_config_fiscal_certificado
             where coalesce(ativo, true) = true
             order by updated_at desc limit 1
            """
        )
        if not row:
            row = one(
                "select * from financeiro_certificados_digitais where coalesce(ativo,true)=true order by updated_at desc limit 1"
            )
        if not row:
            return None
        c = dict(row)
        c["id"] = str(c["id"])
        c["validade_fmt"] = _fmt_data(c.get("validade"))
        c["valido"] = bool(c.get("validade") and c["validade"] >= date.today())
        c.pop("senha_criptografada", None)
        return c

    # --- Páginas ---
    @app.get("/financeiro/notas-servico", response_class=HTMLResponse)
    def pagina_nfse_lista(request: Request):
        return templates.TemplateResponse("financeiro/nfse.html", tpl_ctx(request))

    @app.get("/financeiro/notas-servico/nova", response_class=HTMLResponse)
    def pagina_nfse_nova(request: Request):
        return templates.TemplateResponse(
            "financeiro/nfse_form.html",
            tpl_ctx(request, {"modo": "nova", "nota_id": "", "proximo_rps": _proximo_rps()}),
        )

    @app.get("/financeiro/notas-servico/{nid}/editar", response_class=HTMLResponse)
    def pagina_nfse_editar(request: Request, nid: str):
        return templates.TemplateResponse(
            "financeiro/nfse_form.html",
            tpl_ctx(request, {"modo": "editar", "nota_id": nid, "proximo_rps": ""}),
        )

    # --- API NFS-e ---
    def _carregar_config_fiscal():
        row = one("select * from financeiro_config_fiscal order by updated_at desc limit 1")
        if not row:
            return None
        c = dict(row)
        c["id"] = str(c["id"])
        c["aliquota_iss_padrao"] = float(c.get("aliquota_iss_padrao") or 0)
        c["ambiente"] = (c.get("ambiente") or "homologacao").lower()
        return c

    def _carregar_cert_fiscal():
        row = one(
            """
            select * from financeiro_config_fiscal_certificado
             where coalesce(ativo, true) = true
             order by updated_at desc limit 1
            """
        )
        if not row:
            return certificado_ativo()
        c = dict(row)
        c["id"] = str(c["id"])
        val = c.get("validade")
        c["valido"] = bool(val and val >= date.today())
        c["vencido"] = bool(val and val < date.today())
        return c

    def _meta_emissao_lista(res):
        import financeiro_config_fiscal as fcf
        from nfse_nacional.service import pendencias_emissao_empresa, pendencias_emissao_nota

        config = _carregar_config_fiscal()
        cert = _carregar_cert_fiscal()
        emp_pend = pendencias_emissao_empresa(config, cert, fcf._dec_senha)
        res["emissao"] = {
            "empresa_pronta": not emp_pend,
            "pendencias_empresa": emp_pend,
            "ambiente": (config.get("ambiente") if config else "homologacao"),
        }
        for n in res.get("itens") or []:
            np = pendencias_emissao_nota(n, config)
            n["emissao_pode"] = not emp_pend and not np
            n["emissao_bloqueio"] = "; ".join(np or emp_pend) if (np or emp_pend) else ""
        return res

    @app.get("/api/financeiro/notas-servico")
    def api_lista_nfse(request: Request):
        f = dict(request.query_params)
        res = listar_notas(f)
        return {"ok": True, **_meta_emissao_lista(res)}

    @app.get("/api/financeiro/notas-servico/proximo-rps")
    def api_proximo_rps():
        return {"ok": True, "numero_rps": _proximo_rps()}

    @app.get("/api/financeiro/notas-servico/{nid}")
    def api_get_nfse(nid: str):
        item = nota_por_id(nid)
        if not item:
            return JSONResponse({"ok": False, "erro": "Nota não encontrada"}, 404)
        return {"ok": True, "item": item}

    @app.post("/api/financeiro/notas-servico")
    async def api_post_nfse(request: Request):
        try:
            p = await request.json()
            item = salvar_nota(p)
            return {"ok": True, "item": item}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.put("/api/financeiro/notas-servico/{nid}")
    async def api_put_nfse(nid: str, request: Request):
        try:
            p = await request.json()
            p["id"] = nid
            item = salvar_nota(p)
            return {"ok": True, "item": item}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.delete("/api/financeiro/notas-servico")
    async def api_delete_nfse(request: Request):
        try:
            p = await request.json()
            ids = p.get("ids") or []
            n = excluir_notas(ids)
            return {"ok": True, "removidos": n}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.post("/api/financeiro/notas-servico/{nid}/clonar")
    def api_clonar_nfse(nid: str):
        try:
            item = clonar_nota(nid)
            return {"ok": True, "item": item}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.post("/api/financeiro/notas-servico/{nid}/lancar-contas-receber")
    async def api_lancar_cr(nid: str, request: Request):
        try:
            p = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
            ids = lancar_contas_receber(nid, (p or {}).get("conta_financeira_id"))
            if len(ids) == 1:
                mensagem = "Conta a receber criada com sucesso."
            else:
                mensagem = f"{len(ids)} contas a receber criadas com sucesso."
            return {"ok": True, "mensagem": mensagem, "contas_receber_ids": ids, "item": nota_por_id(nid)}
        except Exception as exc:
            log_nfse.warning("Falha ao lançar NFS-e em CR | nota_servico_id=%s | erro=%s", nid, exc)
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.post("/api/financeiro/notas-servico/{nid}/estornar-contas-receber")
    def api_estornar_cr(nid: str):
        try:
            estornar_contas_receber(nid)
            return {"ok": True, "item": nota_por_id(nid)}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.put("/api/financeiro/notas-servico/{nid}/situacao")
    async def api_situacao_nfse(nid: str, request: Request):
        try:
            p = await request.json()
            item = alterar_situacao(nid, p.get("situacao"))
            return {"ok": True, "item": item}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    def _aplicar_emissao_sucesso(nid, dados):
        chave = (dados.get("chave_acesso") or "").strip()
        if not chave:
            raise ValueError("Emissão sem chave de acesso — nota não será marcada como emitida")
        q(
            """
            update financeiro_notas_servico set
              situacao='emitida',
              numero_nfse=%s,
              chave_acesso=%s,
              codigo_verificacao=%s,
              protocolo=%s,
              link_nfse=%s,
              id_dps=%s,
              xml_enviado=%s,
              xml_retorno=%s,
              erro_emissao=null,
              updated_at=now()
            where id=%s
            """,
            (
                dados.get("numero_nfse") or dados.get("chave_acesso", "")[-15:],
                dados.get("chave_acesso"),
                dados.get("codigo_verificacao"),
                dados.get("protocolo"),
                dados.get("link_nfse"),
                dados.get("id_dps"),
                (dados.get("xml_enviado") or "")[:500000],
                (dados.get("xml_retorno") or "")[:500000],
                str(nid),
            ),
        )

    def _aplicar_emissao_erro(nid, mensagem):
        q(
            """
            update financeiro_notas_servico set
              situacao='erro',
              erro_emissao=%s,
              updated_at=now()
            where id=%s
            """,
            (str(mensagem)[:4000], str(nid)),
        )

    @app.post("/api/financeiro/notas-servico/{nid}/emitir")
    def api_emitir_nfse(nid: str):
        """Emissão NFS-e — Ambiente Nacional (SEFIN)."""
        import financeiro_config_fiscal as fcf
        from nfse_nacional.client import NfseNacionalErro
        from nfse_nacional.service import emitir_nota

        nota = nota_por_id(nid)
        if not nota:
            return JSONResponse({"ok": False, "erro": "Nota não encontrada"}, 404)
        config = _carregar_config_fiscal()
        cert = _carregar_cert_fiscal()
        try:
            dados = emitir_nota(config, cert, nota, fcf._dec_senha)
            _aplicar_emissao_sucesso(nid, dados)
            log_nfse.info(
                "NFS-e emitida | nota=%s | chave=%s | protocolo=%s",
                nid,
                dados.get("chave_acesso"),
                dados.get("protocolo"),
            )
            return {
                "ok": True,
                "mensagem": "NFS-e autorizada com sucesso.",
                "emissao": dados,
                "item": nota_por_id(nid),
            }
        except NfseNacionalErro as exc:
            _aplicar_emissao_erro(nid, str(exc))
            log_nfse.warning("NFS-e rejeitada | nota=%s | %s", nid, exc)
            return JSONResponse({"ok": False, "erro": str(exc), "detalhes": exc.detalhes}, 400)
        except ValueError as exc:
            log_nfse.info("Emissão bloqueada (validação) | nota=%s | %s", nid, exc)
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)
        except Exception as exc:
            _aplicar_emissao_erro(nid, str(exc))
            log_nfse.warning("Falha emissão NFS-e | nota=%s | %s", nid, exc)
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.get("/api/financeiro/notas-servico/{nid}/consultar-nfse")
    def api_consultar_nfse(nid: str):
        import financeiro_config_fiscal as fcf
        from nfse_nacional.service import consultar_nfse

        nota = nota_por_id(nid)
        if not nota:
            return JSONResponse({"ok": False, "erro": "Nota não encontrada"}, 404)
        chave = nota.get("chave_acesso")
        if not chave:
            return JSONResponse({"ok": False, "erro": "Nota sem chave de acesso"}, 400)
        try:
            dados = consultar_nfse(
                _carregar_config_fiscal(),
                _carregar_cert_fiscal(),
                chave,
                fcf._dec_senha,
            )
            return {"ok": True, "consulta": dados, "item": nota}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.post("/api/financeiro/notas-servico/{nid}/cancelar-nfse")
    async def api_cancelar_nfse(nid: str, request: Request):
        import financeiro_config_fiscal as fcf
        from nfse_nacional.client import NfseNacionalErro
        from nfse_nacional.service import cancelar_nfse

        nota = nota_por_id(nid)
        if not nota:
            return JSONResponse({"ok": False, "erro": "Nota não encontrada"}, 404)
        if (nota.get("situacao") or "").lower() != "emitida":
            return JSONResponse({"ok": False, "erro": "Somente NFS-e emitida pode ser cancelada"}, 400)
        p = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
        motivo = _txt(p.get("motivo")) or "Cancelamento solicitado pelo emitente no sistema"
        try:
            res = cancelar_nfse(
                _carregar_config_fiscal(),
                _carregar_cert_fiscal(),
                nota,
                motivo,
                fcf._dec_senha,
                codigo_motivo=int(p.get("codigo_motivo") or 1),
            )
            q(
                "update financeiro_notas_servico set situacao='cancelada', erro_emissao=null, updated_at=now() where id=%s",
                (str(nid),),
            )
            return {"ok": True, "mensagem": "NFS-e cancelada com sucesso.", "retorno": res, "item": nota_por_id(nid)}
        except NfseNacionalErro as exc:
            return JSONResponse({"ok": False, "erro": str(exc), "detalhes": exc.detalhes}, 400)
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.post("/api/financeiro/notas-servico/gerar-parcelas-preview")
    async def api_gerar_parcelas_preview(request: Request):
        try:
            p = await request.json()
            nota_ctx = {
                "total_nota": p.get("total_nota"),
                "data_emissao": p.get("data_emissao"),
                "dias_pagamento": p.get("dias_pagamento"),
                "quantidade_parcelas": p.get("quantidade"),
                "intervalo_parcelas": p.get("intervalo_dias"),
            }
            qtd = max(1, int(p.get("quantidade") or nota_ctx.get("quantidade_parcelas") or 1))
            intervalo = max(1, int(p.get("intervalo_dias") or nota_ctx.get("intervalo_parcelas") or 30))
            parcelas = _gerar_parcelas_padrao(nota_ctx, qtd, intervalo)
            return {"ok": True, "parcelas": parcelas}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.post("/api/financeiro/notas-servico/{nid}/gerar-parcelas")
    async def api_gerar_parcelas(nid: str, request: Request):
        try:
            p = await request.json()
            nota = nota_por_id(nid) or {}
            merged = {**nota, **p}
            qtd = max(1, int(p.get("quantidade") or merged.get("quantidade_parcelas") or 1))
            intervalo = max(1, int(p.get("intervalo_dias") or merged.get("intervalo_parcelas") or 30))
            parcelas = _gerar_parcelas_padrao(merged, qtd, intervalo)
            if nid and one("select id from financeiro_notas_servico where id=%s", (str(nid),)):
                _salvar_parcelas(
                    nid,
                    parcelas,
                    manter_cr=nota.get("vinculacao_cr") == "lancado_contas_receber",
                )
                nota = nota_por_id(nid)
            return {"ok": True, "parcelas": parcelas, "item": nota}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, 400)

    @app.get("/financeiro/notas-servico/{nid}/imprimir", response_class=HTMLResponse)
    def pagina_imprimir_nfse(request: Request, nid: str):
        item = nota_por_id(nid)
        if not item:
            return HTMLResponse("<p>Nota não encontrada</p>", 404)
        return templates.TemplateResponse(
            "financeiro/nfse_impressao.html",
            {"request": request, "nota": item},
        )

    @app.post("/api/financeiro/notas-servico/{nid}/enviar-email")
    async def api_enviar_email(nid: str, request: Request):
        p = await request.json()
        nota = nota_por_id(nid)
        if not nota:
            return JSONResponse({"ok": False, "erro": "Nota não encontrada"}, 404)
        return {
            "ok": True,
            "mensagem": "Envio de e-mail preparado. Integração SMTP/PDF oficial pendente.",
            "destino": p.get("email") or nota.get("cliente_email"),
        }

    @app.get("/api/cadastros/contatos/{cid}/fiscal-nfse")
    def api_fiscal_cliente_nfse(cid: str):
        item = contato_por_id(cid)
        if not item:
            return JSONResponse({"ok": False, "erro": "Cliente não encontrado"}, 404)
        return {
            "ok": True,
            "item": {
                "id": item["id"],
                "nome": item.get("nome_exibicao") or item.get("razao_social") or item.get("nome") or "",
                "cnpj_cpf": item.get("cnpj") or item.get("cpf") or "",
                "ie": item.get("inscricao_estadual") or item.get("rg") or "",
                "cep": item.get("cep") or "",
                "uf": item.get("uf") or "",
                "municipio": item.get("cidade") or "",
                "bairro": item.get("bairro") or "",
                "endereco": item.get("logradouro") or "",
                "numero": item.get("numero") or "",
                "complemento": item.get("complemento") or "",
                "fone": item.get("telefone") or item.get("celular") or "",
                "email": item.get("email_nfse") or item.get("email") or "",
            },
        }
