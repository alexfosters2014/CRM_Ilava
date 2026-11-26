@echo off
title CRM - Lanzador Directo (SOLO DESARROLLO)
cd /d "%~dp0"
echo.
echo ============================================
echo  CRM: Lanzador Directo - SOLO DESARROLLO
echo ============================================
echo.
echo  - API y frontend corren como procesos Node (vite dev).
echo  - PostgreSQL debe estar iniciado en Windows.
echo  - Configuracion unica: lanzador-directo.env
echo.
echo  NO usar para produccion: para produccion, iniciar.bat (Podman).
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\lanzador-directo.ps1" %*
echo.
pause
