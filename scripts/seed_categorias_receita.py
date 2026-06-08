"""
Cadastra/atualiza categorias de Receita faltantes (planilha Bling).
Uso: python scripts/seed_categorias_receita.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(dotenv_path=ROOT / ".env", encoding="utf-8-sig")

CATEGORIAS = [
    {
        "natureza": "Receita",
        "tipo_categoria": "Categoria Principal",
        "descricao": "OUTRAS ENTRADAS",
        "grupo_dre": "Não exibir DRE",
        "pai_descricao": None,
        "ordem": 71,
    },
    {
        "natureza": "Receita",
        "tipo_categoria": "Subcategoria",
        "descricao": "NÃO OPERACIONAIS",
        "grupo_dre": "Não exibir DRE",
        "pai_descricao": "OUTRAS ENTRADAS",
        "ordem": 72,
    },
    {
        "natureza": "Receita",
        "tipo_categoria": "Categoria Principal",
        "descricao": "RECEITA BRUTA",
        "grupo_dre": "Receita Operacional Bruta",
        "pai_descricao": None,
        "ordem": 73,
    },
    {
        "natureza": "Receita",
        "tipo_categoria": "Subcategoria",
        "descricao": "RECEITA COM SERVIÇOS",
        "grupo_dre": "Receita Operacional Bruta",
        "pai_descricao": "RECEITA BRUTA",
        "ordem": 74,
    },
]


def upsert_categoria(cur, ln, pai_id=None):
    cur.execute(
        """
        select id from financeiro_categorias
         where natureza = %s and tipo_categoria = %s and descricao = %s
        """,
        (ln["natureza"], ln["tipo_categoria"], ln["descricao"]),
    )
    row = cur.fetchone()
    if row:
        cur.execute(
            """
            update financeiro_categorias set
              grupo_dre = %s,
              categoria_pai_id = %s,
              ordem = %s,
              updated_at = now()
            where id = %s
            """,
            (ln["grupo_dre"], str(pai_id) if pai_id else None, ln["ordem"], str(row["id"])),
        )
        return str(row["id"]), "atualizada"
    cur.execute(
        """
        insert into financeiro_categorias (
          natureza, tipo_categoria, descricao, grupo_dre, categoria_pai_id, ordem, updated_at
        ) values (%s, %s, %s, %s, %s, %s, now())
        returning id
        """,
        (
            ln["natureza"],
            ln["tipo_categoria"],
            ln["descricao"],
            ln["grupo_dre"],
            str(pai_id) if pai_id else None,
            ln["ordem"],
        ),
    )
    return str(cur.fetchone()["id"]), "inserida"


def main():
    import app as main_app

    conn = main_app.get_conn()
    stats = {"inseridas": 0, "atualizadas": 0}
    try:
        with conn.cursor() as cur:
            pai_ids = {}
            for ln in CATEGORIAS:
                pai_id = None
                if ln.get("pai_descricao"):
                    pai_id = pai_ids.get(ln["pai_descricao"])
                    if not pai_id:
                        cur.execute(
                            """
                            select id from financeiro_categorias
                             where natureza = %s and tipo_categoria = 'Categoria Principal' and descricao = %s
                            """,
                            (ln["natureza"], ln["pai_descricao"]),
                        )
                        found = cur.fetchone()
                        if found:
                            pai_id = str(found["id"])
                cid, acao = upsert_categoria(cur, ln, pai_id)
                if ln["tipo_categoria"] == "Categoria Principal":
                    pai_ids[ln["descricao"]] = cid
                stats["inseridas" if acao == "inserida" else "atualizadas"] += 1
                print(f"  {acao}: {ln['descricao']} ({ln['grupo_dre']})")
        conn.commit()
    finally:
        conn.close()

    print("\n=== Seed receitas concluído ===")
    print(f"Inseridas: {stats['inseridas']}")
    print(f"Atualizadas: {stats['atualizadas']}")


if __name__ == "__main__":
    main()
