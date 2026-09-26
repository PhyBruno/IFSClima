# F9 · Firmware ESP32 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever o firmware da estação (hoje MicroPython em `RPI/`) em C++ para o NodeMCU ESP32, conectando na rede WPA2-Enterprise do IFSC e preservando toda a lógica validada (ciclo com lightsleep, chuva por pulsos, buffer à prova de queda de energia, envio idempotente em lotes).

**Architecture:** Projeto PlatformIO em `firmware/`. `lib/core` contém só lógica pura (sem Arduino/ESP-IDF, exceto o atributo IRAM), testada no PC com Unity (`env:native`). `lib/hal` adapta o hardware (LittleFS, Wire, ADC, GPIO/sono, Wi-Fi EAP, HTTPS, NTP, RTC memory). `src/app/main.cpp` orquestra o ciclo, e `src/bench/*.cpp` são sketches de bancada, cada um com seu env.

**Tech Stack:** Arduino-ESP32 core 3.3.12 (ESP-IDF 5.5) via pioarduino, PlatformIO Core 6.2, ArduinoJson 7, Unity, gcovr, GitHub Actions.

**Spec:** `.specs/features/f9-firmware-esp32/spec.md`

## Global Constraints

- Plataforma fixada: `https://github.com/pioarduino/platform-espressif32/releases/download/55.03.312-1/platform-espressif32.zip` (Arduino 3.3.12). A plataforma oficial `espressif32` do PlatformIO traz o Arduino 2.x, sem `ttls_phase2_type`.
- Placa: `esp32dev` (ESP32-D0WD-V3 rev 3.1, WROOM-32, flash 4 MB, CP2102 em COM3).
- Contrato da API **inalterado**: `POST API_URL`, headers `Content-Type: application/json` + `X-API-Key`, corpo `{"station_id": "...", "readings": [...]}`, sucesso só com HTTP 2xx (a API usa 202).
- `timestamp` em ISO 8601 UTC com milissegundos e sufixo `Z` (ex.: `2026-01-01T00:15:00.000Z`).
- Nenhuma leitura recebe timestamp inventado. Linhas sem hora levam `_boot` + `_up_ms` e nunca são enviadas.
- `lib/core` **não** inclui `Arduino.h` nem headers do ESP-IDF (única exceção: `esp_attr.h` via `core_attr.h`, só sob `ESP_PLATFORM`).
- Sensores em 3V3. Pinos: I2C SDA=21 SCL=22, chuva=27, UV=33 (ADC1_CH5), LED=2.
- Cobertura ≥ 80% de linhas em `lib/core` (gcovr).
- `firmware/include/secrets.h` nunca é versionado (só `secrets.example.h`).
- Política do repo: ao fim de cada task verde, um commit com mensagem descritiva terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `git push origin main`.
- Mensagens de log e comentários em português. Identificadores em português, seguindo o firmware atual.
- `pio` local = `"$HOME/.platformio/penv/Scripts/platformio.exe"` (Git Bash). No CI, `pio`.

## Review Focus

- Primeiro boot, sem `buffer.jsonl`: `contar()` = 0, lote vazio, `removerInicio` não quebra, `adicionar` cria o arquivo (teste na Task 7).
- Linha maior que o bloco de leitura de 128 B (vários `*_erro` longos): é lida inteira, sem ser cortada em duas (teste na Task 7).
- Leitura datada **sem** `chuva_tips` (pluviômetro falhou) recebendo a chuva de leituras descartadas: ganha `chuva_tips` e `rain_mm` corretos (teste na Task 8).
- Leitura pendente com `_up_ms` anterior ao instante do sync: timestamp calculado no passado, não no futuro (teste na Task 3).
- Ímã parado sobre o sensor no boot (pino já no nível de pulso): nenhuma contagem ao iniciar (teste na Task 4).

---

## Mapa de arquivos

```
.github/workflows/firmware.yml         CI: testes native + cobertura + build esp32
.gitignore                             + firmware/.pio, firmware/include/secrets.h
firmware/
  platformio.ini                       envs: esp32, esp32_rapido, native, bench_*
  README.md                            instalação, pinagem, roteiro de bancada
  include/config.h                     constantes (sem segredo)
  include/secrets.example.h            modelo de credenciais
  lib/core/src/
    core_attr.h                        CORE_IRAM (IRAM_ATTR só no ESP32)
    texto.h / texto.cpp                aparar(), arredondar()
    agenda.h / agenda.cpp              proximoAlvo()  (era "schedule": o MinGW tem um <schedule.h> de sistema)
    iso_time.h / iso_time.cpp          formatarIso(), epochDaDataDeBuild(), RefHora, epochMsEm()
    rain_logic.h / rain_logic.cpp      ContadorChuva
    rtc_state.h / rtc_state.cpp        EstadoRtc, selarRtc(), lerRtc()
    bme280_math.h / bme280_math.cpp    identificarChip(), decodificarCalib(), compensarBme()
    uv_math.h / uv_math.cpp            indiceUv(), mediana(), avaliarUv()
    sensor.h / sensor.cpp              Sensor, lerTodos(), escreverChuva()
    fs_iface.h                         IArquivo, ISistemaArquivos
    leitor_linhas.h / leitor_linhas.cpp  LeitorLinhas
    buffer.h / buffer.cpp              Buffer, leituraValida()
    pendentes.h / pendentes.cpp        arquivoTemPendentes(), resolverPendentes()
    envio.h / envio.cpp                montarPayload(), enviarBuffer()
  lib/testsupport/src/mem_fs.h         SistemaArquivosMemoria (só testes native)
  lib/hal/src/
    fs_littlefs.h / .cpp               SistemaArquivosLittleFs, montarLittleFs()
    clock_hal.h / .cpp                 uptimeMs(), contador de boot (NVS), hora do sistema
    rtc_hal.h / .cpp                   estado em RTC_NOINIT (tips + horaOk)
    wdt_hal.h / .cpp                   task watchdog (iniciar/alimentar/pausar/retomar)
    sensores_hal.h / .cpp              SensorBme280, SensorUv, SensorChuva
    rain_hal.h / .cpp                  ISR + wake por nível alternado
    sleep_hal.h / .cpp                 dormirAte()
    net_hal.h / .cpp                   Wi-Fi PSK/EAP, NTP, POST HTTP(S)
  src/app/main.cpp                     ciclo da estação
  src/bench/b0_placa.cpp … b9_consumo.cpp
  test/test_native/test_*/test_main.cpp
  test/test_embedded/test_littlefs/test_main.cpp
```

---

### Task 1: Toolchain, scaffold PlatformIO e CI

**Files:**
- Create: `firmware/platformio.ini`, `firmware/include/config.h`, `firmware/include/secrets.example.h`, `firmware/src/app/main.cpp` (provisório), `firmware/lib/core/src/core_attr.h`, `firmware/lib/core/src/texto.h`, `firmware/lib/core/src/texto.cpp`, `firmware/test/test_native/test_texto/test_main.cpp`, `.github/workflows/firmware.yml`
- Modify: `.gitignore` (append)

**Interfaces:**
- Produces: `core::aparar(const std::string&) -> std::string`, `core::arredondar(double, int) -> double`, macro `CORE_IRAM`, constantes de `config.h` (nomes exatos abaixo), `hal::MetodoWifi`/`hal::Fase2` referenciados por `secrets.example.h` (definidos na Task 13; até lá o `main.cpp` provisório não inclui `secrets.h`).

- [ ] **Step 1: Instalar o compilador de host (MinGW-w64) para os testes native**

Pedir confirmação ao usuário antes (é instalação na máquina). Depois:

```bash
winget install -e --id BrechtSanders.WinLibs.POSIX.UCRT --accept-source-agreements --accept-package-agreements
```

Abrir um shell novo e conferir: `g++ --version` e `gcov --version` devem responder. Se o PATH não for atualizado, localizar `mingw64/bin` em `%LOCALAPPDATA%\Microsoft\WinGet\Packages\BrechtSanders.WinLibs*` e acrescentá-lo ao PATH do usuário.

Instalar o gcovr no penv do PlatformIO:

```bash
"$HOME/.platformio/penv/Scripts/python.exe" -m pip install gcovr
```

- [ ] **Step 2: Criar `firmware/platformio.ini`**

```ini
; IFSClima — firmware da estação (NodeMCU ESP32)
; Envs: esp32 (produção), esp32_rapido (ciclo de 1 min p/ bancada),
;       native (testes no PC), bench_* (sketches de bancada).

[platformio]
default_envs = esp32

[common_esp32]
platform = https://github.com/pioarduino/platform-espressif32/releases/download/55.03.312-1/platform-espressif32.zip
board = esp32dev
framework = arduino
monitor_speed = 115200
monitor_filters = esp32_exception_decoder, time
board_build.filesystem = littlefs
lib_deps = bblanchon/ArduinoJson@^7.4.2
lib_ignore = testsupport
build_flags = -Wall -Wextra

[env:esp32]
extends = common_esp32
build_src_filter = +<app/>
test_filter = test_embedded/*

[env:esp32_rapido]
extends = env:esp32
build_flags = ${common_esp32.build_flags} -DCFG_INTERVALO_LEITURA_MIN=1 -DCFG_LEITURAS_POR_ENVIO=2

[env:native]
platform = native
test_framework = unity
lib_deps = bblanchon/ArduinoJson@^7.4.2
lib_ignore = hal
build_src_filter = -<*>
build_flags = -std=gnu++17 -Wall -Wextra -DUNITY_INCLUDE_DOUBLE -lgcov --coverage -fprofile-abs-path
test_filter = test_native/*
```

- [ ] **Step 3: Criar `firmware/include/config.h`**

```cpp
#pragma once
// config.h — configuração da estação. Versionado: NÃO coloque segredos aqui
// (credenciais ficam em secrets.h, fora do git).
#include <stdint.h>

// ---------------- Ciclos ----------------
// Os CFG_* podem ser sobrescritos por build flag (ver env:esp32_rapido).
#ifndef CFG_INTERVALO_LEITURA_MIN
#define CFG_INTERVALO_LEITURA_MIN 15
#endif
#ifndef CFG_LEITURAS_POR_ENVIO
#define CFG_LEITURAS_POR_ENVIO 4
#endif
constexpr uint32_t INTERVALO_LEITURA_MIN = CFG_INTERVALO_LEITURA_MIN;  // lê os sensores a cada 15 min
constexpr uint32_t LEITURAS_POR_ENVIO = CFG_LEITURAS_POR_ENVIO;        // 4 x 15 min = tenta enviar a cada 1 h

// true  = lightsleep (campo/bateria; chuva acorda a placa por nível no pino)
// false = espera acordada em fatias de 1 s (debug via USB; ainda conta chuva)
constexpr bool MODO_ECONOMIA = true;

// Leituras por POST. Envio em lotes evita montar um payload gigante na RAM
// quando a estação ficou muito tempo offline.
constexpr uint32_t TAMANHO_LOTE_ENVIO = 50;

// Teto do buffer em flash. 5000 leituras ≈ 52 dias offline ≈ 900 KB
// (a partição padrão de 4 MB deixa ~1,4 MB para o LittleFS). 0 = sem limite.
constexpr uint32_t MAX_LEITURAS_BUFFER = 5000;
constexpr const char* ARQ_DADOS = "/buffer.jsonl";

// Sincroniza o NTP a cada envio; mesmo com o buffer vazio, liga o Wi-Fi para
// ressincronizar se o último sync tiver mais que isto.
constexpr uint32_t RESYNC_NTP_MAX_H = 24;

// ---------------- Rede ----------------
constexpr uint32_t WIFI_TIMEOUT_S = 30;   // EAP é bem mais lento que WPA2-PSK
constexpr uint32_t API_TIMEOUT_S = 15;
constexpr uint32_t NTP_TIMEOUT_S = 15;
constexpr uint32_t NTP_TENTATIVAS = 3;
constexpr uint32_t WDT_TIMEOUT_S = 120;   // cobre handshake EAP + TLS com folga

// =====================================================================
//                         PINOS DOS SENSORES
// =====================================================================

// ---- BME280/BMP280 (I2C) ----
constexpr int I2C_SDA = 21;
constexpr int I2C_SCL = 22;
constexpr uint32_t I2C_FREQ = 100000;
constexpr uint8_t BME280_ADDR = 0x76;     // 0x77 se o SDO estiver em VCC

// ---- Pluviômetro de báscula — módulo KY-025 (reed + LM393) ----
//     +  -> 3V3   |   G -> GND   |   D0 -> GPIO27   |   A0 -> não usado
// NUNCA alimente o módulo em 5 V: o D0 acompanha a alimentação e o ESP32
// não tolera 5 V nos GPIOs.
constexpr int RAIN_GAUGE_PIN = 27;
static_assert(RAIN_GAUGE_PIN < 32, "a ISR le GPIO_IN_REG: o pino precisa ser < 32");

// A RECONFERIR NO ESP32 (valores medidos em bancada no Pico 2 W):
//  - MM_PER_TIP provisório; calibrar com bench/b4_calibrar_chuva:
//      MM_PER_TIP = (volume_mL / n_basculas) / (pi * (diametro_cm/2)^2) * 10
//  - no KY-025 o D0 fica em 0 em repouso e vai a 1 com o ímã: pulso em ALTO,
//    evento na borda de SUBIDA (RAIN_ON_FALLING = false). Conferir com b3.
//  - menor intervalo entre bordas medido: 353 ms; 150 ms de debounce é folga.
constexpr double MM_PER_TIP = 0.2;
constexpr uint32_t RAIN_DEBOUNCE_MS = 150;
constexpr bool RAIN_PULL_UP = true;       // saída do LM393 é coletor aberto
constexpr bool RAIN_ON_FALLING = false;

// ---- UV (GUVA-S12SD analógico) ----
// ADC1 (GPIO32-39) funciona com o Wi-Fi ligado; o ADC2 não. GPIO33 tem pull
// interno, o que permite o teste de fio solto do b5.
constexpr int UV_GUVA_PIN = 33;           // ADC1_CH5, atenuação 6 dB (até ~1750 mV)
// A RECONFERIR NO ESP32: acima disto é eletricamente impossível para o GUVA
// (índice 11 = 1170 mV) — é fio solto/ADC saturado, não sol.
constexpr double UV_LIMITE_SOLTO_MV = 1650.0;

// ---- LED de status ----
constexpr int LED_PIN = 2;                // LED azul da NodeMCU-32S
```

- [ ] **Step 4: Criar `firmware/include/secrets.example.h`**

```cpp
#pragma once
// ======================================================================
// secrets.h — credenciais da estação. NÃO VERSIONAR.
// Copie este arquivo para include/secrets.h e preencha.
// Os tipos hal::MetodoWifi / hal::Fase2 vêm de lib/hal/src/net_hal.h.
// ======================================================================

// ---------------- Wi-Fi ----------------
// Precisa ser uma rede de 2,4 GHz: as "-Turbo" do IFSC são 5 GHz e o ESP32
// não as enxerga.
#define WIFI_SSID "IFSC-ADM"
// hal::MetodoWifi::PSK  (WPA2 pessoal — rede de casa/bancada)
// hal::MetodoWifi::PEAP ou hal::MetodoWifi::TTLS (WPA2-Enterprise)
#define WIFI_METODO hal::MetodoWifi::PEAP
// Só vale para TTLS: EAP, MSCHAPV2, MSCHAP, PAP ou CHAP.
// Use bench/b7_wifi_eap para descobrir qual a rede aceita.
#define WIFI_FASE2 hal::Fase2::MSCHAPV2
// Identidade externa (anônima). Vazio = usa o próprio usuário.
#define WIFI_IDENTIDADE ""
#define WIFI_USUARIO "usuario@ifsc.edu.br"
#define WIFI_SENHA "SUA_SENHA"
// Certificado CA do servidor RADIUS em PEM (R"(-----BEGIN CERTIFICATE----- ...)"),
// ou nullptr para NÃO validar o servidor (fica um aviso no log).
#define WIFI_CA_PEM nullptr

// ---------------- API ----------------
#define API_URL "https://sua-api.exemplo.com/api/v1/ingest"
#define API_KEY "whs_test_ABC123"   // INGEST_API_KEY da API
#define STATION_ID "main"
// true SÓ em bancada: aceita qualquer certificado TLS da API.
#define API_TLS_INSECURE false
```

- [ ] **Step 5: Criar `core_attr.h`, `texto.h`, `texto.cpp`**

`firmware/lib/core/src/core_attr.h`:

```cpp
#pragma once
// CORE_IRAM: coloca a função na IRAM quando compilado para o ESP32 (código
// chamado de ISR). No PC (testes native) vira nada.
#if defined(ESP_PLATFORM)
#include "esp_attr.h"
#define CORE_IRAM IRAM_ATTR
#else
#define CORE_IRAM
#endif
```

`firmware/lib/core/src/texto.h`:

```cpp
#pragma once
#include <string>

namespace core {

// Remove espaços, \r, \n e \t das pontas (equivalente ao str.strip() do Python).
std::string aparar(const std::string& s);

// Arredonda para 'casas' decimais (como o round() do firmware MicroPython).
double arredondar(double v, int casas);

}  // namespace core
```

`firmware/lib/core/src/texto.cpp`:

```cpp
#include "texto.h"

#include <cmath>

namespace core {

std::string aparar(const std::string& s) {
  const char* const brancos = " \t\r\n";
  const size_t ini = s.find_first_not_of(brancos);
  if (ini == std::string::npos) return std::string();
  const size_t fim = s.find_last_not_of(brancos);
  return s.substr(ini, fim - ini + 1);
}

double arredondar(double v, int casas) {
  const double f = std::pow(10.0, casas);
  return std::round(v * f) / f;
}

}  // namespace core
```

- [ ] **Step 6: Escrever o teste `test_texto` (inclui prova de que o ArduinoJson compila no PC)**

`firmware/test/test_native/test_texto/test_main.cpp`:

```cpp
#include <ArduinoJson.h>
#include <unity.h>

#include "texto.h"

void setUp() {}
void tearDown() {}

void test_aparar_remove_brancos_das_pontas() {
  TEST_ASSERT_EQUAL_STRING("abc", core::aparar("  abc \r\n").c_str());
  TEST_ASSERT_EQUAL_STRING("a b", core::aparar("\ta b\t").c_str());
}

void test_aparar_so_brancos_vira_vazio() {
  TEST_ASSERT_EQUAL_STRING("", core::aparar(" \r\n\t ").c_str());
  TEST_ASSERT_EQUAL_STRING("", core::aparar("").c_str());
}

void test_arredondar() {
  TEST_ASSERT_EQUAL_DOUBLE(0.6, core::arredondar(0.2 * 3, 3));
  TEST_ASSERT_EQUAL_DOUBLE(25.08, core::arredondar(25.0824779, 2));
  TEST_ASSERT_EQUAL_DOUBLE(0.126, core::arredondar(0.12649, 3));
}

void test_arduinojson_serializa_no_pc() {
  JsonDocument doc;
  doc["timestamp"] = "2026-01-01T00:15:00.000Z";
  doc["rain_mm"] = core::arredondar(0.2 * 3, 3);
  std::string s;
  serializeJson(doc, s);
  TEST_ASSERT_EQUAL_STRING("{\"timestamp\":\"2026-01-01T00:15:00.000Z\",\"rain_mm\":0.6}", s.c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_aparar_remove_brancos_das_pontas);
  RUN_TEST(test_aparar_so_brancos_vira_vazio);
  RUN_TEST(test_arredondar);
  RUN_TEST(test_arduinojson_serializa_no_pc);
  return UNITY_END();
}
```

- [ ] **Step 7: Rodar os testes native**

Run: `cd firmware && "$HOME/.platformio/penv/Scripts/platformio.exe" test -e native`
Expected: `4 test cases: 4 succeeded`. Na primeira execução o ArduinoJson é baixado.

- [ ] **Step 8: Criar o `main.cpp` provisório e compilar para o ESP32**

`firmware/src/app/main.cpp`:

```cpp
// Provisório (Task 1): só prova que a toolchain do ESP32 compila e grava.
// Substituído pelo ciclo completo na Task 14.
#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("[INFO] IFSClima firmware - scaffold");
}

void loop() { delay(1000); }
```

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" run -e esp32`
Expected: `SUCCESS`. A primeira execução baixa a plataforma pioarduino, com ~1 GB.

Conferir a assinatura EAP usada na Task 13 no framework baixado:

```bash
grep -n "ttls_phase2_type" "$HOME/.platformio/packages/framework-arduinoespressif32/libraries/WiFi/src/WiFiSTA.h" | head -3
```

Expected: linhas com `int ttls_phase2_type = -1`.

- [ ] **Step 9: Gravar e ver o boot na placa**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" run -e esp32 -t upload && "$HOME/.platformio/penv/Scripts/platformio.exe" device monitor -e esp32` (Ctrl+C sai; se a tela ficar vazia, apertar EN na placa).
Expected: `[INFO] IFSClima firmware - scaffold`.

- [ ] **Step 10: `.gitignore`, `secrets.h` local e CI**

Acrescentar ao `.gitignore` da raiz:

```gitignore

# firmware (PlatformIO)
firmware/.pio/
firmware/.vscode/
firmware/include/secrets.h
```

Criar o `secrets.h` local (fica fora do git): `cp firmware/include/secrets.example.h firmware/include/secrets.h`.

`.github/workflows/firmware.yml`:

```yaml
name: firmware

on:
  push:
    paths: ["firmware/**", ".github/workflows/firmware.yml"]
  pull_request:
    paths: ["firmware/**", ".github/workflows/firmware.yml"]

jobs:
  testes-e-build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: firmware
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - uses: actions/cache@v4
        with:
          path: ~/.platformio
          key: pio-${{ runner.os }}-${{ hashFiles('firmware/platformio.ini') }}
      - name: Instalar PlatformIO e gcovr
        run: pip install platformio gcovr
      - name: Testes native
        run: pio test -e native
      - name: Cobertura (lib/core >= 80%)
        run: gcovr --root . --filter 'lib/core/' --fail-under-line 80 --print-summary .pio/build/native
      - name: Build ESP32
        run: |
          cp include/secrets.example.h include/secrets.h
          pio run -e esp32
```

Conferir que `git status` **não** lista `firmware/include/secrets.h`.

- [ ] **Step 11: Commit**

```bash
git add .gitignore .github/workflows/firmware.yml firmware/platformio.ini firmware/include/config.h firmware/include/secrets.example.h firmware/src/app/main.cpp firmware/lib/core/src/core_attr.h firmware/lib/core/src/texto.h firmware/lib/core/src/texto.cpp firmware/test/test_native/test_texto/test_main.cpp
git commit -m "feat(firmware): scaffold PlatformIO do ESP32 com testes native e CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: Grade fixa de leituras (`schedule`)

**Files:**
- Create: `firmware/lib/core/src/schedule.h`, `firmware/lib/core/src/schedule.cpp`
- Test: `firmware/test/test_native/test_schedule/test_main.cpp`

**Interfaces:**
- Produces: `uint64_t core::proximoAlvo(uint64_t alvoAtual, uint64_t intervaloMs, uint64_t agoraMs)`

- [ ] **Step 1: Escrever o teste que falha**

`firmware/test/test_native/test_schedule/test_main.cpp`:

```cpp
#include <unity.h>

#include "schedule.h"

void setUp() {}
void tearDown() {}

static const uint64_t MIN15 = 15ULL * 60 * 1000;

void test_avanca_um_intervalo_sem_acumular_atraso() {
  // Alvo em 900000, leitura/envio terminou em 905000: o próximo é 1800000
  // (grade fixa), não 905000 + 15 min.
  TEST_ASSERT_EQUAL_UINT64(2 * MIN15, core::proximoAlvo(MIN15, MIN15, MIN15 + 5000));
}

void test_pula_alvos_ja_passados() {
  // Envio demorou 40 min: alvos de 30 e 45 min já passaram -> próximo em 60 min.
  TEST_ASSERT_EQUAL_UINT64(4 * MIN15, core::proximoAlvo(MIN15, MIN15, MIN15 + 40ULL * 60 * 1000));
}

void test_alvo_exatamente_agora_conta_como_passado() {
  TEST_ASSERT_EQUAL_UINT64(3 * MIN15, core::proximoAlvo(MIN15, MIN15, 2 * MIN15));
}

void test_intervalo_zero_nao_trava() {
  TEST_ASSERT_EQUAL_UINT64(12345, core::proximoAlvo(100, 0, 12345));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_avanca_um_intervalo_sem_acumular_atraso);
  RUN_TEST(test_pula_alvos_ja_passados);
  RUN_TEST(test_alvo_exatamente_agora_conta_como_passado);
  RUN_TEST(test_intervalo_zero_nao_trava);
  return UNITY_END();
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd firmware && "$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_schedule`
Expected: FAIL de compilação, `schedule.h: No such file or directory`.

- [ ] **Step 3: Implementar**

`firmware/lib/core/src/schedule.h`:

```cpp
#pragma once
#include <stdint.h>

namespace core {

// Próximo alvo da grade fixa de leituras: alvoAtual + intervalo, pulando os
// alvos que já passaram (<= agora). Grade fixa não acumula o tempo gasto
// lendo/enviando (sem deriva ao longo do dia) e, se um envio demorar mais
// que o intervalo, evita disparar leituras em rajada com timestamps quase
// iguais — a chuva acumulada cai inteira na próxima leitura.
uint64_t proximoAlvo(uint64_t alvoAtual, uint64_t intervaloMs, uint64_t agoraMs);

}  // namespace core
```

`firmware/lib/core/src/schedule.cpp`:

```cpp
#include "schedule.h"

namespace core {

uint64_t proximoAlvo(uint64_t alvoAtual, uint64_t intervaloMs, uint64_t agoraMs) {
  if (intervaloMs == 0) return agoraMs;
  uint64_t proximo = alvoAtual + intervaloMs;
  if (proximo <= agoraMs) {
    const uint64_t atraso = agoraMs - proximo;
    proximo += (atraso / intervaloMs + 1) * intervaloMs;
  }
  return proximo;
}

}  // namespace core
```

