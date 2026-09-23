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
