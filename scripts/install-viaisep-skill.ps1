<#
.SYNOPSIS
    Install-VIAISEPAgentSkill - Install VIAISEP package and register agent skills globally
.DESCRIPTION
    Installs the VIAISEP Python package and copies skills/commands for the
    requested agents into their global config directories:
      - trae:   ~/.trae-cn/skills/viaisep/SKILL.md        (from .trae/skills)
      - claude: ~/.claude/skills/viaisep/SKILL.md         (from skills/)
      - codex:  ~/.codex/prompts/viaisep.md               (from .codex/prompts)
.PARAMETER Platform
    Agents to install. One or more of: trae, claude, codex. Default: all of them.
#>

param(
    [ValidateSet("trae", "claude", "codex", "all")]
    [string[]]$Platform = @("all")
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = (Get-Item $ScriptDir).Parent.FullName

# Resolve requested platforms
$Requested = @()
foreach ($p in $Platform) {
    if ($p -eq "all") { $Requested = @("trae", "claude", "codex") }
    else { $Requested += $p }
}
$Requested = $Requested | Select-Object -Unique

Write-Host "=== VIAISEP Agent Skill Installation (Windows) ==="
Write-Host "Targets: $($Requested -join ', ')"
Write-Host ""

# Step 1: Install VIAISEP package (dist 打包模式自带 exe，无需 pip 安装)
Write-Host "[1/5] Installing VIAISEP package..."
$isDist = -not (Test-Path "$RepoDir\pyproject.toml")
$existing = Get-Command viaisep -ErrorAction SilentlyContinue
if ($isDist) {
    Write-Host "  dist 分发模式（无 pyproject.toml），跳过 pip install；运行 $RepoDir\viaisep.exe"
} elseif ($existing) {
    Write-Host "  viaisep already installed, skipping pip install"
} else {
    $proc = Start-Process -FilePath "pip" -ArgumentList "install", "-e", "`"$RepoDir`"" -NoNewWindow -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Host "[ERROR] pip install failed (exit code: $($proc.ExitCode))" -ForegroundColor Red
        exit 1
    }
    Write-Host "  viaisep installed"
}

# Step 2: Prepare install plan
Write-Host "[2/5] Preparing install targets..."
$Jobs = @()
if ($Requested -contains "trae") {
    $Jobs += @{
        Name    = "trae"
        Source  = "$RepoDir\.trae\skills\viaisep\SKILL.md"
        Target  = "$env:USERPROFILE\.trae-cn\skills\viaisep\SKILL.md"
        HostDir = ".trae-cn"
    }
}
if ($Requested -contains "claude") {
    $Jobs += @{
        Name    = "claude"
        Source  = "$RepoDir\skills\viaisep\SKILL.md"
        Target  = "$env:USERPROFILE\.claude\skills\viaisep\SKILL.md"
        HostDir = ".claude"
    }
}
if ($Requested -contains "codex") {
    $Jobs += @{
        Name    = "codex"
        Source  = "$RepoDir\.codex\prompts\viaisep.md"
        Target  = "$env:USERPROFILE\.codex\prompts\viaisep.md"
        HostDir = ".codex"
    }
}

# Step 3: Copy files
Write-Host "[3/5] Copying files..."
foreach ($job in $Jobs) {
    if (-not (Test-Path $job.Source)) {
        Write-Host "  [ERROR] Source not found: $($job.Source)" -ForegroundColor Red
        exit 1
    }
    $dir = Split-Path -Parent $job.Target
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Copy-Item -Path $job.Source -Destination $job.Target -Force
    Write-Host "  [$($job.Name)] copied -> $($job.Target)"
}

# Step 3.5: Initialize per-agent data root (ADR-0038)
Write-Host "[4/5] Initializing per-agent data roots..."
foreach ($job in $Jobs) {
    $dataRoot = "$env:USERPROFILE\$($job.HostDir)\viaisep"
    New-Item -ItemType Directory -Path "$dataRoot\data" -Force | Out-Null
    New-Item -ItemType Directory -Path "$dataRoot\workspace" -Force | Out-Null
    $cfgPath = "$dataRoot\config.toml"
    if (-not (Test-Path $cfgPath)) {
        $cfgContent = "[platform]`r`ndata_root = `"$($dataRoot -replace '\\','/')`"`r`n"
        Set-Content -Path $cfgPath -Value $cfgContent -Encoding UTF8
        Write-Host "  [$($job.Name)] data root created -> $dataRoot"
    } else {
        Write-Host "  [$($job.Name)] data root exists: $dataRoot"
    }
}

