# ... (mantive tudo igual até a parte das queries)

def lista_servicos(limit=None, ativos=False, filtros=None):
    filtros=filtros or {}; where=[]; params=[]
    if ativos: where.append("status not in ('finalizado','recusado')")

    for key,col,op in [
        ("data_ini","date(created_at)",">="),
        ("data_fim","date(created_at)","<=")
    ]:
        if filtros.get(key):
            where.append(f"{col} {op} %s")
            params.append(filtros[key])

    for key,col in [
        ("seguradora","seguradora"),
        ("tipo","tipo"),
        ("motorista","coalesce(motorista_nome,'')")
    ]:
        if filtros.get(key):
            where.append(f"{col} ilike %s")
            params.append(f"%{filtros[key]}%")

    if filtros.get("status"):
        where.append("status=%s")
        params.append(filtros["status"])

    sql = "select * from servicos"
    if where:
        sql += " where " + " and ".join(where)

    # ✅ CORRIGIDO AQUI
    sql += " order by created_at desc"

    if limit:
        sql += f" limit {int(limit)}"

    return [normalizar_servico(r) for r in q(sql, tuple(params), True)]


# ----------------------------
# MOTORISTA SERVIÇOS
# ----------------------------

@app.get('/api/motorista/{mid}/servicos')
def api_servicos_motorista(mid: str):
    return [
        normalizar_servico(r)
        for r in q(
            "select * from servicos where motorista_id=%s and status not in ('finalizado','recusado') order by created_at desc",
            (str(mid),),
            True
        )
    ]