@echo off
pip install -r requirements.txt
echo.
echo Backend em http://0.0.0.0:8000 — celular usa http://192.168.0.97:8000
echo Se o iPhone nao conectar, execute liberar_firewall_8000.bat como Administrador.
echo.
uvicorn app:app --reload --host 0.0.0.0 --port 8000
pause
