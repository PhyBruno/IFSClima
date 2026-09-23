#include "rain_logic.h"

#include "core_attr.h"

namespace core {

ContadorChuva::ContadorChuva(bool pulsoEmAlto, uint32_t debounceMs)
    : pulsoEmAlto_(pulsoEmAlto),
      debounceMs_(debounceMs),
      ultimoAlto_(!pulsoEmAlto),
      jaContou_(false),
      ultimaContagemMs_(0),
      tips_(0) {}

void ContadorChuva::sincronizar(bool nivelAlto) { ultimoAlto_ = nivelAlto; }

CORE_IRAM bool ContadorChuva::observar(bool nivelAlto, uint64_t agoraMs) {
  const bool eraPulso = (ultimoAlto_ == pulsoEmAlto_);
  const bool ehPulso = (nivelAlto == pulsoEmAlto_);
  ultimoAlto_ = nivelAlto;
  if (eraPulso || !ehPulso) return false;  // só repouso -> pulso conta
  if (jaContou_ && agoraMs >= ultimaContagemMs_ && agoraMs - ultimaContagemMs_ < debounceMs_) {
    return false;  // repique mecânico da mesma báscula
  }
  jaContou_ = true;
  ultimaContagemMs_ = agoraMs;
  ++tips_;
  return true;
}

bool ContadorChuva::acordarEmAlto() const { return !ultimoAlto_; }

uint32_t ContadorChuva::retirar() {
  const uint32_t t = tips_;
  tips_ = 0;
  return t;
}

CORE_IRAM uint32_t ContadorChuva::pendentes() const { return tips_; }

void ContadorChuva::somar(uint32_t tips) { tips_ += tips; }

}  // namespace core
