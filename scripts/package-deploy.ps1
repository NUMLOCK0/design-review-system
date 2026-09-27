param(
  [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseDirectory = if ($OutputDirectory) {
  [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
} else {
  Join-Path $projectRoot 'release'
}
$zipPath = Join-Path $releaseDirectory 'design-review-system.zip'
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("design-review-system-package-" + [guid]::NewGuid().ToString('N'))
$stageRoot = Join-Path $tempRoot 'design-review-system'

$excludedDirectories = @(
  '.git', 'node_modules', '.next', '.next-cache-stale', 'dist', 'build', 'out', 'coverage',
  '.turbo', '.cache', 'temp', 'tmp', 'private-uploads', 'uploads', 'release'
)
$excludedFiles = @(
  '.env', '.env.local', '.env.development.local', '.env.test.local',
  '.env.production.local', 'package-lock.json', 'tsconfig.tsbuildinfo', 'ssh-config'
)

function Copy-ProjectTree {
  param(
    [string]$Source,
    [string]$Destination
  )

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
    if ($item.PSIsContainer -and $excludedDirectories -contains $item.Name) { continue }
    if (-not $item.PSIsContainer -and $excludedFiles -contains $item.Name) { continue }
    if (-not $item.PSIsContainer -and ($item.Name -like '*.log' -or $item.Name -like '*.zip' -or ($item.Name -like '.env.*' -and $item.Name -ne '.env.example') -or $item.Name -like '*.env')) { continue }

    $target = Join-Path $Destination $item.Name
    if ($item.PSIsContainer) {
      Copy-ProjectTree -Source $item.FullName -Destination $target
    } else {
      Copy-Item -LiteralPath $item.FullName -Destination $target -Force
    }
  }
}

try {
  Push-Location $projectRoot
  $previousNodeEnv = $env:NODE_ENV
  try {
    $env:NODE_ENV = 'production'
    Write-Output '[1/4] Building server locally'
    pnpm --filter @design-review/server build
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }

    Write-Output '[2/4] Building web locally'
    pnpm --filter @design-review/web build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
  } finally {
    if ($null -eq $previousNodeEnv) { Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue }
    else { $env:NODE_ENV = $previousNodeEnv }
    Pop-Location
  }

  $serverBuild = Join-Path $projectRoot 'apps/server/dist/server.js'
  $webBuild = Join-Path $projectRoot 'apps/web/.next/BUILD_ID'
  if (-not (Test-Path -LiteralPath $serverBuild)) { throw "Backend build output missing: $serverBuild" }
  if (-not (Test-Path -LiteralPath $webBuild)) { throw "Frontend build output missing: $webBuild" }

  New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
  Copy-ProjectTree -Source $projectRoot -Destination $stageRoot

  Copy-Item -LiteralPath (Join-Path $projectRoot 'apps/server/dist') -Destination (Join-Path $stageRoot 'apps/server/dist') -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot 'apps/web/.next') -Destination (Join-Path $stageRoot 'apps/web/.next') -Recurse -Force
  $webBuildCache = Join-Path $stageRoot 'apps/web/.next/cache'
  if (Test-Path -LiteralPath $webBuildCache) {
    Remove-Item -LiteralPath $webBuildCache -Recurse -Force
  }

  Write-Output '[3/4] Packaging source and local build outputs'
  Compress-Archive -Path $stageRoot -DestinationPath $zipPath -CompressionLevel Optimal -Force
  Write-Output "Deployment package created: $zipPath"
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
