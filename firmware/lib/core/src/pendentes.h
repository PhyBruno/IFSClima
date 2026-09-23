#pragma once
#include <stdint.h>

#include <string>

#include "fs_iface.h"
#include "iso_time.h"

namespace core {

// Leituras feitas sem hora válida NÃO recebem timestamp inventado (a API
// deduplica por (station_id, timestamp): um timestamp falso fixo colidiria
// leituras distintas para sempre). Elas vão para o buffer com "_boot" (contador
// de boots) e "_up_ms" (uptime) e são datadas aqui, no primeiro sync.

bool arquivoTemPendentes(ISistemaArquivos& fs, const std::string& caminho);

struct ResultadoPendentes {
  bool ok = false;
  uint32_t datadas = 0;
  uint32_t descartadas = 0;
  uint32_t tipsSobrando = 0;  // chuva de descartadas sem leitura datada depois
};

// Uma passada .tmp pelo buffer:
//  - pendente do boot atual -> timestamp = hora em _up_ms (pela referência);
//  - pendente de boot antigo (impossível de datar: o uptime daquele boot não
//    tem relação com a referência) -> descartada; seus chuva_tips somam na
//    PRÓXIMA leitura datada, para o total de chuva não se perder. Se não houver
//    próxima, voltam em tipsSobrando (o chamador devolve ao contador de chuva);
//  - linha corrompida -> preservada como está (o envio a descarta depois).
ResultadoPendentes resolverPendentes(ISistemaArquivos& fs, const std::string& caminho, uint32_t bootAtual,
                                     const RefHora& ref, double mmPorTip);

}  // namespace core
