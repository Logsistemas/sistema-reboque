"""
Importa/atualiza viaturas a partir de planilha Excel (VIATURAS.xlsx).

Uso:
  python scripts/importar_viaturas_excel.py "VIATURAS.xlsx"
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pandas as pd
from dotenv import load_dotenv

load_dotenv(dotenv_path=ROOT / ".env", encoding="utf-8-sig")

DEFAULT_XLSX = Path(r"C:\Users\Ezequiel.Sousa\Dropbox\PC\Desktop\VIATURAS.xlsx")


def _col(df, *partes):
    for col in df.columns:
        nome = str(col).strip().lower()
        norm = (
            nome.replace("ç", "c")
            .replace("ã", "a")
            .replace("õ", "o")
            .replace("é", "e")
            .replace("á", "a")
            .replace("í", "i")
            .replace("ó", "o")
            .replace("ú", "u")
        )
        if all(p.lower() in norm for p in partes):
            return col
    return None


def _txt(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    return "" if s.lower() == "nan" else s


def ler_planilha(path: Path):
    df = pd.read_excel(path, sheet_name=0, dtype=str)
    cols = {
        "exibicao": _col(df, "exibi"),
        "classificacao": _col(df, "classifica"),
        "marca": _col(df, "marca"),
        "modelo": _col(df, "modelo"),
        "placa": _col(df, "placa"),
        "personalizacao": _col(df, "personaliza"),
        "chassi": _col(df, "chassi"),
        "renavam": _col(df, "renavam"),
        "ano_fabricacao": _col(df, "ano", "fabrica"),
        "ano_modelo": _col(df, "ano", "modelo"),
    }
    if not cols["exibicao"]:
        raise ValueError("Coluna 'Exibição' não encontrada na planilha.")
    if not cols["placa"]:
        raise ValueError("Coluna 'Placa' não encontrada na planilha.")
    linhas = []
    for idx, row in df.iterrows():
        exibicao = _txt(row.get(cols["exibicao"]))
        placa_raw = _txt(row.get(cols["placa"]))
        if not exibicao and not placa_raw:
            continue
        if not exibicao:
            raise ValueError(f"Linha {int(idx) + 2}: Exibição obrigatória (placa {placa_raw}).")
        linhas.append(
            {
                "linha": int(idx) + 2,
                "exibicao": exibicao,
                "classificacao_original": _txt(row.get(cols["classificacao"])) if cols["classificacao"] else "",
                "marca": _txt(row.get(cols["marca"])) if cols["marca"] else "",
                "modelo": _txt(row.get(cols["modelo"])) if cols["modelo"] else "",
                "placa": placa_raw,
                "personalizacao": _txt(row.get(cols["personalizacao"])) if cols["personalizacao"] else "",
                "chassi": _txt(row.get(cols["chassi"])) if cols["chassi"] else "",
                "renavam": _txt(row.get(cols["renavam"])) if cols["renavam"] else "",
                "ano_fabricacao": _txt(row.get(cols["ano_fabricacao"])) if cols["ano_fabricacao"] else "",
                "ano_modelo": _txt(row.get(cols["ano_modelo"])) if cols["ano_modelo"] else "",
            }
        )
    return linhas


def backup_viaturas():
    import app as main_app

    rows = main_app.q("select * from cadastro_viaturas order by placa asc", fetch=True) or []
    backup_dir = ROOT / "data" / "backup"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = backup_dir / f"viaturas_backup_{ts}.json"
    serial = []
    for r in rows:
        item = dict(r)
        for k, v in item.items():
            if hasattr(v, "isoformat"):
                item[k] = v.isoformat()
            elif v is not None and not isinstance(v, (str, int, float, bool)):
                item[k] = str(v)
        serial.append(item)
    path.write_text(json.dumps(serial, ensure_ascii=False, indent=2), encoding="utf-8")
    return path, len(serial)


def importar(linhas):
    import app as main_app

    stats = {
        "total_lidas": len(linhas),
        "cadastradas": 0,
        "atualizadas": 0,
        "ignoradas": 0,
        "erros": [],
        "placas_duplicadas_planilha": [],
    }
    placas_vistas = {}

    for ln in linhas:
        placa_n = main_app.normalizar_placa_viatura(ln.get("placa"))
        if not placa_n:
            stats["ignoradas"] += 1
            stats["erros"].append(f"Linha {ln['linha']}: placa vazia/inválida ({ln.get('placa')})")
            continue
        if placa_n in placas_vistas:
            stats["placas_duplicadas_planilha"].append(
                {"placa": placa_n, "linha": ln["linha"], "primeira_linha": placas_vistas[placa_n]}
            )
        placas_vistas[placa_n] = ln["linha"]

        mapped = main_app.mapear_origem_viatura(ln.get("classificacao_original"))
        payload = {
            "exibicao": ln["exibicao"],
            "nome_exibicao": ln["exibicao"],
            "classificacao_original": mapped["classificacao_original"],
            "origem": mapped["origem"],
            "terceiro": mapped["terceiro"],
            "marca": ln.get("marca"),
            "modelo": ln.get("modelo"),
            "placa": placa_n,
            "personalizacao": ln.get("personalizacao"),
            "chassi": ln.get("chassi"),
            "renavam": ln.get("renavam"),
            "ano_fabricacao": ln.get("ano_fabricacao"),
            "ano_modelo": ln.get("ano_modelo"),
            "status": "ativo",
        }
        try:
            existente = main_app.viatura_cadastro_por_placa(placa_n)
            if existente:
                payload["id"] = existente["id"]
            main_app.salvar_viatura_cadastro(payload)
            if existente:
                stats["atualizadas"] += 1
            else:
                stats["cadastradas"] += 1
        except Exception as exc:
            stats["erros"].append(f"Linha {ln['linha']} placa {placa_n}: {exc}")

    stats["kpis"] = main_app.resumo_viaturas_cadastro()
    return stats


def main():
    arg = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    xlsx = arg if arg and arg.exists() else DEFAULT_XLSX
    if not xlsx.exists():
        print(f"Arquivo não encontrado: {xlsx}")
        sys.exit(1)

    print(f"Lendo planilha: {xlsx}")
    linhas = ler_planilha(xlsx)
    print(f"Linhas válidas: {len(linhas)}")

    import app as main_app

    main_app.init_db()
    backup_path, qtd_backup = backup_viaturas()
    print(f"Backup criado: {backup_path} ({qtd_backup} registros)")

    stats = importar(linhas)

    print("\n=== RELATÓRIO IMPORTAÇÃO VIATURAS ===")
    print(f"Total lidas:        {stats['total_lidas']}")
    print(f"Cadastradas:        {stats['cadastradas']}")
    print(f"Atualizadas:        {stats['atualizadas']}")
    print(f"Ignoradas:          {stats['ignoradas']}")
    print(f"Erros:              {len(stats['erros'])}")
    print(f"Duplicadas (plan.): {len(stats['placas_duplicadas_planilha'])}")
    if stats["placas_duplicadas_planilha"]:
        for d in stats["placas_duplicadas_planilha"]:
            print(f"  - {d['placa']} linha {d['linha']} (primeira: {d['primeira_linha']})")
    if stats["erros"]:
        print("\nErros:")
        for e in stats["erros"]:
            print(f"  - {e}")
    kpis = stats.get("kpis") or {}
    print("\nKPIs atuais:")
    print(f"  Total: {kpis.get('total', 0)} | Ativas: {kpis.get('ativas', 0)} | Personalizadas: {kpis.get('personalizadas', 0)}")
    print(f"  Próprias: {kpis.get('proprias', 0)} | Terceiros: {kpis.get('terceiros', 0)}")


if __name__ == "__main__":
    main()
