param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"
$databaseUrl = $env:DATABASE_URL
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
  $envPath = Join-Path $PSScriptRoot "..\.env"
  if (Test-Path -LiteralPath $envPath) {
    $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
    if ($line -match '^\s*DATABASE_URL\s*=\s*(.*)\s*$') { $databaseUrl = $Matches[1].Trim().Trim('"').Trim("'") }
  }
}
if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw "Set DATABASE_URL in the process environment or in the root .env file." }
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  $pgDump = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Filter pg_dump.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
}
if (-not $pgDump) { throw "pg_dump was not found. Install PostgreSQL client tools or add pg_dump to PATH." }
$pgDumpPath = if ($pgDump.CommandType) { $pgDump.Source } else { $pgDump.FullName }

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $resolvedOutput "sistema-cotacoes-$timestamp.dump"
$connection = [System.Uri]$databaseUrl
$credentials = [System.Uri]::UnescapeDataString($connection.UserInfo).Split(':', 2)
$previous = @{}
foreach ($name in @("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE")) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
try {
  $env:PGHOST = $connection.Host
  $env:PGPORT = if ($connection.IsDefaultPort) { "5432" } else { [string]$connection.Port }
  $env:PGDATABASE = [System.Uri]::UnescapeDataString($connection.AbsolutePath.TrimStart('/'))
  if ($credentials.Length -gt 0) { $env:PGUSER = $credentials[0] }
  if ($credentials.Length -gt 1) { $env:PGPASSWORD = $credentials[1] }
  if ($connection.Query -match '(?:\?|&)sslmode=([^&]+)') { $env:PGSSLMODE = [System.Uri]::UnescapeDataString($Matches[1]) }
  & $pgDumpPath --format=custom --no-owner --no-acl --file=$backupPath
} finally {
  foreach ($name in @("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE")) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
  $credentials = $null
  $databaseUrl = $null
}
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $backupPath -ErrorAction SilentlyContinue
  throw "pg_dump failed with exit code $LASTEXITCODE."
}
Write-Output "PostgreSQL backup created: $backupPath"