- [ ] **Step 4: Rodar e ver passar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_schedule`
Expected: `4 succeeded`.

- [ ] **Step 5: Commit**

```bash
git add firmware/lib/core/src/schedule.* firmware/test/test_native/test_schedule
git commit -m "feat(firmware): grade fixa de leituras que pula alvos perdidos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: Hora — ISO 8601, data do build e referência NTP (`iso_time`)

**Files:**
- Create: `firmware/lib/core/src/iso_time.h`, `firmware/lib/core/src/iso_time.cpp`
- Test: `firmware/test/test_native/test_iso_time/test_main.cpp`

**Interfaces:**
- Produces:
  - `constexpr size_t core::TAM_ISO = 32;`
  - `int64_t core::diasDesdeEpoch(int ano, unsigned mes, unsigned dia)`
  - `void core::formatarIso(int64_t epochMs, char* saida /* TAM_ISO */)`
  - `int64_t core::epochDaDataDeBuild(const char* data /* __DATE__ */)` → segundos, ou -1
  - `struct core::RefHora { bool valida; int64_t epochMs; uint64_t upMs; };`
  - `int64_t core::epochMsEm(const RefHora& ref, uint64_t upMs)`

- [ ] **Step 1: Escrever o teste que falha**

`firmware/test/test_native/test_iso_time/test_main.cpp`:

```cpp
#include <unity.h>

#include "iso_time.h"

void setUp() {}
void tearDown() {}

static void confere_iso(int64_t epochMs, const char* esperado) {
  char s[core::TAM_ISO];
  core::formatarIso(epochMs, s);
  TEST_ASSERT_EQUAL_STRING(esperado, s);
}

void test_formatar_iso() {
  confere_iso(0, "1970-01-01T00:00:00.000Z");
  confere_iso(1767225600123LL, "2026-01-01T00:00:00.123Z");
  confere_iso(1835440496789LL, "2028-02-29T12:34:56.789Z");  // dia bissexto
  confere_iso(946684799999LL, "1999-12-31T23:59:59.999Z");
}

void test_dias_desde_epoch() {
  TEST_ASSERT_EQUAL_INT64(0, core::diasDesdeEpoch(1970, 1, 1));
  TEST_ASSERT_EQUAL_INT64(20454, core::diasDesdeEpoch(2026, 1, 1));
}

void test_epoch_da_data_de_build() {
  TEST_ASSERT_EQUAL_INT64(1790121600LL, core::epochDaDataDeBuild("Sep 23 2026"));
  TEST_ASSERT_EQUAL_INT64(1767225600LL, core::epochDaDataDeBuild("Jan  1 2026"));  // formato do __DATE__
}

void test_epoch_da_data_de_build_invalida() {
  TEST_ASSERT_EQUAL_INT64(-1, core::epochDaDataDeBuild("Xyz 1 2026"));
  TEST_ASSERT_EQUAL_INT64(-1, core::epochDaDataDeBuild("anF  1 2026"));  // achado fora do alinhamento de 3 letras
  TEST_ASSERT_EQUAL_INT64(-1, core::epochDaDataDeBuild(""));
  TEST_ASSERT_EQUAL_INT64(-1, core::epochDaDataDeBuild(nullptr));
}

void test_epoch_ms_em_depois_da_referencia() {
  const core::RefHora ref{true, 1767225600000LL, 5000};
  // 900 s depois da referência -> 00:15:00
  TEST_ASSERT_EQUAL_INT64(1767226500000LL, core::epochMsEm(ref, 905000));
}

void test_epoch_ms_em_antes_da_referencia() {
  // Review Focus: leitura pendente feita ANTES do sync (up < ref.upMs)
  // tem que cair no passado.
  const core::RefHora ref{true, 1767225600000LL, 5000};
  TEST_ASSERT_EQUAL_INT64(1767225596000LL, core::epochMsEm(ref, 1000));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_formatar_iso);
  RUN_TEST(test_dias_desde_epoch);
  RUN_TEST(test_epoch_da_data_de_build);
  RUN_TEST(test_epoch_da_data_de_build_invalida);
  RUN_TEST(test_epoch_ms_em_depois_da_referencia);
  RUN_TEST(test_epoch_ms_em_antes_da_referencia);
  return UNITY_END();
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_iso_time`
Expected: FAIL de compilação, `iso_time.h: No such file or directory`.

- [ ] **Step 3: Implementar**

`firmware/lib/core/src/iso_time.h`:

```cpp
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace core {

constexpr size_t TAM_ISO = 32;  // "YYYY-MM-DDTHH:MM:SS.mmmZ" (24) + folga

// Dias desde 1970-01-01 para uma data do calendário gregoriano (UTC).
int64_t diasDesdeEpoch(int ano, unsigned mes, unsigned dia);

// Escreve epochMs como ISO 8601 UTC com milissegundos e sufixo Z — o formato
// que a API exige no campo "timestamp". 'saida' precisa de TAM_ISO bytes.
void formatarIso(int64_t epochMs, char* saida);

// Converte o __DATE__ do compilador ("Sep 23 2026") em epoch (s) da meia-noite
// UTC daquele dia. Usado como piso de hora no boot: a validação do
// certificado do RADIUS (EAP) falha com o relógio em 1970. Devolve -1 se inválido.
int64_t epochDaDataDeBuild(const char* data);

// Referência de hora: epoch (ms) medido no último sync + uptime (ms) no mesmo
// instante. O uptime vem do esp_timer (64 bits, compensado no lightsleep), então
// a hora de qualquer instante = epoch_ref + (uptime - uptime_ref).
struct RefHora {
  bool valida;
  int64_t epochMs;
  uint64_t upMs;
};

// Epoch (ms) correspondente ao uptime 'upMs' — que pode ser anterior à referência.
int64_t epochMsEm(const RefHora& ref, uint64_t upMs);

}  // namespace core
```

`firmware/lib/core/src/iso_time.cpp`:

```cpp
#include "iso_time.h"

#include <stdio.h>
#include <string.h>

namespace core {

// Algoritmos days_from_civil / civil_from_days de Howard Hinnant.
int64_t diasDesdeEpoch(int ano, unsigned mes, unsigned dia) {
  const int y = ano - (mes <= 2 ? 1 : 0);
  const int64_t era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(y - era * 400);
  const unsigned doy = (153 * (mes > 2 ? mes - 3 : mes + 9) + 2) / 5 + dia - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + static_cast<int64_t>(doe) - 719468;
}

static void civilDeDias(int64_t z, int& ano, unsigned& mes, unsigned& dia) {
  z += 719468;
  const int64_t era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = static_cast<unsigned>(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  dia = doy - (153 * mp + 2) / 5 + 1;
  mes = mp < 10 ? mp + 3 : mp - 9;
  ano = static_cast<int>(yoe) + static_cast<int>(era * 400) + (mes <= 2 ? 1 : 0);
}

void formatarIso(int64_t epochMs, char* saida) {
  if (epochMs < 0) epochMs = 0;
  const int64_t segs = epochMs / 1000;
  const int ms = static_cast<int>(epochMs % 1000);
  const int64_t resto = segs % 86400;
  int ano;
  unsigned mes, dia;
  civilDeDias(segs / 86400, ano, mes, dia);
  snprintf(saida, TAM_ISO, "%04d-%02u-%02uT%02d:%02d:%02d.%03dZ", ano, mes, dia,
           static_cast<int>(resto / 3600), static_cast<int>(resto % 3600 / 60),
           static_cast<int>(resto % 60), ms);
}

int64_t epochDaDataDeBuild(const char* data) {
  static const char MESES[] = "JanFebMarAprMayJunJulAugSepOctNovDec";
  if (data == nullptr || strlen(data) < 11) return -1;
  const char mes[4] = {data[0], data[1], data[2], '\0'};
  const char* p = strstr(MESES, mes);
  if (p == nullptr || (p - MESES) % 3 != 0) return -1;
  int dia = 0, ano = 0;
  if (sscanf(data + 3, "%d %d", &dia, &ano) != 2 || dia < 1 || dia > 31 || ano < 1970) return -1;
  return diasDesdeEpoch(ano, static_cast<unsigned>((p - MESES) / 3 + 1), static_cast<unsigned>(dia)) * 86400;
}

int64_t epochMsEm(const RefHora& ref, uint64_t upMs) {
  return ref.epochMs + (static_cast<int64_t>(upMs) - static_cast<int64_t>(ref.upMs));
}

}  // namespace core
```

- [ ] **Step 4: Rodar e ver passar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_iso_time`
Expected: `6 succeeded`.

- [ ] **Step 5: Commit**

```bash
git add firmware/lib/core/src/iso_time.* firmware/test/test_native/test_iso_time
git commit -m "feat(firmware): timestamp ISO 8601 UTC e referencia de hora por uptime

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: Contador de chuva com wake por nível alternado + estado em RTC memory

**Files:**
- Create: `firmware/lib/core/src/rain_logic.h`, `firmware/lib/core/src/rain_logic.cpp`, `firmware/lib/core/src/rtc_state.h`, `firmware/lib/core/src/rtc_state.cpp`
- Test: `firmware/test/test_native/test_rain_logic/test_main.cpp`

**Interfaces:**
- Produces:
  - `class core::ContadorChuva { ContadorChuva(bool pulsoEmAlto, uint32_t debounceMs); void sincronizar(bool nivelAlto); bool observar(bool nivelAlto, uint64_t agoraMs); bool acordarEmAlto() const; uint32_t retirar(); uint32_t pendentes() const; void somar(uint32_t tips); }`
  - `struct core::EstadoRtc { uint32_t magico, tips, horaOk, verificacao; }`, `constexpr uint32_t core::MAGICO_RTC`
  - `void core::selarRtc(EstadoRtc&, uint32_t tips, bool horaOk)` (IRAM), `bool core::lerRtc(const EstadoRtc&, uint32_t& tips, bool& horaOk)`

- [ ] **Step 1: Escrever o teste que falha**

`firmware/test/test_native/test_rain_logic/test_main.cpp`:

```cpp
#include <unity.h>

#include "rain_logic.h"
#include "rtc_state.h"

void setUp() {}
void tearDown() {}

// KY-025: repouso em 0, pulso (ímã perto) em 1.
static const bool ALTO = true;
static const bool BAIXO = false;

void test_uma_bascula_conta_uma_vez() {
  core::ContadorChuva c(true, 150);
  TEST_ASSERT_TRUE(c.observar(ALTO, 1000));
  TEST_ASSERT_FALSE(c.observar(BAIXO, 1400));  // fim do pulso não conta
  TEST_ASSERT_EQUAL_UINT32(1, c.pendentes());
}

void test_repique_dentro_do_debounce_nao_conta() {
  core::ContadorChuva c(true, 150);
  c.observar(ALTO, 1000);
  c.observar(BAIXO, 1050);
  TEST_ASSERT_FALSE(c.observar(ALTO, 1100));  // 100 ms < 150 ms
  c.observar(BAIXO, 1400);
  TEST_ASSERT_TRUE(c.observar(ALTO, 1150 + 1000));
  TEST_ASSERT_EQUAL_UINT32(2, c.pendentes());
}

void test_debounce_na_fronteira_conta() {
  core::ContadorChuva c(true, 150);
  c.observar(ALTO, 1000);
  c.observar(BAIXO, 1100);
  TEST_ASSERT_TRUE(c.observar(ALTO, 1150));  // exatamente 150 ms
}

void test_mesmo_nivel_repetido_nao_conta() {
  core::ContadorChuva c(true, 150);
  c.observar(ALTO, 1000);
  TEST_ASSERT_FALSE(c.observar(ALTO, 5000));  // ímã parado: nível não mudou
  TEST_ASSERT_EQUAL_UINT32(1, c.pendentes());
}

void test_ima_parado_no_boot_nao_conta() {
  // Review Focus: placa liga com o ímã em cima do sensor.
  core::ContadorChuva c(true, 150);
  c.sincronizar(ALTO);
  TEST_ASSERT_FALSE(c.observar(ALTO, 1000));
  TEST_ASSERT_EQUAL_UINT32(0, c.pendentes());
  TEST_ASSERT_FALSE(c.acordarEmAlto());  // espera o fim do pulso -> sem loop de despertares
}

void test_nivel_de_despertar_alterna() {
  core::ContadorChuva c(true, 150);
  TEST_ASSERT_TRUE(c.acordarEmAlto());   // em repouso, acorda no pulso
  c.observar(ALTO, 1000);
  TEST_ASSERT_FALSE(c.acordarEmAlto());  // em pulso, acorda na volta ao repouso
  c.observar(BAIXO, 1300);
  TEST_ASSERT_TRUE(c.acordarEmAlto());
}

void test_polaridade_invertida_reed_puro() {
  // Reed puro para o GND com pull-up: repouso em 1, pulso em 0.
  core::ContadorChuva c(false, 150);
  TEST_ASSERT_FALSE(c.acordarEmAlto());
  TEST_ASSERT_TRUE(c.observar(BAIXO, 1000));
  TEST_ASSERT_FALSE(c.observar(ALTO, 1300));
  TEST_ASSERT_EQUAL_UINT32(1, c.pendentes());
}

void test_retirar_zera_e_somar_restaura() {
  core::ContadorChuva c(true, 150);
  c.observar(ALTO, 1000);
  c.somar(4);
  TEST_ASSERT_EQUAL_UINT32(5, c.retirar());
  TEST_ASSERT_EQUAL_UINT32(0, c.pendentes());
}

void test_debounce_nao_trava_apos_muito_tempo() {
  // No Pico o ticks_ms dava a volta e travava a contagem após estiagem longa;
  // aqui o tempo é de 64 bits.
  core::ContadorChuva c(true, 150);
  c.observar(ALTO, 1000);
  c.observar(BAIXO, 1300);
  TEST_ASSERT_TRUE(c.observar(ALTO, 1000 + 60ULL * 24 * 3600 * 1000));
}

void test_rtc_ida_e_volta() {
  core::EstadoRtc e{};
  core::selarRtc(e, 7, true);
  uint32_t tips = 0;
  bool hora = false;
  TEST_ASSERT_TRUE(core::lerRtc(e, tips, hora));
  TEST_ASSERT_EQUAL_UINT32(7, tips);
  TEST_ASSERT_TRUE(hora);
}

void test_rtc_corrompido_e_rejeitado() {
  core::EstadoRtc e{};
  core::selarRtc(e, 7, false);
  uint32_t tips = 0;
  bool hora = false;
  e.tips = 8;
  TEST_ASSERT_FALSE(core::lerRtc(e, tips, hora));
  core::selarRtc(e, 7, false);
  e.magico = 0xDEADBEEF;
  TEST_ASSERT_FALSE(core::lerRtc(e, tips, hora));
  core::selarRtc(e, 7, false);
  e.horaOk = 2;
  TEST_ASSERT_FALSE(core::lerRtc(e, tips, hora));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_uma_bascula_conta_uma_vez);
  RUN_TEST(test_repique_dentro_do_debounce_nao_conta);
  RUN_TEST(test_debounce_na_fronteira_conta);
  RUN_TEST(test_mesmo_nivel_repetido_nao_conta);
  RUN_TEST(test_ima_parado_no_boot_nao_conta);
  RUN_TEST(test_nivel_de_despertar_alterna);
  RUN_TEST(test_polaridade_invertida_reed_puro);
  RUN_TEST(test_retirar_zera_e_somar_restaura);
  RUN_TEST(test_debounce_nao_trava_apos_muito_tempo);
  RUN_TEST(test_rtc_ida_e_volta);
  RUN_TEST(test_rtc_corrompido_e_rejeitado);
  return UNITY_END();
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_rain_logic`
Expected: FAIL de compilação, `rain_logic.h: No such file or directory`.

- [ ] **Step 3: Implementar `rain_logic`**

`firmware/lib/core/src/rain_logic.h`:

```cpp
#pragma once
#include <stdint.h>

namespace core {

// Contador de básculas do pluviômetro — máquina de estados do "wake por nível
// alternado". No ESP32, uma borda não acorda a placa do lightsleep; só um
// NÍVEL no pino. Então a placa dorme armada para acordar no nível OPOSTO ao
// último observado: em repouso, acorda no pulso (e conta); em pulso, acorda na
// volta ao repouso (e não conta). Um ímã parado sobre o sensor gera no máximo
// uma contagem e nenhum loop de despertares.
//
// Acordada, a IRQ de borda (CHANGE) chama observar() com o nível lido — mesma
// regra, mesmo debounce. observar() roda dentro da ISR: sem alocação.
class ContadorChuva {
 public:
  ContadorChuva(bool pulsoEmAlto, uint32_t debounceMs);

  // Registra o nível atual SEM contar (boot: o ímã pode já estar parado).
  void sincronizar(bool nivelAlto);

  // Registra o nível observado. Conta +1 só na transição repouso -> pulso,
  // se passou o debounce desde a última contagem. Devolve true se contou.
  bool observar(bool nivelAlto, uint64_t agoraMs);

  // Nível que deve acordar a placa: o oposto do último nível observado.
  bool acordarEmAlto() const;

  uint32_t retirar();  // devolve o acumulado e zera
  uint32_t pendentes() const;
  void somar(uint32_t tips);  // restaura tips (RTC memory / chuva de leituras descartadas)

 private:
  bool pulsoEmAlto_;
  uint32_t debounceMs_;
  bool ultimoAlto_;
  bool jaContou_;
  uint64_t ultimaContagemMs_;
  uint32_t tips_;
};

}  // namespace core
```

`firmware/lib/core/src/rain_logic.cpp`:

```cpp
#include "rain_logic.h"

#include "core_attr.h"

namespace core {

ContadorChuva::ContadorChuva(bool pulsoEmAlto, uint32_t debounceMs)
    : pulsoEmAlto_(pulsoEmAlto),
      debounceMs_(debounceMs),
      ultimoAlto_(!pulsoEmAlto),
      jaContou_(false),
      ultimaContagemMs_(0),
      tips_(0) {}

void ContadorChuva::sincronizar(bool nivelAlto) { ultimoAlto_ = nivelAlto; }

CORE_IRAM bool ContadorChuva::observar(bool nivelAlto, uint64_t agoraMs) {
  const bool eraPulso = (ultimoAlto_ == pulsoEmAlto_);
  const bool ehPulso = (nivelAlto == pulsoEmAlto_);
  ultimoAlto_ = nivelAlto;
  if (eraPulso || !ehPulso) return false;  // só repouso -> pulso conta
  if (jaContou_ && agoraMs >= ultimaContagemMs_ && agoraMs - ultimaContagemMs_ < debounceMs_) {
    return false;  // repique mecânico da mesma báscula
  }
  jaContou_ = true;
  ultimaContagemMs_ = agoraMs;
  ++tips_;
  return true;
}

bool ContadorChuva::acordarEmAlto() const { return !ultimoAlto_; }

uint32_t ContadorChuva::retirar() {
  const uint32_t t = tips_;
  tips_ = 0;
  return t;
}

CORE_IRAM uint32_t ContadorChuva::pendentes() const { return tips_; }

void ContadorChuva::somar(uint32_t tips) { tips_ += tips; }

}  // namespace core
```

- [ ] **Step 4: Implementar `rtc_state`**

`firmware/lib/core/src/rtc_state.h`:

```cpp
#pragma once
#include <stdint.h>

namespace core {

// Estado guardado em RTC_NOINIT_ATTR: sobrevive a reset por software, panic e
// watchdog (não a queda de energia). Guarda os tips ainda não gravados em
// flash e se a hora do sistema veio de um sync NTP de verdade (e não do piso
// da data do build). A verificação distingue estado válido de lixo de power-on.
struct EstadoRtc {
  uint32_t magico;
  uint32_t tips;
  uint32_t horaOk;  // 0 ou 1
  uint32_t verificacao;
};

constexpr uint32_t MAGICO_RTC = 0x43485556u;  // "CHUV"

void selarRtc(EstadoRtc& e, uint32_t tips, bool horaOk);
bool lerRtc(const EstadoRtc& e, uint32_t& tips, bool& horaOk);

}  // namespace core
```

`firmware/lib/core/src/rtc_state.cpp`:

```cpp
#include "rtc_state.h"

#include "core_attr.h"

namespace core {

static CORE_IRAM uint32_t calcularVerificacao(uint32_t tips, uint32_t horaOk) {
  return MAGICO_RTC ^ (tips * 2654435761u) ^ (horaOk ? 0x5A5A5A5Au : 0xA5A5A5A5u);
}

CORE_IRAM void selarRtc(EstadoRtc& e, uint32_t tips, bool horaOk) {
  e.magico = MAGICO_RTC;
  e.tips = tips;
  e.horaOk = horaOk ? 1u : 0u;
  e.verificacao = calcularVerificacao(e.tips, e.horaOk);
}

bool lerRtc(const EstadoRtc& e, uint32_t& tips, bool& horaOk) {
  if (e.magico != MAGICO_RTC || e.horaOk > 1u) return false;
  if (e.verificacao != calcularVerificacao(e.tips, e.horaOk)) return false;
  tips = e.tips;
  horaOk = e.horaOk == 1u;
  return true;
}

}  // namespace core
```

- [ ] **Step 5: Rodar e ver passar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_rain_logic`
Expected: `11 succeeded`.

- [ ] **Step 6: Commit**

```bash
git add firmware/lib/core/src/rain_logic.* firmware/lib/core/src/rtc_state.* firmware/test/test_native/test_rain_logic
git commit -m "feat(firmware): contador de chuva com wake por nivel alternado e estado em RTC

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5: Compensação do BME280/BMP280 (`bme280_math`)

**Files:**
- Create: `firmware/lib/core/src/bme280_math.h`, `firmware/lib/core/src/bme280_math.cpp`
- Test: `firmware/test/test_native/test_bme280/test_main.cpp`

**Interfaces:**
- Produces:
  - `enum class core::ChipBme { BME280, BMP280, DESCONHECIDO }`, `constexpr uint8_t core::CHIP_ID_BME280 = 0x60, core::CHIP_ID_BMP280 = 0x58`
  - `core::ChipBme core::identificarChip(uint8_t chipId)`
  - `struct core::CalibBme { uint16_t T1; int16_t T2, T3; uint16_t P1; int16_t P2, P3, P4, P5, P6, P7, P8, P9; uint8_t H1; int16_t H2; uint8_t H3; int16_t H4, H5; int8_t H6; }`
  - `core::CalibBme core::decodificarCalib(const uint8_t* tp /*24 bytes de 0x88*/, bool comUmidade, uint8_t h1 /*0xA1*/, const uint8_t* he /*7 bytes de 0xE1*/)`
  - `struct core::MedidaBme { double temperaturaC; double pressaoHpa; bool temUmidade; double umidadePct; }`
  - `core::MedidaBme core::compensarBme(const CalibBme&, const uint8_t* dados /*8 bytes (BME) ou 6 (BMP) de 0xF7*/, bool comUmidade)`

- [ ] **Step 1: Escrever o teste que falha**

Os valores de referência vêm do exemplo do datasheet Bosch (T1=27504 … P9=6000, adc_T=519888 → 25,08 °C, adc_P=415148 → 100653,27 Pa). A umidade usa uma calibração sintética, e o valor esperado foi calculado com a fórmula do `RPI/sensors/bme280.py`: 55,0007 %RH.

`firmware/test/test_native/test_bme280/test_main.cpp`:

```cpp
#include <unity.h>

#include "bme280_math.h"

void setUp() {}
void tearDown() {}

// Calibração do exemplo do datasheet, little-endian, a partir de 0x88.
static const uint8_t TP[24] = {
    0x70, 0x6B, 0x43, 0x67, 0x18, 0xFC,  // T1=27504 T2=26435 T3=-1000
    0x7D, 0x8E, 0x43, 0xD6, 0xD0, 0x0B,  // P1=36477 P2=-10685 P3=3024
    0x27, 0x0B, 0x8C, 0x00, 0xF9, 0xFF,  // P4=2855 P5=140 P6=-7
    0x8C, 0x3C, 0xF8, 0xC6, 0x70, 0x17,  // P7=15500 P8=-14600 P9=6000
};
static const uint8_t H1 = 75;
// H2=362 H3=0 H4=313 H5=50 H6=30
static const uint8_t HE[7] = {0x6A, 0x01, 0x00, 0x13, 0x29, 0x03, 0x1E};

// adc_P=415148 (0x655AC), adc_T=519888 (0x7EED0), adc_H=30000 (0x7530)
static const uint8_t DADOS[8] = {0x65, 0x5A, 0xC0, 0x7E, 0xED, 0x00, 0x75, 0x30};

void test_identificar_chip() {
  TEST_ASSERT_TRUE(core::identificarChip(0x60) == core::ChipBme::BME280);
  TEST_ASSERT_TRUE(core::identificarChip(0x58) == core::ChipBme::BMP280);
  TEST_ASSERT_TRUE(core::identificarChip(0x55) == core::ChipBme::DESCONHECIDO);
}

void test_decodificar_calib() {
  const core::CalibBme c = core::decodificarCalib(TP, true, H1, HE);
  TEST_ASSERT_EQUAL_UINT16(27504, c.T1);
  TEST_ASSERT_EQUAL_INT16(26435, c.T2);
  TEST_ASSERT_EQUAL_INT16(-1000, c.T3);
  TEST_ASSERT_EQUAL_UINT16(36477, c.P1);
  TEST_ASSERT_EQUAL_INT16(-10685, c.P2);
  TEST_ASSERT_EQUAL_INT16(-7, c.P6);
  TEST_ASSERT_EQUAL_INT16(-14600, c.P8);
  TEST_ASSERT_EQUAL_INT16(6000, c.P9);
  TEST_ASSERT_EQUAL_UINT8(75, c.H1);
  TEST_ASSERT_EQUAL_INT16(362, c.H2);
  TEST_ASSERT_EQUAL_UINT8(0, c.H3);
  TEST_ASSERT_EQUAL_INT16(313, c.H4);
  TEST_ASSERT_EQUAL_INT16(50, c.H5);
  TEST_ASSERT_EQUAL_INT8(30, c.H6);
}

void test_h4_h5_negativos() {
  // he[3] e he[5] com sinal: H4 = (-2 << 4) | 9 = -23 ; H5 = (-1 << 4) | 2 = -14
  const uint8_t he[7] = {0x6A, 0x01, 0x00, 0xFE, 0x29, 0xFF, 0x1E};
  const core::CalibBme c = core::decodificarCalib(TP, true, H1, he);
  TEST_ASSERT_EQUAL_INT16(-23, c.H4);
  TEST_ASSERT_EQUAL_INT16(-14, c.H5);
}

void test_compensar_exemplo_do_datasheet() {
  const core::CalibBme c = core::decodificarCalib(TP, true, H1, HE);
  const core::MedidaBme m = core::compensarBme(c, DADOS, true);
  TEST_ASSERT_DOUBLE_WITHIN(0.005, 25.0825, m.temperaturaC);
  TEST_ASSERT_DOUBLE_WITHIN(0.005, 1006.5327, m.pressaoHpa);
  TEST_ASSERT_TRUE(m.temUmidade);
  TEST_ASSERT_DOUBLE_WITHIN(0.005, 55.0007, m.umidadePct);
}

void test_umidade_limitada_a_100() {
  const core::CalibBme c = core::decodificarCalib(TP, true, H1, HE);
  const uint8_t dados[8] = {0x65, 0x5A, 0xC0, 0x7E, 0xED, 0x00, 0xEA, 0x60};  // adc_H=60000
  TEST_ASSERT_EQUAL_DOUBLE(100.0, core::compensarBme(c, dados, true).umidadePct);
}

void test_bmp280_sem_umidade() {
  const core::CalibBme c = core::decodificarCalib(TP, false, 0, nullptr);
  const core::MedidaBme m = core::compensarBme(c, DADOS, false);  // só 6 bytes usados
  TEST_ASSERT_FALSE(m.temUmidade);
  TEST_ASSERT_DOUBLE_WITHIN(0.005, 25.0825, m.temperaturaC);
}

void test_p1_zero_nao_divide_por_zero() {
  core::CalibBme c = core::decodificarCalib(TP, false, 0, nullptr);
  c.P1 = 0;
  TEST_ASSERT_EQUAL_DOUBLE(0.0, core::compensarBme(c, DADOS, false).pressaoHpa);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_identificar_chip);
  RUN_TEST(test_decodificar_calib);
  RUN_TEST(test_h4_h5_negativos);
  RUN_TEST(test_compensar_exemplo_do_datasheet);
  RUN_TEST(test_umidade_limitada_a_100);
  RUN_TEST(test_bmp280_sem_umidade);
  RUN_TEST(test_p1_zero_nao_divide_por_zero);
  return UNITY_END();
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_bme280`
Expected: FAIL de compilação, `bme280_math.h: No such file or directory`.

