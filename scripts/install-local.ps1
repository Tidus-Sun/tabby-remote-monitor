[CmdletBinding()]
param([string]$PluginsDir)

$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$metadata = Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($metadata.name -ne 'tabby-remote-monitor') { throw 'Unexpected plugin package.' }
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'dist\index.js'))) { throw 'Build dist/index.js before installing.' }
if (-not $PluginsDir) { $PluginsDir = Join-Path $env:APPDATA 'tabby\plugins' }
$pluginsRoot = [System.IO.Path]::GetFullPath($PluginsDir)
$destination = [System.IO.Path]::GetFullPath((Join-Path $pluginsRoot 'node_modules\tabby-remote-monitor'))
$allowedPrefix = $pluginsRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if (-not $destination.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Destination is outside the selected plugins directory.' }
$manifestPath = Join-Path $pluginsRoot 'package.json'
$manifestText = $null
$manifest = [PSCustomObject]@{}
if (Test-Path -LiteralPath $manifestPath) {
    $manifestText = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
    $manifest = $manifestText | ConvertFrom-Json
}
$id = 'tabby-remote-monitor-' + [Guid]::NewGuid().ToString()
$localRelative = 'remote-monitor-local/' + $id
$localSource = Join-Path $pluginsRoot $localRelative
$backup = [System.IO.Path]::GetFullPath((Join-Path $pluginsRoot ('remote-monitor-backups\' + $id)))
if (-not $backup.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Backup is outside the selected plugins directory.' }
$utf8 = New-Object System.Text.UTF8Encoding $false
# Persist a runtime-only source outside node_modules so npm/Arborist cannot prune it.
# Each installation uses a new path to invalidate old lockfile resolutions.
New-Item -ItemType Directory -Path $localSource -Force | Out-Null
$runtimeMetadata = [ordered]@{}
foreach ($key in @('name', 'version', 'description', 'keywords', 'main', 'author', 'license', 'engines')) {
    if ($metadata.PSObject.Properties[$key]) { $runtimeMetadata[$key] = $metadata.$key }
}
[System.IO.File]::WriteAllText((Join-Path $localSource 'package.json'), (($runtimeMetadata | ConvertTo-Json -Depth 100) + "`n"), $utf8)
foreach ($file in @('dist', 'README.md', 'LICENSE')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $localSource -Recurse -Force
}
New-Item -ItemType Directory -Path $backup -Force | Out-Null

New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
if (Test-Path -LiteralPath $destination) {
    Move-Item -LiteralPath $destination -Destination (Join-Path $backup 'tabby-remote-monitor')
    Write-Host "Previous installation backed up: $backup"
}
Copy-Item -LiteralPath $localSource -Destination $destination -Recurse -Force
if (-not $manifest.PSObject.Properties['dependencies'] -or $null -eq $manifest.dependencies) {
    $manifest | Add-Member -NotePropertyName dependencies -NotePropertyValue ([PSCustomObject]@{}) -Force
}
$manifest.dependencies | Add-Member -NotePropertyName 'tabby-remote-monitor' -NotePropertyValue ('file:' + $localRelative) -Force
$stagedManifest = Join-Path $pluginsRoot ('.' + $id + '.json')
[System.IO.File]::WriteAllText($stagedManifest, (($manifest | ConvertTo-Json -Depth 100) + "`n"), $utf8)
if (Test-Path -LiteralPath $manifestPath) {
    [System.IO.File]::Replace($stagedManifest, $manifestPath, (Join-Path $backup 'plugins-package.json'))
} else {
    [System.IO.File]::Move($stagedManifest, $manifestPath)
}
# The next Tabby plugin update reconciles package-lock.json from this dependency.
Write-Host "Installed tabby-remote-monitor $($metadata.version) at $destination"
Write-Host "Registered persistent local dependency: $localSource"
Write-Host 'Save your terminal work and restart Tabby, then open a Linux SSH connection.'
