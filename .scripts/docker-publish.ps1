<#
.SYNOPSIS
    Builda as imagens de produção (api, web) e publica no Docker Hub.

.DESCRIPTION
    Usa o stage `runtime` de cada Dockerfile (api/Dockerfile, web/Dockerfile).
    Versão "progressiva" = número de commits do branch atual (git rev-list
    --count HEAD), monotonicamente crescente a cada commit. Cada serviço
    recebe duas tags no MESMO repositório Docker Hub:
      <repo>:api-<versao>   <repo>:api-latest
      <repo>:web-<versao>   <repo>:web-latest

.PARAMETER DockerHubRepo
    Repositório Docker Hub de destino (ex: "usuario/ifsclima"). Se omitido,
    usa a variável de ambiente DOCKERHUB_REPO.

.PARAMETER SkipPush
    Só builda e tageia localmente, sem enviar ao Docker Hub. Útil para testar
    o script sem estar logado / sem consumir rate limit do registry.

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
    [switch]$SkipPush
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

    Write-Host "`nConcluído. Imagens publicadas em ${DockerHubRepo}:" -ForegroundColor Green
    foreach ($service in $services) {
        Write-Host "  - ${service}-${version}"
        Write-Host "  - ${service}-latest"
    }
}
finally {
    Pop-Location
}
