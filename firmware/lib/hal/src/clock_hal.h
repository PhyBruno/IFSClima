#pragma once
#include <stdint.h>

namespace hal {

// Uptime em ms pelo esp_timer: 64 bits (não dá a volta em 49 dias como o
// millis()) e compensado durante o lightsleep.
uint64_t uptimeMs();

// Contador de boots persistente (NVS). Identifica de qual boot é uma leitura
// pendente (_boot): o uptime só tem relação com a hora dentro do mesmo boot.
uint32_t incrementarContadorBoot();

int64_t epochMsDoSistema();
int64_t epochSDoSistema();
void definirHoraSistema(int64_t epochS);

}  // namespace hal
