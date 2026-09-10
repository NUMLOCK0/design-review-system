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
  New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
  Copy-ProjectTree -Source $projectRoot -Destination $stageRoot
  Compress-Archive -Path $stageRoot -DestinationPath $zipPath -CompressionLevel Optimal -Force
  Write-Output "Deployment package created: $zipPath"
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
