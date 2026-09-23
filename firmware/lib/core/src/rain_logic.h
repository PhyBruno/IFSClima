#pragma once
#include <stdint.h>

namespace core {

// Contador de básculas do pluviômetro — máquina de estados do "wake por nível
// alternado". No ESP32, uma borda não acorda a placa do lightsleep; só um
// NÍVEL no pino. Então a placa dorme armada para acordar no nível OPOSTO ao
// último observado: em repouso, acorda no pulso (e conta); em pulso, acorda na
// volta ao repouso (e não conta). Um ímã parado sobre o sensor gera no máximo
// uma contagem e nenhum loop de despertares.
//
// Acordada, a IRQ de borda (CHANGE) chama observar() com o nível lido — mesma
// regra, mesmo debounce. observar() roda dentro da ISR: sem alocação.
class ContadorChuva {
 public:
  ContadorChuva(bool pulsoEmAlto, uint32_t debounceMs);

  // Registra o nível atual SEM contar (boot: o ímã pode já estar parado).
  void sincronizar(bool nivelAlto);

  // Registra o nível observado. Conta +1 só na transição repouso -> pulso,
  // se passou o debounce desde a última contagem. Devolve true se contou.
  bool observar(bool nivelAlto, uint64_t agoraMs);

  // Nível que deve acordar a placa: o oposto do último nível observado.
  bool acordarEmAlto() const;

  uint32_t retirar();  // devolve o acumulado e zera
  uint32_t pendentes() const;
  void somar(uint32_t tips);  // restaura tips (RTC memory / chuva de leituras descartadas)

 private:
  bool pulsoEmAlto_;
  uint32_t debounceMs_;
  bool ultimoAlto_;
  bool jaContou_;
  uint64_t ultimaContagemMs_;
  uint32_t tips_;
};

}  // namespace core
