"""Utilitários de hash/verificação de senha (bcrypt direto, sem passlib).

Antes usava passlib[bcrypt]==1.7.4, que é incompatível com bcrypt>=4.0
(passlib nunca recebeu correção pra isso) e fazia toda verificação de
senha falhar silenciosamente. Chamando a biblioteca bcrypt direto
evitamos essa camada quebrada.
"""
from __future__ import annotations

import bcrypt


def e_hash_bcrypt(valor: str | None) -> bool:
    v = valor or ""
    return v.startswith("$2b$") or v.startswith("$2a$") or v.startswith("$2y$")


def hash_senha(senha: str | None) -> str:
    dados = (senha or "").encode("utf-8")
    return bcrypt.hashpw(dados, bcrypt.gensalt()).decode("utf-8")


def verificar_senha(senha_plana: str | None, armazenada: str | None) -> bool:
    """Valida senha. Aceita hash bcrypt ou texto puro legado (pré-migração)."""
    plana = senha_plana or ""
    guardada = armazenada or ""
    if not guardada:
        return False
    if e_hash_bcrypt(guardada):
        try:
            return bcrypt.checkpw(plana.encode("utf-8"), guardada.encode("utf-8"))
        except Exception:
            return False
    return plana == guardada
