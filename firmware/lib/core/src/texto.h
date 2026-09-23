#pragma once
#include <string>

namespace core {

// Remove espaços, \r, \n e \t das pontas (equivalente ao str.strip() do Python).
std::string aparar(const std::string& s);

// Arredonda para 'casas' decimais (como o round() do firmware MicroPython).
double arredondar(double v, int casas);

}  // namespace core