# Step 3.6: Patch TRAE sandbox config - let packaged CLI bypass sandbox (viaisep* host rule)
Write-Host "[4.5/5] Patching TRAE sandbox rules..."
if ($Requested -contains "trae") {
    $permissionFile = "$env:USERPROFILE\.trae-cn\permission\global.json"
    if (Test-Path $permissionFile) {
        try {
            $raw = Get-Content -Path $permissionFile -Raw -Encoding UTF8
            if ($raw -match '"viaisep') {
                Write-Host "  [trae] viaisep* rule already present, skip"
            } else {
                # 在 commandRules 的 "cd *" 块之后插入 viaisep* host 规则（保留原有格式，仅做文本级补丁）
                $pattern = '(?m)(^\s*)"cd \*"\s*:\s*\{[^}]*\}'
                $m = [regex]::Match($raw, $pattern)
                if (-not $m.Success) {
                    Write-Host "  [trae] [WARN] no 'cd *' rule anchor found, skip" -ForegroundColor Yellow
                } else {
                    $indent = $m.Groups[1].Value
                    $insert = "`r`n$indent`"viaisep*`": {`r`n$indent  `"approval`": `"allow`",`r`n$indent  `"execEnv`": `"host`"`r`n$indent}"
                    $new = $raw.Substring(0, $m.Index + $m.Length) + "," + $insert + $raw.Substring($m.Index + $m.Length)
                    # 写入前先验证补丁后仍是合法 JSON；无 BOM 写入（避免 Node 解析失败）
                    $null = $new | ConvertFrom-Json -ErrorAction Stop
                    [System.IO.File]::WriteAllText($permissionFile, $new, (New-Object System.Text.UTF8Encoding($false)))
                    Write-Host "  [trae] viaisep* host rule added -> $permissionFile"
                }
            }
        } catch {
            Write-Host "  [trae] [WARN] failed to patch sandbox rule: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [trae] [WARN] permission config not found, skip: $permissionFile" -ForegroundColor Yellow
    }
}

# Step 4: Verify
Write-Host "[5/5] Verifying installation..."
foreach ($job in $Jobs) {
    if (Test-Path $job.Target) {
        Write-Host "  [$($job.Name)] OK: $($job.Target)"
    } else {
        Write-Host "  [$($job.Name)] [WARN] not found: $($job.Target)" -ForegroundColor Yellow
    }
    $dataRoot = "$env:USERPROFILE\$($job.HostDir)\viaisep"
    if (Test-Path "$dataRoot\config.toml") {
        Write-Host "  [$($job.Name)] data root OK: $dataRoot"
    } else {
        Write-Host "  [$($job.Name)] [WARN] data root missing: $dataRoot" -ForegroundColor Yellow
    }
}
if (Get-Command viaisep -ErrorAction SilentlyContinue) {
    Write-Host "  viaisep command available"
} else {
    Write-Host "  [WARN] viaisep command not available" -ForegroundColor Yellow
}
if ($Requested -contains "trae") {
    $permissionFile = "$env:USERPROFILE\.trae-cn\permission\global.json"
    if ((Test-Path $permissionFile) -and ((Get-Content -Path $permissionFile -Raw -Encoding UTF8) -match '"viaisep\*')) {
        Write-Host "  [trae] sandbox rule OK: viaisep* -> host"
    } else {
        Write-Host "  [trae] [WARN] sandbox rule missing: viaisep* (packaged CLI may be sandboxed)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Installation complete! ===" -ForegroundColor Green
Write-Host "Restart the IDE(s) to load the new skill/command."
Write-Host "Test: viaisep --help"
Write-Host ""
