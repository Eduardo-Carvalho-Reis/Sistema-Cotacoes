param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  throw "Set DATABASE_URL in the process environment before running the backup. The script does not read or print credentials."
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "pg_dump was not found. Install PostgreSQL client tools and add pg_dump to PATH."
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $resolvedOutput "sistema-cotacoes-$timestamp.dump"
& pg_dump --dbname=$env:DATABASE_URL --format=custom --no-owner --no-acl --file=$backupPath
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $backupPath -ErrorAction SilentlyContinue
  throw "pg_dump failed with exit code $LASTEXITCODE."
}
Write-Output "PostgreSQL backup created: $backupPath"