- [ ] **Step 3: Implementar**

`firmware/lib/core/src/bme280_math.h`:

```cpp
#pragma once
#include <stdint.h>

namespace core {

// BME280 (temperatura + pressão + UMIDADE) e BMP280 (sem umidade) são pino a
// pino e endereço a endereço iguais e vivem sendo trocados nos módulos GY-*.
// O chip é identificado pelo registrador 0xD0. Num BMP280 os registradores de
// umidade não existem: a conta produziria um número plausível porém falso, por
// isso a umidade é OMITIDA (melhor campo ausente que dado inventado).
enum class ChipBme { BME280, BMP280, DESCONHECIDO };
constexpr uint8_t CHIP_ID_BME280 = 0x60;
constexpr uint8_t CHIP_ID_BMP280 = 0x58;

ChipBme identificarChip(uint8_t chipId);

struct CalibBme {
  uint16_t T1;
  int16_t T2, T3;
  uint16_t P1;
  int16_t P2, P3, P4, P5, P6, P7, P8, P9;
  uint8_t H1;
  int16_t H2;
  uint8_t H3;
  int16_t H4, H5;
  int8_t H6;
};

// tp: 24 bytes lidos a partir de 0x88. h1: byte em 0xA1. he: 7 bytes a partir
// de 0xE1. Com comUmidade=false, h1/he são ignorados (podem ser nullptr/0).
CalibBme decodificarCalib(const uint8_t* tp, bool comUmidade, uint8_t h1, const uint8_t* he);

struct MedidaBme {
  double temperaturaC;
  double pressaoHpa;
  bool temUmidade;
  double umidadePct;  // limitada a [0, 100]; só vale se temUmidade
};

// dados: bytes lidos a partir de 0xF7 — 8 no BME280, 6 no BMP280.
// Fórmulas em ponto flutuante do datasheet Bosch (as mesmas do firmware do Pico).
MedidaBme compensarBme(const CalibBme& c, const uint8_t* dados, bool comUmidade);

}  // namespace core
```

`firmware/lib/core/src/bme280_math.cpp`:

```cpp
#include "bme280_math.h"

namespace core {

static uint16_t u16(const uint8_t* b, int i) {
  return static_cast<uint16_t>(b[i] | (b[i + 1] << 8));
}

static int16_t s16(const uint8_t* b, int i) { return static_cast<int16_t>(u16(b, i)); }

ChipBme identificarChip(uint8_t chipId) {
  if (chipId == CHIP_ID_BME280) return ChipBme::BME280;
  if (chipId == CHIP_ID_BMP280) return ChipBme::BMP280;
  return ChipBme::DESCONHECIDO;
}

CalibBme decodificarCalib(const uint8_t* tp, bool comUmidade, uint8_t h1, const uint8_t* he) {
  CalibBme c{};
  c.T1 = u16(tp, 0);
  c.T2 = s16(tp, 2);
  c.T3 = s16(tp, 4);
  c.P1 = u16(tp, 6);
  c.P2 = s16(tp, 8);
  c.P3 = s16(tp, 10);
  c.P4 = s16(tp, 12);
  c.P5 = s16(tp, 14);
  c.P6 = s16(tp, 16);
  c.P7 = s16(tp, 18);
  c.P8 = s16(tp, 20);
  c.P9 = s16(tp, 22);
  if (comUmidade) {
    c.H1 = h1;
    c.H2 = s16(he, 0);
    c.H3 = he[2];
    // H4/H5 são de 12 bits com sinal, divididos entre 0xE4/0xE5/0xE6.
    c.H4 = static_cast<int16_t>(static_cast<int8_t>(he[3]) * 16 | (he[4] & 0x0F));
    c.H5 = static_cast<int16_t>(static_cast<int8_t>(he[5]) * 16 | (he[4] >> 4));
    c.H6 = static_cast<int8_t>(he[6]);
  }
  return c;
}

MedidaBme compensarBme(const CalibBme& c, const uint8_t* d, bool comUmidade) {
  const int32_t adcP = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4);
  const int32_t adcT = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4);

  MedidaBme m{};

  // --- temperatura ---
  double var1 = (adcT / 16384.0 - c.T1 / 1024.0) * c.T2;
  const double dt = adcT / 131072.0 - c.T1 / 8192.0;
  double var2 = dt * dt * c.T3;
  const double tFine = var1 + var2;
  m.temperaturaC = tFine / 5120.0;

  // --- pressão ---
  var1 = tFine / 2.0 - 64000.0;
  var2 = var1 * var1 * c.P6 / 32768.0;
  var2 = var2 + var1 * c.P5 * 2.0;
  var2 = var2 / 4.0 + c.P4 * 65536.0;
  var1 = (c.P3 * var1 * var1 / 524288.0 + c.P2 * var1) / 524288.0;
  var1 = (1.0 + var1 / 32768.0) * c.P1;
  if (var1 == 0.0) {
    m.pressaoHpa = 0.0;
  } else {
    double pr = 1048576.0 - adcP;
    pr = (pr - var2 / 4096.0) * 6250.0 / var1;
    const double v1 = c.P9 * pr * pr / 2147483648.0;
    const double v2 = pr * c.P8 / 32768.0;
    pr = pr + (v1 + v2 + c.P7) / 16.0;
    m.pressaoHpa = pr / 100.0;  // Pa -> hPa
  }

  // --- umidade (só no BME280) ---
  m.temUmidade = comUmidade;
  if (comUmidade) {
    const int32_t adcH = (d[6] << 8) | d[7];
    double h = tFine - 76800.0;
    h = (adcH - (c.H4 * 64.0 + c.H5 / 16384.0 * h)) *
        (c.H2 / 65536.0 * (1.0 + c.H6 / 67108864.0 * h * (1.0 + c.H3 / 67108864.0 * h)));
    h = h * (1.0 - c.H1 * h / 524288.0);
    if (h > 100.0) h = 100.0;
    if (h < 0.0) h = 0.0;
    m.umidadePct = h;
  }
  return m;
}

}  // namespace core
```

- [ ] **Step 4: Rodar e ver passar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_bme280`
Expected: `7 succeeded`.

- [ ] **Step 5: Commit**

```bash
git add firmware/lib/core/src/bme280_math.* firmware/test/test_native/test_bme280
git commit -m "feat(firmware): compensacao BME280/BMP280 conferida contra o datasheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 6: UV e registro de sensores (`uv_math`, `sensor`)

**Files:**
- Create: `firmware/lib/core/src/uv_math.h`, `firmware/lib/core/src/uv_math.cpp`, `firmware/lib/core/src/sensor.h`, `firmware/lib/core/src/sensor.cpp`
- Test: `firmware/test/test_native/test_uv_sensores/test_main.cpp`

**Interfaces:**
- Consumes: `core::arredondar` (Task 1)
- Produces:
  - `int core::indiceUv(double mv)`, `double core::mediana(double* valores, size_t n)`
  - `enum class core::StatusUv { OK, SINAL_SOLTO }`, `struct core::AvaliacaoUv { StatusUv status; int indice; double tensaoV; }`, `core::AvaliacaoUv core::avaliarUv(double medianaMv, double limiteSoltoMv)`
  - `class core::Sensor { virtual const char* nome() const = 0; virtual bool ler(JsonObject saida, std::string& erro) = 0; }`
  - `void core::lerTodos(Sensor* const* sensores, size_t n, JsonObject saida)`
  - `void core::escreverChuva(JsonObject saida, uint32_t tips, double mmPorTip)`

- [ ] **Step 1: Escrever o teste que falha**

`firmware/test/test_native/test_uv_sensores/test_main.cpp`:

```cpp
#include <ArduinoJson.h>
#include <unity.h>

#include "sensor.h"
#include "uv_math.h"

void setUp() {}
void tearDown() {}

void test_indice_uv_nos_limiares() {
  TEST_ASSERT_EQUAL_INT(0, core::indiceUv(0));
  TEST_ASSERT_EQUAL_INT(0, core::indiceUv(226.9));
  TEST_ASSERT_EQUAL_INT(1, core::indiceUv(227));
  TEST_ASSERT_EQUAL_INT(10, core::indiceUv(1169));
  TEST_ASSERT_EQUAL_INT(11, core::indiceUv(1170));
  TEST_ASSERT_EQUAL_INT(11, core::indiceUv(1600));
}

void test_mediana_descarta_transitorio_nos_trilhos() {
  // Mau contato joga o nó nos trilhos (0 e ~2000 mV) por instantes.
  double v[7] = {0, 2000, 500, 510, 505, 0, 2000};
  TEST_ASSERT_EQUAL_DOUBLE(505, core::mediana(v, 7));
}

void test_mediana_par_pega_o_elemento_superior() {
  double v[4] = {4, 1, 3, 2};  // igual ao sorted(v)[n // 2] do Python
  TEST_ASSERT_EQUAL_DOUBLE(3, core::mediana(v, 4));
}

void test_avaliar_uv_ok() {
  const core::AvaliacaoUv a = core::avaliarUv(120.4, 1650.0);
  TEST_ASSERT_TRUE(a.status == core::StatusUv::OK);
  TEST_ASSERT_EQUAL_INT(0, a.indice);
  TEST_ASSERT_EQUAL_DOUBLE(0.12, a.tensaoV);
}

void test_avaliar_uv_sinal_solto() {
  TEST_ASSERT_TRUE(core::avaliarUv(1650.0, 1650.0).status == core::StatusUv::SINAL_SOLTO);
  TEST_ASSERT_TRUE(core::avaliarUv(1649.9, 1650.0).status == core::StatusUv::OK);
}

class SensorFalso : public core::Sensor {
 public:
  SensorFalso(const char* nome, bool ok, const char* erro) : nome_(nome), ok_(ok), erro_(erro) {}
  const char* nome() const override { return nome_; }
  bool ler(JsonObject saida, std::string& erro) override {
    if (ok_) {
      saida[std::string(nome_) + "_valor"] = 1;
      return true;
    }
    erro = erro_;
    return false;
  }

 private:
  const char* nome_;
  bool ok_;
  const char* erro_;
};

void test_ler_todos_isola_falha_de_um_sensor() {
  SensorFalso a("a", true, ""), b("b", false, "quebrou"), c("c", true, "");
  core::Sensor* const lista[] = {&a, &b, &c};
  JsonDocument doc;
  core::lerTodos(lista, 3, doc.to<JsonObject>());
  TEST_ASSERT_EQUAL_INT(1, doc["a_valor"].as<int>());
  TEST_ASSERT_EQUAL_STRING("quebrou", doc["b_erro"].as<const char*>());
  TEST_ASSERT_EQUAL_INT(1, doc["c_valor"].as<int>());
}

void test_ler_todos_erro_sem_descricao() {
  SensorFalso b("b", false, "");
  core::Sensor* const lista[] = {&b};
  JsonDocument doc;
  core::lerTodos(lista, 1, doc.to<JsonObject>());
  TEST_ASSERT_EQUAL_STRING("falha sem descricao", doc["b_erro"].as<const char*>());
}

void test_escrever_chuva() {
  JsonDocument doc;
  core::escreverChuva(doc.to<JsonObject>(), 3, 0.2);
  TEST_ASSERT_EQUAL_DOUBLE(0.6, doc["rain_mm"].as<double>());
  TEST_ASSERT_EQUAL_UINT32(3, doc["chuva_tips"].as<uint32_t>());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_indice_uv_nos_limiares);
  RUN_TEST(test_mediana_descarta_transitorio_nos_trilhos);
  RUN_TEST(test_mediana_par_pega_o_elemento_superior);
  RUN_TEST(test_avaliar_uv_ok);
  RUN_TEST(test_avaliar_uv_sinal_solto);
  RUN_TEST(test_ler_todos_isola_falha_de_um_sensor);
  RUN_TEST(test_ler_todos_erro_sem_descricao);
  RUN_TEST(test_escrever_chuva);
  return UNITY_END();
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_uv_sensores`
Expected: FAIL de compilação, `sensor.h: No such file or directory`.

- [ ] **Step 3: Implementar `uv_math`**

`firmware/lib/core/src/uv_math.h`:

```cpp
#pragma once
#include <stddef.h>

namespace core {

// Limiares (mV) -> índice UV 0..11, tabela típica dos módulos GUVA-S12SD
// (estilo DFRobot). A RECONFERIR contra um medidor de referência.
int indiceUv(double mv);

// Mediana (ordena 'valores' in place). Com n par devolve o elemento superior,
// igual ao firmware do Pico. Não é preciosismo: mau contato na fiação joga o
// nó nos trilhos por até 1 s; a mediana só se desloca se a maioria da janela
// estiver ruim.
double mediana(double* valores, size_t n);

enum class StatusUv { OK, SINAL_SOLTO };

struct AvaliacaoUv {
  StatusUv status;
  int indice;
  double tensaoV;  // 3 casas; vai para "uv_voltage_v"
};

// Tensão >= limiteSoltoMv é eletricamente impossível para a saída do GUVA
// (índice 11 = 1170 mV): é fio solto ou ADC saturado, não sol.
AvaliacaoUv avaliarUv(double medianaMv, double limiteSoltoMv);

}  // namespace core
```

`firmware/lib/core/src/uv_math.cpp`:

```cpp
#include "uv_math.h"

#include <algorithm>

#include "texto.h"

namespace core {

static const double LIMIARES_MV[] = {227, 318, 408, 503, 606, 696, 795, 881, 976, 1079, 1170};

int indiceUv(double mv) {
  for (int i = 0; i < 11; ++i) {
    if (mv < LIMIARES_MV[i]) return i;
  }
  return 11;
}

double mediana(double* valores, size_t n) {
  std::sort(valores, valores + n);
  return valores[n / 2];
}

AvaliacaoUv avaliarUv(double medianaMv, double limiteSoltoMv) {
  AvaliacaoUv a{};
  if (medianaMv >= limiteSoltoMv) {
    a.status = StatusUv::SINAL_SOLTO;
    return a;
  }
  a.status = StatusUv::OK;
  a.indice = indiceUv(medianaMv);
  a.tensaoV = arredondar(medianaMv / 1000.0, 3);
  return a;
}

}  // namespace core
```

- [ ] **Step 4: Implementar `sensor`**

`firmware/lib/core/src/sensor.h`:

```cpp
#pragma once
#include <ArduinoJson.h>
#include <stddef.h>
#include <stdint.h>

#include <string>

namespace core {

// Contrato de sensor (o mesmo do firmware do Pico): cada sensor grava suas
// grandezas em 'saida'. Se o hardware não responde, NÃO invente valor:
// devolva false e descreva o problema em 'erro' — lerTodos() registra
// "<nome>_erro" e segue com os outros sensores.
class Sensor {
 public:
  virtual ~Sensor() = default;
  virtual const char* nome() const = 0;
  virtual bool ler(JsonObject saida, std::string& erro) = 0;
};

void lerTodos(Sensor* const* sensores, size_t n, JsonObject saida);

// Grava "rain_mm" (3 casas) e "chuva_tips".
void escreverChuva(JsonObject saida, uint32_t tips, double mmPorTip);

}  // namespace core
```

`firmware/lib/core/src/sensor.cpp`:

```cpp
#include "sensor.h"

#include "texto.h"

namespace core {

void lerTodos(Sensor* const* sensores, size_t n, JsonObject saida) {
  for (size_t i = 0; i < n; ++i) {
    std::string erro;
    if (!sensores[i]->ler(saida, erro)) {
      saida[std::string(sensores[i]->nome()) + "_erro"] = erro.empty() ? "falha sem descricao" : erro;
    }
  }
}

void escreverChuva(JsonObject saida, uint32_t tips, double mmPorTip) {
  saida["rain_mm"] = arredondar(tips * mmPorTip, 3);
  saida["chuva_tips"] = tips;
}

}  // namespace core
```

- [ ] **Step 5: Rodar e ver passar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_uv_sensores`
Expected: `8 succeeded`.

- [ ] **Step 6: Commit**

```bash
git add firmware/lib/core/src/uv_math.* firmware/lib/core/src/sensor.* firmware/test/test_native/test_uv_sensores
git commit -m "feat(firmware): indice UV com guarda de sinal solto e registro de sensores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 7: Buffer persistente em JSONL (`fs_iface`, `leitor_linhas`, `buffer`, `mem_fs`)

**Files:**
- Create: `firmware/lib/core/src/fs_iface.h`, `firmware/lib/core/src/leitor_linhas.h`, `firmware/lib/core/src/leitor_linhas.cpp`, `firmware/lib/core/src/buffer.h`, `firmware/lib/core/src/buffer.cpp`, `firmware/lib/testsupport/src/mem_fs.h`
- Test: `firmware/test/test_native/test_buffer/test_main.cpp`

**Interfaces:**
- Consumes: `core::aparar` (Task 1)
- Produces:
  - `class core::IArquivo { size_t ler(uint8_t*, size_t); size_t escrever(const uint8_t*, size_t); bool posicionar(size_t); }`
  - `class core::ISistemaArquivos { std::unique_ptr<IArquivo> abrir(const char*, char modo /*'r','w','a'*/); bool existe(const char*); long tamanho(const char*); bool remover(const char*); bool renomear(const char* de, const char* para); }`
  - `class core::LeitorLinhas { explicit LeitorLinhas(IArquivo&); bool proxima(std::string& linha, bool& completa); }`
  - `class core::Buffer { Buffer(ISistemaArquivos&, std::string caminho, uint32_t maxLinhas); bool adicionar(const std::string&); uint32_t contar(); struct Lote { std::vector<std::string> leituras; uint32_t linhasLidas; }; Lote carregarLote(size_t n); bool removerInicio(uint32_t); bool recuperarTmpOrfao(); void invalidarContagem(); const std::string& caminho() const; }`
  - `bool core::leituraValida(const std::string& linha)`
  - `class testsupport::SistemaArquivosMemoria : core::ISistemaArquivos { std::map<std::string,std::string> arquivos; bool renomearFalhaSeDestinoExiste; }`

- [ ] **Step 1: Criar a interface de FS e o FS em memória (suporte de teste)**

`firmware/lib/core/src/fs_iface.h`:

```cpp
#pragma once
#include <stddef.h>
#include <stdint.h>

#include <memory>

namespace core {

// Abstração mínima de sistema de arquivos: o buffer roda sobre o LittleFS na
// placa e sobre um FS em memória nos testes do PC.
class IArquivo {
 public:
  virtual ~IArquivo() = default;
  virtual size_t ler(uint8_t* buf, size_t n) = 0;  // 0 = fim do arquivo
  virtual size_t escrever(const uint8_t* buf, size_t n) = 0;
  virtual bool posicionar(size_t pos) = 0;
};

class ISistemaArquivos {
 public:
  virtual ~ISistemaArquivos() = default;
  // modo: 'r' leitura (nullptr se não existe), 'w' trunca/cria, 'a' acrescenta/cria.
  virtual std::unique_ptr<IArquivo> abrir(const char* caminho, char modo) = 0;
  virtual bool existe(const char* caminho) = 0;
  virtual long tamanho(const char* caminho) = 0;  // -1 se não existe
  virtual bool remover(const char* caminho) = 0;
  virtual bool renomear(const char* de, const char* para) = 0;
};

}  // namespace core
```

`firmware/lib/testsupport/src/mem_fs.h`:

```cpp
#pragma once
// FS em memória para os testes native. NÃO é compilado para o ESP32
// (lib_ignore = testsupport no platformio.ini).
#include <algorithm>
#include <cstring>
#include <map>
#include <string>

#include "fs_iface.h"

namespace testsupport {

class ArquivoMemoria : public core::IArquivo {
 public:
  ArquivoMemoria(std::string& dados, char modo) : dados_(dados), modo_(modo), pos_(0) {}
  size_t ler(uint8_t* buf, size_t n) override {
    if (modo_ != 'r' || pos_ >= dados_.size()) return 0;
    const size_t k = std::min(n, dados_.size() - pos_);
    std::memcpy(buf, dados_.data() + pos_, k);
    pos_ += k;
    return k;
  }
  size_t escrever(const uint8_t* buf, size_t n) override {
    if (modo_ == 'r') return 0;
    dados_.append(reinterpret_cast<const char*>(buf), n);
    return n;
  }
  bool posicionar(size_t pos) override {
    if (pos > dados_.size()) return false;
    pos_ = pos;
    return true;
  }

 private:
  std::string& dados_;
  char modo_;
  size_t pos_;
};

class SistemaArquivosMemoria : public core::ISistemaArquivos {
 public:
  std::map<std::string, std::string> arquivos;
  // Simula FS cujo rename não sobrescreve o destino (força o fallback remove+rename).
  bool renomearFalhaSeDestinoExiste = false;

  std::unique_ptr<core::IArquivo> abrir(const char* caminho, char modo) override {
    auto it = arquivos.find(caminho);
    if (modo == 'r' && it == arquivos.end()) return nullptr;
    std::string& dados = arquivos[caminho];
    if (modo == 'w') dados.clear();
    return std::unique_ptr<core::IArquivo>(new ArquivoMemoria(dados, modo));
  }
  bool existe(const char* caminho) override { return arquivos.count(caminho) > 0; }
  long tamanho(const char* caminho) override {
    auto it = arquivos.find(caminho);
    return it == arquivos.end() ? -1 : static_cast<long>(it->second.size());
  }
  bool remover(const char* caminho) override { return arquivos.erase(caminho) > 0; }
  bool renomear(const char* de, const char* para) override {
    auto it = arquivos.find(de);
    if (it == arquivos.end()) return false;
    if (renomearFalhaSeDestinoExiste && arquivos.count(para)) return false;
    std::string dados = it->second;
    arquivos.erase(it);
    arquivos[para] = dados;
    return true;
  }
};

}  // namespace testsupport
```

- [ ] **Step 2: Escrever o teste que falha**

`firmware/test/test_native/test_buffer/test_main.cpp`:

