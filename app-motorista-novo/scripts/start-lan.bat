@echo off
REM Essencia Motorista — Expo SDK 54 (requer Node >= 20.19.4)
cd /d "%~dp0.."

for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo Node detectado: %NODEV%
echo Requerido: v20.19.4 ou superior para Expo SDK 54

set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.0.97
set EXPO_PUBLIC_API_BASE=http://192.168.0.97:8000

call npm install
if errorlevel 1 exit /b 1

call npx expo install --fix
if errorlevel 1 exit /b 1

call npx expo-doctor
call npx expo start --host lan --port 8082
