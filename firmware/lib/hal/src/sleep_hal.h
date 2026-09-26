#pragma once
#include <stdint.h>

namespace hal {

enum class Despertar : uint8_t { TIMER, GPIO, OUTRO };

// Dorme até o uptime 'alvoUptimeMs'. Com economia=true usa lightsleep (RAM
// preservada) e acorda antes a cada transição do pluviômetro — conta e volta a
// dormir. Com economia=false espera acordada em fatias de 1 s (debug via USB).
void dormirAte(uint64_t alvoUptimeMs, bool economia);

uint32_t contadorDespertares();  // diagnóstico (b3s/b9)
Despertar ultimoDespertar();

}  // namespace hal
