# Motor de arranque del CRM (lo invoca iniciar.bat)
#
# Arquitectura: DOS pods, DOS contenedores.
#   pod crm-frontend -> contenedor crm-frontend-app  (frontend SvelteKit)
#   pod crm-backend  -> contenedor crm-backend-app   (Web API + PostgreSQL juntos)
#
# - Arranca la maquina de Podman si no esta activa
# - Crea red y pods si faltan, y levanta los 2 contenedores
# - Abre la web del frontend y la documentacion OpenAPI
# - Se queda en primer plano hasta Ctrl+C o hasta cerrar la consola. En ambos
#   casos detiene TODOS los contenedores (al cerrar la consola lo hace un
#   watchdog externo que vigila este proceso).
param(
    [switch]$Build,        # Fuerza la reconstruccion de imagenes
    [switch]$SinNavegador, # No abre ninguna pestana del navegador
    [switch]$SinDocs,      # No abre la documentacion OpenAPI (solo el frontend)
    [switch]$SinWatchdog   # No lanza el watchdog (al cerrar la consola quedan arriba)
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

# El script se queda en primer plano. Ctrl+C pasa por el `finally` y detiene
# todo; el cierre de la consola lo cubre el watchdog. Ya no depende del navegador.

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "    $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "    $texto" -ForegroundColor Yellow }

# Nombres de los DOS contenedores (y de los pods). El sufijo -app evita que
# el nombre del contenedor coincida con el del pod: `podman inspect` con un
# nombre ambiguo devuelve un array y revienta el template del formato.
$contBackend  = 'crm-backend-app'
$contFrontend = 'crm-frontend-app'
$pods = @('crm-backend', 'crm-frontend')
$contenedores = @($contBackend, $contFrontend)

function Detener-Todo {
    Paso 'Eliminando contenedores y pods (hace falta recrearlos)'
    foreach ($c in $contenedores) {
        podman rm -f $c 2>$null | Out-Null
        Ok "Contenedor $c eliminado"
    }
    foreach ($p in $pods) {
        podman pod rm -f $p 2>$null | Out-Null
    }
    Ok 'Pods eliminados. Los datos (volumen crm-pgdata) se conservan.'
}

# Parada normal: NO elimina nada. Los contenedores quedan detenidos y el
# siguiente arranque los reutiliza tal cual (segundos en vez de minutos).
function Detener-Pods {
    Paso 'Deteniendo los contenedores del CRM'
    foreach ($p in $pods) {
        podman pod stop $p 2>$null | Out-Null
    }
    Ok 'Contenedores detenidos (no eliminados). Los datos siguen en crm-pgdata.'
}
# Watchdog externo: detecta que este script murio (Ctrl+C, X, taskkill, crash) y
# detiene los pods. Corre como proceso oculto APARTE, en su propia consola, asi
# sobrevive al cierre de esta ventana.
function Iniciar-Watchdog {
    param([int]$PidPadre, [string[]]$NombresPods)

    $lista = ($NombresPods | ForEach-Object { "'$_'" }) -join ', '
    $plantilla = @'
$padre = __PID__
while ($true) {
    Start-Sleep -Seconds 2
    if (-not (Get-Process -Id $padre -ErrorAction SilentlyContinue)) {
        foreach ($p in @(__PODS__)) { podman pod stop $p 2>$null | Out-Null }
        break
    }
}
'@
    $script = $plantilla.Replace('__PID__', "$PidPadre").Replace('__PODS__', $lista)
    $codificado = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($script))

    # Start-Process abre una consola propia (oculta): no comparte la de este
    # script, por eso el cierre de la ventana no lo mata.
    Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', $codificado) `
        -WindowStyle Hidden | Out-Null

    Ok 'Watchdog activo (cierre de consola = contenedores detenidos)'
}

# Huella del codigo: hash de rutas + tamano + fecha de modificacion. Se guarda
# como label de la imagen para decidir si hace falta reconstruir. Incluye la
# huella del propio script, porque los flags de `podman run` viven aca y
# cambiarlos obliga a recrear los contenedores aunque el codigo no cambie.
function Calcular-Huella {
    param([string]$carpeta, [string]$semilla)
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine($semilla)
    $archivos = Get-ChildItem -Path $carpeta -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '[\\/](node_modules|build|\.svelte-kit|tests)[\\/]' -and $_.Name -ne '.env' }
    foreach ($a in ($archivos | Sort-Object FullName)) {
        [void]$sb.AppendLine("$($a.FullName.ToLowerInvariant())|$($a.Length)|$($a.LastWriteTimeUtc.Ticks)")
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($sb.ToString())
        return (([BitConverter]::ToString($sha.ComputeHash($bytes))) -replace '-', '')
    } finally { $sha.Dispose() }
}

