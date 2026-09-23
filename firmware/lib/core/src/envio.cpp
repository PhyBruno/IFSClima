#include "envio.h"

#include <ArduinoJson.h>

namespace core {

std::string montarPayload(const std::string& stationId, const std::vector<std::string>& leituras) {
  // stationId passa pelo ArduinoJson para sair com aspas e escapes corretos.
  // Serializa numa string própria: serializeJson(doc, std::string&) SOBRESCREVE
  // o conteúdo em vez de acrescentar.
  JsonDocument doc;
  doc.set(stationId);
  std::string idJson;
  serializeJson(doc, idJson);
  std::string corpo = "{\"station_id\":" + idJson + ",\"readings\":[";
  for (size_t i = 0; i < leituras.size(); ++i) {
    if (i) corpo += ',';
    corpo += leituras[i];
  }
  corpo += "]}";
  return corpo;
}

ResultadoEnvio enviarBuffer(Buffer& buf, size_t tamanhoLote, const std::string& stationId, const FuncaoPost& post) {
  ResultadoEnvio r;
  if (buf.contar() == 0) {
    r.ok = true;
    return r;
  }
  for (;;) {
    const Buffer::Lote lote = buf.carregarLote(tamanhoLote);
    if (lote.linhasLidas == 0) break;
    if (lote.leituras.empty()) {
      // Lote inteiro corrompido: sem isto essas linhas travariam o início do
      // buffer para sempre (nunca enviadas nem removidas).
      if (!buf.removerInicio(lote.linhasLidas)) return r;
      r.descartadas += lote.linhasLidas;
      continue;
    }
    if (!post(montarPayload(stationId, lote.leituras))) return r;
    // Remove 'linhasLidas', não leituras.size() — ver Buffer::carregarLote.
    if (!buf.removerInicio(lote.linhasLidas)) return r;
    r.enviadas += static_cast<uint32_t>(lote.leituras.size());
    r.descartadas += lote.linhasLidas - static_cast<uint32_t>(lote.leituras.size());
  }
  r.ok = true;
  return r;
}

}  // namespace core
