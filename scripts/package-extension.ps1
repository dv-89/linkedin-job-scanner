$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'manifest.json') -Raw | ConvertFrom-Json
$releaseDir = Join-Path $repoRoot 'releases'
$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ('linkedin-job-scanner-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $releaseDir, $stagingDir -Force | Out-Null

# An explicit allowlist keeps source, dependencies, Git files, and demo data
# out of the uploaded extension. The manifest must be at the ZIP root.
foreach ($file in @('manifest.json', 'background.js', 'captureBackground.js', 'content.js', 'THIRD-PARTY-NOTICES.txt')) {
  Copy-Item -LiteralPath (Join-Path $repoRoot $file) -Destination $stagingDir
}
$sharedDir = Join-Path $stagingDir 'panel/src/lib'
New-Item -ItemType Directory -Path $sharedDir -Force | Out-Null
foreach ($file in @('storage.js', 'jobCapture.js', 'captureCsv.js', 'captureFile.js', 'dailyCapture.js', 'jobConnection.js', 'jobFields.js', 'keywordMatch.js', 'skillsDictionary.js', 'stopwords.js')) {
  Copy-Item -LiteralPath (Join-Path $repoRoot "panel/src/lib/$file") -Destination $sharedDir
}
Copy-Item -LiteralPath (Join-Path $repoRoot 'docs/privacy.html') -Destination (Join-Path $stagingDir 'privacy.html')
$iconDir = Join-Path $stagingDir 'icons'
New-Item -ItemType Directory -Path $iconDir | Out-Null
foreach ($size in @(16, 32, 48, 128)) {
  Copy-Item -LiteralPath (Join-Path $repoRoot "icons/icon-$size.png") -Destination $iconDir
}
$panelDir = Join-Path $stagingDir 'panel/dist'
New-Item -ItemType Directory -Path $panelDir -Force | Out-Null
foreach ($file in @('index.html', 'favicon.svg', 'assets')) {
  Copy-Item -LiteralPath (Join-Path $repoRoot "panel/dist/$file") -Destination $panelDir -Recurse
}
$zipPath = Join-Path $releaseDir "linkedin-job-scanner-$($manifest.version).zip"
Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $zipPath -Force
$hasher = [System.Security.Cryptography.SHA256]::Create()
$zipStream = [System.IO.File]::OpenRead($zipPath)
try {
  $hash = [BitConverter]::ToString($hasher.ComputeHash($zipStream)).Replace('-', '').ToLowerInvariant()
  Write-Output "SHA256: $hash"
} finally {
  $zipStream.Dispose()
  $hasher.Dispose()
}
Write-Output "Upload package: $zipPath"
