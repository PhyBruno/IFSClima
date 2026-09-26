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
