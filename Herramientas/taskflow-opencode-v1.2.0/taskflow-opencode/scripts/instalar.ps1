param([switch]$SinRegistrar)
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $PSScriptRoot
$configDir = Join-Path $env:USERPROFILE '.config\opencode'
$target = Join-Path $configDir 'taskflow-v1'
$config = Join-Path $configDir 'opencode.json'
$skillTarget = Join-Path $configDir 'skills\taskflow'

Write-Host '=== TaskFlow Supervisor v1.2.0 — OpenCode Desktop ===' -ForegroundColor Cyan
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node.js/npm no encontrado. Instale Node.js LTS.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js no encontrado.' }
New-Item -ItemType Directory -Force $configDir, $target, $skillTarget | Out-Null

# Ubicación estable fuera del proyecto: no depende de conservar la carpeta del ZIP.
if ([IO.Path]::GetFullPath($source).TrimEnd('\') -ne [IO.Path]::GetFullPath($target).TrimEnd('\')) {
  foreach ($name in @('package.json', 'vite.config.ts', 'tsconfig.json')) {
    Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $target $name) -Force
  }
  foreach ($folder in @('src', 'tests')) {
    $to = Join-Path $target $folder
    if (Test-Path $to) { Remove-Item $to -Recurse -Force }
    Copy-Item -LiteralPath (Join-Path $source $folder) -Destination $to -Recurse -Force
  }
}
Copy-Item -LiteralPath (Join-Path $source 'skill\SKILL.md') -Destination (Join-Path $skillTarget 'SKILL.md') -Force
Set-Location $target
Write-Host 'Instalando dependencias...'
& npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install falló; la configuración no fue modificada.' }
Write-Host 'Compilando panel...'
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación; la configuración no fue modificada.' }
Write-Host 'Ejecutando tests locales...'
& npm test
if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas; la configuración no fue modificada.' }

if ($SinRegistrar) {
  Write-Host 'Plugin compilado. No se modificó opencode.json (-SinRegistrar).'
  Write-Host "Agregue manualmente a plugins: $($target.Replace('\', '/'))"
  exit 0
}

$path = $target.Replace('\', '/')
# En una actualización habitual la ruta estable ya está registrada.
# No reescribir JSONC (comentarios, comas finales, reglas de Gentle AI): bastan los archivos actualizados.
if (Test-Path -LiteralPath $config) {
  $rawConfig = [IO.File]::ReadAllText($config)
  if ($rawConfig.Contains($path)) {
    Write-Host "Ruta de TaskFlow ya registrada: $path" -ForegroundColor Green
    Write-Host 'ACTUALIZACIÓN COMPLETADA. Cerrá completamente OpenCode Desktop y volvé a abrirlo.' -ForegroundColor Green
    exit 0
  }
}
if (-not (Test-Path -LiteralPath $config)) {
  $obj = [pscustomobject]@{ plugins = @($path) }
  $json = $obj | ConvertTo-Json -Depth 75
  [IO.File]::WriteAllText($config, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Configuración creada: $config"
} else {
  $old = [IO.File]::ReadAllText($config)
  try { $obj = $old | ConvertFrom-Json -ErrorAction Stop }
  catch {
    Write-Warning 'opencode.json usa sintaxis que no puedo convertir con seguridad (comentarios o JSONC). NO fue modificado.'
    Write-Host "Agregue esta ruta al array plugins, reemplazando la anterior de TaskFlow: $path"
    Write-Host "Archivo: $config"
    exit 0
  }
  if ($null -eq $obj -or $obj -isnot [psobject]) { throw 'Configuración inválida: objeto JSON esperado.' }
  $pluginsProp = $obj.PSObject.Properties['plugins']
  $before = @()
  if ($null -ne $pluginsProp) { $before = @($pluginsProp.Value | Where-Object { $null -ne $_ }) }
  $keep = New-Object System.Collections.ArrayList
  foreach ($p in $before) {
    $name = if ($p -is [string]) { $p } elseif ($null -ne $p.PSObject.Properties['package']) { [string]$p.package } else { '' }
    # Solo sustituye entradas identificadas como TaskFlow, preservando los demás plugins.
    if ($name -match '(?i)(taskflow-opencode|taskflow-supervisor|[/\\]taskflow-v1(?:[/\\]|$))') { continue }
    [void]$keep.Add($p)
  }
  [void]$keep.Add($path)
  $newPlugins = @($keep.ToArray())
  if ($null -eq $pluginsProp) { $obj | Add-Member -NotePropertyName plugins -NotePropertyValue $newPlugins }
  else { $obj.plugins = $newPlugins }
  $backup = "$config.backup-taskflow-v1-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $config -Destination $backup -Force
  $json = $obj | ConvertTo-Json -Depth 75
  $temp = "$config.taskflow-tmp"
  [IO.File]::WriteAllText($temp, $json, (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temp -Destination $config -Force
  Write-Host "Respaldo de configuración: $backup" -ForegroundColor Green
  Write-Host "Registrado en: $config" -ForegroundColor Green
}
Write-Host 'INSTALACIÓN COMPLETADA. Cerrá totalmente OpenCode Desktop y volvé a abrirlo.' -ForegroundColor Green
Write-Host 'Abrí una sesión y buscá el comando Abrir TaskFlow.'
Write-Host 'No modifiqué Gentle AI, OpenSpec ni AGENTS.md.'
