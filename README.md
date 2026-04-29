# Sistema Interno de Reboque — V7 Supabase

Versão com banco PostgreSQL/Supabase.

## Render
Build:
pip install -r requirements.txt

Start:
uvicorn app:app --host 0.0.0.0 --port 10000

## Variável obrigatória
DATABASE_URL=postgresql://postgres:SENHA@db.xxxxx.supabase.co:5432/postgres