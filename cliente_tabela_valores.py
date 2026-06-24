"""
Tabela de valores por cliente — tipos de serviço e itens internos (Saída, KM, etc.).
Fonte oficial: data/TABELA DE VALORES.xlsx
"""
from __future__ import annotations

import json
import re
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parent / "data"

LABELS_TIPO_SERVICO = {
    "R. LEVE": "Reboque leve",
    "R. UTILITARIO": "Reboque utilitário",
    "R. PESADO": "Reboque pesado",
    "R. MEGA PESADO": "Extra pesado",
    "R. E. PESADO": "Reboque extra pesado",
    "R. PATINS": "Reboque patins",
    "GUINDAUTO": "Plataforma / guindauto",
    "R. MOTO": "Moto",
    "R. MOTO ESP.": "Moto especial",
    "R. GARAGEM": "Reboque garagem",
    "R. 5 RODA": "Reboque 5ª roda",
    "C. MEC. LEVE": "Chaveiro mecânico leve",
    "E. PATIO": "Estadia pátio",
}


def normalizar_nome_item(nome: str) -> str:
    n = (nome or "").strip().upper()
    n = n.replace("SAÍDA", "SAIDA")
    n = re.sub(r"\s+", " ", n)
    return n


def label_tipo_servico(tipo: str) -> str:
    t = (tipo or "").strip()
    return LABELS_TIPO_SERVICO.get(t.upper(), t)


def label_item(nome: str) -> str:
    n = normalizar_nome_item(nome)
    mapa = {
        "SAIDA": "Saída",
        "KM VIAGEM": "KM viagem",
        "KM DESLOCAMENTO": "KM deslocamento",
        "KM RETORNO": "KM retorno",
        "HORA TRABALHADA": "Hora trabalhada",
        "HORA PARADA": "Hora parada",
        "ESTADIA": "Estadia",
        "PEDAGIO": "Pedágio",
    }
    return mapa.get(n, (nome or "").strip().title())


def _ler_catalogo_xlsx(caminho: Path):
    try:
        import pandas as pd
    except ImportError:
        return None
    if not caminho.exists():
        return None
    try:
        df = pd.read_excel(caminho, dtype=object)
    except Exception:
        return None
    if df is None or df.empty:
        return None
    cols = list(df.columns)
    if len(cols) >= 3:
        df = df.iloc[:, :3].copy()
        df.columns = ["tipo_servico", "item", "_valor"]
    catalog = {}
    for _, row in df.iterrows():
        tipo = str(row.get("tipo_servico") or "").strip()
        item = normalizar_nome_item(str(row.get("item") or ""))
        if not tipo or not item or tipo.lower() == "tipo":
            continue
        catalog.setdefault(tipo, [])
        if item not in catalog[tipo]:
            catalog[tipo].append(item)
    return catalog or None


def _ler_catalogo_json(caminho: Path):
    if not caminho.exists():
        return None
    try:
        data = json.loads(caminho.read_text(encoding="utf-8"))
    except Exception:
        return None
    raw = data.get("catalogo") if isinstance(data, dict) else None
    if not isinstance(raw, dict):
        return None
    catalog = {}
    for tipo, itens in raw.items():
        t = str(tipo or "").strip()
        if not t:
            continue
        lista = []
        for it in itens or []:
            nome = normalizar_nome_item(str(it))
            if nome and nome not in lista:
                lista.append(nome)
        if lista:
            catalog[t] = lista
    return catalog or None


def catalogo_tabela_valores():
    """{ tipo_servico: [item, ...] } da planilha oficial ou JSON gerado."""
    for nome in ("TABELA DE VALORES.xlsx", "tabela_de_valores.xlsx", "TABELA_DE_VALORES.xlsx"):
        cat = _ler_catalogo_xlsx(_DATA_DIR / nome)
        if cat:
            return cat
    cat = _ler_catalogo_json(_DATA_DIR / "tabela_valores_catalogo.json")
    if cat:
        return cat
    return {
        "R. LEVE": ["SAIDA", "KM VIAGEM", "KM DESLOCAMENTO", "HORA TRABALHADA", "HORA PARADA", "ESTADIA", "PEDAGIO"],
        "R. PESADO": ["SAIDA", "KM VIAGEM", "KM DESLOCAMENTO", "HORA TRABALHADA", "HORA PARADA", "ESTADIA", "PEDAGIO"],
        "R. UTILITARIO": ["SAIDA", "KM VIAGEM", "HORA TRABALHADA", "HORA PARADA", "ESTADIA", "PEDAGIO"],
    }


