"""Utilitários de hash/verificação de senha (bcrypt via passlib)."""
from __future__ import annotations

import bcrypt as _bcrypt

# Compat: bcrypt>=4.0 removeu o submódulo bcrypt.__about__, que o
# passlib==1.7.4 usa para detectar a versão instalada do backend.
# Sem isso o passlib falha ao carregar o backend bcrypt e toda
# verificação de senha quebra silenciosamente (verificar_senha abaixo
# captura a exceção e devolve False sempre — login "inválido" mesmo
# com a senha certa). Este shim recria o atributo que o passlib espera.
if not hasattr(_bcrypt, "__about__"):
    class _BcryptAbout:
        __version__ = getattr(_bcrypt, "__version__", "4.0.1")

    _bcrypt.__about__ = _BcryptAbout()

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
