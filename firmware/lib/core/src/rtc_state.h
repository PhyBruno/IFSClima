#pragma once
#include <stdint.h>

namespace core {

// Estado guardado em RTC_NOINIT_ATTR: sobrevive a reset por software, panic e
// watchdog (não a queda de energia). Guarda os tips ainda não gravados em
// flash e se a hora do sistema veio de um sync NTP de verdade (e não do piso
// da data do build). A verificação distingue estado válido de lixo de power-on.
struct EstadoRtc {
  uint32_t magico;
  uint32_t tips;
  uint32_t horaOk;  // 0 ou 1
  uint32_t verificacao;
};

constexpr uint32_t MAGICO_RTC = 0x43485556u;  // "CHUV"

void selarRtc(EstadoRtc& e, uint32_t tips, bool horaOk);
bool lerRtc(const EstadoRtc& e, uint32_t& tips, bool& horaOk);

}  // namespace core