```cpp
#include <unity.h>

#include <string>

#include "buffer.h"
#include "leitor_linhas.h"
#include "mem_fs.h"

static const char* ARQ = "/buffer.jsonl";
static const char* TMP = "/buffer.jsonl.tmp";

static std::string leitura(int i) {
  return "{\"timestamp\":\"2026-01-01T00:" + std::string(i < 10 ? "0" : "") + std::to_string(i) +
         ":00.000Z\",\"n\":" + std::to_string(i) + "}";
}

void setUp() {}
void tearDown() {}

void test_primeiro_boot_sem_arquivo() {
  // Review Focus: nada existe ainda.
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_EQUAL_UINT32(0, b.contar());
  const core::Buffer::Lote l = b.carregarLote(50);
  TEST_ASSERT_EQUAL_UINT32(0, l.linhasLidas);
  TEST_ASSERT_FALSE(b.removerInicio(3));
  TEST_ASSERT_TRUE(b.adicionar(leitura(1)));
  TEST_ASSERT_EQUAL_STRING((leitura(1) + "\n").c_str(), fs.arquivos[ARQ].c_str());
  TEST_ASSERT_EQUAL_UINT32(1, b.contar());
}

void test_adicionar_e_contar() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  for (int i = 0; i < 3; ++i) b.adicionar(leitura(i));
  TEST_ASSERT_EQUAL_UINT32(3, b.contar());
  core::Buffer outro(fs, ARQ, 5000);  // recontagem a partir do arquivo (reboot)
  TEST_ASSERT_EQUAL_UINT32(3, outro.contar());
}

void test_linha_truncada_por_queda_de_energia_e_fechada() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = leitura(1) + "\n{\"timest";
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_TRUE(b.adicionar(leitura(2)));
  TEST_ASSERT_EQUAL_STRING((leitura(1) + "\n{\"timest\n" + leitura(2) + "\n").c_str(), fs.arquivos[ARQ].c_str());
  TEST_ASSERT_EQUAL_UINT32(3, b.contar());
  const core::Buffer::Lote l = b.carregarLote(50);
  TEST_ASSERT_EQUAL_UINT32(2, l.leituras.size());  // a truncada é descartada, a seguinte sobrevive
  TEST_ASSERT_EQUAL_UINT32(3, l.linhasLidas);
}

void test_lote_conta_linha_corrompida_para_nao_duplicar_envio() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = leitura(1) + "\nlixo\n" + leitura(2) + "\n" + leitura(3) + "\n";
  core::Buffer b(fs, ARQ, 5000);
  const core::Buffer::Lote l = b.carregarLote(2);
  TEST_ASSERT_EQUAL_UINT32(2, l.leituras.size());
  TEST_ASSERT_EQUAL_STRING(leitura(1).c_str(), l.leituras[0].c_str());
  TEST_ASSERT_EQUAL_STRING(leitura(2).c_str(), l.leituras[1].c_str());
  TEST_ASSERT_EQUAL_UINT32(3, l.linhasLidas);
  TEST_ASSERT_TRUE(b.removerInicio(l.linhasLidas));
  TEST_ASSERT_EQUAL_STRING((leitura(3) + "\n").c_str(), fs.arquivos[ARQ].c_str());
  TEST_ASSERT_EQUAL_UINT32(1, b.contar());
}

void test_linha_sem_timestamp_e_invalida_para_envio() {
  TEST_ASSERT_TRUE(core::leituraValida(leitura(1)));
  TEST_ASSERT_FALSE(core::leituraValida("{\"_boot\":3,\"_up_ms\":1000}"));
  TEST_ASSERT_FALSE(core::leituraValida("[1,2]"));
  TEST_ASSERT_FALSE(core::leituraValida("{\"timestamp\":5}"));
}

void test_remover_inicio_ignora_linhas_em_branco() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = "\n" + leitura(1) + "\n\n" + leitura(2) + "\n" + leitura(3);
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_TRUE(b.removerInicio(1));
  TEST_ASSERT_EQUAL_STRING((leitura(2) + "\n" + leitura(3) + "\n").c_str(), fs.arquivos[ARQ].c_str());
  TEST_ASSERT_EQUAL_UINT32(2, b.contar());
  TEST_ASSERT_FALSE(fs.existe(TMP));
}

void test_remover_inicio_com_rename_que_nao_sobrescreve() {
  testsupport::SistemaArquivosMemoria fs;
  fs.renomearFalhaSeDestinoExiste = true;
  core::Buffer b(fs, ARQ, 5000);
  for (int i = 0; i < 3; ++i) b.adicionar(leitura(i));
  TEST_ASSERT_TRUE(b.removerInicio(2));
  TEST_ASSERT_EQUAL_STRING((leitura(2) + "\n").c_str(), fs.arquivos[ARQ].c_str());
}

void test_teto_descarta_bloco_das_mais_antigas() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 10);
  for (int i = 0; i < 11; ++i) b.adicionar(leitura(i));
  TEST_ASSERT_EQUAL_UINT32(9, b.contar());  // 11 > 10 -> volta para 90% = 9
  const core::Buffer::Lote l = b.carregarLote(1);
  TEST_ASSERT_EQUAL_STRING(leitura(2).c_str(), l.leituras[0].c_str());
}

void test_recupera_tmp_orfao() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[TMP] = leitura(1) + "\n" + leitura(2) + "\n";
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_TRUE(b.recuperarTmpOrfao());
  TEST_ASSERT_FALSE(fs.existe(TMP));
  TEST_ASSERT_EQUAL_UINT32(2, b.contar());
}

void test_tmp_velho_com_principal_intacto_e_apagado() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = leitura(1) + "\n";
  fs.arquivos[TMP] = "parcial";
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_FALSE(b.recuperarTmpOrfao());
  TEST_ASSERT_FALSE(fs.existe(TMP));
  TEST_ASSERT_EQUAL_STRING((leitura(1) + "\n").c_str(), fs.arquivos[ARQ].c_str());
}

void test_linha_maior_que_o_bloco_de_leitura() {
  // Review Focus: leitura com vários "*_erro" longos passa de 128 bytes.
  testsupport::SistemaArquivosMemoria fs;
  const std::string longa = "{\"timestamp\":\"2026-01-01T00:00:00.000Z\",\"bme280_erro\":\"" + std::string(300, 'x') + "\"}";
  fs.arquivos[ARQ] = longa + "\n" + leitura(1) + "\n";
  core::Buffer b(fs, ARQ, 5000);
  const core::Buffer::Lote l = b.carregarLote(50);
  TEST_ASSERT_EQUAL_UINT32(2, l.leituras.size());
  TEST_ASSERT_EQUAL_STRING(longa.c_str(), l.leituras[0].c_str());
}

void test_leitor_linhas_marca_linha_incompleta() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos["/x"] = "a\nb";
  auto f = fs.abrir("/x", 'r');
  core::LeitorLinhas lr(*f);
  std::string linha;
  bool completa = false;
  TEST_ASSERT_TRUE(lr.proxima(linha, completa));
  TEST_ASSERT_EQUAL_STRING("a", linha.c_str());
  TEST_ASSERT_TRUE(completa);
  TEST_ASSERT_TRUE(lr.proxima(linha, completa));
  TEST_ASSERT_EQUAL_STRING("b", linha.c_str());
  TEST_ASSERT_FALSE(completa);
  TEST_ASSERT_FALSE(lr.proxima(linha, completa));
}

void test_invalidar_contagem_reconta_do_arquivo() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  b.adicionar(leitura(1));
  fs.arquivos[ARQ] += leitura(2) + "\n";  // alguém reescreveu por baixo (ex.: resolverPendentes)
  b.invalidarContagem();
  TEST_ASSERT_EQUAL_UINT32(2, b.contar());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_primeiro_boot_sem_arquivo);
  RUN_TEST(test_adicionar_e_contar);
  RUN_TEST(test_linha_truncada_por_queda_de_energia_e_fechada);
  RUN_TEST(test_lote_conta_linha_corrompida_para_nao_duplicar_envio);
  RUN_TEST(test_linha_sem_timestamp_e_invalida_para_envio);
  RUN_TEST(test_remover_inicio_ignora_linhas_em_branco);
  RUN_TEST(test_remover_inicio_com_rename_que_nao_sobrescreve);
  RUN_TEST(test_teto_descarta_bloco_das_mais_antigas);
  RUN_TEST(test_recupera_tmp_orfao);
  RUN_TEST(test_tmp_velho_com_principal_intacto_e_apagado);
  RUN_TEST(test_linha_maior_que_o_bloco_de_leitura);
  RUN_TEST(test_leitor_linhas_marca_linha_incompleta);
  RUN_TEST(test_invalidar_contagem_reconta_do_arquivo);
  return UNITY_END();
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_buffer`
Expected: FAIL de compilação, `buffer.h: No such file or directory`.

- [ ] **Step 4: Implementar `LeitorLinhas`**

`firmware/lib/core/src/leitor_linhas.h`:

```cpp
#pragma once
#include <stdint.h>

#include <string>

#include "fs_iface.h"

namespace core {

// Lê um arquivo linha a linha com um bloco fixo de 128 bytes: nunca carrega o
// arquivo inteiro na RAM (o buffer pode ter ~900 KB).
class LeitorLinhas {
 public:
  explicit LeitorLinhas(IArquivo& arquivo);

  // Próxima linha, sem o '\n'. 'completa' = a linha terminava em '\n'
  // (false na última linha de um arquivo truncado). Devolve false no fim.
  bool proxima(std::string& linha, bool& completa);

 private:
  IArquivo& arquivo_;
  uint8_t bloco_[128];
  size_t ini_;
  size_t fim_;
  bool acabou_;
};

}  // namespace core
```

`firmware/lib/core/src/leitor_linhas.cpp`:

```cpp
#include "leitor_linhas.h"

namespace core {

LeitorLinhas::LeitorLinhas(IArquivo& arquivo) : arquivo_(arquivo), bloco_{}, ini_(0), fim_(0), acabou_(false) {}

bool LeitorLinhas::proxima(std::string& linha, bool& completa) {
  linha.clear();
  completa = false;
  for (;;) {
    if (ini_ == fim_) {
      if (acabou_) return !linha.empty();
      fim_ = arquivo_.ler(bloco_, sizeof(bloco_));
      ini_ = 0;
      if (fim_ == 0) {
        acabou_ = true;
        return !linha.empty();
      }
    }
    while (ini_ < fim_) {
      const char c = static_cast<char>(bloco_[ini_++]);
      if (c == '\n') {
        completa = true;
        return true;
      }
      linha.push_back(c);
    }
  }
}

}  // namespace core
```

- [ ] **Step 5: Implementar `Buffer`**

`firmware/lib/core/src/buffer.h`:

```cpp
#pragma once
#include <stddef.h>
#include <stdint.h>

#include <string>
#include <vector>

#include "fs_iface.h"

namespace core {

// JSON objeto com "timestamp" string. Linhas sem hora (_boot/_up_ms) ou
// corrompidas NÃO são enviáveis.
bool leituraValida(const std::string& linha);

// Buffer persistente de leituras em JSONL (uma leitura por linha). Acrescentar
// é barato e grava pouco na flash; as linhas só saem quando a API confirma
// (2xx). Mesma semântica do storage.py do Pico:
//  - fecha a última linha truncada por queda de energia antes de acrescentar;
//  - nº de linhas em RAM (válido entre leituras, pois o lightsleep preserva a
//    RAM) — sem ele, cada gravação varreria o arquivo (O(n²));
//  - remoção via .tmp linha a linha + rename.
class Buffer {
 public:
  Buffer(ISistemaArquivos& fs, std::string caminho, uint32_t maxLinhas);

  bool adicionar(const std::string& linhaJson);  // sem '\n'
  uint32_t contar();                              // linhas não vazias

  struct Lote {
    std::vector<std::string> leituras;  // só as válidas
    uint32_t linhasLidas = 0;           // inclui corrompidas/inválidas puladas
  };
  // Primeiras 'n' leituras válidas. Remover 'linhasLidas' (e não
  // leituras.size()) após o envio: senão uma linha corrompida no meio do
  // lote faria a leitura seguinte escorregar para o próximo lote e ser
  // ENVIADA DUAS VEZES.
  Lote carregarLote(size_t n);

  bool removerInicio(uint32_t quantas);

  // Chamar no boot, antes de qualquer leitura/escrita. Se uma queda de energia
  // interrompeu o fallback remove+rename, o buffer real ficou só no .tmp.
  // Se os dois existem, o .tmp é sobra parcial e é apagado.
  bool recuperarTmpOrfao();

  void invalidarContagem();
  const std::string& caminho() const { return caminho_; }

 private:
  bool fecharUltimaLinha();
  uint32_t contarNoArquivo();

  ISistemaArquivos& fs_;
  std::string caminho_;
  std::string tmp_;
  uint32_t max_;
  bool contagemConhecida_;
  uint32_t n_;
};

}  // namespace core
```

`firmware/lib/core/src/buffer.cpp`:

```cpp
#include "buffer.h"

#include <ArduinoJson.h>

#include "leitor_linhas.h"
#include "texto.h"

namespace core {

bool leituraValida(const std::string& linha) {
  JsonDocument doc;
  if (deserializeJson(doc, linha)) return false;
  return doc.is<JsonObject>() && doc["timestamp"].is<const char*>();
}

Buffer::Buffer(ISistemaArquivos& fs, std::string caminho, uint32_t maxLinhas)
    : fs_(fs), caminho_(caminho), tmp_(caminho + ".tmp"), max_(maxLinhas), contagemConhecida_(false), n_(0) {}

void Buffer::invalidarContagem() { contagemConhecida_ = false; }

uint32_t Buffer::contarNoArquivo() {
  auto f = fs_.abrir(caminho_.c_str(), 'r');
  if (!f) return 0;
  LeitorLinhas lr(*f);
  std::string linha;
  bool completa;
  uint32_t n = 0;
  while (lr.proxima(linha, completa)) {
    if (!aparar(linha).empty()) ++n;
  }
  return n;
}

uint32_t Buffer::contar() {
  if (!contagemConhecida_) {
    n_ = contarNoArquivo();
    contagemConhecida_ = true;
  }
  return n_;
}

bool Buffer::fecharUltimaLinha() {
  const long tamanho = fs_.tamanho(caminho_.c_str());
  if (tamanho <= 0) return true;
  uint8_t ultimo = 0;
  {
    auto f = fs_.abrir(caminho_.c_str(), 'r');
    if (!f || !f->posicionar(static_cast<size_t>(tamanho - 1)) || f->ler(&ultimo, 1) != 1) return false;
  }
  if (ultimo == '\n') return true;
  auto f = fs_.abrir(caminho_.c_str(), 'a');
  const uint8_t nl = '\n';
  return f && f->escrever(&nl, 1) == 1;
}

bool Buffer::adicionar(const std::string& linhaJson) {
  // contar() ANTES de escrever: se a contagem ainda não existe, ela sai do
  // arquivo sem a linha nova e o +1 abaixo fecha certo.
  const uint32_t anterior = contar();
  if (!fecharUltimaLinha()) {
    invalidarContagem();
    return false;
  }
  const std::string linha = linhaJson + "\n";
  {
    auto f = fs_.abrir(caminho_.c_str(), 'a');
    if (!f || f->escrever(reinterpret_cast<const uint8_t*>(linha.data()), linha.size()) != linha.size()) {
      invalidarContagem();
      return false;
    }
  }
  n_ = anterior + 1;
  contagemConhecida_ = true;
  // Teto: descarta um BLOCO das mais antigas de uma vez (não 1 por leitura —
  // parado no teto, reescreveria o arquivo inteiro a cada 15 min).
  if (max_ != 0 && n_ > max_) removerInicio(n_ - max_ * 9 / 10);
  return true;
}

Buffer::Lote Buffer::carregarLote(size_t n) {
  Lote lote;
  auto f = fs_.abrir(caminho_.c_str(), 'r');
  if (!f) return lote;
  LeitorLinhas lr(*f);
  std::string linha;
  bool completa;
  while (lr.proxima(linha, completa)) {
    const std::string l = aparar(linha);
    if (l.empty()) continue;
    ++lote.linhasLidas;
    if (leituraValida(l)) lote.leituras.push_back(l);
    if (lote.leituras.size() >= n) break;
  }
  return lote;
}

bool Buffer::removerInicio(uint32_t quantas) {
  if (quantas == 0) return true;
  uint32_t mantidas = 0;
  {
    auto in = fs_.abrir(caminho_.c_str(), 'r');
    if (!in) {
      invalidarContagem();
      return false;
    }
    auto out = fs_.abrir(tmp_.c_str(), 'w');
    if (!out) {
      invalidarContagem();
      return false;
    }
    LeitorLinhas lr(*in);
    std::string linha;
    bool completa;
    uint32_t puladas = 0;
    while (lr.proxima(linha, completa)) {
      if (aparar(linha).empty()) continue;
      if (puladas < quantas) {
        ++puladas;
        continue;
      }
      linha.push_back('\n');
      if (out->escrever(reinterpret_cast<const uint8_t*>(linha.data()), linha.size()) != linha.size()) {
        invalidarContagem();
        return false;
      }
      ++mantidas;
    }
  }
  // rename direto (atômico no LittleFS); só usa remove+rename se falhar.
  if (!fs_.renomear(tmp_.c_str(), caminho_.c_str())) {
    fs_.remover(caminho_.c_str());
    if (!fs_.renomear(tmp_.c_str(), caminho_.c_str())) {
      invalidarContagem();
      return false;
    }
  }
  n_ = mantidas;
  contagemConhecida_ = true;
  return true;
}

bool Buffer::recuperarTmpOrfao() {
  const bool temPrincipal = fs_.existe(caminho_.c_str());
  const bool temTmp = fs_.existe(tmp_.c_str());
  if (temTmp && !temPrincipal) {
    if (!fs_.renomear(tmp_.c_str(), caminho_.c_str())) return false;
    invalidarContagem();
    return true;
  }
  if (temTmp) fs_.remover(tmp_.c_str());
  return false;
}

}  // namespace core
```

- [ ] **Step 6: Rodar e ver passar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_buffer`
Expected: `13 succeeded`.

- [ ] **Step 7: Commit**

```bash
git add firmware/lib/core/src/fs_iface.h firmware/lib/core/src/leitor_linhas.* firmware/lib/core/src/buffer.* firmware/lib/testsupport firmware/test/test_native/test_buffer
git commit -m "feat(firmware): buffer JSONL persistente a prova de queda de energia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 8: Datar leituras pendentes no primeiro sync (`pendentes`)

**Files:**
- Create: `firmware/lib/core/src/pendentes.h`, `firmware/lib/core/src/pendentes.cpp`
- Test: `firmware/test/test_native/test_pendentes/test_main.cpp`

**Interfaces:**
- Consumes: `core::ISistemaArquivos`, `core::LeitorLinhas` (Task 7); `core::RefHora`, `core::epochMsEm`, `core::formatarIso`, `core::TAM_ISO` (Task 3); `core::aparar`, `core::arredondar` (Task 1)
- Produces:
  - `bool core::arquivoTemPendentes(ISistemaArquivos& fs, const std::string& caminho)`
  - `struct core::ResultadoPendentes { bool ok; uint32_t datadas; uint32_t descartadas; uint32_t tipsSobrando; }`
  - `core::ResultadoPendentes core::resolverPendentes(ISistemaArquivos& fs, const std::string& caminho, uint32_t bootAtual, const RefHora& ref, double mmPorTip)`

- [ ] **Step 1: Escrever o teste que falha**

`firmware/test/test_native/test_pendentes/test_main.cpp`:

```cpp
#include <ArduinoJson.h>
#include <unity.h>

#include <string>
#include <vector>

#include "mem_fs.h"
#include "pendentes.h"

static const char* ARQ = "/buffer.jsonl";
// Sync no boot 7: uptime 905000 ms <-> 2026-01-01T00:15:00.000Z
static const core::RefHora REF{true, 1767226500000LL, 905000};

void setUp() {}
void tearDown() {}

static std::vector<std::string> linhas(testsupport::SistemaArquivosMemoria& fs) {
  std::vector<std::string> v;
  const std::string& s = fs.arquivos[ARQ];
  size_t ini = 0;
  for (size_t i = 0; i < s.size(); ++i) {
    if (s[i] == '\n') {
      v.push_back(s.substr(ini, i - ini));
      ini = i + 1;
    }
  }
  return v;
}

static JsonDocument doc(const std::string& linha) {
  JsonDocument d;
  deserializeJson(d, linha);
  return d;
}

void test_detecta_pendentes() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = "{\"timestamp\":\"2026-01-01T00:00:00.000Z\"}\n";
  TEST_ASSERT_FALSE(core::arquivoTemPendentes(fs, ARQ));
  fs.arquivos[ARQ] += "{\"_boot\":7,\"_up_ms\":5000}\n";
  TEST_ASSERT_TRUE(core::arquivoTemPendentes(fs, ARQ));
  TEST_ASSERT_FALSE(core::arquivoTemPendentes(fs, "/nao_existe"));
}

void test_data_pendente_do_boot_atual() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = "{\"temperature_c\":21.4,\"_boot\":7,\"_up_ms\":5000}\n";
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(1, r.datadas);
  const JsonDocument d = doc(linhas(fs)[0]);
  // 900 s antes do sync
  TEST_ASSERT_EQUAL_STRING("2026-01-01T00:00:00.000Z", d["timestamp"].as<const char*>());
  TEST_ASSERT_FALSE(d["_boot"].is<uint32_t>());
  TEST_ASSERT_FALSE(d["_up_ms"].is<uint64_t>());
  TEST_ASSERT_EQUAL_DOUBLE(21.4, d["temperature_c"].as<double>());
  TEST_ASSERT_FALSE(fs.existe("/buffer.jsonl.tmp"));
}

void test_boot_antigo_e_descartado_e_chuva_vai_para_a_proxima() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] =
      "{\"rain_mm\":0.4,\"chuva_tips\":2,\"_boot\":5,\"_up_ms\":1000}\n"
      "{\"rain_mm\":0.2,\"chuva_tips\":1,\"_boot\":7,\"_up_ms\":5000}\n";
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(1, r.descartadas);
  TEST_ASSERT_EQUAL_UINT32(1, r.datadas);
  TEST_ASSERT_EQUAL_UINT32(0, r.tipsSobrando);
  const std::vector<std::string> v = linhas(fs);
  TEST_ASSERT_EQUAL_UINT32(1, v.size());
  const JsonDocument d = doc(v[0]);
  TEST_ASSERT_EQUAL_UINT32(3, d["chuva_tips"].as<uint32_t>());
  TEST_ASSERT_EQUAL_DOUBLE(0.6, d["rain_mm"].as<double>());
}

void test_boot_antigo_no_fim_devolve_tips_sobrando() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] =
      "{\"timestamp\":\"2025-12-31T23:00:00.000Z\",\"chuva_tips\":0}\n"
      "{\"chuva_tips\":4,\"_boot\":5,\"_up_ms\":1000}\n";
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(4, r.tipsSobrando);
  TEST_ASSERT_EQUAL_UINT32(1, linhas(fs).size());
}

void test_datada_sem_chuva_tips_recebe_a_chuva() {
  // Review Focus: a leitura seguinte teve o pluviômetro com erro.
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] =
      "{\"chuva_tips\":2,\"_boot\":5,\"_up_ms\":1000}\n"
      "{\"timestamp\":\"2026-01-01T00:30:00.000Z\",\"rain_gauge_erro\":\"x\"}\n";
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  const JsonDocument d = doc(linhas(fs)[0]);
  TEST_ASSERT_EQUAL_UINT32(2, d["chuva_tips"].as<uint32_t>());
  TEST_ASSERT_EQUAL_DOUBLE(0.4, d["rain_mm"].as<double>());
  TEST_ASSERT_EQUAL_STRING("2026-01-01T00:30:00.000Z", d["timestamp"].as<const char*>());
}

void test_linha_corrompida_e_preservada() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = "lixo{\n{\"timestamp\":\"2026-01-01T00:30:00.000Z\"}\n";
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_STRING("lixo{", linhas(fs)[0].c_str());
  TEST_ASSERT_EQUAL_STRING("{\"timestamp\":\"2026-01-01T00:30:00.000Z\"}", linhas(fs)[1].c_str());
}

void test_sem_arquivo_nao_falha() {
  testsupport::SistemaArquivosMemoria fs;
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(0, r.datadas);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_detecta_pendentes);
  RUN_TEST(test_data_pendente_do_boot_atual);
  RUN_TEST(test_boot_antigo_e_descartado_e_chuva_vai_para_a_proxima);
  RUN_TEST(test_boot_antigo_no_fim_devolve_tips_sobrando);
  RUN_TEST(test_datada_sem_chuva_tips_recebe_a_chuva);
  RUN_TEST(test_linha_corrompida_e_preservada);
  RUN_TEST(test_sem_arquivo_nao_falha);
  return UNITY_END();
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_pendentes`
Expected: FAIL de compilação, `pendentes.h: No such file or directory`.

- [ ] **Step 3: Implementar**

`firmware/lib/core/src/pendentes.h`:

```cpp
#pragma once
#include <stdint.h>

#include <string>

#include "fs_iface.h"
#include "iso_time.h"

namespace core {

// Leituras feitas sem hora válida NÃO recebem timestamp inventado (a API
// deduplica por (station_id, timestamp): um timestamp falso fixo colidiria
// leituras distintas para sempre). Elas vão para o buffer com "_boot" (contador
// de boots) e "_up_ms" (uptime) e são datadas aqui, no primeiro sync.

bool arquivoTemPendentes(ISistemaArquivos& fs, const std::string& caminho);

struct ResultadoPendentes {
  bool ok = false;
  uint32_t datadas = 0;
  uint32_t descartadas = 0;
  uint32_t tipsSobrando = 0;  // chuva de descartadas sem leitura datada depois
};

// Uma passada .tmp pelo buffer:
//  - pendente do boot atual -> timestamp = hora em _up_ms (pela referência);
//  - pendente de boot antigo (impossível de datar: o uptime daquele boot não
//    tem relação com a referência) -> descartada; seus chuva_tips somam na
//    PRÓXIMA leitura datada, para o total de chuva não se perder. Se não houver
//    próxima, voltam em tipsSobrando (o chamador devolve ao contador de chuva);
//  - linha corrompida -> preservada como está (o envio a descarta depois).
ResultadoPendentes resolverPendentes(ISistemaArquivos& fs, const std::string& caminho, uint32_t bootAtual,
                                     const RefHora& ref, double mmPorTip);

}  // namespace core
```

`firmware/lib/core/src/pendentes.cpp`:

```cpp
#include "pendentes.h"

#include <ArduinoJson.h>

#include "leitor_linhas.h"
#include "texto.h"

namespace core {

bool arquivoTemPendentes(ISistemaArquivos& fs, const std::string& caminho) {
  auto f = fs.abrir(caminho.c_str(), 'r');
  if (!f) return false;
  LeitorLinhas lr(*f);
  std::string linha;
  bool completa;
  while (lr.proxima(linha, completa)) {
    if (linha.find("\"_boot\"") != std::string::npos) return true;
  }
  return false;
}

static void somarChuva(JsonDocument& doc, uint32_t tips, double mmPorTip) {
  const uint32_t total = (doc["chuva_tips"] | 0u) + tips;
  doc["chuva_tips"] = total;
  doc["rain_mm"] = arredondar(total * mmPorTip, 3);
}

ResultadoPendentes resolverPendentes(ISistemaArquivos& fs, const std::string& caminho, uint32_t bootAtual,
                                     const RefHora& ref, double mmPorTip) {
  ResultadoPendentes r;
  const std::string tmp = caminho + ".tmp";
  uint32_t carry = 0;
  {
    auto in = fs.abrir(caminho.c_str(), 'r');
    if (!in) {
      r.ok = true;  // sem buffer: nada a datar
      return r;
    }
    auto out = fs.abrir(tmp.c_str(), 'w');
    if (!out) return r;
    LeitorLinhas lr(*in);
    std::string linha;
    bool completa;
    while (lr.proxima(linha, completa)) {
      const std::string l = aparar(linha);
      if (l.empty()) continue;
      std::string saida;
      JsonDocument doc;
      if (deserializeJson(doc, l) || !doc.is<JsonObject>()) {
        saida = l;
      } else if (doc["_boot"].is<uint32_t>()) {
        if (doc["_boot"].as<uint32_t>() != bootAtual) {
          carry += doc["chuva_tips"] | 0u;
          ++r.descartadas;
          continue;
        }
        char iso[TAM_ISO];
        formatarIso(epochMsEm(ref, doc["_up_ms"] | static_cast<uint64_t>(0)), iso);
        doc.remove("_boot");
        doc.remove("_up_ms");
        doc["timestamp"] = iso;
        if (carry != 0) {
          somarChuva(doc, carry, mmPorTip);
          carry = 0;
        }
        serializeJson(doc, saida);
        ++r.datadas;
      } else if (carry != 0) {
        somarChuva(doc, carry, mmPorTip);
        carry = 0;
        serializeJson(doc, saida);
      } else {
        saida = l;
      }
      saida.push_back('\n');
      if (out->escrever(reinterpret_cast<const uint8_t*>(saida.data()), saida.size()) != saida.size()) return r;
    }
  }
  if (!fs.renomear(tmp.c_str(), caminho.c_str())) {
    fs.remover(caminho.c_str());
    if (!fs.renomear(tmp.c_str(), caminho.c_str())) return r;
  }
  r.tipsSobrando = carry;
  r.ok = true;
  return r;
}

}  // namespace core
```

