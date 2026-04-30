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

app = FastAPI(title="Sistema Interno de Reboque V9")
app.mount('/static', StaticFiles(directory='static'), name='static')
templates = Jinja2Templates(directory='templates')
UPLOAD_DIR = os.path.join('static', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

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
            alters=[
            "alter table motoristas add column if not exists tipo text;",
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
            "alter table fotos add column if not exists filename text;"]
            for a in alters: cur.execute(a)
        conn.commit()

@app.on_event("startup")
def startup_event(): init_db()

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
    return s
def lista_motoristas():
    return [normalizar_motorista(r) for r in q("select * from motoristas where coalesce(ativo,true)=true order by nome asc", fetch=True)]
def lista_servicos(limit=None, ativos=False, filtros=None):
    filtros=filtros or {}; where=[]; params=[]
    if ativos: where.append("status not in ('finalizado','recusado')")
    for key,col,op in [("data_ini","date(coalesce(criado_em, created_at))",">="),("data_fim","date(coalesce(criado_em, created_at))","<=")]:
        if filtros.get(key): where.append(f"{col} {op} %s"); params.append(filtros[key])
    for key,col in [("seguradora","seguradora"),("tipo","tipo"),("motorista","coalesce(motorista_nome,'')")]:
        if filtros.get(key): where.append(f"{col} ilike %s"); params.append(f"%{filtros[key]}%")
    if filtros.get("status"): where.append("status=%s"); params.append(filtros["status"])
    sql="select * from servicos" + ((" where " + " and ".join(where)) if where else "") + " order by coalesce(criado_em, created_at) desc"
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
    return templates.TemplateResponse('index.html', {'request':request,'motoristas':lista_motoristas(),'servicos':lista_servicos(limit=80),'lan_ip':get_lan_ip()})

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
def criar_motorista(nome: str=Form(...), telefone: str=Form(''), veiculo: str=Form(''), placa: str=Form(''), tipo: str=Form('')):
    q("insert into motoristas (nome,telefone,veiculo,placa,tipo,online,ultima_atualizacao) values (%s,%s,%s,%s,%s,false,now())",(nome,telefone,veiculo,placa,tipo)); return RedirectResponse('/',303)
@app.post('/servicos')
def criar_servico(protocolo: str=Form(...), seguradora: str=Form(''), tipo: str=Form(''), origem: str=Form(...), destino: str=Form(...), observacao: str=Form('')):
    row=one("insert into servicos (protocolo,seguradora,tipo,origem,destino,observacao,status,criado_em,atualizado_em) values (%s,%s,%s,%s,%s,%s,'novo',now(),now()) returning id",(protocolo,seguradora,tipo,origem,destino,observacao)); registrar_evento_db(row["id"],"novo","Serviço criado"); return RedirectResponse('/',303)

@app.post('/servicos/importar')
async def importar_servicos(file: UploadFile=File(...)):
    content=await file.read(); df=pd.read_excel(io.BytesIO(content)); cols={str(c).lower().strip():c for c in df.columns}
    def pick(names):
        for n in names:
            for k,v in cols.items():
                if n in k: return v
        return None
    c_prot=pick(['protocolo','assistencia','assistência']); c_seg=pick(['seguradora','empresa']); c_tipo=pick(['tipo de serviço','tipo servico','tipo']); c_ori=pick(['origem completa','origem']); c_des=pick(['destino completo','destino'])
    for _,row in df.iterrows():
        origem=str(row.get(c_ori,'')).strip() if c_ori else ''; destino=str(row.get(c_des,'')).strip() if c_des else ''
        if not origem or origem.lower()=='nan': origem=', '.join([str(row.get(x,'')).strip() for x in ['O. Logradouro','O. Bairro','O. Cidade'] if str(row.get(x,'')).strip() and str(row.get(x,'')).strip().lower()!='nan'])
        if not destino or destino.lower()=='nan': destino=', '.join([str(row.get(x,'')).strip() for x in ['D. Logradouro','D. Bairro','D. Cidade'] if str(row.get(x,'')).strip() and str(row.get(x,'')).strip().lower()!='nan'])
        if origem and destino and origem.lower()!='nan' and destino.lower()!='nan':
            protocolo=str(row.get(c_prot,f'IMP-{uuid.uuid4().hex[:6]}')).strip() if c_prot else f'IMP-{uuid.uuid4().hex[:6]}'; seguradora=str(row.get(c_seg,'')).strip() if c_seg else ''; tipo=str(row.get(c_tipo,'')).strip() if c_tipo else ''
            new=one("insert into servicos (protocolo,seguradora,tipo,origem,destino,observacao,status,criado_em,atualizado_em) values (%s,%s,%s,%s,%s,'Importado do Excel','novo',now(),now()) returning id",(protocolo,seguradora,tipo,origem,destino)); registrar_evento_db(new["id"],"novo","Importado do Excel")
    return RedirectResponse('/',303)

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
    return [normalizar_servico(r) for r in q("select * from servicos where motorista_id=%s and status not in ('finalizado','recusado') order by coalesce(criado_em,created_at) desc",(str(mid),),True)]

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
@app.get('/exportar')
def exportar(data_ini: str="", data_fim: str="", seguradora: str="", tipo: str="", status: str="", motorista: str=""):
    filtros={k:(v or None) for k,v in dict(data_ini=data_ini,data_fim=data_fim,seguradora=seguradora,tipo=tipo,status=status,motorista=motorista).items()}
    servs=lista_servicos(filtros=filtros); registros=[]
    for s in servs:
        linha=dict(s); linha['fotos']=', '.join([f.get("url","") for f in s.get('fotos',[])]); linha['historico']=' | '.join([f"{h.get('data_hora')} - {h.get('status')} - {h.get('detalhe','')}" for h in s.get('historico',[])]); registros.append(linha)
    output=io.BytesIO()
    with pd.ExcelWriter(output,engine='openpyxl') as writer:
        pd.DataFrame(registros).to_excel(writer,index=False,sheet_name='Servicos')
        pd.DataFrame(lista_motoristas()).to_excel(writer,index=False,sheet_name='Motoristas')
    output.seek(0)
    return StreamingResponse(output,media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':'attachment; filename=sistema_reboque_relatorio.xlsx'})
