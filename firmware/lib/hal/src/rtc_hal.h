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