- [ ] **Step 4: Rodar e ver passar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_pendentes`
Expected: `7 succeeded`.

- [ ] **Step 5: Commit**

```bash
git add firmware/lib/core/src/pendentes.* firmware/test/test_native/test_pendentes
git commit -m "feat(firmware): data leituras sem hora no primeiro sync sem perder chuva

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 9: Envio em lotes (`envio`)

**Files:**
- Create: `firmware/lib/core/src/envio.h`, `firmware/lib/core/src/envio.cpp`
- Test: `firmware/test/test_native/test_envio/test_main.cpp`

**Interfaces:**
- Consumes: `core::Buffer` (Task 7)
- Produces:
  - `std::string core::montarPayload(const std::string& stationId, const std::vector<std::string>& leituras)`
  - `using core::FuncaoPost = std::function<bool(const std::string& corpo)>;` (true = HTTP 2xx)
  - `struct core::ResultadoEnvio { bool ok; uint32_t enviadas; uint32_t descartadas; }`
  - `core::ResultadoEnvio core::enviarBuffer(Buffer& buf, size_t tamanhoLote, const std::string& stationId, const FuncaoPost& post)`

- [ ] **Step 1: Escrever o teste que falha**

`firmware/test/test_native/test_envio/test_main.cpp`:

```cpp
#include <unity.h>

#include <cstdio>
#include <string>
#include <vector>

#include "buffer.h"
#include "envio.h"
#include "mem_fs.h"

static const char* ARQ = "/buffer.jsonl";

static std::string leitura(int i) {
  char s[80];
  snprintf(s, sizeof(s), "{\"timestamp\":\"2026-01-01T%02d:%02d:00.000Z\"}", i / 60, i % 60);
  return s;
}

void setUp() {}
void tearDown() {}

void test_payload_no_formato_do_contrato() {
  TEST_ASSERT_EQUAL_STRING("{\"station_id\":\"main\",\"readings\":[{\"a\":1},{\"b\":2}]}",
                           core::montarPayload("main", {"{\"a\":1}", "{\"b\":2}"}).c_str());
}

void test_payload_vazio_e_station_escapada() {
  TEST_ASSERT_EQUAL_STRING("{\"station_id\":\"main\",\"readings\":[]}", core::montarPayload("main", {}).c_str());
  TEST_ASSERT_EQUAL_STRING("{\"station_id\":\"ma\\\"in\",\"readings\":[]}", core::montarPayload("ma\"in", {}).c_str());
}

void test_buffer_vazio_nao_chama_post() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  int chamadas = 0;
  const core::ResultadoEnvio r = core::enviarBuffer(b, 50, "main", [&](const std::string&) {
    ++chamadas;
    return true;
  });
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_INT(0, chamadas);
}

void test_envia_em_lotes_e_esvazia() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  for (int i = 0; i < 120; ++i) b.adicionar(leitura(i));
  std::vector<size_t> tamanhos;
  const core::ResultadoEnvio r = core::enviarBuffer(b, 50, "main", [&](const std::string& corpo) {
    size_t n = 0;
    for (size_t p = corpo.find("timestamp"); p != std::string::npos; p = corpo.find("timestamp", p + 1)) ++n;
    tamanhos.push_back(n);
    return true;
  });
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(120, r.enviadas);
  TEST_ASSERT_EQUAL_UINT32(3, tamanhos.size());
  TEST_ASSERT_EQUAL_UINT32(50, tamanhos[0]);
  TEST_ASSERT_EQUAL_UINT32(20, tamanhos[2]);
  TEST_ASSERT_EQUAL_UINT32(0, b.contar());
}

void test_falha_no_meio_mantem_o_restante() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  for (int i = 0; i < 120; ++i) b.adicionar(leitura(i));
  int chamada = 0;
  const core::ResultadoEnvio r = core::enviarBuffer(b, 50, "main", [&](const std::string&) { return ++chamada == 1; });
  TEST_ASSERT_FALSE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(50, r.enviadas);
  TEST_ASSERT_EQUAL_UINT32(70, b.contar());
  TEST_ASSERT_EQUAL_STRING(leitura(50).c_str(), b.carregarLote(1).leituras[0].c_str());
}

void test_linha_corrompida_no_lote_nao_duplica_envio() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = leitura(1) + "\nlixo\n" + leitura(2) + "\n" + leitura(3) + "\n";
  core::Buffer b(fs, ARQ, 5000);
  std::vector<std::string> corpos;
  const core::ResultadoEnvio r = core::enviarBuffer(b, 2, "main", [&](const std::string& c) {
    corpos.push_back(c);
    return true;
  });
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(3, r.enviadas);
  TEST_ASSERT_EQUAL_UINT32(1, r.descartadas);
  TEST_ASSERT_EQUAL_UINT32(2, corpos.size());
  TEST_ASSERT_EQUAL_STRING(core::montarPayload("main", {leitura(3)}).c_str(), corpos[1].c_str());
}

void test_lote_todo_corrompido_e_descartado_sem_post() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = "lixo1\nlixo2\n{\"_boot\":1,\"_up_ms\":5}\n";
  core::Buffer b(fs, ARQ, 5000);
  int chamadas = 0;
  const core::ResultadoEnvio r = core::enviarBuffer(b, 50, "main", [&](const std::string&) {
    ++chamadas;
    return true;
  });
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_INT(0, chamadas);
  TEST_ASSERT_EQUAL_UINT32(3, r.descartadas);
  TEST_ASSERT_EQUAL_UINT32(0, b.contar());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_payload_no_formato_do_contrato);
  RUN_TEST(test_payload_vazio_e_station_escapada);
  RUN_TEST(test_buffer_vazio_nao_chama_post);
  RUN_TEST(test_envia_em_lotes_e_esvazia);
  RUN_TEST(test_falha_no_meio_mantem_o_restante);
  RUN_TEST(test_linha_corrompida_no_lote_nao_duplica_envio);
  RUN_TEST(test_lote_todo_corrompido_e_descartado_sem_post);
  return UNITY_END();
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_envio`
Expected: FAIL de compilação, `envio.h: No such file or directory`.

- [ ] **Step 3: Implementar**

`firmware/lib/core/src/envio.h`:

```cpp
#pragma once
#include <stddef.h>
#include <stdint.h>

#include <functional>
#include <string>
#include <vector>

#include "buffer.h"

namespace core {

// {"station_id": "...", "readings": [linha, linha, ...]} — as linhas do buffer
// já são JSON e entram como estão (sem reparse: economiza RAM).
std::string montarPayload(const std::string& stationId, const std::vector<std::string>& leituras);

// Faz o POST; devolve true SOMENTE com HTTP 2xx (a API usa 202).
using FuncaoPost = std::function<bool(const std::string& corpo)>;

struct ResultadoEnvio {
  bool ok = false;           // true = buffer esvaziado
  uint32_t enviadas = 0;
  uint32_t descartadas = 0;  // linhas corrompidas/sem hora removidas
};

// Envia o buffer em lotes. Só remove um lote após o 2xx. Qualquer falha para
// e mantém o restante para a próxima tentativa.
ResultadoEnvio enviarBuffer(Buffer& buf, size_t tamanhoLote, const std::string& stationId, const FuncaoPost& post);

}  // namespace core
```

`firmware/lib/core/src/envio.cpp`:

```cpp
#include "envio.h"

#include <ArduinoJson.h>

namespace core {

std::string montarPayload(const std::string& stationId, const std::vector<std::string>& leituras) {
  JsonDocument id;
  id.set(stationId);
  std::string corpo = "{\"station_id\":";
  serializeJson(id, corpo);
  corpo += ",\"readings\":[";
  for (size_t i = 0; i < leituras.size(); ++i) {
    if (i) corpo += ',';
    corpo += leituras[i];
  }
  corpo += "]}";
  return corpo;
}

ResultadoEnvio enviarBuffer(Buffer& buf, size_t tamanhoLote, const std::string& stationId, const FuncaoPost& post) {
  ResultadoEnvio r;
  if (buf.contar() == 0) {
    r.ok = true;
    return r;
  }
  for (;;) {
    const Buffer::Lote lote = buf.carregarLote(tamanhoLote);
    if (lote.linhasLidas == 0) break;
    if (lote.leituras.empty()) {
      // Lote inteiro corrompido: sem isto essas linhas travariam o início do
      // buffer para sempre (nunca enviadas nem removidas).
      if (!buf.removerInicio(lote.linhasLidas)) return r;
      r.descartadas += lote.linhasLidas;
      continue;
    }
    if (!post(montarPayload(stationId, lote.leituras))) return r;
    // Remove 'linhasLidas', não leituras.size() — ver Buffer::carregarLote.
    if (!buf.removerInicio(lote.linhasLidas)) return r;
    r.enviadas += static_cast<uint32_t>(lote.leituras.size());
    r.descartadas += lote.linhasLidas - static_cast<uint32_t>(lote.leituras.size());
  }
  r.ok = true;
  return r;
}

}  // namespace core
```

- [ ] **Step 4: Rodar e ver passar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native -f test_native/test_envio`
Expected: `7 succeeded`.

- [ ] **Step 5: Suíte native completa + cobertura**

Run:

```bash
cd firmware
"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native
"$HOME/.platformio/penv/Scripts/python.exe" -m gcovr --root . --filter 'lib/core/' --fail-under-line 80 --print-summary .pio/build/native
```

Expected: todas as suítes passam e `lines: ≥ 80%`. Se ficar abaixo, acrescentar testes para as linhas que o `gcovr --html-details cobertura.html` apontar como não cobertas, antes do commit.

- [ ] **Step 6: Commit**

```bash
git add firmware/lib/core/src/envio.* firmware/test/test_native/test_envio
git commit -m "feat(firmware): envio do buffer em lotes so removendo apos 2xx

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 10: HAL base — LittleFS, relógio, RTC memory e watchdog

**Files:**
- Create: `firmware/lib/hal/src/fs_littlefs.h`, `.cpp`, `firmware/lib/hal/src/clock_hal.h`, `.cpp`, `firmware/lib/hal/src/rtc_hal.h`, `.cpp`, `firmware/lib/hal/src/wdt_hal.h`, `.cpp`
- Test: `firmware/test/test_embedded/test_littlefs/test_main.cpp` (roda na placa)

**Interfaces:**
- Consumes: `core::ISistemaArquivos`, `core::Buffer` (Task 7); `core::EstadoRtc`, `core::selarRtc`, `core::lerRtc` (Task 4)
- Produces:
  - `class hal::SistemaArquivosLittleFs : core::ISistemaArquivos`, `bool hal::montarLittleFs()`
  - `uint64_t hal::uptimeMs()`, `uint32_t hal::incrementarContadorBoot()`, `int64_t hal::epochMsDoSistema()`, `int64_t hal::epochSDoSistema()`, `void hal::definirHoraSistema(int64_t epochS)`
  - `void hal::rtcIniciar(bool resetPorEnergia)`, `void hal::rtcLerInicial(uint32_t& tips, bool& horaOk)`, `void hal::rtcGravarTips(uint32_t)` (IRAM), `void hal::rtcGravarHoraOk(bool)`
  - `void hal::wdtIniciar(uint32_t timeoutS)`, `void hal::wdtAlimentar()`, `void hal::wdtPausar()`, `void hal::wdtRetomar()`

- [ ] **Step 1: Escrever o teste embarcado que falha**

`firmware/test/test_embedded/test_littlefs/test_main.cpp`:

```cpp
#include <Arduino.h>
#include <unity.h>

#include "buffer.h"
#include "clock_hal.h"
#include "fs_littlefs.h"

static hal::SistemaArquivosLittleFs fs;
static const char* ARQ = "/teste_buffer.jsonl";

void setUp() {
  fs.remover(ARQ);
  fs.remover("/teste_buffer.jsonl.tmp");
  fs.remover("/destino.txt");
}
void tearDown() {}

void test_monta_littlefs() { TEST_ASSERT_TRUE(hal::montarLittleFs()); }

void test_buffer_sobre_littlefs() {
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_TRUE(b.adicionar("{\"timestamp\":\"2026-01-01T00:00:00.000Z\"}"));
  TEST_ASSERT_TRUE(b.adicionar("{\"timestamp\":\"2026-01-01T00:15:00.000Z\"}"));
  TEST_ASSERT_EQUAL_UINT32(2, b.contar());
  TEST_ASSERT_TRUE(b.removerInicio(1));
  const core::Buffer::Lote l = b.carregarLote(10);
  TEST_ASSERT_EQUAL_UINT32(1, l.leituras.size());
  TEST_ASSERT_EQUAL_STRING("{\"timestamp\":\"2026-01-01T00:15:00.000Z\"}", l.leituras[0].c_str());
}

void test_rename_sobrescreve_destino() {
  // Premissa do Buffer: no LittleFS o rename substitui o destino atomicamente.
  { auto f = fs.abrir("/destino.txt", 'w'); f->escrever(reinterpret_cast<const uint8_t*>("velho"), 5); }
  { auto f = fs.abrir(ARQ, 'w'); f->escrever(reinterpret_cast<const uint8_t*>("novo"), 4); }
  TEST_ASSERT_TRUE(fs.renomear(ARQ, "/destino.txt"));
  TEST_ASSERT_EQUAL(4, fs.tamanho("/destino.txt"));
  TEST_ASSERT_FALSE(fs.existe(ARQ));
}

void test_abrir_inexistente_para_leitura_devolve_nulo() {
  TEST_ASSERT_NULL(fs.abrir("/nao_existe.txt", 'r').get());
  TEST_ASSERT_EQUAL(-1, fs.tamanho("/nao_existe.txt"));
}

void test_uptime_avanca() {
  const uint64_t a = hal::uptimeMs();
  delay(20);
  TEST_ASSERT_TRUE(hal::uptimeMs() - a >= 19);
}

void test_contador_de_boot_incrementa() {
  const uint32_t a = hal::incrementarContadorBoot();
  TEST_ASSERT_EQUAL_UINT32(a + 1, hal::incrementarContadorBoot());
}

void setup() {
  delay(2000);  // tempo para o monitor serial abrir
  UNITY_BEGIN();
  RUN_TEST(test_monta_littlefs);
  RUN_TEST(test_buffer_sobre_littlefs);
  RUN_TEST(test_rename_sobrescreve_destino);
  RUN_TEST(test_abrir_inexistente_para_leitura_devolve_nulo);
  RUN_TEST(test_uptime_avanca);
  RUN_TEST(test_contador_de_boot_incrementa);
  UNITY_END();
}

void loop() {}
```

- [ ] **Step 2: Rodar na placa e ver falhar**

Run: `cd firmware && "$HOME/.platformio/penv/Scripts/platformio.exe" test -e esp32 -f test_embedded/test_littlefs`
Expected: FAIL de compilação, `fs_littlefs.h: No such file or directory`.

- [ ] **Step 3: Implementar `fs_littlefs`**

`firmware/lib/hal/src/fs_littlefs.h`:

```cpp
#pragma once
#include "fs_iface.h"

namespace hal {

// Monta o LittleFS (formata se a partição estiver vazia/corrompida).
bool montarLittleFs();

class SistemaArquivosLittleFs : public core::ISistemaArquivos {
 public:
  std::unique_ptr<core::IArquivo> abrir(const char* caminho, char modo) override;
  bool existe(const char* caminho) override;
  long tamanho(const char* caminho) override;
  bool remover(const char* caminho) override;
  bool renomear(const char* de, const char* para) override;
};

}  // namespace hal
```

`firmware/lib/hal/src/fs_littlefs.cpp`:

```cpp
#include "fs_littlefs.h"

#include <LittleFS.h>

namespace hal {

namespace {

class ArquivoLittleFs : public core::IArquivo {
 public:
  explicit ArquivoLittleFs(File f) : f_(f) {}
  ~ArquivoLittleFs() override { f_.close(); }
  size_t ler(uint8_t* buf, size_t n) override { return f_.read(buf, n); }
  size_t escrever(const uint8_t* buf, size_t n) override { return f_.write(buf, n); }
  bool posicionar(size_t pos) override { return f_.seek(pos); }

 private:
  File f_;
};

}  // namespace

bool montarLittleFs() { return LittleFS.begin(true); }

std::unique_ptr<core::IArquivo> SistemaArquivosLittleFs::abrir(const char* caminho, char modo) {
  // Checar antes evita o log de erro do VFS ao abrir inexistente para leitura.
  if (modo == 'r' && !LittleFS.exists(caminho)) return nullptr;
  const char* m = modo == 'w' ? FILE_WRITE : (modo == 'a' ? FILE_APPEND : FILE_READ);
  File f = LittleFS.open(caminho, m);
  if (!f) return nullptr;
  return std::unique_ptr<core::IArquivo>(new ArquivoLittleFs(f));
}

bool SistemaArquivosLittleFs::existe(const char* caminho) { return LittleFS.exists(caminho); }

long SistemaArquivosLittleFs::tamanho(const char* caminho) {
  if (!LittleFS.exists(caminho)) return -1;
  File f = LittleFS.open(caminho, FILE_READ);
  if (!f) return -1;
  const long t = static_cast<long>(f.size());
  f.close();
  return t;
}

bool SistemaArquivosLittleFs::remover(const char* caminho) {
  return LittleFS.exists(caminho) && LittleFS.remove(caminho);
}

bool SistemaArquivosLittleFs::renomear(const char* de, const char* para) { return LittleFS.rename(de, para); }

}  // namespace hal
```

- [ ] **Step 4: Implementar `clock_hal`**

`firmware/lib/hal/src/clock_hal.h`:

```cpp
#pragma once
#include <stdint.h>

namespace hal {

// Uptime em ms pelo esp_timer: 64 bits (não dá a volta em 49 dias como o
// millis()) e compensado durante o lightsleep.
uint64_t uptimeMs();

// Contador de boots persistente (NVS). Identifica de qual boot é uma leitura
// pendente (_boot): o uptime só tem relação com a hora dentro do mesmo boot.
uint32_t incrementarContadorBoot();

int64_t epochMsDoSistema();
int64_t epochSDoSistema();
void definirHoraSistema(int64_t epochS);

}  // namespace hal
```

`firmware/lib/hal/src/clock_hal.cpp`:

```cpp
#include "clock_hal.h"

#include <Preferences.h>
#include <esp_timer.h>
#include <sys/time.h>

namespace hal {

uint64_t uptimeMs() { return static_cast<uint64_t>(esp_timer_get_time() / 1000); }

uint32_t incrementarContadorBoot() {
  Preferences p;
  p.begin("estacao", false);
  const uint32_t n = p.getUInt("boot", 0) + 1;
  p.putUInt("boot", n);
  p.end();
  return n;
}

int64_t epochMsDoSistema() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return static_cast<int64_t>(tv.tv_sec) * 1000 + tv.tv_usec / 1000;
}

int64_t epochSDoSistema() { return epochMsDoSistema() / 1000; }

void definirHoraSistema(int64_t epochS) {
  struct timeval tv;
  tv.tv_sec = static_cast<time_t>(epochS);
  tv.tv_usec = 0;
  settimeofday(&tv, nullptr);
}

}  // namespace hal
```

- [ ] **Step 5: Implementar `rtc_hal`**

`firmware/lib/hal/src/rtc_hal.h`:

```cpp
#pragma once
#include <stdint.h>

namespace hal {

// Estado em RTC_NOINIT_ATTR: sobrevive a reset por software, panic e watchdog,
// não a queda de energia. Chamar rtcIniciar() uma vez no boot.
void rtcIniciar(bool resetPorEnergia);
void rtcLerInicial(uint32_t& tips, bool& horaOk);  // o que havia no boot
void rtcGravarTips(uint32_t tips);                  // seguro em ISR
void rtcGravarHoraOk(bool horaOk);

}  // namespace hal
```

`firmware/lib/hal/src/rtc_hal.cpp`:

```cpp
#include "rtc_hal.h"

#include <esp_attr.h>
#include <freertos/FreeRTOS.h>

#include "rtc_state.h"

namespace hal {

namespace {
RTC_NOINIT_ATTR core::EstadoRtc s_rtc;
portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
uint32_t s_tipsInicial = 0;
bool s_horaInicial = false;
}  // namespace

void rtcIniciar(bool resetPorEnergia) {
  uint32_t tips = 0;
  bool hora = false;
  // Em power-on a RAM RTC é lixo; a verificação cobre o resto dos casos.
  if (resetPorEnergia || !core::lerRtc(s_rtc, tips, hora)) {
    tips = 0;
    hora = false;
    core::selarRtc(s_rtc, 0, false);
  }
  s_tipsInicial = tips;
  s_horaInicial = hora;
}

void rtcLerInicial(uint32_t& tips, bool& horaOk) {
  tips = s_tipsInicial;
  horaOk = s_horaInicial;
}

void IRAM_ATTR rtcGravarTips(uint32_t tips) {
  portENTER_CRITICAL_SAFE(&s_mux);
  core::selarRtc(s_rtc, tips, s_rtc.horaOk == 1u);
  portEXIT_CRITICAL_SAFE(&s_mux);
}

void rtcGravarHoraOk(bool horaOk) {
  portENTER_CRITICAL_SAFE(&s_mux);
  core::selarRtc(s_rtc, s_rtc.tips, horaOk);
  portEXIT_CRITICAL_SAFE(&s_mux);
}

}  // namespace hal
```

- [ ] **Step 6: Implementar `wdt_hal`**

`firmware/lib/hal/src/wdt_hal.h`:

```cpp
#pragma once
#include <stdint.h>

namespace hal {

// Task watchdog do loop. Pausado durante o lightsleep: o sono dura até 15 min
// e não pode ser confundido com travamento.
void wdtIniciar(uint32_t timeoutS);
void wdtAlimentar();  // no-op se o watchdog não foi iniciado (sketches de bancada)
void wdtPausar();
void wdtRetomar();

}  // namespace hal
```

`firmware/lib/hal/src/wdt_hal.cpp`:

```cpp
#include "wdt_hal.h"

#include <esp_task_wdt.h>

namespace hal {

namespace {
bool s_ativo = false;
bool s_inscrito = false;
}  // namespace

void wdtIniciar(uint32_t timeoutS) {
  esp_task_wdt_config_t cfg = {};
  cfg.timeout_ms = timeoutS * 1000;
  cfg.idle_core_mask = 0;
  cfg.trigger_panic = true;
  if (esp_task_wdt_reconfigure(&cfg) != ESP_OK) esp_task_wdt_init(&cfg);
  s_ativo = true;
  wdtRetomar();
}

void wdtAlimentar() {
  if (s_inscrito) esp_task_wdt_reset();
}

void wdtPausar() {
  if (s_inscrito && esp_task_wdt_delete(nullptr) == ESP_OK) s_inscrito = false;
}

void wdtRetomar() {
  if (s_ativo && !s_inscrito) s_inscrito = esp_task_wdt_add(nullptr) == ESP_OK;
  wdtAlimentar();
}

}  // namespace hal
```

- [ ] **Step 7: Rodar o teste embarcado e ver passar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" test -e esp32 -f test_embedded/test_littlefs`
Expected: `6 Tests 0 Failures`. O teste grava na placa, que precisa estar em COM3.

- [ ] **Step 8: Compilar o env principal (garante que a lib hal compila junto)**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" run -e esp32`
Expected: `SUCCESS`, sem warnings novos.

- [ ] **Step 9: Commit**

```bash
git add firmware/lib/hal/src/fs_littlefs.* firmware/lib/hal/src/clock_hal.* firmware/lib/hal/src/rtc_hal.* firmware/lib/hal/src/wdt_hal.* firmware/test/test_embedded
git commit -m "feat(firmware): HAL de LittleFS, relogio, RTC memory e watchdog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 11: Sensores BME280 e UV + bancada b0, b1, b2, b5, b6

**Files:**
- Create: `firmware/lib/hal/src/sensores_hal.h`, `firmware/lib/hal/src/sensores_hal.cpp`, `firmware/src/bench/b0_placa.cpp`, `firmware/src/bench/b1_i2c_scan.cpp`, `firmware/src/bench/b2_bme280.cpp`, `firmware/src/bench/b5_uv.cpp`, `firmware/src/bench/b6_uv_campo.cpp`
- Modify: `firmware/platformio.ini` (envs de bancada)

**Interfaces:**
- Consumes: `core::Sensor`, `core::escreverChuva` (Task 6); `core::identificarChip`, `core::decodificarCalib`, `core::compensarBme` (Task 5); `core::mediana`, `core::avaliarUv` (Task 6); `core::arredondar` (Task 1)
- Produces:
  - `class hal::SensorBme280 : core::Sensor { SensorBme280(TwoWire&, uint8_t endereco); }` (nome `"bme280"`)
  - `class hal::SensorUv : core::Sensor { SensorUv(int pino, double limiteSoltoMv); void iniciar(); double lerMv(); }` (nome `"uv_guva"`)
  - `class hal::SensorChuva : core::Sensor { explicit SensorChuva(double mmPorTip); }` (nome `"rain_gauge"`; usa `hal::chuvaRetirar()` da Task 12, declarado aqui via `rain_hal.h`, que a Task 12 cria. Por isso a `SensorChuva` entra na Task 12)

- [ ] **Step 1: Implementar `sensores_hal` (BME280 e UV)**

`firmware/lib/hal/src/sensores_hal.h`:

```cpp
#pragma once
#include <Wire.h>

