@echo off
title CRM - PRODUCCION (Podman)
cd /d "%~dp0"
echo.
echo ============================================
echo  CRM: PRODUCCION (Podman)
echo ============================================
echo.
echo  - Compila con npm run build y sirve con adapter-node.
echo  - Si el codigo no cambio, reutiliza las imagenes
echo    y solo inicia los contenedores detenidos.
echo  - Si el codigo cambio, reconstruye y recrea solo
echo    lo necesario (los datos se conservan).
echo.
echo  Para desarrollo usar lanzador-directo.bat.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\levantar.ps1" %*
echo.
pause
