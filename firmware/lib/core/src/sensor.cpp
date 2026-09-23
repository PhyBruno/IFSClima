#include "sensor.h"

#include "texto.h"

namespace core {

void lerTodos(Sensor* const* sensores, size_t n, JsonObject saida) {
  for (size_t i = 0; i < n; ++i) {
    std::string erro;
    if (!sensores[i]->ler(saida, erro)) {
      saida[std::string(sensores[i]->nome()) + "_erro"] = erro.empty() ? "falha sem descricao" : erro;
    }
  }
}

void escreverChuva(JsonObject saida, uint32_t tips, double mmPorTip) {
  saida["rain_mm"] = arredondar(tips * mmPorTip, 3);
  saida["chuva_tips"] = tips;
}

}  // namespace core
