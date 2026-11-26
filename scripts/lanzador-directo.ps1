<#
.SYNOPSIS
    Lanzador Directo: API + frontend del CRM sin contenedores Podman.
    SOLO DESARROLLO: usa los servidores de Vite, no artefactos compilados.

.DESCRIPTION
    Entorno de DESARROLLO. Para produccion usar iniciar.bat (Podman), que
    compila con `npm run build` y sirve con adapter-node.

    Levanta los dos proyectos como procesos Node locales:

        API       -> servidor  (SvelteKit)  http://127.0.0.1:8080
        Frontend  -> cliente   (SvelteKit)  http://127.0.0.1:5173

    No construye imagenes, no crea pods y no toca Podman. Usa el PostgreSQL
    nativo que ya este corriendo en el host.

    Toda la configuracion (credenciales de PostgreSQL, puertos, Better Auth y
    SMTP) vive en un unico archivo en la raiz: `lanzador-directo.env`. Sus
    valores se inyectan en el entorno de los dos procesos y pisan lo que
    declaren `servidor/.env` y `cliente/.env` (Vite aplica process.env al
    final, por lo que gana el lanzador).

    Los puertos no son arbitrarios: API_URL apunta a 8080 y BETTER_AUTH_URL /
    TRUSTED_ORIGINS declaran el frontend en 5173.

.PARAMETER SinNavegador
    No abre el navegador al terminar el arranque.

.PARAMETER SinDocs
    Abre solo el frontend (no la documentacion OpenAPI).

.PARAMETER Instalar
    Fuerza npm install en cliente y servidor aunque exista node_modules.

.EXAMPLE
    .\scripts\lanzador-directo.ps1

.EXAMPLE
    .\scripts\lanzador-directo.ps1 -SinNavegador
