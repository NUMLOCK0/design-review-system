param(
  [switch]$KeepLogs
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$webRoot = Join-Path $projectRoot 'apps\web'

function Get-ProjectProcesses {
  $all = @(Get-CimInstance Win32_Process)
  $serverPath = [regex]::Escape((Join-Path $projectRoot 'apps\server'))
  $webPath = [regex]::Escape((Join-Path $projectRoot 'apps\web'))
  $roots = @($all | Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -match $serverPath -or
      $_.CommandLine -match $webPath -or
      $_.CommandLine -match 'pnpm.*@design-review/(server|web)'
    )
  })

  $ids = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($process in $roots) { [void]$ids.Add([int]$process.ProcessId) }

  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $all) {
      if ($ids.Contains([int]$process.ParentProcessId) -and $ids.Add([int]$process.ProcessId)) {
        $changed = $true
      }
    }
  }

  @($all | Where-Object { $ids.Contains([int]$_.ProcessId) })
}

Write-Host '[1/3] Stop project development services'
$processes = @(Get-ProjectProcesses)
foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

Write-Host '[2/3] Clear frontend build cache'
$cachePaths = @(
  (Join-Path $webRoot '.next'),
  (Join-Path $webRoot '.next-cache-stale'),
  (Join-Path $webRoot 'tsconfig.tsbuildinfo')
)
$cachePaths += @(Get-ChildItem -LiteralPath $webRoot -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like '.next-cache-cleared-*' -or $_.Name -like '.next-stale-cleared-*' } |
  Select-Object -ExpandProperty FullName)

foreach ($path in $cachePaths | Select-Object -Unique) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
}

if (-not $KeepLogs) {
  Remove-Item -LiteralPath (Join-Path $projectRoot 'server-dev.log'), (Join-Path $projectRoot 'server-dev.err.log'), (Join-Path $projectRoot 'web-dev.log'), (Join-Path $projectRoot 'web-dev.err.log') -Force -ErrorAction SilentlyContinue
}

Write-Host '[3/3] Start frontend and backend development services'
$env:NODE_ENV = 'development'
$env:WEB_ORIGIN = 'http://localhost:3000'
$env:PUBLIC_API_ORIGIN = 'http://localhost:8080'
$serverEnvFile = Join-Path $projectRoot 'apps\server\.env'
if (Test-Path -LiteralPath $serverEnvFile) {
  $jwtSetting = Get-Content -LiteralPath $serverEnvFile | Where-Object { $_ -match '^\s*JWT_SECRET\s*=' } | Select-Object -First 1
  if ($jwtSetting) {
    $jwtSecret = ($jwtSetting -replace '^\s*JWT_SECRET\s*=\s*', '').Trim()
    if (($jwtSecret.StartsWith('"') -and $jwtSecret.EndsWith('"')) -or ($jwtSecret.StartsWith("'") -and $jwtSecret.EndsWith("'"))) {
      $jwtSecret = $jwtSecret.Substring(1, $jwtSecret.Length - 2)
    }
    $env:JWT_SECRET = $jwtSecret
  }
}
$serverOut = Join-Path $projectRoot 'server-dev.log'
$serverErr = Join-Path $projectRoot 'server-dev.err.log'
$webOut = Join-Path $projectRoot 'web-dev.log'
$webErr = Join-Path $projectRoot 'web-dev.err.log'

Start-Process -FilePath 'pnpm.cmd' -ArgumentList @('run', 'dev:server') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr | Out-Null
Start-Process -FilePath 'pnpm.cmd' -ArgumentList @('run', 'dev:web') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $webOut -RedirectStandardError $webErr | Out-Null

Write-Host 'Development services started:'
Write-Host '  frontend: http://localhost:3000'
Write-Host '  backend:  http://localhost:8080'
