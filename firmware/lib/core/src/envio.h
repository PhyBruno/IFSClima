#pragma once
#include <stddef.h>
#include <stdint.h>

#include <functional>
#include <string>
#include <vector>

#include "buffer.h"

namespace core {

// {"station_id": "...", "readings": [linha, linha, ...]} — as linhas do buffer
// já são JSON e entram como estão (sem reparse: economiza RAM).
std::string montarPayload(const std::string& stationId, const std::vector<std::string>& leituras);

// Faz o POST; devolve true SOMENTE com HTTP 2xx (a API usa 202).
using FuncaoPost = std::function<bool(const std::string& corpo)>;

struct ResultadoEnvio {
  bool ok = false;           // true = buffer esvaziado
  uint32_t enviadas = 0;
  uint32_t descartadas = 0;  // linhas corrompidas/sem hora removidas
};

// Envia o buffer em lotes. Só remove um lote após o 2xx. Qualquer falha para
// e mantém o restante para a próxima tentativa.
ResultadoEnvio enviarBuffer(Buffer& buf, size_t tamanhoLote, const std::string& stationId, const FuncaoPost& post);

}  // namespace core
