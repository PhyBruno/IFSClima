# F9 · Firmware da estação no NodeMCU ESP32 (Arduino/PlatformIO) — Specification

## Problem Statement

O firmware da estação roda hoje num Raspberry Pi Pico 2 W em MicroPython (`RPI/`). O Pico 2 W
**não conecta em redes WPA2-Enterprise** (802.1X), que é o tipo de rede do IFSC — então a
estação não consegue enviar dados no local de instalação. O hardware foi trocado por um
**NodeMCU ESP32** (ESP32-WROOM-32), que suporta WPA2-Enterprise.

O MicroPython oficial (v1.29.0, 24/08/2026) **não** suporta WPA2-Enterprise no ESP32: o PR
[micropython#17234](https://github.com/micropython/micropython/pull/17234) segue aberto, sem
merge. Por isso o firmware será **reescrito em C++ (Arduino-ESP32 core 3.x + PlatformIO)**, que
suporta PEAP e TTLS (fase 2 PAP/CHAP/MSCHAP/MSCHAPv2) oficialmente.

A reescrita precisa preservar toda a lógica já validada em bancada no Pico (ciclo com
lightsleep, contagem de chuva por pulsos, buffer persistente à prova de queda de energia, envio
em lotes idempotente) e revalidar o que muda por causa do ESP32 (wake do sono, ADC, pinos, hora).

## Goals

- [ ] Estação conecta na rede WPA2-Enterprise do IFSC e envia as leituras à API existente.
- [ ] Paridade funcional com o firmware do Pico (ciclo, sensores, buffer, envio) — sem mudar a API.
- [ ] Contagem de chuva correta durante o lightsleep (nenhuma báscula perdida ou contada em dobro).
- [ ] Lógica pura testada no PC (`pio test -e native`), cobertura ≥ 80% em `lib/core`.
- [ ] Roteiro de bancada que permita validar o hardware real sem o PC do desenvolvedor.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Mudanças na API ou no web | O contrato de ingestão (PROJECT.md) é mantido idêntico |
| Deep sleep + coprocessador ULP | Evolução futura, só se o consumo medido (b9) não fechar com o painel solar |
| Sensor de vento | Hardware ainda não comprado; fica o template de sensor |
| OTA (atualização remota) | v2 |
| Log persistente em flash | YAGNI; log pela Serial + causa do reset no boot |
| Remover a pasta `RPI/` | Só depois da validação em campo do ESP32, em commit próprio |

---

## Decisões de design (registradas no brainstorming de 2026-09-23)

| # | Decisão | Motivo |
| --- | --- | --- |
| D1 | C++ com Arduino-ESP32 core 3.x + PlatformIO | Suporte oficial a WPA2-Enterprise; MicroPython só com firmware customizado de PR não mergeado |
| D2 | Lightsleep + wake por **nível alternado** no pino da chuva | Borda não acorda o ESP32 do lightsleep; PCNT para no sono; ULP é complexo e o ganho some no consumo da placa NodeMCU |
| D3 | Método EAP, fase 2, identidade anônima e CA **configuráveis** + sketch que testa as combinações | O método exato da rede do IFSC não foi confirmado (manual antigo diz PEAP; usuário citou PAP/CHAP; rede usa certificado CA) |
| D4 | Leitura sem hora sincronizada **não** recebe timestamp inventado | A API deduplica por `(station_id, timestamp)`: um timestamp falso fixo colidiria leituras distintas para sempre |
| D5 | TLS da API **validado** pelo bundle de CAs raiz do core | O `requests` do MicroPython não validava; bundle evita pinning frágil |
| D6 | UV com atenuação de 6 dB e nova guarda de "sinal solto" em ≥ 1650 mV | Faixa linear do ADC do ESP32; a guarda de 3250 mV do Pico nunca dispararia |
| D7 | BME280 portado da implementação própria (sem lib Adafruit) | Mantém detecção BME×BMP pelo `chip_id` e omissão da umidade no BMP280 |
| D8 | Projeto em `firmware/`; `RPI/` mantido como referência até a validação em campo | Rastreabilidade da lógica validada |

---

## Arquitetura

```
firmware/
  platformio.ini          # env esp32 (esp32dev / NodeMCU-32S), env native (testes), envs bench_*
  include/config.h        # pinos, intervalos, calibrações (versionado, sem segredo)
  include/secrets.h       # SSID, EAP, API key, URL  (no .gitignore)
  include/secrets.example.h
  src/main.cpp            # ciclo: dormir → ler → gravar → enviar
  lib/core/               # lógica PURA, sem Arduino — testável no PC
    schedule              # grade fixa de intervalos, pula alvos perdidos
    timestamp             # ISO 8601 UTC com ms a partir de (epoch_ref, uptime_ref)
    buffer                # JSONL sobre uma interface de FS (LittleFS real / FS em memória nos testes)
    bme280_math           # compensação Bosch, BME280 × BMP280
    uv_math               # mediana de grupos, índice UV, guarda de fundo de escala
    rain_logic            # debounce + máquina de estados do wake por nível alternado
  lib/hal/                # adaptadores: LittleFS, Wire, ADC, GPIO/sleep, WiFi EAP, HTTPS, NTP, RTC memory
  test/test_native/*      # Unity no PC
  test/test_embedded/*    # Unity na placa (smoke de HAL)
  bench/                  # sketches de bancada (sucessores de RPI/testes/t*.py)
```

Regra de dependência: `lib/core` **não** inclui `Arduino.h` nem nada do ESP-IDF; recebe tempo,
FS e leituras brutas por parâmetro/interface. `lib/hal` e `src/` fazem a ponte.

### Hardware confirmado (leitura via esptool em 2026-09-23, COM3)

ESP32-D0WD-V3 revisão v3.1 (clássico, dual core, 240 MHz, cristal 40 MHz), módulo WROOM-32,
flash de 4 MB, calibração de Vref do ADC em eFuse. Conversor USB-serial CP2102 (driver Silicon
Labs CP210x). Firmware de fábrica: ESP-AT 2.4.0 (será sobrescrito).

### Pinagem (NodeMCU-32S / ESP32-WROOM-32)

| Função | Pino | Observação |
| --- | --- | --- |
| BME280 SDA / SCL | GPIO21 / GPIO22 | I2C padrão |
| Pluviômetro (D0 do KY-025) | GPIO27 | não é strapping; tem pull interno; wake por GPIO |
| UV GUVA-S12SD | GPIO33 (ADC1_CH5) | ADC1 funciona com Wi-Fi ligado; tem pull (teste de fio solto) |
| LED de status | GPIO2 | LED azul da placa |

Todos os sensores em **3V3**. O ESP32 não tolera 5 V nos GPIOs.

---

## User Stories

### P1: Conectar na rede WPA2-Enterprise do IFSC ⭐ MVP

**User Story**: Como operador, quero que a estação autentique na rede 802.1X do IFSC para enviar dados sem rede auxiliar.

**Acceptance Criteria**:

1. WHEN `secrets.h` define SSID, método (`PEAP` ou `TTLS`), fase 2 (`MSCHAPV2`, `MSCHAP`, `PAP`, `CHAP`), identidade anônima, usuário e senha THEN o firmware SHALL conectar com esses parâmetros via `WiFi.begin(...)` do core.
2. WHEN um certificado CA (PEM) é configurado THEN o firmware SHALL validar o servidor RADIUS; WHEN não é configurado THEN SHALL conectar sem validar e registrar um aviso no log.
3. WHEN a conexão não completa em `WIFI_TIMEOUT_S` (padrão 30 s) THEN SHALL desistir, desligar o rádio e seguir o ciclo (buffer preservado).
4. WHEN termina o uso da rede THEN SHALL executar `WiFi.disconnect(true)` + `WiFi.mode(WIFI_OFF)` antes de dormir.
5. WHEN o sketch `bench/b7_wifi_eap` roda THEN SHALL tentar PEAP/MSCHAPv2, TTLS/PAP, TTLS/CHAP e TTLS/MSCHAPv2 em sequência e relatar quais autenticam.
6. O SSID alvo SHALL ser de 2,4 GHz (as redes `-Turbo` do IFSC são 5 GHz e não são suportadas pelo ESP32) — documentado no README.

**Independent Test**: `b7_wifi_eap` na rede do IFSC → ao menos uma combinação conecta e obtém IP.

---

### P1: Ciclo de medição com lightsleep ⭐ MVP

**User Story**: Como operador, quero que a estação meça a cada 15 min e envie a cada hora, economizando bateria.

**Acceptance Criteria**:

1. WHEN o firmware inicia THEN SHALL: montar o LittleFS, recuperar `.tmp` órfão, tentar Wi-Fi + NTP (3 tentativas) e, se o buffer não estiver vazio, tentar envio.
2. WHEN em operação THEN SHALL dormir até o alvo fixo da próxima leitura (`INTERVALO_LEITURA_MIN`, padrão 15), com a grade fixa `proximo += intervalo` (sem deriva).
3. WHEN o ciclo anterior ultrapassou um ou mais alvos THEN SHALL pular os alvos já passados (sem leituras em rajada).
4. WHEN completa `LEITURAS_POR_ENVIO` leituras (padrão 4) THEN SHALL tentar o envio.
5. WHEN `MODO_ECONOMIA=false` THEN SHALL substituir o lightsleep por esperas de até 1 s (debug via USB), mantendo a contagem de chuva.
6. O task watchdog SHALL cobrir o laço, com timeout que comporte o handshake TLS/EAP; em disparo, a placa reinicia preservando buffer e tips.
7. WHEN inicia THEN SHALL logar a causa do último reset (`esp_reset_reason`) e o heap livre.

**Independent Test**: com `INTERVALO_LEITURA_MIN=1` e `LEITURAS_POR_ENVIO=2`, a Serial mostra leituras a cada ~60 s e envio a cada 2 leituras; testes native de `schedule` cobrem grade fixa e alvos perdidos.

---

### P1: Contagem de chuva durante o sono ⭐ MVP

**User Story**: Como operador, quero que toda báscula do pluviômetro seja contada exatamente uma vez, dormindo ou acordada.

**Acceptance Criteria**:

1. WHEN o pino está em repouso THEN o sono SHALL ser armado com wake GPIO no nível de pulso (HIGH com `RAIN_ON_FALLING=false`).
2. WHEN a placa acorda por GPIO no nível de pulso THEN SHALL contar +1 se passou `RAIN_DEBOUNCE_MS` (padrão 150) desde a última contagem, e rearmar o wake no nível de repouso.
3. WHEN a placa acorda por GPIO no nível de repouso THEN SHALL apenas rearmar o wake no nível de pulso, **sem contar**.
4. WHEN o ímã para sobre o sensor (pino preso no nível de pulso) THEN SHALL contar no máximo 1 e **não** entrar em loop de despertares.
5. WHEN acordada (leitura, Wi-Fi, TLS) THEN uma IRQ de borda (handler em IRAM, contador `volatile` com `portMUX`) SHALL contar pela mesma regra de debounce; antes de dormir, a IRQ é removida e o wake é armado conforme o **nível atual** do pino.
6. WHEN a leitura é feita THEN SHALL devolver `rain_mm = round(tips × MM_PER_TIP, 3)` e `chuva_tips = tips`, zerando o contador de forma atômica.
7. Os tips pendentes SHALL ficar em `RTC_NOINIT_ATTR` com número mágico + checksum; WHEN reset por software/watchdog THEN SHALL ser incorporados à primeira leitura após o boot. Queda total de energia perde o contador (limitação aceita).
8. O wrap do contador de tempo SHALL ser tratado: debounce usa `esp_timer` de 64 bits (sem o travamento após estiagem longa).

**Independent Test**: testes native da máquina de estados (sequências de níveis/tempos → contagem esperada); `bench/b3s_chuva_sono`: N acionamentos com a placa em lightsleep → N contagens; ímã parado 60 s → 1 contagem e nº de despertares limitado.

---

### P1: Sensores (BME280/BMP280, pluviômetro, UV) ⭐ MVP

**Acceptance Criteria**:

1. O registro de sensores SHALL seguir a interface `Sensor { nome; bool ler(JsonObject&) }`; WHEN um sensor falha THEN a leitura SHALL conter `"<nome>_erro": "<mensagem>"` e os demais sensores SHALL ser lidos normalmente.
2. **BME280**: WHEN `chip_id` = 0x60 THEN SHALL publicar `temperature_c`, `pressure_hpa`, `humidity_pct`; WHEN 0x58 (BMP280) THEN SHALL **omitir** `humidity_pct`; WHEN outro valor THEN erro. Modo forçado, oversampling x1, `ctrl_hum` antes de `ctrl_meas`. Calibração em cache, invalidada em erro de I2C. Valores arredondados a 2 casas; umidade limitada a [0, 100].
3. **UV**: leitura por `analogReadMilliVolts()` com atenuação 6 dB; mediana de 15 grupos × média de 8 amostras; índice pelos limiares `(227, 318, 408, 503, 606, 696, 795, 881, 976, 1079, 1170)` mV; publica `uv_index` e `uv_voltage_v` (3 casas). WHEN mediana ≥ 1650 mV ou ADC saturado THEN SHALL falhar com "sinal solto" (campo ausente, `uv_guva_erro` presente).
4. A limitação do piso do ADC (~100–150 mV no escuro, em vez dos 12,6 mV do Pico) SHALL estar documentada no código e no README.
5. `config.h` SHALL marcar como **a reconferir no ESP32**: polaridade/pull da chuva, `MM_PER_TIP`, limiares do UV.

**Independent Test**: testes native de `bme280_math` contra valores de referência (erro < 0,01 °C / 0,01 hPa / 0,01 %RH), de `uv_math` (índice, mediana, guarda); bancada `b1`, `b2`, `b5`.

---

### P1: Buffer persistente em flash ⭐ MVP

**User Story**: Como operador, quero que nenhuma leitura se perca com a estação offline ou em queda de energia, e que nenhuma seja enviada duas vezes.

**Formato** (`/buffer.jsonl` no LittleFS, uma leitura por linha, valores sintéticos):

```json
{"timestamp":"2026-01-01T00:15:00.000Z","temperature_c":21.4,"pressure_hpa":1012.3,"humidity_pct":60.1,"rain_mm":0.2,"chuva_tips":1,"uv_index":0,"uv_voltage_v":0.12}
{"_boot":7,"_up_ms":900000,"temperature_c":21.0,"pressure_hpa":1012.1,"rain_mm":0.0,"chuva_tips":0,"uv_guva_erro":"sinal solto"}
```

**Acceptance Criteria**:

1. WHEN adiciona uma leitura e o arquivo não termina em `\n` (gravação truncada) THEN SHALL fechar a linha antes de acrescentar.
2. O nº de linhas SHALL ser mantido em RAM e recalculado do arquivo só na primeira vez ou após estado incerto.
3. `carregar_lote(n)` SHALL devolver `(leituras válidas, linhas_lidas)` contando também linhas corrompidas; a remoção após envio SHALL usar `linhas_lidas` (sem envio duplicado).
4. `remover_inicio(k)` SHALL reescrever via `.tmp` linha a linha (sem carregar o arquivo na RAM) + `rename`; WHEN o `rename` falha THEN remove + rename.
5. WHEN no boot existe `.tmp` e não existe o principal THEN SHALL renomear o `.tmp` para o principal.
6. WHEN o nº de linhas passa de `MAX_LEITURAS_BUFFER` (padrão 5000) THEN SHALL descartar as mais antigas em bloco até 90% do teto.
7. **Leituras sem hora**: WHEN não há hora válida THEN a linha SHALL levar `_boot` (contador de boots na RTC memory) e `_up_ms` em vez de `timestamp`. WHEN o NTP sincroniza THEN as linhas do boot atual SHALL ser reescritas com `timestamp = epoch_sync − (up_sync − _up_ms)`.
8. WHEN `time()` já é maior que a data do build no boot (reset por software preserva a hora) THEN o boot SHALL ser tratado como sincronizado.
9. WHEN há linhas sem hora de um boot anterior (impossíveis de datar) THEN SHALL descartá-las com log, **somando `rain_mm`/`chuva_tips` delas à primeira leitura datada seguinte**.
10. Linhas sem `timestamp` SHALL nunca ser enviadas à API.

**Independent Test**: testes native com FS em memória: truncamento, linha corrompida no meio do lote, teto, órfão, reescrita de leituras sem hora, descarte de boot antigo preservando a chuva.

---

### P1: Envio à API ⭐ MVP

**Acceptance Criteria**:

1. WHEN envia THEN SHALL fazer `POST API_URL` com `Content-Type: application/json`, `X-API-Key` e corpo `{"station_id": STATION_ID, "readings": [...]}` conforme o contrato do PROJECT.md (sem mudanças).
2. SHALL enviar em lotes de `TAMANHO_LOTE_ENVIO` (padrão 50); WHEN HTTP 2xx THEN remove `linhas_lidas` do buffer e segue para o próximo lote; WHEN qualquer outra resposta ou falha THEN para e mantém o restante.
3. WHEN um lote inteiro é corrompido (0 leituras válidas, >0 linhas) THEN SHALL descartar essas linhas e seguir.
4. TLS SHALL validar o servidor pelo bundle de CAs raiz do core; `API_TLS_INSECURE=true` (só bancada) desliga a validação com aviso no log.
5. SHALL sincronizar NTP a cada envio (e ao menos uma vez por dia).

**Independent Test**: `bench/b8_envio` → API responde 202 para 1 leitura sintética com TLS validado; testes native do fluxo de lotes com um cliente HTTP falso (2xx, 500, timeout, lote corrompido).

---

### P2: Roteiro de bancada

**Acceptance Criteria**:

1. SHALL existir os sketches `b0_placa`, `b1_i2c_scan`, `b2_bme280`, `b3_chuva`, `b3s_chuva_sono`, `b4_calibrar_chuva`, `b5_uv`, `b6_uv_campo`, `b7_wifi_eap`, `b8_envio`, `b9_consumo`, cada um como env do PlatformIO.
2. `b6_uv_campo` SHALL gravar CSV em flash com temperatura do BME280 (sem sensor interno no ESP32 clássico; coluna vazia + aviso se o BME faltar) e piscar o LED proporcional ao UV.
3. `firmware/README.md` SHALL documentar: instalação do PlatformIO, `secrets.h`, pinagem, cada sketch de bancada com o resultado esperado, consumo, e a recomendação de capacitor 470–1000 µF no 3V3/VIN contra brownout em picos de TX.

---

## Critério de pronto

1. `pio test -e native` verde; cobertura ≥ 80% em `lib/core`.
2. `pio run -e esp32` compila sem warnings novos.
3. Workflow de CI do firmware rodando os dois itens acima.
4. README com roteiro de bancada. A placa fica ligada na USB do PC de desenvolvimento, então a
   validação é **conjunta**: o Claude grava os sketches (`pio run -t upload`) e lê/interpreta a
   Serial; o usuário executa só a parte física (ímã no pluviômetro, UV ao sol, multímetro,
   alcance da rede do IFSC). Firmware marcado como **não validado em campo** até `b3s`, `b5`,
   `b7`, `b8` e `b9` passarem na placa real.
5. `.gitignore` cobre `firmware/include/secrets.h`; `PROJECT.md`, `ROADMAP.md` e `CLAUDE.md` atualizados com o firmware.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Método EAP do IFSC diferente do esperado | Configurável + `b7_wifi_eap` testa as combinações |
| Validação do CA EAP falhar por hora errada no boot | Data do build como piso de hora; CA opcional |
| Wake por nível perder transições muito curtas no sono | `b3s_chuva_sono` valida; pulso do KY-025 medido ≥ 353 ms entre bordas no Pico |
| Consumo da placa NodeMCU (regulador, USB-serial, LED) inviabilizar autonomia | `b9_consumo` mede; evolução para placa modificada e/ou deep sleep + ULP |
| Brownout em picos de TX com bateria fraca | Capacitor no 3V3/VIN; detector de brownout ligado |
| Offset do ADC no escuro distorcer `uv_voltage_v` | Documentado; índice não afetado |