def init_cliente_tabela_valores_table(cur):
    cur.execute(
        """
        create table if not exists cliente_tabela_valores (
          id uuid primary key default uuid_generate_v4(),
          cliente_id uuid not null references cadastro_contatos(id) on delete cascade,
          tipo_servico text not null,
          item text,
          valor numeric(12,2) default 0,
          valor_unitario numeric(12,2) default 0,
          ativo boolean default true,
          observacao text,
          created_at timestamp default now(),
          updated_at timestamp default now()
        );
        """
    )
    cur.execute(
        "alter table cliente_tabela_valores add column if not exists item text;"
    )
    cur.execute(
        "alter table cliente_tabela_valores add column if not exists valor_unitario numeric(12,2) default 0;"
    )
    cur.execute(
        """
        create index if not exists idx_cliente_tabela_valores_cliente
          on cliente_tabela_valores (cliente_id);
        """
    )
    _migrar_schema_itens(cur)


def _migrar_schema_itens(cur):
    """Migra linhas antigas (só tipo + valor) para estrutura com item."""
    cur.execute(
        """
        update cliente_tabela_valores
           set item = coalesce(nullif(trim(item), ''), 'SAIDA'),
               valor_unitario = coalesce(valor_unitario, valor, 0),
               valor = coalesce(valor, valor_unitario, 0)
         where coalesce(nullif(trim(item), ''), '') = ''
            or valor_unitario is null
        """
    )
    cur.execute(
        """
        update cliente_tabela_valores
           set valor_unitario = coalesce(valor_unitario, valor, 0),
               valor = coalesce(valor, valor_unitario, 0)
         where valor_unitario is null or valor is null
        """
    )
    cur.execute(
        """
        do $$
        begin
          if exists (
            select 1 from pg_constraint
             where conname = 'cliente_tabela_valores_cliente_id_tipo_servico_key'
          ) then
            alter table cliente_tabela_valores
              drop constraint cliente_tabela_valores_cliente_id_tipo_servico_key;
          end if;
        exception when others then null;
        end $$;
        """
    )
    cur.execute(
        """
        create unique index if not exists uq_cliente_tabela_valores_tipo_item
          on cliente_tabela_valores (cliente_id, tipo_servico, item);
        """
    )


def _normalizar_linha_tabela(linha, normalizar_tipo_fn):
    linha = linha or {}
    tipo = normalizar_tipo_fn(linha.get("tipo_servico") or linha.get("tipo") or "")
    item = normalizar_nome_item(linha.get("item") or linha.get("nome_item") or "")
    if not tipo or not item:
        return None
    try:
        valor = float(
            linha.get("valor_unitario")
            if linha.get("valor_unitario") is not None
            else linha.get("valor") or 0
        )
    except (TypeError, ValueError):
        valor = 0.0
    ativo = linha.get("ativo")
    if ativo is None:
        ativo = True
    elif isinstance(ativo, str):
        ativo = ativo.lower() in ("1", "true", "sim", "s", "ativo")
    else:
        ativo = bool(ativo)
    obs = str(linha.get("observacao") or "").strip()
    row_id = str(linha.get("id") or "").strip() or None
    return {
        "id": row_id,
        "tipo_servico": tipo,
        "item": item,
        "valor_unitario": round(valor, 2),
        "ativo": ativo,
        "observacao": obs,
    }


def seed_tabela_valores_cliente(cliente_id, q_fn, one_fn, normalizar_tipo_fn, cur=None):
    cliente_id = str(cliente_id)
    catalogo = catalogo_tabela_valores()

    def _exec(sql, params):
        if cur is not None:
            cur.execute(sql, params)
        else:
            q_fn(sql, params)

    for tipo_raw, itens in catalogo.items():
        tipo = normalizar_tipo_fn(tipo_raw) or tipo_raw
        for item in itens:
            _exec(
                """
                insert into cliente_tabela_valores
                  (cliente_id, tipo_servico, item, valor, valor_unitario, ativo, updated_at)
                values (%s, %s, %s, 0, 0, true, now())
                on conflict (cliente_id, tipo_servico, item) do nothing
                """,
                (cliente_id, tipo, item),
            )


