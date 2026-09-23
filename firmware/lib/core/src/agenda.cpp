#include "agenda.h"

namespace core {

uint64_t proximoAlvo(uint64_t alvoAtual, uint64_t intervaloMs, uint64_t agoraMs) {
  if (intervaloMs == 0) return agoraMs;
  uint64_t proximo = alvoAtual + intervaloMs;
  if (proximo <= agoraMs) {
    const uint64_t atraso = agoraMs - proximo;
    proximo += (atraso / intervaloMs + 1) * intervaloMs;
  }
  return proximo;
}

}  // namespace core
