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
