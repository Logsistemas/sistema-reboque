"""
Importa categorias financeiras do Excel oficial (Bling).
Uso:
  python scripts/import_categorias_financeiras.py [caminho.xlsx]
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pandas as pd
from dotenv import load_dotenv

load_dotenv(dotenv_path=ROOT / ".env", encoding="utf-8-sig")

DEFAULT_XLSX = ROOT / "data" / "categorias-financeiras.xlsx"
FALLBACK_XLSX = Path(r"C:\Users\Ezequiel.Sousa\Dropbox\PC\Downloads\categorias-financeiras.xlsx")


def _col(df, *partes):
    for col in df.columns:
        nome = str(col).strip().lower()
        if all(p.lower() in nome for p in partes):
            return col
    return None


def _txt(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    return str(val).strip()


def _norm_tipo(val):
    t = _txt(val).lower()
    if "sub" in t:
        return "Subcategoria"
    if "principal" in t:
        return "Categoria Principal"
    return _txt(val)


def ler_linhas_excel(path):
    df = pd.read_excel(path, sheet_name=0, dtype=str)
    col_natureza = _col(df, "natureza")
    col_tipo = _col(df, "tipo", "categoria")
    col_desc = _col(df, "descri", "categoria")
    col_dre = _col(df, "grupo", "dre") or _col(df, "dre")
    if not col_desc:
        raise ValueError("Coluna 'Descrição da categoria' não encontrada no Excel.")
    if not col_tipo:
        raise ValueError("Coluna 'Tipo de categoria' não encontrada no Excel.")
    if not col_dre:
        raise ValueError("Coluna 'Como será exibida no DRE' / 'Grupo DRE' não encontrada no Excel.")

    linhas = []
    for idx, row in df.iterrows():
        descricao = _txt(row.get(col_desc))
        if not descricao:
            continue
        linhas.append(
            {
                "ordem": int(idx) + 1,
                "natureza": _txt(row.get(col_natureza)) if col_natureza else "",
                "tipo_categoria": _norm_tipo(row.get(col_tipo)),
                "descricao": descricao,
                "grupo_dre": _txt(row.get(col_dre)),
            }
        )
    return linhas


def init_tabela(cur):
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


def importar(linhas, conn):
    stats = {
        "importadas": 0,
        "principais": 0,
        "subcategorias": 0,
        "duplicadas": 0,
        "ignoradas_sem_descricao": 0,
    }
    pai_atual = None

    with conn.cursor() as cur:
        init_tabela(cur)
        for ln in linhas:
            if not ln["descricao"]:
                stats["ignoradas_sem_descricao"] += 1
                continue

            cur.execute(
                """
                select id from financeiro_categorias
                 where natureza = %s and tipo_categoria = %s and descricao = %s
                """,
                (ln["natureza"], ln["tipo_categoria"], ln["descricao"]),
            )
            existing = cur.fetchone()
            pai_id = pai_atual if ln["tipo_categoria"] == "Subcategoria" else None

            if existing:
                stats["duplicadas"] += 1
                cur.execute(
                    """
                    update financeiro_categorias set
                      grupo_dre = %s,
                      categoria_pai_id = %s,
                      ordem = %s,
                      updated_at = now()
                    where id = %s
                    """,
                    (ln["grupo_dre"], str(pai_id) if pai_id else None, ln["ordem"], str(existing["id"])),
                )
                if ln["tipo_categoria"] == "Categoria Principal":
                    pai_atual = existing["id"]
                continue

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
            row = cur.fetchone()
            stats["importadas"] += 1
            if ln["tipo_categoria"] == "Categoria Principal":
                stats["principais"] += 1
                pai_atual = row["id"]
            else:
                stats["subcategorias"] += 1

    conn.commit()
    return stats


def main():
    import app as main_app

    arg = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if arg and arg.exists():
        xlsx = arg
    elif DEFAULT_XLSX.exists():
        xlsx = DEFAULT_XLSX
    elif FALLBACK_XLSX.exists():
        xlsx = FALLBACK_XLSX
    else:
        print("Arquivo categorias-financeiras.xlsx não encontrado.")
        print(f"Coloque em: {DEFAULT_XLSX}")
        sys.exit(1)

    linhas = ler_linhas_excel(xlsx)
    print(f"Lendo: {xlsx}")
    print(f"Linhas válidas no Excel: {len(linhas)}")

    conn = main_app.get_conn()
    try:
        stats = importar(linhas, conn)
    finally:
        conn.close()

    print("\n=== Importação concluída ===")
    print(f"Categorias importadas: {stats['importadas']}")
    print(f"Categorias principais: {stats['principais']}")
    print(f"Subcategorias: {stats['subcategorias']}")
    print(f"Duplicadas (atualizadas): {stats['duplicadas']}")
    if stats["ignoradas_sem_descricao"]:
        print(f"Linhas sem descrição ignoradas: {stats['ignoradas_sem_descricao']}")


if __name__ == "__main__":
    main()
