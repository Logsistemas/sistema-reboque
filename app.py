from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
import pandas as pd
import io
import socket
import os
import shutil
import uuid
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse, parse_qs

app = FastAPI(title="Sistema Interno de Reboque V8 Supabase")
app.mount('/static', StaticFiles(directory='static'), name='static')
templates = Jinja2Templates(directory='templates')

UPLOAD_DIR = os.path.join('static', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

DATABASE_URL = os.getenv('DATABASE_URL', '').strip()


def agora():
    return datetime.now().strftime('%d/%m/%Y %H:%M:%S')


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "SEU_IP"


def get_conn():
    if not DATABASE_URL:
        raise RuntimeError('DATABASE_URL não configurada no Render.')
    # Supabase/Render precisa SSL. Se a URL não tiver sslmode, adiciona por parâmetro.
    kwargs = {"cursor_factory": RealDictCursor}
    if "sslmode=" not in DATABASE_URL:
        kwargs["sslmode"] = "require"
    return psycopg2.connect(DATABASE_URL, **kwargs)


def execute(sql, params=None, fetchone=False, fetchall=False):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            result = None
            if fetchone:
                result = cur.fetchone()
            if fetchall:
                result = cur.fetchall()
            conn.commit()
            return result


def init_db():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('create extension if not exists "uuid-ossp";')
            cur.execute('create extension if not exists pgcrypto;')

            cur.execute('''
                create table if not exists motoristas (
                    id uuid primary key default gen_random_uuid(),
                    nome text,
                    telefone text,
                    veiculo text,
                    placa text,
                    tipo text,
                    online boolean default false,
                    lat double precision,
                    lng double precision,
                    ultima_atualizacao text default '-',
                    ativo boolean default true,
                    created_at timestamp default now()
                );
            ''')
            cur.execute('''
                create table if not exists servicos (
                    id uuid primary key default gen_random_uuid(),
                    protocolo text,
                    seguradora text,
                    tipo text,
                    origem text,
                    destino text,
                    observacao text,
                    status text default 'novo',
                    motorista_id uuid,
                    motorista_nome text,
                    placa_veiculo_removido text,
                    placa_removida text,
                    ultimo_evento text,
                    criado_em text,
                    atualizado_em text,
                    finalizado_em text,
                    created_at timestamp default now()
                );
            ''')
            cur.execute('''
                create table if not exists fotos (
                    id uuid primary key default gen_random_uuid(),
                    servico_id uuid,
                    url text,
                    nome_arquivo text,
                    descricao text,
                    created_at timestamp default now()
                );
            ''')
            cur.execute('''
                create table if not exists historico (
                    id uuid primary key default gen_random_uuid(),
                    servico_id uuid,
                    status text,
                    detalhe text,
                    data_hora text,
                    created_at timestamp default now()
                );
            ''')
            # Garante colunas caso a tabela antiga tenha sido criada menor no SQL Editor.
            for table, cols in {
                'motoristas': [
                    ('tipo','text'), ('online','boolean default false'), ('lat','double precision'), ('lng','double precision'),
                    ('ultima_atualizacao',"text default '-'") , ('ativo','boolean default true')
                ],
                'servicos': [
                    ('observacao','text'), ('motorista_nome','text'), ('placa_veiculo_removido','text'),
                    ('placa_removida','text'), ('ultimo_evento','text'), ('criado_em','text'), ('atualizado_em','text'), ('finalizado_em','text')
                ],
                'fotos': [('nome_arquivo','text'), ('descricao','text')]
            }.items():
                for col, typ in cols:
                    cur.execute(f'alter table {table} add column if not exists {col} {typ};')
        conn.commit()


@app.on_event('startup')
def startup_event():
    init_db()


def listar_motoristas():
    return execute('select * from motoristas where coalesce(ativo,true)=true order by nome', fetchall=True) or []


def listar_servicos(incluir_finalizados=True):
    sql = '''
        select s.*,
               coalesce(s.placa_veiculo_removido, s.placa_removida, '') as placa_veiculo_removido,
               coalesce(json_agg(f.url) filter (where f.url is not null), '[]') as fotos
        from servicos s
        left join fotos f on f.servico_id = s.id
    '''
    if not incluir_finalizados:
        sql += " where coalesce(s.status,'') not in ('finalizado','recusado') "
    sql += ' group by s.id order by s.created_at desc '
    return execute(sql, fetchall=True) or []


def motorista_by_id(mid: str):
    return execute('select * from motoristas where id=%s', (mid,), fetchone=True)


def servico_by_id(sid: str):
    rows = execute('''
        select s.*,
               coalesce(s.placa_veiculo_removido, s.placa_removida, '') as placa_veiculo_removido,
               coalesce(json_agg(f.url) filter (where f.url is not null), '[]') as fotos
        from servicos s
        left join fotos f on f.servico_id = s.id
        where s.id=%s
        group by s.id
    ''', (sid,), fetchall=True)
    return rows[0] if rows else None


def registrar_evento(sid: str, status: str, detalhe: str = ''):
    data_hora = agora()
    execute('insert into historico (servico_id, status, detalhe, data_hora) values (%s,%s,%s,%s)', (sid, status, detalhe, data_hora))
    ultimo = f"{data_hora} - {status}{(' - ' + detalhe) if detalhe else ''}"
    execute('update servicos set ultimo_evento=%s, atualizado_em=%s where id=%s', (ultimo, data_hora, sid))
    return ultimo


@app.get('/', response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse('index.html', {
        'request': request,
        'motoristas': listar_motoristas(),
        'servicos': listar_servicos(incluir_finalizados=True),
        'lan_ip': get_lan_ip(),
    })


@app.post('/motoristas')
def criar_motorista(nome: str = Form(...), telefone: str = Form(''), veiculo: str = Form(''), placa: str = Form(''), tipo: str = Form('')):
    execute('''insert into motoristas (nome, telefone, veiculo, placa, tipo, online, ultima_atualizacao)
               values (%s,%s,%s,%s,%s,false,'-')''', (nome, telefone, veiculo, placa, tipo))
    return RedirectResponse('/', status_code=303)


@app.post('/servicos')
def criar_servico(protocolo: str = Form(...), seguradora: str = Form(''), tipo: str = Form(''), origem: str = Form(...), destino: str = Form(...), observacao: str = Form('')):
    criado = agora()
    row = execute('''insert into servicos (protocolo, seguradora, tipo, origem, destino, observacao, status, criado_em, atualizado_em)
                     values (%s,%s,%s,%s,%s,%s,'novo',%s,%s) returning id''',
                  (protocolo, seguradora, tipo, origem, destino, observacao, criado, criado), fetchone=True)
    registrar_evento(str(row['id']), 'novo', 'Serviço criado')
    return RedirectResponse('/', status_code=303)


@app.post('/servicos/importar')
async def importar_servicos(file: UploadFile = File(...)):
    content = await file.read()
    df = pd.read_excel(io.BytesIO(content))
    cols = {c.lower().strip(): c for c in df.columns}

    def pick(names):
        for n in names:
            for k, v in cols.items():
                if n in k:
                    return v
        return None

    c_prot = pick(['protocolo', 'assistencia', 'assistência'])
    c_seg = pick(['seguradora', 'empresa'])
    c_tipo = pick(['tipo de serviço', 'tipo servico', 'tipo'])
    c_ori = pick(['origem completa', 'origem'])
    c_des = pick(['destino completo', 'destino'])
    for _, row in df.iterrows():
        origem = str(row.get(c_ori, '')).strip() if c_ori else ''
        destino = str(row.get(c_des, '')).strip() if c_des else ''
        if not origem or origem.lower() == 'nan':
            origem = ', '.join([str(row.get(x, '')).strip() for x in ['O. Logradouro','O. Bairro','O. Cidade'] if str(row.get(x, '')).strip() and str(row.get(x, '')).strip().lower() != 'nan'])
        if not destino or destino.lower() == 'nan':
            destino = ', '.join([str(row.get(x, '')).strip() for x in ['D. Logradouro','D. Bairro','D. Cidade'] if str(row.get(x, '')).strip() and str(row.get(x, '')).strip().lower() != 'nan'])
        if origem and destino and origem.lower() != 'nan' and destino.lower() != 'nan':
            criado = agora()
            protocolo = str(row.get(c_prot, f'IMP-{uuid.uuid4().hex[:6]}')).strip() if c_prot else f'IMP-{uuid.uuid4().hex[:6]}'
            seguradora = str(row.get(c_seg, '')).strip() if c_seg else ''
            tipo = str(row.get(c_tipo, '')).strip() if c_tipo else ''
            r = execute('''insert into servicos (protocolo, seguradora, tipo, origem, destino, observacao, status, criado_em, atualizado_em)
                           values (%s,%s,%s,%s,%s,'Importado do Excel','novo',%s,%s) returning id''',
                        (protocolo, seguradora, tipo, origem, destino, criado, criado), fetchone=True)
            registrar_evento(str(r['id']), 'novo', 'Importado do Excel')
    return RedirectResponse('/', status_code=303)


@app.post('/servicos/{sid}/enviar')
def enviar_servico(sid: str, motorista_id: str = Form(...)):
    m = motorista_by_id(motorista_id)
    if m:
        execute('update servicos set motorista_id=%s, motorista_nome=%s, status=%s where id=%s', (motorista_id, m['nome'], 'enviado', sid))
        registrar_evento(sid, 'enviado', f"Enviado para {m['nome']}")
    return RedirectResponse('/', status_code=303)


class LocationPayload(BaseModel):
    lat: float
    lng: float
    online: bool = True


@app.post('/api/motoristas/{mid}/localizacao')
def atualizar_localizacao(mid: str, payload: LocationPayload):
    if not motorista_by_id(mid):
        return JSONResponse({'ok': False, 'erro': 'Motorista não encontrado'}, status_code=404)
    execute('update motoristas set lat=%s, lng=%s, online=%s, ultima_atualizacao=%s where id=%s',
            (payload.lat, payload.lng, payload.online, agora(), mid))
    return {'ok': True}


@app.post('/api/motoristas/{mid}/offline')
def motorista_offline(mid: str):
    execute('update motoristas set online=false, ultima_atualizacao=%s where id=%s', (agora(), mid))
    return {'ok': True}


@app.get('/api/motoristas')
def api_motoristas():
    return listar_motoristas()


@app.get('/api/servicos')
def api_servicos():
    return listar_servicos(incluir_finalizados=True)


@app.get('/motorista/{mid}', response_class=HTMLResponse)
def tela_motorista(mid: str, request: Request):
    return templates.TemplateResponse('motorista.html', {'request': request, 'm': motorista_by_id(mid)})


@app.get('/api/motorista/{mid}/servicos')
def api_servicos_motorista(mid: str):
    return execute('''
        select s.*, coalesce(s.placa_veiculo_removido, s.placa_removida, '') as placa_veiculo_removido,
               coalesce(json_agg(f.url) filter (where f.url is not null), '[]') as fotos
        from servicos s
        left join fotos f on f.servico_id=s.id
        where s.motorista_id=%s and coalesce(s.status,'') not in ('finalizado','recusado')
        group by s.id order by s.created_at desc
    ''', (mid,), fetchall=True) or []


@app.post('/api/servicos/{sid}/status')
def atualizar_status(sid: str, status: str = Form(...)):
    if not servico_by_id(sid):
        return JSONResponse({'ok': False, 'erro': 'Serviço não encontrado'}, status_code=404)
    execute('update servicos set status=%s where id=%s', (status, sid))
    registrar_evento(sid, status)
    return {'ok': True, 'servico': servico_by_id(sid)}


@app.post('/api/servicos/{sid}/placa')
def enviar_placa(sid: str, placa_veiculo: str = Form(...)):
    if not servico_by_id(sid):
        return JSONResponse({'ok': False, 'erro': 'Serviço não encontrado'}, status_code=404)
    placa = placa_veiculo.upper().replace('-', '').replace(' ', '').strip()
    if not placa:
        return JSONResponse({'ok': False, 'erro': 'Informe a placa'}, status_code=400)
    execute('''update servicos set placa_veiculo_removido=%s, placa_removida=%s,
               status = case when status not in ('em transporte','finalizado') then 'na origem' else status end
               where id=%s''', (placa, placa, sid))
    registrar_evento(sid, 'placa lançada', f'Placa: {placa}')
    return {'ok': True, 'servico': servico_by_id(sid)}


@app.post('/api/servicos/{sid}/fotos')
async def enviar_fotos(sid: str, fotos: List[UploadFile] = File(default=[])):
    if not servico_by_id(sid):
        return JSONResponse({'ok': False, 'erro': 'Serviço não encontrado'}, status_code=404)
    salvas = []
    for foto in fotos:
        if not foto or not foto.filename:
            continue
        ext = os.path.splitext(foto.filename)[1].lower() or '.jpg'
        if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']:
            ext = '.jpg'
        nome_arquivo = f"servico_{sid}_{uuid.uuid4().hex}{ext}"
        caminho = os.path.join(UPLOAD_DIR, nome_arquivo)
        with open(caminho, 'wb') as buffer:
            shutil.copyfileobj(foto.file, buffer)
        url = f"/static/uploads/{nome_arquivo}"
        execute('insert into fotos (servico_id, url, nome_arquivo) values (%s,%s,%s)', (sid, url, nome_arquivo))
        salvas.append(url)
    registrar_evento(sid, 'fotos/checklist', f'Fotos adicionadas: {len(salvas)}')
    return {'ok': True, 'fotos': salvas, 'servico': servico_by_id(sid)}


@app.post('/api/servicos/{sid}/finalizar')
def finalizar_servico(sid: str):
    if not servico_by_id(sid):
        return JSONResponse({'ok': False, 'erro': 'Serviço não encontrado'}, status_code=404)
    final = agora()
    execute('update servicos set status=%s, finalizado_em=%s where id=%s', ('finalizado', final, sid))
    registrar_evento(sid, 'finalizado', 'Serviço finalizado pelo motorista')
    return {'ok': True, 'servico': servico_by_id(sid)}


@app.get('/historico', response_class=HTMLResponse)
def historico(request: Request, data_inicio: str = '', data_fim: str = '', seguradora: str = '', tipo: str = '', motorista: str = ''):
    servicos = listar_servicos(incluir_finalizados=True)
    # filtros simples por texto/data exibida; filtros avançados virão na próxima fase.
    if seguradora:
        servicos = [s for s in servicos if seguradora.lower() in (s.get('seguradora') or '').lower()]
    if tipo:
        servicos = [s for s in servicos if tipo.lower() in (s.get('tipo') or '').lower()]
    if motorista:
        servicos = [s for s in servicos if motorista.lower() in (s.get('motorista_nome') or '').lower()]
    return templates.TemplateResponse('historico.html', {'request': request, 'servicos': servicos, 'filtros': {'seguradora': seguradora, 'tipo': tipo, 'motorista': motorista}})


@app.get('/exportar')
def exportar():
    servicos = listar_servicos(incluir_finalizados=True)
    registros = []
    for s in servicos:
        linha = dict(s)
        fotos = linha.get('fotos') or []
        linha['fotos'] = ', '.join(fotos) if isinstance(fotos, list) else str(fotos)
        hist = execute('select data_hora, status, detalhe from historico where servico_id=%s order by created_at', (str(s['id']),), fetchall=True) or []
        linha['historico'] = ' | '.join([f"{h.get('data_hora')} - {h.get('status')} - {h.get('detalhe') or ''}" for h in hist])
        registros.append(linha)
    df = pd.DataFrame(registros)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Servicos')
        pd.DataFrame(listar_motoristas()).to_excel(writer, index=False, sheet_name='Motoristas')
    output.seek(0)
    return StreamingResponse(output, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'Content-Disposition': 'attachment; filename=sistema_reboque_relatorio.xlsx'})
