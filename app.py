from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from datetime import datetime
import pandas as pd
import io
import socket
import os
import shutil
import uuid

app = FastAPI(title="Sistema Interno de Reboque MVP V6")
app.mount('/static', StaticFiles(directory='static'), name='static')
templates = Jinja2Templates(directory='templates')

UPLOAD_DIR = os.path.join('static', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

motoristas = []
servicos = []
next_motorista_id = 1
next_servico_id = 1


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


def motorista_by_id(mid: int):
    return next((m for m in motoristas if m['id'] == mid), None)


def servico_by_id(sid: int):
    return next((s for s in servicos if s['id'] == sid), None)


def registrar_evento(servico, status, detalhe=''):
    servico.setdefault('historico', [])
    evento = {'status': status, 'detalhe': detalhe, 'data_hora': agora()}
    servico['historico'].append(evento)
    servico['ultimo_evento'] = f"{evento['data_hora']} - {status}{(' - ' + detalhe) if detalhe else ''}"
    servico['atualizado_em'] = evento['data_hora']


@app.get('/', response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse('index.html', {
        'request': request,
        'motoristas': motoristas,
        'servicos': servicos,
        'lan_ip': get_lan_ip(),
    })


@app.post('/motoristas')
def criar_motorista(
    nome: str = Form(...), telefone: str = Form(''), veiculo: str = Form(''), placa: str = Form(''), tipo: str = Form('')
):
    global next_motorista_id
    motoristas.append({
        'id': next_motorista_id,
        'nome': nome,
        'telefone': telefone,
        'veiculo': veiculo,
        'placa': placa,
        'tipo': tipo,
        'online': False,
        'lat': None,
        'lng': None,
        'ultima_atualizacao': '-',
    })
    next_motorista_id += 1
    return RedirectResponse('/', status_code=303)


@app.post('/servicos')
def criar_servico(
    protocolo: str = Form(...), seguradora: str = Form(''), tipo: str = Form(''), origem: str = Form(...), destino: str = Form(...), observacao: str = Form('')
):
    global next_servico_id
    servico = {
        'id': next_servico_id,
        'protocolo': protocolo,
        'seguradora': seguradora,
        'tipo': tipo,
        'origem': origem,
        'destino': destino,
        'observacao': observacao,
        'status': 'novo',
        'motorista_id': None,
        'motorista_nome': '',
        'placa_veiculo_removido': '',
        'fotos': [],
        'historico': [],
        'ultimo_evento': '',
        'criado_em': agora(),
        'atualizado_em': agora(),
    }
    registrar_evento(servico, 'novo', 'Serviço criado')
    servicos.append(servico)
    next_servico_id += 1
    return RedirectResponse('/', status_code=303)


@app.post('/servicos/importar')
async def importar_servicos(file: UploadFile = File(...)):
    global next_servico_id
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
            olog = str(row.get('O. Logradouro', '')).strip()
            obai = str(row.get('O. Bairro', '')).strip()
            ocid = str(row.get('O. Cidade', '')).strip()
            origem = ', '.join([x for x in [olog, obai, ocid] if x and x.lower() != 'nan'])
        if not destino or destino.lower() == 'nan':
            dlog = str(row.get('D. Logradouro', '')).strip()
            dbai = str(row.get('D. Bairro', '')).strip()
            dcid = str(row.get('D. Cidade', '')).strip()
            destino = ', '.join([x for x in [dlog, dbai, dcid] if x and x.lower() != 'nan'])
        if origem and destino and origem.lower() != 'nan' and destino.lower() != 'nan':
            servico = {
                'id': next_servico_id,
                'protocolo': str(row.get(c_prot, f'IMP-{next_servico_id}')).strip() if c_prot else f'IMP-{next_servico_id}',
                'seguradora': str(row.get(c_seg, '')).strip() if c_seg else '',
                'tipo': str(row.get(c_tipo, '')).strip() if c_tipo else '',
                'origem': origem,
                'destino': destino,
                'observacao': 'Importado do Excel',
                'status': 'novo',
                'motorista_id': None,
                'motorista_nome': '',
                'placa_veiculo_removido': '',
                'fotos': [],
                'historico': [],
                'ultimo_evento': '',
                'criado_em': agora(),
                'atualizado_em': agora(),
            }
            registrar_evento(servico, 'novo', 'Importado do Excel')
            servicos.append(servico)
            next_servico_id += 1
    return RedirectResponse('/', status_code=303)


@app.post('/servicos/{sid}/enviar')
def enviar_servico(sid: int, motorista_id: int = Form(...)):
    s = servico_by_id(sid)
    m = motorista_by_id(motorista_id)
    if s and m:
        s['motorista_id'] = motorista_id
        s['motorista_nome'] = m['nome']
        s['status'] = 'enviado'
        registrar_evento(s, 'enviado', f"Enviado para {m['nome']}")
    return RedirectResponse('/', status_code=303)


class LocationPayload(BaseModel):
    lat: float
    lng: float
    online: bool = True


@app.post('/api/motoristas/{mid}/localizacao')
def atualizar_localizacao(mid: int, payload: LocationPayload):
    m = motorista_by_id(mid)
    if not m:
        return JSONResponse({'ok': False, 'erro': 'Motorista não encontrado'}, status_code=404)
    m['lat'] = payload.lat
    m['lng'] = payload.lng
    m['online'] = payload.online
    m['ultima_atualizacao'] = agora()
    return {'ok': True, 'motorista': m}


@app.post('/api/motoristas/{mid}/offline')
def motorista_offline(mid: int):
    m = motorista_by_id(mid)
    if m:
        m['online'] = False
        m['ultima_atualizacao'] = agora()
    return {'ok': True}


@app.get('/api/motoristas')
def api_motoristas():
    return motoristas


@app.get('/api/servicos')
def api_servicos():
    return servicos


@app.get('/motorista/{mid}', response_class=HTMLResponse)
def tela_motorista(mid: int, request: Request):
    m = motorista_by_id(mid)
    return templates.TemplateResponse('motorista.html', {'request': request, 'm': m})


@app.get('/api/motorista/{mid}/servicos')
def api_servicos_motorista(mid: int):
    return [s for s in servicos if s.get('motorista_id') == mid and s.get('status') not in ['finalizado', 'recusado']]


@app.post('/api/servicos/{sid}/status')
def atualizar_status(sid: int, status: str = Form(...)):
    s = servico_by_id(sid)
    if not s:
        return JSONResponse({'ok': False, 'erro': 'Serviço não encontrado'}, status_code=404)
    s['status'] = status
    registrar_evento(s, status)
    return {'ok': True, 'servico': s}


@app.post('/api/servicos/{sid}/placa')
def enviar_placa(sid: int, placa_veiculo: str = Form(...)):
    s = servico_by_id(sid)
    if not s:
        return JSONResponse({'ok': False, 'erro': 'Serviço não encontrado'}, status_code=404)
    placa = placa_veiculo.upper().replace('-', '').strip()
    if not placa:
        return JSONResponse({'ok': False, 'erro': 'Informe a placa'}, status_code=400)
    s['placa_veiculo_removido'] = placa
    # quando o motorista lança placa, isso é o marco operacional de chegada na origem
    if s.get('status') not in ['em transporte', 'finalizado']:
        s['status'] = 'na origem'
    registrar_evento(s, 'placa lançada', f'Placa: {placa}')
    return {'ok': True, 'servico': s}


@app.post('/api/servicos/{sid}/fotos')
async def enviar_fotos(sid: int, fotos: list[UploadFile] = File(default=[])):
    s = servico_by_id(sid)
    if not s:
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
        s.setdefault('fotos', []).append(url)
        salvas.append(url)
    registrar_evento(s, 'fotos/checklist', f'Fotos adicionadas: {len(salvas)}')
    return {'ok': True, 'fotos': salvas, 'servico': s}


@app.post('/api/servicos/{sid}/finalizar')
def finalizar_servico(sid: int):
    s = servico_by_id(sid)
    if not s:
        return JSONResponse({'ok': False, 'erro': 'Serviço não encontrado'}, status_code=404)
    s['status'] = 'finalizado'
    registrar_evento(s, 'finalizado', 'Serviço finalizado pelo motorista')
    return {'ok': True, 'servico': s}


# Endpoint mantido por compatibilidade com versões antigas
@app.post('/api/servicos/{sid}/baixa')
async def baixar_servico(sid: int, placa_veiculo: str = Form(''), status: str = Form('finalizado'), fotos: list[UploadFile] = File(default=[])):
    if placa_veiculo:
        enviar_placa(sid, placa_veiculo)
    if fotos:
        await enviar_fotos(sid, fotos)
    if status == 'finalizado':
        return finalizar_servico(sid)
    return {'ok': True, 'servico': servico_by_id(sid)}


@app.get('/exportar')
def exportar():
    registros = []
    for s in servicos:
        linha = dict(s)
        linha['fotos'] = ', '.join(s.get('fotos', []))
        linha['historico'] = ' | '.join([f"{h.get('data_hora')} - {h.get('status')} - {h.get('detalhe','')}" for h in s.get('historico', [])])
        registros.append(linha)
    df = pd.DataFrame(registros)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Servicos')
        pd.DataFrame(motoristas).to_excel(writer, index=False, sheet_name='Motoristas')
    output.seek(0)
    return StreamingResponse(output, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'Content-Disposition': 'attachment; filename=sistema_reboque_relatorio.xlsx'})
