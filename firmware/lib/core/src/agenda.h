#pragma once
#include <stdint.h>

namespace core {

// Próximo alvo da grade fixa de leituras: alvoAtual + intervalo, pulando os
// alvos que já passaram (<= agora). Grade fixa não acumula o tempo gasto
// lendo/enviando (sem deriva ao longo do dia) e, se um envio demorar mais
// que o intervalo, evita disparar leituras em rajada com timestamps quase
// iguais — a chuva acumulada cai inteira na próxima leitura.
// (Chama-se "agenda" e não "schedule": o MinGW tem um <schedule.h> de sistema.)
uint64_t proximoAlvo(uint64_t alvoAtual, uint64_t intervaloMs, uint64_t agoraMs);

}  // namespace core
