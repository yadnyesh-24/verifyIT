# Check the GitHub repo state and print any new commits since the last known.
# Use this from Cline turns to detect teammate activity without re-fetching everything.

param(
    [string]$Repo = 'yadnyesh-24/verifyIT',
    [string]$State = "$PSScriptRoot\..\.state"
)

$ErrorActionPreference = 'Continue'
$knownFile  = Join-Path $State 'last_known.json'
$notifyFile = Join-Path $State 'notifications.log'

New-Item -ItemType Directory -Force -Path $State | Out-Null

# Fetch the live HEAD (use cmd.exe redirection to preserve exit code)
$tmpOut = [System.IO.Path]::GetTempFileName()
$tmpErr = [System.IO.Path]::GetTempFileName()
$proc = Start-Process -FilePath gh -ArgumentList @('api',"repos/$Repo/commits?per_page=5") -NoNewWindow -Wait -PassThru -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr
$raw  = Get-Content -Path $tmpOut -Raw -ErrorAction SilentlyContinue
Remove-Item $tmpOut,$tmpErr -ErrorAction SilentlyContinue

if ($proc.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) {
    Write-Output "GH_API_ERROR exit=$($proc.ExitCode)"
    exit 1
}

try { $j = $raw | ConvertFrom-Json }
catch {
    Write-Output "GH_JSON_ERROR: $($_.Exception.Message)"
    exit 1
}
if (-not $j -or $j.Count -lt 1) {
    Write-Output "GH_EMPTY"
    exit 0
}

$latest = $j[0]
$cur = [pscustomobject]@{
    sha       = $latest.sha
    message   = ($latest.commit.message -split "`n")[0]
    author    = $latest.commit.author.name
    timestamp = $latest.commit.author.date
}

$prev = $null
if (Test-Path $knownFile) {
    try { $prev = Get-Content $knownFile -Raw | ConvertFrom-Json } catch { $prev = $null }
}

$changed = (-not $prev) -or ($cur.sha -ne $prev.sha)

if ($changed) {
    "=== GITHUB UPDATE DETECTED @ $(Get-Date -Format 'o') ===" | Add-Content $notifyFile
    Write-Output ("UPDATED  HEAD={0}  by {1}" -f $cur.sha.Substring(0,7), $cur.author)
    Write-Output ("          '{0}'" -f $cur.message)
    foreach ($c in $j) {
        $msg = ($c.commit.message -split "`n")[0]
        Write-Output ("  {0}  {1,-20}  {2}" -f $c.sha.Substring(0,7), $c.commit.author.name, $msg)
    }
    $cur | ConvertTo-Json -Depth 3 | Set-Content $knownFile
} else {
    Write-Output ("NO-CHANGE  HEAD={0}  '{1}'" -f $cur.sha.Substring(0,7), $cur.message)
}