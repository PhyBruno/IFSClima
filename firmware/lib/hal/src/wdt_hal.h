#pragma once
#include <stdint.h>

namespace hal {

// Task watchdog do loop. Pausado durante o lightsleep: o sono dura até 15 min
// e não pode ser confundido com travamento.
void wdtIniciar(uint32_t timeoutS);
void wdtAlimentar();  // no-op se o watchdog não foi iniciado (sketches de bancada)
void wdtPausar();
void wdtRetomar();

}  // namespace hal
