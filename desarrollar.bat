@echo off
title CRM - DESARROLLO (Docker + HMR)
cd /d "%~dp0"
echo.
echo ============================================
echo  CRM: DESARROLLO (Vite + HMR en Docker)
echo ============================================
echo.
echo  - Backend: API + PostgreSQL en un contenedor.
echo  - Frontend: Vite con recarga en caliente.
echo  - Editar un archivo del proyecto recarga la app.
echo.
echo  Misma red, puertos y variables que produccion.
echo  Para produccion usar iniciar.bat.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\levantar.ps1" -Dev %*
echo.
pause