#>
param(
    [switch]$SinNavegador,
    [switch]$SinDocs,
    [switch]$Instalar
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$rutaConfig = Join-Path $raiz 'lanzador-directo.env'
$PuertoApi = 8080
$PuertoWeb = 5173
$carpetaApi = Join-Path $raiz 'servidor'
$carpetaWeb = Join-Path $raiz 'cliente'
$carpetaLogs = Join-Path $raiz '.lanzador'
$logApi = Join-Path $carpetaLogs 'api.log'
$logApiErr = Join-Path $carpetaLogs 'api.err.log'
$logWeb = Join-Path $carpetaLogs 'frontend.log'
$logWebErr = Join-Path $carpetaLogs 'frontend.err.log'

$procesoApi = $null
$procesoWeb = $null

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "    $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "    $texto" -ForegroundColor Yellow }
function Falla($texto) { Write-Host "    $texto" -ForegroundColor Red }

# Lee un .env sin dependencias: KEY=VALUE, ignora comentarios y comillas.
function Leer-Env([string]$ruta) {
    $valores = @{}
    if (-not (Test-Path $ruta)) { return $valores }
    foreach ($linea in Get-Content $ruta) {
        if ($linea -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $valores[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    return $valores
}

# Prueba TCP pura: no requiere que el servicio hable HTTP.
function Probar-Puerto([string]$servidor, [int]$puerto, [int]$esperaMs = 1500) {
    $cliente = New-Object System.Net.Sockets.TcpClient
    try {
        $tarea = $cliente.ConnectAsync($servidor, $puerto)
        if (-not $tarea.Wait($esperaMs)) { return $false }
        return $cliente.Connected
    } catch {
        return $false
    } finally {
        $cliente.Dispose()
    }
}

function Puerto-Ocupado([int]$puerto) {
    $conexiones = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue
    return [bool]$conexiones
}

function Mostrar-Log([string]$ruta, [string]$titulo) {
    if (-not (Test-Path $ruta)) { return }
    $lineas = Get-Content $ruta -Tail 25 -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $lineas) { return }
    Write-Host "`n--- ultimas lineas de $titulo ---" -ForegroundColor DarkYellow
    $lineas | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
}

function Detener-Proceso($proceso) {
    if ($null -eq $proceso) { return }
    try {
        if (-not $proceso.HasExited) {
            # /T mata tambien los hijos (vite, esbuild, node del server).
            taskkill /PID $proceso.Id /T /F 2>$null | Out-Null
        }
    } catch {
        # El proceso ya murio: nada que hacer.
    }
}

# Vigilante externo: si esta consola se cierra con la X, mata los dos arboles.
function Iniciar-Vigilante([int]$PidPadre, [int[]]$PidsHijos) {
    $lista = ($PidsHijos | Where-Object { $_ -gt 0 }) -join ','
    if (-not $lista) { return }

    $plantilla = @'
$padre = __PID__
while ($true) {
    Start-Sleep -Seconds 2
    if (-not (Get-Process -Id $padre -ErrorAction SilentlyContinue)) {
        foreach ($h in @(__HIJOS__)) { taskkill /PID $h /T /F 2>$null | Out-Null }
        break
    }
}
'@
    $script = $plantilla.Replace('__PID__', "$PidPadre").Replace('__HIJOS__', $lista)
    $codificado = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($script))

    Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', $codificado) `
        -WindowStyle Hidden | Out-Null
}

function Esperar-Http([string]$url, $proceso, [string]$nombre, [string]$logError, [int]$intentos = 60, [switch]$CualquierEstado) {
    for ($i = 1; $i -le $intentos; $i++) {
        if ($proceso -and $proceso.HasExited) {
            Falla "$nombre termino solo (codigo $($proceso.ExitCode))."
            Mostrar-Log $logError $nombre
            return $false
        }
        try {
            $respuesta = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
            if ($CualquierEstado -or ($respuesta.StatusCode -ge 200 -and $respuesta.StatusCode -lt 400)) { return $true }
        } catch {
            # Un 5xx tambien prueba que el proceso escucha: si se pidio
            # -CualquierEstado, el diagnostico lo da el chequeo siguiente.
            if ($CualquierEstado -and $_.Exception.Response) { return $true }
        }
        Start-Sleep -Milliseconds 1000
    }
    Falla "$nombre no respondio en $url despues de $intentos segundos."
    Mostrar-Log $logError $nombre
    return $false
}

try {
    Write-Host "`n==============================================" -ForegroundColor Cyan
    Write-Host " CRM - LANZADOR DIRECTO (SOLO DESARROLLO)" -ForegroundColor Cyan
    Write-Host "==============================================" -ForegroundColor Cyan

    Paso 'Comprobando Node y npm'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'No se encontro Node.js en el PATH.' }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'No se encontro npm en el PATH.' }
    $versionNode = (node --version).TrimStart('v')
    $mayorNode = [int]($versionNode.Split('.')[0])
    if ($mayorNode -lt 20) { throw "Node $versionNode es demasiado viejo: se requiere 20 o superior." }
    Ok "Node v$versionNode / npm $((npm.cmd --version).Trim())"

    Paso 'Comprobando proyectos'
    foreach ($carpeta in @($carpetaApi, $carpetaWeb)) {
        if (-not (Test-Path (Join-Path $carpeta 'package.json'))) { throw "Falta package.json en $carpeta" }
    }
    Ok 'servidor y cliente encontrados'

    Paso 'Leyendo la configuracion unica'
    if (-not (Test-Path $rutaConfig)) {
        throw 'Falta lanzador-directo.env en la raiz. Crea el archivo con DATABASE_URL, BETTER_AUTH_SECRET, API_URL y los puertos.'
    }
    $config = Leer-Env $rutaConfig
    if (-not $config['DATABASE_URL']) { throw 'lanzador-directo.env no define DATABASE_URL.' }
    if (-not $config['BETTER_AUTH_SECRET']) { throw 'lanzador-directo.env no define BETTER_AUTH_SECRET.' }

    if ($config['PUERTO_API'] -match '^\d+$') { $PuertoApi = [int]$config['PUERTO_API'] }
    if ($config['PUERTO_WEB'] -match '^\d+$') { $PuertoWeb = [int]$config['PUERTO_WEB'] }

    # Se copian SOLO estas claves al entorno de los procesos hijos. Iterar todo
    # el archivo permitiria pisar variables del sistema como PATH.
    $clavesEntorno = @(
        'DATABASE_URL', 'API_URL', 'BETTER_AUTH_URL', 'BETTER_AUTH_SECRET', 'CORREO_CLAVE',
        'TRUSTED_ORIGINS', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
        'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REDIRECT_URI',
        'GMAIL_SYNC_INTERVALO_MINUTOS', 'GMAIL_PUBSUB_TOPIC', 'GMAIL_PUBSUB_SECRET'
    )
    foreach ($clave in $clavesEntorno) {
        if ($config.ContainsKey($clave)) {
            [Environment]::SetEnvironmentVariable($clave, $config[$clave], 'Process')
        }
    }
    Ok "Configuracion aplicada desde lanzador-directo.env ($($clavesEntorno.Count) claves)"

    $urlApi = if ($config['API_URL']) { $config['API_URL'] } else { "http://localhost:$PuertoApi" }
    $uriBase = [System.Uri]$urlApi
    if ($uriBase.Port -ne $PuertoApi) {
        Aviso "API_URL apunta a $urlApi pero la API se levantara en el puerto $PuertoApi."
        Aviso 'Ajusta API_URL o PUERTO_API en lanzador-directo.env.'
    }
    Ok "API_URL del frontend: $urlApi"

    if (-not $config['SMTP_HOST']) {
        Aviso 'SMTP vacio: el OTP de login se imprime en la consola de la API (modo dev).'
    }

    Paso 'Verificando PostgreSQL'
    $uriDb = [System.Uri]$config['DATABASE_URL']
    $hostDb = $uriDb.Host
    $puertoDb = if ($uriDb.Port -gt 0) { $uriDb.Port } else { 5432 }
    if (Probar-Puerto $hostDb $puertoDb 2000) {
        Ok "PostgreSQL responde en ${hostDb}:${puertoDb}"
    } else {
        Falla "No hay PostgreSQL escuchando en ${hostDb}:${puertoDb}."
        Write-Host ''
        Aviso 'El Lanzador Directo no levanta la base: no usa contenedores.'
        Aviso 'Opciones:'
        Aviso '  1) Iniciar el servicio local de PostgreSQL en ese puerto.'
        Aviso '  2) Ajustar DATABASE_URL en lanzador-directo.env al host/puerto donde corre.'
        Aviso '  3) Si la base vive en Podman, este lanzador no aplica: usa iniciar.bat.'
        throw "PostgreSQL no disponible en ${hostDb}:${puertoDb}"
    }

    Paso 'Comprobando puertos libres'
    foreach ($par in @(@($PuertoApi, 'API'), @($PuertoWeb, 'frontend'))) {
        if (Puerto-Ocupado $par[0]) {
            throw "El puerto $($par[0]) ($($par[1])) ya esta en uso. Cerra el proceso que lo ocupa y reintenta."
        }
    }
    Ok "Puertos $PuertoApi y $PuertoWeb libres"

    Paso 'Comprobando dependencias'
    $necesitaApi = $Instalar -or -not (Test-Path (Join-Path $carpetaApi 'node_modules'))
    $necesitaWeb = $Instalar -or -not (Test-Path (Join-Path $carpetaWeb 'node_modules'))

    if ($necesitaApi) {
        Aviso 'Instalando dependencias de servidor (puede tardar)...'
        Push-Location $carpetaApi
        try { npm.cmd install --no-audit --no-fund } finally { Pop-Location }
        Ok 'servidor listo'
    } else { Ok 'servidor: node_modules presente' }

    if ($necesitaWeb) {
        Aviso 'Instalando dependencias de cliente (puede tardar)...'
        Push-Location $carpetaWeb
        try { npm.cmd install --no-audit --no-fund } finally { Pop-Location }
        Ok 'cliente listo'
    } else { Ok 'cliente: node_modules presente' }

    if (-not (Test-Path $carpetaLogs)) { New-Item -ItemType Directory -Path $carpetaLogs | Out-Null }
    Remove-Item $logApi, $logApiErr, $logWeb, $logWebErr -ErrorAction SilentlyContinue

    Paso "Levantando la API en el puerto $PuertoApi"
    $procesoApi = Start-Process -FilePath 'npm.cmd' `
        -ArgumentList @('run', 'dev', '--', '--port', "$PuertoApi", '--strictPort', '--host', '127.0.0.1') `
        -WorkingDirectory $carpetaApi `
        -RedirectStandardOutput $logApi -RedirectStandardError $logApiErr `
        -PassThru -WindowStyle Hidden
    Ok "API iniciada (PID $($procesoApi.Id)). Aplica migraciones al arrancar."

    Paso 'Esperando la API y la base de datos'
    $apiLista = Esperar-Http "http://127.0.0.1:$PuertoApi/api/salud" $procesoApi 'API' $logApiErr 90 -CualquierEstado
    if (-not $apiLista) { throw 'La API no quedo operativa.' }

    # /api/salud responde 503 cuando la API vive pero PostgreSQL rechaza la
    # conexion: ese caso se informa al instante, sin esperar el timeout.
    try {
        $salud = (Invoke-WebRequest -Uri "http://127.0.0.1:$PuertoApi/api/salud" -UseBasicParsing -TimeoutSec 10).Content | ConvertFrom-Json
    } catch {
        $respuesta = $_.Exception.Response
        if (-not $respuesta) { throw }
        $lector = New-Object System.IO.StreamReader($respuesta.GetResponseStream())
        try { $salud = $lector.ReadToEnd() | ConvertFrom-Json } finally { $lector.Dispose() }
    }
    if (-not $salud.base_datos -or -not $salud.base_datos.conectada) {
        $detalle = if ($salud.base_datos.error) { $salud.base_datos.error } else { 'la API no pudo consultar la base (ver log de la API)' }
        Falla "La API responde pero PostgreSQL rechaza la conexion: $detalle"
        Aviso 'Revisa DATABASE_URL en lanzador-directo.env (usuario, contrasena y base).'
        Aviso 'Si el rol o la base no existen, crealos una vez con psql como superusuario:'
        Aviso '  CREATE ROLE crm LOGIN PASSWORD ''...'';'
        Aviso '  CREATE DATABASE crmdb OWNER crm;'
        throw 'PostgreSQL no acepto la conexion de la API.'
    }
    Ok 'API operativa con PostgreSQL conectado (migraciones aplicadas)'

    Paso "Levantando el frontend en el puerto $PuertoWeb"
    $procesoWeb = Start-Process -FilePath 'npm.cmd' `
        -ArgumentList @('run', 'dev', '--', '--port', "$PuertoWeb", '--strictPort', '--host', '127.0.0.1') `
        -WorkingDirectory $carpetaWeb `
        -RedirectStandardOutput $logWeb -RedirectStandardError $logWebErr `
        -PassThru -WindowStyle Hidden
    Ok "Frontend iniciado (PID $($procesoWeb.Id))"

    Paso 'Esperando el frontend'
    $webLista = Esperar-Http "http://127.0.0.1:$PuertoWeb/" $procesoWeb 'frontend' $logWebErr 90
    if (-not $webLista) { throw 'El frontend no quedo operativo.' }
    Ok "Frontend respondiendo en http://127.0.0.1:$PuertoWeb"

    Write-Host "`n==============================================" -ForegroundColor Green
    Write-Host " CRM ARRANCADO - DESARROLLO (Vite, sin Podman)" -ForegroundColor Green
    Write-Host " Frontend  : http://localhost:$PuertoWeb" -ForegroundColor White
    Write-Host " API       : http://localhost:$PuertoApi/api/salud" -ForegroundColor White
    Write-Host " OpenAPI   : http://localhost:$PuertoApi/api/docs" -ForegroundColor White
    Write-Host " PostgreSQL: ${hostDb}:${puertoDb}" -ForegroundColor White
    Write-Host " Logs      : $carpetaLogs" -ForegroundColor White
    Write-Host "==============================================" -ForegroundColor Green
    Write-Host "Para detener TODO: Ctrl+C o cerra esta consola." -ForegroundColor Yellow

    if (-not $SinNavegador) {
        Start-Process "http://localhost:$PuertoWeb"
        if (-not $SinDocs) { Start-Process "http://localhost:$PuertoApi/api/docs" }
    }

    Iniciar-Vigilante -PidPadre $PID -PidsHijos @($procesoApi.Id, $procesoWeb.Id)
    Write-Host "`nCRM en marcha. Ctrl+C para detener.`n" -ForegroundColor Green

    while ($true) {
        Start-Sleep -Seconds 2
        if ($procesoApi.HasExited) {
            Write-Host "`nLa API dejo de correr." -ForegroundColor Yellow
            Mostrar-Log $logApiErr 'API'
            break
        }
        if ($procesoWeb.HasExited) {
            Write-Host "`nEl frontend dejo de correr." -ForegroundColor Yellow
            Mostrar-Log $logWebErr 'frontend'
            break
        }
    }
} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Mostrar-Log $logApiErr 'API'
    Mostrar-Log $logWebErr 'frontend'
} finally {
    Paso 'Deteniendo los procesos del CRM'
    Detener-Proceso $procesoWeb
    Detener-Proceso $procesoApi
    Ok 'Procesos detenidos'
}
