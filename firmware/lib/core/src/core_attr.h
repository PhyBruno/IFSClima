#pragma once
// CORE_IRAM: coloca a função na IRAM quando compilado para o ESP32 (código
// chamado de ISR). No PC (testes native) vira nada.
#if defined(ESP_PLATFORM)
#include "esp_attr.h"
#define CORE_IRAM IRAM_ATTR
#else
#define CORE_IRAM
#endif
