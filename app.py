
from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from datetime import datetime
import pandas as pd
import io
import os
import socket
import base64
import uuid
from typing import Optional, List

import psycopg2
from psycopg2.extras import RealDictCursor


app = FastAPI(title="Sistema Interno de Reboque - V7 Banco Supabase")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

DATABASE_URL = os.getenv("DATABASE_URL", "")


def agora():
    return datetime.now().strftime("%d/%m/%Y %H:%M:%S")


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
        raise RuntimeError("DATABASE_URL não configurada no Render.")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def db_fetchall(sql, params=None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return [dict(r) for r in cur.fetchall()]


def db_fetchone(sql, params=None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone()
            return dict(row) if row else None


def db_execute(sql, params=None, fetchone=False):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            result = dict(cur.fetchone()) if fetchone and cur.description else None
            conn.commit()
            return result


def init_db():
    """Cria/ajusta as tabelas no Supabase automaticamente."""
    if not DATABASE_URL:
        return

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')

            cur.execute("""
            CREATE TABLE IF NOT EXISTS motoristas (
              id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
              nome text,
              telefone text,
              veiculo text,
              placa text,
              tipo text,
              online boolean DEFAULT false,
              lat double precision,
              lng double precision,
              ultima_atualizacao text DEFAULT '-',
              ativo boolean DEFAULT true,
              created_at timestamp DEFAULT now()
            );
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS servicos (
              id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
              protocolo text,
              seguradora text,
              tipo text,
              origem text,
              destino text,
              observacao text,
              status text DEFAULT 'novo',
              motorista_id uuid,
              motorista_nome text,
              placa_removida text,
              placa_veiculo_removido text,
              criado_em text,
              atualizado_em text,
              ultimo_evento text,
              created_at timestamp DEFAULT now(),
              finalizado_em timestamp
            );
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS fotos (
              id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
              servico_id uuid,
              url text,
              nome_arquivo text,
              created_at timestamp DEFAULT now()
            );
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS historico_servicos (
              id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
              servico_id uuid,
              status text,
              detalhe text,
              data_hora text,
              created_at timestamp DEFAULT now()
            );
            """)

            # Migrações leves caso a tabela tenha sido criada antes com menos colunas
            alters = [
                "ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS tipo text;",
                "ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS online boolean DEFAULT false;",
                "ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS lat double precision;",
                "ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS lng double precision;",
                "ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS ultima_atualizacao text DEFAULT '-';",
                "ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;",
                "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS observacao text;",
                "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS motorista_nome text;",
                "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS placa_removida text;",
                "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS placa_veiculo_removido text;",
                "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS criado_em text;",
                "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS atualizado_em text;",
                "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS ultimo_evento text;",
                "ALTER TABLE fotos ADD COLUMN IF NOT EXISTS nome_arquivo text;",
            ]
            for a in alters:
                cur.execute(a)
            conn.commit()


@app.on_event("startup")
def startup_event():
    init_db()


def normalizar_servico(s):
    if not s:
        return None
    s = dict(s)
    sid = str(s["id"])
    fotos = db_fetchall("SELECT id, url, nome_arquivo, created_at FROM fotos WHERE servico_id=%s ORDER BY created_at ASC", (sid,))
    hist = db_fetchall("SELECT status, detalhe, data_hora FROM historico_servicos WHERE servico_id=%s ORDER BY created_at ASC", (sid,))
    s["id"] = sid
    if s.get("motorista_id"):
        s["motorista_id"] = str(s["motorista_id"])
    s["fotos"] = fotos
    s["historico"] = hist
    # compatibilidade com nomes antigos
    if not s.get("placa_veiculo_removido") and s.get("placa_removida"):
        s["placa_veiculo_removido"] = s.get("placa_removida")
    return s


def listar_motoristas():
    rows = db_fetchall("SELECT * FROM motoristas WHERE COALESCE(ativo,true)=true ORDER BY created_at ASC")
    for r in rows:
        r["id"] = str(r["id"])
    return rows


def listar_servicos():
    rows = db_fetchall("SELECT * FROM servicos ORDER BY created_at DESC")
    return [normalizar_servico(r) for r in rows]


def motorista_by_id(mid: str):
    row = db_fetchone("SELECT * FROM motoristas WHERE id=%s", (mid,))
    if row:
        row["id"] = str(row["id"])
    return row


def servico_by_id(sid: str):
    row = db_fetchone("SELECT * FROM servicos WHERE id=%s", (sid,))
    return normalizar_servico(row) if row else None


def registrar_evento(sid: str, status: str, detalhe: str = ""):
    dh = agora()
    ultimo = f"{dh} - {status}{(' - ' + detalhe) if detalhe else ''}"
    db_execute("""
        INSERT INTO historico_servicos (servico_id, status, detalhe, data_hora)
        VALUES (%s, %s, %s, %s)
    """, (sid, status, detalhe, dh))
    db_execute("""
        UPDATE servicos SET ultimo_evento=%s, atualizado_em=%s WHERE id=%s
    """, (ultimo, dh, sid))


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "motoristas": listar_motoristas(),
        "servicos": listar_servicos(),
        "lan_ip": get_lan_ip(),
        "db_ok": bool(DATABASE_URL),
    })


