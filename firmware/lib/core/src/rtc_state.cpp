#include "rtc_state.h"

#include "core_attr.h"

namespace core {

static CORE_IRAM uint32_t calcularVerificacao(uint32_t tips, uint32_t horaOk) {
  return MAGICO_RTC ^ (tips * 2654435761u) ^ (horaOk ? 0x5A5A5A5Au : 0xA5A5A5A5u);
}

CORE_IRAM void selarRtc(EstadoRtc& e, uint32_t tips, bool horaOk) {
  e.magico = MAGICO_RTC;
  e.tips = tips;
  e.horaOk = horaOk ? 1u : 0u;
  e.verificacao = calcularVerificacao(e.tips, e.horaOk);
}

bool lerRtc(const EstadoRtc& e, uint32_t& tips, bool& horaOk) {
  if (e.magico != MAGICO_RTC || e.horaOk > 1u) return false;
  if (e.verificacao != calcularVerificacao(e.tips, e.horaOk)) return false;
  tips = e.tips;
  horaOk = e.horaOk == 1u;
  return true;
}

}  // namespace core
