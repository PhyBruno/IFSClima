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
