#include "iso_time.h"

#include <stdio.h>
#include <string.h>

namespace core {

// Algoritmos days_from_civil / civil_from_days de Howard Hinnant.
int64_t diasDesdeEpoch(int ano, unsigned mes, unsigned dia) {
  const int y = ano - (mes <= 2 ? 1 : 0);
  const int64_t era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(y - era * 400);
  const unsigned doy = (153 * (mes > 2 ? mes - 3 : mes + 9) + 2) / 5 + dia - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + static_cast<int64_t>(doe) - 719468;
}

static void civilDeDias(int64_t z, int& ano, unsigned& mes, unsigned& dia) {
  z += 719468;
  const int64_t era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = static_cast<unsigned>(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  dia = doy - (153 * mp + 2) / 5 + 1;
  mes = mp < 10 ? mp + 3 : mp - 9;
  ano = static_cast<int>(yoe) + static_cast<int>(era * 400) + (mes <= 2 ? 1 : 0);
}

void formatarIso(int64_t epochMs, char* saida) {
  if (epochMs < 0) epochMs = 0;
  const int64_t segs = epochMs / 1000;
  const int ms = static_cast<int>(epochMs % 1000);
  const int64_t resto = segs % 86400;
  int ano;
  unsigned mes, dia;
  civilDeDias(segs / 86400, ano, mes, dia);
  snprintf(saida, TAM_ISO, "%04d-%02u-%02uT%02d:%02d:%02d.%03dZ", ano, mes, dia,
           static_cast<int>(resto / 3600), static_cast<int>(resto % 3600 / 60),
           static_cast<int>(resto % 60), ms);
}

int64_t epochDaDataDeBuild(const char* data) {
  static const char MESES[] = "JanFebMarAprMayJunJulAugSepOctNovDec";
  if (data == nullptr || strlen(data) < 11) return -1;
  const char mes[4] = {data[0], data[1], data[2], '\0'};
  const char* p = strstr(MESES, mes);
  if (p == nullptr || (p - MESES) % 3 != 0) return -1;
  int dia = 0, ano = 0;
  if (sscanf(data + 3, "%d %d", &dia, &ano) != 2 || dia < 1 || dia > 31 || ano < 1970) return -1;
  return diasDesdeEpoch(ano, static_cast<unsigned>((p - MESES) / 3 + 1), static_cast<unsigned>(dia)) * 86400;
}

int64_t epochMsEm(const RefHora& ref, uint64_t upMs) {
  return ref.epochMs + (static_cast<int64_t>(upMs) - static_cast<int64_t>(ref.upMs));
}

}  // namespace core
