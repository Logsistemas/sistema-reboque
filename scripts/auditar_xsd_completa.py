#!/usr/bin/env python3
"""Auditoria XSD completa DPS NFS-e Nacional v1.01."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main() -> int:
    from nfse_nacional.xsd_audit import auditar_xsd_completa

    try:
        resultado = auditar_xsd_completa()
    except FileNotFoundError as exc:
        raise SystemExit(str(exc)) from exc

    sys.stdout.buffer.write((resultado["texto"] + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.write(
        f"\nJSON: {resultado['relatorio_json']}\n".encode("utf-8")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