#include "bme280_math.h"
#include "sensor.h"

namespace hal {

// BME280/BMP280 por I2C, modo forçado (uma conversão por leitura). Identifica
// o chip e lê a calibração uma vez (o lightsleep preserva a RAM); em erro de
// I2C zera o cache para reidentificar na próxima leitura.
class SensorBme280 : public core::Sensor {
 public:
  SensorBme280(TwoWire& wire, uint8_t endereco);
  const char* nome() const override { return "bme280"; }
  bool ler(JsonObject saida, std::string& erro) override;

 private:
  bool preparar(std::string& erro);
  bool lerRegs(uint8_t reg, uint8_t* buf, size_t n);
  bool escreverReg(uint8_t reg, uint8_t valor);

  TwoWire& wire_;
  uint8_t endereco_;
  bool pronto_;
  bool comUmidade_;
  core::CalibBme calib_;
};

// GUVA-S12SD analógico no ADC1, atenuação de 6 dB (linear até ~1750 mV).
// Mediana de 15 grupos x média de 8 amostras calibradas (eFuse).
// LIMITAÇÃO: o ADC do ESP32 não lê bem abaixo de ~100-150 mV. O escuro, que no
// Pico dava 12,6 mV, aparece com esse piso em uv_voltage_v. O índice não muda (0).
class SensorUv : public core::Sensor {
 public:
  SensorUv(int pino, double limiteSoltoMv);
  void iniciar();
  double lerMv();  // mediana em mV (usado também pelos sketches de bancada)
  const char* nome() const override { return "uv_guva"; }
  bool ler(JsonObject saida, std::string& erro) override;

 private:
  int pino_;
  double limiteSoltoMv_;
};

}  // namespace hal
```

`firmware/lib/hal/src/sensores_hal.cpp`:

```cpp
#include "sensores_hal.h"

#include <Arduino.h>

#include "texto.h"
#include "uv_math.h"

namespace hal {

// ---------------- BME280 ----------------

SensorBme280::SensorBme280(TwoWire& wire, uint8_t endereco)
    : wire_(wire), endereco_(endereco), pronto_(false), comUmidade_(false), calib_{} {}

bool SensorBme280::lerRegs(uint8_t reg, uint8_t* buf, size_t n) {
  wire_.beginTransmission(endereco_);
  wire_.write(reg);
  if (wire_.endTransmission(false) != 0) return false;
  if (wire_.requestFrom(static_cast<uint16_t>(endereco_), n, true) != n) return false;
  for (size_t i = 0; i < n; ++i) buf[i] = static_cast<uint8_t>(wire_.read());
  return true;
}

bool SensorBme280::escreverReg(uint8_t reg, uint8_t valor) {
  wire_.beginTransmission(endereco_);
  wire_.write(reg);
  wire_.write(valor);
  return wire_.endTransmission() == 0;
}

bool SensorBme280::preparar(std::string& erro) {
  if (pronto_) return true;
  uint8_t chip = 0;
  if (!lerRegs(0xD0, &chip, 1)) {
    erro = "sem resposta no I2C";
    return false;
  }
  const core::ChipBme tipo = core::identificarChip(chip);
  if (tipo == core::ChipBme::DESCONHECIDO) {
    char msg[80];
    snprintf(msg, sizeof(msg), "chip_id 0x%02X em 0x%02X nao e BMP280 (0x58) nem BME280 (0x60)", chip, endereco_);
    erro = msg;
    return false;
  }
  const bool comUmidade = tipo == core::ChipBme::BME280;
  uint8_t tp[24];
  uint8_t h1 = 0;
  uint8_t he[7] = {};
  if (!lerRegs(0x88, tp, sizeof(tp)) || (comUmidade && (!lerRegs(0xA1, &h1, 1) || !lerRegs(0xE1, he, 7)))) {
    erro = "falha lendo calibracao";
    return false;
  }
  calib_ = core::decodificarCalib(tp, comUmidade, h1, he);
  comUmidade_ = comUmidade;
  pronto_ = true;
  Serial.printf("[INFO] bme280: %s em 0x%02X (chip_id 0x%02X), umidade=%s\n", comUmidade ? "BME280" : "BMP280",
                endereco_, chip, comUmidade ? "sim" : "NAO");
  return true;
}

bool SensorBme280::ler(JsonObject saida, std::string& erro) {
  if (!preparar(erro)) return false;
  // O datasheet exige ctrl_hum (0xF2) ANTES de ctrl_meas (0xF4).
  const bool disparou = (!comUmidade_ || escreverReg(0xF2, 0x01)) && escreverReg(0xF4, 0x25);
  uint8_t d[8];
  if (!disparou) {
    pronto_ = false;
    erro = "falha I2C ao disparar medicao";
    return false;
  }
  delay(50);  // conversão x1 leva ~9 ms
  if (!lerRegs(0xF7, d, comUmidade_ ? 8 : 6)) {
    pronto_ = false;
    erro = "falha I2C ao ler medicao";
    return false;
  }
  const core::MedidaBme m = core::compensarBme(calib_, d, comUmidade_);
  saida["temperature_c"] = core::arredondar(m.temperaturaC, 2);
  saida["pressure_hpa"] = core::arredondar(m.pressaoHpa, 2);
  if (m.temUmidade) saida["humidity_pct"] = core::arredondar(m.umidadePct, 2);
  return true;
}

// ---------------- UV ----------------

SensorUv::SensorUv(int pino, double limiteSoltoMv) : pino_(pino), limiteSoltoMv_(limiteSoltoMv) {}

void SensorUv::iniciar() {
  // Atenuação GLOBAL, não por pino: no Arduino-ESP32 3.x a calibração que
  // converte a leitura crua em mV é criada uma vez por unidade de ADC com a
  // atenuação global (esp32-hal-adc.c). Com analogSetPinAttenuation o canal
  // lia em 6 dB e convertia pela curva de 11 dB, dando mV errados (no b5, o
  // PULL_UP lia 3160 mV, impossível em 6 dB). O UV é a única entrada analógica
  // da estação, então mexer no global não afeta nenhum outro sensor.
  analogSetAttenuation(ADC_6db);
}

double SensorUv::lerMv() {
  double grupos[15];
  for (double& g : grupos) {
    uint32_t soma = 0;
    for (int i = 0; i < 8; ++i) soma += analogReadMilliVolts(pino_);
    g = soma / 8.0;
  }
  return core::mediana(grupos, 15);
}

bool SensorUv::ler(JsonObject saida, std::string& erro) {
  const double mv = lerMv();
  const core::AvaliacaoUv a = core::avaliarUv(mv, limiteSoltoMv_);
  if (a.status == core::StatusUv::SINAL_SOLTO) {
    char msg[64];
    snprintf(msg, sizeof(msg), "ADC em %.0f mV: sinal solto, nao UV", mv);
    erro = msg;
    return false;
  }
  saida["uv_index"] = a.indice;
  saida["uv_voltage_v"] = a.tensaoV;
  return true;
}

}  // namespace hal
```

- [ ] **Step 2: Acrescentar os envs de bancada ao `platformio.ini`**

```ini

; ---------------- sketches de bancada (src/bench) ----------------
[env:bench_b0_placa]
extends = common_esp32
build_src_filter = +<bench/b0_placa.cpp>

[env:bench_b1_i2c_scan]
extends = common_esp32
build_src_filter = +<bench/b1_i2c_scan.cpp>

[env:bench_b2_bme280]
extends = common_esp32
build_src_filter = +<bench/b2_bme280.cpp>

[env:bench_b5_uv]
extends = common_esp32
build_src_filter = +<bench/b5_uv.cpp>

[env:bench_b6_uv_campo]
extends = common_esp32
build_src_filter = +<bench/b6_uv_campo.cpp>
```

- [ ] **Step 3: `b0_placa.cpp` — identificação da placa**

`firmware/src/bench/b0_placa.cpp`:

```cpp
// b0_placa — identifica placa, firmware e partições. Não mexe em hardware externo.
#include <Arduino.h>
#include <LittleFS.h>
#include <esp_chip_info.h>
#include <esp_flash.h>
#include <esp_mac.h>
#include <esp_partition.h>

void setup() {
  Serial.begin(115200);
  delay(1500);
  esp_chip_info_t ci;
  esp_chip_info(&ci);
  uint32_t flash = 0;
  esp_flash_get_size(nullptr, &flash);
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);

  Serial.println("==============================================");
  Serial.printf("Chip        : %s rev %d.%d, %d nucleo(s)\n", ESP.getChipModel(), ci.revision / 100, ci.revision % 100, ci.cores);
  Serial.printf("CPU         : %lu MHz\n", static_cast<unsigned long>(getCpuFrequencyMhz()));
  Serial.printf("Flash       : %lu bytes\n", static_cast<unsigned long>(flash));
  Serial.printf("PSRAM       : %lu bytes\n", static_cast<unsigned long>(ESP.getPsramSize()));
  Serial.printf("Heap livre  : %lu bytes\n", static_cast<unsigned long>(ESP.getFreeHeap()));
  Serial.printf("MAC         : %02x:%02x:%02x:%02x:%02x:%02x\n", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  Serial.printf("Reset       : motivo %d\n", static_cast<int>(esp_reset_reason()));
  Serial.printf("ESP-IDF     : %s\n", ESP.getSdkVersion());
  Serial.println("Particoes   :");
  esp_partition_iterator_t it = esp_partition_find(ESP_PARTITION_TYPE_ANY, ESP_PARTITION_SUBTYPE_ANY, nullptr);
  while (it != nullptr) {
    const esp_partition_t* p = esp_partition_get(it);
    Serial.printf("  %-10s tipo %d/%-3d 0x%06lx %8lu bytes\n", p->label, p->type, p->subtype,
                  static_cast<unsigned long>(p->address), static_cast<unsigned long>(p->size));
    it = esp_partition_next(it);
  }
  esp_partition_iterator_release(it);
  if (LittleFS.begin(true)) {
    Serial.printf("LittleFS    : %u de %u bytes usados\n", static_cast<unsigned>(LittleFS.usedBytes()),
                  static_cast<unsigned>(LittleFS.totalBytes()));
  } else {
    Serial.println("LittleFS    : FALHOU ao montar");
  }
  Serial.println("==============================================");
}

void loop() { delay(1000); }
```

- [ ] **Step 4: `b1_i2c_scan.cpp` — diagnóstico da fiação do BME280**

`firmware/src/bench/b1_i2c_scan.cpp`:

```cpp
// b1_i2c_scan — acha o sensor no I2C e diagnostica a fiação.
//  1) nível de repouso de SDA/SCL (um módulo alimentado tem pull-up -> 1)
//  2) varredura 0x03..0x77 nos pinos do config.h
//  3) identificação do chip em 0x76/0x77 (BME280 x BMP280)
#include <Arduino.h>
#include <Wire.h>

#include "config.h"

static void identificar(uint8_t addr) {
  Wire.beginTransmission(addr);
  Wire.write(0xD0);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(static_cast<uint16_t>(addr), static_cast<size_t>(1), true) != 1) {
    Serial.println("       falha lendo chip_id");
    return;
  }
  const uint8_t chip = Wire.read();
  const char* tipo = chip == 0x60 ? "BME280 (COM umidade)" : chip == 0x58 ? "BMP280 (SEM umidade)" : "desconhecido";
  Serial.printf("       chip_id 0x%02X -> %s\n", chip, tipo);
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.printf("Configurado: SDA=GPIO%d  SCL=GPIO%d  addr esperado 0x%02X\n", I2C_SDA, I2C_SCL, BME280_ADDR);

  pinMode(I2C_SDA, INPUT);
  pinMode(I2C_SCL, INPUT);
  delay(5);
  const int sda = digitalRead(I2C_SDA), scl = digitalRead(I2C_SCL);
  Serial.printf("\n1) Repouso: SDA=%d SCL=%d (esperado 1 e 1)\n", sda, scl);
  if (sda == 0 && scl == 0) Serial.println("   >> AMBAS em 0: modulo sem alimentacao ou SDA/SCL em curto com GND.");
  else if (sda == 0 || scl == 0) Serial.println("   >> Uma linha presa em 0: fio em curto com GND ou pino errado.");
  else Serial.println("   >> OK: ha pull-up, o modulo parece alimentado.");

  Wire.begin(I2C_SDA, I2C_SCL, I2C_FREQ);
  Serial.println("\n2) Varredura:");
  int achados = 0;
  for (uint8_t a = 0x03; a <= 0x77; ++a) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      ++achados;
      Serial.printf("   0x%02X encontrado\n", a);
      if (a == 0x76 || a == 0x77) identificar(a);
    }
  }
  if (achados == 0) {
    Serial.println("   nada encontrado. Checklist:");
    Serial.println("     - VCC do modulo no 3V3 (NUNCA no 5V/VIN)");
    Serial.println("     - GND do modulo em um GND da placa");
    Serial.printf("     - SDA no GPIO%d e SCL no GPIO%d, nao trocados\n", I2C_SDA, I2C_SCL);
    Serial.println("     - se o modulo tiver CSB/CS, ele vai em VCC para modo I2C");
  }
}

void loop() { delay(1000); }
```

- [ ] **Step 5: `b2_bme280.cpp` — leitura contínua**

`firmware/src/bench/b2_bme280.cpp`:

```cpp
// b2_bme280 — leitura contínua a cada 2 s. Confira:
//  - temperatura bate com um termômetro comum (±1 °C)
//  - umidade sobe rápido ao bafejar no sensor (e volta devagar)
//  - pressão ~1013 hPa ao nível do mar; cai ~1,2 hPa a cada 10 m de altitude
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Wire.h>

#include "config.h"
#include "sensores_hal.h"

static hal::SensorBme280 bme(Wire, BME280_ADDR);

void setup() {
  Serial.begin(115200);
  delay(1500);
  Wire.begin(I2C_SDA, I2C_SCL, I2C_FREQ);
  Serial.println("  TEMP(C)    UMID(%)          PRESS(hPa)");
}

void loop() {
  JsonDocument doc;
  std::string erro;
  if (bme.ler(doc.to<JsonObject>(), erro)) {
    Serial.printf("  %-10.2f %-16s %-10.2f\n", doc["temperature_c"].as<double>(),
                  doc["humidity_pct"].is<double>() ? String(doc["humidity_pct"].as<double>(), 2).c_str() : "-- (BMP280)",
                  doc["pressure_hpa"].as<double>());
  } else {
    Serial.printf("  ERRO: %s -> confira 3V3, GND comum e SDA/SCL\n", erro.c_str());
  }
  delay(2000);
}
```

- [ ] **Step 6: `b5_uv.cpp` — ligação e resposta do UV**

`firmware/src/bench/b5_uv.cpp`:

```cpp
// b5_uv — teste do GUVA-S12SD no GPIO33 (ADC1_CH5), atenuação 6 dB.
// ETAPA A (qualquer hora): ligação elétrica. Com pull interno forçado, um pino
//   solto SEGUE o pull; com o módulo ligado, NÃO segue (a saída tem ~4 ohm).
//   No escuro o valor deve ficar baixo e estável — no ESP32 o piso do ADC é
//   ~100-150 mV (no Pico dava 12,6 mV): anote o piso deste módulo.
// ETAPA B (sol direto, fora de vidro): a tensão tem que subir bastante e cair
//   ao tapar com a mão (resposta rápida e reversível).
#include <Arduino.h>
#include <driver/rtc_io.h>

#include "config.h"
#include "sensores_hal.h"
#include "uv_math.h"

static hal::SensorUv uv(UV_GUVA_PIN, UV_LIMITE_SOLTO_MV);

static double medirComPull(bool pullUp) {
  const gpio_num_t g = static_cast<gpio_num_t>(UV_GUVA_PIN);
  rtc_gpio_pullup_dis(g);
  rtc_gpio_pulldown_dis(g);
  if (pullUp) rtc_gpio_pullup_en(g);
  else rtc_gpio_pulldown_en(g);
  delay(50);
  const double mv = uv.lerMv();
  rtc_gpio_pullup_dis(g);
  rtc_gpio_pulldown_dis(g);
  return mv;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  uv.iniciar();
  uv.lerMv();  // primeira leitura coloca o pino em modo analógico
  const double dn = medirComPull(false);
  const double up = medirComPull(true);
  Serial.printf("UV no GPIO%d | limite de sinal solto %.0f mV\n", UV_GUVA_PIN, UV_LIMITE_SOLTO_MV);
  Serial.printf("Teste de ligacao: PULL_DOWN %.0f mV | PULL_UP %.0f mV\n", dn, up);
  if (up - dn > 1000) Serial.println("  >> o pino SEGUE o pull: nada ligado no GPIO33. Confira o fio de sinal.");
  else Serial.println("  >> o pino NAO segue o pull: ha uma fonte ligada. OK.");
  Serial.println("\n  s    mV       indice  grafico");
}

void loop() {
  static int s = 0;
  static double minimo = 1e9, maximo = 0;
  const double mv = uv.lerMv();
  minimo = min(minimo, mv);
  maximo = max(maximo, mv);
  String barra;
  for (int i = 0; i < min(static_cast<int>(mv / 25), 60); ++i) barra += '#';
  Serial.printf("  %-4d %-8.0f %-7d %s\n", s, mv, core::indiceUv(mv), barra.c_str());
  if (++s % 40 == 0) Serial.printf("  -- min %.0f mV | max %.0f mV | variacao %.0f mV\n", minimo, maximo, maximo - minimo);
  delay(1000);
}
```

- [ ] **Step 7: `b6_uv_campo.cpp` — registrador de campo sem PC**

`firmware/src/bench/b6_uv_campo.cpp`:

```cpp
// b6_uv_campo — registrador de campo do UV, roda SEM PC (power bank).
// Grava /uv_campo.csv (sessao,t_s,mv,temp_c) e pisca o LED proporcional ao UV:
// quanto mais UV, mais rápido. TAPE O SENSOR COM A MÃO: o LED tem que
// desacelerar na hora. A temperatura do BME280 no mesmo arquivo separa deriva
// térmica de resposta a UV (o ESP32 clássico não tem sensor interno utilizável:
// sem BME, a coluna fica vazia).
// Ler depois: pio run -e bench_b6_uv_campo -t monitor e digitar 'd' para despejar o CSV.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <Wire.h>

#include "config.h"
#include "sensores_hal.h"

static const char* ARQUIVO = "/uv_campo.csv";
static hal::SensorUv uv(UV_GUVA_PIN, UV_LIMITE_SOLTO_MV);
static hal::SensorBme280 bme(Wire, BME280_ADDR);
static int sessao = 1;
static String pendente;
static int linhasPendentes = 0;

static int proximaSessao() {
  File f = LittleFS.open(ARQUIVO, FILE_READ);
  if (!f) return 1;
  int n = 0;
  while (f.available()) {
    if (f.readStringUntil('\n').startsWith("# --- sessao")) ++n;
  }
  f.close();
  return n + 1;
}

static void despejar() {
  File f = LittleFS.open(ARQUIVO, FILE_READ);
  if (!f) {
    Serial.println("(sem arquivo)");
    return;
  }
  while (f.available()) Serial.write(f.read());
  f.close();
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  pinMode(LED_PIN, OUTPUT);
  LittleFS.begin(true);
  Wire.begin(I2C_SDA, I2C_SCL, I2C_FREQ);
  uv.iniciar();
  sessao = proximaSessao();
  File f = LittleFS.open(ARQUIVO, FILE_APPEND);
  if (sessao == 1) f.print("# sessao,t_s,mv,temp_c\n");
  f.printf("# --- sessao %d (t_s=0 na energizacao) ---\n", sessao);
  f.close();
  Serial.printf("Registrando sessao %d. Digite 'd' para despejar o CSV.\n", sessao);
}

void loop() {
  if (Serial.available() && Serial.read() == 'd') despejar();
  const double mv = uv.lerMv();
  JsonDocument doc;
  std::string erro;
  const bool temTemp = bme.ler(doc.to<JsonObject>(), erro);
  pendente += String(sessao) + "," + String(millis() / 1000) + "," + String(mv, 1) + "," +
              (temTemp ? String(doc["temperature_c"].as<double>(), 2) : String("")) + "\n";
  // Grava a cada 10 amostras: corte de energia perde 10 s, não o arquivo.
  if (++linhasPendentes >= 10) {
    File f = LittleFS.open(ARQUIVO, FILE_APPEND);
    if (f) {
      f.print(pendente);
      f.close();
      pendente = "";
      linhasPendentes = 0;
    }
  }
  // Pisca por ~1 s: período de 1000 ms (escuro) a 60 ms (>= 1000 mV).
  const double fracao = min(max(mv / 1000.0, 0.0), 1.0);
  const uint32_t periodo = static_cast<uint32_t>(1000 - fracao * (1000 - 60));
  const uint32_t fim = millis() + 1000;
  while (static_cast<int32_t>(fim - millis()) > 0) {
    digitalWrite(LED_PIN, HIGH);
    delay(min<uint32_t>(periodo / 2, 40));
    digitalWrite(LED_PIN, LOW);
    delay(max<uint32_t>(1, periodo - min<uint32_t>(periodo / 2, 40)));
  }
}
```

- [ ] **Step 8: Compilar todos os envs novos**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" run -e bench_b0_placa -e bench_b1_i2c_scan -e bench_b2_bme280 -e bench_b5_uv -e bench_b6_uv_campo`
Expected: `SUCCESS` em todos.

- [ ] **Step 9: Validar na placa (conjunto com o usuário)**

1. `b0`: `platformio.exe run -e bench_b0_placa -t upload && platformio.exe device monitor`. Esperado: ESP32-D0WD-V3 rev 3.1, flash 4194304, partição `spiffs`/LittleFS com 1966080 bytes (tabela `no_ota.csv`, sem OTA).
2. Pedir ao usuário para ligar o BME280 (3V3, GND, SDA→21, SCL→22). Rodar `b1`: repouso 1/1 e `0x76 encontrado` + chip_id.
3. `b2`: temperatura plausível; pedir para bafejar e confirmar a subida da umidade.
4. Pedir ao usuário para ligar o GUVA (3V3, GND, OUT→33). Rodar `b5`: "NAO segue o pull"; anotar o piso no escuro; ao sol, a tensão sobe e cai ao tapar.
5. Registrar no README (Task 15) o piso medido do ADC e o resultado de cada etapa.

Se o BME/GUVA não estiverem disponíveis agora, registrar como pendente e seguir. O código já compila e é validado depois.

- [ ] **Step 10: Commit**

```bash
git add firmware/lib/hal/src/sensores_hal.* firmware/src/bench/b0_placa.cpp firmware/src/bench/b1_i2c_scan.cpp firmware/src/bench/b2_bme280.cpp firmware/src/bench/b5_uv.cpp firmware/src/bench/b6_uv_campo.cpp firmware/platformio.ini
git commit -m "feat(firmware): sensores BME280 e UV no ESP32 e sketches de bancada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 12: Chuva por IRQ + lightsleep com wake por nível + bancada b3, b3s, b4, b9

**Files:**
- Create: `firmware/lib/hal/src/rain_hal.h`, `.cpp`, `firmware/lib/hal/src/sleep_hal.h`, `.cpp`, `firmware/src/bench/b3_chuva.cpp`, `firmware/src/bench/b3s_chuva_sono.cpp`, `firmware/src/bench/b4_calibrar_chuva.cpp`, `firmware/src/bench/b9_consumo.cpp`
- Modify: `firmware/lib/hal/src/sensores_hal.h`, `firmware/lib/hal/src/sensores_hal.cpp` (acrescentar `SensorChuva`), `firmware/platformio.ini` (envs)

**Interfaces:**
- Consumes: `core::ContadorChuva` (Task 4); `hal::rtcGravarTips` (Task 10); `hal::uptimeMs`, `hal::wdtPausar/wdtRetomar/wdtAlimentar` (Task 10); `core::escreverChuva` (Task 6)
- Produces:
  - `void hal::chuvaIniciar(int pino, bool pullUp, bool pulsoEmAlto, uint32_t debounceMs, uint32_t tipsRestaurados)`
  - `uint32_t hal::chuvaRetirar()`, `void hal::chuvaSomar(uint32_t)`, `uint32_t hal::chuvaPendentes()`, `int hal::chuvaNivel()`
  - `void hal::chuvaAntesDeDormir()`, `void hal::chuvaDepoisDeAcordar()`
  - `enum class hal::Despertar { TIMER, GPIO, OUTRO }`, `void hal::dormirAte(uint64_t alvoUptimeMs, bool economia)`, `uint32_t hal::contadorDespertares()`, `hal::Despertar hal::ultimoDespertar()`
  - `class hal::SensorChuva : core::Sensor { explicit SensorChuva(double mmPorTip); }`

- [ ] **Step 1: Implementar `rain_hal`**

`firmware/lib/hal/src/rain_hal.h`:

```cpp
#pragma once
#include <stdint.h>

namespace hal {

// Pluviômetro: acordada, conta por IRQ de borda (CHANGE); dormindo, a placa é
// armada para acordar no NÍVEL oposto ao último visto (core::ContadorChuva).
void chuvaIniciar(int pino, bool pullUp, bool pulsoEmAlto, uint32_t debounceMs, uint32_t tipsRestaurados);
uint32_t chuvaRetirar();  // devolve o acumulado e zera (atômico); zera também na RTC memory
void chuvaSomar(uint32_t tips);
uint32_t chuvaPendentes();
int chuvaNivel();

// Chamados por dormirAte() em volta de cada lightsleep.
void chuvaAntesDeDormir();
void chuvaDepoisDeAcordar();

}  // namespace hal
```

`firmware/lib/hal/src/rain_hal.cpp`:

```cpp
#include "rain_hal.h"

#include <Arduino.h>
#include <driver/gpio.h>
#include <esp_sleep.h>
#include <esp_timer.h>
#include <soc/gpio_reg.h>

#include "rain_logic.h"
#include "rtc_hal.h"