@app.post("/motoristas")
def criar_motorista(
    nome: str = Form(...),
    telefone: str = Form(""),
    veiculo: str = Form(""),
    placa: str = Form(""),
    tipo: str = Form("")
):
    db_execute("""
        INSERT INTO motoristas (nome, telefone, veiculo, placa, tipo, online, ultima_atualizacao)
        VALUES (%s,%s,%s,%s,%s,false,'-')
    """, (nome, telefone, veiculo, placa, tipo))
    return RedirectResponse("/", status_code=303)


@app.post("/servicos")
def criar_servico(
    protocolo: str = Form(...),
    seguradora: str = Form(""),
    tipo: str = Form(""),
    origem: str = Form(...),
    destino: str = Form(...),
    observacao: str = Form("")
):
    row = db_execute("""
        INSERT INTO servicos
        (protocolo, seguradora, tipo, origem, destino, observacao, status, criado_em, atualizado_em)
        VALUES (%s,%s,%s,%s,%s,%s,'novo',%s,%s)
        RETURNING id
    """, (protocolo, seguradora, tipo, origem, destino, observacao, agora(), agora()), fetchone=True)
    registrar_evento(str(row["id"]), "novo", "Serviço criado")
    return RedirectResponse("/", status_code=303)


@app.post("/servicos/importar")
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

    c_prot = pick(["protocolo", "assistencia", "assistência"])
    c_seg = pick(["seguradora", "empresa"])
    c_tipo = pick(["tipo de serviço", "tipo servico", "tipo"])
    c_ori = pick(["origem completa", "origem"])
    c_des = pick(["destino completo", "destino"])

    for idx, row in df.iterrows():
        origem = str(row.get(c_ori, "")).strip() if c_ori else ""
        destino = str(row.get(c_des, "")).strip() if c_des else ""

        if not origem or origem.lower() == "nan":
            olog = str(row.get("O. Logradouro", "")).strip()
            obai = str(row.get("O. Bairro", "")).strip()
            ocid = str(row.get("O. Cidade", "")).strip()
            origem = ", ".join([x for x in [olog, obai, ocid] if x and x.lower() != "nan"])

        if not destino or destino.lower() == "nan":
            dlog = str(row.get("D. Logradouro", "")).strip()
            dbai = str(row.get("D. Bairro", "")).strip()
            dcid = str(row.get("D. Cidade", "")).strip()
            destino = ", ".join([x for x in [dlog, dbai, dcid] if x and x.lower() != "nan"])

        if origem and destino and origem.lower() != "nan" and destino.lower() != "nan":
            protocolo = str(row.get(c_prot, f"IMP-{idx+1}")).strip() if c_prot else f"IMP-{idx+1}"
            seguradora = str(row.get(c_seg, "")).strip() if c_seg else ""
            tipo = str(row.get(c_tipo, "")).strip() if c_tipo else ""
            r = db_execute("""
                INSERT INTO servicos
                (protocolo, seguradora, tipo, origem, destino, observacao, status, criado_em, atualizado_em)
                VALUES (%s,%s,%s,%s,%s,'Importado do Excel','novo',%s,%s)
                RETURNING id
            """, (protocolo, seguradora, tipo, origem, destino, agora(), agora()), fetchone=True)
            registrar_evento(str(r["id"]), "novo", "Importado do Excel")

    return RedirectResponse("/", status_code=303)


