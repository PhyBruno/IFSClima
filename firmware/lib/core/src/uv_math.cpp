#include "uv_math.h"

#include <algorithm>

#include "texto.h"

namespace core {

static const double LIMIARES_MV[] = {227, 318, 408, 503, 606, 696, 795, 881, 976, 1079, 1170};

int indiceUv(double mv) {
  for (int i = 0; i < 11; ++i) {
    if (mv < LIMIARES_MV[i]) return i;
  }
  return 11;
}

double mediana(double* valores, size_t n) {
  std::sort(valores, valores + n);
  return valores[n / 2];
}

AvaliacaoUv avaliarUv(double medianaMv, double limiteSoltoMv) {
  AvaliacaoUv a{};
  if (medianaMv >= limiteSoltoMv) {
    a.status = StatusUv::SINAL_SOLTO;
    return a;
  }
  a.status = StatusUv::OK;
  a.indice = indiceUv(medianaMv);
  a.tensaoV = arredondar(medianaMv / 1000.0, 3);
  return a;
}

}  // namespace core
