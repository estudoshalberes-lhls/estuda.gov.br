@echo off
chcp 65001 >nul
title estuda.gov.br - Modo Portatil 100%% Offline
cd /d "%~dp0"

echo ====================================================================
echo   estuda.gov.br - Inicializador Portatil 100%% Offline (Opcao 2)
echo   Pasta de dados automatica: %~dp0Dados_Estudo_Local
echo ====================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERRO] Node.js nao encontrado neste computador.
  echo Instale o Node.js LTS uma unica vez em https://nodejs.org e tente novamente.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] Instalando pacotes locais na primeira execucao...
  call npm install
)

if not exist "dist\index.html" (
  echo [2/2] Compilando interface para execucao 100%% offline...
  call npm run build
)

if not exist "Dados_Estudo_Local" (
  mkdir "Dados_Estudo_Local"
)

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>nul
if %errorlevel% neq 0 (
  echo Iniciando motor local e gravacao automatica em disco...
  start "EstudaGov_Motor_Offline" /min cmd /c "set NODE_ENV=production&& set LOCAL_OFFLINE_MODE=true&& set PORT=3000&& npx tsx server.ts"
  timeout /t 2 /nobreak >nul
) else (
  echo Motor local ja esta em execucao na porta 3000.
)

where msedge >nul 2>nul
if %errorlevel%==0 (
  start "" msedge --app=http://localhost:3000 --new-window
  exit /b 0
)

where chrome >nul 2>nul
if %errorlevel%==0 (
  start "" chrome --app=http://localhost:3000 --new-window
  exit /b 0
)

start "" http://localhost:3000
exit /b 0
