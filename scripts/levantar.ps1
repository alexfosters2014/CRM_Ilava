# Motor de arranque del CRM (lo invoca iniciar.bat)
#
# Arquitectura: DOS contenedores Docker.
#   crm-backend  -> Web API + PostgreSQL + Chromium en una sola imagen
#   crm-frontend -> frontend SvelteKit
#
# - Comprueba que Docker Desktop responda
# - Valida servidor/.env (BETTER_AUTH_SECRET obligatorio, sin default publico)
# - Construye y levanta los dos contenedores
# - Espera a la API (/api/salud), al frontend y a la documentacion OpenAPI
# - Se queda en primer plano: Ctrl+C detiene los contenedores (no los elimina)
param(
    [switch]$Build,        # Fuerza la reconstruccion sin cache
    [switch]$SinNavegador, # No abre ninguna pestana del navegador
    [switch]$SinDocs,      # No abre la documentacion OpenAPI (solo el frontend)
    [switch]$SinWatchdog,  # No lanza el watchdog (al cerrar la consola quedan arriba)
    [switch]$Dev           # Modo desarrollo: Vite con HMR en vez del build compilado
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$composeBackend = Join-Path $raiz 'infra\compose-backend.yml'
$composeFrontend = Join-Path $raiz 'infra\compose-frontend.yml'
$composeBackendDev = Join-Path $raiz 'infra\compose-backend.dev.yml'
$composeFrontendDev = Join-Path $raiz 'infra\compose-frontend.dev.yml'
$archivoEnv = Join-Path $raiz 'servidor\.env'
$contBackend = 'crm-backend'
$contFrontend = 'crm-frontend'

# Los overlays solo cambian `build.target` a `dev` y montan el codigo. Los
# archivos base siguen siendo la unica definicion de red, volumenes, puertos y
# variables: por eso desarrollo y produccion no pueden divergir.
$overlaysBackend = @()
$overlaysFrontend = @()
if ($Dev) {
    $overlaysBackend = @('-f', $composeBackendDev)
    $overlaysFrontend = @('-f', $composeFrontendDev)
}
$cmdBackend = @('compose', '--env-file', $archivoEnv, '-f', $composeBackend) + $overlaysBackend
$cmdFrontend = @('compose', '-f', $composeFrontend) + $overlaysFrontend

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "    $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "    $texto" -ForegroundColor Yellow }

# Docker Desktop per-user puede no estar en el PATH de la sesion que abrio el
# .bat. Se busca el ejecutable y se agrega al PATH de este proceso.
function Buscar-Docker {
    $cmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidatos = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
    )
    foreach ($c in $candidatos) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

# Parada normal: NO elimina nada. Los contenedores quedan detenidos y el
# siguiente arranque los reutiliza; los volumenes conservan los datos.
function Detener-Todo {
    Paso 'Deteniendo contenedores'
    & docker stop $contFrontend $contBackend 2>$null | Out-Null
    Ok 'Contenedores detenidos. Los datos siguen en crm-pgdata y crm-wa-auth.'
}

# Watchdog externo: detecta que este script murio (Ctrl+C, X, taskkill, crash)
# y detiene los contenedores. Corre como proceso oculto APARTE, en su propia
# consola, asi sobrevive al cierre de esta ventana.
function Iniciar-Watchdog {
    param([int]$PidPadre)

    $plantilla = @'
$padre = __PID__
while ($true) {
    Start-Sleep -Seconds 2
    if (-not (Get-Process -Id $padre -ErrorAction SilentlyContinue)) {
        docker stop __CONTENEDORES__ 2>$null | Out-Null
        break
    }
}
'@
    $script = $plantilla.Replace('__PID__', "$PidPadre").Replace('__CONTENEDORES__', "$contFrontend $contBackend")
    $codificado = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($script))

    Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', $codificado) `
        -WindowStyle Hidden | Out-Null

    Ok 'Watchdog activo (cierre de consola = contenedores detenidos)'
}

