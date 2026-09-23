#pragma once
#include <ArduinoJson.h>
#include <stddef.h>
#include <stdint.h>

#include <string>

namespace core {

// Contrato de sensor (o mesmo do firmware do Pico): cada sensor grava suas
// grandezas em 'saida'. Se o hardware não responde, NÃO invente valor:
// devolva false e descreva o problema em 'erro' — lerTodos() registra
// "<nome>_erro" e segue com os outros sensores.
class Sensor {
 public:
  virtual ~Sensor() = default;
  virtual const char* nome() const = 0;
  virtual bool ler(JsonObject saida, std::string& erro) = 0;
};

void lerTodos(Sensor* const* sensores, size_t n, JsonObject saida);

// Grava "rain_mm" (3 casas) e "chuva_tips".
void escreverChuva(JsonObject saida, uint32_t tips, double mmPorTip);

}  // namespace core
