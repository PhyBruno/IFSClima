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
