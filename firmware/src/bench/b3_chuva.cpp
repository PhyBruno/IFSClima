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
