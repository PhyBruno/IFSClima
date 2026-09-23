#include "pendentes.h"

#include <ArduinoJson.h>

#include "leitor_linhas.h"
#include "texto.h"

namespace core {

bool arquivoTemPendentes(ISistemaArquivos& fs, const std::string& caminho) {
  auto f = fs.abrir(caminho.c_str(), 'r');
  if (!f) return false;
  LeitorLinhas lr(*f);
  std::string linha;
  bool completa;
  while (lr.proxima(linha, completa)) {
    if (linha.find("\"_boot\"") != std::string::npos) return true;
  }
  return false;
}

static void somarChuva(JsonDocument& doc, uint32_t tips, double mmPorTip) {
  const uint32_t total = (doc["chuva_tips"] | 0u) + tips;
  doc["chuva_tips"] = total;
  doc["rain_mm"] = arredondar(total * mmPorTip, 3);
}

ResultadoPendentes resolverPendentes(ISistemaArquivos& fs, const std::string& caminho, uint32_t bootAtual,
                                     const RefHora& ref, double mmPorTip) {
  ResultadoPendentes r;
  const std::string tmp = caminho + ".tmp";
  uint32_t carry = 0;
  {
    auto in = fs.abrir(caminho.c_str(), 'r');
    if (!in) {
      r.ok = true;  // sem buffer: nada a datar
      return r;
    }
    auto out = fs.abrir(tmp.c_str(), 'w');
    if (!out) {
      fs.remover(tmp.c_str());
      return r;
    }
    LeitorLinhas lr(*in);
    std::string linha;
    bool completa;
    while (lr.proxima(linha, completa)) {
      const std::string l = aparar(linha);
      if (l.empty()) continue;
      std::string saida;
      JsonDocument doc;
      if (deserializeJson(doc, l) || !doc.is<JsonObject>()) {
        saida = l;
      } else if (doc["_boot"].is<uint32_t>()) {
        if (doc["_boot"].as<uint32_t>() != bootAtual) {
          carry += doc["chuva_tips"] | 0u;
          ++r.descartadas;
          continue;
        }
        char iso[TAM_ISO];
        formatarIso(epochMsEm(ref, doc["_up_ms"] | static_cast<uint64_t>(0)), iso);
        doc.remove("_boot");
        doc.remove("_up_ms");
        doc["timestamp"] = iso;
        if (carry != 0) {
          somarChuva(doc, carry, mmPorTip);
          carry = 0;
        }
        serializeJson(doc, saida);
        ++r.datadas;
      } else if (carry != 0) {
        somarChuva(doc, carry, mmPorTip);
        carry = 0;
        serializeJson(doc, saida);
      } else {
        saida = l;
      }
      saida.push_back('\n');
      if (out->escrever(reinterpret_cast<const uint8_t*>(saida.data()), saida.size()) != saida.size()) {
        out.reset();
        // Flash cheia: o .tmp parcial não pode ficar ocupando o espaço livre.
        fs.remover(tmp.c_str());
        return r;
      }
    }
  }
  if (!fs.renomear(tmp.c_str(), caminho.c_str())) {
    fs.remover(caminho.c_str());
    if (!fs.renomear(tmp.c_str(), caminho.c_str())) return r;
  }
  r.tipsSobrando = carry;
  r.ok = true;
  return r;
}

}  // namespace core
