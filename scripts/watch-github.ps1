# GitHub repo watcher for yadnyesh-24/verifyIT
# Polls the repo every $Interval seconds and logs any new commits.
# Writes:
#   .state/last_known.json    - {sha, message, author, timestamp}
#   .state/notifications.log  - human-readable log of detected changes
#
# Run in background:
#   Start-Process powershell -ArgumentList '-NoProfile -File scripts/watch-github.ps1' -WindowStyle Hidden
#
# Stop:
#   Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
#     Where-Object { $_.CommandLine -match 'watch-github' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

param(
    [string]$Repo   = 'yadnyesh-24/verifyIT',
    [string]$State  = "$PSScriptRoot\..\.state",
    [int]   $Interval = 180   # 3 minutes
)

$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $State | Out-Null

$knownFile   = Join-Path $State 'last_known.json'
$notifyFile  = Join-Path $State 'notifications.log'
$scriptStart = Get-Date -Format 'o'

function Get-RemoteHead {
    $tmpOut = [System.IO.Path]::GetTempFileName()
    $tmpErr = [System.IO.Path]::GetTempFileName()
    $proc = Start-Process -FilePath gh -ArgumentList @('api',"repos/$Repo/commits?per_page=1") -NoNewWindow -Wait -PassThru -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr
    $raw = Get-Content -Path $tmpOut -Raw -ErrorAction SilentlyContinue
    Remove-Item $tmpOut,$tmpErr -ErrorAction SilentlyContinue
    if ($proc.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) { return $null }
    try {
        $j = $raw | ConvertFrom-Json
        if (-not $j -or $j.Count -lt 1) { return $null }
        $c = $j[0]
        return [pscustomobject]@{
            sha       = $c.sha
            message   = ($c.commit.message -split "`n")[0]
            author    = $c.commit.author.name
            timestamp = $c.commit.author.date
        }
    } catch { return $null }
}

function Write-Notification($head) {
    $line = "$(Get-Date -Format 'o')  NEW COMMIT  $($head.sha.Substring(0,7))  $($head.author)  $($head.message)"
    Add-Content -Path $notifyFile -Value $line
}

# Initial fetch
$head = Get-RemoteHead
if ($head) {
    $head | ConvertTo-Json -Depth 3 | Set-Content -Path $knownFile
    "Watcher started at $scriptStart; current HEAD = $($head.sha.Substring(0,7))  '$($head.message)'" |
        Add-Content -Path $notifyFile
}

# Poll loop
while ($true) {
    Start-Sleep -Seconds $Interval
    $cur = Get-RemoteHead
    if (-not $cur) { continue }

    $prev = $null
    if (Test-Path $knownFile) {
        try { $prev = Get-Content -Path $knownFile -Raw | ConvertFrom-Json } catch { $prev = $null }
    }

    if (-not $prev -or $cur.sha -ne $prev.sha) {
        Write-Notification $cur
        $cur | ConvertTo-Json -Depth 3 | Set-Content -Path $knownFile
    }
}