namespace hal {

namespace {
portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
core::ContadorChuva s_contador(true, 150);  // reconfigurado em chuvaIniciar()
int s_pino = -1;

// Leitura direta do registrador: segura em ISR (config.h garante pino < 32).
inline bool IRAM_ATTR nivelAlto() { return ((REG_READ(GPIO_IN_REG) >> s_pino) & 1U) != 0; }

void IRAM_ATTR isrChuva() {
  const uint64_t agora = static_cast<uint64_t>(esp_timer_get_time() / 1000);
  portENTER_CRITICAL_ISR(&s_mux);
  if (s_contador.observar(nivelAlto(), agora)) rtcGravarTips(s_contador.pendentes());
  portEXIT_CRITICAL_ISR(&s_mux);
}

void observarAgora() {
  const uint64_t agora = static_cast<uint64_t>(esp_timer_get_time() / 1000);
  portENTER_CRITICAL(&s_mux);
  if (s_contador.observar(nivelAlto(), agora)) rtcGravarTips(s_contador.pendentes());
  portEXIT_CRITICAL(&s_mux);
}

void anexarIsr() { attachInterrupt(digitalPinToInterrupt(s_pino), isrChuva, CHANGE); }
}  // namespace

void chuvaIniciar(int pino, bool pullUp, bool pulsoEmAlto, uint32_t debounceMs, uint32_t tipsRestaurados) {
  s_pino = pino;
  pinMode(pino, pullUp ? INPUT_PULLUP : INPUT_PULLDOWN);
  delay(5);
  portENTER_CRITICAL(&s_mux);
  s_contador = core::ContadorChuva(pulsoEmAlto, debounceMs);
  s_contador.sincronizar(nivelAlto());  // ímã parado no boot não conta
  s_contador.somar(tipsRestaurados);
  rtcGravarTips(s_contador.pendentes());
  portEXIT_CRITICAL(&s_mux);
  anexarIsr();
}

uint32_t chuvaRetirar() {
  portENTER_CRITICAL(&s_mux);
  const uint32_t tips = s_contador.retirar();
  rtcGravarTips(0);
  portEXIT_CRITICAL(&s_mux);
  return tips;
}

void chuvaSomar(uint32_t tips) {
  portENTER_CRITICAL(&s_mux);
  s_contador.somar(tips);
  rtcGravarTips(s_contador.pendentes());
  portEXIT_CRITICAL(&s_mux);
}

uint32_t chuvaPendentes() {
  portENTER_CRITICAL(&s_mux);
  const uint32_t t = s_contador.pendentes();
  portEXIT_CRITICAL(&s_mux);
  return t;
}

int chuvaNivel() { return digitalRead(s_pino); }

void chuvaAntesDeDormir() {
  detachInterrupt(digitalPinToInterrupt(s_pino));
  // Sem isto, o gpio_wakeup_enable (nível) com a interrupção ainda habilitada
  // viraria uma tempestade de interrupções.
  gpio_intr_disable(static_cast<gpio_num_t>(s_pino));
  observarAgora();  // pega uma transição que a IRQ possa não ter visto
  portENTER_CRITICAL(&s_mux);
  const bool acordarAlto = s_contador.acordarEmAlto();
  portEXIT_CRITICAL(&s_mux);
  // Se o pino mudar entre a observação e o sono, ele já estará no nível armado
  // e a placa acorda na hora: sem corrida.
  gpio_wakeup_enable(static_cast<gpio_num_t>(s_pino), acordarAlto ? GPIO_INTR_HIGH_LEVEL : GPIO_INTR_LOW_LEVEL);
  esp_sleep_enable_gpio_wakeup();
}

void chuvaDepoisDeAcordar() {
  gpio_wakeup_disable(static_cast<gpio_num_t>(s_pino));
  observarAgora();
  anexarIsr();
}

}  // namespace hal
```

- [ ] **Step 2: Implementar `sleep_hal`**

`firmware/lib/hal/src/sleep_hal.h`:

```cpp
#pragma once
#include <stdint.h>

namespace hal {

enum class Despertar : uint8_t { TIMER, GPIO, OUTRO };

// Dorme até o uptime 'alvoUptimeMs'. Com economia=true usa lightsleep (RAM
// preservada) e acorda antes a cada transição do pluviômetro — conta e volta a
// dormir. Com economia=false espera acordada em fatias de 1 s (debug via USB).
void dormirAte(uint64_t alvoUptimeMs, bool economia);

uint32_t contadorDespertares();  // diagnóstico (b3s/b9)
Despertar ultimoDespertar();

}  // namespace hal
```

`firmware/lib/hal/src/sleep_hal.cpp`:

```cpp
#include "sleep_hal.h"

#include <Arduino.h>
#include <esp_sleep.h>

#include "clock_hal.h"
#include "rain_hal.h"
#include "wdt_hal.h"

namespace hal {

namespace {
uint32_t s_despertares = 0;
Despertar s_ultimo = Despertar::OUTRO;
}  // namespace

void dormirAte(uint64_t alvoUptimeMs, bool economia) {
  for (;;) {
    const uint64_t agora = uptimeMs();
    if (agora >= alvoUptimeMs) return;
    const uint64_t restante = alvoUptimeMs - agora;
    if (!economia) {
      // Só no modo debug (acordado): 'R' pela Serial força um reset POR
      // SOFTWARE — é assim que se testa a restauração dos tips da RTC memory
      // (o botão EN gera POWERON_RESET, que zera a RTC memory de propósito).
      if (Serial.available() && Serial.read() == 'R') {
        Serial.println("[INFO] reset por software pedido pela Serial");
        Serial.flush();
        ESP.restart();
      }
      delay(restante > 1000 ? 1000 : static_cast<uint32_t>(restante));
      wdtAlimentar();
      continue;
    }
    Serial.flush();  // sem isto o log sai truncado ao dormir
    wdtPausar();
    chuvaAntesDeDormir();
    esp_sleep_enable_timer_wakeup(restante * 1000ULL);
    esp_light_sleep_start();
    chuvaDepoisDeAcordar();
    wdtRetomar();
    ++s_despertares;
    const esp_sleep_wakeup_cause_t causa = esp_sleep_get_wakeup_cause();
    s_ultimo = causa == ESP_SLEEP_WAKEUP_TIMER ? Despertar::TIMER
               : causa == ESP_SLEEP_WAKEUP_GPIO ? Despertar::GPIO
                                                : Despertar::OUTRO;
  }
}

uint32_t contadorDespertares() { return s_despertares; }

Despertar ultimoDespertar() { return s_ultimo; }

}  // namespace hal
```

- [ ] **Step 3: Acrescentar `SensorChuva` em `sensores_hal`**

Em `firmware/lib/hal/src/sensores_hal.h`, antes do `}  // namespace hal`:

```cpp
// Pluviômetro: devolve o acumulado desde a última leitura e zera.
class SensorChuva : public core::Sensor {
 public:
  explicit SensorChuva(double mmPorTip) : mmPorTip_(mmPorTip) {}
  const char* nome() const override { return "rain_gauge"; }
  bool ler(JsonObject saida, std::string& erro) override;

 private:
  double mmPorTip_;
};
```

Em `firmware/lib/hal/src/sensores_hal.cpp`, acrescentar `#include "rain_hal.h"` aos includes e, antes do `}  // namespace hal`:

```cpp
// ---------------- Pluviômetro ----------------

bool SensorChuva::ler(JsonObject saida, std::string& /*erro*/) {
  core::escreverChuva(saida, chuvaRetirar(), mmPorTip_);
  return true;
}
```

- [ ] **Step 4: Sketches de bancada da chuva e do consumo**

`firmware/src/bench/b3_chuva.cpp`:

```cpp
// b3_chuva — contador de básculas ao vivo, placa ACORDADA (IRQ de borda).
// Aproxime e afaste o ímã do KY-025: cada acionamento conta EXATAMENTE 1.
//  - em repouso o D0 deve ficar em 0 (KY-025) — se ficar em 1, a polaridade
//    é a do reed puro: RAIN_ON_FALLING=true no config.h
//  - contando 2+ por acionamento: aumente RAIN_DEBOUNCE_MS
#include <Arduino.h>

#include "config.h"
#include "rain_hal.h"

void setup() {
  Serial.begin(115200);
  delay(1500);
  hal::chuvaIniciar(RAIN_GAUGE_PIN, RAIN_PULL_UP, !RAIN_ON_FALLING, RAIN_DEBOUNCE_MS, 0);
  Serial.printf("Pluviometro: GPIO%d, debounce %lu ms, %.4f mm/bascula, pulso em %s\n", RAIN_GAUGE_PIN,
                static_cast<unsigned long>(RAIN_DEBOUNCE_MS), MM_PER_TIP, RAIN_ON_FALLING ? "BAIXO" : "ALTO");
  Serial.printf("Estado inicial do pino: %d\n\n  s      pino  novas  total\n", hal::chuvaNivel());
}

void loop() {
  static uint32_t total = 0;
  static int anterior = -1;
  static uint32_t meioSegundos = 0;
  const uint32_t novas = hal::chuvaRetirar();
  total += novas;
  const int nivel = hal::chuvaNivel();
  if (novas || nivel != anterior || meioSegundos % 20 == 0) {
    Serial.printf("  %-6.1f %-5d %-6lu %-6lu %s\n", meioSegundos * 0.5, nivel, static_cast<unsigned long>(novas),
                  static_cast<unsigned long>(total), novas ? "BASCULA!" : "");
  }
  anterior = nivel;
  ++meioSegundos;
  delay(500);
}
```

`firmware/src/bench/b3s_chuva_sono.cpp`:

```cpp
// b3s_chuva_sono — O TESTE CRÍTICO do wake por nível alternado.
// A placa fica em LIGHTSLEEP em janelas de 10 s e só acorda por timer ou pelo
// pino da chuva. A cada janela imprime tips e despertares.
//  (a) Acione o ímã N vezes em ~30 s  -> soma dos tips == N.
//  (b) Deixe o ímã PARADO sobre o sensor por 60 s -> no máximo +1 tip e
//      <= 3 despertares por janela (sem loop de despertares).
//  (c) Retire o ímã -> 0 tips (a volta ao repouso não conta).
#include <Arduino.h>

#include "clock_hal.h"
#include "config.h"
#include "rain_hal.h"
#include "sleep_hal.h"

void setup() {
  Serial.begin(115200);
  delay(1500);
  hal::chuvaIniciar(RAIN_GAUGE_PIN, RAIN_PULL_UP, !RAIN_ON_FALLING, RAIN_DEBOUNCE_MS, 0);
  Serial.println("Lightsleep em janelas de 10 s. Siga o roteiro (a)(b)(c) do cabecalho.");
}

void loop() {
  static uint32_t total = 0;
  const uint32_t antes = hal::contadorDespertares();
  hal::dormirAte(hal::uptimeMs() + 10000, true);
  const uint32_t tips = hal::chuvaRetirar();
  total += tips;
  Serial.printf("[janela] tips=%lu total=%lu despertares=%lu nivel=%d\n", static_cast<unsigned long>(tips),
                static_cast<unsigned long>(total), static_cast<unsigned long>(hal::contadorDespertares() - antes),
                hal::chuvaNivel());
}
```

`firmware/src/bench/b4_calibrar_chuva.cpp`:

```cpp
// b4_calibrar_chuva — conta básculas por 300 s para calibrar MM_PER_TIP.
//  1) ajuste os dois parafusos M3 até os dois lados virarem com a MESMA água;
//  2) meça um volume conhecido (ex.: 100 mL) e despeje LENTAMENTE no funil;
//  3) MM_PER_TIP = (volume_mL / n) / (pi * (diametro_cm/2)^2) * 10
#include <Arduino.h>

#include "config.h"
#include "rain_hal.h"

static const uint32_t DURACAO_S = 300;

void setup() {
  Serial.begin(115200);
  delay(1500);
  hal::chuvaIniciar(RAIN_GAUGE_PIN, RAIN_PULL_UP, !RAIN_ON_FALLING, RAIN_DEBOUNCE_MS, 0);
  Serial.printf("Calibracao: MM_PER_TIP atual %.4f mm. Despeje a agua LENTAMENTE agora (%lu s).\n", MM_PER_TIP,
                static_cast<unsigned long>(DURACAO_S));
  uint32_t total = 0;
  const uint32_t t0 = millis();
  while (millis() - t0 < DURACAO_S * 1000) {
    const uint32_t n = hal::chuvaRetirar();
    if (n) {
      total += n;
      Serial.printf("  t=%6.1fs  +%lu  total=%lu\n", (millis() - t0) / 1000.0, static_cast<unsigned long>(n),
                    static_cast<unsigned long>(total));
    }
    delay(250);
  }
  Serial.printf("\nTOTAL DE BASCULAS: %lu\n", static_cast<unsigned long>(total));
  Serial.printf("volume por pulso = volume_mL / %lu ; MM_PER_TIP = volume_por_pulso / area_funil_cm2 * 10\n",
                static_cast<unsigned long>(total));
}

void loop() { delay(1000); }
```

`firmware/src/bench/b9_consumo.cpp`:

```cpp
// b9_consumo — mede a corrente em lightsleep e confere o watchdog no sono.
// Wi-Fi desligado; dorme 60 s por ciclo. Meça com o multímetro em série na
// alimentação: (1) placa inteira pelo VIN/5V; (2) se possível, só o 3V3.
// O watchdog está ligado com 20 s: se a placa reiniciar durante o sono de 60 s,
// o wdtPausar() não está funcionando (FALHA).
#include <Arduino.h>
#include <WiFi.h>

#include "clock_hal.h"
#include "config.h"
#include "rain_hal.h"
#include "sleep_hal.h"
#include "wdt_hal.h"

void setup() {
  Serial.begin(115200);
  delay(1500);
  WiFi.mode(WIFI_OFF);
  hal::chuvaIniciar(RAIN_GAUGE_PIN, RAIN_PULL_UP, !RAIN_ON_FALLING, RAIN_DEBOUNCE_MS, 0);
  hal::wdtIniciar(20);
  Serial.printf("Reset anterior: motivo %d (6/TASK_WDT = watchdog disparou no sono)\n", static_cast<int>(esp_reset_reason()));
}

void loop() {
  Serial.println("[b9] acordada 5 s (meça a corrente ACORDADA agora)");
  const uint64_t fim = hal::uptimeMs() + 5000;
  while (hal::uptimeMs() < fim) {
    hal::wdtAlimentar();
    delay(100);
  }
  Serial.println("[b9] lightsleep 60 s (meça a corrente DORMINDO agora)");
  hal::dormirAte(hal::uptimeMs() + 60000, true);
  Serial.printf("[b9] acordou; despertares=%lu\n", static_cast<unsigned long>(hal::contadorDespertares()));
}
```

Acrescentar ao `platformio.ini`:

```ini

[env:bench_b3_chuva]
extends = common_esp32
build_src_filter = +<bench/b3_chuva.cpp>

[env:bench_b3s_chuva_sono]
extends = common_esp32
build_src_filter = +<bench/b3s_chuva_sono.cpp>

[env:bench_b4_calibrar_chuva]
extends = common_esp32
build_src_filter = +<bench/b4_calibrar_chuva.cpp>

[env:bench_b9_consumo]
extends = common_esp32
build_src_filter = +<bench/b9_consumo.cpp>
```

- [ ] **Step 5: Compilar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" run -e bench_b3_chuva -e bench_b3s_chuva_sono -e bench_b4_calibrar_chuva -e bench_b9_consumo -e esp32`
Expected: `SUCCESS` em todos.

- [ ] **Step 6: Validar na placa (conjunto com o usuário)**

1. Pedir ao usuário para ligar o KY-025 (+→3V3, G→GND, D0→27). Rodar `b3`: em repouso o pino fica em 0; 10 acionamentos = 10 contagens. Se o repouso for 1, ajustar `RAIN_ON_FALLING` e repetir.
2. Rodar `b3s` e seguir (a), (b), (c) do cabeçalho. **Critério de passagem:** (a) soma == N; (b) ≤ +1 tip e ≤ 3 despertares por janela; (c) 0 tips. Se (b) falhar com despertares sem fim, parar e usar superpowers:systematic-debugging antes de mudar a lógica.
3. Rodar `b9`: a placa **não** pode reiniciar durante o sono de 60 s. Anotar a corrente acordada e dormindo, que vai para o README.

- [ ] **Step 7: Commit**

```bash
git add firmware/lib/hal/src/rain_hal.* firmware/lib/hal/src/sleep_hal.* firmware/lib/hal/src/sensores_hal.* firmware/src/bench/b3_chuva.cpp firmware/src/bench/b3s_chuva_sono.cpp firmware/src/bench/b4_calibrar_chuva.cpp firmware/src/bench/b9_consumo.cpp firmware/platformio.ini
git commit -m "feat(firmware): chuva por IRQ e lightsleep com wake por nivel alternado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 13: Rede — Wi-Fi PSK/EAP, NTP e POST HTTPS + bancada b7, b8

**Files:**
- Create: `firmware/lib/hal/src/net_hal.h`, `firmware/lib/hal/src/net_hal.cpp`, `firmware/src/bench/b7_wifi_eap.cpp`, `firmware/src/bench/b8_envio.cpp`
- Modify: `firmware/platformio.ini` (envs)

**Interfaces:**
- Consumes: `hal::uptimeMs`, `hal::wdtAlimentar` (Task 10); `core::montarPayload`, `core::formatarIso` (Tasks 9, 3)
- Produces:
  - `enum class hal::MetodoWifi : uint8_t { PSK, PEAP, TTLS }`, `enum class hal::Fase2 : int8_t { EAP = 0, MSCHAPV2 = 1, MSCHAP = 2, PAP = 3, CHAP = 4 }`
  - `struct hal::ConfigWifi { const char* ssid; MetodoWifi metodo; Fase2 fase2; const char* identidade; const char* usuario; const char* senha; const char* caPem; uint32_t timeoutS; }`
  - `bool hal::wifiConectar(const ConfigWifi&)`, `void hal::wifiDesligar()`, `bool hal::ntpSincronizar(uint32_t timeoutS)`
  - `int hal::httpPost(const char* url, const char* apiKey, const std::string& corpo, bool tlsInseguro, uint32_t timeoutS)` → status HTTP (< 0 = erro de conexão)
  - `const char* hal::nomeMetodo(MetodoWifi)`, `const char* hal::nomeFase2(Fase2)`

- [ ] **Step 1: Implementar `net_hal`**

`firmware/lib/hal/src/net_hal.h`:

```cpp
#pragma once
#include <stdint.h>

#include <string>

namespace hal {

enum class MetodoWifi : uint8_t { PSK, PEAP, TTLS };
// Valores = esp_eap_ttls_phase2_types do ESP-IDF.
enum class Fase2 : int8_t { EAP = 0, MSCHAPV2 = 1, MSCHAP = 2, PAP = 3, CHAP = 4 };

struct ConfigWifi {
  const char* ssid;
  MetodoWifi metodo;
  Fase2 fase2;             // só TTLS
  const char* identidade;  // externa/anônima; vazio = usuário
  const char* usuario;
  const char* senha;
  const char* caPem;  // nullptr = não valida o RADIUS
  uint32_t timeoutS;
};

bool wifiConectar(const ConfigWifi& c);
// Obrigatório antes de dormir: rádio ligado impede o lightsleep de economizar.
void wifiDesligar();
bool ntpSincronizar(uint32_t timeoutS);
// Status HTTP, ou negativo em erro de conexão/TLS.
int httpPost(const char* url, const char* apiKey, const std::string& corpo, bool tlsInseguro, uint32_t timeoutS);

const char* nomeMetodo(MetodoWifi m);
const char* nomeFase2(Fase2 f);

}  // namespace hal
```

`firmware/lib/hal/src/net_hal.cpp`:

```cpp
#include "net_hal.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <WiFi.h>
#include <esp_sntp.h>

#include "clock_hal.h"
#include "wdt_hal.h"

namespace hal {

namespace {
volatile bool s_ntpOk = false;
void aoSincronizar(struct timeval*) { s_ntpOk = true; }
}  // namespace

const char* nomeMetodo(MetodoWifi m) {
  switch (m) {
    case MetodoWifi::PSK: return "PSK";
    case MetodoWifi::PEAP: return "PEAP";
    case MetodoWifi::TTLS: return "TTLS";
  }
  return "?";
}

const char* nomeFase2(Fase2 f) {
  switch (f) {
    case Fase2::EAP: return "EAP";
    case Fase2::MSCHAPV2: return "MSCHAPv2";
    case Fase2::MSCHAP: return "MSCHAP";
    case Fase2::PAP: return "PAP";
    case Fase2::CHAP: return "CHAP";
  }
  return "?";
}

bool wifiConectar(const ConfigWifi& c) {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  if (c.metodo == MetodoWifi::PSK) {
    WiFi.begin(c.ssid, c.senha);
  } else {
    const char* identidade = (c.identidade != nullptr && c.identidade[0] != '\0') ? c.identidade : c.usuario;
    if (c.caPem == nullptr) Serial.println("[AVISO] EAP sem certificado CA: o servidor RADIUS NAO sera validado");
    WiFi.begin(c.ssid, c.metodo == MetodoWifi::PEAP ? WPA2_AUTH_PEAP : WPA2_AUTH_TTLS, identidade, c.usuario, c.senha,
               c.caPem, nullptr, nullptr, c.metodo == MetodoWifi::TTLS ? static_cast<int>(c.fase2) : -1);
  }
  const uint64_t limite = uptimeMs() + c.timeoutS * 1000ULL;
  while (WiFi.status() != WL_CONNECTED) {
    if (uptimeMs() >= limite) {
      Serial.printf("[AVISO] Wi-Fi: timeout de %lus (status %d)\n", static_cast<unsigned long>(c.timeoutS),
                    static_cast<int>(WiFi.status()));
      return false;
    }
    delay(200);
    wdtAlimentar();
  }
  Serial.printf("[INFO] Wi-Fi conectado: %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  return true;
}

void wifiDesligar() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

bool ntpSincronizar(uint32_t timeoutS) {
  s_ntpOk = false;
  sntp_set_time_sync_notification_cb(aoSincronizar);
  configTime(0, 0, "pool.ntp.org", "a.ntp.br", "time.google.com");
  const uint64_t limite = uptimeMs() + timeoutS * 1000ULL;
  while (!s_ntpOk && uptimeMs() < limite) {
    delay(100);
    wdtAlimentar();
  }
  esp_sntp_stop();
  if (!s_ntpOk) Serial.println("[AVISO] NTP: sem resposta");
  return s_ntpOk;
}

int httpPost(const char* url, const char* apiKey, const std::string& corpo, bool tlsInseguro, uint32_t timeoutS) {
  const bool https = strncmp(url, "https://", 8) == 0;
  NetworkClientSecure tls;
  NetworkClient plano;
  if (https) {
    if (tlsInseguro) {
      Serial.println("[AVISO] TLS da API SEM validacao (API_TLS_INSECURE)");
      tls.setInsecure();
    } else {
      tls.useBuiltinCACertBundle();
    }
    tls.setHandshakeTimeout(timeoutS);
  }
  HTTPClient http;
  http.setConnectTimeout(static_cast<int32_t>(timeoutS * 1000));
  http.setTimeout(static_cast<uint16_t>(timeoutS * 1000));
  const bool iniciou = https ? http.begin(tls, url) : http.begin(plano, url);
  if (!iniciou) return -1000;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", apiKey);
  const int codigo = http.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(corpo.data())), corpo.size());
  http.end();
  wdtAlimentar();
  return codigo;
}

}  // namespace hal
```

- [ ] **Step 2: `b7_wifi_eap.cpp` — descobre qual EAP a rede aceita**

`firmware/src/bench/b7_wifi_eap.cpp`:

```cpp
// b7_wifi_eap — descobre qual combinação EAP a rede do IFSC aceita.
// Usa SSID/usuário/senha/identidade/CA do secrets.h e tenta, em sequência:
// PEAP/MSCHAPv2, TTLS/PAP, TTLS/CHAP, TTLS/MSCHAPv2, TTLS/MSCHAP.
// Antes, varre as redes para confirmar que o SSID aparece em 2,4 GHz.
// Copie a combinação que conectar para WIFI_METODO/WIFI_FASE2 no secrets.h.
#include <Arduino.h>
#include <WiFi.h>

#include "config.h"
#include "net_hal.h"
#include "secrets.h"

struct Combinacao {
  hal::MetodoWifi metodo;
  hal::Fase2 fase2;
};

static const Combinacao COMBINACOES[] = {
    {hal::MetodoWifi::PEAP, hal::Fase2::MSCHAPV2}, {hal::MetodoWifi::TTLS, hal::Fase2::PAP},
    {hal::MetodoWifi::TTLS, hal::Fase2::CHAP},     {hal::MetodoWifi::TTLS, hal::Fase2::MSCHAPV2},
    {hal::MetodoWifi::TTLS, hal::Fase2::MSCHAP},
};

void setup() {
  Serial.begin(115200);
  delay(1500);
  WiFi.mode(WIFI_STA);
  Serial.println("Redes visiveis (2,4 GHz):");
  const int n = WiFi.scanNetworks();
  bool achou = false;
  for (int i = 0; i < n; ++i) {
    Serial.printf("  %-32s RSSI %4d  canal %2ld  auth %d\n", WiFi.SSID(i).c_str(), WiFi.RSSI(i),
                  static_cast<long>(WiFi.channel(i)), static_cast<int>(WiFi.encryptionType(i)));
    if (WiFi.SSID(i) == WIFI_SSID) achou = true;
  }
  if (!achou) Serial.printf(">> '%s' NAO apareceu na varredura (fora de alcance ou so 5 GHz).\n", WIFI_SSID);

  Serial.println("\nTestando combinacoes EAP:");
  for (const Combinacao& c : COMBINACOES) {
    hal::ConfigWifi cfg{WIFI_SSID, c.metodo, c.fase2, WIFI_IDENTIDADE, WIFI_USUARIO, WIFI_SENHA, WIFI_CA_PEM, WIFI_TIMEOUT_S};
    Serial.printf("\n--- %s / %s ---\n", hal::nomeMetodo(c.metodo),
                  c.metodo == hal::MetodoWifi::TTLS ? hal::nomeFase2(c.fase2) : "MSCHAPv2");
    const bool ok = hal::wifiConectar(cfg);
    Serial.printf(">> %s\n", ok ? "CONECTOU" : "falhou");
    hal::wifiDesligar();
    delay(2000);
  }
  Serial.println("\nFim. Use a primeira combinacao que CONECTOU no secrets.h.");
}

