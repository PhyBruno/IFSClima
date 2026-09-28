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

// Tetos do buffer em flash (o que vier primeiro). A remoção reescreve o buffer
// num .tmp, então o buffer e o .tmp precisam caber JUNTOS no LittleFS
// (1,875 MB com a partição no_ota.csv): o teto em bytes fica em ~40% dele.
// ~780 KB ≈ 4500 leituras de ~175 B ≈ 47 dias offline. 0 = sem limite.
constexpr uint32_t MAX_LEITURAS_BUFFER = 5000;
constexpr uint32_t MAX_BYTES_BUFFER = 780 * 1024;
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
//  - MM_PER_TIP calibrado em bancada (b4) com o funil real desta estacao:
//      600 mL / 30 basculas = 20 mL/bascula; boca de captacao 13 cm de diametro
//      (area = pi*(6,5)^2 = 132,73 cm2); 20/132,73*10 = 1,507 mm/bascula.
//      Formula: MM_PER_TIP = (volume_mL / n_basculas) / (pi*(diametro_cm/2)^2) * 10
//  - no KY-025 o D0 fica em 0 em repouso e vai a 1 com o ímã: pulso em ALTO,
//    evento na borda de SUBIDA (RAIN_ON_FALLING = false). Conferir com b3.
//  - menor intervalo entre bordas medido: 353 ms; 150 ms de debounce é folga.
constexpr double MM_PER_TIP = 1.507;
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
