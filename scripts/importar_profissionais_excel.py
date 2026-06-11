"""
Importa/atualiza profissionais a partir de planilha Excel (PROFISSIONAIS.xlsx).

Uso:
  python scripts/importar_profissionais_excel.py "PROFISSIONAIS.xlsx"
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

DEFAULT_XLSX = Path(r"C:\Users\Ezequiel.Sousa\Dropbox\PC\Desktop\PROFISSIONAIS.xlsx")


def _norm_col(name):
    s = str(name).strip().lower()
    for a, b in (
        ("ç", "c"), ("ã", "a"), ("õ", "o"), ("é", "e"), ("á", "a"),
        ("í", "i"), ("ó", "o"), ("ú", "u"), ("â", "a"), ("ê", "e"), ("ô", "o"),
    ):
        s = s.replace(a, b)
    return s


def _col(df, *partes):
    for col in df.columns:
        nome = _norm_col(col)
        if all(p.lower() in nome for p in partes):
            return col
    return None


def _txt(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    return "" if s.lower() == "nan" else s


def _parse_data(val):
    s = _txt(val)
    if not s or s.startswith("0000"):
        return ""
    try:
        dt = pd.to_datetime(val, dayfirst=False, errors="coerce")
        if pd.isna(dt):
            return ""
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return ""


def mapear_colunas(df):
    return {
        "nome_completo": _col(df, "nome") or _col(df, "nome", "completo"),
        "nome_trabalho": (
            _col(df, "nome", "trabalho")
            or _col(df, "nome", "exib")
            or _col(df, "exib")
            or _col(df, "apelido")
        ),
        "cpf": _col(df, "cpf") or _col(df, "cpf", "cnpj"),
        "rg": _col(df, "rg"),
        "telefone": _col(df, "celular") or _col(df, "telefone") or _col(df, "fone"),
        "email": _col(df, "e-mail") or _col(df, "email"),
        "funcao": _col(df, "funcao") or _col(df, "cargo"),
        "categoria": _col(df, "categoria"),
        "classificacao": (
            _col(df, "classifica")
            or _col(df, "vinculo")
            or _col(df, "tipo")
        ),
        "cnh_numero": _col(df, "cnh", "numero") or _col(df, "cnh"),
        "cnh_vencimento": _col(df, "cnh", "valid") or _col(df, "vencimento", "cnh"),
        "cnh_categoria": _col(df, "cnh", "tipo") or _col(df, "categoria", "cnh"),
        "data_nascimento": _col(df, "nascimento") or _col(df, "dt", "nascimento"),
        "estado_civil": _col(df, "estado", "civil") or _col(df, "civil"),
        "logradouro": _col(df, "logradouro") or _col(df, "endereco"),
        "bairro": _col(df, "bairro"),
        "cidade": _col(df, "cidade"),
        "uf": _col(df, "estado") or _col(df, "uf"),
        "observacao": _col(df, "observ"),
    }


def ler_planilha(path: Path):
    df = pd.read_excel(path, sheet_name=0, dtype=str)
    cols = mapear_colunas(df)
    if not cols["nome_completo"] and not cols["nome_trabalho"]:
        raise ValueError("Coluna de nome não encontrada na planilha.")
    linhas = []
    for idx, row in df.iterrows():
        nome_completo = _txt(row.get(cols["nome_completo"])) if cols["nome_completo"] else ""
        nome_trabalho = _txt(row.get(cols["nome_trabalho"])) if cols["nome_trabalho"] else ""
        if not nome_completo and not nome_trabalho:
            continue
        if not nome_completo:
            nome_completo = nome_trabalho
        if not nome_trabalho:
            nome_trabalho = nome_completo
        linhas.append(
            {
                "linha": int(idx) + 2,
                "nome_completo": nome_completo,
                "nome_trabalho": nome_trabalho,
                "cpf": _txt(row.get(cols["cpf"])) if cols["cpf"] else "",
                "rg": _txt(row.get(cols["rg"])) if cols["rg"] else "",
                "telefone_movel": _txt(row.get(cols["telefone"])) if cols["telefone"] else "",
                "email": _txt(row.get(cols["email"])) if cols["email"] else "",
                "funcao": _txt(row.get(cols["funcao"])) if cols["funcao"] else "",
                "categoria": _txt(row.get(cols["categoria"])) if cols["categoria"] else "",
                "classificacao": _txt(row.get(cols["classificacao"])) if cols["classificacao"] else "",
                "cnh_numero": _txt(row.get(cols["cnh_numero"])) if cols["cnh_numero"] else "",
                "cnh_vencimento": _parse_data(row.get(cols["cnh_vencimento"])) if cols["cnh_vencimento"] else "",
                "cnh_categoria": _txt(row.get(cols["cnh_categoria"])) if cols["cnh_categoria"] else "",
                "data_nascimento": _parse_data(row.get(cols["data_nascimento"])) if cols["data_nascimento"] else "",
                "estado_civil": _txt(row.get(cols["estado_civil"])) if cols["estado_civil"] else "",
                "logradouro": _txt(row.get(cols["logradouro"])) if cols["logradouro"] else "",
                "bairro": _txt(row.get(cols["bairro"])) if cols["bairro"] else "",
                "cidade": _txt(row.get(cols["cidade"])) if cols["cidade"] else "",
                "uf": _txt(row.get(cols["uf"])) if cols["uf"] else "",
                "observacoes": _txt(row.get(cols["observacao"])) if cols["observacao"] else "",
            }
        )
    return linhas


def backup_profissionais():
    import app as main_app

    rows = main_app.q("select * from cadastro_profissionais order by nome_completo asc nulls last", fetch=True) or []
    backup_dir = ROOT / "data" / "backup"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = backup_dir / f"profissionais_backup_{ts}.json"
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
        "total_lidos": len(linhas),
        "cadastrados": 0,
        "atualizados": 0,
        "ignorados": 0,
        "duplicados": [],
        "erros": [],
        "motoristas": 0,
        "operacionais": 0,
        "contratados": 0,
        "terceiros": 0,
    }
    chaves_vistas = {}

    for ln in linhas:
        cpf_n = main_app.normalizar_cpf_profissional(ln.get("cpf"))
        tel_n = main_app.normalizar_telefone_profissional(ln.get("telefone_movel"))
        nome_n = main_app.normalizar_nome_completo_profissional(ln.get("nome_completo"))
        chave = cpf_n or f"{nome_n}|{tel_n}"
        if not chave or chave == "|":
            stats["ignorados"] += 1
            stats["erros"].append(f"Linha {ln['linha']}: sem CPF e sem nome+telefone válidos.")
            continue
        if chave in chaves_vistas:
            stats["duplicados"].append(
                {"chave": chave, "linha": ln["linha"], "primeira_linha": chaves_vistas[chave]}
            )
        chaves_vistas[chave] = ln["linha"]

        vinculo = main_app.mapear_classificacao_vinculo_profissional(ln.get("classificacao"))
        infer = main_app.inferir_tipo_e_funcao_profissional(
            ln.get("funcao"), ln.get("categoria"), ln.get("nome_trabalho")
        )
        existente = None
        if cpf_n:
            existente = main_app.profissional_cadastro_por_cpf(cpf_n)
        if not existente and nome_n and tel_n:
            existente = main_app.profissional_cadastro_por_nome_telefone(nome_n, tel_n)

        payload = {
            "nome_completo": ln["nome_completo"],
            "nome_trabalho": ln["nome_trabalho"],
            "nome_exibicao": ln["nome_trabalho"],
            "cpf": ln.get("cpf"),
            "rg": ln.get("rg"),
            "telefone_movel": ln.get("telefone_movel"),
            "email": ln.get("email"),
            "funcao": infer.get("funcao") or ln.get("funcao"),
            "classificacao_vinculo": vinculo["classificacao_vinculo"],
            "classificacao_original": vinculo["classificacao_original"],
            "terceiro": vinculo["terceiro"],
            "tipo_profissional": infer["tipo_profissional"],
            "cnh_numero": ln.get("cnh_numero"),
            "cnh_vencimento": ln.get("cnh_vencimento"),
            "cnh_categoria": ln.get("cnh_categoria"),
            "data_nascimento": ln.get("data_nascimento"),
            "estado_civil": ln.get("estado_civil"),
            "logradouro": ln.get("logradouro"),
            "bairro": ln.get("bairro"),
            "cidade": ln.get("cidade"),
            "uf": ln.get("uf"),
            "observacoes": ln.get("observacoes"),
            "status": "ativo",
            "pode_receber_servicos": infer["tipo_profissional"] == "motorista",
            "pode_aparecer_controle": True,
        }
        if existente:
            payload["id"] = existente["id"]

        try:
            item = main_app.salvar_profissional_cadastro(payload)
            if existente:
                stats["atualizados"] += 1
            else:
                stats["cadastrados"] += 1
            if item.get("tipo_profissional") == "motorista":
                stats["motoristas"] += 1
            else:
                stats["operacionais"] += 1
            if item.get("classificacao_vinculo") == "terceiro":
                stats["terceiros"] += 1
            else:
                stats["contratados"] += 1
        except Exception as exc:
            stats["erros"].append(f"Linha {ln['linha']} ({nome_n}): {exc}")

    stats["kpis"] = main_app.resumo_profissionais_cadastro()
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
    backup_path, qtd_backup = backup_profissionais()
    print(f"Backup criado: {backup_path} ({qtd_backup} registros)")

    stats = importar(linhas)

    print("\n=== RELATÓRIO IMPORTAÇÃO PROFISSIONAIS ===")
    print(f"Total lidos:        {stats['total_lidos']}")
    print(f"Cadastrados:        {stats['cadastrados']}")
    print(f"Atualizados:        {stats['atualizados']}")
    print(f"Ignorados:          {stats['ignorados']}")
    print(f"Duplicados (plan.): {len(stats['duplicados'])}")
    print(f"Erros:              {len(stats['erros'])}")
    print(f"Motoristas:         {stats['motoristas']}")
    print(f"Operacionais:       {stats['operacionais']}")
    print(f"Contratados:        {stats['contratados']}")
    print(f"Terceiros:          {stats['terceiros']}")
    if stats["duplicados"]:
        print("\nDuplicados na planilha:")
        for d in stats["duplicados"]:
            print(f"  - {d['chave']} linha {d['linha']} (primeira: {d['primeira_linha']})")
    if stats["erros"]:
        print("\nErros:")
        for e in stats["erros"]:
            print(f"  - {e}")
    kpis = stats.get("kpis") or {}
    print("\nKPIs atuais no sistema:")
    print(
        f"  Total: {kpis.get('total', 0)} | Ativos: {kpis.get('ativos', 0)} | "
        f"Inativos: {kpis.get('inativos', 0)}"
    )
    print(
        f"  Motoristas: {kpis.get('motoristas', 0)} | Operacionais: {kpis.get('operacionais', 0)} | "
        f"Contratados: {kpis.get('contratados', 0)} | Terceiros: {kpis.get('terceiros', 0)}"
    )


if __name__ == "__main__":
    main()
