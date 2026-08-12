"""Utilitários de hash/verificação de senha (bcrypt via passlib)."""
from __future__ import annotations

from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def e_hash_bcrypt(valor: str | None) -> bool:
    v = valor or ""
    return v.startswith("$2b$") or v.startswith("$2a$") or v.startswith("$2y$")


def hash_senha(senha: str | None) -> str:
    return _pwd_context.hash(senha or "")


def verificar_senha(senha_plana: str | None, armazenada: str | None) -> bool:
    """Valida senha. Aceita hash bcrypt ou texto puro legado (pré-migração)."""
    plana = senha_plana or ""
    guardada = armazenada or ""
    if not guardada:
        return False
    if e_hash_bcrypt(guardada):
        try:
            return _pwd_context.verify(plana, guardada)
        except Exception:
            return False
    return plana == guardada
