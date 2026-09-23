#include "texto.h"

#include <cmath>

namespace core {

std::string aparar(const std::string& s) {
  const char* const brancos = " \t\r\n";
  const size_t ini = s.find_first_not_of(brancos);
  if (ini == std::string::npos) return std::string();
  const size_t fim = s.find_last_not_of(brancos);
  return s.substr(ini, fim - ini + 1);
}

double arredondar(double v, int casas) {
  const double f = std::pow(10.0, casas);
  return std::round(v * f) / f;
}

}  // namespace core