def migrar_tabela_valores_clientes_existentes(q_fn, one_fn, normalizar_tipo_fn, cur=None):
    if cur is not None:
        cur.execute("select id from cadastro_contatos where coalesce(cliente, false) = true")
        rows = cur.fetchall() or []
        ids = [r["id"] if isinstance(r, dict) else r[0] for r in rows]
    else:
        rows = q_fn(
            "select id from cadastro_contatos where coalesce(cliente, false) = true",
            fetch=True,
        ) or []
        ids = [r["id"] for r in rows]
    for cid in ids:
        seed_tabela_valores_cliente(cid, q_fn, one_fn, normalizar_tipo_fn, cur=cur)


def _row_para_dict(r):
    item = dict(r)
    vu = float(item.get("valor_unitario") if item.get("valor_unitario") is not None else item.get("valor") or 0)
    item["id"] = str(item.get("id"))
    item["cliente_id"] = str(item.get("cliente_id"))
    item["item"] = normalizar_nome_item(item.get("item") or "SAIDA")
    item["valor_unitario"] = vu
    item["valor"] = vu
    item["ativo"] = bool(item.get("ativo") if item.get("ativo") is not None else True)
    item["label_tipo"] = label_tipo_servico(item.get("tipo_servico"))
    item["label_item"] = label_item(item["item"])
    return item


def listar_tabela_valores_cliente(cliente_id, q_fn, normalizar_tipo_fn):
    cliente_id = str(cliente_id)
    seed_tabela_valores_cliente(cliente_id, q_fn, None, normalizar_tipo_fn)
    rows = q_fn(
        """
        select id, cliente_id, tipo_servico, item, valor, valor_unitario, ativo, observacao,
               created_at, updated_at
          from cliente_tabela_valores
         where cliente_id = %s
         order by tipo_servico, item
        """,
        (cliente_id,),
        True,
    ) or []
    flat = [_row_para_dict(r) for r in rows]
    grupos_map = {}
    for linha in flat:
        tipo = linha["tipo_servico"]
        if tipo not in grupos_map:
            grupos_map[tipo] = {
                "tipo_servico": tipo,
                "label": linha["label_tipo"],
                "itens": [],
            }
        grupos_map[tipo]["itens"].append(linha)
    return {
        "itens": flat,
        "grupos": list(grupos_map.values()),
    }


def salvar_tabela_valores_cliente(cliente_id, linhas, q_fn, one_fn, normalizar_tipo_fn):
    cliente_id = str(cliente_id)
    row = one_fn(
        "select id from cadastro_contatos where id=%s and coalesce(cliente,false)=true",
        (cliente_id,),
    )
    if not row:
        raise ValueError("Cliente não encontrado")
    seed_tabela_valores_cliente(cliente_id, q_fn, one_fn, normalizar_tipo_fn)
    for raw in linhas or []:
        linha = _normalizar_linha_tabela(raw, normalizar_tipo_fn)
        if not linha:
            continue
        vu = linha["valor_unitario"]
        if linha.get("id"):
            q_fn(
                """
                update cliente_tabela_valores
                   set valor_unitario=%s, valor=%s, ativo=%s, observacao=%s, updated_at=now()
                 where id=%s and cliente_id=%s
                """,
                (vu, vu, linha["ativo"], linha["observacao"] or None, linha["id"], cliente_id),
            )
        else:
            q_fn(
                """
                update cliente_tabela_valores
                   set valor_unitario=%s, valor=%s, ativo=%s, observacao=%s, updated_at=now()
                 where cliente_id=%s and tipo_servico=%s and item=%s
                """,
                (
                    vu,
                    vu,
                    linha["ativo"],
                    linha["observacao"] or None,
                    cliente_id,
                    linha["tipo_servico"],
                    linha["item"],
                ),
            )
    return listar_tabela_valores_cliente(cliente_id, q_fn, normalizar_tipo_fn)


