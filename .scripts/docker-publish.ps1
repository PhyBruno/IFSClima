<#
.SYNOPSIS
    Builda as imagens de produção (api, web), publica no Docker Hub e sobe o
    stack localmente com as imagens recém-publicadas.

.DESCRIPTION
    Usa o stage `runtime` de cada Dockerfile (api/Dockerfile, web/Dockerfile).
    Versão "progressiva" = número de commits do branch atual (git rev-list
    --count HEAD), monotonicamente crescente a cada commit. Cada serviço
    recebe duas tags no MESMO repositório Docker Hub:
      <repo>:api-<versao>   <repo>:api-latest
      <repo>:web-<versao>   <repo>:web-latest

    Depois do push, sobe `docker-compose.prod.yml` localmente (db + api + web)
    reaproveitando as imagens que acabaram de ser buildadas — é assim que a
    aplicação fica "em execução" na máquina que rodou o script.

.PARAMETER DockerHubRepo
    Repositório Docker Hub de destino (ex: "usuario/ifsclima"). Se omitido,
    usa a variável de ambiente DOCKERHUB_REPO.

.PARAMETER SkipPush
    Só builda e tageia localmente, sem enviar ao Docker Hub. Útil para testar
    o script sem estar logado / sem consumir rate limit do registry.

.PARAMETER SkipRun
    Não sobe o stack localmente após o build/push — só builda (e publica, se
    -SkipPush não estiver presente).

.EXAMPLE
    $env:DOCKERHUB_REPO = "usuario/ifsclima"
    docker login
    powershell -ExecutionPolicy Bypass -File .scripts/docker-publish.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .scripts/docker-publish.ps1 -DockerHubRepo usuario/ifsclima -SkipPush
#>
[CmdletBinding()]
param(
    [string]$DockerHubRepo = $env:DOCKERHUB_REPO,
    [switch]$SkipPush,
    [switch]$SkipRun
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DockerHubRepo)) {
    throw "Informe o repositório Docker Hub via -DockerHubRepo <usuario/repo> ou `$env:DOCKERHUB_REPO."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    $version = (git rev-list --count HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) {
        throw "Não foi possível determinar a versão via 'git rev-list --count HEAD'."
    }

    Write-Host "Repositório Docker Hub: $DockerHubRepo" -ForegroundColor Cyan
    Write-Host "Versão (nº de commits): $version" -ForegroundColor Cyan

    $services = @("api", "web")

    foreach ($service in $services) {
        $versionTag = "${DockerHubRepo}:${service}-${version}"
        $latestTag = "${DockerHubRepo}:${service}-latest"
        $dockerfile = "$service/Dockerfile"

        Write-Host "`n==> Build $service (target: runtime)" -ForegroundColor Yellow
        docker build --target runtime -f $dockerfile -t $versionTag -t $latestTag .
        if ($LASTEXITCODE -ne 0) {
            throw "Falha no 'docker build' de $service."
        }

        if ($SkipPush) {
            Write-Host "==> -SkipPush ativo: pulando 'docker push' de $service." -ForegroundColor DarkYellow
            continue
        }

        Write-Host "==> Push $versionTag" -ForegroundColor Yellow
        docker push $versionTag
        if ($LASTEXITCODE -ne 0) {
            throw "Falha no 'docker push' de $versionTag. Rode 'docker login' antes de publicar."
        }

        Write-Host "==> Push $latestTag" -ForegroundColor Yellow
        docker push $latestTag
        if ($LASTEXITCODE -ne 0) {
            throw "Falha no 'docker push' de $latestTag."
        }
    }

    if ($SkipPush) {
        Write-Host "`nConcluído. Imagens buildadas localmente (push pulado):" -ForegroundColor Green
    }
    else {
        Write-Host "`nConcluído. Imagens publicadas em ${DockerHubRepo}:" -ForegroundColor Green
    }
    foreach ($service in $services) {
        Write-Host "  - ${service}-${version}"
        Write-Host "  - ${service}-latest"
    }

    if ($SkipRun) {
        Write-Host "`n-SkipRun ativo: não subindo o stack localmente." -ForegroundColor DarkYellow
        return
    }

    $envProdPath = Join-Path $repoRoot ".env.prod"
    if (-not (Test-Path $envProdPath)) {
        Write-Warning "'.env.prod' não encontrado em $repoRoot — pulando execução local. Copie '.env.prod.example' para '.env.prod', ajuste os segredos e rode novamente (ou apenas 'docker compose -f docker-compose.prod.yml --env-file .env.prod up -d')."
        return
    }

    Write-Host "`n==> Subindo o stack localmente (docker-compose.prod.yml)" -ForegroundColor Yellow
    docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao subir o stack local via 'docker compose -f docker-compose.prod.yml up -d --build'."
    }

    Write-Host "`nStack em execução localmente (db + api + web)." -ForegroundColor Green
    Write-Host "Confira as portas publicadas com: docker compose -f docker-compose.prod.yml ps" -ForegroundColor Green
}
finally {
    Pop-Location
}
