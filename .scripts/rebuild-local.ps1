<#
.SYNOPSIS
    Rebuild local das imagens de produção (api, web) com versão incremental
    e deploy via `docker compose` — sem publicar no Docker Hub.

.DESCRIPTION
    Diferente de `docker-publish.ps1` (que builda, envia ao Docker Hub e só
    depois sobe o stack), este script é 100% local: builda `api`/`web` via
    `docker compose -f docker-compose.prod.yml build` (stage `runtime`),
    marca cada imagem com uma tag de versão incremental (`local-<versão>`,
    mesma convenção de "nº de commits" do `docker-publish.ps1` — `git
    rev-list --count HEAD`) + `local-latest`, e então faz o deploy chamando
    `docker compose ... up -d`. O Compose builda e já marca a imagem com a
    tag certa porque `docker-compose.prod.yml` agora tem `image:` (lido de
    `API_IMAGE`/`WEB_IMAGE`) ao lado de `build:` em cada serviço — não
    precisa de `docker run` manual (diferente de
    `C:\CentriumIA\scripts\rebuild-local.ps1`, que builda com `docker build`
    solto e sobe o container web via `docker run`; aqui os 3 serviços —
    db/api/web — já são geridos inteiramente pelo compose de produção).

.PARAMETER ComposeFile
    Arquivo de compose a usar. Default: docker-compose.prod.yml.

.PARAMETER EnvFile
    Arquivo de env a usar com `--env-file`. Default: .env.prod (copie de
    .env.prod.example e ajuste os segredos antes de rodar).

.PARAMETER NoCache
    Builda sem cache (`docker compose build --no-cache`).

.PARAMETER SkipDeploy
    Só builda e tageia as imagens localmente — não sobe o stack.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .scripts/rebuild-local.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .scripts/rebuild-local.ps1 -NoCache -SkipDeploy
#>
[CmdletBinding()]
param(
    [string]$ComposeFile = "docker-compose.prod.yml",
    [string]$EnvFile = ".env.prod",
    [switch]$NoCache,
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )

    # CLIs nativas (docker/compose) escrevem progresso normal em stderr. Sob
    # $ErrorActionPreference = 'Stop', stderr nativo mesclado vira um
    # NativeCommandError terminante mesmo com exit code 0 — neutraliza isso
    # localmente e confia em $LASTEXITCODE como sinal real de sucesso/falha.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $FilePath @Arguments 2>&1 | ForEach-Object { Write-Host $_ }
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Comando falhou com exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    Write-Step "Checando Docker"
    Invoke-Checked "docker" @("version")

    $envFilePath = Join-Path $repoRoot $EnvFile
    if (-not (Test-Path $envFilePath)) {
        throw "'$EnvFile' não encontrado em $repoRoot. Copie '.env.prod.example' para '$EnvFile' e ajuste os segredos antes de rodar."
    }

    $version = (git rev-list --count HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) {
        throw "Não foi possível determinar a versão via 'git rev-list --count HEAD'."
    }
    Write-Host "Versão (nº de commits): $version" -ForegroundColor Cyan

    $apiImage = "estacaometeorologica-api:local-$version"
    $apiImageLatest = "estacaometeorologica-api:local-latest"
    $webImage = "estacaometeorologica-web:local-$version"
    $webImageLatest = "estacaometeorologica-web:local-latest"

    # Lidas pelo docker-compose.prod.yml via `image: ${API_IMAGE:-...}` /
    # `${WEB_IMAGE:-...}` — variável de ambiente do processo tem prioridade
    # sobre o `--env-file` no Compose, então isso sobrepõe o default.
    $env:API_IMAGE = $apiImage
    $env:WEB_IMAGE = $webImage

    $composeArgs = @("compose", "-f", $ComposeFile, "--env-file", $EnvFile)

    Write-Step "Build (compose): api + web -> $apiImage / $webImage"
    $buildArgs = $composeArgs + @("build", "api", "web")
    if ($NoCache) {
        $buildArgs += "--no-cache"
    }
    Invoke-Checked "docker" $buildArgs

    Write-Step "Marcando tags 'local-latest'"
    Invoke-Checked "docker" @("tag", $apiImage, $apiImageLatest)
    Invoke-Checked "docker" @("tag", $webImage, $webImageLatest)

    if ($SkipDeploy) {
        Write-Host "`n-SkipDeploy ativo: imagens buildadas, stack não subido." -ForegroundColor DarkYellow
        return
    }

    Write-Step "Deploy (compose up -d): db + api + web"
    Invoke-Checked "docker" ($composeArgs + @("up", "-d"))

    Write-Step "Status do stack"
    Invoke-Checked "docker" ($composeArgs + @("ps"))

    Write-Host ""
    Write-Host "Stack em execução localmente com as imagens versionadas:" -ForegroundColor Green
    Write-Host "  - $apiImage (= $apiImageLatest)" -ForegroundColor Green
    Write-Host "  - $webImage (= $webImageLatest)" -ForegroundColor Green
    Write-Host "Confira as portas publicadas com: docker compose -f $ComposeFile ps" -ForegroundColor Green
}
finally {
    Pop-Location
}
