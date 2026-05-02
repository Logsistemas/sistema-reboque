from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from datetime import datetime
import pandas as pd
import io, socket, os, shutil, uuid, json
import psycopg2
from psycopg2.extras import RealDictCursor, Json

app = FastAPI(title="Sistema Interno de Reboque V13 - Faturamento")
app.mount('/static', StaticFiles(directory='static'), name='static')
templates = Jinja2Templates(directory='templates')
UPLOAD_DIR = os.path.join('static', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

PRICE_DATA = [
  {
    "tipo": "C. MEC. LEVE",
    "nome": "SAIDA",
    "valor": 105.0
  },
  {
    "tipo": "E. PATIO",
    "nome": "ESTADIA",
    "valor": 45.0
  },
  {
    "tipo": "GUINDAUTO",
    "nome": "SAIDA",
    "valor": 450.89
  },
  {
    "tipo": "GUINDAUTO",
    "nome": "HORA TRABALHADA",
    "valor": 133.0
  },
  {
    "tipo": "R. 5 RODA",
    "nome": "HORA TRABALHADA",
    "valor": 145.0
  },
  {
    "tipo": "R. 5 RODA",
    "nome": "SAIDA",
    "valor": 530.0
  },
  {
    "tipo": "R. 5 RODA",
    "nome": "HORA PARADA",
    "valor": 120.0
  },
  {
    "tipo": "R. 5 RODA",
    "nome": "KM VIAGEM",
    "valor": 5.6
  },
  {
    "tipo": "R. E. PESADO",
    "nome": "ESTADIA",
    "valor": 100.0
  },
  {
    "tipo": "R. E. PESADO",
    "nome": "PEDAGIO",
    "valor": 1.0
  },
  {
    "tipo": "R. E. PESADO",
    "nome": "HORA TRABALHADA",
    "valor": 145.0
  },
  {
    "tipo": "R. E. PESADO",
    "nome": "HORA PARADA",
    "valor": 120.0
  },
  {
    "tipo": "R. E. PESADO",
    "nome": "KM DESLOCAMENTO",
    "valor": 6.36
  },
  {
    "tipo": "R. E. PESADO",
    "nome": "KM VIAGEM",
    "valor": 6.36
  },
  {
    "tipo": "R. E. PESADO",
    "nome": "SAIDA",
    "valor": 570.48
  },
  {
    "tipo": "R. GARAGEM",
    "nome": "PEDAGIO",
    "valor": 1.0
  },
  {
    "tipo": "R. GARAGEM",
    "nome": "HORA PARADA",
    "valor": 60.0
  },
  {
    "tipo": "R. GARAGEM",
    "nome": "HORA TRABALHADA",
    "valor": 60.0
  },
  {
    "tipo": "R. GARAGEM",
    "nome": "KM RETORNO",
    "valor": 3.24
  },
  {
    "tipo": "R. GARAGEM",
    "nome": "KM DESLOCAMENTO",
    "valor": 3.24
  },
  {
    "tipo": "R. GARAGEM",
    "nome": "KM VIAGEM",
    "valor": 3.24
  },
  {
    "tipo": "R. GARAGEM",
    "nome": "SAIDA",
    "valor": 215.0
  },
  {
    "tipo": "R. LEVE",
    "nome": "KM VIAGEM",
    "valor": 3.24
  },
  {
    "tipo": "R. LEVE",
    "nome": "PEDAGIO",
    "valor": 1.0
  },
  {
    "tipo": "R. LEVE",
    "nome": "HORA TRABALHADA",
    "valor": 60.0
  },
  {
    "tipo": "R. LEVE",
    "nome": "SAIDA",
    "valor": 177.6
  },
  {
    "tipo": "R. LEVE",
    "nome": "HORA PARADA",
    "valor": 60.0
  },
  {
    "tipo": "R. LEVE",
    "nome": "ESTADIA",
    "valor": 50.0
  },
  {
    "tipo": "R. MEGA PESADO",
    "nome": "HORA PARADA",
    "valor": 150.0
  },
  {
    "tipo": "R. MEGA PESADO",
    "nome": "KM RETORNO",
    "valor": 7.5
  },
  {
    "tipo": "R. MEGA PESADO",
    "nome": "KM DESLOCAMENTO",
    "valor": 7.5
  },
  {
    "tipo": "R. MEGA PESADO",
    "nome": "KM VIAGEM",
    "valor": 7.5
  },
  {
    "tipo": "R. MEGA PESADO",
    "nome": "SAIDA",
    "valor": 800.0
  },
  {
    "tipo": "R. MEGA PESADO",
    "nome": "PEDAGIO",
    "valor": 1.0
  },
  {
    "tipo": "R. MEGA PESADO",
    "nome": "HORA TRABALHADA",
    "valor": 200.0
  },
  {
    "tipo": "R. MOTO",
    "nome": "SAIDA",
    "valor": 191.0
  },
  {
    "tipo": "R. MOTO",
    "nome": "KM DESLOCAMENTO",
    "valor": 3.24
  },
  {
    "tipo": "R. MOTO",
    "nome": "KM RETORNO",
    "valor": 3.24
  },
  {
    "tipo": "R. MOTO",
    "nome": "HORA PARADA",
    "valor": 60.0
  },
  {
    "tipo": "R. MOTO",
    "nome": "HORA TRABALHADA",
    "valor": 60.0
  },
  {
    "tipo": "R. MOTO",
    "nome": "PEDAGIO",
    "valor": 1.0
  },
  {
    "tipo": "R. MOTO",
    "nome": "KM VIAGEM",
    "valor": 3.24
  },
  {
    "tipo": "R. MOTO",
    "nome": "ESTADIA",
    "valor": 45.0
  },
  {
    "tipo": "R. MOTO ESP.",
    "nome": "HORA PARADA",
    "valor": 60.0
  },
  {
    "tipo": "R. MOTO ESP.",
    "nome": "SAIDA",
    "valor": 308.0
  },
  {
    "tipo": "R. MOTO ESP.",
    "nome": "PEDAGIO",
    "valor": 1.0
  },
  {
    "tipo": "R. MOTO ESP.",
    "nome": "KM VIAGEM",
    "valor": 3.24
  },
  {
    "tipo": "R. MOTO ESP.",
    "nome": "HORA TRABALHADA",
    "valor": 60.0
  },
  {
    "tipo": "R. PATINS",
    "nome": "ESTADIA",
    "valor": 45.0
  },
  {
    "tipo": "R. PATINS",
    "nome": "PEDAGIO",
    "valor": 1.0
  },
  {
    "tipo": "R. PATINS",
    "nome": "HORA TRABALHADA",
    "valor": 60.0
  },
  {
    "tipo": "R. PATINS",
    "nome": "HORA PARADA",
    "valor": 60.0
  },
  {
    "tipo": "R. PATINS",
    "nome": "KM RETORNO",
    "valor": 3.24
  },
  {
    "tipo": "R. PATINS",
    "nome": "KM DESLOCAMENTO",
    "valor": 3.24
  },
  {
    "tipo": "R. PATINS",
    "nome": "KM VIAGEM",
    "valor": 3.24
  },
  {
    "tipo": "R. PATINS",
    "nome": "SAIDA",
    "valor": 305.0
  },
  {
    "tipo": "R. PESADO",
    "nome": "PEDAGIO",
    "valor": 1.0
  },
  {
    "tipo": "R. PESADO",
    "nome": "KM DESLOCAMENTO",
    "valor": 5.17
  },
  {
    "tipo": "R. PESADO",
    "nome": "SAIDA",
    "valor": 462.84
  },
  {
    "tipo": "R. PESADO",
    "nome": "KM VIAGEM",
    "valor": 5.17
  },
  {
    "tipo": "R. PESADO",
    "nome": "HORA TRABALHADA",
    "valor": 145.0
  },
  {
    "tipo": "R. PESADO",
    "nome": "ESTADIA",
    "valor": 100.0
  },
  {
    "tipo": "R. PESADO",
    "nome": "HORA PARADA",
    "valor": 120.0
  },
  {
    "tipo": "R. UTILITARIO",
    "nome": "ESTADIA",
    "valor": 50.0
  },
  {
    "tipo": "R. UTILITARIO",
    "nome": "PEDAGIO",
    "valor": 1.0
  },
  {
    "tipo": "R. UTILITARIO",
    "nome": "SAIDA",
    "valor": 269.1
  },
  {
    "tipo": "R. UTILITARIO",
    "nome": "KM VIAGEM",
    "valor": 3.52
  },
  {
    "tipo": "R. UTILITARIO",
    "nome": "HORA PARADA",
    "valor": 60.0
  },
  {
    "tipo": "R. UTILITARIO",
    "nome": "HORA TRABALHADA",
    "valor": 70.0
  }
]

DEFAULT_FINANCE_ITEMS = [
    "SAIDA",
    "KM DESLOCAMENTO",
    "KM RETORNO",
    "KM VIAGEM",
    "PEDAGIO",
    "HORA PARADA",
    "HORA TRABALHADA",
    "ESTADIA",
]

def normalizar_tipo_importado(tipo):
    """Ajusta nomes vindos do AutEM/Excel para bater com a tabela de preços."""
    t = (tipo or "").strip().upper()
    mapa = {
        "REBOQUE LEVE": "R. LEVE",
        "R LEVE": "R. LEVE",
        "LEVE": "R. LEVE",
        "REBOQUE MOTO": "R. MOTO",
        "R MOTO": "R. MOTO",
        "MOTO": "R. MOTO",
        "REBOQUE MOTO ESPECIAL": "R. MOTO ESP.",
        "MOTO ESPECIAL": "R. MOTO ESP.",
        "REBOQUE PESADO": "R. PESADO",
        "R PESADO": "R. PESADO",
        "PESADO": "R. PESADO",
        "REBOQUE PATINS": "R. PATINS",
        "PATINS": "R. PATINS",
        "REBOQUE UTILITARIO": "R. UTILITARIO",
        "REBOQUE UTILITÁRIO": "R. UTILITARIO",
        "UTILITARIO": "R. UTILITARIO",
        "UTILITÁRIO": "R. UTILITARIO",
        "REBOQUE GARAGEM": "R. GARAGEM",
        "GARAGEM": "R. GARAGEM",
    }
    return mapa.get(t, tipo)

def moeda(v):
    try:
        return float(v or 0)
    except Exception:
        return 0.0

def fmt_moeda(v):
    try:
        return f"R$ {float(v or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "R$ 0,00"


DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if DATABASE_URL and "sslmode=" not in DATABASE_URL:
    DATABASE_URL += ("&" if "?" in DATABASE_URL else "?") + "sslmode=require"

def agora_dt(): return datetime.now()
def agora(): return agora_dt().strftime('%d/%m/%Y %H:%M:%S')
def dt_str(v):
    if not v: return "-"
    return v if isinstance(v,str) else v.strftime("%d/%m/%Y %H:%M:%S")
def get_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada no Render.")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
def q(sql, params=None, fetch=False):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            rows = cur.fetchall() if fetch else None
        conn.commit()
    return rows
def one(sql, params=None):
    rows=q(sql, params, True)
    return rows[0] if rows else None

def init_db():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('create extension if not exists "uuid-ossp";')
            cur.execute("""
            create table if not exists motoristas (
              id uuid primary key default uuid_generate_v4(),
              nome text, telefone text, veiculo text, placa text, tipo text,
              online boolean default false, lat double precision, lng double precision,
              ultima_atualizacao timestamp, ativo boolean default true,
              created_at timestamp default now()
            );""")
            cur.execute("""
            create table if not exists servicos (
              id uuid primary key default uuid_generate_v4(),
              protocolo text, seguradora text, tipo text, origem text, destino text,
              observacao text, status text default 'novo', motorista_id uuid,
              motorista_nome text, placa_removida text, placa_veiculo_removido text,
              ultimo_evento text, historico jsonb default '[]'::jsonb,
              criado_em timestamp default now(), atualizado_em timestamp default now(),
              finalizado_em timestamp, created_at timestamp default now()
            );""")
            cur.execute("""
            create table if not exists fotos (
              id uuid primary key default uuid_generate_v4(),
              servico_id uuid, url text, filename text, created_at timestamp default now()
            );""")
            cur.execute("""
            create table if not exists tabela_precos (
              id uuid primary key default uuid_generate_v4(),
              tipo_servico text not null,
              nome_item text not null,
              valor_padrao numeric(12,2) default 0,
              ativo boolean default true,
              created_at timestamp default now(),
              unique(tipo_servico, nome_item)
            );""")
            cur.execute("""
            create table if not exists servico_itens (
              id uuid primary key default uuid_generate_v4(),
              servico_id uuid not null,
              tipo_servico text,
              nome_item text not null,
              quantidade numeric(12,2) default 0,
              valor_unitario numeric(12,2) default 0,
              valor_total numeric(12,2) default 0,
              observacao text,
              created_at timestamp default now()
            );""")
            cur.execute("""
            create table if not exists veiculos (
              id uuid primary key default uuid_generate_v4(),
              placa text, modelo text, tipo text, ano text, renavam text, observacao text,
              ativo boolean default true,
              created_at timestamp default now()
            );""")
            cur.execute("""
            create table if not exists usuarios_sistema (
              id uuid primary key default uuid_generate_v4(),
              nome text, cpf text, telefone text, email text, senha text, perfil text,
              ativo boolean default true,
              created_at timestamp default now()
            );""")
            alters=[
            "alter table motoristas add column if not exists tipo text;",
            "alter table motoristas add column if not exists cpf text;",
            "alter table motoristas add column if not exists cnh text;",
            "alter table motoristas add column if not exists vencimento_cnh text;",
            "alter table motoristas add column if not exists nascimento text;",
            "alter table motoristas add column if not exists estado_civil text;",
            "alter table motoristas add column if not exists endereco text;",
            "alter table motoristas add column if not exists online boolean default false;",
            "alter table motoristas add column if not exists lat double precision;",
            "alter table motoristas add column if not exists lng double precision;",
            "alter table motoristas add column if not exists ultima_atualizacao timestamp;",
            "alter table motoristas add column if not exists ativo boolean default true;",
            "alter table servicos add column if not exists observacao text;",
            "alter table servicos add column if not exists motorista_nome text;",
            "alter table servicos add column if not exists placa_removida text;",
            "alter table servicos add column if not exists placa_veiculo_removido text;",
            "alter table servicos add column if not exists ultimo_evento text;",
            "alter table servicos add column if not exists historico jsonb default '[]'::jsonb;",
            "alter table servicos add column if not exists criado_em timestamp default now();",
            "alter table servicos add column if not exists atualizado_em timestamp default now();",
            "alter table servicos add column if not exists finalizado_em timestamp;",
            "alter table fotos add column if not exists filename text;",
            "alter table servicos add column if not exists status_faturamento text default 'para_conferir';",
            "alter table servicos add column if not exists valor_total numeric(12,2) default 0;",
            "alter table servicos add column if not exists beneficiario text;",
            "alter table servicos add column if not exists telefone_cliente text;",
            "alter table servicos add column if not exists veiculo_cliente text;",
            "alter table servicos add column if not exists cor_cliente text;",
            "alter table servicos add column if not exists cnpj_cliente text;",
            "alter table servicos add column if not exists referencia_origem text;",
            "alter table servicos add column if not exists referencia_destino text;"]
            for a in alters: cur.execute(a)
            cur.execute("select count(*) as total from tabela_precos")
            total_precos = cur.fetchone()["total"]
            if not total_precos:
                for item in PRICE_DATA:
                    cur.execute(
                        "insert into tabela_precos (tipo_servico,nome_item,valor_padrao,ativo) values (%s,%s,%s,true) on conflict (tipo_servico,nome_item) do update set valor_padrao=excluded.valor_padrao, ativo=true",
                        (item["tipo"], item["nome"], item["valor"])
                    )
        conn.commit()

@app.on_event("startup")
def startup_event(): init_db()


def lista_tipos_servico():
    rows = q("select tipo_servico from tabela_precos where coalesce(ativo,true)=true group by tipo_servico order by tipo_servico", fetch=True)
    return [r["tipo_servico"] for r in rows]

def itens_padrao_tipo(tipo_servico):
    tipo_servico = normalizar_tipo_importado(tipo_servico)
    if not tipo_servico:
        return []
    rows = q("select nome_item, valor_padrao from tabela_precos where tipo_servico=%s and coalesce(ativo,true)=true order by nome_item", (tipo_servico,), True)
    return [{"nome_item": r["nome_item"], "valor_padrao": float(r["valor_padrao"] or 0)} for r in rows]

def itens_do_servico(servico_id):
    rows = q("select * from servico_itens where servico_id=%s order by nome_item", (str(servico_id),), True)
    out = []
    for r in rows:
        r = dict(r)
        r["id"] = str(r["id"])
        r["servico_id"] = str(r["servico_id"])
        r["quantidade"] = float(r.get("quantidade") or 0)
        r["valor_unitario"] = float(r.get("valor_unitario") or 0)
        r["valor_total"] = float(r.get("valor_total") or 0)
        r["valor_unitario_fmt"] = fmt_moeda(r["valor_unitario"])
        r["valor_total_fmt"] = fmt_moeda(r["valor_total"])
        return_dummy = None
        out.append(r)
    return out

def atualizar_total_servico(servico_id):
    row = one("select coalesce(sum(valor_total),0) as total from servico_itens where servico_id=%s", (str(servico_id),))
    total = float(row["total"] or 0) if row else 0
    q("update servicos set valor_total=%s, atualizado_em=now() where id=%s", (total, str(servico_id)))
    return total

def criar_itens_para_servico(servico_id, tipo_servico, nomes=None, qtds=None, valores=None):
    tipo_servico = normalizar_tipo_importado(tipo_servico)
    nomes = nomes or []
    qtds = qtds or []
    valores = valores or []
    if not nomes:
        padrao = itens_padrao_tipo(tipo_servico)
        # Se o tipo importado não existir na tabela, cria os itens básicos zerados
        # para o faturamento conseguir editar manualmente.
        if not padrao:
            padrao = [{"nome_item": nome, "valor_padrao": 0} for nome in DEFAULT_FINANCE_ITEMS]
        nomes = [i["nome_item"] for i in padrao]
        valores = [i["valor_padrao"] for i in padrao]
        qtds = [1 if str(i["nome_item"]).upper() in ["SAIDA", "SAÍDA"] else 0 for i in padrao]
    q("delete from servico_itens where servico_id=%s", (str(servico_id),))
    for idx, nome in enumerate(nomes):
        nome = (nome or "").strip()
        if not nome:
            continue
        qtd = moeda(qtds[idx] if idx < len(qtds) else 0)
        valor = moeda(valores[idx] if idx < len(valores) else 0)
        total = qtd * valor
        q(
            "insert into servico_itens (servico_id,tipo_servico,nome_item,quantidade,valor_unitario,valor_total) values (%s,%s,%s,%s,%s,%s)",
            (str(servico_id), tipo_servico, nome, qtd, valor, total)
        )
    return atualizar_total_servico(servico_id)

def normalizar_motorista(m):
    if not m: return None
    m=dict(m); m["id"]=str(m["id"]); m["ultima_atualizacao"]=dt_str(m.get("ultima_atualizacao")); m["created_at"]=dt_str(m.get("created_at")); return m
def fotos_do_servico(servico_id):
    return [dict(r) for r in q("select url, filename, created_at from fotos where servico_id=%s order by created_at asc",(str(servico_id),), True)]
def normalizar_servico(s, incluir_fotos=True):
    if not s: return None
    s=dict(s); s["id"]=str(s["id"])
    if s.get("motorista_id"): s["motorista_id"]=str(s["motorista_id"])
    if not s.get("placa_veiculo_removido") and s.get("placa_removida"): s["placa_veiculo_removido"]=s.get("placa_removida")
    if not s.get("placa_removida") and s.get("placa_veiculo_removido"): s["placa_removida"]=s.get("placa_veiculo_removido")
    for k in ["criado_em","atualizado_em","finalizado_em","created_at"]: s[k]=dt_str(s.get(k))
    h=s.get("historico") or []
    if isinstance(h,str):
        try: h=json.loads(h)
        except Exception: h=[]
    s["historico"]=h
    if incluir_fotos: s["fotos"]=fotos_do_servico(s["id"])
    s["valor_total"] = float(s.get("valor_total") or 0)
    s["valor_total_fmt"] = fmt_moeda(s["valor_total"])
    s["status_faturamento"] = s.get("status_faturamento") or "para_conferir"
    return s
def lista_motoristas():
    return [normalizar_motorista(r) for r in q("select * from motoristas where coalesce(ativo,true)=true order by nome asc", fetch=True)]
def lista_servicos(limit=None, ativos=False, filtros=None):
    filtros=filtros or {}; where=[]; params=[]
    if ativos: where.append("status not in ('finalizado','recusado')")
    for key,col,op in [("data_ini","date(created_at)",">="),("data_fim","date(created_at)","<=")]:
        if filtros.get(key): where.append(f"{col} {op} %s"); params.append(filtros[key])
    for key,col in [("seguradora","seguradora"),("tipo","tipo"),("motorista","coalesce(motorista_nome,'')")]:
        if filtros.get(key): where.append(f"{col} ilike %s"); params.append(f"%{filtros[key]}%")
    if filtros.get("status"): where.append("status=%s"); params.append(filtros["status"])
    sql="select * from servicos" + ((" where " + " and ".join(where)) if where else "") + " order by created_at desc"
    if limit: sql += f" limit {int(limit)}"
    return [normalizar_servico(r) for r in q(sql, tuple(params), True)]
def motorista_by_id(mid): return normalizar_motorista(one("select * from motoristas where id=%s",(str(mid),)))
def servico_by_id(sid): return normalizar_servico(one("select * from servicos where id=%s",(str(sid),)))
def registrar_evento_db(sid, status, detalhe=''):
    s=one("select historico from servicos where id=%s",(str(sid),)); historico=s.get("historico") if s else []
    if isinstance(historico,str):
        try: historico=json.loads(historico)
        except Exception: historico=[]
    historico=historico or []
    evento={'status':status,'detalhe':detalhe,'data_hora':agora()}
    historico.append(evento)
    ultimo=f"{evento['data_hora']} - {status}{(' - '+detalhe) if detalhe else ''}"
    q("update servicos set historico=%s, ultimo_evento=%s, atualizado_em=now() where id=%s",(Json(historico),ultimo,str(sid)))
def get_lan_ip():
    try:
        s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(("8.8.8.8",80)); ip=s.getsockname()[0]; s.close(); return ip
    except Exception: return "SEU_IP"

@app.get('/', response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse('index.html', {'request':request,'motoristas':lista_motoristas(),'servicos':lista_servicos(limit=80),'lan_ip':get_lan_ip(),'tipos_servico':lista_tipos_servico(),'precos_por_tipo':{t:itens_padrao_tipo(t) for t in lista_tipos_servico()}})


@app.get('/servicos/novo', response_class=HTMLResponse)
def pagina_novo_servico(request: Request):
    return templates.TemplateResponse('novo_servico.html', {
        'request': request,
        'tipos_servico': lista_tipos_servico(),
        'precos_por_tipo': {t: itens_padrao_tipo(t) for t in lista_tipos_servico()}
    })

@app.get('/servicos/importar', response_class=HTMLResponse)
def pagina_importar_servicos(request: Request):
    return templates.TemplateResponse('importar_servicos.html', {'request': request})

@app.get('/cadastros/motoristas/novo', response_class=HTMLResponse)
def pagina_cadastro_motorista(request: Request):
    return templates.TemplateResponse('cadastro_motorista.html', {'request': request})

@app.get('/cadastros/veiculos/novo', response_class=HTMLResponse)
def pagina_cadastro_veiculo(request: Request):
    return templates.TemplateResponse('cadastro_veiculo.html', {'request': request})

@app.get('/cadastros/usuarios/novo', response_class=HTMLResponse)
def pagina_cadastro_usuario(request: Request):
    return templates.TemplateResponse('cadastro_usuario.html', {'request': request})

@app.post('/cadastros/veiculos')
async def salvar_veiculo(request: Request):
    form = await request.form()
    q("insert into veiculos (placa,modelo,tipo,ano,renavam,observacao,ativo) values (%s,%s,%s,%s,%s,%s,true)", (
        form.get('placa','').strip(), form.get('modelo','').strip(), form.get('tipo','').strip(),
        form.get('ano','').strip(), form.get('renavam','').strip(), form.get('observacao','').strip()
    ))
    return RedirectResponse('/', 303)

@app.post('/cadastros/usuarios')
async def salvar_usuario(request: Request):
    form = await request.form()
    q("insert into usuarios_sistema (nome,cpf,telefone,email,senha,perfil,ativo) values (%s,%s,%s,%s,%s,%s,true)", (
        form.get('nome','').strip(), form.get('cpf','').strip(), form.get('telefone','').strip(),
        form.get('email','').strip(), form.get('senha','').strip(), form.get('perfil','').strip()
    ))
    return RedirectResponse('/', 303)

@app.get('/historico', response_class=HTMLResponse)
def historico(request: Request, data_ini: str="", data_fim: str="", seguradora: str="", tipo: str="", status: str="", motorista: str=""):
    filtros={k:(v or None) for k,v in dict(data_ini=data_ini,data_fim=data_fim,seguradora=seguradora,tipo=tipo,status=status,motorista=motorista).items()}
    servs=lista_servicos(filtros=filtros); total=len(servs); finalizados=len([s for s in servs if s.get("status")=="finalizado"]); ativos=len([s for s in servs if s.get("status") not in ["finalizado","recusado"]]); com_placa=len([s for s in servs if s.get("placa_veiculo_removido") or s.get("placa_removida")])
    df=pd.DataFrame(servs); por_seg=[]; por_tipo=[]; por_mot=[]
    if not df.empty:
        por_seg=df.groupby(df["seguradora"].fillna("").replace("", "Sem seguradora")).size().reset_index(name="total").rename(columns={"seguradora":"nome"}).to_dict("records")
        por_tipo=df.groupby(df["tipo"].fillna("").replace("", "Sem tipo")).size().reset_index(name="total").rename(columns={"tipo":"nome"}).to_dict("records")
        por_mot=df.groupby(df["motorista_nome"].fillna("").replace("", "Sem motorista")).size().reset_index(name="total").rename(columns={"motorista_nome":"nome"}).to_dict("records")
    return templates.TemplateResponse('historico.html', {'request':request,'servicos':servs,'filtros':filtros,'kpis':{"total":total,"finalizados":finalizados,"ativos":ativos,"com_placa":com_placa},'por_seg':por_seg,'por_tipo':por_tipo,'por_mot':por_mot})

@app.get('/operacao', response_class=HTMLResponse)
def operacao(request: Request):
    ms=lista_motoristas(); servs=lista_servicos(ativos=True,limit=150); ultimos=lista_servicos(limit=20); online=len([m for m in ms if m.get("online")])
    return templates.TemplateResponse('operacao.html', {'request':request,'motoristas':ms,'servicos':servs,'ultimos':ultimos,'online':online,'total_motoristas':len(ms)})

@app.post('/motoristas')
async def criar_motorista(request: Request):
    form = await request.form()
    q("""insert into motoristas (nome,telefone,veiculo,placa,tipo,cpf,cnh,vencimento_cnh,nascimento,estado_civil,endereco,online,ultima_atualizacao)
         values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,false,now())""", (
        form.get('nome','').strip(), form.get('telefone','').strip(), form.get('veiculo','').strip(), form.get('placa','').strip(),
        form.get('tipo','').strip(), form.get('cpf','').strip(), form.get('cnh','').strip(), form.get('vencimento_cnh','').strip(),
        form.get('nascimento','').strip(), form.get('estado_civil','').strip(), form.get('endereco','').strip()
    ))
    return RedirectResponse('/',303)
@app.post('/servicos')
async def criar_servico(request: Request):
    form = await request.form()
    protocolo = form.get('protocolo','').strip()
    seguradora = form.get('seguradora','').strip()
    tipo = normalizar_tipo_importado(form.get('tipo','').strip())
    origem = form.get('origem','').strip()
    destino = form.get('destino','').strip()
    observacao = form.get('observacao','').strip()
    nomes = form.getlist('item_nome')
    qtds = form.getlist('item_qtd')
    valores = form.getlist('item_valor')
    row=one("insert into servicos (protocolo,seguradora,tipo,origem,destino,observacao,status,status_faturamento,criado_em,atualizado_em) values (%s,%s,%s,%s,%s,%s,'novo','para_conferir',now(),now()) returning id",(protocolo,seguradora,tipo,origem,destino,observacao))
    criar_itens_para_servico(row["id"], tipo, nomes, qtds, valores)
    registrar_evento_db(row["id"],"novo","Serviço criado com valores")
    return RedirectResponse('/',303)

@app.post('/servicos/importar')
async def importar_servicos(file: UploadFile=File(...)):
    content = await file.read()

    raw = pd.read_excel(io.BytesIO(content), header=None, dtype=object)

    header_idx = None
    for i in range(min(15, len(raw))):
        valores = [str(v).strip().lower() for v in raw.iloc[i].tolist() if pd.notna(v)]
        linha = " | ".join(valores)
        if "protocolo" in linha and ("o. logradouro" in linha or "origem" in linha or "d. logradouro" in linha):
            header_idx = i
            break

    if header_idx is None:
        df = pd.read_excel(io.BytesIO(content), dtype=object)
    else:
        headers = []
        usados = {}
        for v in raw.iloc[header_idx].tolist():
            h = str(v).strip() if pd.notna(v) and str(v).strip() else "Coluna"
            if h in usados:
                usados[h] += 1
                h = f"{h}_{usados[h]}"
            else:
                usados[h] = 1
            headers.append(h)
        df = raw.iloc[header_idx + 1:].copy()
        df.columns = headers

    df = df.dropna(how="all")
    cols = {str(c).lower().strip(): c for c in df.columns}

    def pick(names):
        for n in names:
            alvo = n.lower().strip()
            for k, v in cols.items():
                if alvo == k or alvo in k:
                    return v
        return None

    def val(row, col):
        if not col:
            return ""
        v = row.get(col, "")
        if pd.isna(v):
            return ""
        if isinstance(v, float) and v.is_integer():
            return str(int(v))
        return str(v).strip()

    def juntar_endereco(row, prefixo):
        partes = []
        for col in [f"{prefixo}. Logradouro", f"{prefixo}. Bairro", f"{prefixo}. Cidade"]:
            v = val(row, col)
            if v and v.lower() != "nan":
                partes.append(v)
        return ", ".join(partes)

    c_prot = pick(["protocolo", "assistencia", "assistência"])
    c_seg = pick(["seguradora", "empresa", "produto"])
    c_tipo = pick(["tipo de serviço", "tipo servico", "tipo"])
    c_ori = pick(["origem completa", "origem"])
    c_des = pick(["destino completa", "destino completo", "destino"])
    c_obs = pick(["comentários", "comentarios", "observação", "observacao", "beneficiário", "beneficiario"])
    c_beneficiario = pick(["beneficiário", "beneficiario", "cliente", "nome cliente"])
    c_telefone = pick(["telefone", "telefone 01", "telefone 1", "celular"])
    c_veiculo = pick(["veículo / objeto", "veiculo / objeto", "veículo", "veiculo", "modelo"])
    c_placa_cliente = pick(["placa"])
    c_cor = pick(["cor"])
    c_cnpj = pick(["cnpj", "cnpj / filial"])
    c_ref_origem = pick(["o. referência", "o. referencia", "referência origem", "referencia origem"])
    c_ref_destino = pick(["d. referência", "d. referencia", "referência destino", "referencia destino"])

    importados = 0

    for _, row in df.iterrows():
        origem = val(row, c_ori)
        destino = val(row, c_des)

        if not origem:
            origem = juntar_endereco(row, "O")
        if not destino:
            destino = juntar_endereco(row, "D")

        protocolo = val(row, c_prot) or f"IMP-{uuid.uuid4().hex[:6]}"
        seguradora = val(row, c_seg)
        tipo = normalizar_tipo_importado(val(row, c_tipo))

        obs_partes = []
        obs_base = val(row, c_obs)
        if obs_base:
            obs_partes.append(obs_base)
        for label in ["Veículo / Objeto", "Placa", "Cor", "Beneficiário", "Telefone", "Senha", "CNPJ", "Status"]:
            v = val(row, label)
            if v:
                obs_partes.append(f"{label}: {v}")
        observacao = " | ".join(obs_partes) or "Importado do Excel AutEM"

        if origem and destino and origem.lower() != "nan" and destino.lower() != "nan":
            beneficiario = val(row, c_beneficiario)
            telefone_cliente = val(row, c_telefone)
            veiculo_cliente = val(row, c_veiculo)
            placa_cliente = val(row, c_placa_cliente)
            cor_cliente = val(row, c_cor)
            cnpj_cliente = val(row, c_cnpj)
            referencia_origem = val(row, c_ref_origem)
            referencia_destino = val(row, c_ref_destino)

            new = one(
                """insert into servicos (
                    protocolo, seguradora, tipo, origem, destino, observacao,
                    status, status_faturamento, placa_veiculo_removido, placa_removida,
                    beneficiario, telefone_cliente, veiculo_cliente, cor_cliente, cnpj_cliente,
                    referencia_origem, referencia_destino, criado_em, atualizado_em
                ) values (%s,%s,%s,%s,%s,%s,'novo','para_conferir',%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),now()) returning id""",
                (
                    protocolo, seguradora, tipo, origem, destino, observacao,
                    placa_cliente, placa_cliente, beneficiario, telefone_cliente, veiculo_cliente,
                    cor_cliente, cnpj_cliente, referencia_origem, referencia_destino
                )
            )
            # CRÍTICO: serviços importados também ganham itens financeiros editáveis.
            criar_itens_para_servico(new["id"], tipo)
            registrar_evento_db(new["id"], "novo", "Importado do Excel AutEM com itens financeiros")
            importados += 1

    return RedirectResponse('/?importados=' + str(importados), 303)


@app.post('/servicos/{sid}/enviar')
def enviar_servico(sid: str, motorista_id: str=Form(...)):
    m=motorista_by_id(motorista_id)
    if m:
        q("update servicos set motorista_id=%s,motorista_nome=%s,status='enviado',atualizado_em=now() where id=%s",(str(motorista_id),m["nome"],str(sid))); registrar_evento_db(sid,'enviado',f"Enviado para {m['nome']}")
    return RedirectResponse('/',303)

class LocationPayload(BaseModel):
    lat: float; lng: float; online: bool=True
@app.post('/api/motoristas/{mid}/localizacao')
def atualizar_localizacao(mid: str, payload: LocationPayload):
    q("update motoristas set lat=%s,lng=%s,online=%s,ultima_atualizacao=now() where id=%s",(payload.lat,payload.lng,payload.online,str(mid))); return {'ok':True,'motorista':motorista_by_id(mid)}
@app.post('/api/motoristas/{mid}/offline')
def motorista_offline(mid: str):
    q("update motoristas set online=false,ultima_atualizacao=now() where id=%s",(str(mid),)); return {'ok':True}
@app.get('/api/motoristas')
def api_motoristas(): return lista_motoristas()
@app.get('/api/servicos')
def api_servicos(): return lista_servicos(limit=200)
@app.get('/motorista/{mid}', response_class=HTMLResponse)
def tela_motorista(mid: str, request: Request):
    return templates.TemplateResponse('motorista.html', {'request':request,'m':motorista_by_id(mid)})
@app.get('/api/motorista/{mid}/servicos')
def api_servicos_motorista(mid: str):
    return [normalizar_servico(r) for r in q("select * from servicos where motorista_id=%s and status not in ('finalizado','recusado') order by created_at desc",(str(mid),),True)]

@app.post('/api/servicos/{sid}/status')
def atualizar_status(sid: str, status: str=Form(...)):
    if not servico_by_id(sid): return JSONResponse({'ok':False,'erro':'Serviço não encontrado'},404)
    if status=="finalizado": q("update servicos set status=%s,atualizado_em=now(),finalizado_em=now() where id=%s",(status,str(sid)))
    else: q("update servicos set status=%s,atualizado_em=now() where id=%s",(status,str(sid)))
    registrar_evento_db(sid,status); return {'ok':True,'servico':servico_by_id(sid)}
@app.post('/api/servicos/{sid}/placa')
def enviar_placa(sid: str, placa_veiculo: str=Form(...)):
    placa=(placa_veiculo or "").upper().replace("-","").replace(" ","").strip()
    if not placa: return JSONResponse({'ok':False,'erro':'Informe a placa'},400)
    existe=servico_by_id(sid)
    if not existe: return JSONResponse({'ok':False,'erro':'Serviço não encontrado'},404)
    novo_status=existe.get("status") or "novo"
    if novo_status not in ['em transporte','finalizado']: novo_status='na origem'
    q("update servicos set placa_veiculo_removido=%s,placa_removida=%s,status=%s,atualizado_em=now() where id=%s",(placa,placa,novo_status,str(sid)))
    registrar_evento_db(sid,'placa lançada',f'Placa: {placa}'); return {'ok':True,'servico':servico_by_id(sid)}
@app.post('/api/servicos/{sid}/fotos')
async def enviar_fotos(sid: str, fotos: list[UploadFile]=File(default=[])):
    if not servico_by_id(sid): return JSONResponse({'ok':False,'erro':'Serviço não encontrado'},404)
    salvas=[]
    for foto in fotos:
        if not foto or not foto.filename: continue
        ext=os.path.splitext(foto.filename)[1].lower() or '.jpg'
        if ext not in ['.jpg','.jpeg','.png','.webp','.gif','.heic']: ext='.jpg'
        nome=f"servico_{sid}_{uuid.uuid4().hex}{ext}"; caminho=os.path.join(UPLOAD_DIR,nome)
        with open(caminho,'wb') as buffer: shutil.copyfileobj(foto.file,buffer)
        url=f"/static/uploads/{nome}"; q("insert into fotos (servico_id,url,filename,created_at) values (%s,%s,%s,now())",(str(sid),url,foto.filename)); salvas.append(url)
    registrar_evento_db(sid,'fotos/checklist',f'Fotos adicionadas: {len(salvas)}'); return {'ok':True,'fotos':salvas,'servico':servico_by_id(sid)}
@app.post('/api/servicos/{sid}/finalizar')
def finalizar_servico(sid: str):
    if not servico_by_id(sid): return JSONResponse({'ok':False,'erro':'Serviço não encontrado'},404)
    q("update servicos set status='finalizado',atualizado_em=now(),finalizado_em=now() where id=%s",(str(sid),)); registrar_evento_db(sid,'finalizado','Serviço finalizado pelo motorista'); return {'ok':True,'servico':servico_by_id(sid)}

@app.get('/faturamento', response_class=HTMLResponse)
def faturamento(request: Request, data_ini: str="", data_fim: str="", seguradora: str="", status_faturamento: str="", motorista: str=""):
    filtros={k:(v or None) for k,v in dict(data_ini=data_ini,data_fim=data_fim,seguradora=seguradora,motorista=motorista).items()}
    where=[]; params=[]
    if filtros.get("data_ini"): where.append("date(created_at) >= %s"); params.append(filtros["data_ini"])
    if filtros.get("data_fim"): where.append("date(created_at) <= %s"); params.append(filtros["data_fim"])
    if filtros.get("seguradora"): where.append("seguradora ilike %s"); params.append(f"%{filtros['seguradora']}%")
    if filtros.get("motorista"): where.append("coalesce(motorista_nome,'') ilike %s"); params.append(f"%{filtros['motorista']}%")
    if status_faturamento: where.append("coalesce(status_faturamento,'para_conferir')=%s"); params.append(status_faturamento)
    sql="select * from servicos" + ((" where " + " and ".join(where)) if where else "") + " order by created_at desc"
    servs=[normalizar_servico(r) for r in q(sql, tuple(params), True)]
    total=sum(float(s.get("valor_total") or 0) for s in servs)
    kpis={
      "total_servicos": len(servs),
      "valor_total": fmt_moeda(total),
      "para_conferir": len([s for s in servs if s.get("status_faturamento")=="para_conferir"]),
      "para_faturar": len([s for s in servs if s.get("status_faturamento")=="para_faturar"]),
      "negociacao": len([s for s in servs if s.get("status_faturamento")=="negociacao"]),
      "faturado": len([s for s in servs if s.get("status_faturamento")=="faturado"]),
    }
    return templates.TemplateResponse('faturamento.html', {'request':request,'servicos':servs,'filtros':dict(data_ini=data_ini,data_fim=data_fim,seguradora=seguradora,status_faturamento=status_faturamento,motorista=motorista),'kpis':kpis})

@app.get('/faturamento/{sid}', response_class=HTMLResponse)
def faturamento_detalhe(sid: str, request: Request):
    s=servico_by_id(sid)
    if not s: return RedirectResponse('/faturamento',303)
    itens=itens_do_servico(sid)
    # Fallback: se for serviço importado antigo sem itens, cria automaticamente
    # para liberar edição no faturamento.
    if not itens:
        criar_itens_para_servico(sid, s.get("tipo"))
        s = servico_by_id(sid)
        itens = itens_do_servico(sid)
    return templates.TemplateResponse('servico_financeiro.html', {'request':request,'s':s,'itens':itens,'tipos_servico':lista_tipos_servico(),'precos_por_tipo':{t:itens_padrao_tipo(t) for t in lista_tipos_servico()}})

@app.post('/faturamento/{sid}/salvar')
async def faturamento_salvar(sid: str, request: Request):
    form=await request.form()
    status_faturamento=form.get('status_faturamento','para_conferir')
    nomes=form.getlist('item_nome')
    qtds=form.getlist('item_qtd')
    valores=form.getlist('item_valor')
    tipo=form.get('tipo','')
    criar_itens_para_servico(sid, tipo, nomes, qtds, valores)
    total=atualizar_total_servico(sid)
    q("update servicos set tipo=%s,status_faturamento=%s,valor_total=%s,atualizado_em=now() where id=%s",(tipo,status_faturamento,total,str(sid)))
    registrar_evento_db(sid,'faturamento',f'Status: {status_faturamento} - Total: {fmt_moeda(total)}')
    return RedirectResponse(f'/faturamento/{sid}',303)

@app.post('/faturamento/{sid}/status')
def faturamento_status(sid: str, status_faturamento: str=Form(...)):
    q("update servicos set status_faturamento=%s,atualizado_em=now() where id=%s",(status_faturamento,str(sid)))
    registrar_evento_db(sid,'faturamento',f'Status faturamento: {status_faturamento}')
    return RedirectResponse('/faturamento',303)


@app.get('/exportar')
def exportar(data_ini: str="", data_fim: str="", seguradora: str="", tipo: str="", status: str="", motorista: str=""):
    filtros={k:(v or None) for k,v in dict(data_ini=data_ini,data_fim=data_fim,seguradora=seguradora,tipo=tipo,status=status,motorista=motorista).items()}
    servs=lista_servicos(filtros=filtros); registros=[]
    for s in servs:
        linha=dict(s); linha['fotos']=', '.join([f.get("url","") for f in s.get('fotos',[])]); linha['historico']=' | '.join([f"{h.get('data_hora')} - {h.get('status')} - {h.get('detalhe','')}" for h in s.get('historico',[])]); registros.append(linha)
    output=io.BytesIO()
    with pd.ExcelWriter(output,engine='openpyxl') as writer:
        pd.DataFrame(registros).to_excel(writer,index=False,sheet_name='Servicos')
        itens=[]
        for s in servs:
            for it in itens_do_servico(s["id"]):
                itens.append({"protocolo":s.get("protocolo"),"seguradora":s.get("seguradora"),"tipo":s.get("tipo"),"item":it.get("nome_item"),"quantidade":it.get("quantidade"),"valor_unitario":it.get("valor_unitario"),"valor_total":it.get("valor_total"),"status_faturamento":s.get("status_faturamento")})
        pd.DataFrame(itens).to_excel(writer,index=False,sheet_name='Itens_Faturamento')
        pd.DataFrame(lista_motoristas()).to_excel(writer,index=False,sheet_name='Motoristas')
    output.seek(0)
    return StreamingResponse(output,media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':'attachment; filename=sistema_reboque_relatorio.xlsx'})