void loop() { delay(1000); }
```

- [ ] **Step 3: `b8_envio.cpp` — NTP + TLS + chave da API sem sujar o banco**

`firmware/src/bench/b8_envio.cpp`:

```cpp
// b8_envio — valida NTP + TLS + chave da API. Envia readings VAZIO: a API
// responde 202 {"accepted":0,...} sem tocar no banco (lote vazio é no-op), então
// o teste não suja os dados de produção. Esperado: HTTP 202.
//  401 -> API_KEY errada | < 0 -> falha de conexão/TLS (URL, DNS, certificado)
#include <Arduino.h>

#include "clock_hal.h"
#include "config.h"
#include "envio.h"
#include "iso_time.h"
#include "net_hal.h"
#include "secrets.h"

void setup() {
  Serial.begin(115200);
  delay(1500);
  const hal::ConfigWifi cfg{WIFI_SSID, WIFI_METODO, WIFI_FASE2, WIFI_IDENTIDADE,
                            WIFI_USUARIO, WIFI_SENHA, WIFI_CA_PEM, WIFI_TIMEOUT_S};
  if (!hal::wifiConectar(cfg)) {
    Serial.println("FALHA: sem Wi-Fi (rode o b7 primeiro).");
    return;
  }
  if (hal::ntpSincronizar(NTP_TIMEOUT_S)) {
    char iso[core::TAM_ISO];
    core::formatarIso(hal::epochMsDoSistema(), iso);
    Serial.printf("NTP OK: %s\n", iso);
  } else {
    Serial.println("FALHA: NTP (o TLS pode falhar por hora errada)");
  }
  const std::string corpo = core::montarPayload(STATION_ID, {});
  Serial.printf("POST %s\n  %s\n", API_URL, corpo.c_str());
  const int codigo = hal::httpPost(API_URL, API_KEY, corpo, API_TLS_INSECURE, API_TIMEOUT_S);
  Serial.printf(">> HTTP %d %s\n", codigo, codigo == 202 ? "(OK)" : "(FALHA)");
  hal::wifiDesligar();
}

void loop() { delay(1000); }
```

Acrescentar ao `platformio.ini`:

```ini

[env:bench_b7_wifi_eap]
extends = common_esp32
build_src_filter = +<bench/b7_wifi_eap.cpp>

[env:bench_b8_envio]
extends = common_esp32
build_src_filter = +<bench/b8_envio.cpp>
```

- [ ] **Step 4: Compilar**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" run -e bench_b7_wifi_eap -e bench_b8_envio`
Expected: `SUCCESS`. O `secrets.h` local já existe desde a Task 1.

- [ ] **Step 5: Validar na placa (conjunto com o usuário)**

1. Pedir ao usuário para preencher `firmware/include/secrets.h` (Wi-Fi, API_URL e API_KEY reais). **Nunca** ler nem imprimir os valores dele no chat.
2. Em casa/bancada: `WIFI_METODO = hal::MetodoWifi::PSK` com a rede doméstica → rodar `b8` → esperado `HTTP 202`. Isso valida NTP + TLS pelo bundle + chave da API.
3. No IFSC, ao alcance da rede: rodar `b7` e anotar qual combinação CONECTOU. Atualizar o `secrets.h` e rodar `b8` de novo → `HTTP 202`.
4. Se nenhuma combinação conectar: verificar se o SSID apareceu na varredura. Depois pedir à DTIC o método EAP e o certificado CA antes de mexer no código.

- [ ] **Step 6: Commit**

```bash
git add firmware/lib/hal/src/net_hal.* firmware/src/bench/b7_wifi_eap.cpp firmware/src/bench/b8_envio.cpp firmware/platformio.ini
git commit -m "feat(firmware): Wi-Fi PSK/WPA2-Enterprise, NTP e POST HTTPS validado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 14: Ciclo da estação (`src/app/main.cpp`)

**Files:**
- Modify: `firmware/src/app/main.cpp` (substitui o provisório)
- Modify: `firmware/include/config.h` (override `CFG_MODO_ECONOMIA`), `firmware/platformio.ini` (env `esp32_debug`)

**Interfaces:**
- Consumes: tudo das Tasks 2–13 com as assinaturas declaradas acima.

- [ ] **Step 0: Env de debug sem lightsleep (para o teste de reset por software)**

Em `firmware/include/config.h`, trocar `constexpr bool MODO_ECONOMIA = true;` por:

```cpp
#ifndef CFG_MODO_ECONOMIA
#define CFG_MODO_ECONOMIA 1
#endif
constexpr bool MODO_ECONOMIA = CFG_MODO_ECONOMIA != 0;
```

Em `firmware/platformio.ini`, depois do `[env:esp32_rapido]`:

```ini
[env:esp32_debug]
extends = env:esp32
build_flags = ${common_esp32.build_flags} -DCFG_INTERVALO_LEITURA_MIN=1 -DCFG_LEITURAS_POR_ENVIO=2 -DCFG_MODO_ECONOMIA=0
```

- [ ] **Step 1: Escrever o `main.cpp` definitivo**

`firmware/src/app/main.cpp`:

```cpp
// main.cpp — ciclo principal da estação meteorológica (NodeMCU ESP32).
//
// MODELO: laço contínuo com LIGHTSLEEP (não deepsleep): a RAM é preservada e o
// pluviômetro acorda a placa a cada transição (wake por nível alternado).
//
// Fluxo:
//   boot: monta o LittleFS, recupera .tmp órfão, restaura tips/hora da RTC
//         memory, Wi-Fi + NTP, envia o que sobrou no buffer
//   laço: dorme até o alvo fixo da próxima leitura (15 min, contando chuva)
//         -> lê os sensores -> grava no buffer
//         -> a cada 4 leituras (1 h): Wi-Fi + NTP + envio em lotes
//            (só remove do buffer com HTTP 2xx; a API usa 202)
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Wire.h>

#include "buffer.h"
#include "clock_hal.h"
#include "config.h"
#include "envio.h"
#include "fs_littlefs.h"
#include "iso_time.h"
#include "net_hal.h"
#include "pendentes.h"
#include "rain_hal.h"
#include "rtc_hal.h"
#include "agenda.h"
#include "secrets.h"
#include "sensor.h"
#include "sensores_hal.h"
#include "sleep_hal.h"
#include "wdt_hal.h"

namespace {

const uint64_t INTERVALO_MS = static_cast<uint64_t>(INTERVALO_LEITURA_MIN) * 60 * 1000;
const uint64_t RESYNC_MS = static_cast<uint64_t>(RESYNC_NTP_MAX_H) * 3600 * 1000;

hal::SistemaArquivosLittleFs g_fs;
core::Buffer g_buffer(g_fs, ARQ_DADOS, MAX_LEITURAS_BUFFER, MAX_BYTES_BUFFER);

hal::SensorBme280 g_bme(Wire, BME280_ADDR);
hal::SensorChuva g_chuva(MM_PER_TIP);
hal::SensorUv g_uv(UV_GUVA_PIN, UV_LIMITE_SOLTO_MV);
core::Sensor* const g_sensores[] = {&g_bme, &g_chuva, &g_uv};

core::RefHora g_ref{false, 0, 0};
uint32_t g_boot = 0;
bool g_pendentes = false;
uint64_t g_ultimoNtpMs = 0;
uint64_t g_proximo = 0;
uint32_t g_leiturasDesdeEnvio = 0;

const hal::ConfigWifi CONFIG_WIFI{WIFI_SSID, WIFI_METODO, WIFI_FASE2, WIFI_IDENTIDADE,
                                  WIFI_USUARIO, WIFI_SENHA, WIFI_CA_PEM, WIFI_TIMEOUT_S};

// Hora válida (NTP agora, ou preservada de um reset por software): data as
// leituras pendentes do boot atual e descarta as impossíveis de datar.
void aoTerHoraValida() {
  hal::rtcGravarHoraOk(true);
  if (!g_pendentes) return;
  const core::ResultadoPendentes r = core::resolverPendentes(g_fs, ARQ_DADOS, g_boot, g_ref, MM_PER_TIP);
  if (!r.ok) {
    Serial.println("[ERRO] falha ao datar leituras pendentes; tenta de novo no proximo sync");
    return;
  }
  g_pendentes = false;
  g_buffer.invalidarContagem();
  if (r.tipsSobrando) hal::chuvaSomar(r.tipsSobrando);
  Serial.printf("[INFO] pendentes: %lu datadas, %lu descartadas (boot antigo), %lu tips repassados\n",
                static_cast<unsigned long>(r.datadas), static_cast<unsigned long>(r.descartadas),
                static_cast<unsigned long>(r.tipsSobrando));
}

// Pressupõe Wi-Fi conectado.
bool sincronizarHora() {
  for (uint32_t i = 0; i < NTP_TENTATIVAS; ++i) {
    if (hal::ntpSincronizar(NTP_TIMEOUT_S)) {
      g_ref = core::RefHora{true, hal::epochMsDoSistema(), hal::uptimeMs()};
      g_ultimoNtpMs = g_ref.upMs;
      aoTerHoraValida();
      return true;
    }
    delay(1000);
  }
  return false;
}

void registrarLeitura() {
  JsonDocument doc;
  JsonObject leitura = doc.to<JsonObject>();
  core::lerTodos(g_sensores, sizeof(g_sensores) / sizeof(g_sensores[0]), leitura);
  if (g_ref.valida) {
    char iso[core::TAM_ISO];
    core::formatarIso(core::epochMsEm(g_ref, hal::uptimeMs()), iso);
    leitura["timestamp"] = iso;
  } else {
    // Sem hora: NÃO inventa timestamp. Datada no primeiro sync (pendentes.h).
    leitura["_boot"] = g_boot;
    leitura["_up_ms"] = hal::uptimeMs();
    g_pendentes = true;
  }
  std::string linha;
  serializeJson(doc, linha);
  if (!g_buffer.adicionar(linha)) Serial.println("[ERRO] falha ao gravar a leitura no buffer");
  Serial.printf("[INFO] leitura salva: %s\n", linha.c_str());
}

void tentarEnvio(bool noBoot) {
  const bool precisaHora = !g_ref.valida || hal::uptimeMs() - g_ultimoNtpMs >= RESYNC_MS;
  if (!noBoot && g_buffer.contar() == 0 && !precisaHora) return;
  if (!hal::wifiConectar(CONFIG_WIFI)) {
    hal::wifiDesligar();
    Serial.println("[AVISO] sem Wi-Fi: buffer mantido para a proxima hora");
    return;
  }
  if (!sincronizarHora()) Serial.println("[AVISO] NTP falhou");
  if (!g_ref.valida || g_pendentes) {
    Serial.println("[AVISO] sem hora valida: envio adiado");
  } else if (g_buffer.contar() > 0) {
    const core::ResultadoEnvio r =
        core::enviarBuffer(g_buffer, TAMANHO_LOTE_ENVIO, STATION_ID, [](const std::string& corpo) {
          const int codigo = hal::httpPost(API_URL, API_KEY, corpo, API_TLS_INSECURE, API_TIMEOUT_S);
          Serial.printf("[INFO] HTTP %d\n", codigo);
          return codigo >= 200 && codigo < 300;
        });
    Serial.printf("[INFO] envio %s: %lu enviadas, %lu descartadas, %lu no buffer\n", r.ok ? "OK" : "interrompido",
                  static_cast<unsigned long>(r.enviadas), static_cast<unsigned long>(r.descartadas),
                  static_cast<unsigned long>(g_buffer.contar()));
  }
  hal::wifiDesligar();
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  const esp_reset_reason_t motivo = esp_reset_reason();
  Serial.printf("\n[INFO] IFSClima - boot (reset %d), heap livre %lu\n", static_cast<int>(motivo),
                static_cast<unsigned long>(ESP.getFreeHeap()));
  hal::wdtIniciar(WDT_TIMEOUT_S);

  if (!hal::montarLittleFs()) Serial.println("[ERRO] LittleFS nao montou: leituras nao serao persistidas");
  if (g_buffer.recuperarTmpOrfao()) Serial.println("[AVISO] buffer orfao recuperado do .tmp");
  g_pendentes = core::arquivoTemPendentes(g_fs, ARQ_DADOS);
  g_boot = hal::incrementarContadorBoot();

  hal::rtcIniciar(motivo == ESP_RST_POWERON);
  uint32_t tipsRestaurados = 0;
  bool horaOk = false;
  hal::rtcLerInicial(tipsRestaurados, horaOk);
  if (tipsRestaurados) Serial.printf("[INFO] %lu tip(s) de chuva restaurados da RTC memory\n", static_cast<unsigned long>(tipsRestaurados));

  const int64_t pisoS = core::epochDaDataDeBuild(__DATE__);
  if (horaOk && hal::epochSDoSistema() >= pisoS) {
    // Reset por software preserva a hora do sistema; horaOk garante que ela
    // veio de um NTP, e não do piso abaixo.
    g_ref = core::RefHora{true, hal::epochMsDoSistema(), hal::uptimeMs()};
    g_ultimoNtpMs = g_ref.upMs;
    aoTerHoraValida();
  } else {
    hal::rtcGravarHoraOk(false);
    // Piso de hora = data do build: a validação do certificado do RADIUS (EAP)
    // falha com o relógio em 1970. NÃO vale como hora das leituras.
    hal::definirHoraSistema(pisoS);
  }

  Wire.begin(I2C_SDA, I2C_SCL, I2C_FREQ);
  g_uv.iniciar();
  hal::chuvaIniciar(RAIN_GAUGE_PIN, RAIN_PULL_UP, !RAIN_ON_FALLING, RAIN_DEBOUNCE_MS, tipsRestaurados);

  tentarEnvio(true);
  g_proximo = hal::uptimeMs() + INTERVALO_MS;
}

void loop() {
  hal::dormirAte(g_proximo, MODO_ECONOMIA);
  hal::wdtAlimentar();
  g_proximo = core::proximoAlvo(g_proximo, INTERVALO_MS, hal::uptimeMs());

  registrarLeitura();

  if (++g_leiturasDesdeEnvio >= LEITURAS_POR_ENVIO) {
    g_leiturasDesdeEnvio = 0;
    tentarEnvio(false);
  }
}
```

- [ ] **Step 2: Compilar os dois envs da aplicação**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" run -e esp32 -e esp32_rapido`
Expected: `SUCCESS` nos dois, sem warnings novos. Anotar o uso de RAM/flash impresso.

- [ ] **Step 3: Validar o ciclo rápido na placa (sensores ligados, `secrets.h` preenchido)**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" run -e esp32_rapido -t upload && "$HOME/.platformio/penv/Scripts/platformio.exe" device monitor`

Critérios (observar por ~5 min):
1. Boot: `Wi-Fi conectado`, sem erro de NTP.
2. `leitura salva` a cada ~60 s, com `timestamp` ISO correto (UTC) e os campos dos sensores.
3. A cada 2 leituras: `HTTP 202` e `envio OK: 2 enviadas ... 0 no buffer`.
4. Acionar o ímã 3 vezes entre leituras → a próxima leitura traz `"chuva_tips":3`.
5. Conferir no dashboard da API que as leituras apareceram.

- [ ] **Step 4: Validar os cenários de falha**

1. **Sem hora no boot:** pôr um SSID inexistente no `secrets.h`, gravar o `esp32_rapido`, esperar 2 leituras. Elas saem com `_boot`/`_up_ms` e sem `timestamp`, e aparece `sem Wi-Fi: buffer mantido`. Restaurar o SSID correto e gravar **sem apagar a flash**. No boot, `pendentes: 0 datadas, 2 descartadas (boot antigo)`, porque o boot mudou: comportamento esperado. Os `chuva_tips` delas vão para a leitura seguinte.
2. **Reset por software no meio:** gravar o `esp32_debug` (ciclo de 1 min, SEM lightsleep), acionar o ímã 2 vezes e, antes da próxima leitura, enviar `R` pela Serial. No boot: `2 tip(s) de chuva restaurados da RTC memory`, e a leitura seguinte traz `chuva_tips` ≥ 2. **Não use o botão EN**: no ESP32 ele gera `POWERON_RESET`, e o `rtcIniciar(true)` zera a RTC memory de propósito (spec: os tips sobrevivem a reset por software/watchdog, não a queda de energia). Depois, apertar EN e conferir que NÃO há restauração (0 tips).
3. **API fora:** trocar `API_URL` por um host inexistente. O envio falha, o buffer cresce, e a estação continua lendo. Restaurar a URL e ver o buffer esvaziar.

- [ ] **Step 5: Gravar o firmware de produção**

Run: `"$HOME/.platformio/penv/Scripts/platformio.exe" run -e esp32 -t upload`
Expected: ciclo de 15 min / envio de 1 h.

- [ ] **Step 6: Commit**

```bash
git add firmware/src/app/main.cpp
git commit -m "feat(firmware): ciclo da estacao com lightsleep, buffer e envio no ESP32

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 15: Documentação, cobertura final e roadmap

**Files:**
- Create: `firmware/README.md`
- Modify: `.specs/project/PROJECT.md` (stack), `.specs/project/ROADMAP.md` (F9), `CLAUDE.md` (firmware), `RPI/README` não existe → criar `RPI/LEIAME.md` curto apontando para `firmware/`

**Interfaces:**
- Consumes: resultados de bancada anotados nas Tasks 11–14.

- [ ] **Step 1: Escrever `firmware/README.md`**

```markdown
# Firmware da estação — NodeMCU ESP32

Firmware em C++ (Arduino-ESP32 3.3.12 + PlatformIO) da estação IFSClima.
Substitui o firmware MicroPython do Raspberry Pi Pico 2 W (`../RPI/`), que não
conecta em WPA2-Enterprise (a rede 802.1X do IFSC).

> **Status:** não validado em campo até os sketches b3s, b5, b7, b8 e b9
> passarem na placa real (ver "Roteiro de bancada").

## Hardware

- NodeMCU-32S (ESP32-D0WD-V3 rev 3.1, WROOM-32, flash 4 MB, USB-serial CP2102).
- Driver do CP2102 no Windows: *CP210x Universal Windows Driver* (Silicon Labs).

| Função | Pino | Observação |
| --- | --- | --- |
| BME280 SDA / SCL | GPIO21 / GPIO22 | I2C, endereço 0x76 |
| Pluviômetro (D0 do KY-025) | GPIO27 | pulso em ALTO, borda de subida |
| UV GUVA-S12SD | GPIO33 (ADC1_CH5) | atenuação 6 dB |
| LED de status | GPIO2 | LED azul da placa |

Tudo em **3V3**. O ESP32 não tolera 5 V nos GPIOs.

**Alimentação por bateria/painel:** coloque um capacitor de 470–1000 µF entre
3V3 (ou VIN) e GND. Os picos de transmissão do Wi-Fi (~400 mA) derrubam a
tensão de baterias fracas e causam o reset por brownout típico do ESP32.

## Instalação

1. PlatformIO Core: `python get-platformio.py` (instala em `~/.platformio/penv`).
2. Testes no PC (Windows): MinGW-w64 (`winget install BrechtSanders.WinLibs.POSIX.UCRT`) e `gcovr`.
3. `cp include/secrets.example.h include/secrets.h` e preencha (o arquivo não vai para o git).

## Comandos

| O quê | Comando (dentro de `firmware/`) |
| --- | --- |
| Testes da lógica no PC | `pio test -e native` |
| Cobertura (`lib/core` ≥ 80%) | `gcovr --root . --filter lib/core/ --fail-under-line 80 .pio/build/native` |
| Teste do LittleFS na placa | `pio test -e esp32` |
| Compilar / gravar | `pio run -e esp32 -t upload` |
| Ciclo rápido (1 min, envio a cada 2) | `pio run -e esp32_rapido -t upload` |
| Monitor serial | `pio device monitor` |
| Sketch de bancada | `pio run -e bench_b3s_chuva_sono -t upload && pio device monitor` |

No Windows, `pio` = `~/.platformio/penv/Scripts/platformio.exe`.

## Como funciona

- Lê os sensores a cada 15 min e tenta enviar a cada 1 h (grade fixa, sem deriva).
- Entre leituras, fica em **lightsleep**. O pluviômetro acorda a placa por **nível
  alternado**: em repouso, acorda no pulso e conta; em pulso, acorda na volta e não
  conta. Um ímã parado não gera loop de despertares.
- As leituras vão para `/buffer.jsonl` no LittleFS e só saem com HTTP 2xx da API.
- Os tips ainda não gravados ficam na RTC memory e sobrevivem a reset/watchdog.
- **Sem hora sincronizada, a leitura não recebe timestamp inventado.** Ela leva
  `_boot`/`_up_ms` e é datada no primeiro NTP. Se for de um boot antigo (queda de
  energia sem sync), é descartada, e a chuva dela passa para a leitura seguinte.
- O TLS da API é validado pelo bundle de CAs raiz do core.

## Wi-Fi do IFSC

- O ESP32 só enxerga **2,4 GHz**: use `IFSC-ADM`/`IFSC-ALUNOS`, não as `-Turbo`.
- O método EAP é configurável (`WIFI_METODO`, `WIFI_FASE2` no `secrets.h`). Rode
  `bench_b7_wifi_eap` na rede para descobrir qual combinação autentica.
- Sem `WIFI_CA_PEM`, o servidor RADIUS não é validado (aviso no log). Peça o
  certificado CA à DTIC para ativar a validação.

## Limitações conhecidas

- O ADC do ESP32 não lê bem abaixo de ~100–150 mV: o escuro do UV aparece com esse
  piso em `uv_voltage_v`. O `uv_index` não é afetado.
- A placa NodeMCU (regulador, USB-serial, LED) consome alguns mA mesmo com o chip
  dormindo. Ver as medições do b9.
- Uma queda total de energia perde os tips ainda não gravados em flash.

## Roteiro de bancada

| Sketch | Valida | Resultado |
| --- | --- | --- |
| b0_placa | chip, flash, partições, LittleFS | _preencher_ |
| b1_i2c_scan | fiação do BME280 | _preencher_ |
| b2_bme280 | temperatura/umidade/pressão plausíveis | _preencher_ |
| b3_chuva | polaridade do KY-025, 1 acionamento = 1 contagem | _preencher_ |
| b3s_chuva_sono | contagem em lightsleep, ímã parado sem loop | _preencher_ |
| b4_calibrar_chuva | MM_PER_TIP | _preencher_ |
| b5_uv | ligação (pull), piso do ADC, resposta ao sol | _preencher_ |
| b6_uv_campo | registrador de campo (CSV + LED) | _preencher_ |
| b7_wifi_eap | combinação EAP da rede do IFSC | _preencher_ |
| b8_envio | NTP + TLS + chave da API (HTTP 202) | _preencher_ |
| b9_consumo | corrente acordada/dormindo, watchdog no sono | _preencher_ |
```

Preencher a coluna "Resultado" com o que foi medido nas Tasks 11–14. Se algum
teste não tiver sido feito, escrever `pendente` em vez de inventar.

- [ ] **Step 2: Atualizar `.specs/project/ROADMAP.md`**

Acrescentar antes de `## Ordem de execução sugerida`:

```markdown
## Milestone 6 — Firmware da estação

- **F9 · Firmware no NodeMCU ESP32 (C++/PlatformIO)**
  Reescrita do firmware MicroPython do Pico 2 W (que não conecta em WPA2-Enterprise) para o ESP32: Wi-Fi PEAP/TTLS configurável, lightsleep com wake por nível alternado para o pluviômetro, buffer JSONL em LittleFS, leituras sem hora datadas no primeiro sync, envio em lotes com TLS validado. Contrato da API inalterado.
  _Depends on: F3 (contrato de ingestão)_
```

- [ ] **Step 3: Atualizar `.specs/project/PROJECT.md` e `CLAUDE.md`**

Em `CLAUDE.md`, na seção `## Stack (resumo)`, acrescentar:

```markdown
- **firmware/**: C++ (Arduino-ESP32 3.3.12 via pioarduino) + PlatformIO para o NodeMCU ESP32. Lógica pura em `lib/core` (testes Unity no PC, cobertura ≥ 80%), hardware em `lib/hal`, sketches de bancada em `src/bench`. Ver `firmware/README.md`.
  `RPI/` é o firmware MicroPython antigo (Pico 2 W), mantido só como referência até a validação em campo.
```

e na seção `## Comandos úteis (raiz)`:

```markdown
- Firmware (dentro de `firmware/`): `pio test -e native` · `pio run -e esp32 -t upload` · `pio device monitor`
  (no Windows, `pio` = `~/.platformio/penv/Scripts/platformio.exe`; placa em COM3).
```

Em `.specs/project/PROJECT.md`, na lista de stack, acrescentar a mesma linha do firmware (C++/PlatformIO no NodeMCU ESP32; `RPI/` legado).

Criar `RPI/LEIAME.md`:

```markdown
# Firmware legado (Raspberry Pi Pico 2 W, MicroPython)

Substituído por `../firmware/` (NodeMCU ESP32, C++/PlatformIO): o Pico 2 W não
conecta em WPA2-Enterprise (rede do IFSC). Mantido só como referência da lógica
validada em bancada. Será removido após a validação em campo do ESP32.
```

- [ ] **Step 4: Verificação final**

Run:

```bash
cd firmware
"$HOME/.platformio/penv/Scripts/platformio.exe" test -e native
"$HOME/.platformio/penv/Scripts/python.exe" -m gcovr --root . --filter 'lib/core/' --fail-under-line 80 --print-summary .pio/build/native
"$HOME/.platformio/penv/Scripts/platformio.exe" run
cd .. && npm test && npm run lint && npm run typecheck
```

Expected: native verde; cobertura ≥ 80%; todos os envs compilam; api/web continuam verdes (nada mudou lá). Depois do push, conferir o workflow `firmware` com `gh run list --workflow firmware.yml --limit 1`, que deve estar `completed success`.

- [ ] **Step 5: Commit**

```bash
git add firmware/README.md .specs/project/ROADMAP.md .specs/project/PROJECT.md CLAUDE.md RPI/LEIAME.md
git commit -m "docs(firmware): README do ESP32, roteiro de bancada e F9 no roadmap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```
