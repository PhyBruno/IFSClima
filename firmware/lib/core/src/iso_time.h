#pragma once
#include <stddef.h>
#include <stdint.h>

namespace core {

constexpr size_t TAM_ISO = 32;  // "YYYY-MM-DDTHH:MM:SS.mmmZ" (24) + folga

// Dias desde 1970-01-01 para uma data do calendário gregoriano (UTC).
int64_t diasDesdeEpoch(int ano, unsigned mes, unsigned dia);

// Escreve epochMs como ISO 8601 UTC com milissegundos e sufixo Z — o formato
// que a API exige no campo "timestamp". 'saida' precisa de TAM_ISO bytes.
void formatarIso(int64_t epochMs, char* saida);

// Converte o __DATE__ do compilador ("Sep 23 2026") em epoch (s) da meia-noite
// UTC daquele dia. Usado como piso de hora no boot: a validação do
// certificado do RADIUS (EAP) falha com o relógio em 1970. Devolve -1 se inválido.
int64_t epochDaDataDeBuild(const char* data);

// Referência de hora: epoch (ms) medido no último sync + uptime (ms) no mesmo
// instante. O uptime vem do esp_timer (64 bits, compensado no lightsleep), então
// a hora de qualquer instante = epoch_ref + (uptime - uptime_ref).
struct RefHora {
  bool valida;
  int64_t epochMs;
  uint64_t upMs;
};

// Epoch (ms) correspondente ao uptime 'upMs' — que pode ser anterior à referência.
int64_t epochMsEm(const RefHora& ref, uint64_t upMs);

}  // namespace core
