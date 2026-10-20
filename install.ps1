param(
    [string]$Version = $(if ($env:CRUMB_VERSION) { $env:CRUMB_VERSION } else { "latest" }),
    [string]$InstallDir = $(if ($env:CRUMB_INSTALL_DIR) { $env:CRUMB_INSTALL_DIR } else { "$env:LOCALAPPDATA\Programs\Crumb\bin" })
)

$ErrorActionPreference = "Stop"
$Repository = if ($env:CRUMB_REPOSITORY) { $env:CRUMB_REPOSITORY } else { "elixpo/crumb.elixpo" }

if (-not [Environment]::Is64BitOperatingSystem) {
    throw "Crumb currently requires 64-bit Windows"
}

$Asset = "crumb-windows-x86_64.zip"
if ($env:CRUMB_DOWNLOAD_BASE) {
    $DownloadBase = $env:CRUMB_DOWNLOAD_BASE.TrimEnd("/")
} elseif ($Version -eq "latest") {
    $DownloadBase = "https://github.com/$Repository/releases/latest/download"
} else {
    $DownloadBase = "https://github.com/$Repository/releases/download/$Version"
}

$Temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("crumb-install-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $Temporary | Out-Null

try {
    $Archive = Join-Path $Temporary $Asset
    $Checksum = "$Archive.sha256"
    Invoke-WebRequest -UseBasicParsing -Uri "$DownloadBase/$Asset" -OutFile $Archive
    Invoke-WebRequest -UseBasicParsing -Uri "$DownloadBase/$Asset.sha256" -OutFile $Checksum

    $Expected = ((Get-Content -Raw $Checksum).Trim() -split "\s+")[0].ToLowerInvariant()
    $Actual = (Get-FileHash -Algorithm SHA256 $Archive).Hash.ToLowerInvariant()
    if ($Expected -ne $Actual) {
        throw "Crumb archive checksum did not match"
    }

    Expand-Archive -Path $Archive -DestinationPath $Temporary -Force
    $Binary = Join-Path $Temporary "crumb.exe"
    if (-not (Test-Path -PathType Leaf $Binary)) {
        throw "Release archive did not contain crumb.exe"
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item $Binary (Join-Path $InstallDir "crumb.exe") -Force

    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $PathParts = @($UserPath -split ";" | Where-Object { $_ })
    if ($PathParts -notcontains $InstallDir) {
        $UpdatedPath = (@($PathParts) + $InstallDir) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $UpdatedPath, "User")
        $env:Path = "$env:Path;$InstallDir"
        Write-Host "Added $InstallDir to your user PATH."
    }

    Write-Host ""
    Write-Host "  ◆ Crumb is installed and ready to crunch." -ForegroundColor Green
    Write-Host "    $InstallDir\crumb.exe"
    Write-Host ""
    Write-Host "  Open a new terminal and run: crumb" -ForegroundColor Cyan
    Write-Host "  Then try:"
    Write-Host "    /auth login"
    Write-Host "    explain this workspace and show me where to start"
    Write-Host "    /help"
    Write-Host ""
    Write-Host "  Docs: https://crumb.elixpo.com/docs/getting-started"
} finally {
    Remove-Item -Recurse -Force $Temporary -ErrorAction SilentlyContinue
}
