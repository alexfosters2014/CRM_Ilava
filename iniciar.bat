@echo off
title CRM - CONTENEDORES (Docker)
cd /d "%~dp0"
echo.
echo ============================================
echo  CRM: CONTENEDORES (Docker)
echo ============================================
echo.
echo  - Backend: API + PostgreSQL en un contenedor.
echo  - Frontend: SvelteKit en otro contenedor.
echo  - Docker reutiliza las capas de build: solo
echo    reconstruye lo que cambio (los datos se conservan).
echo.
echo  Modos:
echo    iniciar.bat        - produccion (build compilado)
echo    iniciar.bat -Dev   - desarrollo (Vite + HMR)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\levantar.ps1" %*
echo.
pause
