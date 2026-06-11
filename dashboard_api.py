"""Dashboards Essência — operacional (/) e gerencial (/relatorios/dashboard-gerencial)."""
import os
import time
from calendar import monthrange
from datetime import date, datetime

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse

_CACHE = {}
_CACHE_TTL_OPERACIONAL = 45
_CACHE_TTL_GERENCIAL = 60
_CACHE_TTL_MAPA = 15


def _cache_get(key, ttl, builder):
    now = time.time()
    entry = _CACHE.get(key)
    if entry and (now - entry["ts"]) < ttl:
        return entry["data"]
    data = builder()
    _CACHE[key] = {"ts": now, "data": data}
    return data


def register(app, templates):
    import app as main

    q = main.q
    one = main.one
    fmt_moeda = main.fmt_moeda
    fmt_minutos = main.fmt_minutos_dashboard
    _dash_sql_ts = main._dash_sql_ts
    _dash_sql_date = main._dash_sql_date
    _dash_where_servico_hoje = main._dash_where_servico_hoje
    motoristas_mapa_dashboard_enriquecido = main.motoristas_mapa_dashboard_enriquecido

    def _mes_ref_sql(alias="s"):
        ts = _dash_sql_ts(f"coalesce({alias}.finalizado_em, {alias}.created_at)")
        return f"""
          lower(coalesce({alias}.status, '')) = 'finalizado'
          and {ts} is not null
          and date_trunc('month', {ts}) = date_trunc('month', now())
        """

    def _meta_mensal(receita_mes_atual):
        env_meta = os.getenv("DASH_META_MENSAL", "").strip()
        if env_meta:
            try:
                return float(env_meta.replace(",", "."))
            except ValueError:
                pass
        ts = _dash_sql_ts("coalesce(finalizado_em, created_at)")
        row = one(
            f"""
            select coalesce(sum(valor_total), 0)::float as total
              from servicos
             where lower(coalesce(status, '')) = 'finalizado'
               and {ts} is not null
               and date_trunc('month', {ts}) = date_trunc('month', now() - interval '1 month')
            """
        ) or {}
        prev = float(row.get("total") or 0)
        if prev > 0:
            return round(max(prev * 1.05, receita_mes_atual * 1.02), 2)
        if receita_mes_atual > 0:
            return round(receita_mes_atual * 1.15, 2)
        return 500000.0

    def _calc_previsao(receita_mes, faturado_hoje=0.0):
        hoje = date.today()
        dia = hoje.day
        dias_mes = monthrange(hoje.year, hoje.month)[1]
        dias_restantes = max(0, dias_mes - dia)
        media_diaria = receita_mes / dia if dia > 0 else 0.0
        meta = _meta_mensal(receita_mes)
        projecao = receita_mes + (media_diaria * dias_restantes)
        progresso = min(100.0, (receita_mes / meta * 100) if meta > 0 else 0.0)
        return {
            "faturado_hoje": round(faturado_hoje, 2),
            "faturado_hoje_fmt": fmt_moeda(faturado_hoje),
            "faturado_mes": round(receita_mes, 2),
            "faturado_mes_fmt": fmt_moeda(receita_mes),
            "faturado": round(receita_mes, 2),
            "faturado_fmt": fmt_moeda(receita_mes),
            "dias_decorridos": dia,
            "dias_restantes": dias_restantes,
            "dias_mes": dias_mes,
            "media_diaria": round(media_diaria, 2),
            "media_diaria_fmt": fmt_moeda(media_diaria),
            "projecao": round(projecao, 2),
            "projecao_fmt": fmt_moeda(projecao),
            "meta": round(meta, 2),
            "meta_fmt": fmt_moeda(meta),
            "progresso_pct": round(progresso, 1),
        }

    def _metricas_tmc_tme():
        fallback = {
            "tmc_dia": "0 min",
            "melhor_tmc_dia": "0 min",
            "melhor_tmc_nome": "—",
            "tmc_mes": "0 min",
            "tme_mes": "0 min",
        }
        try:
            ts_c = _dash_sql_ts("created_at")
            ts_f = _dash_sql_ts("finalizado_em")
            ts_a = _dash_sql_ts("atualizado_em")
            tmc_dia_row = one(
                f"""
                select coalesce(avg(extract(epoch from ({ts_f} - {ts_c})) / 60.0), 0)::float as v
                  from servicos
                 where lower(coalesce(status,'')) = 'finalizado'
                   and {ts_f} is not null and {ts_c} is not null
                   and {_dash_sql_date('finalizado_em')} = current_date
                """
            ) or {}
            tmc_mes_row = one(
                f"""
                select coalesce(avg(extract(epoch from ({ts_f} - {ts_c})) / 60.0), 0)::float as v
                  from servicos
                 where lower(coalesce(status,'')) = 'finalizado'
                   and {ts_f} is not null and {ts_c} is not null
                   and date_trunc('month', {ts_f}) = date_trunc('month', now())
                """
            ) or {}
            tme_mes_row = one(
                f"""
                select coalesce(avg(extract(epoch from ({ts_a} - {ts_c})) / 60.0), 0)::float as v
                  from servicos
                 where lower(coalesce(status,'')) in ('na origem','em transporte','finalizado')
                   and {ts_a} is not null and {ts_c} is not null
                   and date_trunc('month', {ts_c}) = date_trunc('month', now())
                """
            ) or {}
            melhor_row = one(
                f"""
                select coalesce(m.nome, s.motorista_nome, '—') as nome,
                       avg(extract(epoch from ({_dash_sql_ts('s.finalizado_em')} - {_dash_sql_ts('s.created_at')})) / 60.0)::float as mins
                  from servicos s
                  left join motoristas m on m.id = s.motorista_id
                 where lower(coalesce(s.status,'')) = 'finalizado'
                   and {_dash_sql_ts('s.finalizado_em')} is not null
                   and {_dash_sql_ts('s.created_at')} is not null
                   and {_dash_sql_date('s.finalizado_em')} = current_date
                   and s.motorista_id is not null
                 group by 1
                 order by mins asc nulls last
                 limit 1
                """
            ) or {}
            tmc_dia = float(tmc_dia_row.get("v") or 0)
            tmc_mes = float(tmc_mes_row.get("v") or 0)
            tme_mes = float(tme_mes_row.get("v") or 0)
            melhor = float(melhor_row.get("mins") or 0)
            return {
                "tmc_dia": fmt_minutos(tmc_dia),
                "melhor_tmc_dia": fmt_minutos(melhor),
                "melhor_tmc_nome": melhor_row.get("nome") or "—",
                "tmc_mes": fmt_minutos(tmc_mes),
                "tme_mes": fmt_minutos(tme_mes),
            }
        except Exception as exc:
            print(f"[dashboard] TMC/TME ignorado: {exc}")
            return fallback

    def _motoristas_mapa_safe():
        try:
            return motoristas_mapa_dashboard_enriquecido() or []
        except Exception as exc:
            print(f"[dashboard] mapa ignorado: {exc}")
            return []

    def payload_operacional():
        mes_where = _mes_ref_sql("s")
        ts_f = _dash_sql_ts("coalesce(s.finalizado_em, s.created_at)")
        ts_f_hoje = _dash_sql_ts("s.finalizado_em")
        row = one(
            f"""
            select
              count(*)::int as total_cadastrados,
              count(*) filter (where lower(coalesce(s.status,'')) = 'finalizado')::int as concluidos,
              count(*) filter (
                where lower(coalesce(s.status,'')) not in ('finalizado','recusado','cancelado')
              )::int as em_andamento,
              count(*) filter (where {mes_where})::int as servicos_mes,
              count(*) filter (
                where lower(coalesce(s.status,'')) = 'cancelado'
                  and {_dash_where_servico_hoje('s.')}
              )::int as cancelados_hoje,
              count(*) filter (
                where lower(coalesce(s.status,'')) = 'recusado'
                  and date_trunc('month', {ts_f}) = date_trunc('month', now())
              )::int as recusados_mes,
              coalesce(sum(s.valor_total) filter (where {mes_where}), 0)::float as receita_mes,
              coalesce(
                sum(s.valor_total) filter (
                  where lower(coalesce(s.status,'')) = 'finalizado'
                    and {_dash_sql_date('s.finalizado_em')} = current_date
                ),
                0
              )::float as faturado_hoje
            from servicos s
            """
        ) or {}

        receita = float(row.get("receita_mes") or 0)
        faturado_hoje = float(row.get("faturado_hoje") or 0)
        tmc = _metricas_tmc_tme()

        return {
            "ok": True,
            "data_ref": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            "kpis": {
                "total_cadastrados": int(row.get("total_cadastrados") or 0),
                "concluidos": int(row.get("concluidos") or 0),
                "em_andamento": int(row.get("em_andamento") or 0),
                "servicos_mes": int(row.get("servicos_mes") or 0),
                "cancelados_hoje": int(row.get("cancelados_hoje") or 0),
                "recusados_mes": int(row.get("recusados_mes") or 0),
                "receita_mes_fmt": fmt_moeda(receita),
                "km_hoje": 0,
                **tmc,
            },
            "previsao": _calc_previsao(receita, faturado_hoje),
            "motoristas_mapa": _motoristas_mapa_safe(),
        }

    def _kpis_gerenciais():
        mes_where = _mes_ref_sql("s")
        row = one(
            f"""
            select
              count(*) filter (where {mes_where})::int as finalizados_mes,
              coalesce(sum(s.valor_total) filter (where {mes_where}), 0)::float as receita_mes,
              coalesce(
                sum(s.valor_total) filter (
                  where lower(coalesce(s.status,'')) = 'finalizado'
                    and coalesce(s.status_faturamento, 'para_conferir') in (
                      'para_conferir', 'negociacao', 'para_faturar'
                    )
                ),
                0
              )::float as valor_pendente,
              count(*) filter (
                where lower(coalesce(s.status,'')) = 'finalizado'
                  and coalesce(s.status_faturamento, 'para_conferir') in (
                    'para_conferir', 'negociacao', 'para_faturar'
                  )
              )::int as qtd_pendente
            from servicos s
            """
        ) or {}
        hoje = date.today()
        dia = hoje.day
        receita = float(row.get("receita_mes") or 0)
        fin_mes = int(row.get("finalizados_mes") or 0)
        media_diaria = receita / dia if dia > 0 else 0.0
        serv_dia = fin_mes / dia if dia > 0 else 0.0
        ticket = receita / fin_mes if fin_mes > 0 else 0.0
        return {
            "ticket_medio_fmt": fmt_moeda(ticket),
            "receita_diaria_media_fmt": fmt_moeda(media_diaria),
            "servicos_por_dia": round(serv_dia, 1),
            "valor_pendente_faturamento_fmt": fmt_moeda(float(row.get("valor_pendente") or 0)),
            "qtd_pendente_faturamento": int(row.get("qtd_pendente") or 0),
        }

    def _top_clientes(limit=5):
        mes_where = _mes_ref_sql("s")
        rows = q(
            f"""
            select coalesce(nullif(trim(s.seguradora), ''), 'Sem cliente') as nome,
                   count(*)::int as qtd,
                   coalesce(sum(s.valor_total), 0)::float as receita
              from servicos s
             where {mes_where}
             group by 1
             order by receita desc, qtd desc
             limit {int(limit)}
            """,
            fetch=True,
        ) or []
        return [
            {
                "nome": r.get("nome"),
                "qtd": int(r.get("qtd") or 0),
                "receita": round(float(r.get("receita") or 0), 2),
                "receita_fmt": fmt_moeda(float(r.get("receita") or 0)),
            }
            for r in rows
        ]

    def _top_viaturas():
        mes_where = _mes_ref_sql("s")
        rows = q(
            f"""
            select coalesce(
                     nullif(trim(v.exibicao), ''),
                     nullif(trim(v.modelo), ''),
                     nullif(trim(m.placa_atual), ''),
                     'Sem viatura'
                   ) as nome,
                   coalesce(nullif(trim(v.placa), ''), nullif(trim(m.placa_atual), ''), '-') as placa,
                   count(*)::int as qtd,
                   coalesce(sum(s.valor_total), 0)::float as receita
              from servicos s
              left join motoristas m on m.id = s.motorista_id
              left join cadastro_viaturas v
                on upper(replace(replace(coalesce(v.placa, ''), '-', ''), ' ', ''))
                 = upper(replace(replace(coalesce(m.placa_atual, ''), '-', ''), ' ', ''))
             where {mes_where}
             group by 1, 2
             order by receita desc, qtd desc
             limit 5
            """,
            fetch=True,
        ) or []
        return [
            {
                "nome": r.get("nome"),
                "placa": r.get("placa"),
                "qtd": int(r.get("qtd") or 0),
                "receita": round(float(r.get("receita") or 0), 2),
                "receita_fmt": fmt_moeda(float(r.get("receita") or 0)),
            }
            for r in rows
        ]

    def _top_profissionais():
        mes_where = _mes_ref_sql("s")
        rows = q(
            f"""
            select coalesce(
                     nullif(trim(p.nome_trabalho), ''),
                     nullif(trim(s.motorista_nome), ''),
                     'Sem profissional'
                   ) as nome,
                   count(*)::int as qtd,
                   coalesce(sum(s.valor_total), 0)::float as receita
              from servicos s
              left join lateral (
                select nome_trabalho
                  from cadastro_profissionais cp
                 where cp.motorista_id = s.motorista_id
                 order by cp.created_at desc nulls last
                 limit 1
              ) p on true
             where {mes_where}
             group by 1
             order by receita desc, qtd desc
             limit 5
            """,
            fetch=True,
        ) or []
        return [
            {
                "nome": r.get("nome"),
                "qtd": int(r.get("qtd") or 0),
                "receita": round(float(r.get("receita") or 0), 2),
                "receita_fmt": fmt_moeda(float(r.get("receita") or 0)),
            }
            for r in rows
        ]

    def _serie_30_dias():
        ts = _dash_sql_ts("coalesce(finalizado_em, created_at)")
        rows = q(
            f"""
            select ({ts})::date as dia,
                   count(*)::int as servicos,
                   coalesce(sum(valor_total), 0)::float as receita
              from servicos
             where lower(coalesce(status, '')) = 'finalizado'
               and {ts} is not null
               and ({ts})::date >= current_date - interval '29 days'
             group by 1
             order by 1
            """,
            fetch=True,
        ) or []
        mapa = {}
        for r in rows:
            d = r.get("dia")
            key = d.isoformat() if hasattr(d, "isoformat") else str(d)[:10]
            mapa[key] = {
                "servicos": int(r.get("servicos") or 0),
                "receita": round(float(r.get("receita") or 0), 2),
            }
        labels, servicos, receitas = [], [], []
        hoje = date.today()
        for i in range(29, -1, -1):
            d = hoje.fromordinal(hoje.toordinal() - i)
            key = d.isoformat()
            labels.append(d.strftime("%d/%m"))
            item = mapa.get(key, {"servicos": 0, "receita": 0.0})
            servicos.append(item["servicos"])
            receitas.append(item["receita"])
        return {"labels": labels, "servicos": servicos, "receitas": receitas}

    def _evolucao_mensal():
        ts = _dash_sql_ts("coalesce(finalizado_em, created_at)")
        rows = q(
            f"""
            select to_char(date_trunc('month', {ts}), 'YYYY-MM') as mes,
                   to_char(date_trunc('month', {ts}), 'MM/YY') as mes_label,
                   count(*)::int as servicos,
                   coalesce(sum(valor_total), 0)::float as receita
              from servicos
             where lower(coalesce(status, '')) = 'finalizado'
               and {ts} is not null
               and {ts} >= date_trunc('month', now()) - interval '5 months'
             group by 1, 2
             order by 1
            """,
            fetch=True,
        ) or []
        return {
            "labels": [r.get("mes_label") or r.get("mes") for r in rows],
            "servicos": [int(r.get("servicos") or 0) for r in rows],
            "receitas": [round(float(r.get("receita") or 0), 2) for r in rows],
        }

    def payload_gerencial():
        tops = _top_clientes(8)
        return {
            "ok": True,
            "data_ref": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            "kpis": _kpis_gerenciais(),
            "top_clientes": tops[:5],
            "top_viaturas": _top_viaturas(),
            "top_profissionais": _top_profissionais(),
            "graficos": {
                **_serie_30_dias(),
                "evolucao_mensal": _evolucao_mensal(),
                "faturamento_cliente": {
                    "labels": [t["nome"] for t in tops],
                    "receitas": [t["receita"] for t in tops],
                },
            },
        }

    @app.get("/", response_class=HTMLResponse)
    def pagina_dashboard_operacional(request: Request):
        return templates.TemplateResponse(
            "dashboard.html",
            {"request": request, "nav_ativo": "dashboard", "nav_som": False},
        )

    @app.get("/relatorios/dashboard-gerencial", response_class=HTMLResponse)
    def pagina_dashboard_gerencial(request: Request):
        return templates.TemplateResponse(
            "relatorios/dashboard_gerencial.html",
            {"request": request, "nav_ativo": "relatorios", "nav_som": False},
        )

    @app.get("/api/dashboard/operacional")
    def api_dashboard_operacional():
        try:
            return _cache_get("operacional", _CACHE_TTL_OPERACIONAL, payload_operacional)
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, status_code=500)

    @app.get("/api/dashboard/gerencial")
    def api_dashboard_gerencial():
        try:
            return _cache_get("gerencial", _CACHE_TTL_GERENCIAL, payload_gerencial)
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, status_code=500)

    @app.get("/api/dashboard/mapa")
    def api_dashboard_mapa():
        try:
            return _cache_get(
                "mapa",
                _CACHE_TTL_MAPA,
                lambda: {
                    "ok": True,
                    "data_ref": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
                    "motoristas_mapa": motoristas_mapa_dashboard_enriquecido(),
                },
            )
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, status_code=500)

    @app.get("/api/dashboard/live")
    def api_dashboard_live_compat():
        try:
            op = _cache_get("operacional", _CACHE_TTL_OPERACIONAL, payload_operacional)
            mp = _cache_get(
                "mapa",
                _CACHE_TTL_MAPA,
                lambda: {"motoristas_mapa": motoristas_mapa_dashboard_enriquecido()},
            )
            op["motoristas_mapa"] = mp.get("motoristas_mapa") or []
            return op
        except Exception as exc:
            return JSONResponse({"ok": False, "erro": str(exc)}, status_code=500)