@app.post("/servicos/{sid}/enviar")
def enviar_servico(sid: str, motorista_id: str = Form(...)):
    m = motorista_by_id(motorista_id)
    if m:
        db_execute("""
            UPDATE servicos
            SET motorista_id=%s, motorista_nome=%s, status='enviado', atualizado_em=%s
            WHERE id=%s
        """, (motorista_id, m["nome"], agora(), sid))
        registrar_evento(sid, "enviado", f"Enviado para {m['nome']}")
    return RedirectResponse("/", status_code=303)


class LocationPayload(BaseModel):
    lat: float
    lng: float
    online: bool = True


@app.post("/api/motoristas/{mid}/localizacao")
def atualizar_localizacao(mid: str, payload: LocationPayload):
    m = motorista_by_id(mid)
    if not m:
        return JSONResponse({"ok": False, "erro": "Motorista não encontrado"}, status_code=404)
    db_execute("""
        UPDATE motoristas
        SET lat=%s, lng=%s, online=%s, ultima_atualizacao=%s
        WHERE id=%s
    """, (payload.lat, payload.lng, payload.online, agora(), mid))
    return {"ok": True, "motorista": motorista_by_id(mid)}


@app.post("/api/motoristas/{mid}/offline")
def motorista_offline(mid: str):
    db_execute("UPDATE motoristas SET online=false, ultima_atualizacao=%s WHERE id=%s", (agora(), mid))
    return {"ok": True}


@app.get("/api/motoristas")
def api_motoristas():
    return listar_motoristas()


@app.get("/api/servicos")
def api_servicos():
    return listar_servicos()


@app.get("/motorista/{mid}", response_class=HTMLResponse)
def tela_motorista(mid: str, request: Request):
    m = motorista_by_id(mid)
    return templates.TemplateResponse("motorista.html", {"request": request, "m": m})


@app.get("/api/motorista/{mid}/servicos")
def api_servicos_motorista(mid: str):
    rows = db_fetchall("""
        SELECT * FROM servicos
        WHERE motorista_id=%s AND COALESCE(status,'') NOT IN ('finalizado','recusado')
        ORDER BY created_at DESC
    """, (mid,))
    return [normalizar_servico(r) for r in rows]


@app.post("/api/servicos/{sid}/status")
def atualizar_status(sid: str, status: str = Form(...)):
    s = servico_by_id(sid)
    if not s:
        return JSONResponse({"ok": False, "erro": "Serviço não encontrado"}, status_code=404)
    db_execute("UPDATE servicos SET status=%s, atualizado_em=%s WHERE id=%s", (status, agora(), sid))
    registrar_evento(sid, status)
    return {"ok": True, "servico": servico_by_id(sid)}


@app.post("/api/servicos/{sid}/placa")
def enviar_placa(sid: str, placa_veiculo: str = Form(...)):
    s = servico_by_id(sid)
    if not s:
        return JSONResponse({"ok": False, "erro": "Serviço não encontrado"}, status_code=404)
    placa = placa_veiculo.upper().replace("-", "").strip()
    if not placa:
        return JSONResponse({"ok": False, "erro": "Informe a placa"}, status_code=400)

    novo_status = s.get("status") or "novo"
    if novo_status not in ["em transporte", "finalizado"]:
        novo_status = "na origem"

    db_execute("""
        UPDATE servicos
        SET placa_removida=%s, placa_veiculo_removido=%s, status=%s, atualizado_em=%s
        WHERE id=%s
    """, (placa, placa, novo_status, agora(), sid))
    registrar_evento(sid, "placa lançada", f"Placa: {placa}")
    return {"ok": True, "servico": servico_by_id(sid)}


