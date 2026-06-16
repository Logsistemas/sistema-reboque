@echo off
echo Liberando porta 8000 no Firewall do Windows (backend Essencia)...
netsh advfirewall firewall delete rule name="Essencia Backend 8000" >nul 2>&1
netsh advfirewall firewall add rule name="Essencia Backend 8000" dir=in action=allow protocol=TCP localport=8000
if %errorlevel% equ 0 (
  echo OK — iPhone/celular na mesma Wi-Fi pode acessar http://192.168.0.97:8000
) else (
  echo FALHA — clique com botao direito neste arquivo e escolha "Executar como administrador".
)
pause
