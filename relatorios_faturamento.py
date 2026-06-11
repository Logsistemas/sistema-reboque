"""Relatórios gerenciais de Faturamento — dados da Central de Operações."""
import io
from collections import defaultdict

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse


REL_FAT_TIPOS = {
    "clientes": {
        "titulo": "Faturamento por Clientes",
        "subtitulo": "Agrupamento por cliente / seguradora",
        "grupo_label": "Cliente/Empresa",
        "maior_label": "Maior cliente",
    },
    "viaturas": {
        "titulo": "Faturamento por Viaturas",
        "subtitulo": "Agrupamento por viatura da operação",
        "grupo_label": "Viatura",
        "maior_label": "Maior viatura",
    },
    "profissionais": {
        "titulo": "Faturamento por Profissionais",
        "subtitulo": "Agrupamento por profissional / motorista",
        "grupo_label": "Profissional",
        "maior_label": "Maior profissional",
    },
    "tipos": {
        "titulo": "Faturamento por Tipos de Serviços",
        "subtitulo": "Agrupamento por tipo de serviço",
        "grupo_label": "Tipo de serviço",
        "maior_label": "Maior tipo",
    },
}


def register(app, templates):
    import app as main

    q = main.q
    one = main.one
    fmt_moeda = main.fmt_moeda
    formatar_data_hora_central = main.formatar_data_hora_central
    lista_tipos_servico = main.lista_tipos_servico
    opcoes_viaturas_controle = main.opcoes_viaturas_controle
    opcoes_profissionais_frota_abastecimento = main.opcoes_profissionais_frota_abastecimento
    normalizar_placa_viatura = main.normalizar_placa_viatura

    def _bool_filtro(val):
        if val is True:
            return True
        return str(val or "").lower() in ("1", "true", "on", "sim", "yes")

    def _parse_filtros(params):
        p = params or {}
        return {
            "data_ini": (p.get("data_ini") or "").strip()[:10],
            "data_fim": (p.get("data_fim") or "").strip()[:10],
            "cliente": (p.get("cliente") or "").strip(),
            "viatura": (p.get("viatura") or "").strip(),
            "profissional": (p.get("profissional") or "").strip(),
            "tipo": (p.get("tipo") or "").strip(),
            "seguradora": (p.get("seguradora") or "").strip(),
            "exibir_cancelados": _bool_filtro(p.get("exibir_cancelados")),
            "sem_pedagio": _bool_filtro(p.get("sem_pedagio")),
        }

    def _chave_grupo(servico, tipo):
        if tipo == "clientes":
            nome = (servico.get("seguradora") or "").strip() or "Sem cliente"
            return nome, {"cliente": nome}
        if tipo == "viaturas":
            nome = (servico.get("viatura_nome") or "Sem viatura").strip()
            placa = (servico.get("viatura_placa") or "-").strip()
            return f"{nome}|{placa}", {"viatura": nome, "placa": placa}
        if tipo == "profissionais":
            nome = (servico.get("motorista_nome") or "Sem profissional").strip()
            funcao = (servico.get("profissional_funcao") or "-").strip()
            return f"{nome}|{funcao}", {"profissional": nome, "funcao": funcao}
        if tipo == "tipos":
            nome = (servico.get("tipo") or "Sem tipo").strip()
            return nome, {"tipo": nome}
        return "—", {}

    def _valor_servico(servico, sem_pedagio):
        total = float(servico.get("valor_total") or 0)
        if sem_pedagio:
            total = max(0.0, total - float(servico.get("valor_pedagio") or 0))
        return round(total, 2)

    def _valores_financeiros(servico, sem_pedagio):
        valor = _valor_servico(servico, sem_pedagio)
        st = (servico.get("status_faturamento") or "para_conferir").lower()
        a_fechar = valor if st in ("para_conferir", "negociacao") else 0.0
        a_faturar = valor if st == "para_faturar" else 0.0
        return valor, a_fechar, a_faturar

    def _where_servicos(filtros):
        parts = []
        params = []
        if filtros.get("data_ini"):
            parts.append("coalesce(s.finalizado_em, s.created_at)::date >= %s")
            params.append(filtros["data_ini"])
        if filtros.get("data_fim"):
            parts.append("coalesce(s.finalizado_em, s.created_at)::date <= %s")
            params.append(filtros["data_fim"])
        if filtros.get("exibir_cancelados"):
            parts.append("lower(coalesce(s.status, '')) in ('finalizado', 'cancelado')")
        else:
            parts.append("lower(coalesce(s.status, '')) = 'finalizado'")
        if filtros.get("cliente"):
            parts.append("coalesce(s.seguradora, '') ilike %s")
            params.append(f"%{filtros['cliente']}%")
        if filtros.get("seguradora"):
            parts.append("coalesce(s.seguradora, '') ilike %s")
            params.append(f"%{filtros['seguradora']}%")
        if filtros.get("profissional"):
            parts.append("coalesce(s.motorista_nome, '') ilike %s")
            params.append(f"%{filtros['profissional']}%")
        if filtros.get("tipo"):
            parts.append("coalesce(s.tipo, '') ilike %s")
            params.append(f"%{filtros['tipo']}%")
        if filtros.get("viatura"):
            vt = filtros["viatura"]
            placa_n = normalizar_placa_viatura(vt)
            parts.append(
                """
                (
                  coalesce(v.exibicao, '') ilike %s
                  or coalesce(v.modelo, '') ilike %s
                  or coalesce(v.placa, '') ilike %s
                  or coalesce(m.placa_atual, '') ilike %s
                  or upper(replace(replace(coalesce(v.placa,''), '-', ''), ' ', '')) = %s
                  or upper(replace(replace(coalesce(m.placa_atual,''), '-', ''), ' ', '')) = %s
                )
                """
            )
            like = f"%{vt}%"
            params.extend([like, like, like, like, placa_n or vt.upper(), placa_n or vt.upper()])
        where = " and ".join(parts) if parts else "1=1"
        return where, params

    def buscar_servicos_rel_faturamento(filtros):
        where, params = _where_servicos(filtros)
        sql = f"""
            select s.*,
                   coalesce(
                     nullif(trim(v.exibicao), ''),
                     nullif(trim(v.modelo), ''),
                     nullif(trim(m.placa_atual), ''),
                     'Sem viatura'
                   ) as viatura_nome,
                   coalesce(nullif(trim(v.placa), ''), nullif(trim(m.placa_atual), ''), '-') as viatura_placa,
                   coalesce(
                     nullif(trim(pf.profissional_funcao), ''),
                     '-'
                   ) as profissional_funcao,
                   coalesce(
                     (
                       select sum(si.valor_total)
                         from servico_itens si
                        where si.servico_id = s.id
                          and upper(coalesce(si.nome_item, '')) like '%%PEDAG%%'
                     ),
                     0
                   )::float as valor_pedagio
              from servicos s
              left join motoristas m on m.id = s.motorista_id
              left join cadastro_viaturas v
                on upper(replace(replace(coalesce(v.placa, ''), '-', ''), ' ', ''))
                 = upper(replace(replace(coalesce(m.placa_atual, ''), '-', ''), ' ', ''))
              left join lateral (
                select coalesce(
                         nullif(trim(p.funcao), ''),
                         nullif(trim(p.nome_trabalho), ''),
                         '-'
                       ) as profissional_funcao
                  from cadastro_profissionais p
                 where p.motorista_id = s.motorista_id
                 order by p.created_at desc nulls last
                 limit 1
              ) pf on true
             where {where}
             order by coalesce(s.finalizado_em, s.created_at) desc nulls last
             limit 50000
        """
        rows = q(sql, tuple(params) if params else None, fetch=True) or []
        out = []
        for r in rows:
            item = dict(r)
            item["id"] = str(item.get("id"))
            if item.get("motorista_id"):
                item["motorista_id"] = str(item["motorista_id"])
            out.append(item)
        return out

    def montar_relatorio(tipo, filtros):
        meta = REL_FAT_TIPOS.get(tipo)
        if not meta:
            raise ValueError("Tipo de relatório inválido")
        sem_pedagio = filtros.get("sem_pedagio")
        servicos = buscar_servicos_rel_faturamento(filtros)
        grupos_map = defaultdict(lambda: {
            "grupo_id": "",
            "qtd": 0,
            "total": 0.0,
            "a_fechar": 0.0,
            "a_faturar": 0.0,
            "extra": {},
            "servicos_ids": [],
        })

        for s in servicos:
            gid, extra = _chave_grupo(s, tipo)
            g = grupos_map[gid]
            g["grupo_id"] = gid
            g["extra"].update(extra)
            valor, a_fechar, a_faturar = _valores_financeiros(s, sem_pedagio)
            g["qtd"] += 1
            g["total"] += valor
            g["a_fechar"] += a_fechar
            g["a_faturar"] += a_faturar
            g["servicos_ids"].append(s["id"])

        total_qtd = sum(g["qtd"] for g in grupos_map.values())
        total_valor = sum(g["total"] for g in grupos_map.values())
        total_a_fechar = sum(g["a_fechar"] for g in grupos_map.values())
        total_a_faturar = sum(g["a_faturar"] for g in grupos_map.values())

        linhas = []
        maior = None
        for g in grupos_map.values():
            qtd_pct = (g["qtd"] / total_qtd * 100) if total_qtd else 0
            val_pct = (g["total"] / total_valor * 100) if total_valor else 0
            row = {
                "grupo_id": g["grupo_id"],
                "qtd": g["qtd"],
                "qtd_pct": round(qtd_pct, 2),
                "qtd_pct_fmt": f"{qtd_pct:.1f}%".replace(".", ","),
                "total": round(g["total"], 2),
                "total_fmt": fmt_moeda(g["total"]),
                "valor_pct": round(val_pct, 2),
                "valor_pct_fmt": f"{val_pct:.1f}%".replace(".", ","),
                "a_fechar": round(g["a_fechar"], 2),
                "a_fechar_fmt": fmt_moeda(g["a_fechar"]),
                "a_faturar": round(g["a_faturar"], 2),
                "a_faturar_fmt": fmt_moeda(g["a_faturar"]),
                "servicos_ids": g["servicos_ids"],
                **g["extra"],
            }
            linhas.append(row)
            if maior is None or g["total"] > maior["total"]:
                label = (
                    row.get("cliente")
                    or row.get("viatura")
                    or row.get("profissional")
                    or row.get("tipo")
                    or g["grupo_id"]
                )
                maior = {"nome": label, "total": g["total"], "total_fmt": fmt_moeda(g["total"])}

        linhas.sort(key=lambda x: (-x["total"], -x["qtd"], x.get("grupo_id", "")))

        return {
            "ok": True,
            "tipo": tipo,
            "meta": meta,
            "filtros": filtros,
            "kpis": {
                "total_servicos": total_qtd,
                "valor_total": round(total_valor, 2),
                "valor_total_fmt": fmt_moeda(total_valor),
                "total_a_fechar": round(total_a_fechar, 2),
                "total_a_fechar_fmt": fmt_moeda(total_a_fechar),
                "total_a_faturar": round(total_a_faturar, 2),
                "total_a_faturar_fmt": fmt_moeda(total_a_faturar),
                "maior": maior or {"nome": "—", "total": 0, "total_fmt": fmt_moeda(0)},
            },
            "linhas": linhas,
            "total_grupos": len(linhas),
        }

    def normalizar_detalhe_servico(s, sem_pedagio):
        valor = _valor_servico(s, sem_pedagio)
        ped = float(s.get("valor_pedagio") or 0)
        dt = s.get("finalizado_em") or s.get("created_at")
        st_fat = s.get("status_faturamento") or "para_conferir"
        labels_fat = {
            "para_conferir": "Para conferir",
            "para_faturar": "Para faturar",
            "negociacao": "Negociação",
            "faturado": "Faturado",
        }
        return {
            "id": s.get("id"),
            "protocolo": s.get("protocolo") or "-",
            "data": formatar_data_hora_central(dt),
            "cliente": s.get("seguradora") or "-",
            "viatura": s.get("viatura_nome") or "-",
            "viatura_placa": s.get("viatura_placa") or "-",
            "profissional": s.get("motorista_nome") or "-",
            "funcao": s.get("profissional_funcao") or "-",
            "tipo": s.get("tipo") or "-",
            "origem": s.get("origem") or "-",
            "destino": s.get("destino") or "-",
            "valor": valor,
            "valor_fmt": fmt_moeda(valor),
            "pedagio": round(ped, 2),
            "pedagio_fmt": fmt_moeda(ped),
            "status_financeiro": labels_fat.get(st_fat, st_fat),
            "url": f"/faturamento/{s.get('id')}",
        }

    def detalhe_grupo(tipo, grupo_id, filtros):
        rel = montar_relatorio(tipo, filtros)
        alvo = None
        for ln in rel["linhas"]:
            if ln["grupo_id"] == grupo_id:
                alvo = ln
                break
        if not alvo:
            return None
        sem_pedagio = filtros.get("sem_pedagio")
        ids = set(alvo.get("servicos_ids") or [])
        servicos = buscar_servicos_rel_faturamento(filtros)
        itens = [
            normalizar_detalhe_servico(s, sem_pedagio)
            for s in servicos
            if s["id"] in ids
        ]
        grupo_pub = {k: v for k, v in alvo.items() if k != "servicos_ids"}
        return {"grupo": grupo_pub, "servicos": itens}

    def opcoes_filtros():
        clientes = set()
        rows = q(
            """
            select distinct trim(seguradora) as nome
              from servicos
             where coalesce(trim(seguradora), '') <> ''
             order by 1
             limit 500
            """,
            fetch=True,
        ) or []
        for r in rows:
            n = (r.get("nome") or "").strip()
            if n:
                clientes.add(n)
        profs = opcoes_profissionais_frota_abastecimento() or []
        viaturas = opcoes_viaturas_controle() or []
        return {
            "clientes": sorted(clientes, key=str.lower),
            "tipos": lista_tipos_servico(),
            "profissionais": profs,
            "viaturas": viaturas,
        }

    def ctx_relatorio(tipo, request):
        meta = REL_FAT_TIPOS.get(tipo)
        if not meta:
            return None
        return {
            "request": request,
            "tipo": tipo,
            "meta": meta,
            "nav_ativo": "relatorios",
            "nav_som": False,
            "opcoes": opcoes_filtros(),
        }

    @app.get("/relatorios/faturamento", response_class=HTMLResponse)
    def pagina_rel_faturamento_hub(request: Request):
        return templates.TemplateResponse(
            "relatorios/faturamento_hub.html",
            {
                "request": request,
                "tipos": REL_FAT_TIPOS,
                "nav_ativo": "relatorios",
                "nav_som": False,
            },
        )

    def _registrar_pagina_relatorio(tipo_slug):
        @app.get(f"/relatorios/faturamento/{tipo_slug}", response_class=HTMLResponse)
        def pagina_rel_faturamento_tipo(request: Request):
            ctx = ctx_relatorio(tipo_slug, request)
            if not ctx:
                return HTMLResponse("Relatório não encontrado", status_code=404)
            return templates.TemplateResponse("relatorios/faturamento_relatorio.html", ctx)

    for _slug in REL_FAT_TIPOS:
        _registrar_pagina_relatorio(_slug)

    @app.get("/api/relatorios/faturamento/opcoes")
    def api_rel_fat_opcoes():
        try:
            return {"ok": True, **opcoes_filtros()}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, status_code=500)

    @app.get("/api/relatorios/faturamento/{tipo}")
    def api_rel_faturamento(tipo: str, request: Request):
        if tipo not in REL_FAT_TIPOS:
            return JSONResponse({"ok": False, "erro": "Tipo inválido"}, status_code=404)
        filtros = _parse_filtros(dict(request.query_params))
        try:
            return montar_relatorio(tipo, filtros)
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, status_code=500)

    @app.get("/api/relatorios/faturamento/{tipo}/detalhe")
    def api_rel_faturamento_detalhe(tipo: str, request: Request, grupo: str = ""):
        if tipo not in REL_FAT_TIPOS:
            return JSONResponse({"ok": False, "erro": "Tipo inválido"}, status_code=404)
        grupo_id = (grupo or "").strip()
        if not grupo_id:
            return JSONResponse({"ok": False, "erro": "Grupo não informado"}, status_code=400)
        filtros = _parse_filtros(dict(request.query_params))
        try:
            data = detalhe_grupo(tipo, grupo_id, filtros)
            if not data:
                return JSONResponse({"ok": False, "erro": "Grupo não encontrado"}, status_code=404)
            return {"ok": True, **data}
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, status_code=500)

    @app.get("/api/relatorios/faturamento/{tipo}/exportar-excel")
    def api_rel_faturamento_excel(tipo: str, request: Request):
        if tipo not in REL_FAT_TIPOS:
            return JSONResponse({"ok": False, "erro": "Tipo inválido"}, status_code=404)
        filtros = _parse_filtros(dict(request.query_params))
        try:
            import pandas as pd

            rel = montar_relatorio(tipo, filtros)
            meta = rel["meta"]
            rows = []
            for ln in rel["linhas"]:
                row = {"Qtd": ln["qtd"], "Qtd %": ln["qtd_pct_fmt"], "Total R$": ln["total"]}
                row["Valor %"] = ln["valor_pct_fmt"]
                row["A fechar R$"] = ln["a_fechar"]
                row["A faturar R$"] = ln["a_faturar"]
                if tipo == "clientes":
                    row["Cliente/Empresa"] = ln.get("cliente")
                elif tipo == "viaturas":
                    row["Viatura"] = ln.get("viatura")
                    row["Placa"] = ln.get("placa")
                elif tipo == "profissionais":
                    row["Profissional"] = ln.get("profissional")
                    row["Função"] = ln.get("funcao")
                else:
                    row["Tipo de serviço"] = ln.get("tipo")
                rows.append(row)
            df = pd.DataFrame(rows)
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                df.to_excel(writer, index=False, sheet_name=meta["titulo"][:31])
            output.seek(0)
            nome = f"relatorio_faturamento_{tipo}.xlsx"
            return StreamingResponse(
                output,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{nome}"'},
            )
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, status_code=500)
