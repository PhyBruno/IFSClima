<#
.SYNOPSIS
    Builda e grava o firmware da estação no ESP32 (NodeMCU) e abre o monitor serial.

.DESCRIPTION
    Atalho para o ciclo de bancada do firmware (`firmware/`, PlatformIO):
      1. localiza o `pio` e usa `PLATFORMIO_CORE_DIR` curto (default `C:\pio` —
         evita o limite de 260 caracteres de caminho do Windows ao instalar o
         pacote pioarduino);
      2. garante `firmware/include/secrets.h` (copia de `secrets.example.h` se
         faltar) e, com `-Editar`, abre no Bloco de Notas antes do build;
      3. mostra um resumo do secrets.h (senha mascarada) e avisa se ainda há
         valores de exemplo;
      4. detecta a porta COM do ESP32 (CP210x/CH340/FTDI/USB nativo);
      5. `pio run -e <env> -t upload` e, em seguida, `pio device monitor`.

    Sem `-Env`, mostra um menu com os ambientes mais usados.

.PARAMETER Env
    Ambiente do platformio.ini: esp32 (produção), esp32_rapido (ciclo de 1 min),
    bench_b7_wifi_eap (descobre o método EAP da rede), bench_b8_envio, etc.

.PARAMETER Porta
    Porta COM (ex.: COM3). Default: detecta automaticamente.

.PARAMETER Editar
    Abre o secrets.h no Bloco de Notas antes do build (espera fechar).

.PARAMETER Limpar
    Faz `pio run -t clean` antes do build.

.PARAMETER SemMonitor
    Só grava — não abre o monitor serial.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .scripts/firmware-gravar.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .scripts/firmware-gravar.ps1 -Env bench_b7_wifi_eap -Editar

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .scripts/firmware-gravar.ps1 -Env esp32_rapido -Porta COM3
#>
[CmdletBinding()]
param(
    [string]$Env,
    [string]$Porta,
    [switch]$Editar,
    [switch]$Limpar,
    [switch]$SemMonitor
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Pio {
    param([string[]]$Arguments)
    & $script:Pio @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "pio $($Arguments -join ' ') falhou (exit $LASTEXITCODE)."
    }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FirmwareDir = Join-Path $RepoRoot "firmware"
$Secrets = Join-Path $FirmwareDir "include\secrets.h"
$SecretsExemplo = Join-Path $FirmwareDir "include\secrets.example.h"

# ---------------- PlatformIO ----------------
if (-not $env:PLATFORMIO_CORE_DIR) { $env:PLATFORMIO_CORE_DIR = "C:\pio" }

$script:Pio = (Get-Command pio -ErrorAction SilentlyContinue).Source
if (-not $script:Pio) {
    $candidatos = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\Scripts\pio.exe"),
        (Join-Path $env:USERPROFILE ".platformio\penv\Scripts\pio.exe"),
        "C:\pio\penv\Scripts\pio.exe"
    )
    $script:Pio = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $script:Pio) {
    throw "PlatformIO não encontrado. Instale com: python -m pip install platformio"
}

# ---------------- Ambiente ----------------
if (-not $Env) {
    Write-Host ""
    Write-Host "Qual firmware gravar?" -ForegroundColor Cyan
    Write-Host "  1) esp32              - produção (leituras no intervalo normal)"
    Write-Host "  2) esp32_rapido       - bancada: lê a cada 1 min, envia a cada 2 leituras"
    Write-Host "  3) bench_b7_wifi_eap  - testa as combinações EAP (PEAP/TTLS) da rede"
    Write-Host "  4) bench_b8_envio     - testa Wi-Fi + NTP + POST na API"
    Write-Host "  5) outro (digitar o nome do env)"
    $opcao = Read-Host "Opção [2]"
    switch ($opcao) {
        "1" { $Env = "esp32" }
        "3" { $Env = "bench_b7_wifi_eap" }
        "4" { $Env = "bench_b8_envio" }
        "5" { $Env = Read-Host "Nome do env" }
        default { $Env = "esp32_rapido" }
    }
    if (-not $Editar) {
        $resp = Read-Host "Abrir o secrets.h para editar Wi-Fi/API antes? (s/N)"
        if ($resp -match '^[sSyY]') { $Editar = $true }
    }
}

