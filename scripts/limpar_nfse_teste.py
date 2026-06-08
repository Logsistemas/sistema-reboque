"""Remove notas de teste canceladas PENDCR01 e PENDCR02 (mantém RPS 1)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as m

RPS_MANTER = "1"
RPS_REMOVER = ("PENDCR01", "PENDCR02")

m.init_db()

# Estado antes
todas = m.q(
    "select id, numero_rps, situacao, vinculacao_cr, cliente_nome from financeiro_notas_servico order by numero_rps",
    fetch=True,
)
print("Antes:", len(todas), "nota(s)")
for n in todas:
    print(" ", n["numero_rps"], n["situacao"], str(n["id"]))

manter = m.one(
    "select id, numero_rps, situacao, vinculacao_cr from financeiro_notas_servico where numero_rps=%s",
    (RPS_MANTER,),
)
if not manter:
    raise SystemExit(f"ERRO: nota RPS {RPS_MANTER} não encontrada — abortando.")
manter_id = str(manter["id"])
cr_ativos_antes = m.one(
    """
    select count(*)::int as c from financeiro_contas_receber r
     where r.nota_servico_id = %s and coalesce(r.status,'') <> 'cancelado'
    """,
    (manter_id,),
)["c"]
print(f"\nNota a manter: RPS {RPS_MANTER} | id={manter_id} | CR ativos={cr_ativos_antes}")

removidas = []
for rps in RPS_REMOVER:
    row = m.one(
        "select id, situacao, vinculacao_cr from financeiro_notas_servico where numero_rps=%s",
        (rps,),
    )
    if not row:
        print(f"  {rps}: já ausente")
        continue
    if row["situacao"] != "cancelada":
        print(f"  {rps}: ignorada (situação={row['situacao']}, não cancelada)")
        continue
    if row["vinculacao_cr"] == "lancado_contas_receber":
        print(f"  {rps}: ignorada (tem CR ativo — estorne antes)")
        continue
    nid = str(row["id"])
    # Não apagar contas a receber — só vínculos/parcelas caem em cascade com a nota
    vincs = m.q(
        "select conta_receber_id, estornado_at from financeiro_notas_servico_cr_vinculos where nota_id=%s",
        (nid,),
        fetch=True,
    )
    for v in vincs or []:
        if v.get("estornado_at") is None and v.get("conta_receber_id"):
            cr = m.one("select id, status from financeiro_contas_receber where id=%s", (str(v["conta_receber_id"]),))
            if cr and (cr.get("status") or "") not in ("cancelado",):
                raise SystemExit(
                    f"ERRO: {rps} possui vínculo CR ativo {v['conta_receber_id']} — abortando."
                )
    m.q("delete from financeiro_notas_servico where id=%s", (nid,))
    removidas.append(rps)
    print(f"  {rps}: removida (id={nid})")

# Estado depois
restantes = m.q(
    "select id, numero_rps, situacao, vinculacao_cr, cliente_nome, total_nota from financeiro_notas_servico order by numero_rps",
    fetch=True,
)
print(f"\nDepois: {len(restantes)} nota(s)")
for n in restantes:
    print(" ", dict(n))

manter_depois = m.one("select id from financeiro_notas_servico where numero_rps=%s", (RPS_MANTER,))
if not manter_depois or str(manter_depois["id"]) != manter_id:
    raise SystemExit("ERRO: nota RPS 1 foi alterada ou removida.")

cr_ativos_depois = m.one(
    """
    select count(*)::int as c from financeiro_contas_receber r
     where r.nota_servico_id = %s and coalesce(r.status,'') <> 'cancelado'
    """,
    (manter_id,),
)["c"]
if cr_ativos_depois != cr_ativos_antes:
    raise SystemExit(f"ERRO: CR da nota RPS 1 mudou ({cr_ativos_antes} -> {cr_ativos_depois}).")

print(f"\nOK: removidas {removidas}. RPS 1 intacta com {cr_ativos_depois} título(s) CR.")
