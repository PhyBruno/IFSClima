#pragma once
#include <stdint.h>

namespace hal {

// Pluviômetro: acordada, conta por IRQ de borda (CHANGE); dormindo, a placa é
// armada para acordar no NÍVEL oposto ao último visto (core::ContadorChuva).
void chuvaIniciar(int pino, bool pullUp, bool pulsoEmAlto, uint32_t debounceMs, uint32_t tipsRestaurados);
uint32_t chuvaRetirar();  // devolve o acumulado e zera (atômico); zera também na RTC memory
void chuvaSomar(uint32_t tips);
uint32_t chuvaPendentes();
int chuvaNivel();

// Chamados por dormirAte() em volta de cada lightsleep.
void chuvaAntesDeDormir();
void chuvaDepoisDeAcordar();

}  // namespace hal