@app.post("/api/servicos/{sid}/fotos")
async def enviar_fotos(sid: str, fotos: List[UploadFile] = File(default=[])):
    s = servico_by_id(sid)
    if not s:
        return JSONResponse({"ok": False, "erro": "Serviço não encontrado"}, status_code=404)

    salvas = []
    for foto in fotos:
        if not foto or not foto.filename:
            continue
        content = await foto.read()
        if not content:
            continue
        mime = foto.content_type or "image/jpeg"
        # Guarda no banco como Data URL para não depender do disco temporário do Render.
        data_url = f"data:{mime};base64,{base64.b64encode(content).decode('utf-8')}"
        r = db_execute("""
            INSERT INTO fotos (servico_id, url, nome_arquivo)
            VALUES (%s,%s,%s)
            RETURNING id, url, nome_arquivo
        """, (sid, data_url, foto.filename), fetchone=True)
        salvas.append({"id": str(r["id"]), "url": r["url"], "nome_arquivo": r["nome_arquivo"]})

    registrar_evento(sid, "fotos/checklist", f"Fotos adicionadas: {len(salvas)}")
    return {"ok": True, "fotos": salvas, "servico": servico_by_id(sid)}


@app.post("/api/servicos/{sid}/finalizar")
def finalizar_servico(sid: str):
    s = servico_by_id(sid)
    if not s:
        return JSONResponse({"ok": False, "erro": "Serviço não encontrado"}, status_code=404)
    db_execute("""
        UPDATE servicos
        SET status='finalizado', finalizado_em=now(), atualizado_em=%s
        WHERE id=%s
    """, (agora(), sid))
    registrar_evento(sid, "finalizado", "Serviço finalizado pelo motorista")
    return {"ok": True, "servico": servico_by_id(sid)}


@app.post("/api/servicos/{sid}/baixa")
async def baixar_servico(sid: str, placa_veiculo: str = Form(""), status: str = Form("finalizado"), fotos: List[UploadFile] = File(default=[])):
    if placa_veiculo:
        enviar_placa(sid, placa_veiculo)
    if fotos:
        await enviar_fotos(sid, fotos)
    if status == "finalizado":
        return finalizar_servico(sid)
    return {"ok": True, "servico": servico_by_id(sid)}


@app.get("/historico", response_class=HTMLResponse)
def historico(request: Request, inicio: str = "", fim: str = "", seguradora: str = "", tipo: str = "", motorista: str = ""):
    # Filtro simples por texto/data criada no banco.
    query = "SELECT * FROM servicos WHERE 1=1"
    params = []
    if seguradora:
        query += " AND seguradora ILIKE %s"
        params.append(f"%{seguradora}%")
    if tipo:
        query += " AND tipo ILIKE %s"
        params.append(f"%{tipo}%")
    if motorista:
        query += " AND motorista_nome ILIKE %s"
        params.append(f"%{motorista}%")
    query += " ORDER BY created_at DESC"
    servs = [normalizar_servico(r) for r in db_fetchall(query, tuple(params))]
    return templates.TemplateResponse("historico.html", {"request": request, "servicos": servs})


@app.get("/exportar")
def exportar():
    registros = []
    for s in listar_servicos():
        linha = dict(s)
        linha["fotos"] = ", ".join([f.get("nome_arquivo") or f.get("url", "")[:40] for f in s.get("fotos", [])])
        linha["historico"] = " | ".join([f"{h.get('data_hora')} - {h.get('status')} - {h.get('detalhe','')}" for h in s.get("historico", [])])
        registros.append(linha)

    df_servicos = pd.DataFrame(registros)
    df_motoristas = pd.DataFrame(listar_motoristas())

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df_servicos.to_excel(writer, index=False, sheet_name="Servicos")
        df_motoristas.to_excel(writer, index=False, sheet_name="Motoristas")
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=sistema_reboque_relatorio.xlsx"}
    )
