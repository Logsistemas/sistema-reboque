# Sistema Interno de Reboque — V8 Supabase

Versão com Supabase/PostgreSQL, fluxo corrigido de placa, fotos/checklist e finalização.

## Render
Build command:
```bash
pip install -r requirements.txt
```
Start command:
```bash
uvicorn app:app --host 0.0.0.0 --port 10000
```

Variável necessária:
```text
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres
```
