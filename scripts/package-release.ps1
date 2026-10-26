$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = Join-Path $projectRoot '.release'
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stage = Join-Path $releaseRoot "source-$stamp"
$archive = Join-Path $releaseRoot "noteflow-v0.6-$stamp.zip"
New-Item -ItemType Directory -Path $stage | Out-Null
$directories = @('app','lib','db','drizzle','public','scripts','tests','deployment')
$rootFiles = @('package.json','package-lock.json','next.config.ts','proxy.ts','tsconfig.json','postcss.config.mjs','vercel.json','.gitignore','.vercelignore','.env.example','README.md','LAUNCH.md','RELEASE-CHECKS.md','TIMEOUT-HOTFIX.md','SECURITY-AUDIT.md','QUALITY-AUDIT.md','REFERENCE-ANALYSIS.md','VIDEO-QUALITY-AUDIT.md','PRODUCT.md','DESIGN.md','STAGING-READINESS.md','BILLING-SETUP.md')
try {
  $files = @($rootFiles | ForEach-Object { Get-Item -LiteralPath (Join-Path $projectRoot $_) -Force })
  foreach ($directory in $directories) {
    $source = Get-Item -LiteralPath (Join-Path $projectRoot $directory)
    $items = @($source) + @(Get-ChildItem -LiteralPath $source.FullName -Recurse -Force)
    if ($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Release sources must not contain links.' }
    $files += @($items | Where-Object { -not $_.PSIsContainer })
  }
  foreach ($file in $files) {
    if (($file.Name -like '.env*' -and $file.Name -ne '.env.example') -or $file.Extension -in @('.pem','.key','.db','.sqlite','.log')) { throw 'Unexpected private/generated file in source selection.' }
    $relative = $file.FullName.Substring($projectRoot.Length + 1)
    $destination = Join-Path $stage $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::CreateFromDirectory($stage, $archive)
  $zip = [IO.Compression.ZipFile]::OpenRead($archive)
  try {
    if ($zip.Entries.Count -ne $files.Count) { throw 'Release archive file count mismatch.' }
    if ($zip.Entries | Where-Object { $_.FullName -match '(^|/)(\.env\.(local|staging\.local)|audit|node_modules|\.next|\.agents|\.codex)(/|$)' }) { throw 'Excluded content found in archive.' }
    Write-Output "Release archive verified: $($zip.Entries.Count) source files."
  } finally { $zip.Dispose() }
  Get-FileHash -LiteralPath $archive -Algorithm SHA256 | Format-List
} finally {
  # Delete only the temporary directory created by this invocation, after
  # resolving and checking that it is a child of the workspace release folder.
  $resolvedStage = [IO.Path]::GetFullPath($stage)
  $resolvedRelease = [IO.Path]::GetFullPath($releaseRoot).TrimEnd('\') + '\'
  if (-not $resolvedStage.StartsWith($resolvedRelease, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe cleanup path.' }
  if (Test-Path -LiteralPath $resolvedStage) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
}
