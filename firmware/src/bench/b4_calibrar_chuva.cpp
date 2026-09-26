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