# Espera a que una URL responda con HTTP 200.
function Esperar-Url {
    param([string]$Url, [int]$Intentos, [scriptblock]$Condicion)
    foreach ($i in 1..$Intentos) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200 -and (-not $Condicion -or (& $Condicion $r))) { return $r }
        } catch { }
        Start-Sleep -Seconds 2
    }
    return $null
}

try {
    $docker = Buscar-Docker
    if (-not $docker) {
        throw 'No se encontro docker.exe. Instala Docker Desktop y reabri la consola.'
    }
    $dockerDir = Split-Path $docker -Parent
    if (($env:PATH -split ';') -notcontains $dockerDir) {
        $env:PATH = "$dockerDir;$env:PATH"
    }

    Paso 'Comprobando el motor de Docker'
    & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Desktop no esta corriendo. Abri Docker Desktop y volve a intentar.'
    }
    $version = (& docker version --format '{{.Server.Version}}' 2>$null)
    Ok "Docker $version respondiendo"
    if ($Dev) {
        Ok 'Modo: DESARROLLO (Vite con HMR, codigo montado desde el anfitrion)'
    } else {
        Ok 'Modo: PRODUCCION (artefacto compilado, imagen inmutable)'
    }

    # Red compartida por los dos proyectos de compose. Es externa para que
    # bajar uno no corte la red del otro.
    & docker network inspect crm-net 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        & docker network create crm-net | Out-Null
        Ok 'Red crm-net creada'
    } else {
        Ok 'Red crm-net ya existe'
    }

    Paso 'Revisando servidor/.env'
    if (-not (Test-Path $archivoEnv)) {
        throw 'Falta servidor/.env. Copia servidor/.env.example y completa las credenciales.'
    }
    $envHost = @{}
    foreach ($linea in Get-Content $archivoEnv) {
        if ($linea -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $envHost[$Matches[1]] = $Matches[2].Trim()
        }
    }
    if (-not $envHost['BETTER_AUTH_SECRET']) {
        throw 'servidor/.env no define BETTER_AUTH_SECRET: firma las cookies de sesion y es obligatorio.'
    }
    Ok 'Credenciales cargadas desde servidor/.env'
    if (-not $envHost['SMTP_HOST']) {
        Aviso 'Sin SMTP en servidor/.env: el OTP de login se imprime en docker logs crm-backend.'
    }

    # Docker fija las variables al CREAR el contenedor: si editas servidor/.env
    # y solo haces `up`, el contenedor sigue con los valores viejos. Se compara
    # el hash del archivo para forzar la recreacion cuando cambio algo.
    $hashEnv = (Get-FileHash -Path $archivoEnv -Algorithm SHA256).Hash
    $archivoHash = Join-Path $raiz 'infra\.env.hash'
    $hashPrevio = if (Test-Path $archivoHash) { (Get-Content $archivoHash -Raw).Trim() } else { '' }
    $recrearPorEnv = $hashPrevio -ne $hashEnv
    if ($recrearPorEnv -and $hashPrevio) {
        Aviso 'servidor/.env cambio: se recrea el contenedor para inyectar las variables nuevas.'
    }

    if ($Build) {
        Paso 'Reconstruyendo imagenes sin cache'
        & docker @cmdBackend build --no-cache
        if ($LASTEXITCODE -ne 0) { throw 'Fallo la construccion del backend.' }
        & docker @cmdFrontend build --no-cache
        if ($LASTEXITCODE -ne 0) { throw 'Fallo la construccion del frontend.' }
        Ok 'Imagenes reconstruidas'
    }

    Paso 'Levantando el backend (API + PostgreSQL en un contenedor)'
    $argsBackend = $cmdBackend + @('up', '-d', '--build')
    if ($recrearPorEnv) { $argsBackend += '--force-recreate' }
    & docker @argsBackend
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el arranque del backend.' }
    # Solo se registra el hash si el arranque salio bien.
    Set-Content -Path $archivoHash -Value $hashEnv -NoNewline
    Ok "Contenedor $contBackend creado"

    Paso 'Esperando a la API y a PostgreSQL'
    $r = Esperar-Url -Url 'http://127.0.0.1:8080/api/salud' -Intentos 90 -Condicion {
        param($respuesta)
        $datos = $respuesta.Content | ConvertFrom-Json
        $datos.base_datos.conectada -eq $true
    }
    if (-not $r) { throw 'La API o PostgreSQL no respondieron en 8080. Revisa: docker logs crm-backend' }
    Ok 'Web API + PostgreSQL respondiendo en http://127.0.0.1:8080'

    Paso 'Levantando el frontend'
    & docker @cmdFrontend up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el arranque del frontend.' }
    Ok "Contenedor $contFrontend creado"

    $r = Esperar-Url -Url 'http://127.0.0.1:4173/' -Intentos 45
    if (-not $r) { throw 'El frontend no respondio en el puerto 4173. Revisa: docker logs crm-frontend' }
    Ok 'Frontend respondiendo en http://127.0.0.1:4173'

    Paso 'Comprobando la documentacion OpenAPI'
    $docs = Esperar-Url -Url 'http://127.0.0.1:8080/api/docs' -Intentos 20
    $json = Esperar-Url -Url 'http://127.0.0.1:8080/api/openapi.json' -Intentos 20
    if ($docs -and $json) {
        Ok 'Swagger UI en http://127.0.0.1:8080/api/docs'
        Ok 'Especificacion JSON en http://127.0.0.1:8080/api/openapi.json'
    } else {
        Aviso 'La documentacion OpenAPI no respondio todavia (no bloquea el arranque).'
    }

    Write-Host "`n==============================================" -ForegroundColor Green
    Write-Host ' CRM ARRANCADO (2 contenedores)' -ForegroundColor Green
    Write-Host ' Frontend  : http://127.0.0.1:4173' -ForegroundColor White
    Write-Host ' API       : http://127.0.0.1:8080/api/salud' -ForegroundColor White
    Write-Host ' OpenAPI   : http://127.0.0.1:8080/api/docs' -ForegroundColor White
    Write-Host ' PostgreSQL: localhost:5433 (db crmdb)' -ForegroundColor White
    Write-Host '==============================================' -ForegroundColor Green
    Write-Host "`nPara detener TODO: Ctrl+C o cerra esta consola." -ForegroundColor Yellow
    Write-Host '   (si cerras la consola, el watchdog detiene los contenedores)' -ForegroundColor DarkYellow

    if (-not $SinNavegador) {
        Start-Process 'http://127.0.0.1:4173'
        if (-not $SinDocs) { Start-Process 'http://127.0.0.1:8080/api/docs' }
    }

    if (-not $SinWatchdog) {
        Iniciar-Watchdog -PidPadre $PID
    } else {
        Aviso 'Sin watchdog: si cerras la consola, los contenedores quedan arriba.'
    }

    Write-Host "`nCRM en marcha. Ctrl+C para detener.`n" -ForegroundColor Green

    # Se queda en primer plano: Ctrl+C corta el bucle y el `finally` detiene
    # todo de forma ordenada.
    while ($true) {
        Start-Sleep -Seconds 2

        # Si el frontend se cae solo, salimos igual (no tiene sentido seguir).
        $corriendo = & docker inspect -f '{{.State.Running}}' $contFrontend 2>$null
        if ($corriendo -ne 'true') {
            Write-Host "`nEl contenedor del frontend ha dejado de correr." -ForegroundColor Yellow
            break
        }
    }
}
catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Detener-Todo
    Write-Host "`nSesion finalizada. La proxima vez arranca mas rapido (imagenes ya construidas)." -ForegroundColor Cyan
}
