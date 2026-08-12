"""
Migração one-off: converte senhas em texto puro para bcrypt.

Percorre motoristas e usuarios_sistema; se a senha ainda não for hash
($2a$ / $2b$ / $2y$), reescreve como hash da senha atual.

Uso:
  python scripts/migrar_senhas_hash.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env", encoding="utf-8-sig")
load_dotenv(ROOT / ".env.local", encoding="utf-8-sig", override=True)

from auth_senha import e_hash_bcrypt, hash_senha, verificar_senha  # noqa: E402


def _resolve_database_url() -> str:
    explicit = (os.getenv("DATABASE_URL") or "").strip()
    if explicit:
        return explicit
    local = (os.getenv("LOCAL_DATABASE_URL") or "").strip()
    if local:
        return local
    file_url = ROOT / "data" / "local_database.url"
    if file_url.is_file():
        return file_url.read_text(encoding="utf-8-sig").strip()
    return "postgresql://postgres:postgres@localhost:5432/postgres"


def main():
    import psycopg2
    from psycopg2.extras import RealDictCursor

    url = _resolve_database_url()
    if not url:
        print("DATABASE_URL não configurada.")
        sys.exit(1)

    conn = psycopg2.connect(url)
    conn.autocommit = True
    total_ok = 0
    total_skip = 0
    total_err = 0

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for tabela in ("motoristas", "usuarios_sistema"):
                try:
                    cur.execute(f"select id, senha from {tabela}")
                    rows = cur.fetchall() or []
                except Exception as exc:
                    print(f"[{tabela}] ERRO ao listar: {exc}")
                    continue

                print(f"[{tabela}] {len(rows)} registro(s)")
                for row in rows:
                    rid = row.get("id")
                    senha = row.get("senha") or ""
                    if not senha or e_hash_bcrypt(senha):
                        total_skip += 1
                        continue
                    try:
                        novo = hash_senha(senha)
                        cur.execute(f"update {tabela} set senha=%s where id=%s", (novo, rid))
                        total_ok += 1
                        print(f"  OK id={rid}")
                    except Exception as exc:
                        total_err += 1
                        print(f"  ERRO id={rid}: {exc}")
    finally:
        conn.close()

    print(f"\nMigrados={total_ok} | Já hash/vazio={total_skip} | Erros={total_err}")
    amostra = hash_senha("teste123")
    assert e_hash_bcrypt(amostra)
    assert verificar_senha("teste123", amostra)
    assert not verificar_senha("errada", amostra)
    print("Smoke hash/verify: OK")


if __name__ == "__main__":
    main()