# ---------------- secrets.h ----------------
if (-not (Test-Path $Secrets)) {
    Copy-Item $SecretsExemplo $Secrets
    Write-Host "secrets.h criado a partir do secrets.example.h — preencha antes de gravar." -ForegroundColor Yellow
    $Editar = $true
}
if ($Editar) {
    Write-Step "Abrindo secrets.h (feche o Bloco de Notas para continuar)"
    Start-Process notepad.exe -ArgumentList "`"$Secrets`"" -Wait
}

$texto = Get-Content $Secrets -Raw -Encoding UTF8
function Get-Define([string]$nome) {
    $m = [regex]::Match($texto, "(?m)^\s*#define\s+$nome\s+(.+?)(\s+//.*)?\s*$")
    if ($m.Success) { return $m.Groups[1].Value.Trim() } else { return "(não definido)" }
}
$senha = Get-Define "WIFI_SENHA"
Write-Step "Configuração (secrets.h)"
Write-Host "  WIFI_SSID      $(Get-Define 'WIFI_SSID')"
Write-Host "  WIFI_METODO    $(Get-Define 'WIFI_METODO')"
Write-Host "  WIFI_FASE2     $(Get-Define 'WIFI_FASE2')   (só vale para TTLS)"
Write-Host "  WIFI_USUARIO   $(Get-Define 'WIFI_USUARIO')"
Write-Host "  WIFI_SENHA     $(if ($senha -match '^""$') { '(vazia)' } else { '********' })"
Write-Host "  WIFI_CA_PEM    $(if ((Get-Define 'WIFI_CA_PEM') -eq 'nullptr') { 'nullptr (não valida o RADIUS)' } else { 'certificado definido' })"
Write-Host "  API_URL        $(Get-Define 'API_URL')"
Write-Host "  STATION_ID     $(Get-Define 'STATION_ID')"

$avisos = @()
if ($texto -match '"SUA_SENHA"') { $avisos += "WIFI_SENHA ainda é o valor de exemplo." }
if ($texto -match 'usuario@ifsc\.edu\.br') { $avisos += "WIFI_USUARIO ainda é o valor de exemplo." }
if ($texto -match 'sua-api\.exemplo\.com') { $avisos += "API_URL ainda é o valor de exemplo." }
if ($avisos) {
    foreach ($a in $avisos) { Write-Host "  AVISO: $a" -ForegroundColor Yellow }
    $resp = Read-Host "Continuar mesmo assim? (s/N)"
    if ($resp -notmatch '^[sSyY]') { Write-Host "Cancelado."; exit 1 }
}

# ---------------- Porta ----------------
if (-not $Porta) {
    Write-Step "Detectando a porta do ESP32"
    $json = (& $script:Pio device list --serial --json-output) -join ""
    # No PS 5.1 o ConvertFrom-Json emite o array inteiro como um item só — o
    # ForEach-Object desenrola antes de filtrar.
    $portas = @($json | ConvertFrom-Json | ForEach-Object { $_ } | Where-Object {
        $_.hwid -match 'VID:PID=(10C4|1A86|0403|303A):'
    })
    if (-not $portas) {
        throw "Nenhum ESP32 encontrado. Confira o cabo USB (precisa ser de dados) e o driver CP210x no Gerenciador de Dispositivos, ou passe -Porta COMx."
    }
    if (@($portas).Count -gt 1) {
        $portas | ForEach-Object { Write-Host "  $($_.port)  $($_.description)" }
        $Porta = Read-Host "Mais de um dispositivo — qual porta?"
    } else {
        $Porta = @($portas)[0].port
        Write-Host "  $Porta  $(@($portas)[0].description)"
    }
}

# ---------------- Build + gravação ----------------
Push-Location $FirmwareDir
try {
    if ($Limpar) {
        Write-Step "Limpando build ($Env)"
        Invoke-Pio @("run", "-e", $Env, "-t", "clean")
    }
    Write-Step "Build + gravação: env '$Env' em $Porta"
    Write-Host "  (se travar em 'Connecting...', segure o botão BOOT da placa até começar a gravar)"
    Invoke-Pio @("run", "-e", $Env, "-t", "upload", "--upload-port", $Porta)

    if (-not $SemMonitor) {
        Write-Step "Monitor serial em $Porta (Ctrl+C para sair)"
        & $script:Pio device monitor -e $Env -p $Porta
    }
} finally {
    Pop-Location
}