# Devuelve la huella guardada en la imagen, o $null si no existe / no tiene label.
function Huella-DeImagen {
    param([string]$imagen)
    try {
        $valor = podman image inspect -f '{{ index .Config.Labels "crm.huella" }}' $imagen 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $valor -or $valor -match '<no value>') { return $null }
        return $valor.Trim()
    } catch { return $null }
}

try {
    Paso 'Comprobando la maquina de Podman'
    $maquina = podman machine list --format "{{.Name}} {{.Running}}" 2>$null | Where-Object { $_ -match '^podman-machine-default' }
    if ($maquina -and $maquina -match 'true') {
        Ok 'Maquina de Podman en marcha'
    } else {
        Aviso 'Arrancando la maquina de Podman (puede tardar)...'
        podman machine start
        Ok 'Maquina iniciada'
    }

    Paso 'Revisando si hace falta reconstruir imagenes'
    # Se reconstruye solo si cambió el código (huella distinta a la de la
    # imagen). Si no cambió nada, se reutilizan las imágenes y el arranque es
    # de segundos.
    $huellaScript = (Get-FileHash -Path $PSCommandPath -Algorithm SHA256).Hash
    $huellaBackend = Calcular-Huella (Join-Path $raiz 'servidor') $huellaScript
    $huellaFrontend = Calcular-Huella (Join-Path $raiz 'cliente') $huellaScript

    $reconstruirBackend = (Huella-DeImagen 'crm-backend') -ne $huellaBackend
    $reconstruirFrontend = (Huella-DeImagen 'crm-frontend') -ne $huellaFrontend

    if ($reconstruirBackend) {
        podman build --label "crm.huella=$huellaBackend" -f ./servidor/Dockerfile.db -t crm-backend ./servidor | Out-Null
        Ok 'Imagen crm-backend reconstruida (Web API + PostgreSQL)'
    } else { Ok 'Imagen crm-backend sin cambios (se reutiliza)' }

    if ($reconstruirFrontend) {
        podman build --label "crm.huella=$huellaFrontend" -t crm-frontend ./cliente | Out-Null
        Ok 'Imagen crm-frontend reconstruida (frontend)'
    } else { Ok 'Imagen crm-frontend sin cambios (se reutiliza)' }

    Paso 'Revisando contenedores existentes'
    $podsActuales = podman pod ls --format '{{.Name}}' 2>$null
    $contenedoresActuales = podman ps -a --format '{{.Names}}' 2>$null
    $podsExisten = ($podsActuales -contains 'crm-backend') -and ($podsActuales -contains 'crm-frontend')
    $contenedoresExisten = ($contenedoresActuales -contains $contBackend) -and ($contenedoresActuales -contains $contFrontend)

    # Credenciales del host que se inyectan al contenedor (SMTP, sesion, Gmail).
    # servidor/.env esta en .dockerignore, asi que se lee aca y se pasa con -e.
    $envHost = @{}
    $rutaEnv = Join-Path $raiz 'servidor\.env'
    if (Test-Path $rutaEnv) {
        foreach ($linea in Get-Content $rutaEnv) {
            if ($linea -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
                $envHost[$Matches[1]] = $Matches[2].Trim()
            }
        }
    }

    $gmailClaves = @(
        'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REDIRECT_URI',
        'GMAIL_SYNC_INTERVALO_MINUTOS', 'GMAIL_PUBSUB_TOPIC', 'GMAIL_PUBSUB_SECRET'
    )

    # Solo se elimina y recrea cuando hay una imagen nueva (el código cambió) o
    # cuando falta el despliegue. Si nada cambió, se reutiliza tal cual.
    $hayQueRecrear = $reconstruirBackend -or $reconstruirFrontend -or (-not $podsExisten) -or (-not $contenedoresExisten)

    # Si cambian las credenciales de Gmail en servidor/.env tambien hay que
    # recrear: `podman pod start` reutiliza el entorno con el que se creo.
    if ($envHost['GMAIL_CLIENT_ID']) {
        $gmailActual = podman container inspect -f '{{range .Config.Env}}{{println .}}{{end}}' $contBackend 2>$null |
            Where-Object { $_ -like 'GMAIL_CLIENT_ID=*' } | Select-Object -First 1
        if ($gmailActual -ne "GMAIL_CLIENT_ID=$($envHost['GMAIL_CLIENT_ID'])") { $hayQueRecrear = $true }
    }

    if ($hayQueRecrear) {
        if ($podsExisten -or $contenedoresExisten) { Detener-Todo }
        else { Ok 'No hay despliegue previo: se crea desde cero' }

        Paso 'Creando red y pods'
        if ((podman network ls --format "{{.Name}}" 2>$null) -notcontains 'crm-net') {
            podman network create crm-net | Out-Null
            Ok 'Red crm-net creada'
        } else { Ok 'Red crm-net ya existe' }

        podman pod create --name crm-backend --network crm-net -p 8080:3000 -p 5433:5432 | Out-Null
        podman pod create --name crm-frontend --network crm-net -p 4173:4173 | Out-Null
        Ok 'Pods creados: crm-backend (API+BD) y crm-frontend (frontend)'

        # Ojo: `podman volume create` falla si el volumen ya existe, y con
        # $ErrorActionPreference='Stop' eso aborta el script. Comprobamos antes.
        if ((podman volume ls --format "{{.Name}}" 2>$null) -notcontains 'crm-pgdata') {
            podman volume create crm-pgdata | Out-Null
            Ok 'Volumen crm-pgdata creado'
        } else { Ok 'Volumen crm-pgdata ya existe (datos conservados)' }

        # Credenciales SMTP para el envio de correos (OTP de login).
        #
        # El .env esta en .dockerignore (correcto: no debe quedar dentro de la
        # imagen), asi que las credenciales solo existen en el host. Las leemos de
        # servidor/.env y las inyectamos en tiempo de ejecucion.
        #
        # Ojo: pasamos SOLO las SMTP_*. DATABASE_URL, BETTER_AUTH_URL, etc. ya
        # estan como ENV en el Dockerfile con los valores correctos para DENTRO
        # del pod (localhost:5432 y el frontend en :4173); el .env del host tiene
        # los de desarrollo (localhost:5433, :5173) y pisarlos romperia la BD.
        $argsSmtp = @()
        foreach ($clave in @('SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM')) {
            if ($envHost[$clave]) { $argsSmtp += @('-e', "$clave=$($envHost[$clave])") }
        }
        if ($argsSmtp.Count -gt 0) {
            Ok "SMTP configurado desde servidor/.env (host: $($envHost['SMTP_HOST']))"
        } else {
            Aviso 'Sin SMTP en servidor/.env: el login imprimira el OTP por consola (modo dev).'
        }

        # Secreto de sesion: el de .env manda sobre el placeholder del Dockerfile.
        # Es el que firma las cookies; si cambia, todas las sesiones se invalidan.
        $argsAuth = @()
        if ($envHost['BETTER_AUTH_SECRET']) {
            $argsAuth += @('-e', "BETTER_AUTH_SECRET=$($envHost['BETTER_AUTH_SECRET'])")
            Ok 'Secreto de sesion tomado de servidor/.env (cookies estables entre reinicios)'
        } else {
            throw 'Falta BETTER_AUTH_SECRET en servidor/.env. Es obligatorio: firma las cookies de sesion (32+ caracteres).'
        }

        # Clave maestra que cifra las contrasenas SMTP guardadas en la base.
        # Sin ella, las cuentas de correo no se pueden crear ni usar.
        if ($envHost['CORREO_CLAVE']) {
            $argsAuth += @('-e', "CORREO_CLAVE=$($envHost['CORREO_CLAVE'])")
            Ok 'Clave de cifrado de correo tomada de servidor/.env'
        } else {
            Aviso 'Sin CORREO_CLAVE en servidor/.env: no se podran guardar cuentas de correo.'
        }

        # Gmail API (OAuth). Sin CLIENT_ID/SECRET, Configuracion > Correo muestra
        # el aviso y "Conectar Gmail" queda deshabilitado.
        $argsGmail = @()
        foreach ($clave in $gmailClaves) {
            if ($envHost[$clave]) { $argsGmail += @('-e', "$clave=$($envHost[$clave])") }
        }
        if ($argsGmail.Count -gt 0) {
            Ok 'Gmail API configurada desde servidor/.env'
        } else {
            Aviso 'Sin GMAIL_CLIENT_ID/SECRET en servidor/.env: Conectar Gmail queda deshabilitado.'
        }

        Paso 'Lanzando el backend (Web API + PostgreSQL en un contenedor)'
        podman run -d --name $contBackend --pod crm-backend `
            -e POSTGRES_USER=crm -e POSTGRES_PASSWORD=crm -e POSTGRES_DB=crmdb `
            @argsSmtp `
            @argsAuth `
            @argsGmail `
            -v crm-pgdata:/var/lib/postgresql/data `
            crm-backend | Out-Null
        Ok "Contenedor $contBackend creado, esperando a que la API y la BD respondan..."

        Paso 'Lanzando el frontend'
        # La red crm-net resuelve el nombre del pod backend desde el frontend.
        # Se usa el puerto interno de la API, no el puerto publicado del host.
        podman run -d --name $contFrontend --pod crm-frontend `
            -e API_URL=http://crm-backend:3000 -e PORT=4173 -e HOST=0.0.0.0 `
            crm-frontend | Out-Null
        Ok "Contenedor $contFrontend creado, comprobando..."
    } else {
        Paso 'Iniciando contenedores existentes'
        # `pod start` levanta el pod con sus contenedores tal como fueron
        # creados: no se recrea nada ni se espera un build.
        podman pod start crm-backend 2>$null | Out-Null
        podman pod start crm-frontend 2>$null | Out-Null
        Ok 'Contenedores iniciados (sin reconstruir ni recrear)'
    }

    $apiOk = $false
    foreach ($i in 1..45) {
        try {
            $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/salud' -UseBasicParsing -TimeoutSec 5
            $datos = $r.Content | ConvertFrom-Json
            if ($r.StatusCode -eq 200 -and $datos.base_datos.conectada) { $apiOk = $true; break }
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $apiOk) { throw 'La API o PostgreSQL no llegaron a estar listos en el puerto 8080.' }
    Ok 'Web API + PostgreSQL respondiendo en http://127.0.0.1:8080'

    $feOk = $false
    foreach ($i in 1..30) {
        try {
            $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) { $feOk = $true; break }
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $feOk) { throw 'El frontend no respondio en el puerto 4173.' }
    Ok 'Frontend respondiendo en http://127.0.0.1:4173'

    Paso 'Comprobando la documentacion OpenAPI'
    $docsOk = $false
    foreach ($i in 1..20) {
        try {
            $d = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/docs' -UseBasicParsing -TimeoutSec 5
            $j = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/openapi.json' -UseBasicParsing -TimeoutSec 5
            if ($d.StatusCode -eq 200 -and $j.StatusCode -eq 200) { $docsOk = $true; break }
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $docsOk) { throw 'La documentacion OpenAPI no respondio ( /api/docs o /api/openapi.json ).' }
    Ok 'Swagger UI en http://127.0.0.1:8080/api/docs'
    Ok 'Especificacion JSON en http://127.0.0.1:8080/api/openapi.json'

    Write-Host "`n==============================================" -ForegroundColor Green
    Write-Host " CRM ARRANCADO (2 pods / 2 contenedores)" -ForegroundColor Green
    Write-Host " Frontend  : http://127.0.0.1:4173" -ForegroundColor White
    Write-Host " API       : http://127.0.0.1:8080/api/salud" -ForegroundColor White
    Write-Host " OpenAPI   : http://127.0.0.1:8080/api/docs" -ForegroundColor White
    Write-Host " PostgreSQL: localhost:5433 (db crmdb, user crm)" -ForegroundColor White
    Write-Host "==============================================" -ForegroundColor Green
    Write-Host "Se abren el frontend y la documentacion OpenAPI." -ForegroundColor Cyan
    Write-Host "`nPara detener TODO: Ctrl+C o cerra esta consola." -ForegroundColor Yellow
    Write-Host "   (si cerras la consola, el watchdog detiene los contenedores)`n" -ForegroundColor DarkYellow

    if (-not $SinNavegador) {
        # Abre la web del frontend y la documentacion OpenAPI de la API,
        # para que puedan visualizarse juntas.
        Start-Process 'http://127.0.0.1:4173'
        if (-not $SinDocs) { Start-Process 'http://127.0.0.1:8080/api/docs' }
    }

    # El watchdog cubre el cierre de la consola: al morir este proceso, otro
    # proceso oculto (en su propia consola) detiene los pods.
    if (-not $SinWatchdog) {
        Iniciar-Watchdog -PidPadre $PID -NombresPods $pods
    } else {
        Aviso 'Sin watchdog: si cerras la consola, los contenedores quedan arriba.'
    }

    Write-Host "`nCRM en marcha. Ctrl+C para detener.`n" -ForegroundColor Green

    # Se queda en primer plano: Ctrl+C corta el bucle y el `finally` detiene
    # todo de forma ordenada.
    while ($true) {
        Start-Sleep -Seconds 2

        # Si el frontend se cae solo, salimos igual (no tiene sentido seguir).
        $corriendo = podman container inspect -f '{{.State.Running}}' $contFrontend 2>$null
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
    Detener-Pods
    Write-Host "`nSesion finalizada. La proxima vez arranca en segundos (sin reconstruir)." -ForegroundColor Cyan
}