def cliente_id_por_seguradora(nome, one_fn):
    nome = (nome or "").strip()
    if not nome:
        return None
    row = one_fn(
        """
        select id
          from cadastro_contatos
         where coalesce(cliente, false) = true
           and coalesce(status, 'ativo') = 'ativo'
           and (
             lower(trim(coalesce(razao_social, ''))) = lower(%s)
             or lower(trim(coalesce(nome_fantasia, ''))) = lower(%s)
             or lower(trim(coalesce(nome, ''))) = lower(%s)
             or lower(trim(coalesce(razao_social, ''))) like lower(%s)
             or lower(trim(coalesce(nome_fantasia, ''))) like lower(%s)
           )
         order by updated_at desc nulls last
         limit 1
        """,
        (nome, nome, nome, f"%{nome}%", f"%{nome}%"),
    )
    return str(row["id"]) if row else None


def mapa_itens_cliente_por_tipo(cliente_id, tipo_servico, q_fn, normalizar_tipo_fn):
    if not cliente_id:
        return {}
    tipo = normalizar_tipo_fn(tipo_servico)
    if not tipo:
        return {}
    rows = q_fn(
        """
        select item, valor_unitario, valor, ativo
          from cliente_tabela_valores
         where cliente_id = %s and tipo_servico = %s and coalesce(ativo, true) = true
        """,
        (str(cliente_id), tipo),
        True,
    ) or []
    out = {}
    for r in rows:
        key = normalizar_nome_item(r.get("item"))
        try:
            v = float(r.get("valor_unitario") if r.get("valor_unitario") is not None else r.get("valor") or 0)
        except (TypeError, ValueError):
            v = 0.0
        if key and v > 0:
            out[key] = v
    return out


def valor_item_cliente(cliente_id, tipo_servico, item, one_fn, normalizar_tipo_fn):
    if not cliente_id:
        return None
    tipo = normalizar_tipo_fn(tipo_servico)
    nome = normalizar_nome_item(item)
    if not tipo or not nome:
        return None
    row = one_fn(
        """
        select valor_unitario, valor
          from cliente_tabela_valores
         where cliente_id = %s and tipo_servico = %s and item = %s
           and coalesce(ativo, true) = true
        """,
        (str(cliente_id), tipo, nome),
    )
    if not row:
        return None
    try:
        v = float(row.get("valor_unitario") if row.get("valor_unitario") is not None else row.get("valor") or 0)
    except (TypeError, ValueError):
        v = 0.0
    return v if v > 0 else None


def aplicar_valores_cliente_itens_padrao(itens, mapa_itens):
    if not mapa_itens:
        return itens
    saida = []
    for it in itens:
        it = dict(it)
        key = normalizar_nome_item(it.get("nome_item") or it.get("nome") or "")
        if key in mapa_itens and mapa_itens[key] > 0:
            it["valor_padrao"] = float(mapa_itens[key])
        saida.append(it)
    return saida


def itens_padrao_tipo_com_cliente(
    tipo_servico,
    itens_padrao_tipo_fn,
    seguradora=None,
    cliente_id=None,
    one_fn=None,
    normalizar_tipo_fn=None,
    q_fn=None,
):
    itens = itens_padrao_tipo_fn(tipo_servico)
    cid = cliente_id
    if not cid and seguradora and one_fn:
        cid = cliente_id_por_seguradora(seguradora, one_fn)
    if not cid or not normalizar_tipo_fn or not q_fn:
        return itens
    mapa = mapa_itens_cliente_por_tipo(cid, tipo_servico, q_fn, normalizar_tipo_fn)
    return aplicar_valores_cliente_itens_padrao(itens, mapa)


def precos_por_tipo_com_cliente(
    lista_tipos_fn,
    itens_padrao_tipo_fn,
    seguradora=None,
    cliente_id=None,
    one_fn=None,
    normalizar_tipo_fn=None,
    q_fn=None,
):
    return {
        t: itens_padrao_tipo_com_cliente(
            t,
            itens_padrao_tipo_fn,
            seguradora=seguradora,
            cliente_id=cliente_id,
            one_fn=one_fn,
            normalizar_tipo_fn=normalizar_tipo_fn,
            q_fn=q_fn,
        )
        for t in lista_tipos_fn()
    }


def linhas_ativas_cliente(cliente_id, q_fn, normalizar_tipo_fn):
    data = listar_tabela_valores_cliente(cliente_id, q_fn, normalizar_tipo_fn)
    return [i for i in data.get("itens") or [] if i.get("ativo")]
